import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DispatchDraft,
  ListQuery,
  Product,
  RequestFilters,
  RequestInput,
  RequestLineInput,
  RequestListResult,
  RequestUpdate,
  RequestView,
} from '@contracts/sampletrack';
import { api, downloadFile } from '@/api/client';
import { stKeys } from './keys';

const BASE = '/sampletrack/requests';

export type RequestQuery = ListQuery<RequestFilters>;

/** Tabs All/Pending/Approved/Dispatched/Delivered: pass filters.status for the tab. The result includes `counts` for every tab. */
export function useRequests(query: RequestQuery) {
  return useQuery({
    queryKey: stKeys.requests.list(query),
    queryFn: ({ signal }) => api<RequestListResult>(BASE, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useRequest(id: string | undefined) {
  return useQuery({
    queryKey: stKeys.requests.detail(id ?? ''),
    queryFn: ({ signal }) => api<RequestView>(`${BASE}/${id}`, { signal }),
    enabled: !!id,
  });
}

/** Sidebar badge. Refreshes every minute, and after any request change. */
export function usePendingRequestCount(enabled = true) {
  return useQuery({
    queryKey: stKeys.requests.pendingCount,
    queryFn: ({ signal }) => api<{ count: number }>(`${BASE}/pending-count`, { signal }),
    select: (d) => d.count,
    refetchInterval: 60_000,
    enabled,
  });
}

function useInvalidateRequests() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: stKeys.requests.all });
    void qc.invalidateQueries({ queryKey: stKeys.notifications.all });
    void qc.invalidateQueries({ queryKey: stKeys.dashboard });
    void qc.invalidateQueries({ queryKey: stKeys.reports.all });
  };
}

/** Always created as Pending. The REQ number is assigned by the server. */
export function useCreateRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: (input: RequestInput) => api<RequestView>(BASE, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

/**
 * Edit fields and/or replace all lines (send `items`). Status never changes here.
 * Changing the party of a request that already has a dispatch fails with ApiError 'party_locked'.
 */
export function useUpdateRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RequestUpdate }) =>
      api<RequestView>(`${BASE}/${id}`, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}

/** Needs the `approve` permission. Only Pending requests can be approved (otherwise ApiError 'invalid_status'). */
export function useApproveRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: (id: string) => api<RequestView>(`${BASE}/${id}/approve`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

/** Fails with ApiError 'has_dispatch' while a dispatch is linked. */
export function useDeleteRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: (id: string) => api<void>(`${BASE}/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

/** "Create dispatch from request": fetch the prefill, then open the dispatch form with it. */
export function fetchDispatchDraft(requestId: string) {
  return api<DispatchDraft>(`${BASE}/${requestId}/dispatch-draft`);
}

export function exportRequests(query: Omit<RequestQuery, 'page' | 'pageSize'> = {}) {
  return downloadFile(`${BASE}/export`, query);
}

/**
 * What the form shows when a master product is picked on a line: name, board, thickness
 * and size from the product (the server does the same for any field left blank). Qty stays as typed.
 */
export function lineFromProduct(product: Product, current: RequestLineInput = {}): RequestLineInput {
  return {
    ...current,
    productId: product.id,
    productName: product.name,
    board: product.boardType,
    thickness: product.thicknessMm !== null ? `${product.thicknessMm}mm` : null,
    size: product.size,
  };
}
