import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DispatchFilters,
  DispatchInput,
  DispatchStatus,
  DispatchUpdate,
  DispatchView,
  LinkableRequest,
  ListQuery,
  ListResult,
  PartyPick,
  TrackingDetail,
} from '@contracts/sampletrack';
import { api, downloadFile } from '@/api/client';
import { stKeys } from './keys';

const BASE = '/sampletrack/dispatches';

export type DispatchQuery = ListQuery<DispatchFilters>;

/** Filters: mode, any of the 8 statuses, party, courier, linked request, date range, overdue. q = dsp no / tracking no / party. */
export function useDispatches(query: DispatchQuery) {
  return useQuery({
    queryKey: stKeys.dispatches.list(query),
    queryFn: ({ signal }) => api<ListResult<DispatchView>>(BASE, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useDispatch(id: string | undefined) {
  return useQuery({
    queryKey: stKeys.dispatches.detail(id ?? ''),
    queryFn: ({ signal }) => api<DispatchView>(`${BASE}/${id}`, { signal }),
    enabled: !!id,
  });
}

/** Party picker for the dispatch form (works for the dispatch role, which can't open Parties). */
export function useDispatchPartyOptions(q: string) {
  return useQuery({
    queryKey: stKeys.dispatches.partyOptions(q),
    queryFn: ({ signal }) => api<PartyPick[]>(`${BASE}/party-options`, { query: { q }, signal }),
    placeholderData: keepPreviousData,
  });
}

/** "Linked request" picker: requests not yet Delivered, optionally for one party. */
export function useLinkableRequests(partyId: string | undefined) {
  return useQuery({
    queryKey: stKeys.dispatches.requestOptions(partyId ?? ''),
    queryFn: ({ signal }) => api<LinkableRequest[]>(`${BASE}/request-options`, { query: { partyId }, signal }),
  });
}

/** Dispatch writes can move a linked request's status and add notifications, so refresh those too. */
function useInvalidateDispatches() {
  const qc = useQueryClient();
  return () => {
    for (const key of [stKeys.dispatches.all, stKeys.tracking.all, stKeys.requests.all, stKeys.notifications.all, stKeys.dashboard, stKeys.reports.all]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  };
}

/** Weight must be > 0. Courier: courierId from useCourierOptions(mode), or courierNameManual. */
export function useCreateDispatch() {
  const invalidate = useInvalidateDispatches();
  return useMutation({
    mutationFn: (input: DispatchInput) => api<DispatchView>(BASE, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

/** A changed `status` here is recorded exactly like useUpdateDispatchStatus (history, notifications, request sync). */
export function useUpdateDispatch() {
  const invalidate = useInvalidateDispatches();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DispatchUpdate }) =>
      api<DispatchView>(`${BASE}/${id}`, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}

/** Quick status update. A concurrent change fails with ApiError 'stale_status'. */
export function useUpdateDispatchStatus() {
  const invalidate = useInvalidateDispatches();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: DispatchStatus; note?: string | null }) =>
      api<DispatchView>(`${BASE}/${id}/status`, { method: 'POST', body: { status, note } }),
    onSuccess: invalidate,
  });
}

export function useDeleteDispatch() {
  const invalidate = useInvalidateDispatches();
  return useMutation({
    mutationFn: (id: string) => api<void>(`${BASE}/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function exportDispatches(query: Omit<DispatchQuery, 'page' | 'pageSize'> = {}) {
  return downloadFile(`${BASE}/export`, query);
}

/** Live tracking list (search by dispatch no. / party). */
export function useShipments(query: Pick<ListQuery, 'q' | 'page' | 'pageSize'>) {
  return useQuery({
    queryKey: stKeys.tracking.list(query),
    queryFn: ({ signal }) => api<ListResult<DispatchView>>('/sampletrack/tracking', { query, signal }),
    placeholderData: keepPreviousData,
  });
}

/** Timeline (6 steps with times), off-path Delayed/Returned events, full history and the tracking link. */
export function useTrackingDetail(id: string | undefined) {
  return useQuery({
    queryKey: stKeys.tracking.detail(id ?? ''),
    queryFn: ({ signal }) => api<TrackingDetail>(`/sampletrack/tracking/${id}`, { signal }),
    enabled: !!id,
  });
}
