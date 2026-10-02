import { PackageSearch, Search } from 'lucide-react';
import { Link } from 'react-router';
import type { ProductSourceRow, ProductSourceSort } from '@contracts/vendors';
import { DataTable, EmptyState, Input, Select, type Column } from '@/components/ui';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { useVendorCategories, useVendorsByProduct } from '../api';
import { Stars, VendorStatusPill } from '../ui';

const SORTS: { value: ProductSourceSort; label: string }[] = [
  { value: 'rating', label: 'Best rated' },
  { value: 'lead', label: 'Shortest lead time' },
];

/** Which approved or active vendors supply a material (legacy renderProc). */
export function FindByProductPage() {
  const url = useUrlState(['categoryId', 'by'] as const);
  const [search, setSearch] = useSearchParam(url);
  const categories = useVendorCategories().data ?? [];
  const sort: ProductSourceSort = url.values.by === 'lead' ? 'lead' : 'rating';
  const res = useVendorsByProduct({ q: url.q || undefined, categoryId: url.values.categoryId || undefined, sort });
  const rows = res.data ?? [];

  const columns: Column<ProductSourceRow>[] = [
    {
      id: 'product',
      header: 'Product',
      cell: (r) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold">{r.productName}</span>
          <span className="text-caption text-faint">
            {r.categoryName} · per {r.unit}
          </span>
        </span>
      ),
    },
    {
      id: 'vendor',
      header: 'Vendor',
      width: '260px',
      cell: (r) => (
        <span className="flex flex-col leading-tight">
          <Link to={`/vendors/directory?open=${r.vendor.id}`} className="font-medium text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
            {r.vendor.name}
          </Link>
          <span className="text-caption text-faint">{[r.vendor.city, r.vendor.state].filter(Boolean).join(', ') || r.vendor.code}</span>
        </span>
      ),
    },
    { id: 'lead', header: 'Lead time', width: '110px', align: 'right', className: 'tabular-nums', cell: (r) => (r.leadTimeDays === null ? '—' : `${r.leadTimeDays} day${r.leadTimeDays === 1 ? '' : 's'}`) },
    { id: 'rating', header: 'Rating', width: '130px', cell: (r) => <Stars rating={r.vendor.rating} /> },
    { id: 'status', header: 'Status', width: '110px', cell: (r) => <VendorStatusPill status={r.vendor.status} /> },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Find vendors by product" description="Approved and active vendors for a material. Pending and blacklisted vendors are left out." />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Product or vendor" icon={Search} placeholder="e.g. MDI Resin, strands…" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[300px]" />
        <Select aria-label="Category" placeholder="All categories" options={categories.map((c) => ({ value: c.id, label: c.name }))} value={url.values.categoryId} onChange={(e) => url.set({ categoryId: e.target.value })} containerClassName="w-[210px]" />
        <Select aria-label="Sort" options={SORTS} value={sort} onChange={(e) => url.set({ by: e.target.value === 'rating' ? null : e.target.value })} containerClassName="w-[190px]" />
        {res.data && (
          <span className="text-sm text-muted">
            {rows.length} match{rows.length === 1 ? '' : 'es'}
          </span>
        )}
      </div>
      <DataTable
        label="Vendors by product"
        columns={columns}
        rows={rows}
        getRowId={(r) => `${r.productId}|${r.vendor.id}`}
        minWidth={820}
        loading={res.isLoading}
        empty={<EmptyState icon={PackageSearch} title="No vendors found" description="Try a different product or category." />}
      />
    </div>
  );
}
