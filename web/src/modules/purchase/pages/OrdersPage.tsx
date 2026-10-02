import { CheckCircle2, ClipboardList, Download, Pencil, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { MATERIAL_BY_ID, MATERIALS, rateUnitOf, type MaterialId, type PoProgress, type PurchaseOrderView } from '@contracts/purchase';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, KpiTile, MenuItem, MenuSeparator, Modal, Pagination, Pill, Select, Textarea, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { Tone } from '@/lib/status';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useDebounced, useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportPos, rupeesToPaise, useApprovePo, useDeletePo, usePurchaseOrders, usePurchaseVendors, useSavePo, useTncOptions } from '../api';
import { printPo } from '../print';
import { EntryStatusPill, inr, inrShort, materialLabel, qtyFmt, useFy } from '../ui';

const PAGE_SIZE = 20;
const PROGRESS_TONE: Record<PoProgress, Tone> = { Open: 'red', Partial: 'amber', Closed: 'green' };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

type Form = { poNo: string; date: string; material: MaterialId; vendorId: string | null; vendorName: string; qty: string; rate: string; remarks: string; tncIds: string[] };

function PoForm({ open, po, onClose }: { open: boolean; po: PurchaseOrderView | null; onClose: () => void }) {
  const toast = useToast();
  const save = useSavePo();
  const tnc = useTncOptions({ enabled: open }).data ?? [];
  const [f, setF] = useState<Form>({ poNo: '', date: today(), material: 'nilgiri', vendorId: null, vendorName: '', qty: '', rate: '', remarks: '', tncIds: [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const vendors = usePurchaseVendors(useDebounced(f.vendorName.trim())).data ?? [];
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      po
        ? { poNo: po.poNo, date: po.date, material: po.material, vendorId: po.vendorId, vendorName: po.vendorName, qty: String(po.qty), rate: String(po.ratePaise / 100), remarks: po.remarks ?? '', tncIds: [...po.tncIds] }
        : { poNo: '', date: today(), material: 'nilgiri', vendorId: null, vendorName: '', qty: '', rate: '', remarks: '', tncIds: [] },
    );
  }, [open, po]);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const mat = MATERIAL_BY_ID[f.material];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.vendorName.trim()) local.vendorName = 'Vendor is required';
    if (!(Number(f.qty) > 0)) local.qty = 'Enter the PO quantity';
    if (Object.keys(local).length) return setErrors(local);
    try {
      const saved = await save.mutateAsync({
        id: po?.id,
        input: { poNo: f.poNo.trim() || null, date: f.date, material: f.material, vendorId: f.vendorId, vendorName: f.vendorName.trim(), qty: Number(f.qty), ratePaise: rupeesToPaise(f.rate || '0'), remarks: f.remarks.trim() || null, tncIds: f.tncIds },
      });
      toast({ tone: 'success', title: po ? `PO ${saved.poNo} updated` : `PO ${saved.poNo} created`, description: po?.status === 'approved' ? 'It needs approval again.' : undefined });
      onClose();
    } catch (err) {
      const fe = fieldErrors(err);
      if ((err as { code?: string }).code === 'po_no_taken') fe.poNo = 'Another PO already has that number';
      setErrors(fe);
      toast({ tone: 'error', title: 'Couldn’t save the PO', description: errorMessage(err) });
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={po ? `Edit PO ${po.poNo}` : 'Create purchase order'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="po-form" loading={save.isPending}>
            {po ? 'Save changes' : 'Create PO'}
          </Button>
        </>
      }
    >
      <form id="po-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3">
        <Input label="PO no." placeholder="Blank = PO-YY-NNN" value={f.poNo} onChange={(e) => set('poNo')(e.target.value.toUpperCase())} error={errors.poNo} />
        <Input label="PO date" type="date" value={f.date} onChange={(e) => set('date')(e.target.value)} />
        <Select label="Material" options={MATERIALS.map((m) => ({ value: m.id, label: m.label }))} value={f.material} onChange={(e) => set('material')(e.target.value as MaterialId)} disabled={!!po && po.receivedQty > 0} />
        <div className="sm:col-span-3">
          <Input
            label="Vendor"
            list="po-vendor-list"
            placeholder="Search the vendor master or type a name"
            value={f.vendorName}
            error={errors.vendorName}
            onChange={(e) => {
              const v = vendors.find((x) => x.name === e.target.value);
              setF((x) => ({ ...x, vendorName: e.target.value, vendorId: v?.id ?? null }));
            }}
          />
          <datalist id="po-vendor-list">
            {vendors.map((v) => (
              <option key={v.id} value={v.name}>
                {[v.code, v.city].filter(Boolean).join(' · ')}
              </option>
            ))}
          </datalist>
        </div>
        <Input label="PO quantity" inputMode="decimal" suffix={mat.unit} value={f.qty} onChange={(e) => set('qty')(e.target.value)} error={errors.qty} />
        <Input label={`Rate per ${rateUnitOf(mat)}`} inputMode="decimal" suffix="₹" value={f.rate} onChange={(e) => set('rate')(e.target.value)} error={errors.ratePaise} />
        <div className="flex flex-col justify-end pb-2 text-sm text-muted">
          Value: <strong className="text-ink">{inr(Math.round(((Number(f.qty) || 0) * rupeesToPaise(f.rate || '0')) / (mat.rateBasis === 'ton' ? 1000 : 1)))}</strong>
        </div>
        <Textarea label="Remarks" rows={2} value={f.remarks} onChange={(e) => set('remarks')(e.target.value)} containerClassName="sm:col-span-3" />
        <fieldset className="flex flex-col gap-1.5 sm:col-span-3">
          <legend className="mb-1 text-sm font-semibold text-ink">Terms and conditions to print</legend>
          {tnc.length === 0 && <p className="text-sm text-muted">No active clauses apply to POs. Add them in Vendors → T&C master.</p>}
          {tnc.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-page">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={f.tncIds.includes(t.id)}
                onChange={(e) => set('tncIds')(e.target.checked ? [...f.tncIds, t.id] : f.tncIds.filter((x) => x !== t.id))}
              />
              <span>
                <span className="font-medium">{t.title}</span>
                {t.summary && <span className="block text-caption text-muted">{t.summary}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      </form>
    </Modal>
  );
}

/** PO register with received quantities and balance (legacy PO module). */
export function OrdersPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['material', 'progress', 'fy'] as const);
  const [search, setSearch] = useSearchParam(url);
  const { fys } = useFy(url.values.fy);
  const list = usePurchaseOrders({
    q: url.q || undefined,
    page: url.page,
    pageSize: PAGE_SIZE,
    filters: { material: (url.values.material || undefined) as MaterialId | undefined, progress: (url.values.progress || undefined) as PoProgress | undefined, fy: url.values.fy || undefined },
  });
  const approve = useApprovePo();
  const remove = useDeletePo();
  const [form, setForm] = useState<PurchaseOrderView | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<PurchaseOrderView | null>(null);
  const stats = list.data?.stats;
  const guard = (title: string, fn: () => Promise<unknown>) => fn().catch((err) => toast({ tone: 'error', title, description: errorMessage(err) }));

  const columns: Column<PurchaseOrderView>[] = [
    {
      id: 'po',
      header: 'PO',
      width: '130px',
      cell: (p) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold">{p.poNo}</span>
          <span className="text-caption text-faint">{formatDate(p.date)}</span>
        </span>
      ),
    },
    { id: 'material', header: 'Material', width: '120px', cell: (p) => materialLabel(p.material) },
    { id: 'vendor', header: 'Vendor', cell: (p) => <span className="block truncate">{p.vendorName}</span> },
    { id: 'qty', header: 'PO qty', width: '110px', align: 'right', className: 'tabular-nums', cell: (p) => `${qtyFmt(p.qty)} ${MATERIAL_BY_ID[p.material].unit}` },
    { id: 'rate', header: 'Rate', width: '110px', align: 'right', className: 'tabular-nums', cell: (p) => inr(p.ratePaise) },
    { id: 'value', header: 'Value', width: '110px', align: 'right', className: 'tabular-nums', cell: (p) => inrShort(p.valuePaise) },
    {
      id: 'received',
      header: 'Received / balance',
      width: '190px',
      cell: (p) => (
        <span className="flex flex-col gap-1">
          <span className="flex justify-between text-caption tabular-nums">
            <span>{qtyFmt(p.receivedQty)}</span>
            <span className="text-muted">bal {qtyFmt(p.balanceQty)}</span>
          </span>
          <span className="h-1.5 rounded-full bg-subtle" role="img" aria-label={`${p.pctComplete}% received`}>
            <span className="block h-full rounded-full bg-chart-s1" style={{ width: `${p.pctComplete}%` }} />
          </span>
        </span>
      ),
    },
    { id: 'progress', header: 'Progress', width: '90px', cell: (p) => <Pill tone={PROGRESS_TONE[p.progress]}>{p.progress}</Pill> },
    { id: 'approval', header: 'Approval', width: '140px', cell: (p) => <EntryStatusPill status={p.status} /> },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (p) => (
        <RowMenu label={`Actions for ${p.poNo}`}>
          {(close) => (
            <>
              {canDo('print') && (
                <MenuItem icon={Printer} onClick={runAndClose(close, () => void guard('Couldn’t print', () => printPo(p.id)))}>
                  Print PO
                </MenuItem>
              )}
              {canDo('edit') && (
                <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(p))}>
                  Edit
                </MenuItem>
              )}
              {canDo('purchase_approve') && p.status === 'pending' && (
                <MenuItem icon={CheckCircle2} onClick={runAndClose(close, () => void guard('Couldn’t approve', () => approve.mutateAsync(p.id).then(() => toast({ tone: 'success', title: `PO ${p.poNo} approved` }))))}>
                  Approve
                </MenuItem>
              )}
              {canDo('delete') && (
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
        title="Purchase orders"
        description="POs with what has been received against them so far."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => void guard('Export failed', exportPos)}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                Create PO
              </Button>
            )}
          </>
        }
      />
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile variant="compact" label="POs" value={stats.total} meta={`${inrShort(stats.valuePaise)} ordered`} />
          <KpiTile variant="compact" label="Open" value={stats.open} meta="Nothing received yet" />
          <KpiTile variant="compact" label="Partly received" value={stats.partial} />
          <KpiTile variant="compact" label="Closed" value={stats.closed} meta="Fully received" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search POs" icon={Search} placeholder="PO no. or vendor" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[240px]" />
        <Select aria-label="Material" placeholder="All materials" options={MATERIALS.map((m) => ({ value: m.id, label: m.label }))} value={url.values.material} onChange={(e) => url.set({ material: e.target.value })} containerClassName="w-[170px]" />
        <Select aria-label="Progress" placeholder="Any progress" options={(['Open', 'Partial', 'Closed'] as const).map((p) => ({ value: p, label: p }))} value={url.values.progress} onChange={(e) => url.set({ progress: e.target.value })} containerClassName="w-[150px]" />
        <Select aria-label="Financial year" placeholder="All years" options={fys.map((x) => ({ value: x, label: `FY ${x}` }))} value={url.values.fy} onChange={(e) => url.set({ fy: e.target.value })} containerClassName="w-[130px]" />
      </div>
      <DataTable
        label="Purchase orders"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(p) => p.id}
        minWidth={1180}
        loading={list.isLoading}
        onRowClick={canDo('edit') ? (p) => setForm(p) : undefined}
        empty={<EmptyState icon={ClipboardList} title="No purchase orders" />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <PoForm open={form !== null} po={form === 'new' ? null : form} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete PO ${toDelete?.poNo ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: `PO ${toDelete!.poNo} deleted` }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete this PO', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        A PO with material received against it can’t be deleted.
      </ConfirmDialog>
    </div>
  );
}

