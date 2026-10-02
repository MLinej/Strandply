import { ROLES, type Role } from '../../domain/access';
import { UniqueViolationError, type ListQuery } from '../types';
import { USER_STATUSES, type NewUser, type User, type UserFilters, type UserPatch, type UserRepo } from '../users';
import { listRows } from './list';
import type { MemoryStore } from './store';

export class MemoryUserRepo implements UserRepo {
  constructor(private readonly store: MemoryStore) {}

  private get rows() {
    return this.store.tables.users;
  }

  private live(): User[] {
    return [...this.rows.values()].filter((u) => u.deletedAt === null);
  }

  private assertUsernameFree(username: string, exceptId?: string) {
    const lower = username.toLowerCase();
    if (this.live().some((u) => u.id !== exceptId && u.username.toLowerCase() === lower)) {
      throw new UniqueViolationError('users', 'username');
    }
  }

  async getById(id: string) {
    const u = this.rows.get(id);
    return u && u.deletedAt === null ? structuredClone(u) : null;
  }

  async getByIds(ids: string[]) {
    const want = new Set(ids);
    return structuredClone(this.live().filter((u) => want.has(u.id)));
  }

  async listActiveByRoles(roles: Role[]) {
    const rows = this.live().filter((u) => u.status === 'Active' && roles.includes(u.role));
    return structuredClone(rows.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })));
  }

  async getByUsername(username: string) {
    const lower = username.toLowerCase();
    const u = this.live().find((x) => x.username.toLowerCase() === lower);
    return u ? structuredClone(u) : null;
  }

  async list(query: ListQuery<UserFilters>) {
    return listRows(this.live(), query, {
      searchFields: ['username', 'name', 'email', 'phone', 'department'],
      sortable: ['username', 'name', 'role', 'status', 'createdAt'],
      defaultSort: 'name',
    });
  }

  async create(user: NewUser) {
    this.assertUsernameFree(user.username);
    if (this.rows.has(user.id)) throw new UniqueViolationError('users', 'id');
    const row: User = { ...structuredClone(user), deletedAt: null };
    this.rows.set(row.id, row);
    this.store.changed();
    return structuredClone(row);
  }

  async update(id: string, patch: UserPatch) {
    const current = this.rows.get(id);
    if (!current || current.deletedAt !== null) return null;
    if (patch.username !== undefined) this.assertUsernameFree(patch.username, id);
    const next: User = { ...current };
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (next as unknown as Record<string, unknown>)[k] = v;
    this.rows.set(id, next);
    this.store.changed();
    return structuredClone(next);
  }

  async softDelete(id: string, at: string) {
    const current = this.rows.get(id);
    if (!current || current.deletedAt !== null) return false;
    this.rows.set(id, { ...current, deletedAt: at, updatedAt: at });
    this.store.changed();
    return true;
  }

  async countByRoleAndStatus() {
    const live = this.live();
    return ROLES.flatMap((role) =>
      USER_STATUSES.map((status) => ({
        role,
        status,
        count: live.filter((u) => u.role === role && u.status === status).length,
      })),
    ).filter((r) => r.count > 0);
  }
}
