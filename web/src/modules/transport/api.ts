import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivityEntryView } from '@contracts/admin';
import type { ListQuery, ListResult } from '@contracts/common';
import type {
  FreightOrderView,
  InquiryView,
  PastQuote,
  RateComparisonView,
  Transporter,
  TransporterImportResult,
  TransportDashboard,
  TransportMeta,
  TransportReports,
  VehicleType,
} from '@contracts/transport';
import type { CompanyBlock } from '@contracts/sampletrack';
import { api, downloadFile } from '@/api/client';
import { stKeys } from '../samples/api/keys';

const TR = '/transport';

export const trKeys = {
  all: ['tr'] as const,
  meta: ['tr', 'meta'] as const,
  list: (kind: string, q: object) => ['tr', kind, 'list', q] as const,
  one: (kind: string, id: string) => ['tr', kind, 'one', id] as const,
  other: (what: string, q: object = {}) => ['tr', what, q] as const,
};

/** The flow is linked (an approval moves the inquiry, an order closes it): writes refresh the module and the sidebar badges. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: trKeys.all });
    void qc.invalidateQueries({ queryKey: stKeys.badges });
  };
}
type Input = Record<string, unknown>;

export function useTransportMeta() {
  return useQuery({ queryKey: trKeys.meta, queryFn: ({ signal }) => api<TransportMeta>(`${TR}/meta`, { signal }), staleTime: 30_000 });
}

// ── Masters ──────────────────────────────────────────────────────────

export function useVehicles() {
  return useQuery({ queryKey: trKeys.other('vehicles'), queryFn: ({ signal }) => api<VehicleType[]>(`${TR}/vehicles`, { signal }) });
}
export function useSaveVehicle() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string | null; input: Input }) => (id ? api<VehicleType>(`${TR}/vehicles/${id}`, { method: 'PATCH', body: input }) : api<VehicleType>(`${TR}/vehicles`, { method: 'POST', body: input })),
    onSuccess: invalidate,
  });
}
export function useDeleteVehicle() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${TR}/vehicles/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export function useTransporters(query: ListQuery<object>) {
  return useQuery({ queryKey: trKeys.list('transporters', query), queryFn: ({ signal }) => api<ListResult<Transporter>>(`${TR}/transporters`, { query, signal }), placeholderData: keepPreviousData });
}
export function useSaveTransporter() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string | null; input: Input }) => (id ? api<Transporter>(`${TR}/transporters/${id}`, { method: 'PATCH', body: input }) : api<Transporter>(`${TR}/transporters`, { method: 'POST', body: input })),
    onSuccess: invalidate,
  });
}
export function useDeleteTransporter() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${TR}/transporters/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}
export function useImportTransporters() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ file, commit }: { file: File; commit: boolean }) => {
      const form = new FormData();
      form.append('file', file);
      return api<TransporterImportResult>(`${TR}/transporters/import`, { method: 'POST', form, query: commit ? { commit: 'true' } : undefined });
    },
    onSuccess: (_d, v) => v.commit && invalidate(),
  });
}

// ── Freight flow ─────────────────────────────────────────────────────

export function useInquiries(query: ListQuery<object>) {
  return useQuery({ queryKey: trKeys.list('inquiries', query), queryFn: ({ signal }) => api<ListResult<InquiryView>>(`${TR}/inquiries`, { query, signal }), placeholderData: keepPreviousData });
}
export function useInquiry(id: string | null | undefined) {
  return useQuery({ queryKey: trKeys.one('inquiries', id ?? ''), queryFn: ({ signal }) => api<InquiryView>(`${TR}/inquiries/${id}`, { signal }), enabled: !!id });
}
export function useSaveInquiry() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string | null; input: Input }) => (id ? api<InquiryView>(`${TR}/inquiries/${id}`, { method: 'PATCH', body: input }) : api<InquiryView>(`${TR}/inquiries`, { method: 'POST', body: input })),
    onSuccess: invalidate,
  });
}
export function useCancelInquiry() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: ({ id, cancel }: { id: string; cancel: boolean }) => api<InquiryView>(`${TR}/inquiries/${id}/${cancel ? 'cancel' : 'reopen'}`, { method: 'POST' }), onSuccess: invalidate });
}
export function usePastQuotes(inquiryId: string | null) {
  return useQuery({ queryKey: trKeys.one('past-quotes', inquiryId ?? ''), queryFn: ({ signal }) => api<PastQuote[]>(`${TR}/inquiries/${inquiryId}/past-quotes`, { signal }), enabled: !!inquiryId });
}

export function useRcs(query: ListQuery<object>) {
  return useQuery({ queryKey: trKeys.list('rates', query), queryFn: ({ signal }) => api<ListResult<RateComparisonView>>(`${TR}/rates`, { query, signal }), placeholderData: keepPreviousData });
}
export function useRc(id: string | null | undefined) {
  return useQuery({ queryKey: trKeys.one('rates', id ?? ''), queryFn: ({ signal }) => api<RateComparisonView>(`${TR}/rates/${id}`, { signal }), enabled: !!id });
}
export function useSaveRc() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: ({ inquiryId, input }: { inquiryId: string; input: Input }) => api<RateComparisonView>(`${TR}/inquiries/${inquiryId}/rates`, { method: 'PUT', body: input }), onSuccess: invalidate });
}
export function useSubmitRc() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<RateComparisonView>(`${TR}/rates/${id}/submit`, { method: 'POST' }), onSuccess: invalidate });
}
export function useDecideRc() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: 'approve' | 'reject'; note?: string | null }) => api<RateComparisonView>(`${TR}/rates/${id}/decision`, { method: 'POST', body: { decision, note } }),
    onSuccess: invalidate,
  });
}
export function useCreateOrder() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (rcId: string) => api<FreightOrderView>(`${TR}/rates/${rcId}/order`, { method: 'POST' }), onSuccess: invalidate });
}

export function useOrders(query: ListQuery<object>) {
  return useQuery({ queryKey: trKeys.list('orders', query), queryFn: ({ signal }) => api<ListResult<FreightOrderView>>(`${TR}/orders`, { query, signal }), placeholderData: keepPreviousData });
}
export function useUpdateOrder() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: Input }) => api<FreightOrderView>(`${TR}/orders/${id}`, { method: 'PATCH', body: input }), onSuccess: invalidate });
}

export interface OrderPrint {
  company: CompanyBlock;
  order: FreightOrderView;
  generatedAt: string;
}
export const fetchOrderPrint = (id: string) => api<OrderPrint>(`${TR}/orders/${id}/print`);

// ── Dashboard, reports, exports, audit ───────────────────────────────

export function useTransportDashboard() {
  return useQuery({ queryKey: trKeys.other('dashboard'), queryFn: ({ signal }) => api<TransportDashboard>(`${TR}/dashboard`, { signal }) });
}
export type Range = { from?: string; to?: string };
export function useTransportReports(range: Range) {
  return useQuery({ queryKey: trKeys.other('reports', range), queryFn: ({ signal }) => api<TransportReports>(`${TR}/reports`, { query: range, signal }), placeholderData: keepPreviousData });
}
export const exportTransport = (kind: 'transporters' | 'inquiries' | 'orders', q: Range = {}) => downloadFile(`${TR}/export/${kind}`, q);
export function useTransportAudit(query: { q?: string; page?: number }) {
  return useQuery({ queryKey: trKeys.other('audit', query), queryFn: ({ signal }) => api<ListResult<ActivityEntryView>>(`${TR}/audit`, { query, signal }), placeholderData: keepPreviousData });
}
