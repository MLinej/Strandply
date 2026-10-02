import { CheckCircle2, ClipboardCheck, Download, Eye, Link2, PackageCheck, Pencil, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { GrnStatus, GrnView } from '@contracts/stores';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, MenuItem, MenuSeparator, Pagination, Select, Tabs, useToast, type Column } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportGrns, useDeleteGrn, useGrns, useGrnStep, useStoresMeta } from '../api';
import { GrnDetail } from '../components/Details';
import { GrnForm } from '../components/GrnForm';
import { printGrn } from '../print';
import { AccountedPill, dateTime, itemsSummary, QualityPill, StatusFlow } from '../ui';

const PAGE_SIZE = 20;
type Tab = 'all' | GrnStatus;

/** GRN register with the review → approval steps (legacy GRN form + GRN register). `?receive=<mrnId>` opens the form for that MRN. */
export function GrnPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['status', 'fy', 'receive'] as const);
  const [search, setSearch] = useSearchParam(url);
  const fys = useStoresMeta().data?.fys ?? [];
  const tab = (url.values.status || 'all') as Tab;
  const filters = { status: tab === 'all' ? undefined : tab, fy: url.values.fy || undefined };
  const list = useGrns({ q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE, filters });
  const step = useGrnStep();
  const remove = useDeleteGrn();
  const [form, setForm] = useState<{ grn: GrnView | null; mrnId: string | null } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<GrnView | null>(null);
  const guard = (title: string, fn: () => Promise<unknown>) => void fn().catch((err) => toast({ tone: 'error', title, description: errorMessage(err) }));

  // Arriving from the MRN register's "Make GRN".
  useEffect(() => {
    if (url.values.receive && canDo('edit')) {
      setForm({ grn: null, mrnId: url.values.receive });
      url.set({ receive: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url.values.receive]);

  const run = (g: GrnView, s: 'review' | 'approve') =>
    guard(s === 'review' ? 'Couldn’t review' : 'Couldn’t approve', () =>
      step.mutateAsync({ id: g.id, step: s }).then((r) => toast({ tone: 'success', title: `${r.grnNo} ${s === 'review' ? 'reviewed' : 'approved'}` })),
    );

  const columns: Column<GrnView>[] = [
    {
      id: 'no',
      header: 'GRN',
      width: '170px',
      cell: (g) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold tabular-nums">{g.grnNo}</span>
          <span className="text-caption text-faint">{dateTime(g.date, g.time)}</span>
        </span>
      ),
    },
    { id: 'mrn', header: 'MRN', width: '130px', className: 'tabular-nums', cell: (g) => g.mrnNo },
    {
      id: 'vendor',
      header: 'Vendor / invoice',
      cell: (g) => (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate">{g.vendorName}</span>
          <span className="flex items-center gap-1 text-caption text-faint">
            {g.invoiceNo}
            {g.purchaseEntry && (
              <span className="inline-flex items-center gap-0.5 text-green" title={`Purchase lot ${g.purchaseEntry.lotNo}`}>
                <Link2 size={11} aria-hidden />
                <span>lot {g.purchaseEntry.lotNo}</span>
              </span>
            )}
          </span>
        </span>
      ),
    },
    { id: 'items', header: 'Items', width: '180px', cell: (g) => <span className="block truncate">{itemsSummary(g.items)}</span> },
    { id: 'quality', header: 'Quality', width: '170px', cell: (g) => <QualityPill quality={g.worstQuality} /> },
    { id: 'status', header: 'Approval', width: '230px', cell: (g) => <StatusFlow status={g.status} /> },
    { id: 'acct', header: 'Accounting', width: '150px', cell: (g) => <AccountedPill grn={g} /> },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (g) => (
        <RowMenu label={`Actions for ${g.grnNo}`}>
          {(close) => (
            <>
              <MenuItem icon={Eye} onClick={runAndClose(close, () => setViewing(g.id))}>
                View
              </MenuItem>
              {canDo('print') && (
                <MenuItem icon={Printer} onClick={runAndClose(close, () => guard('Couldn’t print', () => printGrn(g.id)))}>
                  Print GRN
                </MenuItem>
              )}
              {canDo('stores_review') && g.status === 'draft' && (
                <MenuItem icon={ClipboardCheck} onClick={runAndClose(close, () => run(g, 'review'))}>
                  Mark reviewed
                </MenuItem>
              )}
              {canDo('stores_approve') && g.status === 'reviewed' && (
                <MenuItem icon={CheckCircle2} onClick={runAndClose(close, () => run(g, 'approve'))}>
                  Approve
                </MenuItem>
              )}
              {canDo('edit') && g.status !== 'approved' && (
                <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm({ grn: g, mrnId: null }))}>
                  Edit
                </MenuItem>
              )}
              {canDo('delete') && g.status !== 'approved' && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(g))}>
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
        title="Goods receipt (GRN)"
        description="What Stores actually received against each gate entry. Each GRN is reviewed, then approved."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => guard('Export failed', () => exportGrns({ q: url.q || undefined, filters }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm({ grn: null, mrnId: null })}>
                New GRN
              </Button>
            )}
          </>
        }
      />
      <Tabs<Tab>
        aria-label="Approval status"
        items={[
          { value: 'all', label: 'All' },
          { value: 'draft', label: 'Awaiting review' },
          { value: 'reviewed', label: 'Awaiting approval' },
          { value: 'approved', label: 'Approved' },
        ]}
        value={tab}
        onChange={(v) => url.set({ status: v === 'all' ? null : v })}
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search GRNs" icon={Search} placeholder="GRN, MRN, vendor, invoice" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[260px]" />
        <Select aria-label="Financial year" placeholder="All years" options={fys.map((x) => ({ value: x, label: `FY ${x}` }))} value={url.values.fy} onChange={(e) => url.set({ fy: e.target.value })} containerClassName="w-[130px]" />
      </div>
      <DataTable
        label="GRNs"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(g) => g.id}
        minWidth={1240}
        loading={list.isLoading}
        onRowClick={(g) => setViewing(g.id)}
        empty={<EmptyState icon={PackageCheck} title="No GRNs here" />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <GrnForm open={form !== null} grn={form?.grn ?? null} mrnId={form?.mrnId} onClose={() => setForm(null)} />
      <GrnDetail
        id={viewing}
        onClose={() => setViewing(null)}
        onEdit={(g) => {
          setViewing(null);
          setForm({ grn: g, mrnId: null });
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.grnNo ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: `${toDelete!.grnNo} deleted`, description: `${toDelete!.mrnNo} is waiting for a GRN again.` }))
            .catch((err) => toast({ tone: 'error', title: 'Couldn’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        {toDelete?.mrnNo} goes back to Pending GRN. Approved GRNs can’t be deleted.
      </ConfirmDialog>
    </div>
  );
}
