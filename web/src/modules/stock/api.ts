import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivityEntryView } from '@contracts/admin';
import type { ListQuery, ListResult } from '@contracts/common';
import type { CompanyBlock } from '@contracts/sampletrack';
import type {
  Department,
  Family,
  LedgerLeg,
  LiveStock,
  OpeningView,
  ReclassScenario,
  ReclassView,
  Shift,
  SkuGroup,
  SlipFilters,
  SlipType,
  SlipView,
  StockDashboard,
  StockMeta,
} from '@contracts/stock';
import { api, downloadFile } from '@/api/client';

const SK = '/stock';

export const skKeys = {
  all: ['sk'] as const,
  meta: ['sk', 'meta'] as const,
  balance: (sku: string) => ['sk', 'balance', sku] as const,
  slips: (q: object) => ['sk', 'slips', q] as const,
  slip: (id: string) => ['sk', 'slip', id] as const,
  opening: ['sk', 'opening'] as const,
  reclass: ['sk', 'reclass'] as const,
  live: (q: object) => ['sk', 'live', q] as const,
  skuLedger: (q: object) => ['sk', 'ledger', 'sku', q] as const,
  deptLedger: (q: object) => ['sk', 'ledger', 'dept', q] as const,
  movements: (q: object) => ['sk', 'movements', q] as const,
  dashboard: (q: object) => ['sk', 'dashboard', q] as const,
  audit: (q: object) => ['sk', 'audit', q] as const,
};

/** Any movement changes balances everywhere, so writes refresh the whole module. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: skKeys.all });
}

export type Range = { from?: string; to?: string };
export type Side = { groupId: string; thick: string | null };

// ── Meta and item master ─────────────────────────────────────────────

export function useStockMeta() {
  return useQuery({ queryKey: skKeys.meta, queryFn: ({ signal }) => api<StockMeta>(`${SK}/meta`, { signal }), staleTime: 60_000 });
}

export type GroupInput = Pick<SkuGroup, 'prefix' | 'label' | 'family' | 'dept' | 'size' | 'grade' | 'unit' | 'thicknesses'>;
export function useSaveGroup() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: Partial<GroupInput> }) =>
      id ? api<SkuGroup>(`${SK}/items/${id}`, { method: 'PATCH', body: input }) : api<SkuGroup>(`${SK}/items`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}
export function useDeleteGroup() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${SK}/items/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export function useBalance(sku: string | null) {
  return useQuery({
    queryKey: skKeys.balance(sku ?? ''),
    queryFn: ({ signal }) => api<{ sku: string; qty: number }>(`${SK}/balance`, { query: { sku: sku! }, signal }).then((r) => r.qty),
    enabled: !!sku,
  });
}

// ── Slips ────────────────────────────────────────────────────────────

export type SlipQuery = ListQuery<SlipFilters>;
export function useSlips(query: SlipQuery) {
  return useQuery({ queryKey: skKeys.slips(query), queryFn: ({ signal }) => api<ListResult<SlipView>>(`${SK}/slips`, { query, signal }), placeholderData: keepPreviousData });
}
export function useSlip(id: string | null) {
  return useQuery({ queryKey: skKeys.slip(id ?? ''), queryFn: ({ signal }) => api<SlipView>(`${SK}/slips/${id}`, { signal }), enabled: !!id });
}

export interface SlipInput {
  type: SlipType;
  date?: string;
  from: Side;
  to: Side;
  qty: number;
  batch: string | null;
  refNo: string | null;
  shift: Shift | null;
  remarks: string | null;
}
export function useCreateSlip() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: SlipInput) => api<SlipView>(`${SK}/slips`, { method: 'POST', body: input }), onSuccess: invalidate });
}
export function useDeleteSlip() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${SK}/slips/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export interface SlipPrintPayload {
  company: CompanyBlock;
  slip: SlipView;
  generatedAt: string;
}
export const fetchSlipPrint = (id: string) => api<SlipPrintPayload>(`${SK}/slips/${id}/print`);

// ── Opening and reclass ──────────────────────────────────────────────

export function useOpening() {
  return useQuery({ queryKey: skKeys.opening, queryFn: ({ signal }) => api<OpeningView[]>(`${SK}/opening`, { signal }) });
}
export function useCreateOpening() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: { date?: string; item: Side; qty: number; note: string | null }) => api<OpeningView>(`${SK}/opening`, { method: 'POST', body: input }), onSuccess: invalidate });
}
export function useDeleteOpening() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${SK}/opening/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export function useReclasses() {
  return useQuery({ queryKey: skKeys.reclass, queryFn: ({ signal }) => api<ReclassView[]>(`${SK}/reclass`, { signal }) });
}
export interface ReclassInput {
  date?: string;
  scenario: ReclassScenario;
  from: Side;
  to: Side;
  qty: number;
  reason: string;
  ref: string | null;
}
export function useCreateReclass() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: ReclassInput) => api<ReclassView>(`${SK}/reclass`, { method: 'POST', body: input }), onSuccess: invalidate });
}
export function useDeleteReclass() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${SK}/reclass/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

// ── Live stock, ledgers, dashboard ───────────────────────────────────

export function useLiveStock(query: { family?: Family; dept?: Department; q?: string }) {
  return useQuery({ queryKey: skKeys.live(query), queryFn: ({ signal }) => api<LiveStock>(`${SK}/live`, { query, signal }), placeholderData: keepPreviousData });
}

export interface SkuLedger {
  sku: string | null;
  openingQty: number;
  legs: LedgerLeg[];
  totals: { out: number; in: number; net: number };
  closingQty: number;
}
export function useSkuLedger(query: Range & { sku?: string }) {
  return useQuery({ queryKey: skKeys.skuLedger(query), queryFn: ({ signal }) => api<SkuLedger>(`${SK}/ledger/sku`, { query, signal }), placeholderData: keepPreviousData });
}

export interface DeptLedger {
  depts: { dept: Department; legs: LedgerLeg[]; out: number; in: number; net: number }[];
}
export function useDeptLedger(query: Range & { dept?: Department }) {
  return useQuery({ queryKey: skKeys.deptLedger(query), queryFn: ({ signal }) => api<DeptLedger>(`${SK}/ledger/dept`, { query, signal }), placeholderData: keepPreviousData });
}

export interface MovementRow {
  kind: 'SIS' | 'SRS' | 'STR';
  docId: string;
  docNo: string;
  date: string;
  fromSku: string;
  toSku: string;
  fromDept: Department | null;
  toDept: Department | null;
  label: string | null;
  thick: string | null;
  qty: number;
}
export function useMovements(query: Range) {
  return useQuery({
    queryKey: skKeys.movements(query),
    queryFn: ({ signal }) => api<{ rows: MovementRow[]; totalQty: number }>(`${SK}/movements`, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useStockDashboard(query: Range) {
  return useQuery({ queryKey: skKeys.dashboard(query), queryFn: ({ signal }) => api<StockDashboard>(`${SK}/dashboard`, { query, signal }), placeholderData: keepPreviousData });
}

export type ExportKind = 'slips' | 'stock' | 'sku-ledger' | 'dept-ledger' | 'movements';
export const exportStock = (kind: ExportKind, query: Record<string, string | undefined> = {}) => downloadFile(`${SK}/export`, { kind, ...query });

export function useStockAudit(query: { q?: string; page?: number }) {
  return useQuery({
    queryKey: skKeys.audit(query),
    queryFn: ({ signal }) => api<ListResult<ActivityEntryView>>(`${SK}/audit`, { query, signal }),
    placeholderData: keepPreviousData,
  });
}
