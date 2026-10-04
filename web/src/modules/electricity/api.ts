import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivityEntryView } from '@contracts/admin';
import type { ListQuery, ListResult } from '@contracts/common';
import type { BillSummary, BillView, DailyReport, ElBill, ElectricityDashboard, ElectricityMeta, ElRate, MeterConfig, ReadingPreview, ReadingView } from '@contracts/electricity';
import { api, downloadFile } from '@/api/client';

const EL = '/electricity';

export const elKeys = {
  all: ['el'] as const,
  meta: ['el', 'meta'] as const,
  other: (what: string, q: object = {}) => ['el', what, q] as const,
};

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: elKeys.all });
}
type Input = Record<string, unknown>;
export type Range = { from?: string; to?: string };

export function useElectricityMeta() {
  return useQuery({ queryKey: elKeys.meta, queryFn: ({ signal }) => api<ElectricityMeta>(`${EL}/meta`, { signal }) });
}

export function useElectricitySettings() {
  return useQuery({ queryKey: elKeys.other('settings'), queryFn: ({ signal }) => api<{ meter: MeterConfig; rates: ElRate[] }>(`${EL}/settings`, { signal }) });
}
export function useSaveMeter() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: Input) => api<MeterConfig>(`${EL}/settings/meter`, { method: 'PATCH', body: input }), onSuccess: invalidate });
}
export function useAddRate() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: Input) => api<ElRate>(`${EL}/rates`, { method: 'POST', body: input }), onSuccess: invalidate });
}
export function useRemoveRate() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${EL}/rates/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export function useReadings(query: ListQuery<object>) {
  return useQuery({ queryKey: elKeys.other('readings', query), queryFn: ({ signal }) => api<ListResult<ReadingView>>(`${EL}/readings`, { query, signal }), placeholderData: keepPreviousData });
}
export function useReadingPreview(q: { date: string; time: string; kwh: string }) {
  const ok = !!q.date && /^\d\d:\d\d$/.test(q.time) && Number(q.kwh) > 0;
  return useQuery({ queryKey: elKeys.other('preview', q), queryFn: ({ signal }) => api<ReadingPreview>(`${EL}/readings/preview`, { query: q, signal }), enabled: ok, placeholderData: keepPreviousData });
}
export function useAddReading() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: Input) => api<ReadingView>(`${EL}/readings`, { method: 'POST', body: input }), onSuccess: invalidate });
}
export function useDeleteReading() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${EL}/readings/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export function useDaily(range: Range, { enabled = true } = {}) {
  return useQuery({ queryKey: elKeys.other('daily', range), queryFn: ({ signal }) => api<DailyReport>(`${EL}/daily`, { query: range, signal }), placeholderData: keepPreviousData, enabled });
}
export function useElectricityDashboard(range: Range) {
  return useQuery({ queryKey: elKeys.other('dashboard', range), queryFn: ({ signal }) => api<ElectricityDashboard>(`${EL}/dashboard`, { query: range, signal }), placeholderData: keepPreviousData });
}

export function useBills(range: Range = {}) {
  return useQuery({ queryKey: elKeys.other('bills', range), queryFn: ({ signal }) => api<{ rows: BillView[]; summary: BillSummary }>(`${EL}/bills`, { query: range, signal }) });
}
export function useSaveBill() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string | null; input: Input }) => (id ? api<ElBill>(`${EL}/bills/${id}`, { method: 'PATCH', body: input }) : api<ElBill>(`${EL}/bills`, { method: 'POST', body: input })),
    onSuccess: invalidate,
  });
}
export function useDeleteBill() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${EL}/bills/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}
export function useAttachInvoice() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return api<ElBill>(`${EL}/bills/${id}/invoice`, { method: 'POST', form });
    },
    onSuccess: invalidate,
  });
}
export function useRemoveInvoice() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<ElBill>(`${EL}/bills/${id}/invoice`, { method: 'DELETE' }), onSuccess: invalidate });
}
export const invoiceUrl = (id: string) => `/api${EL}/bills/${id}/invoice`;

export const exportElectricity = (kind: 'readings' | 'daily' | 'bills', range: Range = {}) => downloadFile(`${EL}/export/${kind}`, range);
export function useElectricityAudit(query: { q?: string; page?: number }) {
  return useQuery({ queryKey: elKeys.other('audit', query), queryFn: ({ signal }) => api<ListResult<ActivityEntryView>>(`${EL}/audit`, { query, signal }), placeholderData: keepPreviousData });
}
