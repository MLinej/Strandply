import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListQuery, ListResult } from '@contracts/common';
import type { CompanyBlock } from '@contracts/sampletrack';
import type {
  ConsumptionInput,
  DocumentFilters,
  DocumentType,
  EntryFilters,
  EntryInput,
  EntryStats,
  InventoryView,
  MaterialId,
  NoteFilters,
  NoteKind,
  NoteRow,
  NoteStats,
  NoteStatus,
  OpeningStockInput,
  OpeningStockView,
  PoFilters,
  PoInput,
  PoOption,
  PoStats,
  PurchaseDashboard,
  PurchaseDocumentView,
  PurchaseEntryView,
  PurchaseMeta,
  PurchaseOrderView,
  PurchaseReports,
  PurchaseReturnView,
  PurchaseType,
  PurchaseVendorOption,
  ReturnInput,
  TypeKind,
} from '@contracts/purchase';
import type { ActivityEntryView } from '@contracts/admin';
import { api, downloadFile, isApiError } from '@/api/client';

const PU = '/purchase';

export const puKeys = {
  all: ['pu'] as const,
  meta: ['pu', 'meta'] as const,
  entries: ['pu', 'entries'] as const,
  entryList: (q: object) => ['pu', 'entries', 'list', q] as const,
  entryStats: (q: object) => ['pu', 'entries', 'stats', q] as const,
  entry: (id: string) => ['pu', 'entries', 'detail', id] as const,
  nextLot: (m: string, d: string) => ['pu', 'entries', 'next-lot', m, d] as const,
  notes: (q: object) => ['pu', 'entries', 'notes', q] as const,
  pos: ['pu', 'pos'] as const,
  poList: (q: object) => ['pu', 'pos', 'list', q] as const,
  poOptions: (m: string) => ['pu', 'pos', 'options', m] as const,
  tncOptions: ['pu', 'pos', 'tnc'] as const,
  returns: (q: object) => ['pu', 'returns', q] as const,
  inventory: (fy: string) => ['pu', 'inventory', fy] as const,
  dashboard: (q: object) => ['pu', 'dashboard', q] as const,
  reports: (q: object) => ['pu', 'reports', q] as const,
  documents: (q: object) => ['pu', 'documents', q] as const,
  audit: (q: object) => ['pu', 'audit', q] as const,
  vendors: (q: string) => ['pu', 'vendor-options', q] as const,
};

/** Anything recorded in Purchase can move every figure, so writes refresh the whole module. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: puKeys.all });
}

export const rupeesToPaise = (s: string) => Math.round(Number(s.replace(/[,₹\s]/g, '')) * 100);

// ── Meta and masters ─────────────────────────────────────────────────

export function usePurchaseMeta() {
  return useQuery({ queryKey: puKeys.meta, queryFn: ({ signal }) => api<PurchaseMeta>(`${PU}/meta`, { signal }), staleTime: 60_000 });
}

export function useAddType() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: { kind: TypeKind; name: string }) => api<PurchaseType>(`${PU}/types`, { method: 'POST', body: input }), onSuccess: invalidate });
}

export function useRemoveType() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${PU}/types/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export function usePurchaseVendors(q: string) {
  return useQuery({
    queryKey: puKeys.vendors(q),
    queryFn: ({ signal }) => api<PurchaseVendorOption[]>(`${PU}/vendor-options`, { query: { q }, signal }),
    placeholderData: keepPreviousData,
  });
}

// ── Entries ──────────────────────────────────────────────────────────

export type EntryQuery = ListQuery<EntryFilters>;

export function useEntries(query: EntryQuery, { enabled = true } = {}) {
  return useQuery({
    queryKey: puKeys.entryList(query),
    queryFn: ({ signal }) => api<ListResult<PurchaseEntryView>>(`${PU}/entries`, { query, signal }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useEntryStats(query: Omit<EntryQuery, 'page' | 'pageSize' | 'sort'>) {
  return useQuery({ queryKey: puKeys.entryStats(query), queryFn: ({ signal }) => api<EntryStats>(`${PU}/entries/stats`, { query, signal }), placeholderData: keepPreviousData });
}

export function useEntry(id: string | null | undefined) {
  return useQuery({ queryKey: puKeys.entry(id ?? ''), queryFn: ({ signal }) => api<PurchaseEntryView>(`${PU}/entries/${id}`, { signal }), enabled: !!id });
}

export function useNextLot(material: MaterialId, date: string, enabled: boolean) {
  return useQuery({
    queryKey: puKeys.nextLot(material, date),
    queryFn: ({ signal }) => api<{ lotNo: string }>(`${PU}/entries/next-lot`, { query: { material, date }, signal }).then((r) => r.lotNo),
    enabled: enabled && /^\d{4}-\d{2}-\d{2}$/.test(date),
  });
}

export interface DuplicateEntryDetails {
  similar: { id: string; material: MaterialId; lotNo: string; date: string }[];
}
export const duplicateEntryOf = (err: unknown) => (isApiError(err, 'possible_duplicate') ? (err.details as DuplicateEntryDetails) : null);

export type EntryBody = Omit<EntryInput, 'lotNo'> & { lotNo?: string | null; post?: boolean };

export function useSaveEntry() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input, force }: { id?: string; input: Partial<EntryBody>; force?: boolean }) =>
      id
        ? api<PurchaseEntryView>(`${PU}/entries/${id}`, { method: 'PATCH', body: input, query: { force: force || undefined } })
        : api<PurchaseEntryView>(`${PU}/entries`, { method: 'POST', body: input, query: { force: force || undefined } }),
    onSuccess: invalidate,
  });
}

export function useApproveEntry() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<PurchaseEntryView>(`${PU}/entries/${id}/approve`, { method: 'POST' }), onSuccess: invalidate });
}

export function useDeleteEntry() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${PU}/entries/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export const exportEntries = (query: Omit<EntryQuery, 'page' | 'pageSize'>) => downloadFile(`${PU}/entries/export`, query);

export interface EntryPrintPayload {
  company: CompanyBlock;
  entry: PurchaseEntryView;
  generatedAt: string;
}
export const fetchEntryPrint = (id: string, kind: 'slip' | 'label') => api<EntryPrintPayload>(`${PU}/entries/${id}/print`, { query: { kind } });

// ── Notes ────────────────────────────────────────────────────────────

export function useNotes(query: { q?: string; filters?: Partial<NoteFilters> }) {
  return useQuery({
    queryKey: puKeys.notes(query),
    queryFn: ({ signal }) => api<{ rows: NoteRow[]; stats: NoteStats }>(`${PU}/notes`, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useSetNoteStatus() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ entryId, kind, status }: { entryId: string; kind: NoteKind; status: NoteStatus }) =>
      api<void>(`${PU}/notes/${entryId}/${kind}`, { method: 'PATCH', body: { status } }),
    onSuccess: invalidate,
  });
}

// ── POs ──────────────────────────────────────────────────────────────

export function usePurchaseOrders(query: ListQuery<PoFilters>) {
  return useQuery({
    queryKey: puKeys.poList(query),
    queryFn: ({ signal }) => api<ListResult<PurchaseOrderView> & { stats: PoStats }>(`${PU}/pos`, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

export function usePoOptions(material: MaterialId) {
  return useQuery({ queryKey: puKeys.poOptions(material), queryFn: ({ signal }) => api<PoOption[]>(`${PU}/pos/options`, { query: { material }, signal }) });
}

export function useTncOptions({ enabled = true } = {}) {
  return useQuery({
    queryKey: puKeys.tncOptions,
    queryFn: ({ signal }) => api<{ id: string; title: string; category: string | null; summary: string | null }[]>(`${PU}/pos/tnc-options`, { signal }),
    enabled,
  });
}

export function useSavePo() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: PoInput }) =>
      id ? api<PurchaseOrderView>(`${PU}/pos/${id}`, { method: 'PATCH', body: input }) : api<PurchaseOrderView>(`${PU}/pos`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useApprovePo() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<PurchaseOrderView>(`${PU}/pos/${id}/approve`, { method: 'POST' }), onSuccess: invalidate });
}

export function useDeletePo() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${PU}/pos/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export const exportPos = () => downloadFile(`${PU}/pos/export`);

export interface PoPrintPayload {
  company: CompanyBlock;
  po: PurchaseOrderView;
  vendor: { address: string | null; gstin: string | null; pan: string | null; phone: string | null; email: string | null; paymentTerms: string | null } | null;
  tnc: { id: string; title: string; body: string }[];
  generatedAt: string;
}
export const fetchPoPrint = (id: string) => api<PoPrintPayload>(`${PU}/pos/${id}/print`);

// ── Returns ──────────────────────────────────────────────────────────

export function useReturns(query: ListQuery<{ material: MaterialId; status: 'pending' | 'approved'; fy: string }>) {
  return useQuery({
    queryKey: puKeys.returns(query),
    queryFn: ({ signal }) => api<ListResult<PurchaseReturnView>>(`${PU}/returns`, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useSaveReturn() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: ReturnInput) => api<PurchaseReturnView>(`${PU}/returns`, { method: 'POST', body: input }), onSuccess: invalidate });
}

export function useApproveReturn() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<PurchaseReturnView>(`${PU}/returns/${id}/approve`, { method: 'POST' }), onSuccess: invalidate });
}

export function useDeleteReturn() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${PU}/returns/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

// ── Inventory ────────────────────────────────────────────────────────

export function useInventory(fy: string | undefined) {
  return useQuery({ queryKey: puKeys.inventory(fy ?? ''), queryFn: ({ signal }) => api<InventoryView>(`${PU}/inventory`, { query: { fy }, signal }), enabled: !!fy });
}

export function useSaveOpening() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ fy, input }: { fy: string; input: OpeningStockInput }) => api<OpeningStockView>(`${PU}/opening-stock/${fy}`, { method: 'PUT', body: input }),
    onSuccess: invalidate,
  });
}

export function useOpeningApproval() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ fy, action }: { fy: string; action: 'approve' | 'unlock' }) => api<OpeningStockView>(`${PU}/opening-stock/${fy}/${action}`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

export function useSetConsumption() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ fy, input }: { fy: string; input: ConsumptionInput }) => api<void>(`${PU}/consumption/${fy}`, { method: 'PUT', body: input }),
    onSuccess: invalidate,
  });
}

export const exportInventory = (fy: string) => downloadFile(`${PU}/inventory/export`, { fy });

// ── Dashboard, reports, audit ────────────────────────────────────────

export interface Scope {
  fy?: string;
  month?: string;
  material?: MaterialId;
}

export function usePurchaseDashboard(scope: Scope) {
  return useQuery({
    queryKey: puKeys.dashboard(scope),
    queryFn: ({ signal }) => api<PurchaseDashboard>(`${PU}/dashboard`, { query: { ...scope }, signal }),
    placeholderData: keepPreviousData,
    enabled: !!scope.fy,
  });
}

export function usePurchaseReports(scope: Scope) {
  return useQuery({
    queryKey: puKeys.reports(scope),
    queryFn: ({ signal }) => api<PurchaseReports>(`${PU}/reports`, { query: { ...scope }, signal }),
    placeholderData: keepPreviousData,
    enabled: !!scope.fy,
  });
}

export const exportReport = (scope: Scope, kind: 'daywise' | 'product-day') => downloadFile(`${PU}/reports/export`, { ...scope, kind });

export function usePurchaseAudit(query: { q?: string; page?: number }) {
  return useQuery({
    queryKey: puKeys.audit(query),
    queryFn: ({ signal }) => api<ListResult<ActivityEntryView>>(`${PU}/audit`, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

// ── Documents ────────────────────────────────────────────────────────

export function useDocuments(query: ListQuery<DocumentFilters>) {
  return useQuery({
    queryKey: puKeys.documents(query),
    queryFn: ({ signal }) => api<ListResult<PurchaseDocumentView> & { byType: Record<string, number> }>(`${PU}/documents`, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useUploadDocument() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ file, type, entryId }: { file: File; type: DocumentType; entryId?: string | null }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('type', type);
      if (entryId) form.append('entryId', entryId);
      return api<PurchaseDocumentView>(`${PU}/documents`, { method: 'POST', form });
    },
    onSuccess: invalidate,
  });
}

export function useDeleteDocument() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${PU}/documents/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export const documentUrl = (id: string) => `/api${PU}/documents/${id}/file`;
