import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivityEntryView } from '@contracts/admin';
import type { ListQuery, ListResult } from '@contracts/common';
import type { CompanyBlock } from '@contracts/sampletrack';
import type {
  AccountingReport,
  GrnFilters,
  GrnView,
  InvoiceMatch,
  MrnFilters,
  MrnView,
  PendingReport,
  QualityStatus,
  StoreMaterial,
  StoresDashboard,
  StoresMeta,
  StoresSettings,
  StoresVendorOption,
  StoreUnit,
} from '@contracts/stores';
import { api, downloadFile } from '@/api/client';

const STO = '/stores';

export const stoKeys = {
  all: ['sto'] as const,
  meta: ['sto', 'meta'] as const,
  vendors: (q: string) => ['sto', 'vendor-options', q] as const,
  mrnList: (q: object) => ['sto', 'mrns', 'list', q] as const,
  mrn: (id: string) => ['sto', 'mrns', 'detail', id] as const,
  grnList: (q: object) => ['sto', 'grns', 'list', q] as const,
  grn: (id: string) => ['sto', 'grns', 'detail', id] as const,
  invoice: (no: string, vendor: string) => ['sto', 'invoice-link', no, vendor] as const,
  dashboard: ['sto', 'dashboard'] as const,
  pending: (q: object) => ['sto', 'pending', q] as const,
  accounting: (q: object) => ['sto', 'accounting', q] as const,
  audit: (q: object) => ['sto', 'audit', q] as const,
};
/** The pending-GRN sidebar badge lives under the SampleTrack badges key. */
const BADGES = ['st', 'notifications', 'badges'] as const;

/** A gate entry or GRN moves the dashboard, both registers and the reports, so writes refresh the module. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: stoKeys.all });
    void qc.invalidateQueries({ queryKey: BADGES });
  };
}

// ── Meta, settings, vendors ──────────────────────────────────────────

export function useStoresMeta() {
  return useQuery({ queryKey: stoKeys.meta, queryFn: ({ signal }) => api<StoresMeta>(`${STO}/meta`, { signal }), staleTime: 30_000 });
}

export function useSaveStoresSettings() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: Partial<StoresSettings>) => api<StoresSettings>(`${STO}/settings`, { method: 'PATCH', body: input }), onSuccess: invalidate });
}

export function useStoresVendors(q: string, { enabled = true } = {}) {
  return useQuery({
    queryKey: stoKeys.vendors(q),
    queryFn: ({ signal }) => api<StoresVendorOption[]>(`${STO}/vendor-options`, { query: { q }, signal }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

// ── MRN ──────────────────────────────────────────────────────────────

export type MrnQuery = ListQuery<MrnFilters>;

export function useMrns(query: MrnQuery, { enabled = true } = {}) {
  return useQuery({
    queryKey: stoKeys.mrnList(query),
    queryFn: ({ signal }) => api<ListResult<MrnView>>(`${STO}/mrns`, { query, signal }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useMrn(id: string | null | undefined) {
  return useQuery({ queryKey: stoKeys.mrn(id ?? ''), queryFn: ({ signal }) => api<MrnView>(`${STO}/mrns/${id}`, { signal }), enabled: !!id });
}

export interface MrnItemInput {
  id?: string | null;
  material: StoreMaterial;
  approxQty: number;
  unit: StoreUnit;
  packages: string | null;
  remarks: string | null;
}
export interface MrnInput {
  date?: string;
  time?: string;
  vehicleNo: string;
  securityName: string;
  driverName: string | null;
  driverPhone: string | null;
  vendorId: string | null;
  vendorName: string;
  invoiceNo: string | null;
  remarks: string | null;
  items: MrnItemInput[];
}

export function useSaveMrn() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: MrnInput }) =>
      id ? api<MrnView>(`${STO}/mrns/${id}`, { method: 'PATCH', body: input }) : api<MrnView>(`${STO}/mrns`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteMrn() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${STO}/mrns/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export const exportMrns = (query: Omit<MrnQuery, 'page' | 'pageSize'>) => downloadFile(`${STO}/mrns/export`, query);

export interface MrnPrintPayload {
  company: CompanyBlock;
  mrn: MrnView;
  generatedAt: string;
}
export const fetchMrnPrint = (id: string) => api<MrnPrintPayload>(`${STO}/mrns/${id}/print`);

// ── GRN ──────────────────────────────────────────────────────────────

export type GrnQuery = ListQuery<GrnFilters>;

export function useGrns(query: GrnQuery) {
  return useQuery({ queryKey: stoKeys.grnList(query), queryFn: ({ signal }) => api<ListResult<GrnView>>(`${STO}/grns`, { query, signal }), placeholderData: keepPreviousData });
}

export function useGrn(id: string | null | undefined) {
  return useQuery({ queryKey: stoKeys.grn(id ?? ''), queryFn: ({ signal }) => api<GrnView>(`${STO}/grns/${id}`, { signal }), enabled: !!id });
}

export function useInvoiceLink(invoiceNo: string, vendorName: string) {
  return useQuery<InvoiceMatch | null>({
    queryKey: stoKeys.invoice(invoiceNo, vendorName),
    queryFn: ({ signal }) => api<{ match: InvoiceMatch | null }>(`${STO}/grns/invoice-link`, { query: { invoiceNo, vendorName: vendorName || undefined }, signal }).then((r) => r.match),
    enabled: invoiceNo.trim().length > 0,
  });
}

export interface GrnItemInput {
  id?: string | null;
  mrnItemId: string | null;
  material: StoreMaterial | null;
  actualQty: number;
  unit: StoreUnit;
  quality: QualityStatus;
  qualityRemarks: string | null;
}
export interface GrnInput {
  mrnId?: string;
  date?: string;
  time?: string;
  vendorName: string;
  invoiceNo: string;
  receivedByName: string;
  remarks: string | null;
  items: GrnItemInput[];
}

export function useSaveGrn() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: GrnInput }) =>
      id ? api<GrnView>(`${STO}/grns/${id}`, { method: 'PATCH', body: input }) : api<GrnView>(`${STO}/grns`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteGrn() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${STO}/grns/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export type GrnStep = 'review' | 'approve';
export function useGrnStep() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: ({ id, step }: { id: string; step: GrnStep }) => api<GrnView>(`${STO}/grns/${id}/${step}`, { method: 'POST' }), onSuccess: invalidate });
}

export function useMarkAccounted() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, voucherNo }: { id: string; voucherNo: string }) => api<GrnView>(`${STO}/grns/${id}/account`, { method: 'POST', body: { voucherNo } }),
    onSuccess: invalidate,
  });
}

export function useUndoAccounted() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<GrnView>(`${STO}/grns/${id}/account`, { method: 'DELETE' }), onSuccess: invalidate });
}

export const exportGrns = (query: Omit<GrnQuery, 'page' | 'pageSize'>) => downloadFile(`${STO}/grns/export`, query);

export interface GrnPrintPayload {
  company: CompanyBlock;
  grn: GrnView;
  generatedAt: string;
}
export const fetchGrnPrint = (id: string) => api<GrnPrintPayload>(`${STO}/grns/${id}/print`);

// ── Dashboard, reports, audit ────────────────────────────────────────

export function useStoresDashboard() {
  return useQuery({ queryKey: stoKeys.dashboard, queryFn: ({ signal }) => api<StoresDashboard>(`${STO}/dashboard`, { signal }) });
}

export type PendingQuery = {
  vendor?: string;
  material?: StoreMaterial;
  minDays?: number;
};
export function usePendingReport(query: PendingQuery) {
  return useQuery({ queryKey: stoKeys.pending(query), queryFn: ({ signal }) => api<PendingReport>(`${STO}/reports/pending`, { query, signal }), placeholderData: keepPreviousData });
}
export const exportPending = (query: PendingQuery) => downloadFile(`${STO}/reports/pending/export`, query);

export type AccountingQuery = { q?: string; filters?: { fy?: string; accounted?: boolean } };
export function useAccounting(query: AccountingQuery) {
  return useQuery({ queryKey: stoKeys.accounting(query), queryFn: ({ signal }) => api<AccountingReport>(`${STO}/accounting`, { query, signal }), placeholderData: keepPreviousData });
}
export const exportAccounting = (query: AccountingQuery) => downloadFile(`${STO}/accounting/export`, query);

export function useStoresAudit(query: { q?: string; page?: number }) {
  return useQuery({
    queryKey: stoKeys.audit(query),
    queryFn: ({ signal }) => api<ListResult<ActivityEntryView>>(`${STO}/audit`, { query, signal }),
    placeholderData: keepPreviousData,
  });
}
