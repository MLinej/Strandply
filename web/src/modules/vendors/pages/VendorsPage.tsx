import { Ban, CheckCircle2, Download, Eye, Factory, Pencil, Plus, Power, Printer, RotateCcw, Scale, Search, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { VENDOR_STATUSES, type VendorAction, type VendorFilters, type VendorStatus, type VendorView } from '@contracts/vendors';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, MenuItem, MenuSeparator, Pagination, Popover, Select, Tabs, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useStates } from '../../samples/api';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { sortMapping } from '../../samples/ui/table-sort';
import { exportVendors, useDeleteVendor, useVendor, useVendorAction, useVendorCategories, useVendors, useVendorStats } from '../api';
import { BlacklistDialog, VendorDetail } from '../components/VendorDetail';
import { VendorForm } from '../components/VendorForm';
import { printVendors } from '../print';
import { CategoryPill, STATUS_LABEL, STEP_DONE, STEP_LABEL, Stars, stepsFor, VendorStatusPill } from '../ui';

const PAGE_SIZE = 10;
const SORT = sortMapping({ name: 'name', city: 'city', rating: 'rating', created: 'createdAt' });
const SORT_OPTIONS = [
  { value: 'name', label: 'Name A–Z' },
  { value: '-createdAt', label: 'Recently added' },
  { value: '-rating', label: 'Top rated' },
];
const STEP_ICON = { submit: Send, approve: CheckCircle2, activate: Power, blacklist: Ban, reinstate: RotateCcw } as const;
export const MAX_COMPARE = 4;

/**
 * Vendor directory (legacy All Vendors / Pending Review / Approved / Active / Blacklisted sections, and the
 * category shortcuts): one list with status tabs, filters, compare selection, workflow and print.
 */
export function VendorsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { canDo } = useSession();
  const url = useUrlState(['status', 'categoryId', 'state'] as const);
  const [search, setSearch] = useSearchParam(url);
  const status = (VENDOR_STATUSES as readonly string[]).includes(url.values.status) ? (url.values.status as VendorStatus) : undefined;
  const filters: Partial<VendorFilters> = { status, categoryId: url.values.categoryId || undefined, state: url.values.state || undefined };
  const query = { q: url.q || undefined, sort: url.sort || undefined, page: url.page, pageSize: PAGE_SIZE, filters };
  const list = useVendors(query);
  const stats = useVendorStats().data;
  const categories = useVendorCategories().data ?? [];
  const states = useStates().data ?? [];
  const opened = useVendor(url.open ?? undefined);
  const act = useVendorAction();
  const remove = useDeleteVendor();
  const [form, setForm] = useState<VendorView | 'new' | null>(null);
  const [blacklisting, setBlacklisting] = useState<VendorView | null>(null);
  const [toDelete, setToDelete] = useState<VendorView | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const canEdit = canDo('edit');

  const guard = (title: string, fn: () => Promise<unknown>) => fn().catch((err) => toast({ tone: 'error', title, description: errorMessage(err) }));

  async function step(v: VendorView, a: VendorAction) {
    if (a === 'blacklist') return setBlacklisting(v);
    try {
      await act.mutateAsync({ id: v.id, action: a });
      toast({ tone: 'success', title: `${v.name} ${STEP_DONE[a]}` });
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t ${STEP_LABEL[a].toLowerCase()}`, description: errorMessage(err) });
    }
  }

  async function onDelete() {
    if (!toDelete) return;
    try {
      await remove.mutateAsync(toDelete.id);
      toast({ tone: 'success', title: `${toDelete.name} deleted` });
      if (url.open === toDelete.id) url.set({ open: null });
      setSelected((s) => new Set([...s].filter((id) => id !== toDelete.id)));
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t delete', description: errorMessage(err) });
    }
    setToDelete(null);
  }

  function onSelection(ids: Set<string>) {
    if (ids.size > MAX_COMPARE) {
      toast({ tone: 'warning', title: `Compare up to ${MAX_COMPARE} vendors at a time` });
      setSelected(new Set([...ids].slice(0, MAX_COMPARE)));
      return;
    }
    setSelected(ids);
  }

  const columns: Column<VendorView>[] = [
    {
      id: 'name',
      header: 'Vendor',
      sortValue: (v) => v.name,
      cell: (v) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold">{v.name}</span>
          <span className="text-caption text-faint">{v.code}</span>
        </span>
      ),
    },
    {
      id: 'categories',
      header: 'Categories',
      width: '220px',
      cell: (v) => (
        <span className="flex flex-wrap items-center gap-1">
          {v.categories.slice(0, 2).map((c) => (
            <CategoryPill key={c.id} name={c.name} color={c.color} />
          ))}
          {v.categories.length > 2 && <span className="text-caption text-faint">+{v.categories.length - 2}</span>}
        </span>
      ),
    },
    {
      id: 'city',
      header: 'City',
      width: '150px',
      sortValue: (v) => v.city,
      cell: (v) => (
        <span className="flex flex-col leading-tight">
          <span>{v.city ?? '—'}</span>
          {v.state && <span className="text-caption text-faint">{v.state}</span>}
        </span>
      ),
    },
    {
      id: 'contact',
      header: 'Contact',
      width: '150px',
      cell: (v) => (
        <span className="flex flex-col leading-tight">
          <span>{v.contact ?? '—'}</span>
          {v.phone && <span className="text-caption text-faint">{v.phone}</span>}
        </span>
      ),
    },
    { id: 'rating', header: 'Rating', width: '120px', sortValue: (v) => v.rating, cell: (v) => <Stars rating={v.rating} /> },
    {
      id: 'status',
      header: 'Status',
      width: '150px',
      cell: (v) => (
        <span className="flex flex-col items-start leading-tight">
          <VendorStatusPill status={v.status} />
          {v.status === 'blacklisted' && v.blacklistReason && (
            <span className="mt-0.5 max-w-[140px] truncate text-caption text-primary" title={v.blacklistReason}>
              {v.blacklistReason}
            </span>
          )}
          {v.status === 'pending' && <span className="mt-0.5 text-caption text-faint">since {formatDate((v.submittedAt ?? v.createdAt).slice(0, 10))}</span>}
        </span>
      ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (v) => {
        const steps = stepsFor(v.status, { edit: canEdit, approval: canDo('vendor_approve') });
        return (
          <RowMenu label={`Actions for ${v.name}`}>
            {(close) => (
              <>
                <MenuItem icon={Eye} onClick={runAndClose(close, () => url.set({ open: v.id, page: url.page }))}>
                  View
                </MenuItem>
                {canEdit && (
                  <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(v))}>
                    Edit
                  </MenuItem>
                )}
                {canDo('print') && (
                  <MenuItem icon={Printer} onClick={runAndClose(close, () => void guard('Couldn’t print', () => printVendors({ id: v.id })))}>
                    Print card
                  </MenuItem>
                )}
                {steps.length > 0 && <MenuSeparator />}
                {steps.map((a) => (
                  <MenuItem key={a} icon={STEP_ICON[a]} className={a === 'blacklist' ? 'text-primary' : undefined} onClick={runAndClose(close, () => void step(v, a))}>
                    {STEP_LABEL[a]}
                  </MenuItem>
                ))}
                {canDo('delete') && (
                  <>
                    <MenuSeparator />
                    <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(v))}>
                      Delete
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </RowMenu>
        );
      },
    },
  ];

  const filtered = !!(url.q || url.values.categoryId || url.values.state);
  const exportQuery = { q: query.q, sort: query.sort, filters };

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Vendors"
        description="All registered suppliers, from review to approval to live."
        actions={
          <>
            {canDo('export') && (
              <Popover
                aria-label="Export"
                widthClass="w-48"
                trigger={(props) => (
                  <Button {...props} icon={Download}>
                    Export
                  </Button>
                )}
              >
                {(close) => (
                  <>
                    <MenuItem onClick={runAndClose(close, () => void guard('Export failed', () => exportVendors(exportQuery, 'xlsx')))}>Excel (.xlsx)</MenuItem>
                    <MenuItem onClick={runAndClose(close, () => void guard('Export failed', () => exportVendors(exportQuery, 'csv')))}>CSV</MenuItem>
                  </>
                )}
              </Popover>
            )}
            {canDo('print') && (
              <Button icon={Printer} onClick={() => void guard('Couldn’t print', () => printVendors({ query: exportQuery }))}>
                Print list
              </Button>
            )}
            {canEdit && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                Add vendor
              </Button>
            )}
          </>
        }
      />

      <Tabs
        aria-label="Vendor status"
        value={status ?? 'all'}
        onChange={(v) => url.set({ status: v === 'all' ? null : v })}
        items={[
          { value: 'all', label: 'All', count: stats?.total },
          ...VENDOR_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], count: stats?.[s] })),
        ]}
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search vendors" icon={Search} placeholder="Name, code, city, GST, contact or phone" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[320px]" />
        <Select aria-label="Category" placeholder="All categories" options={categories.map((c) => ({ value: c.id, label: `${c.icon ?? ''} ${c.name}`.trim() }))} value={url.values.categoryId} onChange={(e) => url.set({ categoryId: e.target.value })} containerClassName="w-[210px]" />
        <Select aria-label="State" placeholder="All states" options={states.map((s) => ({ value: s.name, label: s.name }))} value={url.values.state} onChange={(e) => url.set({ state: e.target.value })} containerClassName="w-[180px]" />
        <Select aria-label="Sort" options={SORT_OPTIONS} value={url.sort || 'name'} onChange={(e) => url.set({ sort: e.target.value === 'name' ? null : e.target.value })} containerClassName="w-[160px]" />
        {filtered && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('');
              url.set({ q: null, categoryId: null, state: null });
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <DataTable
        label="Vendors"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(v) => v.id}
        minWidth={1100}
        loading={list.isLoading}
        sort={SORT.fromApi(url.sort)}
        onSortChange={(s) => url.set({ sort: SORT.toApi(s) ?? null })}
        manualSort
        selectable
        selectedIds={selected}
        onSelectionChange={onSelection}
        selectionLabel={(n) => `${n} vendor${n === 1 ? '' : 's'} selected to compare`}
        bulkNote={selected.size < 2 ? 'Pick at least 2' : undefined}
        bulkActions={(ids) => (
          <Button variant="primary" icon={Scale} disabled={ids.length < 2} onClick={() => navigate(`/vendors/compare?ids=${ids.join(',')}`)}>
            Compare
          </Button>
        )}
        onRowClick={(v) => url.set({ open: v.id, page: url.page })}
        empty={
          <EmptyState
            icon={Factory}
            title={filtered || status ? 'No vendors match' : 'No vendors yet'}
            description={filtered || status ? 'Try another status or clear the filters.' : 'Add a vendor, or import a list from Vendor settings.'}
          />
        }
        footer={(list.data?.total ?? 0) > 0 && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />

      {url.open && (
        <VendorDetail
          vendor={opened.data}
          loadingText={opened.isError ? errorMessage(opened.error) : 'Loading…'}
          onClose={() => url.set({ open: null, page: url.page })}
          onEdit={(v) => setForm(v)}
          onBlacklist={(v) => setBlacklisting(v)}
        />
      )}
      <VendorForm
        open={form !== null}
        vendor={form === 'new' ? null : form}
        onClose={() => setForm(null)}
        onSaved={(saved) => {
          setForm(null);
          url.set({ open: saved.id, page: url.page });
        }}
      />
      <BlacklistDialog vendor={blacklisting} onClose={() => setBlacklisting(null)} />
      <ConfirmDialog open={!!toDelete} title={`Delete ${toDelete?.name ?? ''}?`} confirmLabel="Delete" danger busy={remove.isPending} onConfirm={onDelete} onClose={() => setToDelete(null)}>
        The vendor is removed from every list. Its history stays in the activity log.
      </ConfirmDialog>
    </div>
  );
}
