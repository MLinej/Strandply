import { ArrowRight, Download, Eye, Pencil, Plus, Printer, Search, Trash2, Truck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { MRN_STATUSES, STORE_MATERIALS, type MrnStatus, type MrnView, type StoreMaterial } from '@contracts/stores';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, MenuItem, MenuSeparator, Pagination, Select, useToast, type Column } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportMrns, useDeleteMrn, useMrns } from '../api';
import { GrnDetail, MrnDetail } from '../components/Details';
import { MrnForm } from '../components/MrnForm';
import { printMrn } from '../print';
import { DaysPill, dateTime, itemsSummary, MrnStatusPill, qtySummary } from '../ui';

const PAGE_SIZE = 20;
const STATUS_LABEL: Record<MrnStatus, string> = { pending_grn: 'Pending GRN', grn_created: 'GRN created' };

/** Gate entry register (legacy MRN form + MRN register). */
export function GatePage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { canDo, can } = useSession();
  const url = useUrlState(['material', 'status', 'from', 'to'] as const);
  const [search, setSearch] = useSearchParam(url);
  const filters = {
    material: (url.values.material || undefined) as StoreMaterial | undefined,
    status: (url.values.status || undefined) as MrnStatus | undefined,
    from: url.values.from || undefined,
    to: url.values.to || undefined,
  };
  const list = useMrns({ q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE, filters });
  const remove = useDeleteMrn();
  const [form, setForm] = useState<MrnView | 'new' | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [viewingGrn, setViewingGrn] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<MrnView | null>(null);
  const canReceive = can('stores.grn') && canDo('edit');
  const guard = (title: string, fn: () => Promise<unknown>) => void fn().catch((err) => toast({ tone: 'error', title, description: errorMessage(err) }));
  const receive = (m: MrnView) => navigate(`/stores/grn?receive=${m.id}`);

  const columns: Column<MrnView>[] = [
    {
      id: 'no',
      header: 'MRN',
      width: '170px',
      cell: (m) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold tabular-nums">{m.mrnNo}</span>
          <span className="text-caption text-faint">{dateTime(m.date, m.time)}</span>
        </span>
      ),
    },
    {
      id: 'vendor',
      header: 'Vendor',
      cell: (m) => (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate">{m.vendorName}</span>
          {m.invoiceNo && <span className="text-caption text-faint">Invoice {m.invoiceNo}</span>}
        </span>
      ),
    },
    { id: 'vehicle', header: 'Vehicle', width: '120px', className: 'tabular-nums', cell: (m) => m.vehicleNo },
    {
      id: 'materials',
      header: 'Materials',
      width: '200px',
      cell: (m) => (
        <span className="flex flex-col leading-tight">
          <span className="truncate">{itemsSummary(m.items)}</span>
          <span className="text-caption text-faint tabular-nums">{qtySummary(m.items.map((i) => ({ qty: i.approxQty, unit: i.unit })))}</span>
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      width: '180px',
      cell: (m) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <MrnStatusPill status={m.status} />
          {m.status === 'pending_grn' && m.daysPending > 0 && <DaysPill days={m.daysPending} />}
        </span>
      ),
    },
    { id: 'grn', header: 'GRN', width: '130px', className: 'tabular-nums', cell: (m) => m.grnNo ?? '—' },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (m) => (
        <RowMenu label={`Actions for ${m.mrnNo}`}>
          {(close) => (
            <>
              <MenuItem icon={Eye} onClick={runAndClose(close, () => setViewing(m.id))}>
                View
              </MenuItem>
              {canDo('print') && (
                <MenuItem icon={Printer} onClick={runAndClose(close, () => guard('Couldn’t print', () => printMrn(m.id)))}>
                  Print slip
                </MenuItem>
              )}
              {m.status === 'pending_grn' && canReceive && (
                <MenuItem icon={ArrowRight} onClick={runAndClose(close, () => receive(m))}>
                  Make GRN
                </MenuItem>
              )}
              {m.grnId && (
                <MenuItem icon={Eye} onClick={runAndClose(close, () => setViewingGrn(m.grnId))}>
                  View {m.grnNo}
                </MenuItem>
              )}
              {m.status === 'pending_grn' && canDo('edit') && (
                <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(m))}>
                  Edit
                </MenuItem>
              )}
              {m.status === 'pending_grn' && canDo('delete') && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(m))}>
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

  const anyFilter = Object.values(filters).some(Boolean) || !!url.q;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Gate entry (MRN)"
        description="Every vehicle Security logs at the gate. Stores makes the GRN against it."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => guard('Export failed', () => exportMrns({ q: url.q || undefined, filters }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                New gate entry
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search MRNs" icon={Search} placeholder="MRN, vendor, vehicle, invoice" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[260px]" />
        <Select aria-label="Material" placeholder="All materials" options={STORE_MATERIALS.map((m) => ({ value: m.id, label: m.label }))} value={url.values.material} onChange={(e) => url.set({ material: e.target.value })} containerClassName="w-[160px]" />
        <Select aria-label="Status" placeholder="Any status" options={MRN_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} value={url.values.status} onChange={(e) => url.set({ status: e.target.value })} containerClassName="w-[150px]" />
        <Input aria-label="From date" type="date" value={url.values.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={url.values.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
        {anyFilter && (
          <Button size="sm" variant="ghost" onClick={() => url.set({ material: null, status: null, from: null, to: null, q: null })}>
            Clear filters
          </Button>
        )}
      </div>
      <DataTable
        label="Gate entries"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(m) => m.id}
        minWidth={1080}
        loading={list.isLoading}
        onRowClick={(m) => setViewing(m.id)}
        empty={<EmptyState icon={Truck} title={anyFilter ? 'No gate entries match' : 'No gate entries yet'} />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <MrnForm open={form !== null} mrn={form === 'new' ? null : form} onClose={() => setForm(null)} />
      <MrnDetail
        id={viewing}
        onClose={() => setViewing(null)}
        onEdit={(m) => {
          setViewing(null);
          setForm(m);
        }}
        onReceive={canReceive ? receive : undefined}
        onViewGrn={(id) => {
          setViewing(null);
          setViewingGrn(id);
        }}
      />
      <GrnDetail id={viewingGrn} onClose={() => setViewingGrn(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.mrnNo ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: `${toDelete!.mrnNo} deleted` }))
            .catch((err) => toast({ tone: 'error', title: 'Couldn’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        Only a gate entry without a GRN can be deleted. Its number is not reused.
      </ConfirmDialog>
    </div>
  );
}
