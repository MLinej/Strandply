import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivityEntryView } from '@contracts/admin';
import type { ListQuery, ListResult } from '@contracts/common';
import type {
  Customer,
  CustomerFilters,
  DispatchRegister,
  DocListFilters,
  DocSummary,
  EmailDoc,
  EmailDraft,
  FgStockView,
  Firm,
  IntercompanyView,
  PartyLedger,
  PriceEntry,
  ProformaView,
  ReportId,
  ReportResult,
  SalesDashboard,
  SalesInvoiceView,
  SalesItem,
  SalesMeta,
  SalesOptions,
  SalesOrderView,
  SalesSettings,
  WeightEntry,
} from '@contracts/sales';
import type { CompanyBlock } from '@contracts/sampletrack';
import { api, downloadFile } from '@/api/client';
import { useFirmScope } from '@/app/session';

const SL = '/sales';

export const slKeys = {
  all: ['sl'] as const,
  meta: ['sl', 'meta'] as const,
  options: ['sl', 'options'] as const,
  list: (what: string, q: object) => ['sl', what, 'list', q] as const,
  one: (what: string, id: string) => ['sl', what, 'one', id] as const,
  other: (what: string, q: object = {}) => ['sl', what, q] as const,
};

/** Documents feed each other (proforma → order → invoice), the dashboard and reports: writes refresh the module. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: slKeys.all });
}

/** The shell's firm scope as a filter: "both" = no filter. */
export function useFirmFilter(): Firm | undefined {
  const scope = useFirmScope();
  return scope === 'both' ? undefined : scope;
}

export type Range = { firm?: Firm; from?: string; to?: string };
export type DocQuery = ListQuery<DocListFilters>;
type Input = Record<string, unknown>;

const save = <T>(path: string) => ({ id, input }: { id?: string | null; input: Input }) => (id ? api<T>(`${SL}/${path}/${id}`, { method: 'PATCH', body: input }) : api<T>(`${SL}/${path}`, { method: 'POST', body: input }));

// ── Meta, options, settings ──────────────────────────────────────────

export function useSalesMeta() {
  return useQuery({ queryKey: slKeys.meta, queryFn: ({ signal }) => api<SalesMeta>(`${SL}/meta`, { signal }), staleTime: 60_000 });
}
export function useSalesOptions({ enabled = true } = {}) {
  return useQuery({ queryKey: slKeys.options, queryFn: ({ signal }) => api<SalesOptions>(`${SL}/options`, { signal }), staleTime: 30_000, enabled });
}
export type SettingsPatch = Partial<Omit<SalesSettings, 'emailRecipients' | 'emailTemplates'>> & { emailRecipients?: Partial<SalesSettings['emailRecipients']>; emailTemplates?: Partial<SalesSettings['emailTemplates']> };
export function useSaveSalesSettings() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: SettingsPatch) => api<SalesSettings>(`${SL}/settings`, { method: 'PATCH', body: input }), onSuccess: invalidate });
}

// ── Masters ──────────────────────────────────────────────────────────

export function useCustomers(query: ListQuery<CustomerFilters>) {
  return useQuery({ queryKey: slKeys.list('customers', query), queryFn: ({ signal }) => api<ListResult<Customer>>(`${SL}/customers`, { query, signal }), placeholderData: keepPreviousData });
}
export function useSaveCustomer() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: save<Customer>('customers'), onSuccess: invalidate });
}
export function useLedger(customerId: string | null, firm?: Firm) {
  return useQuery({ queryKey: slKeys.other('ledger', { customerId, firm }), queryFn: ({ signal }) => api<PartyLedger>(`${SL}/customers/${customerId}/ledger`, { query: { firm }, signal }), enabled: !!customerId });
}

export function useItems(query: ListQuery<{ brand: string; grade: string; active: boolean }>) {
  return useQuery({ queryKey: slKeys.list('items', query), queryFn: ({ signal }) => api<ListResult<SalesItem>>(`${SL}/items`, { query, signal }), placeholderData: keepPreviousData });
}
export function useSaveItem() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: save<SalesItem>('items'), onSuccess: invalidate });
}

export type EntryKind = 'prices' | 'weights';
export type PriceRow = PriceEntry & { itemName: string };
export type WeightRow = WeightEntry & { itemName: string };
export function useEntries<K extends EntryKind>(kind: K, itemId?: string) {
  return useQuery({
    queryKey: slKeys.other(kind, { itemId }),
    queryFn: ({ signal }) => api<(K extends 'prices' ? PriceRow : WeightRow)[]>(`${SL}/${kind}`, { query: { itemId: itemId || undefined }, signal }),
  });
}
export function useSaveEntry(kind: EntryKind) {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: save<PriceRow | WeightRow>(kind), onSuccess: invalidate });
}

/** DELETE for any Sales record (customers, items, prices, weights, proformas, orders, invoices, fg, intercompany). */
export function useDeleteRecord(path: string) {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${SL}/${path}/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

// ── Documents ────────────────────────────────────────────────────────

export interface DocViews {
  proformas: ProformaView;
  orders: SalesOrderView;
  invoices: SalesInvoiceView;
}
export type DocPath = keyof DocViews;
export const EMAIL_KIND: Record<DocPath, EmailDoc> = { proformas: 'proforma', orders: 'order', invoices: 'invoice' };

export function useDocList<P extends DocPath>(path: P, query: DocQuery, { enabled = true } = {}) {
  return useQuery({ queryKey: slKeys.list(path, query), queryFn: ({ signal }) => api<ListResult<DocViews[P]> & { summary: DocSummary }>(`${SL}/${path}`, { query, signal }), placeholderData: keepPreviousData, enabled });
}
export function useDocOne<P extends DocPath>(path: P, id: string | null | undefined) {
  return useQuery({ queryKey: slKeys.one(path, id ?? ''), queryFn: ({ signal }) => api<DocViews[P]>(`${SL}/${path}/${id}`, { signal }), enabled: !!id });
}
export function useSaveDoc<P extends DocPath>(path: P) {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: save<DocViews[P]>(path), onSuccess: invalidate });
}
export function useDocStatus(path: 'proformas' | 'orders') {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api<unknown>(`${SL}/${path}/${id}/status`, { method: 'POST', body: { status } }), onSuccess: invalidate });
}
export function useConfirmProforma() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<{ proforma: ProformaView; order: SalesOrderView }>(`${SL}/proformas/${id}/confirm`, { method: 'POST' }), onSuccess: invalidate });
}
export function useRecordDispatch() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: Input }) => api<SalesOrderView>(`${SL}/orders/${id}/dispatch`, { method: 'POST', body: input }), onSuccess: invalidate });
}
export function useDecideInvoice() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: 'approve' | 'reject' | 'reopen'; note?: string | null }) => api<SalesInvoiceView>(`${SL}/invoices/${id}/approve`, { method: 'POST', body: { decision, note: note ?? null } }),
    onSuccess: invalidate,
  });
}

export interface PrintPayload<T> {
  company: CompanyBlock;
  doc: T;
  billParty: Customer | null;
  shipParty: Customer | null;
  generatedAt: string;
}
export const fetchPrint = <P extends DocPath>(path: P, id: string) => api<PrintPayload<DocViews[P]>>(`${SL}/${path}/${id}/print`);
export const fetchEmail = (path: DocPath, id: string) => api<EmailDraft>(`${SL}/${path}/${id}/email`);

// ── Dispatch, FG, inter-company ──────────────────────────────────────

export function useDispatchRegister(q: Range & { q?: string; shipTo?: string; state?: string; city?: string; page?: number; pageSize?: number }) {
  return useQuery({ queryKey: slKeys.other('dispatch', q), queryFn: ({ signal }) => api<DispatchRegister>(`${SL}/dispatch`, { query: q, signal }), placeholderData: keepPreviousData });
}
export function useFg(q: { firm?: Firm; grade?: string }) {
  return useQuery({ queryKey: slKeys.other('fg', q), queryFn: ({ signal }) => api<FgStockView[]>(`${SL}/fg`, { query: q, signal }) });
}
export function useSaveFg() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: save<FgStockView>('fg'), onSuccess: invalidate });
}
export interface IntercompanyList extends ListResult<IntercompanyView> {
  kpis: { count: number; qtySqm: number; totalPaise: number; taxPaise: number; matched: number };
}
export function useIntercompany(query: ListQuery<{ from: string; to: string }>) {
  return useQuery({ queryKey: slKeys.list('intercompany', query), queryFn: ({ signal }) => api<IntercompanyList>(`${SL}/intercompany`, { query, signal }), placeholderData: keepPreviousData });
}
export function useSaveIntercompany() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: save<IntercompanyView>('intercompany'), onSuccess: invalidate });
}

// ── Dashboard, reports, exports, audit ───────────────────────────────

export function useSalesDashboard(range: Range) {
  return useQuery({ queryKey: slKeys.other('dashboard', range), queryFn: ({ signal }) => api<SalesDashboard>(`${SL}/dashboard`, { query: range, signal }), placeholderData: keepPreviousData });
}
export function useReport(id: ReportId | null, range: Range) {
  return useQuery({ queryKey: slKeys.other('report', { id, ...range }), queryFn: ({ signal }) => api<ReportResult>(`${SL}/reports/${id}`, { query: range, signal }), enabled: !!id, placeholderData: keepPreviousData });
}
export type ExportKind = 'customers' | 'items' | 'prices' | 'weights' | 'proformas' | 'orders' | 'invoices' | 'dispatch' | 'fg' | 'intercompany';
export const exportSales = (kind: ExportKind, range: Range = {}) => downloadFile(`${SL}/export/${kind}`, range);
export const exportReport = (id: ReportId, range: Range = {}) => downloadFile(`${SL}/reports/${id}/export`, range);

export function useSalesAudit(query: { q?: string; page?: number }) {
  return useQuery({ queryKey: slKeys.other('audit', query), queryFn: ({ signal }) => api<ListResult<ActivityEntryView>>(`${SL}/audit`, { query, signal }), placeholderData: keepPreviousData });
}
