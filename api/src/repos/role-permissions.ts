import type { PermissionSet, Role } from '../domain/access';

/** Table `st_role_permissions` (db/migrations/0004_access_control.sql), one row per role. */
export interface RolePermissionsRow {
  role: Role;
  permissions: PermissionSet;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface RolePermissionRepo {
  /** In ROLES order. */
  listAll(): Promise<RolePermissionsRow[]>;
  get(role: Role): Promise<RolePermissionsRow | null>;
  /** Insert or replace. A replace keeps the original createdAt. */
  upsert(row: RolePermissionsRow): Promise<RolePermissionsRow>;
}
