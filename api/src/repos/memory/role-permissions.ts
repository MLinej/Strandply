import { ROLES, type Role } from '../../domain/access';
import type { RolePermissionRepo, RolePermissionsRow } from '../role-permissions';
import type { MemoryStore } from './store';

export class MemoryRolePermissionRepo implements RolePermissionRepo {
  constructor(private readonly store: MemoryStore) {}

  private get rows() {
    return this.store.tables.rolePermissions;
  }

  async listAll() {
    return structuredClone(ROLES.map((r) => this.rows.get(r)).filter((r): r is RolePermissionsRow => !!r));
  }

  async get(role: Role) {
    const row = this.rows.get(role);
    return row ? structuredClone(row) : null;
  }

  async upsert(row: RolePermissionsRow) {
    const existing = this.rows.get(row.role);
    const next = structuredClone({ ...row, createdAt: existing?.createdAt ?? row.createdAt });
    this.rows.set(row.role, next);
    this.store.changed();
    return structuredClone(next);
  }
}
