import { Plus, Scale, Search, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { VendorView } from '@contracts/vendors';
import { Button, Card, EmptyState, Input, Skeleton } from '@/components/ui';
import { useDebounced, useUrlState } from '../../samples/ui/list-state';
import { errorMessage } from '../../samples/ui/errors';
import { PageHeader } from '../../samples/ui/PageHeader';
import { useCompareVendors, useVendorOptions } from '../api';
import { CategoryPill, Stars, VendorStatusPill } from '../ui';
import { MAX_COMPARE } from './VendorsPage';

const ROWS: { label: string; cell: (v: VendorView) => ReactNode }[] = [
  { label: 'Code', cell: (v) => v.code },
  { label: 'Type', cell: (v) => v.type ?? '—' },
  { label: 'City / State', cell: (v) => [v.city, v.state].filter(Boolean).join(', ') || '—' },
  { label: 'Categories', cell: (v) => <span className="flex flex-wrap gap-1">{v.categories.map((c) => <CategoryPill key={c.id} name={c.name} color={c.color} />)}</span> },
  { label: 'Status', cell: (v) => <VendorStatusPill status={v.status} /> },
  { label: 'Rating', cell: (v) => <Stars rating={v.rating} /> },
  { label: 'Payment terms', cell: (v) => v.paymentTerms ?? '—' },
  { label: 'GSTIN', cell: (v) => (v.gst ? <span className="font-mono text-sm">{v.gst}</span> : '—') },
  { label: 'MSME', cell: (v) => v.msme ?? '—' },
  { label: 'Contact', cell: (v) => [v.contact, v.phone].filter(Boolean).join(' · ') || '—' },
  { label: 'Products', cell: (v) => (v.products.length ? v.products.map((p) => p.name).join(', ') : '—') },
];

/** Picks a vendor to add to the comparison. */
function AddVendor({ exclude, onAdd }: { exclude: string[]; onAdd: (id: string) => void }) {
  const [q, setQ] = useState('');
  const options = (useVendorOptions(useDebounced(q.trim())).data ?? []).filter((o) => !exclude.includes(o.id));
  return (
    <div className="flex flex-col gap-2">
      <Input aria-label="Find a vendor to add" icon={Search} placeholder="Find a vendor to add…" value={q} onChange={(e) => setQ(e.target.value)} containerClassName="w-[320px]" />
      {q.trim() && (
        <ul className="max-h-56 w-[320px] overflow-y-auto rounded border border-border bg-card" aria-label="Matching vendors">
          {options.length === 0 && <li className="px-3 py-2 text-sm text-muted">No vendors match.</li>}
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-page"
                onClick={() => {
                  onAdd(o.id);
                  setQ('');
                }}
              >
                <Plus size={14} strokeWidth={2} className="text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{o.name}</span>
                <span className="shrink-0 text-caption text-faint">{o.city ?? o.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Side-by-side comparison of 2–4 vendors (legacy runCmp). The ids live in the URL so a comparison can be shared. */
export function ComparePage() {
  const url = useUrlState(['ids'] as const);
  const ids = url.values.ids ? [...new Set(url.values.ids.split(',').filter(Boolean))].slice(0, MAX_COMPARE) : [];
  const setIds = (next: string[]) => url.set({ ids: next.length ? next.join(',') : null });
  const vendors = useCompareVendors(ids);
  const rows = vendors.data ?? [];
  const best = Math.max(0, ...rows.map((v) => v.rating ?? 0));

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Compare vendors"
        description={`Up to ${MAX_COMPARE} vendors side by side. Tick vendors in the list and press Compare, or add them here.`}
        actions={
          ids.length > 0 && (
            <Button variant="ghost" onClick={() => setIds([])}>
              Clear
            </Button>
          )
        }
      />
      {ids.length < MAX_COMPARE && <AddVendor exclude={ids} onAdd={(id) => setIds([...ids, id])} />}

      {ids.length < 2 ? (
        <Card>
          <EmptyState
            icon={Scale}
            title={ids.length ? 'Add one more vendor' : 'No comparison yet'}
            description={
              <>
                Add vendors above, or go to <Link to="/vendors/directory" className="font-semibold text-ink underline underline-offset-2">Vendors</Link>, tick 2 to {MAX_COMPARE} and press Compare.
              </>
            }
          />
        </Card>
      ) : vendors.isError ? (
        <Card>
          <EmptyState icon={Scale} title="Couldn’t load the vendors" description={errorMessage(vendors.error)} />
        </Card>
      ) : !vendors.data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] table-fixed text-base">
              <colgroup>
                <col className="w-[150px]" />
                {rows.map((v) => (
                  <col key={v.id} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-divider bg-page">
                  <th className="px-4 py-3" />
                  {rows.map((v) => (
                    <th key={v.id} scope="col" className="px-4 py-3 text-left align-top">
                      <span className="flex items-start justify-between gap-2">
                        <Link to={`/vendors/directory?open=${v.id}`} className="font-semibold text-primary hover:underline">
                          {v.name}
                        </Link>
                        <button type="button" aria-label={`Remove ${v.name}`} onClick={() => setIds(ids.filter((id) => id !== v.id))} className="rounded p-0.5 text-faint hover:bg-border hover:text-ink">
                          <X size={14} strokeWidth={2} aria-hidden />
                        </button>
                      </span>
                      {v.rating && v.rating === best && rows.length > 1 && <span className="text-caption font-normal text-green">Best rated</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.label} className="border-b border-divider last:border-0">
                    <th scope="row" className="bg-page/60 px-4 py-2.5 text-left align-top text-label font-semibold uppercase tracking-label text-muted">
                      {r.label}
                    </th>
                    {rows.map((v) => (
                      <td key={v.id} className="break-words px-4 py-2.5 align-top">
                        {r.cell(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
