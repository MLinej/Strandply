import { Ban, CheckCircle2, Download, FileText, IndianRupee, Printer, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ORDER_STATUSES, ORDER_STATUS_LABEL, routeOf, type FreightOrderView } from '@contracts/transport';
import { useSession } from '@/app/session';
import { Button, Combo, DataTable, EmptyState, Input, MenuItem, MenuSeparator, Modal, Pagination, Select, Textarea, useToast, type Column } from '@/components/ui';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportTransport, useOrders, useTransportMeta, useUpdateOrder } from '../api';
import { printOrder } from '../print';
import { d, inr, OrderPill, weight } from '../ui';

const PAGE_SIZE = 25;

/** Mark delivered (date, defaults to today) or cancel (frees the approved comparison for a new order). */
function StatusDialog({ order, to, onClose }: { order: FreightOrderView | null; to: 'delivered' | 'cancelled'; onClose: () => void }) {
  const toast = useToast();
  const meta = useTransportMeta().data;
  const update = useUpdateOrder();
  const [date, setDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const run = async () => {
    try {
      await update.mutateAsync({ id: order!.id, input: to === 'delivered' ? { status: to, deliveredOn: date || null, remarks: remarks || undefined } : { status: to, remarks: remarks || undefined } });
      toast({ tone: 'success', title: `${order!.orderNo} ${to === 'delivered' ? 'delivered' : 'cancelled'}` });
      onClose();
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t update', description: errorMessage(err) });
    }
  };
  return (
    <Modal
      open={!!order}
      onClose={onClose}
      size="sm"
      title={to === 'delivered' ? `Mark ${order?.orderNo} delivered` : `Cancel ${order?.orderNo}?`}
      description={to === 'cancelled' ? 'The approved rate stays; a new order form can be issued from it.' : undefined}
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button variant="primary" loading={update.isPending} onClick={() => void run()}>
            {to === 'delivered' ? 'Mark delivered' : 'Cancel order'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {to === 'delivered' && <Input label="Delivered on" type="date" value={date || meta?.today || ''} onChange={(e) => setDate(e.target.value)} />}
        <Textarea label={to === 'cancelled' ? 'Reason' : 'Remarks'} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </div>
    </Modal>
  );
}

/** Order forms (legacy Order Forms): issued from approved comparisons, printed for the transporter, closed on delivery. */
export function OrdersPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { canDo } = useSession();
  const meta = useTransportMeta().data;
  const url = useUrlState(['status', 'tp', 'from', 'to'] as const);
  const [search, setSearch] = useSearchParam(url);
  const v = url.values;
  const list = useOrders({ q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE, filters: { status: v.status || undefined, transporterId: v.tp || undefined, from: v.from || undefined, to: v.to || undefined } });
  const [dialog, setDialog] = useState<{ order: FreightOrderView; to: 'delivered' | 'cancelled' } | null>(null);
  const print = (o: FreightOrderView) => void printOrder(o.id).catch((err) => toast({ tone: 'error', title: 'Couldn’t print', description: errorMessage(err) }));

  const columns: Column<FreightOrderView>[] = [
    {
      id: 'no',
      header: 'Order',
      width: '140px',
      cell: (o) => (
        <span className="flex flex-col leading-tight">
          <span className="font-mono text-sm font-semibold">{o.orderNo}</span>
          <span className="text-caption text-faint">{d(o.date)}</span>
        </span>
      ),
    },
    {
      id: 'tp',
      header: 'Transporter',
      width: '200px',
      cell: (o) => (
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{o.transporter.name}</span>
          <span className="text-caption text-faint">{o.transporter.phone}</span>
        </span>
      ),
    },
    {
      id: 'route',
      header: 'Route',
      cell: (o) => (
        <span className="flex flex-col leading-tight">
          <span>{routeOf(o.from, o.to)}</span>
          <span className="text-caption text-faint">
            {o.material} · {weight(o.weightMt)} · {o.vehicle}
          </span>
        </span>
      ),
    },
    { id: 'load', header: 'Loading', width: '110px', className: 'text-sm tabular-nums', cell: (o) => d(o.pickupDate) },
    { id: 'rate', header: 'Rate', width: '120px', align: 'right', className: 'font-semibold tabular-nums', cell: (o) => inr(o.ratePaise) },
    { id: 'links', header: 'Inquiry · approval', width: '170px', className: 'font-mono text-caption text-muted', cell: (o) => `${o.inqNo} · ${o.approvalNo ?? '—'}` },
    {
      id: 'status',
      header: 'Status',
      width: '150px',
      cell: (o) => (
        <span className="flex flex-col items-start gap-0.5">
          <OrderPill s={o.status} />
          {o.deliveredOn && <span className="text-caption text-faint">{d(o.deliveredOn)}</span>}
        </span>
      ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (o) => (
        <span onClick={(e) => e.stopPropagation()}>
          <RowMenu label={`Actions for ${o.orderNo}`}>
            {(close) => (
              <>
                {canDo('print') && (
                  <MenuItem icon={Printer} onClick={runAndClose(close, () => print(o))}>
                    Print order form
                  </MenuItem>
                )}
                <MenuItem icon={IndianRupee} onClick={runAndClose(close, () => navigate(`/transport/rates?open=${o.rcId}`))}>
                  Open rate comparison
                </MenuItem>
                {canDo('edit') && o.status === 'issued' && (
                  <>
                    <MenuItem icon={CheckCircle2} onClick={runAndClose(close, () => setDialog({ order: o, to: 'delivered' }))}>
                      Mark delivered
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem icon={Ban} className="text-primary" onClick={runAndClose(close, () => setDialog({ order: o, to: 'cancelled' }))}>
                      Cancel order
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </RowMenu>
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Order forms"
        description="Issued from approved rate comparisons. Print one for the transporter to sign; mark it delivered when the POD comes in."
        actions={
          canDo('export') && (
            <Button icon={Download} onClick={() => void exportTransport('orders', { from: v.from || undefined, to: v.to || undefined }).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
              Excel
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search" icon={Search} placeholder="Order no., material" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[220px]" />
        <Select aria-label="Status" placeholder="All statuses" options={ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s] }))} value={v.status} onChange={(e) => url.set({ status: e.target.value })} containerClassName="w-[150px]" />
        <div className="w-[220px]">
          <Combo ariaLabel="Transporter" placeholder="All transporters" value={v.tp || null} options={(meta?.transporters ?? []).map((t) => ({ id: t.id, label: t.name }))} onChange={(id) => url.set({ tp: id })} />
        </div>
        <Input aria-label="From date" type="date" value={v.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={v.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
      </div>
      <DataTable
        label="Order forms"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(o) => o.id}
        minWidth={1100}
        loading={list.isLoading}
        onRowClick={(o) => navigate(`/transport/rates?open=${o.rcId}`)}
        empty={<EmptyState icon={FileText} title="No order forms yet" description="Issue one from an approved rate comparison." />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <StatusDialog key={dialog?.order.id ?? 'none'} order={dialog?.order ?? null} to={dialog?.to ?? 'delivered'} onClose={() => setDialog(null)} />
    </div>
  );
}
