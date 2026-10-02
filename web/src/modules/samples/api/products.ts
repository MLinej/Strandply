import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ImportReport,
  ListQuery,
  ListResult,
  Product,
  ProductFilters,
  ProductInput,
  ProductSummary,
} from '@contracts/sampletrack';
import { api, downloadFile } from '@/api/client';
import { stKeys } from './keys';

const BASE = '/sampletrack/products';

export type ProductQuery = ListQuery<ProductFilters>;

export function useProducts(query: ProductQuery, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    enabled,
    queryKey: stKeys.products.list(query),
    queryFn: ({ signal }) => api<ListResult<Product>>(BASE, { query, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: stKeys.products.detail(id ?? ''),
    queryFn: ({ signal }) => api<Product>(`${BASE}/${id}`, { signal }),
    enabled: !!id,
  });
}

/** Counts for the header tiles: total, OSB, S-OSB, MDO, others. */
export function useProductSummary() {
  return useQuery({
    queryKey: stKeys.products.summary,
    queryFn: ({ signal }) => api<ProductSummary>(`${BASE}/summary`, { signal }),
  });
}

function useInvalidateProducts() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: stKeys.products.all });
}

/** A taken code fails with ApiError 'code_taken'. Prices are integer paise. */
export function useCreateProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (input: ProductInput) => api<Product>(BASE, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ProductInput> }) =>
      api<Product>(`${BASE}/${id}`, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });
}

/** Fails with ApiError 'in_use' (see inUseOf) while a request line uses the product. */
export function useDeleteProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (id: string) => api<void>(`${BASE}/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

function importForm(file: File) {
  const form = new FormData();
  form.append('file', file);
  return form;
}

/** Dry run: what each row would do. Writes nothing. */
export function usePreviewProductImport() {
  return useMutation({
    mutationFn: (file: File) => api<ImportReport>(`${BASE}/import`, { method: 'POST', form: importForm(file) }),
  });
}

/** Imports the valid rows (the server re-checks the file) and returns the per-row result. */
export function useCommitProductImport() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (file: File) =>
      api<ImportReport>(`${BASE}/import`, { method: 'POST', form: importForm(file), query: { commit: true } }),
    onSuccess: invalidate,
  });
}

export function exportProducts(query: Omit<ProductQuery, 'page' | 'pageSize'> = {}) {
  return downloadFile(`${BASE}/export`, query);
}

export function downloadProductTemplate() {
  return downloadFile(`${BASE}/import-template`);
}
