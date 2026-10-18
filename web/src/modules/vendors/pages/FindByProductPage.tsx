import { PackageSearch, Search } from 'lucide-react';
import { Link } from 'react-router';
import type { ProductSourceRow, ProductSourceSort } from '@contracts/vendors';
import { DataTable, EmptyState, Input, Select, type Column } from '@/components/ui';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { useVendorCategories, useVendorsByProduct } from '../api';
import { Stars, VendorStatusPill } from '../ui';

type VendorRow = ProductSourceRow['vendor'];

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
  // One row per vendor: the products matched only decide who is listed (in the API's sort order).
  const rows = [...new Map((res.data ?? []).map((r) => [r.vendor.id, r.vendor] as const)).values()];

  const columns: Column<VendorRow>[] = [
    {
      id: 'vendor',
      header: 'Vendor name',
      cell: (v) => (
        <span className="flex flex-col leading-tight">
          <Link to={`/vendors/directory?open=${v.id}`} className="font-semibold text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
            {v.name}
          </Link>
          <span className="text-caption text-faint">{v.code}</span>
        </span>
      ),
    },
    { id: 'city', header: 'City', width: '160px', cell: (v) => v.city ?? '—' },
    { id: 'state', header: 'State', width: '160px', cell: (v) => v.state ?? '—' },
    {
      id: 'phone',
      header: 'Mobile number',
      width: '160px',
      className: 'tabular-nums',
      cell: (v) =>
        v.phone ? (
          <a href={`tel:${v.phone}`} className="text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
            {v.phone}
          </a>
        ) : (
          '—'
        ),
    },
    { id: 'rating', header: 'Rating', width: '130px', cell: (v) => <Stars rating={v.rating} /> },
    { id: 'status', header: 'Status', width: '110px', cell: (v) => <VendorStatusPill status={v.status} /> },
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
            {rows.length} vendor{rows.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <DataTable
        label="Vendors by product"
        columns={columns}
        rows={rows}
        getRowId={(v) => v.id}
        minWidth={820}
        loading={res.isLoading}
        empty={<EmptyState icon={PackageSearch} title="No vendors found" description="Try a different product or category." />}
      />
    </div>
  );
}
