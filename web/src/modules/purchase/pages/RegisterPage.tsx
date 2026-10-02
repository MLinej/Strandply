import { CheckCircle2, Download, Eye, Pencil, Plus, Printer, Search, Settings2, Tag, Trash2, Truck } from 'lucide-react';
import { useState } from 'react';
import { ENTRY_STATUSES, MATERIAL_BY_ID, MATERIAL_IDS, MATERIALS, rateUnitOf, type EntryStatus, type MaterialId, type PurchaseEntryView, type TypeKind } from '@contracts/purchase';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, KpiTile, MenuItem, MenuSeparator, Pagination, Select, Tabs, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { sortMapping } from '../../samples/ui/table-sort';
import { exportEntries, useApproveEntry, useDeleteEntry, useEntries, useEntry, useEntryStats } from '../api';
import { EntryDetail, TypeMasterDialog } from '../components/EntryDetail';
import { EntryForm } from '../components/EntryForm';
import { printEntry } from '../print';
import { EntryStatusPill, FySelect, inr, inrShort, MonthSelect, NotePill, qtyFmt, qtyWithUnit, useFy } from '../ui';

const PAGE_SIZE = 15;
const SORT = sortMapping({ date: 'date', lot: 'lotNo', vendor: 'vendorName', spl: 'splQty' });
const STATUS_LABEL: Record<EntryStatus, string> = { draft: 'Drafts', pending: 'Awaiting approval', approved: 'Approved' };

/** Material-wise purchase register (legacy Nilgiri / Resin / Kraft / Fire wood / Core / Face veneer pages). */
export function RegisterPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['material', 'fy', 'month', 'status'] as const);
  const [search, setSearch] = useSearchParam(url);
  const material: MaterialId = (MATERIAL_IDS as readonly string[]).includes(url.values.material) ? (url.values.material as MaterialId) : 'nilgiri';
  const { fy, fys } = useFy(url.values.fy);
  const status = (ENTRY_STATUSES as readonly string[]).includes(url.values.status) ? (url.values.status as EntryStatus) : undefined;
  const filters = { material, fy: url.values.month ? undefined : fy || undefined, month: url.values.month || undefined, status };
  const list = useEntries({ q: url.q || undefined, sort: url.sort || undefined, page: url.page, pageSize: PAGE_SIZE, filters }, { enabled: !!fy });
  const stats = useEntryStats({ q: url.q || undefined, filters }).data;
  const opened = useEntry(url.open);
  const approve = useApproveEntry();
  const remove = useDeleteEntry();
  const [form, setForm] = useState<PurchaseEntryView | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<PurchaseEntryView | null>(null);
  const [types, setTypes] = useState<TypeKind | null>(null);
  const mat = MATERIAL_BY_ID[material];

  const guard = (title: string, fn: () => Promise<unknown>) => fn().catch((err) => toast({ tone: 'error', title, description: errorMessage(err) }));

  async function onDelete() {
    if (!toDelete) return;
    try {
      await remove.mutateAsync(toDelete.id);
      toast({ tone: 'success', title: `${toDelete.lotNo} deleted` });
      if (url.open === toDelete.id) url.set({ open: null });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t delete', description: errorMessage(err) });
    }
    setToDelete(null);
  }

  const columns: Column<PurchaseEntryView>[] = [
    {
      id: 'lot',
      header: 'Lot',
      width: '104px',
      sortValue: (e) => e.lotNo,
      cell: (e) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold">{e.lotNo}</span>
          <span className="text-caption text-faint">{formatDate(e.date)}</span>
        </span>
      ),
    },
    {
      id: 'vendor',
      header: 'Vendor',
      sortValue: (e) => e.vendorName,
      cell: (e) => (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-medium">{e.vendorName}</span>
          <span className="truncate text-caption text-faint">
            {e.invoiceNo}
            {e.species ? ` · ${e.species}` : e.veneerType ? ` · ${e.veneerType}` : ''}
          </span>
        </span>
      ),
    },
    {
      id: 'vehicle',
      header: 'Vehicle / PO',
      width: '130px',
      cell: (e) => (
        <span className="flex flex-col leading-tight text-sm">
          <span>{e.vehicleNo ?? '—'}</span>
          <span className="text-caption text-faint">{e.poNo ? `PO ${e.poNo}` : 'No PO'}</span>
        </span>
      ),
    },
    { id: 'inv', header: 'Invoice qty', width: '96px', align: 'right', className: 'tabular-nums', cell: (e) => qtyFmt(e.invQty) },
    {
      id: 'spl',
      header: 'SPL qty',
      width: '110px',
      align: 'right',
      sortValue: (e) => e.splQty,
      cell: (e) => (
        <span className="flex flex-col items-end leading-tight tabular-nums">
          <span>{qtyFmt(e.splQty)}</span>
          {e.calc.diffQty !== 0 && <span className={e.calc.diffQty < 0 ? 'text-caption text-primary' : 'text-caption text-green'}>{e.calc.diffQty > 0 ? '+' : ''}{qtyFmt(e.calc.diffQty)}</span>}
        </span>
      ),
    },
    { id: 'rate', header: `Rate/${rateUnitOf(mat)}`, width: '104px', align: 'right', className: 'tabular-nums', cell: (e) => inr(e.ratePaise) },
    { id: 'total', header: 'SPL total', width: '120px', align: 'right', className: 'tabular-nums font-semibold', cell: (e) => inr(e.calc.spl.total) },
    {
      id: 'notes',
      header: 'DN / CN',
      width: '160px',
      cell: (e) =>
        e.calc.qtyNote || e.calc.rateNote ? (
          <span className="flex flex-wrap gap-1">
            {e.calc.qtyNote && <NotePill kind="qty" type={e.calc.qtyNote.type} />}
            {e.calc.rateNote && <NotePill kind="rate" type={e.calc.rateNote.type} />}
          </span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    { id: 'status', header: 'Status', width: '140px', cell: (e) => <EntryStatusPill status={e.status} /> },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (e) => (
        <RowMenu label={`Actions for ${e.lotNo}`}>
          {(close) => (
            <>
              <MenuItem icon={Eye} onClick={runAndClose(close, () => url.set({ open: e.id, page: url.page }))}>
                View
              </MenuItem>
              {canDo('print') && e.status !== 'draft' && (
                <MenuItem icon={Printer} onClick={runAndClose(close, () => void guard('Couldn’t print', () => printEntry(e.id, 'slip')))}>
                  Print slip
                </MenuItem>
              )}
              {canDo('print') && e.material === 'nilgiri' && e.status !== 'draft' && (
                <MenuItem icon={Tag} onClick={runAndClose(close, () => void guard('Couldn’t print', () => printEntry(e.id, 'label')))}>
                  Lot label
                </MenuItem>
              )}
              {canDo('edit') && (
                <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(e))}>
                  Edit
                </MenuItem>
              )}
              {canDo('purchase_approve') && e.status === 'pending' && (
                <MenuItem
                  icon={CheckCircle2}
                  onClick={runAndClose(close, () =>
                    void approve.mutateAsync(e.id).then(
                      () => toast({ tone: 'success', title: `${e.lotNo} approved` }),
                      (err) => toast({ tone: 'error', title: 'Couldn’t approve', description: errorMessage(err) }),
                    ),
                  )}
                >
                  Approve
                </MenuItem>
              )}
              {canDo('delete') && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(e))}>
                    Delete
                  </MenuItem>
                </>
              )}
            </>
          )}
        </RowMenu>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Purchase register"
        description="Raw material inward by invoice: our weighbridge against the vendor’s invoice, with debit and credit notes worked out."
        actions={
          <>
            {(mat.hasSpecies || mat.hasVeneerType) && (
              <Button icon={Settings2} onClick={() => setTypes(mat.hasSpecies ? 'nilgiri_species' : 'face_veneer')}>
                {mat.hasSpecies ? 'Species' : 'Veneer types'}
              </Button>
            )}
            {canDo('export') && (
              <Button icon={Download} onClick={() => void guard('Export failed', () => exportEntries({ q: url.q || undefined, filters }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                Add entry
              </Button>
            )}
          </>
        }
      />
      <Tabs aria-label="Material" value={material} onChange={(m) => url.set({ material: m })} items={MATERIALS.map((m) => ({ value: m.id, label: m.label }))} />
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiTile variant="compact" label="SPL total" value={inrShort(stats.splTotalPaise)} meta={`${stats.entries} entr${stats.entries === 1 ? 'y' : 'ies'}`} />
          <KpiTile variant="compact" label="SPL quantity" value={qtyWithUnit(material, stats.splQty, { tons: true })} />
          <KpiTile variant="compact" label="Payable" value={inrShort(stats.payablePaise)} meta="After rate notes" />
          <KpiTile variant="compact" label="Average rate" value={stats.avgRatePaise === null ? '—' : inr(stats.avgRatePaise)} meta={`per ${rateUnitOf(mat)}`} />
          <KpiTile variant="compact" label="DN / CN" value={inrShort(stats.notesPaise)} meta={`${stats.notes} note${stats.notes === 1 ? '' : 's'}`} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search entries" icon={Search} placeholder="Vendor, invoice, lot, vehicle, RST, MRN" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[300px]" />
        <FySelect value={fy} fys={fys} onChange={(v) => url.set({ fy: v, month: null })} />
        <MonthSelect fy={fy} value={url.values.month} onChange={(m) => url.set({ month: m })} />
        <Select aria-label="Status" placeholder="Every status" options={ENTRY_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} value={url.values.status} onChange={(e) => url.set({ status: e.target.value })} containerClassName="w-[180px]" />
      </div>
      <DataTable
        label={`${mat.label} entries`}
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(e) => e.id}
        minWidth={1180}
        loading={list.isLoading}
        sort={SORT.fromApi(url.sort)}
        onSortChange={(s) => url.set({ sort: SORT.toApi(s) ?? null })}
        manualSort
        onRowClick={(e) => url.set({ open: e.id, page: url.page })}
        empty={<EmptyState icon={Truck} title={`No ${mat.label.toLowerCase()} entries`} description="Change the year or filters, or add an entry." />}
        footer={(list.data?.total ?? 0) > 0 && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      {url.open && <EntryDetail entry={opened.data} onClose={() => url.set({ open: null, page: url.page })} onEdit={(e) => setForm(e)} onDelete={(e) => setToDelete(e)} />}
      <EntryForm
        open={form !== null}
        entry={form === 'new' ? null : form}
        material={material}
        onClose={() => setForm(null)}
        onSaved={(e) => {
          setForm(null);
          url.set({ material: e.material, open: e.id, page: url.page });
        }}
      />
      <TypeMasterDialog kind={types} onClose={() => setTypes(null)} />
      <ConfirmDialog open={!!toDelete} title={`Delete ${toDelete?.lotNo ?? ''}?`} confirmLabel="Delete" danger busy={remove.isPending} onConfirm={onDelete} onClose={() => setToDelete(null)}>
        The entry leaves the register, stock and notes. Its documents and the activity log keep a record of it.
      </ConfirmDialog>
    </div>
  );
}
