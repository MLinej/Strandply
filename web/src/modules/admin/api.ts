import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActivityEntryView,
  ActivityFeedFilters,
  PublicUser,
  RoleKey,
  RolePermissionsView,
  UserFilters,
  UserInput,
  UserStats,
} from '@contracts/admin';
import type { PermissionSetView } from '@contracts/session';
import type { ListQuery, ListResult } from '@contracts/common';
import { api } from '@/api/client';
import { ME_KEY } from '@/app/session';

const ST = '/sampletrack';

export const adminKeys = {
  users: ['admin', 'users'] as const,
  userList: (q: object) => ['admin', 'users', 'list', q] as const,
  userStats: ['admin', 'users', 'stats'] as const,
  roles: ['admin', 'roles'] as const,
  activity: ['admin', 'activity'] as const,
  activityList: (q: object) => ['admin', 'activity', 'list', q] as const,
};

export function useUsers(query: ListQuery<UserFilters>) {
  return useQuery({
    queryKey: adminKeys.userList(query),
    queryFn: ({ signal }) => api<ListResult<PublicUser>>(`${ST}/users`, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useUserStats() {
  return useQuery({ queryKey: adminKeys.userStats, queryFn: ({ signal }) => api<UserStats>(`${ST}/users/stats`, { signal }) });
}

function useInvalidate(...keys: (readonly unknown[])[]) {
  const qc = useQueryClient();
  return () => {
    for (const k of keys) void qc.invalidateQueries({ queryKey: k });
  };
}

/** Username taken → ApiError 'username_taken'. Only a superadmin can create or assign Super Admin. */
export function useSaveUser() {
  const invalidate = useInvalidate(adminKeys.users, adminKeys.activity);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: UserInput }) =>
      id ? api<PublicUser>(`${ST}/users/${id}`, { method: 'PATCH', body: input }) : api<PublicUser>(`${ST}/users`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

/** Can't deactivate yourself or the last active Super Admin (ApiError 'cannot_deactivate_self' / 'last_superadmin'). */
export function useToggleUserStatus() {
  const invalidate = useInvalidate(adminKeys.users, adminKeys.activity);
  return useMutation({ mutationFn: (id: string) => api<PublicUser>(`${ST}/users/${id}/toggle-status`, { method: 'POST' }), onSuccess: invalidate });
}

export function useDeleteUser() {
  const invalidate = useInvalidate(adminKeys.users, adminKeys.activity);
  return useMutation({ mutationFn: (id: string) => api<void>(`${ST}/users/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export function useRolePermissions() {
  return useQuery({
    queryKey: adminKeys.roles,
    queryFn: ({ signal }) => api<{ rows: RolePermissionsView[] }>(`${ST}/role-permissions`, { signal }).then((r) => r.rows),
  });
}

/** Superadmin only. The change applies on the next request, so the signed-in user's own menu is refreshed too. */
export function useSaveRolePermissions() {
  const invalidate = useInvalidate(adminKeys.roles, adminKeys.activity, ME_KEY);
  return useMutation({
    mutationFn: ({ role, permissions }: { role: RoleKey; permissions: PermissionSetView }) =>
      api<RolePermissionsView>(`${ST}/role-permissions/${role}`, { method: 'PUT', body: permissions }),
    onSuccess: invalidate,
  });
}

export function useResetRolePermissions() {
  const invalidate = useInvalidate(adminKeys.roles, adminKeys.activity, ME_KEY);
  return useMutation({ mutationFn: () => api<{ rows: RolePermissionsView[] }>(`${ST}/role-permissions/reset`, { method: 'POST' }), onSuccess: invalidate });
}

export function useActivity(query: ListQuery<ActivityFeedFilters>) {
  return useQuery({
    queryKey: adminKeys.activityList(query),
    queryFn: ({ signal }) => api<ListResult<ActivityEntryView>>(`${ST}/activity`, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

/** Superadmin only; deletes entries older than N days and logs the purge itself. */
export function usePurgeActivity() {
  const invalidate = useInvalidate(adminKeys.activity);
  return useMutation({
    mutationFn: (olderThanDays: number) => api<{ purged: number; cutoff: string }>(`${ST}/activity/purge`, { method: 'POST', body: { olderThanDays } }),
    onSuccess: invalidate,
  });
}
