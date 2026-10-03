import { ArrowDownToLine, ArrowUpFromLine, Download, Eye, FileText, MessageCircle, Printer, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SlipType, SlipView } from '@contracts/stock';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, MenuItem, MenuSeparator, Modal, Pagination, Tabs, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportStock, useDeleteSlip, useSlip, useSlips } from '../api';
import { SlipForm } from '../components/SlipForm';
import { printSlip, shareSlip } from '../print';
import { KindPill, qtyFmt, skuDetail, SLIP_TYPE_LABEL } from '../ui';

const PAGE_SIZE = 20;
type Tab = 'all' | SlipType;

function Leg({ sign, sku, info }: { sign: '−' | '+'; sku: string; info: SlipView['fromInfo'] }) {
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="font-semibold tabular-nums">
        <span className={sign === '−' ? 'text-primary' : 'text-green'}>{sign}</span> {sku}
      </span>
      <span className="truncate text-caption text-faint">{info?.dept ?? '—'}</span>
    </span>
  );
}

/** One slip with its Miracle entry (legacy slipCardHtml). */
export function SlipDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const toast = useToast();
  const { canDo } = useSession();
  const s = useSlip(id).data;
  return (
    <Modal
      open={!!id}
      onClose={onClose}
      size="lg"
      title={s ? `${s.slipNo}` : 'Slip'}
      description={s ? SLIP_TYPE_LABEL[s.type] : undefined}
      footer={
        s && (
          <>
            <Button icon={MessageCircle} onClick={() => shareSlip(s)}>
              WhatsApp
            </Button>
            {canDo('print') && (
              <Button icon={Printer} onClick={() => void printSlip(s.id).catch((err) => toast({ tone: 'error', title: 'Couldn’t print', description: errorMessage(err) }))}>
                Print slip
              </Button>
            )}
          </>
        )
      }
    >
      {!s ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded border border-border" aria-label="Miracle entry">
            {[
              { sign: '−' as const, ref: s.from, info: s.fromInfo, dir: 'From' },
              { sign: '+' as const, ref: s.to, info: s.toInfo, dir: 'To' },
            ].map((l) => (
              <div key={l.sign} className="flex items-start gap-3 border-b border-divider px-3 py-2 last:border-0">
                <span className={l.sign === '−' ? 'w-16 shrink-0 font-semibold text-primary' : 'w-16 shrink-0 font-semibold text-green'}>{l.sign === '−' ? 'MINUS −' : 'PLUS +'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold tabular-nums">{l.ref.sku}</span>
                  <span className="block text-caption text-muted">{l.info ? skuDetail(l.info) : 'Item no longer in the master'}</span>
                  <span className="block text-caption text-faint">
                    {l.dir}: {l.info?.dept ?? '—'}
                  </span>
                </span>
                <span className={l.sign === '−' ? 'font-bold tabular-nums text-primary' : 'font-bold tabular-nums text-green'}>
                  {l.sign} {qtyFmt(s.qty)} {l.info?.unit}
                </span>
              </div>
            ))}
          </div>
          <DetailList
            cols={3}
            items={[
              { label: 'Date', value: formatDate(s.date) },
              { label: 'Against PR / SO', value: s.refNo },
              { label: 'Shift', value: s.shift },
              { label: 'Batch', value: s.batch },
              { label: 'Entered by', value: s.createdByName },
              { label: 'Remarks', value: s.remarks, wide: true },
            ]}
          />
        </div>
      )}
    </Modal>
  );
}

/** Stock slips register (legacy History) with the SIS / SRS form. `?new=SIS|SRS` opens the form. */
export function SlipsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['type', 'from', 'to', 'new'] as const);
  const [search, setSearch] = useSearchParam(url);
  const tab = (url.values.type || 'all') as Tab;
  const filters = { type: tab === 'all' ? undefined : tab, from: url.values.from || undefined, to: url.values.to || undefined };
  const list = useSlips({ q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE, filters });
  const remove = useDeleteSlip();
  const [form, setForm] = useState<SlipType | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<SlipView | null>(null);
  const guard = (title: string, fn: () => Promise<unknown>) => void fn().catch((err) => toast({ tone: 'error', title, description: errorMessage(err) }));

  useEffect(() => {
    const t = url.values.new;
    if ((t === 'SIS' || t === 'SRS') && canDo('edit')) {
      setForm(t);
      url.set({ new: null });
    }
    // Only when the link changes.
  }, [url.values.new]);

  const columns: Column<SlipView>[] = [
    {
      id: 'no',
      header: 'Slip',
      width: '150px',
      cell: (s) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold tabular-nums">{s.slipNo}</span>
          <span className="text-caption text-faint">{formatDate(s.date)}</span>
        </span>
      ),
    },
    { id: 'type', header: 'Type', width: '70px', cell: (s) => <KindPill kind={s.type} /> },
    { id: 'from', header: 'From (−)', cell: (s) => <Leg sign="−" sku={s.from.sku} info={s.fromInfo} /> },
    { id: 'to', header: 'To (+)', cell: (s) => <Leg sign="+" sku={s.to.sku} info={s.toInfo} /> },
    { id: 'qty', header: 'Qty', width: '100px', align: 'right', className: 'font-semibold tabular-nums', cell: (s) => `${qtyFmt(s.qty)} ${s.fromInfo?.unit ?? ''}` },
    {
      id: 'ref',
      header: 'Ref / batch',
      width: '170px',
      cell: (s) => (
        <span className="flex flex-col leading-tight">
          <span className="truncate">{s.refNo ?? '—'}</span>
          <span className="text-caption text-faint">
            {s.batch}
            {s.shift ? ` · ${s.shift}` : ''}
          </span>
        </span>
      ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (s) => (
        <RowMenu label={`Actions for ${s.slipNo}`}>
          {(close) => (
            <>
              <MenuItem icon={Eye} onClick={runAndClose(close, () => setViewing(s.id))}>
                View
              </MenuItem>
              {canDo('print') && (
                <MenuItem icon={Printer} onClick={runAndClose(close, () => guard('Couldn’t print', () => printSlip(s.id)))}>
                  Print slip
                </MenuItem>
              )}
              <MenuItem icon={MessageCircle} onClick={runAndClose(close, () => shareSlip(s))}>
                WhatsApp
              </MenuItem>
              {canDo('delete') && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(s))}>
                    Reverse
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
        title="Stock slips"
        description="Issue (SIS) and receipt (SRS) slips. Each one takes stock off one SKU and puts it on another."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => guard('Export failed', () => exportStock('slips', { q: url.q || undefined, ...filters }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <>
                <Button icon={ArrowUpFromLine} onClick={() => setForm('SRS')}>
                  New SRS
                </Button>
                <Button variant="primary" icon={ArrowDownToLine} onClick={() => setForm('SIS')}>
                  New SIS
                </Button>
              </>
            )}
          </>
        }
      />
      <Tabs<Tab>
        aria-label="Slip type"
        items={[
          { value: 'all', label: 'All' },
          { value: 'SIS', label: 'Issues (SIS)' },
          { value: 'SRS', label: 'Receipts (SRS)' },
        ]}
        value={tab}
        onChange={(v) => url.set({ type: v === 'all' ? null : v })}
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search slips" icon={Search} placeholder="Slip no., SKU, batch, PR ref" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[260px]" />
        <Input aria-label="From date" type="date" value={url.values.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={url.values.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
      </div>
      <DataTable
        label="Stock slips"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(s) => s.id}
        minWidth={1000}
        loading={list.isLoading}
        onRowClick={(s) => setViewing(s.id)}
        empty={<EmptyState icon={FileText} title="No slips" description="Create an SIS or SRS to move stock." />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <SlipForm
        type={form}
        onClose={() => setForm(null)}
        onSaved={(s) => {
          setForm(null);
          setViewing(s.id);
        }}
      />
      <SlipDetail id={viewing} onClose={() => setViewing(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Reverse ${toDelete?.slipNo ?? ''}?`}
        confirmLabel="Reverse"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: `${toDelete!.slipNo} reversed` }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t reverse this slip', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        {toDelete && `${qtyFmt(toDelete.qty)} goes back from ${toDelete.to.sku} to ${toDelete.from.sku}. This is only possible while ${toDelete.to.sku} still holds it.`}
      </ConfirmDialog>
    </div>
  );
}
