import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Badges, CompanySettings, ListQuery, ListResult, NotificationFeedFilters, NotificationView } from '@contracts/sampletrack';
import { api } from '@/api/client';
import { stKeys } from './keys';

/** How often the sidebar badges refresh (also on window focus). Polling works the same on Node and Workers. */
export const BADGE_POLL_MS = 30_000;

/**
 * Sidebar badges: unread notifications and pending requests. Each is present only if the user can
 * open that page. Polls every 30 s while the tab is visible.
 */
export function useBadges() {
  return useQuery({
    queryKey: stKeys.badges,
    queryFn: ({ signal }) => api<Badges>('/sampletrack/badges', { signal }),
    refetchInterval: BADGE_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

/** The user's notifications, newest first. filters: { unread: true } and/or { type }. */
export function useNotifications(query: ListQuery<NotificationFeedFilters> = {}) {
  return useQuery({
    queryKey: stKeys.notifications.feed(query),
    queryFn: ({ signal }) => api<ListResult<NotificationView>>('/sampletrack/notifications', { query, signal }),
    placeholderData: keepPreviousData,
    refetchInterval: BADGE_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

function useInvalidateNotifications() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: stKeys.notifications.all });
}

export function useMarkNotificationsRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (ids: string[]) => api<{ updated: number }>('/sampletrack/notifications/read', { method: 'POST', body: { ids } }),
    onSuccess: invalidate,
  });
}

/** Pass the newest createdAt on screen as `upTo`, so a notification arriving meanwhile stays unread. */
export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (upTo?: string) => api<{ updated: number }>('/sampletrack/notifications/read-all', { method: 'POST', body: { upTo } }),
    onSuccess: invalidate,
  });
}

/** "Clear": hides for this user only. With ids, just those; otherwise everything up to `upTo`. */
export function useClearNotifications() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: (opts: { ids?: string[]; upTo?: string } = {}) =>
      api<{ cleared: number }>('/sampletrack/notifications/clear', { method: 'POST', body: opts }),
    onSuccess: invalidate,
  });
}

/** Company details used on prints and WhatsApp messages (Settings page). */
export function useCompanySettings() {
  return useQuery({
    queryKey: stKeys.company,
    queryFn: ({ signal }) => api<CompanySettings>('/sampletrack/settings/company', { signal }),
  });
}

/** Send only the fields being changed; '' or null clears one (name can't be cleared). */
export function useUpdateCompanySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CompanySettings>) => api<CompanySettings>('/sampletrack/settings/company', { method: 'PUT', body: input }),
    onSuccess: (data) => qc.setQueryData(stKeys.company, data),
  });
}
