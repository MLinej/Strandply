import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { boardTons, docTotals, lineAmount, rateSqftOf, round4, taxTypeFor, type SalesInvoiceView, type SalesTaxType } from '@contracts/sales';
import { Button, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useDocList, useDocOne, useFirmFilter, useSalesMeta, useSalesOptions, useSaveDoc } from '../api';
import { inr, qtyFmt, rupeesText, sqmFmt, toPaise, TotalsBlock } from '../ui';
import { Combo } from '@/components/ui';

type Line = { soLine: number; pcs: string; sqm: string; rate: string };
interface Form {
  soId: string | null;
  date: string;
  taxType: SalesTaxType | '';
  freight: string;
  gstPct: string;
  irn: string;
  ewayBill: string;
  weightTons: string;
  remarks: string;
  lines: Line[];
}
const EMPTY: Form = { soId: null, date: '', taxType: '', freight: '', gstPct: '18', irn: '', ewayBill: '', weightTons: '', remarks: '', lines: [] };

/**
 * Sales invoice form (legacy openInvoiceModal): pick an open order and its lines come in with the order
 * quantity, what's already invoiced and the balance; enter the dispatched pcs / sq m and rate. Lines left at 0 are skipped.
 */
export function InvoiceForm({ open, doc, soId: presetSo, onClose, onSaved }: { open: boolean; doc: SalesInvoiceView | null; soId?: string | null; onClose: () => void; onSaved: (d: SalesInvoiceView) => void }) {
  const toast = useToast();
  const meta = useSalesMeta().data;
  const firm = useFirmFilter();
  const opts = useSalesOptions({ enabled: open }).data;
  const save = useSaveDoc('invoices');
  const openOrders = useDocList('orders', { pageSize: 100, sort: '-date', filters: { firm, status: 'open' } }, { enabled: open && !doc }).data?.rows ?? [];
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const so = useDocOne('orders', f.soId).data;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (doc)
      setF({
        soId: doc.soId,
        date: doc.date,
        taxType: doc.taxType,
        freight: rupeesText(doc.freightPaise),
        gstPct: String(doc.gstPct),
        irn: doc.irn ?? '',
        ewayBill: doc.ewayBill ?? '',
        weightTons: doc.weightTons === null ? '' : String(doc.weightTons),
        remarks: doc.remarks ?? '',
        lines: [],
      });
    else setF({ ...EMPTY, date: meta?.today ?? '', soId: presetSo ?? null });
    // Only on open.
  }, [open, doc]);

  // Opened before meta loaded (a ?new=1 link): today's date once it arrives.
  useEffect(() => {
    if (open && !doc && meta?.today) setF((x) => (x.date ? x : { ...x, date: meta.today }));
  }, [open, meta?.today]);

  // Lines from the order once it loads: the balance for a new invoice, this invoice's quantities on an edit.
  useEffect(() => {
    if (!so || !open) return;
    setF((x) => {
      if (x.lines.length && x.lines.every((l) => so.lines[l.soLine])) return x;
      const mine = new Map((doc?.lines ?? []).map((l) => [l.soLine, l]));
      return {
        ...x,
        gstPct: doc ? x.gstPct : String(so.gstPct),
        freight: doc ? x.freight : so.invoiceNos.length ? '' : rupeesText(so.freightPaise),
        lines: so.lines.map((l, i) => {
          const m = mine.get(i);
          if (doc) return { soLine: i, pcs: m ? String(m.pcs) : '', sqm: m ? String(m.qtySqm) : '', rate: rupeesText(m?.ratePaise ?? l.ratePaise) };
          const p = so.progress[i]!;
          return { soLine: i, pcs: p.balancePcs ? String(p.balancePcs) : '', sqm: p.balanceSqm ? String(p.balanceSqm) : '', rate: rupeesText(l.ratePaise) };
        }),
      };
    });
  }, [so?.id, open]);

  const orderOptions = useMemo(() => openOrders.map((o) => ({ id: o.id, label: o.soNo, hint: `${o.shipTo} · ${formatDate(o.date)}` })), [openOrders]);
  const bill = opts?.customers.find((c) => c.id === so?.billToId);
  const autoTax: SalesTaxType = bill && meta ? (bill.gstin ? taxTypeFor(bill.gstin, meta.settings.firmStateCodes[so!.firm]) : bill.taxTypes[so!.firm]) : (so?.taxType ?? 'SG+CG');
  const taxType = f.taxType || autoTax;
  const amounts = f.lines.map((l) => lineAmount(round4(Number(l.sqm) || 0), toPaise(l.rate)));
  const totals = docTotals(amounts.map((a) => ({ amountPaise: a })), toPaise(f.freight), taxType, Number(f.gstPct) || 0);
  const calcTons = so ? f.lines.reduce((s, l) => s + boardTons(so.lines[l.soLine]!.thic, so.lines[l.soLine]!.width, so.lines[l.soLine]!.length, Number(l.pcs) || 0), 0) : 0;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };
  const setLine = (i: number, p: Partial<Line>) => {
    setF((x) => ({ ...x, lines: x.lines.map((l, n) => (n === i ? { ...l, ...p } : l)) }));
    setErrors((e) => ({ ...e, lines: '' }));
  };
  function setPcs(i: number, pcs: string) {
    const factor = so?.lines[f.lines[i]!.soLine]?.sqmFactor ?? 0;
    setLine(i, { pcs, ...(factor && Number(pcs) ? { sqm: String(round4(Number(pcs) * factor)) } : {}) });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!f.soId) return setErrors({ soId: 'Pick a sales order' });
    const sent = f.lines.filter((l) => Number(l.sqm) > 0);
    if (!sent.length) return setErrors({ lines: 'Enter the dispatched quantity on at least one line' });
    const input: Record<string, unknown> = {
      ...(doc ? {} : { soId: f.soId }),
      date: f.date,
      lines: sent.map((l) => ({ soLine: l.soLine, pcs: Number(l.pcs) || 0, qtySqm: Number(l.sqm), ratePaise: toPaise(l.rate) })),
      taxType: f.taxType || null,
      freightPaise: toPaise(f.freight),
      gstPct: Number(f.gstPct) || 0,
      irn: f.irn.trim() || null,
      ewayBill: f.ewayBill.trim() || null,
      weightTons: f.weightTons === '' ? null : Number(f.weightTons),
      remarks: f.remarks.trim() || null,
    };
    try {
      const saved = await save.mutateAsync({ id: doc?.id, input });
      toast({ tone: 'success', title: `${saved.invNo} saved`, description: `${inr(saved.totals.total)}${doc?.approval === 'rejected' ? ' · sent back for approval' : ''}` });
      onSaved(saved);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      closeOnBackdrop={false}
      title={doc ? `Edit ${doc.invNo}` : 'New sales invoice'}
      description={doc?.approval === 'rejected' ? `Rejected: ${doc.approvalNote ?? ''}. Saving sends it back for approval.` : 'Raised against a sales order’s lines.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="invoice-form" loading={save.isPending}>
            Save invoice
          </Button>
        </>
      }
    >
      <form id="invoice-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-4 [&>*]:min-w-0">
          <Input label="Invoice date" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} error={errors.date} />
          <div className="sm:col-span-2">
            {doc ? (
              <Input label="Sales order" value={doc.soNo ?? '—'} readOnly />
            ) : (
              <Combo label="Sales order" value={f.soId} options={so && !orderOptions.some((o) => o.id === so.id) ? [...orderOptions, { id: so.id, label: so.soNo, hint: so.shipTo }] : orderOptions} onChange={(id) => setF({ ...f, soId: id, lines: [] })} error={errors.soId} placeholder="Search SO no. or party" />
            )}
          </div>
          <Input label="Customer PO" value={so?.poNo ?? ''} readOnly />
        </div>
        {so && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
              <Input label="Bill to" value={so.billTo} readOnly />
              <Input label="Ship to" value={`${so.shipTo}${so.city ? ` · ${so.city}` : ''}`} readOnly />
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">Dispatched against {so.soNo}</legend>
              {errors.lines && <p className="text-sm text-primary">{errors.lines}</p>}
              {f.lines.map((l, i) => {
                const sl = so.lines[l.soLine]!;
                const p = so.progress[l.soLine]!;
                const mine = doc?.lines.find((x) => x.soLine === l.soLine);
                // On an edit, this invoice's own quantity is part of the order's "invoiced".
                const leftPcs = p.balancePcs + (mine?.pcs ?? 0);
                const over = Number(l.pcs) > leftPcs && leftPcs >= 0;
                return (
                  <div key={l.soLine} className="grid items-start gap-2 rounded border border-border p-2 sm:grid-cols-[2.4fr_0.8fr_1fr_1fr_1.1fr] [&>*]:min-w-0">
                    <div className="text-sm">
                      <span className="block font-medium">{sl.itemName}</span>
                      <span className="text-caption text-muted">
                        Order {qtyFmt(sl.pcs)} pcs / {sqmFmt(sl.qtySqm)} sq m · left {qtyFmt(leftPcs)} pcs
                      </span>
                    </div>
                    <Input label="Pcs" aria-label={`Dispatched pcs, ${sl.itemName}`} inputMode="numeric" value={l.pcs} onChange={(e) => setPcs(i, e.target.value)} hint={over ? 'More than the balance' : undefined} />
                    <Input label="Sq m" aria-label={`Dispatched sq m, ${sl.itemName}`} inputMode="decimal" value={l.sqm} onChange={(e) => setLine(i, { sqm: e.target.value })} error={errors[`lines.${i}.qtySqm`]} />
                    <Input label="Rate / sq m (₹)" aria-label={`Rate, ${sl.itemName}`} inputMode="decimal" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} hint={l.rate ? `${inr(rateSqftOf(toPaise(l.rate)))}/sq ft` : undefined} />
                    <p className="text-right text-sm font-semibold tabular-nums sm:mt-8" aria-label={`Amount, ${sl.itemName}`}>
                      {inr(amounts[i] ?? 0)}
                    </p>
                  </div>
                );
              })}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="grid content-start gap-3 sm:grid-cols-3 [&>*]:min-w-0">
                <Select label="Tax type" options={[{ value: '', label: `Auto: ${autoTax}` }, { value: 'SG+CG', label: 'SG+CG' }, { value: 'IGST', label: 'IGST' }]} value={f.taxType} onChange={(e) => set('taxType', e.target.value as SalesTaxType | '')} />
                <Input label="Freight (₹)" inputMode="decimal" value={f.freight} onChange={(e) => set('freight', e.target.value)} />
                <Input label="GST %" inputMode="decimal" value={f.gstPct} onChange={(e) => set('gstPct', e.target.value)} error={errors.gstPct} />
                <Input label="IRN (e-invoice)" value={f.irn} onChange={(e) => set('irn', e.target.value)} />
                <Input label="E-way bill no." value={f.ewayBill} onChange={(e) => set('ewayBill', e.target.value)} />
                <Input label="Weight (tons)" inputMode="decimal" value={f.weightTons} onChange={(e) => set('weightTons', e.target.value)} hint={calcTons ? `Board sizes give ${calcTons.toFixed(3)} t` : undefined} error={errors.weightTons} />
                <Textarea label="Remarks" rows={2} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} containerClassName="sm:col-span-3" />
              </div>
              <TotalsBlock t={totals} gstPct={Number(f.gstPct) || 0} label="Invoice total" />
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
