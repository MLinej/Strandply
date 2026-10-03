import { Check, Download, Eye, Mail, Pencil, Plus, Printer, ReceiptText, RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { APPROVAL_LABEL, APPROVAL_STATUSES, type ApprovalStatus, type SalesInvoiceView } from '@contracts/sales';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, KpiTile, MenuItem, MenuSeparator, Modal, Pagination, Tabs, Textarea, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage } from '../../samples/ui/errors';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportSales, useDecideInvoice, useDeleteRecord, useDocList, useDocOne } from '../api';
import { InvoiceLines } from '../components/DocLines';
import { EmailDialog } from '../components/EmailDialog';
import { InvoiceForm } from '../components/InvoiceForm';
import { RegisterFilters, useRegister } from '../components/RegisterFilters';
import { printSalesDoc } from '../print';
import { ApprovalPill, FirmPill, inr, lakh, qtyFmt, stamp, TotalsBlock, useShowFirm } from '../ui';

const PAGE_SIZE = 20;
const SORTS: [string, string][] = [
  ['-date', 'Newest first'],
  ['date', 'Oldest first'],
  ['-invNo', 'Invoice no. (high → low)'],
  ['billTo', 'Bill to (A → Z)'],
  ['-totalPaise', 'Highest value'],
];
type Decision = 'approve' | 'reject' | 'reopen';

function InvoiceDetail({ id, onClose, onEdit, onEmail, onDecide }: { id: string | null; onClose: () => void; onEdit: (i: SalesInvoiceView) => void; onEmail: (i: SalesInvoiceView) => void; onDecide: (i: SalesInvoiceView, d: Decision) => void }) {
  const toast = useToast();
  const { canDo } = useSession();
  const i = useDocOne('invoices', id).data;
  return (
    <Modal
      open={!!id}
      onClose={onClose}
      size="xl"
      title={i ? `Sales invoice ${i.invNo}` : 'Sales invoice'}
      description={i ? `${formatDate(i.date)} · ${i.billTo}` : undefined}
      footer={
        i && (
          <>
            {canDo('print') && (
              <Button icon={Printer} onClick={() => void printSalesDoc('invoices', i.id).catch((err) => toast({ tone: 'error', title: 'Couldn’t print', description: errorMessage(err) }))}>
                Print
              </Button>
            )}
            <Button icon={Mail} onClick={() => onEmail(i)}>
              Email
            </Button>
            {canDo('edit') && i.approval !== 'approved' && (
              <Button icon={Pencil} onClick={() => onEdit(i)}>
                Edit
              </Button>
            )}
            {canDo('sales_approve') && i.approval === 'approved' && (
              <Button icon={RotateCcw} onClick={() => onDecide(i, 'reopen')}>
                Reopen
              </Button>
            )}
            {canDo('sales_approve') && i.approval === 'pending' && (
              <>
                <Button icon={X} onClick={() => onDecide(i, 'reject')}>
                  Reject
                </Button>
                <Button variant="primary" icon={Check} onClick={() => onDecide(i, 'approve')}>
                  Approve
                </Button>
              </>
            )}
          </>
        )
      }
    >
      {!i ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <ApprovalPill status={i.approval} />
            <FirmPill firm={i.firm} />
            {i.soId && (
              <Link to={`/sales/orders?open=${i.soId}`} className="text-sm font-medium text-primary hover:underline">
                Sales order {i.soNo}
              </Link>
            )}
            {i.approval === 'approved' && i.approvedAt && <span className="text-sm text-muted">Approved by {i.approvedByName ?? '—'}, {stamp(i.approvedAt)}</span>}
            {i.approval === 'rejected' && i.approvalNote && <span className="text-sm text-primary">Rejected: “{i.approvalNote}”</span>}
          </div>
          <DetailList
            cols={3}
            items={[
              { label: 'Bill to', value: i.billTo },
              { label: 'Ship to', value: `${i.shipTo}${i.city || i.state ? ` · ${[i.city, i.state].filter(Boolean).join(', ')}` : ''}` },
              { label: 'Tax type', value: i.taxType },
              { label: 'Customer PO', value: i.poNo },
              { label: 'E-way bill', value: i.ewayBill ?? 'Not generated' },
              { label: 'IRN', value: i.irn ?? 'Not generated' },
              { label: 'Weight', value: `${qtyFmt(i.tons)} t${i.weightTons === null ? ' (from board sizes)' : ''}` },
              { label: 'Entered by', value: i.createdByName },
              { label: 'Remarks', value: i.remarks, wide: true },
            ]}
          />
          <InvoiceLines lines={i.lines} />
          <TotalsBlock t={i.totals} gstPct={i.gstPct} label="Invoice total" />
        </div>
      )}
    </Modal>
  );
}

/** Sales invoices (legacy sales_invoices): raised against orders, approved by whoever has sales_approve. */
export function InvoicesPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const showFirm = useShowFirm();
  const { url, query, firm } = useRegister(PAGE_SIZE);
  const tab = (url.values.status || 'all') as 'all' | ApprovalStatus;
  const list = useDocList('invoices', query);
  const sum = list.data?.summary;
  const remove = useDeleteRecord('invoices');
  const decide = useDecideInvoice();
  const [form, setForm] = useState<SalesInvoiceView | 'new' | null>(null);
  const [presetSo, setPresetSo] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(url.open);
  const [emailing, setEmailing] = useState<SalesInvoiceView | null>(null);
  const [deciding, setDeciding] = useState<{ inv: SalesInvoiceView; decision: Decision } | null>(null);
  const [note, setNote] = useState('');
  const [toDelete, setToDelete] = useState<SalesInvoiceView | null>(null);
  const guard = (t: string, fn: () => Promise<unknown>) => void fn().catch((err) => toast({ tone: 'error', title: t, description: errorMessage(err) }));

  // ?new=1&so=<order id> comes from an order's "Create invoice".
  useEffect(() => {
    if (url.values.new && canDo('edit')) {
      setPresetSo(url.values.so || null);
      setForm('new');
      url.set({ new: null, so: null });
    }
  }, [url.values.new]);
  useEffect(() => {
    if (url.open) setViewing(url.open);
  }, [url.open]);

  const startDecision = (inv: SalesInvoiceView, decision: Decision) => {
    setNote('');
    setDeciding({ inv, decision });
  };
  const columns: Column<SalesInvoiceView>[] = [
    {
      id: 'no',
      header: 'Invoice',
      width: '130px',
      cell: (i) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold tabular-nums">{i.invNo}</span>
          <span className="text-caption text-faint">{formatDate(i.date)}</span>
        </span>
      ),
    },
    ...(showFirm ? [{ id: 'firm', header: 'Firm', width: '64px', cell: (i: SalesInvoiceView) => <FirmPill firm={i.firm} /> }] : []),
    {
      id: 'party',
      header: 'Bill to / ship to',
      cell: (i) => (
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{i.billTo}</span>
          {i.shipTo !== i.billTo && <span className="text-caption text-muted">→ {i.shipTo}</span>}
        </span>
      ),
    },
    { id: 'so', header: 'SO', width: '110px', className: 'text-sm tabular-nums', cell: (i) => i.soNo ?? '—' },
    { id: 'items', header: 'Items', width: '64px', align: 'right', className: 'tabular-nums', cell: (i) => i.lines.length },
    { id: 'taxable', header: 'Taxable', width: '120px', align: 'right', className: 'tabular-nums text-sm', cell: (i) => inr(i.totals.taxablePaise) },
    { id: 'gst', header: 'GST', width: '110px', align: 'right', className: 'tabular-nums text-sm', cell: (i) => inr(i.totals.gstPaise) },
    { id: 'total', header: 'Total', width: '130px', align: 'right', className: 'font-semibold tabular-nums', cell: (i) => inr(i.totals.total) },
    { id: 'approval', header: 'Approval', width: '140px', cell: (i) => <ApprovalPill status={i.approval} /> },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (i) => (
        <RowMenu label={`Actions for ${i.invNo}`}>
          {(close) => (
            <>
              <MenuItem icon={Eye} onClick={runAndClose(close, () => setViewing(i.id))}>
                View
              </MenuItem>
              {canDo('edit') && i.approval !== 'approved' && (
                <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(i))}>
                  Edit
                </MenuItem>
              )}
              {canDo('print') && (
                <MenuItem icon={Printer} onClick={runAndClose(close, () => guard('Couldn’t print', () => printSalesDoc('invoices', i.id)))}>
                  Print
                </MenuItem>
              )}
              <MenuItem icon={Mail} onClick={runAndClose(close, () => setEmailing(i))}>
                Email
              </MenuItem>
              {canDo('sales_approve') && i.approval === 'pending' && (
                <MenuItem icon={Check} onClick={runAndClose(close, () => startDecision(i, 'approve'))}>
                  Approve
                </MenuItem>
              )}
              {canDo('delete') && i.approval !== 'approved' && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(i))}>
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

  const verb = { approve: 'Approve', reject: 'Reject', reopen: 'Reopen' } as const;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Sales invoices"
        description="Tax invoices against sales orders. Approved invoices are locked."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => guard('Export failed', () => exportSales('invoices', { firm, from: url.values.from || undefined, to: url.values.to || undefined }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button
                variant="primary"
                icon={Plus}
                onClick={() => {
                  setPresetSo(null);
                  setForm('new');
                }}
              >
                New invoice
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <KpiTile label="Invoice value" value={lakh(sum?.totalPaise ?? 0)} meta={`${sum?.count ?? 0} invoices`} />
        <KpiTile label="Pending approval" value={String(sum?.byStatus.pending ?? 0)} meta="Awaiting sign-off" />
        <KpiTile label="GST" value={lakh(sum?.gstPaise ?? 0)} meta="CGST + SGST + IGST" />
        <KpiTile label="Average invoice" value={lakh(sum?.count ? Math.round(sum.totalPaise / sum.count) : 0)} meta="Per invoice" />
      </div>
      <Tabs<'all' | ApprovalStatus> aria-label="Approval" items={[{ value: 'all', label: 'All' }, ...APPROVAL_STATUSES.map((s) => ({ value: s, label: APPROVAL_LABEL[s] }))]} value={tab} onChange={(v) => url.set({ status: v === 'all' ? null : v })} />
      <RegisterFilters url={url} placeholder="Invoice no., party, SO, e-way bill" sorts={SORTS} />
      <DataTable
        label="Sales invoices"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(i) => i.id}
        minWidth={1200}
        loading={list.isLoading}
        onRowClick={(i) => setViewing(i.id)}
        empty={<EmptyState icon={ReceiptText} title="No invoices" description="Raise one from a sales order." />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <InvoiceForm
        open={form !== null}
        doc={form === 'new' ? null : form}
        soId={presetSo}
        onClose={() => setForm(null)}
        onSaved={(d) => {
          setForm(null);
          setViewing(d.id);
        }}
      />
      <InvoiceDetail
        id={viewing}
        onClose={() => {
          setViewing(null);
          if (url.open) url.set({ open: null });
        }}
        onEdit={(i) => {
          setViewing(null);
          setForm(i);
        }}
        onEmail={setEmailing}
        onDecide={startDecision}
      />
      <EmailDialog path="invoices" id={emailing?.id ?? null} no={emailing?.invNo ?? ''} onClose={() => setEmailing(null)} />
      <ConfirmDialog
        open={!!deciding}
        title={deciding ? `${verb[deciding.decision]} ${deciding.inv.invNo}?` : ''}
        confirmLabel={deciding ? verb[deciding.decision] : ''}
        danger={deciding?.decision === 'reject'}
        busy={decide.isPending}
        onConfirm={() => {
          if (deciding?.decision === 'reject' && !note.trim()) return toast({ tone: 'error', title: 'Give a reason for rejecting' });
          void decide
            .mutateAsync({ id: deciding!.inv.id, decision: deciding!.decision, note: note.trim() || null })
            .then((r) => toast({ tone: 'success', title: `${r.invNo}: ${APPROVAL_LABEL[r.approval]}` }))
            .catch((err) => toast({ tone: 'error', title: 'Couldn’t update', description: errorMessage(err) }))
            .finally(() => setDeciding(null));
        }}
        onClose={() => setDeciding(null)}
      >
        <div className="flex flex-col gap-2">
          <span>
            {deciding?.decision === 'approve' && 'An approved invoice is locked; reopen it to correct.'}
            {deciding?.decision === 'reject' && 'The invoice goes back to whoever raised it; editing it sends it for approval again.'}
            {deciding?.decision === 'reopen' && 'It goes back to pending approval and can be edited.'}
          </span>
          <Textarea label={deciding?.decision === 'reject' ? 'Reason' : 'Note (optional)'} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.invNo ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: `${toDelete!.invNo} deleted` }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        Its quantities go back to the order’s balance. Approved invoices can’t be deleted.
      </ConfirmDialog>
    </div>
  );
}
