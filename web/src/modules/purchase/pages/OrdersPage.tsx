import { CheckCircle2, ClipboardCheck, ClipboardList, Download, Pencil, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  amountFor,
  MATERIAL_BY_ID,
  MATERIALS,
  poTotals,
  PURCHASE_GST_RATES,
  rateUnitOf,
  TAX_TYPES,
  type MaterialId,
  type PoProgress,
  type PoStatus,
  type PoTotals,
  type PurchaseOrderView,
  type TaxType,
} from '@contracts/purchase';
import { useSession } from '@/app/session';
import { Button, Combo, DataTable, EmptyState, Input, KpiTile, MenuItem, MenuSeparator, Modal, Pagination, Pill, Select, Textarea, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { Tone } from '@/lib/status';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useDebounced, useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportPos, rupeesToPaise, useApprovePo, useDeletePo, usePurchaseOrders, usePurchaseProducts, usePurchaseVendors, useReviewPo, useSavePo, useTncOptions } from '../api';
import { printPo } from '../print';
import { inr, inrShort, materialLabel, qtyFmt, useFy } from '../ui';

const PAGE_SIZE = 20;
const PROGRESS_TONE: Record<PoProgress, Tone> = { Open: 'red', Partial: 'amber', Closed: 'green' };
const PO_STATUS: Record<PoStatus, { tone: Tone; label: string }> = { pending: { tone: 'amber', label: 'Awaiting review' }, reviewed: { tone: 'purple', label: 'Reviewed' }, approved: { tone: 'green', label: 'Approved' } };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

type PoLineForm = { key: number; itemId: string | null; itemName: string; hsn: string; qty: string; rate: string };
type Form = {
  poNo: string;
  date: string;
  material: MaterialId;
  vendorId: string | null;
  vendorName: string;
  quotationRef: string;
  deliveryDate: string;
  paymentTerms: string;
  deliveryTerms: string;
  taxType: TaxType;
  gstPct: string;
  freight: string;
  remarks: string;
  tncIds: string[];
  lines: PoLineForm[];
};

let seq = 0;
const blankLine = (o: Partial<PoLineForm> = {}): PoLineForm => ({ key: ++seq, itemId: null, itemName: '', hsn: '', qty: '', rate: '', ...o });
const p2r = (p: number) => (p ? String(p / 100) : '');
const emptyPo = (): Form => ({
  poNo: '',
  date: today(),
  material: 'nilgiri',
  vendorId: null,
  vendorName: '',
  quotationRef: '',
  deliveryDate: '',
  paymentTerms: '',
  deliveryTerms: 'FOR our factory',
  taxType: 'SG+CG',
  gstPct: '18',
  freight: '',
  remarks: '',
  tncIds: [],
  lines: [blankLine()],
});
const fromPo = (po: PurchaseOrderView): Form => ({
  poNo: po.poNo,
  date: po.date,
  material: po.material,
  vendorId: po.vendorId,
  vendorName: po.vendorName,
  quotationRef: po.quotationRef ?? '',
  deliveryDate: po.deliveryDate ?? '',
  paymentTerms: po.paymentTerms ?? '',
  deliveryTerms: po.deliveryTerms ?? '',
  taxType: po.taxType,
  gstPct: String(po.gstPct),
  freight: p2r(po.freightPaise),
  remarks: po.remarks ?? '',
  tncIds: [...po.tncIds],
  lines: po.lines.map((l) => blankLine({ itemId: l.itemId, itemName: l.itemName, hsn: l.hsn ?? '', qty: String(l.qty), rate: p2r(l.ratePaise) })),
});

function PoTotalsBlock({ t, gstPct }: { t: PoTotals; gstPct: number }) {
  const row = (k: string, v: number, strong = false) => (
    <div className={`flex justify-between gap-6 ${strong ? 'border-t border-divider pt-1 text-md font-bold' : 'text-sm'}`}>
      <span className={strong ? '' : 'text-muted'}>{k}</span>
      <span className="tabular-nums">{inr(v)}</span>
    </div>
  );
  return (
    <div className="ml-auto flex w-full max-w-xs flex-col gap-1" aria-label="Totals">
      {row('Items', t.itemsPaise)}
      {t.freightPaise > 0 && row('Freight', t.freightPaise)}
      {t.cgst > 0 && row(`CGST ${gstPct / 2}%`, t.cgst)}
      {t.sgst > 0 && row(`SGST ${gstPct / 2}%`, t.sgst)}
      {t.igst > 0 && row(`IGST ${gstPct}%`, t.igst)}
      {row('PO value', t.total, true)}
    </div>
  );
}

/** Create / edit a PO, laid out like a sales order: header, vendor, item lines from the product master, freight and GST. */
function PoForm({ open, po, onClose }: { open: boolean; po: PurchaseOrderView | null; onClose: () => void }) {
  const toast = useToast();
  const save = useSavePo();
  const tnc = useTncOptions({ enabled: open }).data ?? [];
  const products = usePurchaseProducts({ enabled: open }).data ?? [];
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const [f, setF] = useState<Form>(emptyPo);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const vendors = usePurchaseVendors(useDebounced(f.vendorName.trim())).data ?? [];
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(po ? fromPo(po) : emptyPo());
  }, [open, po]);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const mat = MATERIAL_BY_ID[f.material];
  const locked = !!po && po.receivedQty > 0;
  const options = useMemo(() => {
    const opts = products.map((p) => ({ id: p.id, label: p.name, hint: [p.categoryName, p.hsn && `HSN ${p.hsn}`].filter(Boolean).join(' · ') || null }));
    for (const l of f.lines) if (!l.itemId && l.itemName && !opts.some((o) => o.id === `name:${l.itemName}`)) opts.push({ id: `name:${l.itemName}`, label: l.itemName, hint: 'not in the product master' });
    return opts;
  }, [products, f.lines]);
  const setLine = (key: number, p: Partial<PoLineForm>) => setF((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...p } : l)) }));
  function pickProduct(l: PoLineForm, id: string | null) {
    if (!id) return setLine(l.key, { itemId: null, itemName: '', hsn: '' });
    const p = productById.get(id);
    if (!p) return;
    setLine(l.key, { itemId: p.id, itemName: p.name, hsn: p.hsn ?? '' });
    if (p.gstRate !== null && f.lines.length === 1) set('gstPct')(String(p.gstRate));
  }
  function pickVendor(name: string) {
    const v = vendors.find((x) => x.name === name);
    setF((x) => ({ ...x, vendorName: name, vendorId: v?.id ?? null, ...(v ? { taxType: v.suggestedTaxType, paymentTerms: x.paymentTerms || v.paymentTerms || '' } : {}) }));
  }
  const amounts = f.lines.map((l) => amountFor(f.material, Number(l.qty) || 0, rupeesToPaise(l.rate || '0')));
  const totals = poTotals(f.material, f.lines.map((l) => ({ qty: Number(l.qty) || 0, ratePaise: rupeesToPaise(l.rate || '0') })), rupeesToPaise(f.freight || '0'), f.taxType, Number(f.gstPct) || 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.vendorName.trim()) local.vendorName = 'Vendor is required';
    const at = f.lines.map((l, i) => (l.itemName || l.qty || l.rate ? i : -1)).filter((i) => i >= 0);
    if (!at.length) local.lines = 'Add at least one item';
    for (const i of at) {
      if (!f.lines[i]!.itemName) local[`lines.${i}.itemName`] = 'Pick a product';
      if (!(Number(f.lines[i]!.qty) > 0)) local[`lines.${i}.qty`] = 'Enter the quantity';
    }
    if (Object.keys(local).length) return setErrors(local);
    try {
      const saved = await save.mutateAsync({
        id: po?.id,
        input: {
          poNo: f.poNo.trim() || null,
          date: f.date,
          material: f.material,
          vendorId: f.vendorId,
          vendorName: f.vendorName.trim(),
          lines: at.map((i) => {
            const l = f.lines[i]!;
            return { itemId: l.itemId, itemName: l.itemName, hsn: l.hsn.trim() || null, qty: Number(l.qty), ratePaise: rupeesToPaise(l.rate || '0') };
          }),
          taxType: f.taxType,
          gstPct: Number(f.gstPct) || 0,
          freightPaise: rupeesToPaise(f.freight || '0'),
          paymentTerms: f.paymentTerms.trim() || null,
          deliveryTerms: f.deliveryTerms.trim() || null,
          deliveryDate: f.deliveryDate || null,
          quotationRef: f.quotationRef.trim() || null,
          remarks: f.remarks.trim() || null,
          tncIds: f.tncIds,
        },
      });
      toast({ tone: 'success', title: po ? `PO ${saved.poNo} updated` : `PO ${saved.poNo} created`, description: po && po.status !== 'pending' ? 'It needs review and approval again.' : inr(saved.totals.total) });
      onClose();
    } catch (err) {
      const fe = Object.fromEntries(Object.entries(fieldErrors(err)).map(([k, v]) => [k.replace(/^lines\.(\d+)\./, (_m, d: string) => `lines.${at[Number(d)] ?? d}.`), v]));
      if ((err as { code?: string }).code === 'po_no_taken') fe.poNo = 'Another PO already has that number';
      setErrors(fe);
      toast({ tone: 'error', title: 'Couldn’t save the PO', description: errorMessage(err) });
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      closeOnBackdrop={false}
      title={po ? `Edit PO ${po.poNo}` : 'Create purchase order'}
      description={po && po.status !== 'pending' ? 'Saving a change clears the review and approval.' : 'Pick the vendor and items; GST follows the vendor’s state.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="po-form" loading={save.isPending}>
            {po ? 'Save changes' : 'Create PO'}
          </Button>
        </>
      }
    >
      <form id="po-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-4 [&>*]:min-w-0">
          <Input label="PO no." placeholder="Blank = PO-YY-NNN" value={f.poNo} onChange={(e) => set('poNo')(e.target.value.toUpperCase())} error={errors.poNo} />
          <Input label="PO date" type="date" value={f.date} onChange={(e) => set('date')(e.target.value)} error={errors.date} />
          <Select label="Material" options={MATERIALS.map((m) => ({ value: m.id, label: m.label }))} value={f.material} onChange={(e) => set('material')(e.target.value as MaterialId)} disabled={locked} />
          <Input label="Expected delivery" type="date" value={f.deliveryDate} onChange={(e) => set('deliveryDate')(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-4 [&>*]:min-w-0">
          <div className="sm:col-span-2">
            <Input label="Vendor" list="po-vendor-list" placeholder="Search the vendor master or type a name" value={f.vendorName} error={errors.vendorName} onChange={(e) => pickVendor(e.target.value)} />
            <datalist id="po-vendor-list">
              {vendors.map((v) => (
                <option key={v.id} value={v.name}>
                  {[v.code, v.city].filter(Boolean).join(' · ')}
                </option>
              ))}
            </datalist>
          </div>
          <Input label="Quotation ref." value={f.quotationRef} onChange={(e) => set('quotationRef')(e.target.value)} />
          <Select label="Tax type" options={TAX_TYPES.map((t) => ({ value: t, label: t === 'SG+CG' ? 'SG+CG (within Gujarat)' : t === 'IGST' ? 'IGST (interstate)' : 'URD (unregistered)' }))} value={f.taxType} onChange={(e) => set('taxType')(e.target.value as TaxType)} />
          <Input label="Payment terms" value={f.paymentTerms} onChange={(e) => set('paymentTerms')(e.target.value)} />
          <Input label="Delivery terms" value={f.deliveryTerms} onChange={(e) => set('deliveryTerms')(e.target.value)} containerClassName="sm:col-span-3" />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">Items</legend>
          {errors.lines && <p className="text-sm text-primary">{errors.lines}</p>}
          {f.lines.map((l, n) => (
            <div key={l.key} className="grid items-start gap-2 rounded border border-border p-2 sm:grid-cols-[2.6fr_0.8fr_1fr_1fr_auto] [&>*]:min-w-0">
              <Combo label="Product" ariaLabel={`Product, line ${n + 1}`} value={l.itemId ?? (l.itemName ? `name:${l.itemName}` : null)} options={options} onChange={(id) => pickProduct(l, id)} error={errors[`lines.${n}.itemName`]} placeholder="Search the product master" />
              <Input label="HSN" aria-label={`HSN, line ${n + 1}`} value={l.hsn} onChange={(e) => setLine(l.key, { hsn: e.target.value })} />
              <Input label="Qty" aria-label={`Quantity, line ${n + 1}`} inputMode="decimal" suffix={mat.unit} value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} error={errors[`lines.${n}.qty`]} />
              <Input label={`Rate / ${rateUnitOf(mat)} (₹)`} aria-label={`Rate, line ${n + 1}`} inputMode="decimal" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} error={errors[`lines.${n}.ratePaise`]} hint={<span className="tabular-nums">{inr(amounts[n] ?? 0)}</span>} />
              <Button variant="ghost" size="sm" icon={X} className="sm:mt-6" aria-label={`Remove line ${n + 1}`} disabled={f.lines.length === 1} onClick={() => setF((x) => ({ ...x, lines: x.lines.filter((y) => y.key !== l.key) }))} />
            </div>
          ))}
          <Button size="sm" icon={Plus} className="self-start" onClick={() => setF((x) => ({ ...x, lines: [...x.lines, blankLine()] }))}>
            Add item
          </Button>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="grid content-start gap-3 sm:grid-cols-2 [&>*]:min-w-0">
            <Input label="Freight (₹)" inputMode="decimal" value={f.freight} onChange={(e) => set('freight')(e.target.value)} error={errors.freightPaise} />
            <Select label="GST rate" options={PURCHASE_GST_RATES.map((g) => ({ value: String(g), label: `${g}%` }))} value={f.gstPct} onChange={(e) => set('gstPct')(e.target.value)} disabled={f.taxType === 'URD'} />
            <Textarea label="Remarks" rows={2} value={f.remarks} onChange={(e) => set('remarks')(e.target.value)} containerClassName="sm:col-span-2" />
          </div>
          <PoTotalsBlock t={totals} gstPct={Number(f.gstPct) || 0} />
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-semibold text-ink">Terms and conditions to print</legend>
          {tnc.length === 0 && <p className="text-sm text-muted">No active clauses apply to POs. Add them in Vendors → T&C master.</p>}
          {tnc.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-page">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={f.tncIds.includes(t.id)} onChange={(e) => set('tncIds')(e.target.checked ? [...f.tncIds, t.id] : f.tncIds.filter((x) => x !== t.id))} />
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
  const review = useReviewPo();
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
    { id: 'value', header: 'Value', width: '110px', align: 'right', className: 'tabular-nums', cell: (p) => <span title={`${inr(p.totals.total)} with GST`}>{inrShort(p.valuePaise)}</span> },
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
    { id: 'approval', header: 'Approval', width: '140px', cell: (p) => <Pill tone={PO_STATUS[p.status].tone}>{PO_STATUS[p.status].label}</Pill> },
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
              {canDo('edit') && p.status === 'pending' && (
                <MenuItem icon={ClipboardCheck} onClick={runAndClose(close, () => void guard('Couldn’t review', () => review.mutateAsync(p.id).then(() => toast({ tone: 'success', title: `PO ${p.poNo} reviewed` }))))}>
                  Mark reviewed
                </MenuItem>
              )}
              {canDo('purchase_approve') && p.status !== 'approved' && (
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

