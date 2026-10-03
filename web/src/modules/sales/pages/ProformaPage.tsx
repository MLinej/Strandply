import { CheckCheck, Download, Eye, FileText, Mail, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { PI_STATUS_LABEL, PI_STATUSES, type PiStatus, type ProformaView } from '@contracts/sales';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, KpiTile, MenuItem, MenuSeparator, Modal, Pagination, Select, Tabs, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage } from '../../samples/ui/errors';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportSales, useConfirmProforma, useDeleteRecord, useDocList, useDocOne, useDocStatus } from '../api';
import { OrderLines } from '../components/DocLines';
import { EmailDialog } from '../components/EmailDialog';
import { OrderForm } from '../components/OrderForm';
import { RegisterFilters, useRegister } from '../components/RegisterFilters';
import { printSalesDoc } from '../print';
import { FirmPill, inr, lakh, PiPill, TotalsBlock, useShowFirm } from '../ui';

const PAGE_SIZE = 20;
const SORTS: [string, string][] = [
  ['-date', 'Newest first'],
  ['date', 'Oldest first'],
  ['-piNo', 'PI no. (high → low)'],
  ['billTo', 'Bill to (A → Z)'],
  ['-totalPaise', 'Highest value'],
];
const editable = (p: ProformaView) => p.status !== 'confirmed' && p.status !== 'cancelled';

function ProformaDetail({ id, onClose, onEdit, onEmail, onConfirm }: { id: string | null; onClose: () => void; onEdit: (p: ProformaView) => void; onEmail: (p: ProformaView) => void; onConfirm: (p: ProformaView) => void }) {
  const toast = useToast();
  const { canDo } = useSession();
  const p = useDocOne('proformas', id).data;
  const status = useDocStatus('proformas');
  return (
    <Modal
      open={!!id}
      onClose={onClose}
      size="xl"
      title={p ? `Proforma invoice ${p.piNo}` : 'Proforma invoice'}
      description={p ? `${formatDate(p.date)} · ${p.billTo}` : undefined}
      footer={
        p && (
          <>
            {canDo('print') && (
              <Button icon={Printer} onClick={() => void printSalesDoc('proformas', p.id).catch((err) => toast({ tone: 'error', title: 'Couldn’t print', description: errorMessage(err) }))}>
                Print
              </Button>
            )}
            <Button icon={Mail} onClick={() => onEmail(p)}>
              Email
            </Button>
            {canDo('edit') && editable(p) && (
              <Button icon={Pencil} onClick={() => onEdit(p)}>
                Edit
              </Button>
            )}
            {canDo('edit') && editable(p) && (
              <Button variant="primary" icon={CheckCheck} onClick={() => onConfirm(p)}>
                Confirm → sales order
              </Button>
            )}
          </>
        )
      }
    >
      {!p ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <PiPill status={p.status} />
            <FirmPill firm={p.firm} />
            {p.soId && (
              <Link to={`/sales/orders?open=${p.soId}`} className="text-sm font-medium text-primary hover:underline">
                Sales order {p.soNo}
              </Link>
            )}
            {canDo('edit') && p.status !== 'confirmed' && (
              <Select
                aria-label="Change status"
                options={(['draft', 'sent', 'cancelled'] as const).map((s) => ({ value: s, label: PI_STATUS_LABEL[s] }))}
                value={p.status}
                onChange={(e) =>
                  void status
                    .mutateAsync({ id: p.id, status: e.target.value })
                    .then(() => toast({ tone: 'success', title: `${p.piNo}: ${PI_STATUS_LABEL[e.target.value as PiStatus]}` }))
                    .catch((err) => toast({ tone: 'error', title: 'Couldn’t change the status', description: errorMessage(err) }))
                }
                containerClassName="ml-auto w-[180px]"
              />
            )}
          </div>
          <DetailList
            cols={3}
            items={[
              { label: 'Bill to', value: p.billTo },
              { label: 'Ship to', value: `${p.shipTo}${p.city || p.state ? ` · ${[p.city, p.state].filter(Boolean).join(', ')}` : ''}` },
              { label: 'Tax type', value: p.taxType },
              { label: 'Valid until', value: p.validUntil ? formatDate(p.validUntil) : null },
              { label: 'Party’s PO ref', value: p.poRef },
              { label: 'Sales person', value: p.salesPerson },
              { label: 'Payment terms', value: p.paymentTerms },
              { label: 'Delivery terms', value: p.deliveryTerms },
              { label: 'Entered by', value: p.createdByName },
              { label: 'Remarks', value: p.remarks, wide: true },
            ]}
          />
          <OrderLines lines={p.lines} />
          <TotalsBlock t={p.totals} gstPct={p.gstPct} label="Total value" />
        </div>
      )}
    </Modal>
  );
}

/** Proforma invoices (legacy proforma_invoice): PI → confirm → sales order → invoice. */
export function ProformaPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const showFirm = useShowFirm();
  const { url, query, firm } = useRegister(PAGE_SIZE);
  const tab = (url.values.status || 'all') as 'all' | PiStatus;
  const list = useDocList('proformas', query);
  const sum = list.data?.summary;
  const all = sum?.count ?? 0;
  const confirmed = sum?.byStatus.confirmed ?? 0;
  const cancelled = sum?.byStatus.cancelled ?? 0;
  const remove = useDeleteRecord('proformas');
  const confirmPi = useConfirmProforma();
  const [form, setForm] = useState<ProformaView | 'new' | null>(null);
  const [viewing, setViewing] = useState<string | null>(url.open);
  const [emailing, setEmailing] = useState<ProformaView | null>(null);
  const [toConfirm, setToConfirm] = useState<ProformaView | null>(null);
  const [toDelete, setToDelete] = useState<ProformaView | null>(null);
  const guard = (t: string, fn: () => Promise<unknown>) => void fn().catch((err) => toast({ tone: 'error', title: t, description: errorMessage(err) }));

  useEffect(() => {
    if (url.values.new && canDo('edit')) {
      setForm('new');
      url.set({ new: null });
    }
  }, [url.values.new]);

  const columns: Column<ProformaView>[] = [
    {
      id: 'no',
      header: 'PI',
      width: '130px',
      cell: (p) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold tabular-nums">{p.piNo}</span>
          <span className="text-caption text-faint">{formatDate(p.date)}</span>
        </span>
      ),
    },
    ...(showFirm ? [{ id: 'firm', header: 'Firm', width: '64px', cell: (p: ProformaView) => <FirmPill firm={p.firm} /> }] : []),
    { id: 'valid', header: 'Valid until', width: '110px', className: 'text-sm tabular-nums', cell: (p) => (p.validUntil ? formatDate(p.validUntil) : '—') },
    {
      id: 'party',
      header: 'Bill to / ship to',
      cell: (p) => (
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{p.billTo}</span>
          {p.shipTo !== p.billTo && <span className="text-caption text-muted">→ {p.shipTo}</span>}
        </span>
      ),
    },
    { id: 'items', header: 'Items', width: '70px', align: 'right', className: 'tabular-nums', cell: (p) => p.lines.length },
    { id: 'value', header: 'Total value', width: '130px', align: 'right', className: 'font-semibold tabular-nums', cell: (p) => inr(p.totals.total) },
    { id: 'status', header: 'Status', width: '130px', cell: (p) => <PiPill status={p.status} /> },
    { id: 'so', header: 'Sales order', width: '120px', className: 'text-sm tabular-nums', cell: (p) => p.soNo ?? '—' },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (p) => (
        <RowMenu label={`Actions for ${p.piNo}`}>
          {(close) => (
            <>
              <MenuItem icon={Eye} onClick={runAndClose(close, () => setViewing(p.id))}>
                View
              </MenuItem>
              {canDo('edit') && editable(p) && (
                <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(p))}>
                  Edit
                </MenuItem>
              )}
              {canDo('print') && (
                <MenuItem icon={Printer} onClick={runAndClose(close, () => guard('Couldn’t print', () => printSalesDoc('proformas', p.id)))}>
                  Print
                </MenuItem>
              )}
              <MenuItem icon={Mail} onClick={runAndClose(close, () => setEmailing(p))}>
                Email
              </MenuItem>
              {canDo('edit') && editable(p) && (
                <MenuItem icon={CheckCheck} onClick={runAndClose(close, () => setToConfirm(p))}>
                  Confirm → sales order
                </MenuItem>
              )}
              {canDo('delete') && p.status !== 'confirmed' && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(p))}>
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
        title="Proforma invoices"
        description="Quote the party; once they accept, confirm it into a sales order."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => guard('Export failed', () => exportSales('proformas', { firm, from: url.values.from || undefined, to: url.values.to || undefined }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                New proforma
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <KpiTile label="Proformas" value={String(all)} meta={`${lakh(sum?.totalPaise ?? 0)} total value`} />
        <KpiTile label="Confirmed → SO" value={String(confirmed)} meta="Turned into sales orders" />
        <KpiTile label="Awaiting confirmation" value={String(all - confirmed - cancelled)} meta="Draft or sent to party" />
        <KpiTile label="Conversion" value={`${all ? Math.round((confirmed / all) * 100) : 0}%`} meta="Proformas confirmed" />
      </div>
      <Tabs<'all' | PiStatus> aria-label="Proforma status" items={[{ value: 'all', label: 'All' }, ...PI_STATUSES.map((s) => ({ value: s, label: PI_STATUS_LABEL[s] }))]} value={tab} onChange={(v) => url.set({ status: v === 'all' ? null : v })} />
      <RegisterFilters url={url} placeholder="PI no., party, PO ref" sorts={SORTS} />
      <DataTable
        label="Proforma invoices"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(p) => p.id}
        minWidth={1060}
        loading={list.isLoading}
        onRowClick={(p) => setViewing(p.id)}
        empty={<EmptyState icon={FileText} title="No proforma invoices" description="Create one to quote a party; confirm it into a sales order when they accept." />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <OrderForm
        kind="proformas"
        open={form !== null}
        doc={form === 'new' ? null : form}
        onClose={() => setForm(null)}
        onSaved={(d) => {
          setForm(null);
          setViewing(d.id);
        }}
      />
      <ProformaDetail
        id={viewing}
        onClose={() => {
          setViewing(null);
          if (url.open) url.set({ open: null });
        }}
        onEdit={(p) => {
          setViewing(null);
          setForm(p);
        }}
        onEmail={setEmailing}
        onConfirm={setToConfirm}
      />
      <EmailDialog path="proformas" id={emailing?.id ?? null} no={emailing?.piNo ?? ''} onClose={() => setEmailing(null)} />
      <ConfirmDialog
        open={!!toConfirm}
        title={`Confirm ${toConfirm?.piNo ?? ''}?`}
        confirmLabel="Create sales order"
        busy={confirmPi.isPending}
        onConfirm={() =>
          void confirmPi
            .mutateAsync(toConfirm!.id)
            .then((r) => {
              toast({ tone: 'success', title: `Sales order ${r.order.soNo} created`, description: `${toConfirm!.piNo} is now confirmed and locked.` });
              setViewing(r.proforma.id);
            })
            .catch((err) => toast({ tone: 'error', title: 'Couldn’t confirm', description: errorMessage(err) }))
            .finally(() => setToConfirm(null))
        }
        onClose={() => setToConfirm(null)}
      >
        A confirmed sales order is made with the same parties, items and total, dated today. The proforma can’t be edited afterwards.
      </ConfirmDialog>
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.piNo ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: `${toDelete!.piNo} deleted` }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        This removes the proforma. Confirmed proformas can’t be deleted.
      </ConfirmDialog>
    </div>
  );
}
