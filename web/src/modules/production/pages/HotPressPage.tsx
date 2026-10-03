import { Plus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { calcHotPress, PRODUCTS, SHIFTS, type HotPressView, type Product, type Shift } from '@contracts/production';
import { Button, Input, Modal, Select, Textarea, useToast, type Column } from '@/components/ui';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useProductionMeta, useSaveDoc } from '../api';
import { DocRegister, type FormProps } from '../components/DocRegister';
import { mins, qtyFmt } from '../ui';

type Line = { key: number; label: string; pcs: string; load: string; unload: string; remarks: string };
type Form = { date: string; shift: Shift; product: Product | ''; size: string; thickness: string; operator: string; remarks: string; charges: Line[] };
let seq = 0;
const line = (n: number, o: Partial<Line> = {}): Line => ({ key: ++seq, label: `Charge ${n}`, pcs: '', load: '', unload: '', remarks: '', ...o });

/** Hot press report form (legacy openHPForm / saveHPReport / editHP). Totals are previewed with the server's calculation. */
export function HotPressForm({ open, doc, onClose, onSaved }: FormProps<HotPressView>) {
  const toast = useToast();
  const meta = useProductionMeta().data;
  const save = useSaveDoc('hotpress');
  const [f, setF] = useState<Form>({ date: '', shift: 'Day', product: '', size: '8x4', thickness: '', operator: '', remarks: '', charges: [line(1)] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      doc
        ? {
            date: doc.date,
            shift: doc.shift,
            product: doc.product,
            size: doc.size,
            thickness: doc.thickness ?? '',
            operator: doc.operator ?? '',
            remarks: doc.remarks ?? '',
            charges: doc.charges.map((c, i) => line(i + 1, { label: c.label, pcs: String(c.pcs), load: c.load ?? '', unload: c.unload ?? '', remarks: c.remarks ?? '' })),
          }
        : { date: meta?.today ?? '', shift: 'Day', product: '', size: meta?.settings.sizes[0] ?? '8x4', thickness: '', operator: '', remarks: '', charges: [line(1)] },
    );
    // Only on open.
  }, [open, doc]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };
  const setLine = (key: number, p: Partial<Line>) => setF((x) => ({ ...x, charges: x.charges.map((c) => (c.key === key ? { ...c, ...p } : c)) }));
  const filled = f.charges.filter((c) => Number(c.pcs) > 0);
  const calc = calcHotPress(filled.map((c) => ({ label: c.label, pcs: Number(c.pcs), load: c.load || null, unload: c.unload || null, remarks: null })));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.product) local.product = 'Pick a product';
    if (!filled.length) local.charges = 'Add at least one charge with pcs';
    if (Object.keys(local).length) return setErrors(local);
    try {
      const saved = await save.mutateAsync({
        id: doc?.id,
        input: {
          date: f.date,
          shift: f.shift,
          product: f.product,
          size: f.size,
          thickness: f.thickness || null,
          operator: f.operator.trim() || null,
          remarks: f.remarks.trim() || null,
          charges: filled.map((c) => ({ label: c.label.trim() || 'Charge', pcs: Number(c.pcs), load: c.load || null, unload: c.unload || null, remarks: c.remarks.trim() || null })),
        },
      });
      toast({ tone: 'success', title: `${saved.docNo} saved`, description: `${saved.calc.totalBoards} boards` });
      onSaved(saved);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save the report', description: errorMessage(err) });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={doc ? `Edit ${doc.docNo}` : 'New hot press report'}
      description={doc && doc.wfState !== 'draft' ? 'Saving sends it back to draft for review again.' : 'One row per press charge: pieces, load and unload time.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="hp-form" loading={save.isPending}>
            Save report
          </Button>
        </>
      }
    >
      <form id="hp-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
          <Input label="Date" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} error={errors.date} />
          <Select label="Shift" options={SHIFTS.map((s) => ({ value: s, label: s }))} value={f.shift} onChange={(e) => set('shift', e.target.value as Shift)} />
          <Input label="Operator" value={f.operator} onChange={(e) => set('operator', e.target.value)} />
          <Select label="Product" placeholder="Select" options={PRODUCTS.map((p) => ({ value: p, label: p }))} value={f.product} onChange={(e) => set('product', e.target.value as Product)} error={errors.product} />
          <Select label="Size" options={(meta?.settings.sizes ?? [f.size]).map((s) => ({ value: s, label: s }))} value={f.size} onChange={(e) => set('size', e.target.value)} />
          <Select label="Thickness" placeholder="—" options={(meta?.settings.thicknesses ?? []).map((t) => ({ value: t, label: `${t} mm` }))} value={f.thickness} onChange={(e) => set('thickness', e.target.value)} />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">Charges</legend>
          {errors.charges && <p className="text-sm text-primary">{errors.charges}</p>}
          {f.charges.map((c, i) => (
            <div key={c.key} className="grid items-end gap-2 rounded border border-border p-2 sm:grid-cols-[1.1fr_0.7fr_0.9fr_0.9fr_1.4fr_auto] [&>*]:min-w-0">
              <Input label="Charge" value={c.label} onChange={(e) => setLine(c.key, { label: e.target.value })} />
              <Input label="Pcs" aria-label={`Pcs, charge ${i + 1}`} inputMode="numeric" value={c.pcs} onChange={(e) => setLine(c.key, { pcs: e.target.value })} />
              <Input label="Load" type="time" aria-label={`Load time, charge ${i + 1}`} value={c.load} onChange={(e) => setLine(c.key, { load: e.target.value })} />
              <Input label="Unload" type="time" aria-label={`Unload time, charge ${i + 1}`} value={c.unload} onChange={(e) => setLine(c.key, { unload: e.target.value })} />
              <Input label="Remarks" value={c.remarks} onChange={(e) => setLine(c.key, { remarks: e.target.value })} />
              <Button variant="ghost" size="sm" icon={X} aria-label={`Remove charge ${i + 1}`} disabled={f.charges.length === 1} onClick={() => setF((x) => ({ ...x, charges: x.charges.filter((y) => y.key !== c.key) }))} />
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" icon={Plus} onClick={() => setF((x) => ({ ...x, charges: [...x.charges, line(x.charges.length + 1)] }))}>
              Add charge
            </Button>
            <p className="text-sm tabular-nums" aria-label="Totals">
              <strong>{qtyFmt(calc.totalBoards)} boards</strong> · press {mins(calc.pressMins)} · total {mins(calc.totalMins)} · spare {mins(calc.spareMins)}
            </p>
          </div>
        </fieldset>
        <Textarea label="Remarks" rows={2} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} />
      </form>
    </Modal>
  );
}

export function HotPressDetail({ doc: h }: { doc: HotPressView }) {
  return (
    <>
      <DetailList
        cols={3}
        items={[
          { label: 'Product', value: `${h.product} · ${h.size}${h.thickness ? ` · ${h.thickness} mm` : ''}` },
          { label: 'Shift', value: h.shift },
          { label: 'Operator', value: h.operator },
          { label: 'Boards', value: qtyFmt(h.calc.totalBoards) },
          { label: 'Press / total time', value: `${mins(h.calc.pressMins)} / ${mins(h.calc.totalMins)}` },
          { label: 'Spare time', value: mins(h.calc.spareMins) },
          { label: 'Board cutting', value: h.cuttingNo },
          { label: 'Entered by', value: h.createdByName },
          { label: 'Remarks', value: h.remarks, wide: true },
        ]}
      />
      <table className="w-full text-sm" aria-label="Charges">
        <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
          <tr>
            <th className="px-3 py-1.5 text-left">Charge</th>
            <th className="px-3 py-1.5 text-right">Pcs</th>
            <th className="px-3 py-1.5 text-left">Load → unload</th>
            <th className="px-3 py-1.5 text-right">Time</th>
            <th className="px-3 py-1.5 text-left">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {h.charges.map((c, i) => (
            <tr key={i} className="border-t border-divider">
              <td className="px-3 py-1.5">{c.label}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{c.pcs}</td>
              <td className="px-3 py-1.5 tabular-nums">{c.load && c.unload ? `${c.load} → ${c.unload}` : '—'}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{h.calc.perCharge[i] ? mins(h.calc.perCharge[i]!) : '—'}</td>
              <td className="px-3 py-1.5 text-muted">{c.remarks ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export const columns: Column<HotPressView>[] = [
  { id: 'shift', header: 'Shift', width: '90px', cell: (h) => h.shift },
  { id: 'product', header: 'Product', cell: (h) => `${h.product} · ${h.size}${h.thickness ? ` · ${h.thickness} mm` : ''}` },
  { id: 'boards', header: 'Boards', width: '90px', align: 'right', className: 'font-semibold tabular-nums', cell: (h) => qtyFmt(h.calc.totalBoards) },
  { id: 'charges', header: 'Charges', width: '80px', align: 'right', className: 'tabular-nums', cell: (h) => h.calc.charges },
  { id: 'time', header: 'Press / spare', width: '140px', className: 'tabular-nums text-sm', cell: (h) => `${mins(h.calc.pressMins)} / ${mins(h.calc.spareMins)}` },
  { id: 'op', header: 'Operator', width: '130px', cell: (h) => h.operator ?? '—' },
];

/** Hot press register (legacy renderHPList). */
export function HotPressPage() {
  return (
    <DocRegister
      kind="hotpress"
      title="Hot press"
      description="Press charges, boards pressed and press time per shift."
      newLabel="New report"
      searchPlaceholder="Report no., product, operator"
      columns={columns}
      minWidth={1060}
      Form={HotPressForm}
      Detail={HotPressDetail}
    />
  );
}
