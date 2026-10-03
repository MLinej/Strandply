import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivityEntryView } from '@contracts/admin';
import type { ListQuery, ListResult } from '@contracts/common';
import type {
  ChippingView,
  CuttingView,
  DocFilters,
  DocKind,
  HotPressView,
  LotOption,
  MattBatchView,
  MdoView,
  PlanView,
  ProductionDashboard,
  ProductionMeta,
  ProductionSettings,
  ResinUseView,
  SummaryView,
  WipBatchView,
  WipLedgerRow,
} from '@contracts/production';
import type { CompanyBlock } from '@contracts/sampletrack';
import { api, downloadFile } from '@/api/client';

const PR = '/production';

/** URL segment per document kind (matches the API). */
export const KIND_PATH: Record<DocKind, string> = { plan: 'plans', hotpress: 'hotpress', chipping: 'chipping', resin: 'resin', cutting: 'cutting', summary: 'summaries', mdo: 'mdo' };

export interface ViewByKind {
  plan: PlanView;
  hotpress: HotPressView;
  chipping: ChippingView;
  resin: ResinUseView;
  cutting: CuttingView;
  summary: SummaryView;
  mdo: MdoView;
}

export const prKeys = {
  all: ['pr'] as const,
  meta: ['pr', 'meta'] as const,
  docs: (kind: DocKind, q: object) => ['pr', 'docs', kind, q] as const,
  doc: (kind: DocKind, id: string) => ['pr', 'doc', kind, id] as const,
  compare: (kind: DocKind, id: string) => ['pr', 'compare', kind, id] as const,
  lots: (m: string, except: string) => ['pr', 'lots', m, except] as const,
  matts: (q: object) => ['pr', 'matt', q] as const,
  matt: (id: string) => ['pr', 'matt', 'detail', id] as const,
  wip: ['pr', 'wip'] as const,
  ledger: (id: string) => ['pr', 'wip', 'ledger', id] as const,
  dashboard: (q: object) => ['pr', 'dashboard', q] as const,
  audit: (q: object) => ['pr', 'audit', q] as const,
};

/** Documents link to each other and feed WIP, lots and the dashboard: writes refresh the module. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: prKeys.all });
}

export type Range = { from?: string; to?: string; fy?: string };
export type DocQuery = ListQuery<DocFilters>;

// ── Meta, settings, FY ───────────────────────────────────────────────

export function useProductionMeta() {
  return useQuery({ queryKey: prKeys.meta, queryFn: ({ signal }) => api<ProductionMeta>(`${PR}/meta`, { signal }), staleTime: 60_000 });
}
export function useSaveProductionSettings() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: Partial<Omit<ProductionSettings, 'closedFys'>>) => api<ProductionSettings>(`${PR}/settings`, { method: 'PATCH', body: input }), onSuccess: invalidate });
}
export function useSetFyClosed() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: ({ fy, closed }: { fy: string; closed: boolean }) => api<ProductionSettings>(`${PR}/fy/${fy}/${closed ? 'close' : 'reopen'}`, { method: 'POST' }), onSuccess: invalidate });
}

export function useLots(material: 'nilgiri' | 'resin', { except, enabled = true }: { except?: string; enabled?: boolean } = {}) {
  return useQuery({ queryKey: prKeys.lots(material, except ?? ''), queryFn: ({ signal }) => api<LotOption[]>(`${PR}/lots`, { query: { material, except }, signal }), enabled });
}

// ── Workflow documents ───────────────────────────────────────────────

export function useDocs<K extends DocKind>(kind: K, query: DocQuery, { enabled = true } = {}) {
  return useQuery({
    queryKey: prKeys.docs(kind, query),
    queryFn: ({ signal }) => api<ListResult<ViewByKind[K]>>(`${PR}/${KIND_PATH[kind]}`, { query, signal }),
    placeholderData: keepPreviousData,
    enabled,
  });
}
/** Pickers: up to 100 most recent of a kind. */
export const useDocOptions = <K extends DocKind>(kind: K, enabled = true) => useDocs(kind, { pageSize: 100 }, { enabled });

export function useDoc<K extends DocKind>(kind: K, id: string | null | undefined) {
  return useQuery({ queryKey: prKeys.doc(kind, id ?? ''), queryFn: ({ signal }) => api<ViewByKind[K]>(`${PR}/${KIND_PATH[kind]}/${id}`, { signal }), enabled: !!id });
}

export function useSaveDoc<K extends DocKind>(kind: K) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: Record<string, unknown> }) =>
      id ? api<ViewByKind[K]>(`${PR}/${KIND_PATH[kind]}/${id}`, { method: 'PATCH', body: input }) : api<ViewByKind[K]>(`${PR}/${KIND_PATH[kind]}`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}
export function useDeleteDoc(kind: DocKind) {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${PR}/${KIND_PATH[kind]}/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export type WfCall = { step: 'send'; note: string | null } | { step: 'review'; decision: 'review' | 'return'; note: string | null } | { step: 'approve'; decision: 'approve' | 'reject'; note: string | null };
export function useWorkflow(kind: DocKind) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, call }: { id: string; call: WfCall }) => {
      const { step, ...body } = call;
      return api<{ docNo: string; wfState: string }>(`${PR}/${KIND_PATH[kind]}/${id}/${step}`, { method: 'POST', body });
    },
    onSuccess: invalidate,
  });
}

export interface CompareRow {
  metric: string;
  plan: number | null;
  actual: number | null;
  variance: number | null;
  status: string;
}
export function useCompare(kind: 'plan' | 'summary', id: string | null) {
  return useQuery({ queryKey: prKeys.compare(kind, id ?? ''), queryFn: ({ signal }) => api<CompareRow[]>(`${PR}/${KIND_PATH[kind]}/${id}/compare`, { signal }), enabled: !!id });
}

export interface PrintPayload<T> {
  company: CompanyBlock;
  doc: T;
  compare: CompareRow[];
  generatedAt: string;
}
export const fetchDocPrint = <K extends DocKind>(kind: K, id: string) => api<PrintPayload<ViewByKind[K]>>(`${PR}/${KIND_PATH[kind]}/${id}/print`);
export const fetchMattPrint = (id: string) => api<PrintPayload<MattBatchView>>(`${PR}/matt/${id}/print`);

// ── Matt weight ──────────────────────────────────────────────────────

export function useMattBatches(query: ListQuery<{ fy: string; from: string; to: string; status: 'open' | 'closed' }>, { enabled = true } = {}) {
  return useQuery({ queryKey: prKeys.matts(query), queryFn: ({ signal }) => api<ListResult<MattBatchView>>(`${PR}/matt`, { query, signal }), placeholderData: keepPreviousData, enabled });
}
export function useMattBatch(id: string | null) {
  return useQuery({ queryKey: prKeys.matt(id ?? ''), queryFn: ({ signal }) => api<MattBatchView>(`${PR}/matt/${id}`, { signal }), enabled: !!id });
}
export function useSaveMatt() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: Record<string, unknown> }) =>
      id ? api<MattBatchView>(`${PR}/matt/${id}`, { method: 'PATCH', body: input }) : api<MattBatchView>(`${PR}/matt`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}
export function useMattAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { id: string; kind: 'punch'; weight: number } | { id: string; kind: 'edit'; n: number; weight: number } | { id: string; kind: 'delete'; n: number } | { id: string; kind: 'close' } | { id: string; kind: 'remove' }) => {
      const base = `${PR}/matt/${a.id}`;
      switch (a.kind) {
        case 'punch':
          return api<MattBatchView>(`${base}/weights`, { method: 'POST', body: { weight: a.weight } });
        case 'edit':
          return api<MattBatchView>(`${base}/weights/${a.n}`, { method: 'PATCH', body: { weight: a.weight } });
        case 'delete':
          return api<MattBatchView>(`${base}/weights/${a.n}`, { method: 'DELETE' });
        case 'close':
          return api<MattBatchView>(`${base}/close`, { method: 'POST' });
        case 'remove':
          return api<void>(base, { method: 'DELETE' }) as Promise<unknown> as Promise<MattBatchView>;
      }
    },
    // The punch screen shows the returned batch at once; lists refresh behind it.
    onSuccess: (b, a) => {
      if (b && a.kind !== 'remove') qc.setQueryData(prKeys.matt(a.id), b);
      void qc.invalidateQueries({ queryKey: ['pr', 'matt'], exact: false, predicate: (q) => q.queryKey[2] !== 'detail' });
      void qc.invalidateQueries({ queryKey: ['pr', 'dashboard'] });
    },
  });
}

// ── WIP Nilgiri ──────────────────────────────────────────────────────

export function useWip({ enabled = true } = {}) {
  return useQuery({ queryKey: prKeys.wip, queryFn: ({ signal }) => api<WipBatchView[]>(`${PR}/wip`, { signal }), enabled });
}
export function useWipLedger(wipId: string) {
  return useQuery({ queryKey: prKeys.ledger(wipId), queryFn: ({ signal }) => api<WipLedgerRow[]>(`${PR}/wip/ledger`, { query: { wipId: wipId || undefined }, signal }) });
}
export function useWipAction() {
  const invalidate = useInvalidateAll();
  return useMutation<WipBatchView | null, Error, { kind: 'create'; chippingId: string } | { kind: 'adjust'; id: string; qty: number; reason: string } | { kind: 'delete'; id: string }>({
    mutationFn: (a) =>
      a.kind === 'create'
        ? api<WipBatchView>(`${PR}/wip`, { method: 'POST', body: { chippingId: a.chippingId } })
        : a.kind === 'adjust'
          ? api<WipBatchView>(`${PR}/wip/${a.id}/adjust`, { method: 'POST', body: { qty: a.qty, reason: a.reason } })
          : api<void>(`${PR}/wip/${a.id}`, { method: 'DELETE' }).then(() => null),
    onSuccess: invalidate,
  });
}

// ── Dashboard, export, audit ─────────────────────────────────────────

export function useProductionDashboard(range: Range) {
  return useQuery({ queryKey: prKeys.dashboard(range), queryFn: ({ signal }) => api<ProductionDashboard>(`${PR}/dashboard`, { query: range, signal }), placeholderData: keepPreviousData });
}
export type ExportKind = DocKind | 'matt' | 'wip' | 'wip-ledger';
export const exportProduction = (kind: ExportKind, range: Range = {}) => downloadFile(`${PR}/export`, { kind, ...range });

export function useProductionAudit(query: { q?: string; page?: number }) {
  return useQuery({ queryKey: prKeys.audit(query), queryFn: ({ signal }) => api<ListResult<ActivityEntryView>>(`${PR}/audit`, { query, signal }), placeholderData: keepPreviousData });
}
