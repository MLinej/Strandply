import { Download, PackageSearch, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, DataTable, EmptyState, Input, Pagination, Select, StatusPill, Tabs, useToast, type Column } from '@/components/ui';
import { formatAmount, formatDate } from '@/lib/format';
import { PrimaryScope } from '@/lib/primary-scope';
import { sortRows, type SortState } from '@/lib/sort';
import { GRN_ROWS, VENDORS, type GrnRow } from './fixtures';

const PAGE_SIZE = 8;
type TabValue = 'All' | GrnRow['status'];
const TABS: TabValue[] = ['All', 'Draft', 'Reviewed', 'Approved', 'Accounted', 'Rejected'];

const columns: Column<GrnRow>[] = [
  { id: 'no', header: 'GRN no.', width: '136px', sortValue: (r) => r.no, className: 'font-semibold', cell: (r) => <a href="#grn">{r.no}</a> },
  { id: 'date', header: 'Date', width: '104px', sortValue: (r) => r.date, className: 'text-muted', cell: (r) => formatDate(r.date) },
  { id: 'mrn', header: 'MRN', width: '124px', className: 'text-muted', cell: (r) => r.mrn },
  { id: 'vendor', header: 'Vendor', sortValue: (r) => r.vendor, cell: (r) => r.vendor },
  { id: 'invoice', header: 'Invoice', width: '124px', className: 'text-muted', cell: (r) => r.invoice ?? '—' },
  { id: 'lines', header: 'Lines', width: '56px', align: 'right', cell: (r) => r.lines },
  { id: 'taxable', header: 'Taxable', width: '104px', align: 'right', sortValue: (r) => r.taxable, cell: (r) => formatAmount(r.taxable) },
  { id: 'gst', header: 'GST', width: '92px', align: 'right', className: 'text-muted', cell: (r) => formatAmount(r.gst) },
  { id: 'total', header: 'Total', width: '112px', align: 'right', sortValue: (r) => r.taxable + r.gst, className: 'font-semibold', cell: (r) => formatAmount(r.taxable + r.gst) },
  { id: 'status', header: 'Status', width: '104px', sortValue: (r) => r.status, cell: (r) => <StatusPill status={r.status} /> },
  { id: 'bill', header: 'Bill', width: '112px', className: 'text-muted', cell: (r) => r.bill ?? '—' },
];

/** Allowed moves: the bulk runner checks each GRN on its own and skips the ones that can't move. */
const FROM: Record<'Review' | 'Approve' | 'Account' | 'Reject', GrnRow['status'][]> = {
  Review: ['Draft'],
  Approve: ['Reviewed'],
  Account: ['Approved'],
  Reject: ['Draft', 'Reviewed', 'Approved'],
};
const TO = { Review: 'Reviewed', Approve: 'Approved', Account: 'Accounted', Reject: 'Rejected' } as const;

export function GrnDemo({ loading }: { loading: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState(GRN_ROWS);
  const [tab, setTab] = useState<TabValue>('All');
  const [query, setQuery] = useState('');
  const [vendor, setVendor] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState | null>({ columnId: 'no', direction: 'desc' });

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = rows.filter(
    (r) =>
      (tab === 'All' || r.status === tab) &&
      (!vendor || r.vendor === vendor) &&
      (!query || [r.no, r.mrn, r.invoice ?? '', r.vendor].some((s) => s.toLowerCase().includes(query.toLowerCase()))),
  );
  // Sort the whole result, then page — as the API will. The table only renders the header state (manualSort).
  const sortCol = sort && columns.find((c) => c.id === sort.columnId);
  const sorted = sort && sortCol?.sortValue ? sortRows(filtered, sortCol.sortValue, sort.direction) : filtered;
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function resetPage<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(1);
      setSelected(new Set());
    };
  }

  function run(action: keyof typeof FROM, ids: string[]) {
    const movable = new Set(rows.filter((r) => ids.includes(r.no) && FROM[action].includes(r.status)).map((r) => r.no));
    const skipped = ids.filter((id) => !movable.has(id));
    setRows((rs) => rs.map((r) => (movable.has(r.no) ? { ...r, status: TO[action], bill: action === 'Account' ? 'VB/26-27/0108' : r.bill } : r)));
    setSelected(new Set(skipped));
    toast({
      tone: movable.size === 0 ? 'error' : skipped.length ? 'warning' : 'success',
      title: `${movable.size} GRN${movable.size === 1 ? '' : 's'} ${TO[action].toLowerCase()}`,
      description: skipped.length ? `${skipped.length} skipped: ${skipped.join(', ')}. They stay selected.` : undefined,
    });
  }

  return (
    <PrimaryScope name="grn-screen">
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-h1 font-bold tracking-tight">Goods receipt (GRN)</h3>
            <p className="text-base text-muted">Store count against gate entries — review → approval → accounting</p>
          </div>
          <div className="flex gap-2">
            <Button icon={Download}>Export CSV</Button>
            <Button variant="primary" icon={Plus}>
              New GRN
            </Button>
          </div>
        </div>

        <Tabs
          aria-label="GRN status"
          value={tab}
          onChange={resetPage(setTab)}
          items={TABS.map((t) => ({ value: t, label: t, count: counts[t] ?? 0 }))}
        />

        <div className="flex flex-wrap items-center gap-2.5">
          <Input
            aria-label="Search GRNs"
            icon={Search}
            placeholder="GRN, MRN, invoice or vendor"
            value={query}
            onChange={(e) => resetPage(setQuery)(e.target.value)}
            containerClassName="w-[300px]"
          />
          <Select
            aria-label="Vendor"
            placeholder="All vendors"
            options={VENDORS}
            value={vendor}
            onChange={(e) => resetPage(setVendor)(e.target.value)}
            containerClassName="w-[220px]"
          />
        </div>

        <DataTable
          label="Goods receipts"
          columns={columns}
          rows={pageRows}
          getRowId={(r) => r.no}
          minWidth={1260}
          sort={sort}
          onSortChange={resetPage(setSort)}
          manualSort
          loading={loading}
          selectable
          selectedIds={selected}
          onSelectionChange={setSelected}
          selectionLabel={(n) => `${n} GRN${n === 1 ? '' : 's'} selected`}
          bulkNote="Each GRN is checked on its own; rows that can’t move are skipped and listed"
          bulkActions={(ids) => (
            <>
              <Button size="sm" onClick={() => run('Review', ids)}>
                Review
              </Button>
              <Button size="sm" variant="primary" onClick={() => run('Approve', ids)}>
                Approve
              </Button>
              <Button size="sm" onClick={() => run('Account', ids)}>
                Account
              </Button>
              <Button size="sm" variant="danger-outline" onClick={() => run('Reject', ids)}>
                Reject
              </Button>
            </>
          )}
          empty={
            <EmptyState
              icon={PackageSearch}
              title="No GRNs match these filters"
              description="Try another status tab, or clear the search and vendor filter."
              action={
                <Button
                  onClick={() => {
                    setQuery('');
                    setVendor('');
                    setTab('All');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          }
          footer={filtered.length > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />}
        />
      </div>
    </PrimaryScope>
  );
}
