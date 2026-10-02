import { BookCheck, Download, Search, Undo2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { GrnView } from '@contracts/stores';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, KpiTile, Modal, Select, useToast, type Column } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportAccounting, useAccounting, useMarkAccounted, useStoresMeta, useUndoAccounted } from '../api';
import { GrnDetail } from '../components/Details';
import { AccountedPill, itemsSummary, stamp } from '../ui';

function MarkDialog({ grn, onClose }: { grn: GrnView | null; onClose: () => void }) {
  const toast = useToast();
  const mark = useMarkAccounted();
  const [voucher, setVoucher] = useState('');
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    setVoucher('');
    setError(undefined);
  }, [grn]);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!voucher.trim()) return setError('Voucher / entry number is required');
    try {
      await mark.mutateAsync({ id: grn!.id, voucherNo: voucher.trim() });
      toast({ tone: 'success', title: `${grn!.grnNo} accounted`, description: `Voucher ${voucher.trim()}` });
      onClose();
    } catch (err) {
      setError(fieldErrors(err).voucherNo);
      toast({ tone: 'error', title: 'Couldn’t mark accounted', description: errorMessage(err) });
    }
  }
  return (
    <Modal
      open={!!grn}
      onClose={onClose}
      size="sm"
      title={`Mark ${grn?.grnNo ?? ''} accounted`}
      description={grn ? `Invoice ${grn.invoiceNo} from ${grn.vendorName}, booked in the accounts software.` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="acct-form" loading={mark.isPending}>
            Mark accounted
          </Button>
        </>
      }
    >
      <form id="acct-form" noValidate onSubmit={onSubmit}>
        <Input label="Voucher / entry no." placeholder="e.g. PV/001/26-27" value={voucher} onChange={(e) => setVoucher(e.target.value)} error={error} autoFocus />
      </form>
    </Modal>
  );
}

/** Accounting audit trail (legacy renderAccounting): approved GRNs and whether each is booked. */
export function AccountingPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['accounted', 'fy'] as const);
  const [search, setSearch] = useSearchParam(url);
  const fys = useStoresMeta().data?.fys ?? [];
  const query = { q: url.q || undefined, filters: { fy: url.values.fy || undefined, accounted: url.values.accounted === '' ? undefined : url.values.accounted === 'true' } };
  const report = useAccounting(query);
  const undo = useUndoAccounted();
  const [marking, setMarking] = useState<GrnView | null>(null);
  const [undoing, setUndoing] = useState<GrnView | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const k = report.data?.kpis;

  const columns: Column<GrnView>[] = [
    {
      id: 'no',
      header: 'GRN',
      width: '150px',
      cell: (g) => <span className="font-semibold tabular-nums">{g.grnNo}</span>,
    },
    { id: 'invoice', header: 'Invoice', width: '140px', className: 'tabular-nums', cell: (g) => g.invoiceNo },
    { id: 'vendor', header: 'Vendor', width: '220px', cell: (g) => <span className="block truncate">{g.vendorName}</span> },
    { id: 'items', header: 'Items', cell: (g) => <span className="block truncate">{itemsSummary(g.items)}</span> },
    { id: 'approved', header: 'Approved', width: '170px', className: 'text-sm', cell: (g) => stamp(g.approvedAt) },
    { id: 'status', header: 'Status', width: '160px', cell: (g) => <AccountedPill grn={g} /> },
    {
      id: 'voucher',
      header: 'Voucher',
      width: '230px',
      cell: (g) =>
        g.accounted ? (
          <span className="flex flex-col leading-tight">
            <span className="font-medium tabular-nums">{g.voucherNo}</span>
            <span className="text-caption text-faint">
              {g.accountedByName ?? '—'}, {stamp(g.accountedAt)}
            </span>
          </span>
        ) : (
          '—'
        ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '170px',
      align: 'right',
      // The row opens the GRN, so the buttons keep their clicks to themselves.
      cell: (g) =>
        canDo('stores_account') && (
          <span onClick={(e) => e.stopPropagation()}>
            {g.accounted ? (
              <Button size="sm" variant="ghost" icon={Undo2} onClick={() => setUndoing(g)} aria-label={`Undo accounting of ${g.grnNo}`}>
                Undo
              </Button>
            ) : (
              <Button size="sm" icon={BookCheck} onClick={() => setMarking(g)} aria-label={`Mark ${g.grnNo} accounted`}>
                Mark accounted
              </Button>
            )}
          </span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Accounting"
        description="Approved GRNs and the voucher each was booked under in the accounts software."
        actions={
          canDo('export') && (
            <Button icon={Download} onClick={() => void exportAccounting(query).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
              Excel
            </Button>
          )
        }
      />
      {k && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile variant="compact" label="Accounted" value={k.accounted} />
          <KpiTile variant="compact" label="Pending accounting" value={k.pending} />
          <KpiTile variant="compact" label="Accounted share" value={`${k.pct}%`} />
          <KpiTile variant="compact" label="Not yet approved" value={k.awaitingApproval} meta="GRNs still in review or approval" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search" icon={Search} placeholder="GRN, invoice, vendor" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[240px]" />
        <Select
          aria-label="Accounting status"
          placeholder="All approved"
          options={[
            { value: 'false', label: 'Pending accounting' },
            { value: 'true', label: 'Accounted' },
          ]}
          value={url.values.accounted}
          onChange={(e) => url.set({ accounted: e.target.value })}
          containerClassName="w-[180px]"
        />
        <Select aria-label="Financial year" placeholder="All years" options={fys.map((x) => ({ value: x, label: `FY ${x}` }))} value={url.values.fy} onChange={(e) => url.set({ fy: e.target.value })} containerClassName="w-[130px]" />
      </div>
      <DataTable
        label="Approved GRNs"
        columns={columns}
        rows={report.data?.rows ?? []}
        getRowId={(g) => g.id}
        minWidth={1380}
        loading={report.isLoading}
        onRowClick={(g) => setViewing(g.id)}
        empty={<EmptyState icon={BookCheck} title="No approved GRNs" description={k?.awaitingApproval ? `${k.awaitingApproval} GRN(s) are still waiting for review or approval and aren’t shown here.` : undefined} />}
      />
      <MarkDialog grn={marking} onClose={() => setMarking(null)} />
      <GrnDetail id={viewing} onClose={() => setViewing(null)} />
      <ConfirmDialog
        open={!!undoing}
        title={`Undo accounting of ${undoing?.grnNo ?? ''}?`}
        confirmLabel="Undo"
        busy={undo.isPending}
        onConfirm={() =>
          void undo
            .mutateAsync(undoing!.id)
            .then(() => toast({ tone: 'success', title: `${undoing!.grnNo} is pending accounting again` }))
            .catch((err) => toast({ tone: 'error', title: 'Couldn’t undo', description: errorMessage(err) }))
            .finally(() => setUndoing(null))
        }
        onClose={() => setUndoing(null)}
      >
        Voucher {undoing?.voucherNo} is cleared. The audit trail keeps a record of it.
      </ConfirmDialog>
    </div>
  );
}
