import { Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  docTotals,
  effectiveEntry,
  lineAmount,
  PI_STATUS_LABEL,
  rateSqftOf,
  round4,
  SO_STATUS_LABEL,
  SO_STATUSES,
  taxTypeFor,
  type Firm,
  type OrderLine,
  type ProformaView,
  type SalesOrderView,
} from '@contracts/sales';
import { Button, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useSalesMeta, useSalesOptions, useSaveDoc } from '../api';
import { FirmSelect, inr, qtyFmt, rupeesText, toPaise, TotalsBlock, useDefaultFirm } from '../ui';
import { Combo } from './Combo';

type Kind = 'proformas' | 'orders';
type Doc = ProformaView | SalesOrderView;
type Line = { key: number; itemId: string | null; brand: string; pcs: string; sqm: string; rate: string; weight: string };
interface Form {
  firm: Firm;
  date: string;
  billToId: string | null;
  shipToId: string | null;
  salesPerson: string;
  paymentTerms: string;
  deliveryTerms: string;
  freight: string;
  gstPct: string;
  remarks: string;
  status: string;
  // Proforma
  validUntil: string;
  poRef: string;
  // Order
  poNo: string;
  poDate: string;
  edd: string;
  lines: Line[];
}

let seq = 0;
const blank = (o: Partial<Line> = {}): Line => ({ key: ++seq, itemId: null, brand: '', pcs: '', sqm: '', rate: '', weight: '', ...o });
const fromLine = (l: OrderLine): Line => blank({ itemId: l.itemId, brand: l.brand ?? '', pcs: String(l.pcs), sqm: String(l.qtySqm), rate: rupeesText(l.ratePaise), weight: l.weightKg ? String(l.weightKg) : '' });

/**
 * Proforma and sales order form (legacy openPiModal / openSoModal: same fields). Picking an item fills the
 * rate from the Price List and the weight from the Weight Chart as of the document date (else the item's
 * default rate); pcs × the item's sq m factor fills the sq m, which stays editable.
 */
export function OrderForm({ kind, open, doc, onClose, onSaved }: { kind: Kind; open: boolean; doc: Doc | null; onClose: () => void; onSaved: (d: Doc) => void }) {
  const toast = useToast();
  const meta = useSalesMeta().data;
  const opts = useSalesOptions({ enabled: open }).data;
  const save = useSaveDoc(kind);
  const defaultFirm = useDefaultFirm();
  const [f, setF] = useState<Form>(() => empty(defaultFirm, ''));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isOrder = kind === 'orders';
  const order = isOrder ? (doc as SalesOrderView | null) : null;
  /** An invoiced order keeps its parties and items. */
  const locked = !!order?.invoiceNos.length;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (!doc) return setF(empty(defaultFirm, meta?.today ?? ''));
    const o = doc as SalesOrderView;
    const p = doc as ProformaView;
    setF({
      firm: doc.firm,
      date: doc.date,
      billToId: doc.billToId,
      shipToId: doc.shipToId,
      salesPerson: doc.salesPerson ?? '',
      paymentTerms: doc.paymentTerms ?? '',
      deliveryTerms: doc.deliveryTerms ?? '',
      freight: rupeesText(doc.freightPaise),
      gstPct: String(doc.gstPct),
      remarks: doc.remarks ?? '',
      status: doc.status,
      validUntil: p.validUntil ?? '',
      poRef: p.poRef ?? '',
      poNo: o.poNo ?? '',
      poDate: o.poDate ?? '',
      edd: o.edd ?? '',
      lines: doc.lines.map(fromLine),
    });
    // Only on open.
  }, [open, doc]);

  // Opened before meta loaded (a ?new=1 link): today's date once it arrives.
  useEffect(() => {
    if (open && !doc && meta?.today) setF((x) => (x.date ? x : { ...x, date: meta.today }));
  }, [open, meta?.today]);

  const items = opts?.items ?? [];
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const customers = opts?.customers ?? [];
  const partyOptions = useMemo(() => customers.map((c) => ({ id: c.id, label: c.name, hint: [c.city, c.state].filter(Boolean).join(', ') || null })), [customers]);
  // Parties no longer active still show on old documents.
  const partyOpts = useMemo(() => {
    const extra = doc ? [doc.billToId && !partyOptions.some((p) => p.id === doc.billToId) ? { id: doc.billToId, label: doc.billTo } : null, doc.shipToId && !partyOptions.some((p) => p.id === doc.shipToId) ? { id: doc.shipToId, label: doc.shipTo } : null] : [];
    return [...partyOptions, ...extra.filter((x): x is { id: string; label: string } => !!x)];
  }, [partyOptions, doc]);
  const itemOptions = useMemo(() => items.map((i) => ({ id: i.id, label: i.name, hint: i.hsn ? `HSN ${i.hsn}` : null })), [items]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k === 'billToId' ? 'billToId' : k]: '' }));
  };
  const setLine = (key: number, p: Partial<Line>) => setF((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...p } : l)) }));
  const clearLineErrors = (n: number) => setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(`lines.${n}.`) && k !== 'lines')));

  /** Price-list rate and weight-chart weight for an item as of a date. */
  const resolve = (itemId: string, date: string) => {
    const it = itemById.get(itemId);
    const price = opts && date ? effectiveEntry(opts.prices, itemId, date) : null;
    const weight = opts && date ? effectiveEntry(opts.weights, itemId, date) : null;
    return { rate: price ? rupeesText(price.ratePaise) : rupeesText(it?.defaultRatePaise ?? 0), weight: weight ? String(weight.weightKg) : null };
  };
  function pickItem(l: Line, n: number, itemId: string | null) {
    clearLineErrors(n);
    if (!itemId) return setLine(l.key, { itemId: null });
    const it = itemById.get(itemId)!;
    const r = resolve(itemId, f.date);
    const pcs = Number(l.pcs) || 0;
    setLine(l.key, { itemId, brand: it.brand, rate: r.rate, weight: r.weight ?? l.weight, sqm: pcs ? String(round4(pcs * it.sqmFactor)) : l.sqm });
  }
  function setPcs(l: Line, n: number, pcs: string) {
    clearLineErrors(n);
    const it = l.itemId ? itemById.get(l.itemId) : null;
    setLine(l.key, { pcs, ...(it && Number(pcs) ? { sqm: String(round4(Number(pcs) * it.sqmFactor)) } : {}) });
  }
  function setDate(date: string) {
    set('date', date);
    // Re-price lines from the price list and weight chart as of the new date (legacy sf_poDate change).
    if (!date || locked) return;
    setF((x) => ({
      ...x,
      date,
      lines: x.lines.map((l) => {
        if (!l.itemId) return l;
        const price = opts ? effectiveEntry(opts.prices, l.itemId, date) : null;
        const weight = opts ? effectiveEntry(opts.weights, l.itemId, date) : null;
        return { ...l, ...(price ? { rate: rupeesText(price.ratePaise) } : {}), ...(weight ? { weight: String(weight.weightKg) } : {}) };
      }),
    }));
  }
  function setBillTo(id: string | null) {
    set('billToId', id);
    const c = customers.find((x) => x.id === id);
    if (c?.paymentTerms && !f.paymentTerms) set('paymentTerms', c.paymentTerms);
  }

  const bill = customers.find((c) => c.id === f.billToId);
  const taxType = bill && meta ? (bill.gstin ? taxTypeFor(bill.gstin, meta.settings.firmStateCodes[f.firm]) : bill.taxTypes[f.firm]) : doc?.taxType ?? 'SG+CG';
  const amounts = f.lines.map((l) => lineAmount(round4(Number(l.sqm) || 0), toPaise(l.rate)));
  const totals = docTotals(amounts.map((a) => ({ amountPaise: a })), toPaise(f.freight), taxType, Number(f.gstPct) || 0);
  const weightKg = f.lines.reduce((s, l) => s + (Number(l.pcs) || 0) * (Number(l.weight) || 0), 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.billToId) local.billToId = 'Pick the bill-to party';
    // Fully blank rows are ignored; `at[k]` is the form row of the k-th line sent.
    const at = f.lines.map((l, i) => (l.itemId || l.pcs || l.sqm ? i : -1)).filter((i) => i >= 0);
    const filled = at.map((i) => f.lines[i]!);
    if (!filled.length) local.lines = 'Add at least one item with quantity';
    at.forEach((i) => {
      if (!f.lines[i]!.itemId) local[`lines.${i}.itemId`] = 'Pick an item';
      if (!(Number(f.lines[i]!.sqm) > 0)) local[`lines.${i}.qtySqm`] = 'Enter the quantity';
    });
    if (Object.keys(local).length) return setErrors(local);
    const input: Record<string, unknown> = {
      ...(doc ? {} : { firm: f.firm }),
      date: f.date,
      billToId: f.billToId,
      shipToId: f.shipToId || null,
      salesPerson: f.salesPerson || null,
      paymentTerms: f.paymentTerms || null,
      deliveryTerms: f.deliveryTerms || null,
      lines: filled.map((l) => ({ itemId: l.itemId, brand: l.brand || null, pcs: Number(l.pcs) || 0, qtySqm: Number(l.sqm), ratePaise: toPaise(l.rate), weightKg: Number(l.weight) || 0 })),
      freightPaise: toPaise(f.freight),
      gstPct: Number(f.gstPct) || 0,
      remarks: f.remarks.trim() || null,
      status: f.status,
      ...(isOrder ? { poNo: f.poNo.trim() || null, poDate: f.poDate || null, edd: f.edd || null } : { validUntil: f.validUntil || null, poRef: f.poRef.trim() || null }),
    };
    if (locked) {
      delete input.lines;
      delete input.billToId;
      delete input.shipToId;
    }
    try {
      const saved = await save.mutateAsync({ id: doc?.id, input });
      const no = isOrder ? (saved as SalesOrderView).soNo : (saved as ProformaView).piNo;
      toast({ tone: 'success', title: `${no} saved`, description: inr(saved.totals.total) });
      onSaved(saved);
    } catch (err) {
      // Server paths count only the lines sent; point them back at the form rows.
      setErrors(Object.fromEntries(Object.entries(fieldErrors(err)).map(([k, v]) => [k.replace(/^lines\.(\d+)\./, (_m, d: string) => `lines.${at[Number(d)] ?? d}.`), v])));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }

  const s = meta?.settings;
  const opt = (xs: string[] | undefined, cur: string) => [...new Set([...(xs ?? []), ...(cur ? [cur] : [])])].map((x) => ({ value: x, label: x }));
  const what = isOrder ? 'sales order' : 'proforma invoice';
  const no = doc ? ((doc as SalesOrderView).soNo ?? (doc as ProformaView).piNo) : null;
  const statusOptions = isOrder ? SO_STATUSES.map((x) => ({ value: x, label: SO_STATUS_LABEL[x] })) : (['draft', 'sent', 'cancelled'] as const).map((x) => ({ value: x, label: PI_STATUS_LABEL[x] }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      closeOnBackdrop={false}
      title={doc ? `Edit ${no}` : `New ${what}`}
      description={locked ? `Invoiced (${order!.invoiceNos.join(', ')}): parties and items are fixed.` : 'Pick parties and items; rates and weights come from the price list and weight chart.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="sales-doc-form" loading={save.isPending}>
            Save {isOrder ? 'order' : 'proforma'}
          </Button>
        </>
      }
    >
      <form id="sales-doc-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-4 [&>*]:min-w-0">
          {!doc && <FirmSelect value={f.firm} onChange={(v) => set('firm', v)} />}
          <Input label={isOrder ? 'SO date' : 'PI date'} type="date" value={f.date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
          {isOrder ? (
            <>
              <Input label="Customer PO no." value={f.poNo} onChange={(e) => set('poNo', e.target.value)} />
              <Input label="PO date" type="date" value={f.poDate} onChange={(e) => set('poDate', e.target.value)} />
              <Input label="Expected dispatch" type="date" value={f.edd} onChange={(e) => set('edd', e.target.value)} />
            </>
          ) : (
            <>
              <Input label="Valid until" type="date" value={f.validUntil} onChange={(e) => set('validUntil', e.target.value)} error={errors.validUntil} />
              <Input label="Party’s PO reference" value={f.poRef} onChange={(e) => set('poRef', e.target.value)} />
            </>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <Combo label="Bill to" value={f.billToId} options={partyOpts} onChange={setBillTo} error={errors.billToId} disabled={locked} placeholder="Search party name or city" />
          <div className="flex flex-col gap-1">
            <Combo label="Ship to" value={f.shipToId} options={partyOpts} onChange={(id) => set('shipToId', id)} error={errors.shipToId} disabled={locked} placeholder="Same as bill to" />
            {!locked && f.shipToId && f.shipToId !== f.billToId && (
              <button type="button" className="self-start text-caption font-medium text-muted underline hover:text-ink" onClick={() => set('shipToId', f.billToId)}>
                Same as bill to
              </button>
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-4 [&>*]:min-w-0">
          <Select label="Sales person" placeholder="—" options={opt(s?.salesPersons, f.salesPerson)} value={f.salesPerson} onChange={(e) => set('salesPerson', e.target.value)} />
          <Select label="Payment terms" placeholder="—" options={opt(s?.paymentTerms, f.paymentTerms)} value={f.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} />
          <Select label="Delivery terms" placeholder="—" options={opt(s?.deliveryTerms, f.deliveryTerms)} value={f.deliveryTerms} onChange={(e) => set('deliveryTerms', e.target.value)} />
          <Input label="Tax type (from bill-to GSTIN)" value={taxType === 'SG+CG' ? 'SG+CG (intra-state)' : 'IGST (inter-state)'} readOnly />
        </div>

        <fieldset className="flex flex-col gap-2" disabled={locked}>
          <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">Items</legend>
          {errors.lines && <p className="text-sm text-primary">{errors.lines}</p>}
          {f.lines.map((l, n) => {
            const it = l.itemId ? itemById.get(l.itemId) : null;
            return (
              <div key={l.key} className="grid items-start gap-2 rounded border border-border p-2 sm:grid-cols-[2.6fr_1.1fr_0.7fr_1fr_1fr_0.9fr_auto] [&>*]:min-w-0">
                <Combo label="Item" ariaLabel={`Item, line ${n + 1}`} value={l.itemId} options={itemOptions} onChange={(id) => pickItem(l, n, id)} error={errors[`lines.${n}.itemId`]} disabled={locked} placeholder="Search item" />
                <Select label="Brand" aria-label={`Brand, line ${n + 1}`} options={opt(s?.brands, l.brand)} value={l.brand} onChange={(e) => setLine(l.key, { brand: e.target.value })} />
                <Input label="Pcs" aria-label={`Pcs, line ${n + 1}`} inputMode="numeric" value={l.pcs} onChange={(e) => setPcs(l, n, e.target.value)} error={errors[`lines.${n}.pcs`]} />
                <Input label="Sq m" aria-label={`Sq m, line ${n + 1}`} inputMode="decimal" value={l.sqm} onChange={(e) => (clearLineErrors(n), setLine(l.key, { sqm: e.target.value }))} error={errors[`lines.${n}.qtySqm`]} />
                <Input label="Rate / sq m (₹)" aria-label={`Rate, line ${n + 1}`} inputMode="decimal" value={l.rate} onChange={(e) => setLine(l.key, { rate: e.target.value })} hint={l.rate ? `${inr(rateSqftOf(toPaise(l.rate)))}/sq ft` : undefined} />
                <Input label="Wt / board (kg)" aria-label={`Weight per board, line ${n + 1}`} inputMode="decimal" value={l.weight} onChange={(e) => setLine(l.key, { weight: e.target.value })} hint={Number(l.weight) && Number(l.pcs) ? `${qtyFmt(Number(l.weight) * Number(l.pcs))} kg` : undefined} />
                <Button variant="ghost" size="sm" icon={X} className="sm:mt-6" aria-label={`Remove line ${n + 1}`} disabled={f.lines.length === 1 || locked} onClick={() => setF((x) => ({ ...x, lines: x.lines.filter((y) => y.key !== l.key) }))} />
                <p className="text-caption text-muted sm:col-span-7" aria-label={`Amount, line ${n + 1}`}>
                  {it ? `${it.grade}${it.subType ? ` · ${it.subType}` : ''} · ${it.sqmFactor} sq m/board · ` : ''}
                  <strong className="tabular-nums text-ink">{inr(amounts[n] ?? 0)}</strong>
                </p>
              </div>
            );
          })}
          {!locked && (
            <Button size="sm" icon={Plus} className="self-start" onClick={() => setF((x) => ({ ...x, lines: [...x.lines, blank()] }))}>
              Add item
            </Button>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="grid content-start gap-3 sm:grid-cols-3 [&>*]:min-w-0">
            <Input label="Freight (₹)" inputMode="decimal" value={f.freight} onChange={(e) => set('freight', e.target.value)} error={errors.freightPaise} />
            <Input label="GST %" inputMode="decimal" value={f.gstPct} onChange={(e) => set('gstPct', e.target.value)} error={errors.gstPct} />
            <Select label="Status" options={statusOptions} value={f.status} onChange={(e) => set('status', e.target.value)} />
            <Textarea label="Remarks" rows={2} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} containerClassName="sm:col-span-3" />
            {weightKg > 0 && <p className="text-sm text-muted sm:col-span-3">Total weight {qtyFmt(Math.round(weightKg * 100) / 100)} kg</p>}
          </div>
          <TotalsBlock t={totals} gstPct={Number(f.gstPct) || 0} label={isOrder ? 'Order value' : 'Total value'} />
        </div>
      </form>
    </Modal>
  );
}

function empty(firm: Firm, today: string): Form {
  return { firm, date: today, billToId: null, shipToId: null, salesPerson: '', paymentTerms: '', deliveryTerms: 'EX WORKS', freight: '', gstPct: '18', remarks: '', status: 'draft', validUntil: '', poRef: '', poNo: '', poDate: '', edd: '', lines: [blank()] };
}
