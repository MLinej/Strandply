import { ClipboardList, Download, Eye, Mail, Pencil, Plus, Printer, ReceiptText, Trash2, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { isOpenSo, SO_STATUS_LABEL, SO_STATUSES, type SalesOrderView, type SoStatus } from '@contracts/sales';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, KpiTile, MenuItem, MenuSeparator, Modal, Pagination, Select, Tabs, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage } from '../../samples/ui/errors';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportSales, useDeleteRecord, useDocList, useDocOne, useDocStatus } from '../api';
import { DispatchForm } from '../components/DispatchForm';
import { OrderLines } from '../components/DocLines';
import { EmailDialog } from '../components/EmailDialog';
import { OrderForm } from '../components/OrderForm';
import { RegisterFilters, useRegister } from '../components/RegisterFilters';
import { printSalesDoc } from '../print';
import { FirmPill, inr, lakh, qtyFmt, SoPill, TotalsBlock, useShowFirm } from '../ui';

const PAGE_SIZE = 20;
const SORTS: [string, string][] = [
  ['-date', 'Newest first'],
  ['date', 'Oldest first'],
  ['-soNo', 'SO no. (high → low)'],
  ['billTo', 'Bill to (A → Z)'],
  ['-totalPaise', 'Highest value'],
  ['edd', 'EDD (soonest)'],
];

/** One order: parties, terms, lines with what's invoiced and left, totals, dispatch, and the next steps. */
function OrderDetail({ id, onClose, onEdit, onDispatch, onEmail }: { id: string | null; onClose: () => void; onEdit: (o: SalesOrderView) => void; onDispatch: (o: SalesOrderView) => void; onEmail: (o: SalesOrderView) => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { canDo } = useSession();
  const o = useDocOne('orders', id).data;
  const status = useDocStatus('orders');
  const changeStatus = (s: SoStatus) =>
    void status
      .mutateAsync({ id: o!.id, status: s })
      .then(() => toast({ tone: 'success', title: `${o!.soNo}: ${SO_STATUS_LABEL[s]}` }))
      .catch((err) => toast({ tone: 'error', title: 'Couldn’t change the status', description: errorMessage(err) }));
  return (
    <Modal
      open={!!id}
      onClose={onClose}
      size="xl"
      title={o ? `Sales order ${o.soNo}` : 'Sales order'}
      description={o ? `${formatDate(o.date)} · ${o.billTo}` : undefined}
      footer={
        o && (
          <>
            {canDo('print') && (
              <Button icon={Printer} onClick={() => void printSalesDoc('orders', o.id).catch((err) => toast({ tone: 'error', title: 'Couldn’t print', description: errorMessage(err) }))}>
                Print
              </Button>
            )}
            <Button icon={Mail} onClick={() => onEmail(o)}>
              Email
            </Button>
            {canDo('edit') && o.status !== 'cancelled' && (
              <Button icon={Truck} onClick={() => onDispatch(o)}>
                Dispatch
              </Button>
            )}
            {canDo('edit') && (
              <Button icon={Pencil} onClick={() => onEdit(o)}>
                Edit
              </Button>
            )}
            {canDo('edit') && isOpenSo(o.status) && (
              <Button variant="primary" icon={ReceiptText} onClick={() => navigate(`/sales/invoices?new=1&so=${o.id}`)}>
                Create invoice
              </Button>
            )}
          </>
        )
      }
    >
      {!o ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <SoPill status={o.status} />
            <FirmPill firm={o.firm} />
            {o.piNo && <span className="text-sm text-muted">From proforma {o.piNo}</span>}
            {canDo('edit') && (
              <Select aria-label="Change status" options={SO_STATUSES.map((s) => ({ value: s, label: SO_STATUS_LABEL[s] }))} value={o.status} onChange={(e) => changeStatus(e.target.value as SoStatus)} containerClassName="ml-auto w-[200px]" />
            )}
          </div>
          <DetailList
            cols={3}
            items={[
              { label: 'Bill to', value: o.billTo },
              { label: 'Ship to', value: `${o.shipTo}${o.city || o.state ? ` · ${[o.city, o.state].filter(Boolean).join(', ')}` : ''}` },
              { label: 'Tax type', value: o.taxType },
              { label: 'Customer PO', value: o.poNo ? `${o.poNo}${o.poDate ? ` · ${formatDate(o.poDate)}` : ''}` : null },
              { label: 'Expected dispatch', value: o.edd ? formatDate(o.edd) : null },
              { label: 'Sales person', value: o.salesPerson },
              { label: 'Payment terms', value: o.paymentTerms },
              { label: 'Delivery terms', value: o.deliveryTerms },
              { label: 'Total weight', value: o.totalWeightKg ? `${qtyFmt(o.totalWeightKg)} kg` : null },
              { label: 'Invoices', value: o.invoiceNos.join(', ') || 'None yet' },
              {
                label: 'Dispatch',
                value: o.dispatch.date || o.dispatch.vehicleNo ? [o.dispatch.date && formatDate(o.dispatch.date), o.dispatch.vehicleNo, o.dispatch.transporter, o.dispatch.lrNo && `LR ${o.dispatch.lrNo}`].filter(Boolean).join(' · ') : 'Not dispatched',
              },
              { label: 'Entered by', value: o.createdByName },
              { label: 'Remarks', value: o.remarks, wide: true },
            ]}
          />
          <OrderLines lines={o.lines} progress={o.progress} />
          <TotalsBlock t={o.totals} gstPct={o.gstPct} label="Order value" />
        </div>
      )}
    </Modal>
  );
}

/** Sales orders (legacy sales_orders): KPIs, status tabs, filters, register, form, detail, dispatch, email, print. */
export function OrdersPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { canDo } = useSession();
  const showFirm = useShowFirm();
  const { url, query, firm } = useRegister(PAGE_SIZE);
  const tab = (url.values.status || 'all') as 'all' | SoStatus;
  const list = useDocList('orders', query);
  const sum = list.data?.summary;
  const by = (s: SoStatus) => sum?.byStatus[s] ?? 0;
  const all = sum?.count ?? 0;
  const remove = useDeleteRecord('orders');
  const [form, setForm] = useState<SalesOrderView | 'new' | null>(null);
  const [viewing, setViewing] = useState<string | null>(url.open);
  const [dispatching, setDispatching] = useState<SalesOrderView | null>(null);
  const [emailing, setEmailing] = useState<SalesOrderView | null>(null);
  const [toDelete, setToDelete] = useState<SalesOrderView | null>(null);
  const guard = (t: string, fn: () => Promise<unknown>) => void fn().catch((err) => toast({ tone: 'error', title: t, description: errorMessage(err) }));

  useEffect(() => {
    if (url.values.new && canDo('edit')) {
      setForm('new');
      url.set({ new: null });
    }
    // Only when the link changes.
  }, [url.values.new]);
  useEffect(() => {
    if (url.open) setViewing(url.open);
  }, [url.open]);

  const columns: Column<SalesOrderView>[] = [
    {
      id: 'no',
      header: 'SO',
      width: '130px',
      cell: (o) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold tabular-nums">{o.soNo}</span>
          <span className="text-caption text-faint">{formatDate(o.date)}</span>
        </span>
      ),
    },
    ...(showFirm ? [{ id: 'firm', header: 'Firm', width: '64px', cell: (o: SalesOrderView) => <FirmPill firm={o.firm} /> }] : []),
    {
      id: 'party',
      header: 'Bill to / ship to',
      cell: (o) => (
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{o.billTo}</span>
          {o.shipTo !== o.billTo && <span className="text-caption text-muted">→ {o.shipTo}</span>}
          {o.city && <span className="text-caption text-faint">{[o.city, o.state].filter(Boolean).join(', ')}</span>}
        </span>
      ),
    },
    { id: 'po', header: 'PO no.', width: '110px', className: 'text-sm', cell: (o) => o.poNo ?? '—' },
    { id: 'items', header: 'Items', width: '70px', align: 'right', className: 'tabular-nums', cell: (o) => o.lines.length },
    { id: 'wt', header: 'Weight', width: '100px', align: 'right', className: 'tabular-nums text-sm', cell: (o) => (o.totalWeightKg ? `${qtyFmt(o.totalWeightKg)} kg` : '—') },
    { id: 'value', header: 'Order value', width: '130px', align: 'right', className: 'font-semibold tabular-nums', cell: (o) => inr(o.totals.total) },
    { id: 'edd', header: 'EDD', width: '100px', className: 'text-sm tabular-nums', cell: (o) => (o.edd ? formatDate(o.edd) : '—') },
    { id: 'status', header: 'Status', width: '150px', cell: (o) => <SoPill status={o.status} /> },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (o) => (
        <RowMenu label={`Actions for ${o.soNo}`}>
          {(close) => (
            <>
              <MenuItem icon={Eye} onClick={runAndClose(close, () => setViewing(o.id))}>
                View
              </MenuItem>
              {canDo('edit') && (
                <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(o))}>
                  Edit
                </MenuItem>
              )}
              {canDo('print') && (
                <MenuItem icon={Printer} onClick={runAndClose(close, () => guard('Couldn’t print', () => printSalesDoc('orders', o.id)))}>
                  Print
                </MenuItem>
              )}
              <MenuItem icon={Mail} onClick={runAndClose(close, () => setEmailing(o))}>
                Email
              </MenuItem>
              {canDo('edit') && o.status !== 'cancelled' && (
                <MenuItem icon={Truck} onClick={runAndClose(close, () => setDispatching(o))}>
                  Dispatch details
                </MenuItem>
              )}
              {canDo('edit') && isOpenSo(o.status) && (
                <MenuItem icon={ReceiptText} onClick={runAndClose(close, () => navigate(`/sales/invoices?new=1&so=${o.id}`))}>
                  Create invoice
                </MenuItem>
              )}
              {canDo('delete') && !o.invoiceNos.length && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(o))}>
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
        title="Sales orders"
        description={`${all} orders, ${lakh(sum?.totalPaise ?? 0)}. Invoices are raised against an order’s lines; what’s left shows as the balance.`}
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => guard('Export failed', () => exportSales('orders', { firm, from: url.values.from || undefined, to: url.values.to || undefined }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                New sales order
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <KpiTile label="Pending orders" value={String(all - by('completed') - by('cancelled'))} meta="Not completed or cancelled" />
        <KpiTile label="Completed" value={String(by('completed'))} meta="Fully dispatched" />
        <KpiTile label="Ready for dispatch" value={String(by('ready'))} meta="Awaiting vehicle" />
        <KpiTile label="Cancelled" value={String(by('cancelled'))} meta="Order cancelled" />
      </div>
      <Tabs<'all' | SoStatus> aria-label="Order status" items={[{ value: 'all', label: 'All' }, ...SO_STATUSES.map((s) => ({ value: s, label: SO_STATUS_LABEL[s] }))]} value={tab} onChange={(v) => url.set({ status: v === 'all' ? null : v })} />
      <RegisterFilters url={url} placeholder="SO no., party, PO no." sorts={SORTS} />
      <DataTable
        label="Sales orders"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(o) => o.id}
        minWidth={1180}
        loading={list.isLoading}
        onRowClick={(o) => setViewing(o.id)}
        empty={<EmptyState icon={ClipboardList} title="No sales orders" description={canDo('edit') ? 'Create one, or confirm a proforma invoice.' : undefined} />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <OrderForm
        kind="orders"
        open={form !== null}
        doc={form === 'new' ? null : form}
        onClose={() => setForm(null)}
        onSaved={(d) => {
          setForm(null);
          setViewing(d.id);
        }}
      />
      <OrderDetail
        id={viewing}
        onClose={() => {
          setViewing(null);
          if (url.open) url.set({ open: null });
        }}
        onEdit={(o) => {
          setViewing(null);
          setForm(o);
        }}
        onDispatch={setDispatching}
        onEmail={setEmailing}
      />
      <DispatchForm order={dispatching} onClose={() => setDispatching(null)} />
      <EmailDialog path="orders" id={emailing?.id ?? null} no={emailing?.soNo ?? ''} onClose={() => setEmailing(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.soNo ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: `${toDelete!.soNo} deleted` }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        {toDelete?.piNo ? `Its proforma ${toDelete.piNo} goes back to “sent to party”.` : 'Orders with invoices can’t be deleted; cancel them instead.'}
      </ConfirmDialog>
    </div>
  );
}
