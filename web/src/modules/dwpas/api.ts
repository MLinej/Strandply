import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivityEntryView } from '@contracts/admin';
import type { ListQuery, ListResult } from '@contracts/common';
import type { DwDepartment, DwEmployee, DwpasMeta, ManpowerRow, PlanView, VarianceReport } from '@contracts/dwpas';
import type { CompanyBlock } from '@contracts/sampletrack';
import { api, ApiError, downloadFile } from '@/api/client';
import { stKeys } from '../samples/api/keys';

const DW = '/dwpas';

export const dwKeys = {
  all: ['dw'] as const,
  meta: ['dw', 'meta'] as const,
  other: (what: string, q: object = {}) => ['dw', what, q] as const,
};

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: dwKeys.all });
    void qc.invalidateQueries({ queryKey: stKeys.badges });
  };
}
type Input = Record<string, unknown>;

export function useDwpasMeta() {
  return useQuery({ queryKey: dwKeys.meta, queryFn: ({ signal }) => api<DwpasMeta>(`${DW}/meta`, { signal }), staleTime: 30_000 });
}

export function useDepartments() {
  return useQuery({ queryKey: dwKeys.other('departments'), queryFn: ({ signal }) => api<DwDepartment[]>(`${DW}/departments`, { signal }) });
}
export function useEmployees() {
  return useQuery({ queryKey: dwKeys.other('employees'), queryFn: ({ signal }) => api<DwEmployee[]>(`${DW}/employees`, { signal }) });
}
export function useSaveMaster(kind: 'departments' | 'employees') {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string | null; input: Input }) => (id ? api(`${DW}/${kind}/${id}`, { method: 'PATCH', body: input }) : api(`${DW}/${kind}`, { method: 'POST', body: input })),
    onSuccess: invalidate,
  });
}
export function useDeleteMaster(kind: 'departments' | 'employees') {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${DW}/${kind}/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export function usePlans(query: ListQuery<object>) {
  return useQuery({ queryKey: dwKeys.other('plans', query), queryFn: ({ signal }) => api<ListResult<PlanView>>(`${DW}/plans`, { query, signal }), placeholderData: keepPreviousData });
}
/** The plan for a date, or null when there is none. */
export function usePlanByDate(date: string | null | undefined) {
  return useQuery({
    queryKey: dwKeys.other('by-date', { date }),
    queryFn: ({ signal }) =>
      api<PlanView>(`${DW}/plans/by-date/${date}`, { signal }).catch((err) => {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }),
    enabled: !!date,
  });
}
export function useSavePlan() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: Input) => api<PlanView>(`${DW}/plans`, { method: 'PUT', body: input }), onSuccess: invalidate });
}
export function usePlanStep() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, step, note }: { id: string; step: 'submit' | 'approve' | 'reopen'; note?: string | null }) => api<PlanView>(`${DW}/plans/${id}/${step}`, { method: 'POST', body: step === 'submit' ? undefined : { note } }),
    onSuccess: invalidate,
  });
}
export function useSaveAchievement() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: ({ id, lines }: { id: string; lines: Input[] }) => api<PlanView>(`${DW}/plans/${id}/achievement`, { method: 'PUT', body: { lines } }), onSuccess: invalidate });
}
export function useDeletePlan() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${DW}/plans/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export interface PlanPrint {
  company: CompanyBlock;
  plan: PlanView;
  generatedAt: string;
}
export const fetchPlanPrint = (id: string, kind: 'plan' | 'achievement' | 'manpower') => api<PlanPrint>(`${DW}/plans/${id}/print`, { query: { kind } });

export function useDay(date?: string) {
  return useQuery({ queryKey: dwKeys.other('day', { date }), queryFn: ({ signal }) => api<{ date: string; plan: PlanView | null }>(`${DW}/dashboard`, { query: { date }, signal }), placeholderData: keepPreviousData });
}
export function useManpower(date?: string) {
  return useQuery({ queryKey: dwKeys.other('manpower', { date }), queryFn: ({ signal }) => api<{ date: string; plan: PlanView | null; rows: ManpowerRow[] }>(`${DW}/manpower`, { query: { date }, signal }), placeholderData: keepPreviousData });
}
export type Range = { from?: string; to?: string; department?: string };
export function useVariance(range: Range) {
  return useQuery({ queryKey: dwKeys.other('variance', range), queryFn: ({ signal }) => api<VarianceReport>(`${DW}/variance`, { query: range, signal }), placeholderData: keepPreviousData });
}
export const exportPlans = (range: Range = {}) => downloadFile(`${DW}/export`, range);
export function useDwpasAudit(query: { q?: string; page?: number }) {
  return useQuery({ queryKey: dwKeys.other('audit', query), queryFn: ({ signal }) => api<ListResult<ActivityEntryView>>(`${DW}/audit`, { query, signal }), placeholderData: keepPreviousData });
}
