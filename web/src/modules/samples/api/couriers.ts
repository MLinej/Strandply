import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Courier,
  CourierFilters,
  CourierInput,
  CourierOption,
  DispatchMode,
  ListQuery,
  ListResult,
} from '@contracts/sampletrack';
import { api } from '@/api/client';
import { stKeys } from './keys';

const BASE = '/sampletrack/couriers';

export type CourierQuery = ListQuery<CourierFilters>;

export function useCouriers(query: CourierQuery, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    enabled,
    queryKey: stKeys.couriers.list(query),
    queryFn: ({ signal }) => api<ListResult<Courier>>(BASE, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useCourier(id: string | undefined) {
  return useQuery({
    queryKey: stKeys.couriers.detail(id ?? ''),
    queryFn: ({ signal }) => api<Courier>(`${BASE}/${id}`, { signal }),
    enabled: !!id,
  });
}

/** Dispatch form dropdown: active couriers matching the mode. Hand Delivery lists all active couriers. */
export function useCourierOptions(mode: DispatchMode | undefined) {
  return useQuery({
    queryKey: stKeys.couriers.options(mode ?? ''),
    queryFn: ({ signal }) => api<CourierOption[]>(`${BASE}/options`, { query: { mode }, signal }),
    enabled: !!mode,
  });
}

/** Builds the tracking link from a courier's template, or null if it has none. */
export function trackingUrl(template: string | null | undefined, trackingNo: string | null | undefined): string | null {
  if (!template || !trackingNo) return null;
  return template.includes('{tracking}')
    ? template.split('{tracking}').join(encodeURIComponent(trackingNo))
    : template;
}

function useInvalidateCouriers() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: stKeys.couriers.all });
}

export function useCreateCourier() {
  const invalidate = useInvalidateCouriers();
  return useMutation({
    mutationFn: (input: CourierInput) => api<Courier>(BASE, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateCourier() {
  const invalidate = useInvalidateCouriers();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CourierInput> }) =>
      api<Courier>(`${BASE}/${id}`, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}

/** Fails with ApiError 'in_use' (see inUseOf) while a dispatch uses the courier. */
export function useDeleteCourier() {
  const invalidate = useInvalidateCouriers();
  return useMutation({
    mutationFn: (id: string) => api<void>(`${BASE}/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
