import { BookOpen, Download, Scale, Trash2, Trees } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { WipBatchView, WipLedgerRow } from '@contracts/production';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, KpiTile, Modal, Pill, Select, Tabs, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { Tone } from '@/lib/status';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage } from '../../samples/ui/errors';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportProduction, useWip, useWipAction, useWipLedger } from '../api';
import { inr, kg, perKg } from '../ui';

const STATUS: Record<WipBatchView['status'], Tone> = { available: 'green', 'partly used': 'amber', consumed: 'neutral', negative: 'red' };

function AdjustDialog({ batch, onClose }: { batch: WipBatchView | null; onClose: () => void }) {
  const toast = useToast();
  const act = useWipAction();
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<Record<string, string>>({});
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!Number(qty)) local.qty = 'Enter a + or − kg adjustment';
    if (!reason.trim()) local.reason = 'Reason is required';
    if (Object.keys(local).length) return setError(local);
    try {
      const w = await act.mutateAsync({ kind: 'adjust', id: batch!.id, qty: Number(qty), reason: reason.trim() });
      toast({ tone: 'success', title: `${batch!.docNo} adjusted`, description: `Now ${kg(w!.availKg)}` });
      setQty('');
      setReason('');
      onClose();
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t adjust', description: errorMessage(err) });
    }
  }
  return (
    <Modal
      open={!!batch}
      onClose={onClose}
      size="sm"
      title={`Adjust ${batch?.docNo ?? ''}`}
      description={batch ? `Current balance ${kg(batch.availKg)}. Chipped weight is a worked-out figure, so it can be corrected here.` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="wip-adjust" loading={act.isPending}>
            Record adjustment
          </Button>
        </>
      }
    >
      <form id="wip-adjust" noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
        <Input label="Adjustment (kg)" placeholder="+120 or −80" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace('−', '-'))} error={error.qty} />
        <Input label="Reason" placeholder="Moisture loss, re-weighed" value={reason} onChange={(e) => setReason(e.target.value)} error={error.reason} />
      </form>
    </Modal>
  );
}

function Ledger({ batches }: { batches: WipBatchView[] }) {
  const url = useUrlState(['wip'] as const);
  const rows = useWipLedger(url.values.wip).data;
  const tIn = (rows ?? []).filter((r) => r.type === 'IN').reduce((s, r) => s + r.qty, 0);
  const tOut = (rows ?? []).filter((r) => r.type === 'OUT').reduce((s, r) => s + r.qty, 0);
  const columns: Column<WipLedgerRow>[] = [
    { id: 'date', header: 'Date', width: '110px', cell: (r) => formatDate(r.date) },
    { id: 'wip', header: 'WIP batch', width: '110px', className: 'tabular-nums', cell: (r) => r.wipNo },
    { id: 'type', header: 'Type', width: '70px', cell: (r) => <Pill tone={r.type === 'IN' ? 'green' : 'red'}>{r.type}</Pill> },
    { id: 'qty', header: 'Qty', width: '110px', align: 'right', className: 'font-semibold tabular-nums', cell: (r) => kg(r.qty) },
    { id: 'amt', header: 'Amount', width: '120px', align: 'right', className: 'tabular-nums', cell: (r) => inr(r.amountPaise) },
    { id: 'ref', header: 'Reference', cell: (r) => <span className="block truncate">{`${r.refType}${r.refNo ? ` ${r.refNo}` : ''}${r.remarks && r.refType === 'Adjustment' ? `: ${r.remarks}` : ''}`}</span> },
    { id: 'bal', header: 'Balance', width: '120px', align: 'right', className: 'font-semibold tabular-nums', cell: (r) => <span className={r.balance < 0 ? 'text-primary' : undefined}>{kg(r.balance)}</span> },
  ];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <Select aria-label="WIP batch" placeholder="All batches" options={batches.map((b) => ({ value: b.id, label: `${b.docNo} (${b.chippingNo})` }))} value={url.values.wip} onChange={(e) => url.set({ wip: e.target.value })} containerClassName="w-[220px]" />
        <span className="text-sm tabular-nums text-muted">
          In {kg(tIn)} · out {kg(tOut)}
        </span>
      </div>
      <DataTable label="WIP ledger" columns={columns} rows={rows ?? []} getRowId={(r) => `${r.wipId}-${r.refType}-${r.refId}-${r.at}`} minWidth={960} loading={!rows} empty={<EmptyState icon={BookOpen} title="No movements" />} />
    </>
  );
}

/** WIP Nilgiri stock and its ledger (legacy renderWIPStock / renderWIPLedger / wipLedgerManualAdjust). */
export function WipPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['tab'] as const);
  const tab = (url.values.tab || 'stock') as 'stock' | 'ledger';
  const batches = useWip().data;
  const act = useWipAction();
  const [adjusting, setAdjusting] = useState<WipBatchView | null>(null);
  const [toDelete, setToDelete] = useState<WipBatchView | null>(null);
  const list = batches ?? [];
  const totalKg = list.reduce((s, b) => s + b.totalKg, 0);
  const availKg = list.reduce((s, b) => s + b.availKg, 0);
  const totalPaise = list.reduce((s, b) => s + b.totalPaise, 0);
  const negative = list.filter((b) => b.availKg < 0).length;

  const columns: Column<WipBatchView>[] = [
    {
      id: 'no',
      header: 'Batch',
      width: '130px',
      cell: (b) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold tabular-nums">{b.docNo}</span>
          <span className="text-caption text-faint">{formatDate(b.date)}</span>
        </span>
      ),
    },
    { id: 'chip', header: 'Chipping', width: '110px', className: 'tabular-nums', cell: (b) => b.chippingNo },
    { id: 'total', header: 'Chipped', width: '120px', align: 'right', className: 'tabular-nums', cell: (b) => kg(b.totalKg) },
    { id: 'used', header: 'Used', width: '110px', align: 'right', className: 'tabular-nums', cell: (b) => kg(b.usedKg) },
    { id: 'adj', header: 'Adjusted', width: '100px', align: 'right', className: 'tabular-nums', cell: (b) => (b.adjustKg ? `${b.adjustKg > 0 ? '+' : ''}${kg(b.adjustKg)}` : '—') },
    { id: 'avail', header: 'Available', width: '120px', align: 'right', className: 'font-semibold tabular-nums', cell: (b) => <span className={b.availKg < 0 ? 'text-primary' : undefined}>{kg(b.availKg)}</span> },
    { id: 'rate', header: 'Cost', width: '100px', align: 'right', className: 'tabular-nums', cell: (b) => perKg(b.avgRatePaise) },
    { id: 'status', header: 'Status', width: '120px', cell: (b) => <Pill tone={STATUS[b.status]}>{b.status === 'negative' ? 'Negative' : b.status[0]!.toUpperCase() + b.status.slice(1)}</Pill> },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '200px',
      align: 'right',
      cell: (b) => (
        <span className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon={BookOpen} onClick={() => url.set({ tab: 'ledger', wip: b.id } as never)} aria-label={`Ledger for ${b.docNo}`}>
            Ledger
          </Button>
          {canDo('edit') && (
            <Button size="sm" variant="ghost" icon={Scale} onClick={() => setAdjusting(b)} aria-label={`Adjust ${b.docNo}`}>
              Adjust
            </Button>
          )}
          {canDo('delete') && b.usedKg === 0 && b.adjustKg === 0 && <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete ${b.docNo}`} onClick={() => setToDelete(b)} />}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="WIP Nilgiri"
        description="Chipped wood waiting for production. Batches come from chipping reports and are used by production summaries."
        actions={
          canDo('export') && (
            <Button icon={Download} onClick={() => void exportProduction(tab === 'stock' ? 'wip' : 'wip-ledger').catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
              Excel
            </Button>
          )
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile variant="compact" label="Batches" value={list.length} />
        <KpiTile variant="compact" label="Chipped" value={`${(totalKg / 1000).toFixed(2)} T`} />
        <KpiTile variant="compact" label="Available" value={`${(availKg / 1000).toFixed(2)} T`} meta={negative ? `${negative} batch(es) negative` : undefined} emphasis={negative ? 'bad' : undefined} />
        <KpiTile variant="compact" label="Average cost" value={totalKg ? perKg(Math.round((totalPaise / totalKg) * 1000)) : '—'} />
      </div>
      <Tabs
        aria-label="View"
        items={[
          { value: 'stock', label: 'Stock' },
          { value: 'ledger', label: 'Ledger' },
        ]}
        value={tab}
        onChange={(v) => url.set({ tab: v === 'stock' ? null : v })}
      />
      {tab === 'stock' ? (
        <DataTable label="WIP batches" columns={columns} rows={list} getRowId={(b) => b.id} minWidth={1180} loading={!batches} empty={<EmptyState icon={Trees} title="No WIP batches" description="Create one from a chipping report." />} />
      ) : (
        <Ledger batches={list} />
      )}
      <AdjustDialog batch={adjusting} onClose={() => setAdjusting(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.docNo ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={act.isPending}
        onConfirm={() =>
          void act
            .mutateAsync({ kind: 'delete', id: toDelete!.id })
            .then(() => toast({ tone: 'success', title: `${toDelete!.docNo} deleted` }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        Its chipping report can then make a new batch.
      </ConfirmDialog>
    </div>
  );
}
