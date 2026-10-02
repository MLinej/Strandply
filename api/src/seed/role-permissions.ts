import { clonePermissionSet, DEFAULT_ROLE_PERMISSIONS, LOCKED_ROLES, ROLES } from '../domain/access';
import type { RolePermissionsRow } from '../repos';

/** The default matrix. Mirrors the st_role_permissions seed in db/migrations/0004_access_control.sql. */
export function defaultRolePermissionRows(at: string, updatedBy: string | null = null): RolePermissionsRow[] {
  return ROLES.map((role) => ({
    role,
    permissions: clonePermissionSet(DEFAULT_ROLE_PERMISSIONS[role]),
    locked: LOCKED_ROLES.includes(role),
    createdAt: at,
    updatedAt: at,
    updatedBy,
  }));
}
