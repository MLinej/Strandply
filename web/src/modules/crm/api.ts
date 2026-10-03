import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivityEntryView } from '@contracts/admin';
import type { ListQuery, ListResult } from '@contracts/common';
import type {
  CampaignView,
  Customer360,
  CrmCustomer,
  CrmDashboard,
  CrmMeta,
  CrmProduct,
  CrmReports,
  FollowupBoard,
  FollowupView,
  Lead,
  LeadImportResult,
  OpportunityView,
  OrderLostView,
  OrderWonView,
  QuotationView,
  Salesperson,
  SalespersonView,
  SourceRow,
  TaskView,
} from '@contracts/crm';
import type { CompanyBlock } from '@contracts/sampletrack';
import { api, downloadFile } from '@/api/client';
import { stKeys } from '../samples/api/keys';

const CR = '/crm';

/** Record kinds and what the API returns for each. */
export interface CrmViews {
  leads: Lead;
  customers: CrmCustomer;
  followups: FollowupView;
  tasks: TaskView;
  opportunities: OpportunityView;
  quotations: QuotationView;
  won: OrderWonView;
  lost: OrderLostView;
  campaigns: CampaignView;
  products: CrmProduct;
  salespersons: Salesperson;
}
export type CrmKind = keyof CrmViews;

export const crKeys = {
  all: ['cr'] as const,
  meta: ['cr', 'meta'] as const,
  list: (kind: string, q: object) => ['cr', kind, 'list', q] as const,
  one: (kind: string, id: string) => ['cr', kind, 'one', id] as const,
  other: (what: string, q: object = {}) => ['cr', what, q] as const,
};

/** Records feed each other (follow-ups move customers' dates, won / lost close opportunities): writes refresh the module and the sidebar badges. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: crKeys.all });
    void qc.invalidateQueries({ queryKey: stKeys.badges });
  };
}

export function useCrmMeta() {
  return useQuery({ queryKey: crKeys.meta, queryFn: ({ signal }) => api<CrmMeta>(`${CR}/meta`, { signal }), staleTime: 30_000 });
}
export function useSaveCrmSettings() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: { sources?: string[]; lostReasons?: string[] }) => api<{ sources: string[]; lostReasons: string[] }>(`${CR}/settings`, { method: 'PATCH', body: input }), onSuccess: invalidate });
}

export function useRecords<K extends CrmKind>(kind: K, query: ListQuery<object>, { enabled = true } = {}) {
  return useQuery({ queryKey: crKeys.list(kind, query), queryFn: ({ signal }) => api<ListResult<CrmViews[K]>>(`${CR}/${kind}`, { query, signal }), placeholderData: keepPreviousData, enabled });
}
export function useRecord<K extends CrmKind>(kind: K, id: string | null | undefined) {
  return useQuery({ queryKey: crKeys.one(kind, id ?? ''), queryFn: ({ signal }) => api<CrmViews[K]>(`${CR}/${kind}/${id}`, { signal }), enabled: !!id });
}
export function useSaveRecord<K extends CrmKind>(kind: K) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string | null; input: Record<string, unknown> }) =>
      id ? api<CrmViews[K]>(`${CR}/${kind}/${id}`, { method: 'PATCH', body: input }) : api<CrmViews[K]>(`${CR}/${kind}`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}
export function useDeleteRecord(kind: CrmKind) {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${CR}/${kind}/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

// ── Workflow ─────────────────────────────────────────────────────────

export const fetchDuplicates = (q: { companyName?: string; mobile?: string; email?: string; city?: string; except?: string }) => api<string[]>(`${CR}/leads/duplicates`, { query: q });
export function useConvertLead() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<CrmCustomer>(`${CR}/leads/${id}/convert`, { method: 'POST' }), onSuccess: invalidate });
}
export function useImportLeads() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ file, commit }: { file: File; commit: boolean }) => {
      const form = new FormData();
      form.append('file', file);
      return api<LeadImportResult>(`${CR}/leads/import`, { method: 'POST', form, query: commit ? { commit: 'true' } : undefined });
    },
    onSuccess: (_d, v) => v.commit && invalidate(),
  });
}
export function useCloseOpportunity() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, outcome, input }: { id: string; outcome: 'won' | 'lost'; input: Record<string, unknown> }) => api<OrderWonView | OrderLostView>(`${CR}/opportunities/${id}/${outcome}`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}
export function useReactivate() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<OpportunityView>(`${CR}/lost/${id}/reactivate`, { method: 'POST' }), onSuccess: invalidate });
}
export function useLeadStages() {
  return useQuery({ queryKey: crKeys.other('stages'), queryFn: ({ signal }) => api<{ name: string; value: number }[]>(`${CR}/leads/stages`, { signal }) });
}
export function useBoard(salesperson?: string) {
  return useQuery({ queryKey: crKeys.other('board', { salesperson }), queryFn: ({ signal }) => api<FollowupBoard>(`${CR}/followups/board`, { query: { salesperson }, signal }) });
}
export function useCustomer360(id: string | null) {
  return useQuery({ queryKey: crKeys.one('customer360', id ?? ''), queryFn: ({ signal }) => api<Customer360>(`${CR}/customers/${id}/360`, { signal }), enabled: !!id });
}

export interface QuotationPrint {
  company: CompanyBlock;
  quotation: QuotationView;
  customer: CrmCustomer | null;
  generatedAt: string;
}
export const fetchQuotationPrint = (id: string) => api<QuotationPrint>(`${CR}/quotations/${id}/print`);

// ── Dashboard, reports, exports, audit ───────────────────────────────

export function useCrmDashboard() {
  return useQuery({ queryKey: crKeys.other('dashboard'), queryFn: ({ signal }) => api<CrmDashboard>(`${CR}/dashboard`, { signal }) });
}
export type Range = { from?: string; to?: string; salesperson?: string };
export function useCrmReports(range: Range) {
  return useQuery({ queryKey: crKeys.other('reports', range), queryFn: ({ signal }) => api<CrmReports>(`${CR}/reports`, { query: range, signal }), placeholderData: keepPreviousData });
}
export function useSalespersonStats({ enabled = true } = {}) {
  return useQuery({ queryKey: crKeys.other('salespersons-stats'), queryFn: ({ signal }) => api<SalespersonView[]>(`${CR}/salespersons/stats`, { signal }), enabled });
}
export function useSources() {
  return useQuery({ queryKey: crKeys.other('sources'), queryFn: ({ signal }) => api<SourceRow[]>(`${CR}/sources`, { signal }) });
}
export type ExportKind = 'leads' | 'customers' | 'followups' | 'opportunities' | 'quotations' | 'won' | 'lost';
export const exportCrm = (kind: ExportKind, q: Record<string, string | undefined> = {}) => downloadFile(`${CR}/export/${kind}`, q);
export function useCrmAudit(query: { q?: string; page?: number }) {
  return useQuery({ queryKey: crKeys.other('audit', query), queryFn: ({ signal }) => api<ListResult<ActivityEntryView>>(`${CR}/audit`, { query, signal }), placeholderData: keepPreviousData });
}
