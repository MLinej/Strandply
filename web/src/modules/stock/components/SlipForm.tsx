import { useEffect, useState, type FormEvent } from 'react';
import { SHIFTS, skuCode, type Shift, type SlipType, type SlipView } from '@contracts/stock';
import { Button, Input, Modal, SegmentedControl, Select, Textarea, useToast } from '@/components/ui';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useCreateSlip, useStockMeta, type Side } from '../api';
import { qtyFmt } from '../ui';
import { SkuPicker } from './SkuPicker';

type Form = { type: SlipType; date: string; from: Side | null; to: Side | null; qty: string; shift: Shift | ''; batch: string; refNo: string; remarks: string };
const RULE: Record<SlipType, { from: string; to: string; text: string }> = {
  SIS: { from: 'FROM: stock location', to: 'TO: department / WIP', text: 'Issue: the item goes out of a stock location into a department. FROM and TO are different SKU codes.' },
  SRS: { from: 'FROM: department / WIP', to: 'TO: stock location', text: 'Receipt: the item leaves a department and comes into a stock location. FROM and TO are different SKU codes.' },
};

/** New SIS / SRS (legacy renderSlip + saveSlip). */
export function SlipForm({ type, onClose, onSaved }: { type: SlipType | null; onClose: () => void; onSaved: (s: SlipView) => void }) {
  const toast = useToast();
  const meta = useStockMeta().data;
  const groups = meta?.groups ?? [];
  const save = useCreateSlip();
  const [f, setF] = useState<Form>({ type: 'SIS', date: '', from: null, to: null, qty: '', shift: '', batch: '', refNo: '', remarks: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!type) return;
    setErrors({});
    setF({ type, date: meta?.today ?? '', from: null, to: null, qty: '', shift: '', batch: '', refNo: '', remarks: '' });
    // Only on open.
  }, [type]);
  const set = <K extends keyof Form>(k: K, v: Form[K], ...clear: string[]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([key]) => ![k, ...clear].includes(key))));
  };
  const code = (s: Side | null) => {
    const g = groups.find((x) => x.id === s?.groupId);
    return g && (g.thicknesses.length === 0 || s?.thick) ? skuCode(g, s!.thick) : null;
  };
  const fromSku = code(f.from);
  const toSku = code(f.to);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.from) local['from.groupId'] = 'Pick the FROM item';
    else if (!fromSku) local['from.thick'] = 'Pick the thickness';
    if (!f.to) local['to.groupId'] = 'Pick the TO item';
    else if (!toSku) local['to.thick'] = 'Pick the thickness';
    if (fromSku && fromSku === toSku) local.to = 'FROM and TO must be different SKU codes';
    if (!(Number(f.qty) > 0)) local.qty = 'Enter the quantity';
    if (Object.keys(local).length) return setErrors(local);
    try {
      const s = await save.mutateAsync({
        type: f.type,
        date: f.date || undefined,
        from: f.from!,
        to: f.to!,
        qty: Number(f.qty),
        shift: f.shift || null,
        batch: f.batch.trim() || null,
        refNo: f.refNo.trim() || null,
        remarks: f.remarks.trim() || null,
      });
      toast({ tone: 'success', title: `${s.slipNo} saved`, description: `${s.from.sku} − ${qtyFmt(s.qty)} · ${s.to.sku} + ${qtyFmt(s.qty)}` });
      onSaved(s);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save the slip', description: errorMessage(err) });
    }
  }

  const rule = RULE[f.type];
  return (
    <Modal
      open={!!type}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={f.type === 'SIS' ? 'New stock issue slip (SIS)' : 'New stock receipt slip (SRS)'}
      description={rule.text}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="slip-form" loading={save.isPending}>
            Save {f.type}
          </Button>
        </>
      }
    >
      <form id="slip-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SegmentedControl<SlipType>
            aria-label="Slip type"
            options={[
              { value: 'SIS', label: 'SIS: issue (ISS)' },
              { value: 'SRS', label: 'SRS: receipt (MRS)' },
            ]}
            value={f.type}
            onChange={(v) => set('type', v)}
          />
          <Input label="Date" type="date" value={f.date || meta?.today || ''} max={meta?.today} onChange={(e) => set('date', e.target.value)} error={errors.date} containerClassName="w-[170px]" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
          <SkuPicker
            idPrefix="from"
            title={rule.from}
            tone="out"
            groups={groups}
            value={f.from}
            onChange={(v) => set('from', v, 'from.groupId', 'from.thick', 'from')}
            errors={{ groupId: errors['from.groupId'] ?? errors.from, thick: errors['from.thick'] }}
          />
          <SkuPicker
            idPrefix="to"
            title={rule.to}
            tone="in"
            groups={groups}
            value={f.to}
            onChange={(v) => set('to', v, 'to.groupId', 'to.thick', 'to')}
            errors={{ groupId: errors['to.groupId'] ?? errors.to, thick: errors['to.thick'] }}
          />
        </div>
        {fromSku && toSku && (
          <div className="rounded border border-border bg-page px-3 py-2 text-sm" aria-label="Miracle entry preview">
            <div className="mb-1 text-label font-semibold uppercase tracking-label text-faint">Miracle entry</div>
            <div className="flex justify-between tabular-nums">
              <span>
                <span className="font-semibold text-primary">MINUS −</span> {fromSku}
              </span>
              <span className="font-semibold text-primary">− {Number(f.qty) > 0 ? qtyFmt(Number(f.qty)) : '?'}</span>
            </div>
            <div className="flex justify-between tabular-nums">
              <span>
                <span className="font-semibold text-green">PLUS +</span> {toSku}
              </span>
              <span className="font-semibold text-green">+ {Number(f.qty) > 0 ? qtyFmt(Number(f.qty)) : '?'}</span>
            </div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-4 [&>*]:min-w-0">
          <Input label="Quantity" inputMode="decimal" value={f.qty} onChange={(e) => set('qty', e.target.value)} error={errors.qty} />
          <Select label="Shift" placeholder="—" options={SHIFTS.map((s) => ({ value: s, label: s }))} value={f.shift} onChange={(e) => set('shift', e.target.value as Shift | '')} />
          <Input label="Batch" placeholder="Auto" value={f.batch} onChange={(e) => set('batch', e.target.value)} />
          <Input label="Against PR / SO" placeholder="OSB-PR/2026/001" value={f.refNo} onChange={(e) => set('refNo', e.target.value)} />
        </div>
        <Textarea label="Remarks" rows={2} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} />
      </form>
    </Modal>
  );
}
