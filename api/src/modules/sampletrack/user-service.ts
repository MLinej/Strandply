import { ROLE_LABELS, ROLES, type Role } from '../../domain/access';
import { hashPassword, type Argon2Params } from '../../auth/password';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import {
  UniqueViolationError,
  USER_STATUSES,
  type DataLayer,
  type ListQuery,
  type Repos,
  type User,
  type UserFilters,
  type UserPatch,
  type UserStatus,
} from '../../repos';
import type { ActivityService } from './activity-service';
import type { Actor } from './actor';

/** User as the API returns it. The password hash is never included. */
export interface PublicUser {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  role: Role;
  roleLabel: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export const toPublicUser = (u: User): PublicUser => ({
  id: u.id,
  username: u.username,
  name: u.name,
  email: u.email,
  phone: u.phone,
  department: u.department,
  role: u.role,
  roleLabel: ROLE_LABELS[u.role],
  status: u.status,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

export interface CreateUserInput {
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  role: Role;
  status: UserStatus;
  password: string;
}

/** Fields left out stay as they are. A null or empty password keeps the current one. */
export type UpdateUserInput = Partial<Omit<CreateUserInput, 'password'>> & { password?: string | null };

export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  byRole: Record<Role, number>;
}

const PROFILE_FIELDS = ['username', 'name', 'email', 'phone', 'department', 'role', 'status'] as const;

export class UserService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
    private readonly argon2: Argon2Params,
  ) {}

  async get(id: string): Promise<PublicUser> {
    const u = await this.data.repos.users.getById(id);
    if (!u) throw notFound('User');
    return toPublicUser(u);
  }

  async list(query: ListQuery<UserFilters>) {
    const { rows, total } = await this.data.repos.users.list(query);
    return { rows: rows.map(toPublicUser), total };
  }

  async stats(): Promise<UserStats> {
    const counts = await this.data.repos.users.countByRoleAndStatus();
    const byRole = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
    let active = 0;
    let inactive = 0;
    for (const c of counts) {
      byRole[c.role] += c.count;
      if (c.status === 'Active') active += c.count;
      else inactive += c.count;
    }
    return { total: active + inactive, active, inactive, byRole };
  }

  async create(actor: Actor, input: CreateUserInput): Promise<PublicUser> {
    this.assertMayAssignRole(actor, input.role);
    const passwordHash = await hashPassword(input.password, this.argon2);
    const at = isoNow(this.clock);
    return this.withUniqueUsername(() =>
      this.data.uow.run(async (tx) => {
        const user = await tx.users.create({
          id: newId(),
          username: input.username,
          name: input.name,
          email: input.email,
          phone: input.phone,
          department: input.department,
          role: input.role,
          status: input.status,
          passwordHash,
          createdBy: actor.id,
          createdAt: at,
          updatedAt: at,
        });
        await this.activity.record(tx, actor, {
          action: 'Create',
          entityType: 'user',
          entityId: user.id,
          details: `Created user ${user.username} (${ROLE_LABELS[user.role]}, ${user.status})`,
        });
        return toPublicUser(user);
      }),
    );
  }

  async update(actor: Actor, id: string, input: UpdateUserInput): Promise<PublicUser> {
    const password = input.password ? input.password : null;
    const passwordHash = password ? await hashPassword(password, this.argon2) : undefined;

    return this.withUniqueUsername(() =>
      this.data.uow.run(async (tx) => {
        const target = await tx.users.getById(id);
        if (!target) throw notFound('User');
        this.assertMayManage(actor, target);
        if (input.role !== undefined) this.assertMayAssignRole(actor, input.role);

        const nextRole = input.role ?? target.role;
        const nextStatus = input.status ?? target.status;
        if (target.id === actor.id && nextStatus !== 'Active') {
          throw conflict('cannot_deactivate_self', 'You cannot deactivate your own account');
        }
        await this.assertSuperadminRemains(tx, target, { role: nextRole, status: nextStatus });

        const patch: UserPatch = { updatedAt: isoNow(this.clock) };
        const changed: string[] = [];
        for (const f of PROFILE_FIELDS) {
          const v = input[f];
          if (v !== undefined && v !== target[f]) {
            (patch as Record<string, unknown>)[f] = v;
            changed.push(f);
          }
        }
        if (passwordHash) {
          patch.passwordHash = passwordHash;
          changed.push('password');
        }
        if (!changed.length) return toPublicUser(target);

        const updated = (await tx.users.update(id, patch))!;
        if (patch.status === 'Inactive' || patch.passwordHash) await tx.sessions.deleteByUser(id);
        await this.activity.record(tx, actor, {
          action: 'Edit',
          entityType: 'user',
          entityId: id,
          details: `Updated user ${updated.username}: ${changed.join(', ')}`,
        });
        return toPublicUser(updated);
      }),
    );
  }

  async toggleStatus(actor: Actor, id: string): Promise<PublicUser> {
    const target = await this.data.repos.users.getById(id);
    if (!target) throw notFound('User');
    const next: UserStatus = target.status === 'Active' ? 'Inactive' : 'Active';
    return this.update(actor, id, { status: next });
  }

  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const target = await tx.users.getById(id);
      if (!target) throw notFound('User');
      if (target.id === actor.id) throw conflict('cannot_delete_self', 'You cannot delete your own account');
      this.assertMayManage(actor, target);
      await this.assertSuperadminRemains(tx, target, null);

      const at = isoNow(this.clock);
      await tx.users.softDelete(id, at);
      await tx.sessions.deleteByUser(id);
      await this.activity.record(tx, actor, {
        action: 'Delete',
        entityType: 'user',
        entityId: id,
        details: `Deleted user ${target.username} (${ROLE_LABELS[target.role]})`,
      });
    });
  }

  /** Only a superadmin may touch a superadmin account. */
  private assertMayManage(actor: Actor, target: User) {
    if (target.role === 'superadmin' && actor.role !== 'superadmin') {
      throw forbidden('superadmin_only', 'Only a Super Admin can manage a Super Admin account');
    }
  }

  /** Only a superadmin may give out the superadmin role. */
  private assertMayAssignRole(actor: Actor, role: Role) {
    if (role === 'superadmin' && actor.role !== 'superadmin') {
      throw forbidden('superadmin_only', 'Only a Super Admin can assign the Super Admin role');
    }
  }

  /**
   * After the change there must still be at least one live, active superadmin.
   * `next` is the target's new role/status, or null if it is being deleted.
   * TODO(d1): D1 can't do check-then-write in one batch; use a guarded write
   * (UPDATE … WHERE (SELECT COUNT(*) …) > 1) and check the changed-row count.
   */
  private async assertSuperadminRemains(tx: Repos, target: User, next: { role: Role; status: UserStatus } | null) {
    const wasActiveSuper = target.role === 'superadmin' && target.status === 'Active';
    const staysActiveSuper = next !== null && next.role === 'superadmin' && next.status === 'Active';
    if (!wasActiveSuper || staysActiveSuper) return;
    const counts = await tx.users.countByRoleAndStatus();
    const activeSupers = counts.find((c) => c.role === 'superadmin' && c.status === 'Active')?.count ?? 0;
    if (activeSupers <= 1) {
      throw conflict('last_superadmin', 'At least one active Super Admin must remain');
    }
  }

  private async withUniqueUsername<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof UniqueViolationError && err.field === 'username') {
        throw conflict('username_taken', 'That username is already taken');
      }
      throw err;
    }
  }
}

export { USER_STATUSES };
