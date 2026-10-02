import {
  ACTION_KEYS,
  clonePermissionSet,
  DEFAULT_ROLE_PERMISSIONS,
  FULL_PERMISSIONS,
  LOCKED_ROLES,
  normalizePermissionSet,
  PAGE_KEYS,
  ROLE_LABELS,
  ROLES,
  WIDGET_KEYS,
  type PermissionSet,
  type Role,
} from '../../domain/access';
import { forbidden } from '../../lib/errors';
import { isoNow, type Clock } from '../../lib/clock';
import type { DataLayer, RolePermissionsRow } from '../../repos';
import { defaultRolePermissionRows } from '../../seed/role-permissions';
import type { ActivityService } from './activity-service';
import type { Actor } from './actor';

export interface RolePermissionsView {
  role: Role;
  label: string;
  locked: boolean;
  permissions: PermissionSet;
  updatedAt: string | null;
  updatedBy: string | null;
}

/**
 * Resolves the effective permissions for a role, cached for `cacheMs`.
 * Writes in this process clear the cache straight away, so a change applies on the
 * next request. Other instances pick it up within `cacheMs`.
 */
export class PermissionService {
  private cache: { loadedAt: number; byRole: Map<Role, RolePermissionsRow> } | null = null;

  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
    private readonly cacheMs: number,
  ) {}

  invalidate(): void {
    this.cache = null;
  }

  private async rows(): Promise<Map<Role, RolePermissionsRow>> {
    const now = this.clock().getTime();
    if (!this.cache || now - this.cache.loadedAt >= this.cacheMs) {
      const all = await this.data.repos.rolePermissions.listAll();
      this.cache = { loadedAt: now, byRole: new Map(all.map((r) => [r.role, r])) };
    }
    return this.cache.byRole;
  }

  async effective(role: Role): Promise<PermissionSet> {
    if (LOCKED_ROLES.includes(role)) return clonePermissionSet(FULL_PERMISSIONS);
    const row = (await this.rows()).get(role);
    return clonePermissionSet(row ? row.permissions : DEFAULT_ROLE_PERMISSIONS[role]);
  }

  async listAll(): Promise<RolePermissionsView[]> {
    const rows = await this.rows();
    return Promise.all(
      ROLES.map(async (role) => {
        const row = rows.get(role);
        return {
          role,
          label: ROLE_LABELS[role],
          locked: LOCKED_ROLES.includes(role),
          permissions: await this.effective(role),
          updatedAt: row?.updatedAt ?? null,
          updatedBy: row?.updatedBy ?? null,
        };
      }),
    );
  }

  /** Superadmin only. The superadmin row can't be changed. */
  async update(actor: Actor, role: Role, requested: PermissionSet): Promise<RolePermissionsView> {
    this.assertSuperadmin(actor);
    if (LOCKED_ROLES.includes(role)) throw forbidden('role_locked', `${ROLE_LABELS[role]} permissions are locked`);
    const next = normalizePermissionSet(requested);
    const before = await this.effective(role);
    const at = isoNow(this.clock);

    await this.data.uow.run(async (tx) => {
      const existing = await tx.rolePermissions.get(role);
      await tx.rolePermissions.upsert({
        role,
        permissions: next,
        locked: false,
        createdAt: existing?.createdAt ?? at,
        updatedAt: at,
        updatedBy: actor.id,
      });
      await this.activity.record(tx, actor, {
        action: 'PermissionChange',
        entityType: 'role_permissions',
        entityId: role,
        details: `Updated ${ROLE_LABELS[role]} permissions: ${describeDiff(before, next)}`,
      });
    });
    this.invalidate();
    return (await this.listAll()).find((v) => v.role === role)!;
  }

  /** Superadmin only. Puts every role back to the defaults from the legacy ROLE_PERMS. */
  async resetToDefaults(actor: Actor): Promise<RolePermissionsView[]> {
    this.assertSuperadmin(actor);
    const at = isoNow(this.clock);
    await this.data.uow.run(async (tx) => {
      for (const row of defaultRolePermissionRows(at, actor.id)) {
        const existing = await tx.rolePermissions.get(row.role);
        await tx.rolePermissions.upsert({ ...row, createdAt: existing?.createdAt ?? at });
      }
      await this.activity.record(tx, actor, {
        action: 'PermissionChange',
        entityType: 'role_permissions',
        details: 'Reset all role permissions to defaults',
      });
    });
    this.invalidate();
    return this.listAll();
  }

  private assertSuperadmin(actor: Actor) {
    if (actor.role !== 'superadmin') {
      throw forbidden('superadmin_only', 'Only a Super Admin can change role permissions');
    }
  }
}

function describeDiff(before: PermissionSet, after: PermissionSet): string {
  const parts: string[] = [];
  const section = <K extends string>(name: string, keys: readonly K[], a: K[], b: K[]) => {
    const added = keys.filter((k) => !a.includes(k) && b.includes(k));
    const removed = keys.filter((k) => a.includes(k) && !b.includes(k));
    if (added.length) parts.push(`+${name}: ${added.join(', ')}`);
    if (removed.length) parts.push(`-${name}: ${removed.join(', ')}`);
  };
  section('pages', PAGE_KEYS, before.pages, after.pages);
  section('actions', ACTION_KEYS, before.actions, after.actions);
  section('widgets', WIDGET_KEYS, before.widgets, after.widgets);
  return parts.length ? parts.join('; ') : 'no change';
}
