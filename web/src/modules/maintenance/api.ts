import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivityEntryView } from '@contracts/admin';
import type { ListQuery, ListResult } from '@contracts/common';
import type { MaintenanceDashboard, MaintenanceMeta, MaintenanceReports, MtArea, MtStatus, WorkOrder } from '@contracts/maintenance';
import type { CompanyBlock } from '@contracts/sampletrack';
import { api, downloadFile } from '@/api/client';
import { stKeys } from '../samples/api/keys';

const MT = '/maintenance';

export const mtKeys = {
  all: ['mt'] as const,
  meta: ['mt', 'meta'] as const,
  list: (q: object) => ['mt', 'work-orders', 'list', q] as const,
  one: (id: string) => ['mt', 'work-orders', 'one', id] as const,
  other: (what: string, q: object = {}) => ['mt', what, q] as const,
};

/** Writes refresh the module and the sidebar badges (the overdue count). */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: mtKeys.all });
    void qc.invalidateQueries({ queryKey: stKeys.badges });
  };
}
type Input = Record<string, unknown>;

export function useMaintenanceMeta() {
  return useQuery({ queryKey: mtKeys.meta, queryFn: ({ signal }) => api<MaintenanceMeta>(`${MT}/meta`, { signal }), staleTime: 30_000 });
}

export function useAreas() {
  return useQuery({ queryKey: mtKeys.other('areas'), queryFn: ({ signal }) => api<MtArea[]>(`${MT}/areas`, { signal }) });
}
export function useSaveArea() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string | null; input: Input }) => (id ? api<MtArea>(`${MT}/areas/${id}`, { method: 'PATCH', body: input }) : api<MtArea>(`${MT}/areas`, { method: 'POST', body: input })),
    onSuccess: invalidate,
  });
}
export function useDeleteArea() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${MT}/areas/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export function useWorkOrders(query: ListQuery<object>) {
  return useQuery({ queryKey: mtKeys.list(query), queryFn: ({ signal }) => api<ListResult<WorkOrder>>(`${MT}/work-orders`, { query, signal }), placeholderData: keepPreviousData });
}
export function useWorkOrder(id: string | null | undefined) {
  return useQuery({ queryKey: mtKeys.one(id ?? ''), queryFn: ({ signal }) => api<WorkOrder>(`${MT}/work-orders/${id}`, { signal }), enabled: !!id });
}
export function useSaveWorkOrder() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string | null; input: Input }) => (id ? api<WorkOrder>(`${MT}/work-orders/${id}`, { method: 'PATCH', body: input }) : api<WorkOrder>(`${MT}/work-orders`, { method: 'POST', body: input })),
    onSuccess: invalidate,
  });
}
export function useSetStatus() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: ({ id, status, note }: { id: string; status: MtStatus; note?: string | null }) => api<WorkOrder>(`${MT}/work-orders/${id}/status`, { method: 'POST', body: { status, note } }), onSuccess: invalidate });
}
export function useAddNote() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: ({ id, text }: { id: string; text: string }) => api<WorkOrder>(`${MT}/work-orders/${id}/notes`, { method: 'POST', body: { text } }), onSuccess: invalidate });
}
export function useDeleteWorkOrder() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${MT}/work-orders/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export interface WorkOrderPrint {
  company: CompanyBlock;
  workOrder: WorkOrder;
  generatedAt: string;
}
export const fetchWorkOrderPrint = (id: string) => api<WorkOrderPrint>(`${MT}/work-orders/${id}/print`);

export function useMaintenanceDashboard() {
  return useQuery({ queryKey: mtKeys.other('dashboard'), queryFn: ({ signal }) => api<MaintenanceDashboard>(`${MT}/dashboard`, { signal }) });
}
export type Range = { from?: string; to?: string };
export function useMaintenanceReports(range: Range) {
  return useQuery({ queryKey: mtKeys.other('reports', range), queryFn: ({ signal }) => api<MaintenanceReports>(`${MT}/reports`, { query: range, signal }), placeholderData: keepPreviousData });
}
export const exportWorkOrders = (q: Range = {}) => downloadFile(`${MT}/export/work-orders`, q);
export function useMaintenanceAudit(query: { q?: string; page?: number }) {
  return useQuery({ queryKey: mtKeys.other('audit', query), queryFn: ({ signal }) => api<ListResult<ActivityEntryView>>(`${MT}/audit`, { query, signal }), placeholderData: keepPreviousData });
}
