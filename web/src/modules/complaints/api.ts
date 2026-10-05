import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivityEntryView } from '@contracts/admin';
import type { ListQuery, ListResult } from '@contracts/common';
import type { ComplaintsDashboard, ComplaintsMeta, ComplaintsReports, ComplaintView, CpRecipient, CpStatus } from '@contracts/complaints';
import type { CompanyBlock } from '@contracts/sampletrack';
import { api, downloadFile } from '@/api/client';
import { stKeys } from '../samples/api/keys';

const CP = '/complaints';

export const cpKeys = {
  all: ['cp'] as const,
  meta: ['cp', 'meta'] as const,
  list: (q: object) => ['cp', 'list', q] as const,
  one: (id: string) => ['cp', 'one', id] as const,
  other: (what: string, q: object = {}) => ['cp', what, q] as const,
};

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: cpKeys.all });
    void qc.invalidateQueries({ queryKey: stKeys.badges });
  };
}
type Input = Record<string, unknown>;
const formOf = (files: File[], text?: string) => {
  const f = new FormData();
  for (const file of files) f.append('file', file);
  if (text !== undefined) f.append('text', text);
  return f;
};

export function useComplaintsMeta() {
  return useQuery({ queryKey: cpKeys.meta, queryFn: ({ signal }) => api<ComplaintsMeta>(`${CP}/meta`, { signal }), staleTime: 30_000 });
}

export function usePartyInvoices(customerId: string | null) {
  return useQuery({ queryKey: cpKeys.other('party-invoices', { customerId }), queryFn: ({ signal }) => api<{ id: string; invNo: string; date: string; totalPaise: number }[]>(`${CP}/party-invoices`, { query: { customerId: customerId! }, signal }), enabled: !!customerId });
}

export function useRecipients() {
  return useQuery({ queryKey: cpKeys.other('recipients'), queryFn: ({ signal }) => api<CpRecipient[]>(`${CP}/recipients`, { signal }) });
}
export function useSaveRecipient() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string | null; input: Input }) => (id ? api<CpRecipient>(`${CP}/recipients/${id}`, { method: 'PATCH', body: input }) : api<CpRecipient>(`${CP}/recipients`, { method: 'POST', body: input })),
    onSuccess: invalidate,
  });
}
export function useDeleteRecipient() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${CP}/recipients/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export function useComplaints(query: ListQuery<object>) {
  return useQuery({ queryKey: cpKeys.list(query), queryFn: ({ signal }) => api<ListResult<ComplaintView>>(`${CP}/complaints`, { query, signal }), placeholderData: keepPreviousData });
}
export function useComplaint(id: string | null | undefined) {
  return useQuery({ queryKey: cpKeys.one(id ?? ''), queryFn: ({ signal }) => api<ComplaintView>(`${CP}/complaints/${id}`, { signal }), enabled: !!id });
}
export function useSaveComplaint() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string | null; input: Input }) => (id ? api<ComplaintView>(`${CP}/complaints/${id}`, { method: 'PATCH', body: input }) : api<ComplaintView>(`${CP}/complaints`, { method: 'POST', body: input })),
    onSuccess: invalidate,
  });
}
export function useSetStatus() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: ({ id, status, note }: { id: string; status: CpStatus; note?: string | null }) => api<ComplaintView>(`${CP}/complaints/${id}/status`, { method: 'POST', body: { status, note } }), onSuccess: invalidate });
}
export function useAddPhotos() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: ({ id, files }: { id: string; files: File[] }) => api<ComplaintView>(`${CP}/complaints/${id}/photos`, { method: 'POST', form: formOf(files) }), onSuccess: invalidate });
}
export function useRemovePhoto() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: ({ id, fileId }: { id: string; fileId: string }) => api<ComplaintView>(`${CP}/complaints/${id}/photos/${fileId}`, { method: 'DELETE' }), onSuccess: invalidate });
}
export function useComment() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: ({ id, text, files }: { id: string; text: string; files: File[] }) => api<ComplaintView>(`${CP}/complaints/${id}/comments`, { method: 'POST', form: formOf(files, text) }), onSuccess: invalidate });
}
export function useDeleteComplaint() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api<void>(`${CP}/complaints/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}
export const fileUrl = (complaintId: string, fileId: string) => `/api${CP}/complaints/${complaintId}/files/${fileId}`;

export interface ComplaintPrint {
  company: CompanyBlock;
  complaint: ComplaintView;
  generatedAt: string;
}
export const fetchComplaintPrint = (id: string) => api<ComplaintPrint>(`${CP}/complaints/${id}/print`);

export function useComplaintsDashboard() {
  return useQuery({ queryKey: cpKeys.other('dashboard'), queryFn: ({ signal }) => api<ComplaintsDashboard>(`${CP}/dashboard`, { signal }) });
}
export type ReportQuery = { from?: string; to?: string; fy?: string };
export function useComplaintsReports(q: ReportQuery) {
  return useQuery({ queryKey: cpKeys.other('reports', q), queryFn: ({ signal }) => api<ComplaintsReports>(`${CP}/reports`, { query: q, signal }), placeholderData: keepPreviousData });
}
export const exportComplaints = (q: ReportQuery = {}) => downloadFile(`${CP}/export`, q);
export function useComplaintsAudit(query: { q?: string; page?: number }) {
  return useQuery({ queryKey: cpKeys.other('audit', query), queryFn: ({ signal }) => api<ListResult<ActivityEntryView>>(`${CP}/audit`, { query, signal }), placeholderData: keepPreviousData });
}
