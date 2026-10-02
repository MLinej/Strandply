import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListQuery, ListResult } from '@contracts/common';
import type { CompanyBlock } from '@contracts/sampletrack';
import type {
  PincodeMatch,
  ProductSourceRow,
  ProductSourceSort,
  TncClause,
  TncFilters,
  TncInput,
  TncStats,
  VendorAction,
  VendorCategory,
  VendorCategoryInput,
  VendorCategoryView,
  VendorCreateStatus,
  VendorEmailSettings,
  VendorFilters,
  VendorImportKind,
  VendorImportReport,
  VendorInput,
  VendorOption,
  VendorProductFilters,
  VendorProductInput,
  VendorProductSummary,
  VendorProductView,
  VendorReport,
  VendorStats,
  VendorStatus,
  VendorView,
} from '@contracts/vendors';
import { api, downloadFile, isApiError } from '@/api/client';

const VN = '/vendors';

/** TanStack Query keys for the Vendors module. Writes invalidate the `vn` prefix they touch. */
export const vnKeys = {
  all: ['vn'] as const,
  vendors: ['vn', 'vendors'] as const,
  list: (q: object) => ['vn', 'vendors', 'list', q] as const,
  detail: (id: string) => ['vn', 'vendors', 'detail', id] as const,
  stats: ['vn', 'vendors', 'stats'] as const,
  options: (q: string, status: string) => ['vn', 'vendors', 'options', q, status] as const,
  compare: (ids: string[]) => ['vn', 'vendors', 'compare', ids] as const,
  byProduct: (q: object) => ['vn', 'vendors', 'by-product', q] as const,
  report: ['vn', 'vendors', 'report'] as const,
  categories: ['vn', 'categories'] as const,
  products: ['vn', 'products'] as const,
  productList: (q: object) => ['vn', 'products', 'list', q] as const,
  productAll: ['vn', 'products', 'all'] as const,
  productSummary: ['vn', 'products', 'summary'] as const,
  tnc: ['vn', 'tnc'] as const,
  tncList: (q: object) => ['vn', 'tnc', 'list', q] as const,
  tncStats: ['vn', 'tnc', 'stats'] as const,
  email: ['vn', 'settings', 'email'] as const,
};

function useInvalidate(...keys: (readonly unknown[])[]) {
  const qc = useQueryClient();
  return () => {
    for (const k of keys) void qc.invalidateQueries({ queryKey: k });
  };
}

// ── Vendors ──────────────────────────────────────────────────────────

export type VendorQuery = ListQuery<VendorFilters>;

export function useVendors(query: VendorQuery) {
  return useQuery({
    queryKey: vnKeys.list(query),
    queryFn: ({ signal }) => api<ListResult<VendorView>>(VN, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useVendor(id: string | undefined) {
  return useQuery({
    queryKey: vnKeys.detail(id ?? ''),
    queryFn: ({ signal }) => api<VendorView>(`${VN}/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useVendorStats() {
  return useQuery({ queryKey: vnKeys.stats, queryFn: ({ signal }) => api<VendorStats>(`${VN}/stats`, { signal }) });
}

export function useVendorOptions(q: string, statuses: VendorStatus[] = []) {
  const status = statuses.join(',');
  return useQuery({
    queryKey: vnKeys.options(q, status),
    queryFn: ({ signal }) => api<VendorOption[]>(`${VN}/options`, { query: { q, status }, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useCompareVendors(ids: string[]) {
  return useQuery({
    queryKey: vnKeys.compare(ids),
    queryFn: ({ signal }) => api<VendorView[]>(`${VN}/compare`, { query: { ids: ids.join(',') }, signal }),
    enabled: ids.length >= 2,
  });
}

export function useVendorsByProduct(query: { q?: string; categoryId?: string; sort?: ProductSourceSort }) {
  return useQuery({
    queryKey: vnKeys.byProduct(query),
    queryFn: ({ signal }) => api<ProductSourceRow[]>(`${VN}/by-product`, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useVendorReport() {
  return useQuery({ queryKey: vnKeys.report, queryFn: ({ signal }) => api<VendorReport>(`${VN}/reports`, { signal }) });
}

/** A similar name already exists: details list them; resend with force to save anyway. */
export interface DuplicateVendorDetails {
  similar: { id: string; code: string; name: string; city: string | null; status: VendorStatus }[];
}
export const duplicateVendorOf = (err: unknown) => (isApiError(err, 'possible_duplicate') ? (err.details as DuplicateVendorDetails) : null);

/** Sidebar badge (pending vendors) lives under the SampleTrack badges key. */
const BADGES = ['st', 'notifications', 'badges'] as const;
const invalidatesVendors = [vnKeys.vendors, vnKeys.categories, vnKeys.products, BADGES] as const;

export function useSaveVendor() {
  const invalidate = useInvalidate(...invalidatesVendors);
  return useMutation({
    mutationFn: ({ id, input, status, force }: { id?: string; input: VendorInput; status?: VendorCreateStatus; force?: boolean }) =>
      id
        ? api<VendorView>(`${VN}/${id}`, { method: 'PATCH', body: input, query: { force: force || undefined } })
        : api<VendorView>(VN, { method: 'POST', body: { ...input, status }, query: { force: force || undefined } }),
    onSuccess: invalidate,
  });
}

/** submit (edit) · approve, activate, blacklist (reason), reinstate (vendor_approve). Wrong status → ApiError 'invalid_transition'. */
export function useVendorAction() {
  const invalidate = useInvalidate(vnKeys.vendors, BADGES);
  return useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: VendorAction; reason?: string }) =>
      api<VendorView>(`${VN}/${id}/${action}`, { method: 'POST', body: action === 'blacklist' ? { reason } : undefined }),
    onSuccess: invalidate,
  });
}

export function useDeleteVendor() {
  const invalidate = useInvalidate(...invalidatesVendors);
  return useMutation({ mutationFn: (id: string) => api<void>(`${VN}/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export function exportVendors(query: Omit<VendorQuery, 'page' | 'pageSize'>, format: 'xlsx' | 'csv') {
  return downloadFile(`${VN}/export`, { ...query, filters: { ...query.filters, format } } as VendorQuery);
}

export function exportVendorReport(format: 'xlsx' | 'csv') {
  return downloadFile(`${VN}/reports/export`, { format });
}

export interface VendorPrintPayload {
  company: CompanyBlock;
  generatedAt: string;
  vendors: VendorView[];
}

export const fetchVendorPrint = (id?: string, query?: Omit<VendorQuery, 'page' | 'pageSize'>) =>
  api<VendorPrintPayload>(id ? `${VN}/${id}/print` : `${VN}/print`, { query });

export const lookupPincode = (pincode: string) => api<PincodeMatch>(`/sampletrack/cities/pincode/${pincode}`);

// ── Categories ───────────────────────────────────────────────────────

export function useVendorCategories() {
  return useQuery({ queryKey: vnKeys.categories, queryFn: ({ signal }) => api<VendorCategoryView[]>(`${VN}/categories`, { signal }) });
}

export function useSaveCategory() {
  const invalidate = useInvalidate(vnKeys.categories, vnKeys.products, vnKeys.vendors);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: VendorCategoryInput }) =>
      id
        ? api<VendorCategory>(`${VN}/categories/${id}`, { method: 'PATCH', body: input })
        : api<VendorCategory>(`${VN}/categories`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidate(vnKeys.categories);
  return useMutation({ mutationFn: (id: string) => api<void>(`${VN}/categories/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export const exportCategories = () => downloadFile(`${VN}/categories/export`);

// ── Products ─────────────────────────────────────────────────────────

export function useVendorProducts(query: ListQuery<VendorProductFilters>) {
  return useQuery({
    queryKey: vnKeys.productList(query),
    queryFn: ({ signal }) => api<ListResult<VendorProductView>>(`${VN}/products`, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

/** Every product, for pickers. */
export function useAllVendorProducts({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: vnKeys.productAll, queryFn: ({ signal }) => api<VendorProductView[]>(`${VN}/products/all`, { signal }), enabled });
}

export function useVendorProductSummary() {
  return useQuery({ queryKey: vnKeys.productSummary, queryFn: ({ signal }) => api<VendorProductSummary>(`${VN}/products/summary`, { signal }) });
}

export function useSaveVendorProduct() {
  const invalidate = useInvalidate(vnKeys.products, vnKeys.categories);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: VendorProductInput }) =>
      id
        ? api<VendorProductView>(`${VN}/products/${id}`, { method: 'PATCH', body: input })
        : api<VendorProductView>(`${VN}/products`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteVendorProduct() {
  const invalidate = useInvalidate(vnKeys.products, vnKeys.categories);
  return useMutation({ mutationFn: (id: string) => api<void>(`${VN}/products/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

export const exportVendorProducts = (query: Omit<ListQuery<VendorProductFilters>, 'page' | 'pageSize'>) => downloadFile(`${VN}/products/export`, query);

// ── T&C ──────────────────────────────────────────────────────────────

export function useTnc(query: ListQuery<TncFilters>) {
  return useQuery({
    queryKey: vnKeys.tncList(query),
    queryFn: ({ signal }) => api<ListResult<TncClause>>(`${VN}/tnc`, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useTncStats() {
  return useQuery({ queryKey: vnKeys.tncStats, queryFn: ({ signal }) => api<TncStats>(`${VN}/tnc/stats`, { signal }) });
}

export function useSaveTnc() {
  const invalidate = useInvalidate(vnKeys.tnc);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: TncInput }) =>
      id ? api<TncClause>(`${VN}/tnc/${id}`, { method: 'PATCH', body: input }) : api<TncClause>(`${VN}/tnc`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteTnc() {
  const invalidate = useInvalidate(vnKeys.tnc);
  return useMutation({ mutationFn: (id: string) => api<void>(`${VN}/tnc/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

// ── Settings and import ──────────────────────────────────────────────

export function useVendorEmailSettings() {
  return useQuery({ queryKey: vnKeys.email, queryFn: ({ signal }) => api<VendorEmailSettings>(`${VN}/settings/email`, { signal }) });
}

export function useSaveVendorEmailSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<VendorEmailSettings>) => api<VendorEmailSettings>(`${VN}/settings/email`, { method: 'PUT', body: input }),
    onSuccess: (data) => qc.setQueryData(vnKeys.email, data),
  });
}

/** Preview (commit=false) writes nothing; commit adds the valid rows and refreshes everything. */
export function useVendorImport() {
  const invalidate = useInvalidate(vnKeys.all, ['st', 'geo']);
  return useMutation({
    mutationFn: ({ kind, file, commit }: { kind: VendorImportKind; file: File; commit: boolean }) => {
      const form = new FormData();
      form.append('file', file);
      return api<VendorImportReport>(`${VN}/import/${kind}`, { method: 'POST', form, query: { commit: commit || undefined } });
    },
    onSuccess: (r) => {
      if (r.mode === 'commit') invalidate();
    },
  });
}

export const downloadImportTemplate = (kind: VendorImportKind) => downloadFile(`${VN}/import/${kind}/template`);
