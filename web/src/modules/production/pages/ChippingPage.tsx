import { Layers, Plus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { round3, SHIFTS, type ChippingView, type Shift } from '@contracts/production';
import { useSession } from '@/app/session';
import { Button, Input, MenuItem, Modal, Select, Textarea, useToast, type Column } from '@/components/ui';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { runAndClose } from '../../samples/ui/RowMenu';
import { useLots, useProductionMeta, useSaveDoc, useWipAction } from '../api';
import { DocRegister, type FormProps } from '../components/DocRegister';
import { LotSelect } from '../components/LotSelect';
import { inr, kg, perKg, qtyFmt } from '../ui';

type Line = { key: number; purchaseEntryId: string; qty: string };
type Form = { date: string; shift: Shift; operator: string; machine: string; remarks: string; lots: Line[] };
let seq = 0;
const line = (o: Partial<Line> = {}): Line => ({ key: ++seq, purchaseEntryId: '', qty: '', ...o });

/** Chipping report: Nilgiri consumed from Purchase lots at the net rate (legacy openChipForm / saveChipReport). */
export function ChippingForm({ open, doc, onClose, onSaved }: FormProps<ChippingView>) {
  const toast = useToast();
  const meta = useProductionMeta().data;
  const save = useSaveDoc('chipping');
  const lots = useLots('nilgiri', { except: doc?.id, enabled: open }).data ?? [];
  const [f, setF] = useState<Form>({ date: '', shift: 'Day', operator: '', machine: '', remarks: '', lots: [line()] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      doc
        ? { date: doc.date, shift: doc.shift, operator: doc.operator ?? '', machine: doc.machine ?? '', remarks: doc.remarks ?? '', lots: doc.lots.map((l) => line({ purchaseEntryId: l.purchaseEntryId, qty: String(l.qty) })) }
        : { date: meta?.today ?? '', shift: 'Day', operator: '', machine: '', remarks: '', lots: [line()] },
    );
  }, [open, doc]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const setLine = (key: number, p: Partial<Line>) => {
    setF((x) => ({ ...x, lots: x.lots.map((l) => (l.key === key ? { ...l, ...p } : l)) }));
    setErrors({});
  };
  const filled = f.lots.filter((l) => l.purchaseEntryId && Number(l.qty) > 0);
  const totalKg = round3(filled.reduce((s, l) => s + Number(l.qty), 0));
  const totalPaise = filled.reduce((s, l) => s + Math.round((Number(l.qty) * (lots.find((o) => o.purchaseEntryId === l.purchaseEntryId)?.netRatePaise ?? 0)) / 1000), 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!filled.length) local.lots = 'Add at least one lot with a quantity';
    f.lots.forEach((l, i) => {
      const o = lots.find((x) => x.purchaseEntryId === l.purchaseEntryId);
      if (o && Number(l.qty) > o.availKg) local[`lots.${i}.qty`] = `Only ${kg(o.availKg)} left`;
    });
    if (Object.keys(local).length) return setErrors(local);
    try {
      const saved = await save.mutateAsync({
        id: doc?.id,
        input: { date: f.date, shift: f.shift, operator: f.operator.trim() || null, machine: f.machine.trim() || null, remarks: f.remarks.trim() || null, lots: filled.map((l) => ({ purchaseEntryId: l.purchaseEntryId, qty: Number(l.qty) })) },
      });
      toast({ tone: 'success', title: `${saved.docNo} saved`, description: `${kg(saved.totalKg)} · ${inr(saved.totalPaise)}` });
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
      title={doc ? `Edit ${doc.docNo}` : 'New chipping report'}
      description="Nilgiri wood chipped, by Purchase lot. The net rate is the invoice rate adjusted by the rate-difference note."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="chip-form" loading={save.isPending}>
            Save report
          </Button>
        </>
      }
    >
      <form id="chip-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-4 [&>*]:min-w-0">
          <Input label="Date" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} error={errors.date} />
          <Select label="Shift" options={SHIFTS.map((s) => ({ value: s, label: s }))} value={f.shift} onChange={(e) => set('shift', e.target.value as Shift)} />
          <Input label="Machine" value={f.machine} onChange={(e) => set('machine', e.target.value)} />
          <Input label="Operator" value={f.operator} onChange={(e) => set('operator', e.target.value)} />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">Lots</legend>
          {errors.lots && <p className="text-sm text-primary">{errors.lots}</p>}
          {f.lots.map((l, i) => (
            <div key={l.key} className="grid items-start gap-2 rounded border border-border p-2 sm:grid-cols-[1fr_160px_auto] [&>*]:min-w-0">
              <LotSelect lots={lots} value={l.purchaseEntryId} onChange={(id) => setLine(l.key, { purchaseEntryId: id })} error={errors[`lots.${i}.purchaseEntryId`]} ariaLabel={`Lot ${i + 1}`} />
              <Input label="Qty (kg)" aria-label={`Quantity, lot ${i + 1}`} inputMode="decimal" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} error={errors[`lots.${i}.qty`]} />
              <Button variant="ghost" size="sm" icon={X} className="sm:mt-6" aria-label={`Remove lot ${i + 1}`} disabled={f.lots.length === 1} onClick={() => setF((x) => ({ ...x, lots: x.lots.filter((y) => y.key !== l.key) }))} />
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" icon={Plus} onClick={() => setF((x) => ({ ...x, lots: [...x.lots, line()] }))}>
              Add lot
            </Button>
            <p className="text-sm tabular-nums" aria-label="Totals">
              <strong>{kg(totalKg)}</strong> · {inr(totalPaise)}
              {totalKg > 0 && ` · avg ${perKg(Math.round((totalPaise / totalKg) * 1000))}`}
            </p>
          </div>
        </fieldset>
        <Textarea label="Remarks" rows={2} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} />
      </form>
    </Modal>
  );
}

export function ChippingDetail({ doc: c }: { doc: ChippingView }) {
  return (
    <>
      <DetailList
        cols={3}
        items={[
          { label: 'Shift', value: c.shift },
          { label: 'Machine', value: c.machine },
          { label: 'Operator', value: c.operator },
          { label: 'Total', value: kg(c.totalKg) },
          { label: 'Amount', value: inr(c.totalPaise) },
          { label: 'Average rate', value: perKg(c.avgRatePaise) },
          { label: 'WIP batch', value: c.wipNo ?? 'Not created yet' },
          { label: 'Entered by', value: c.createdByName },
          { label: 'Remarks', value: c.remarks, wide: true },
        ]}
      />
      <table className="w-full text-sm" aria-label="Lots consumed">
        <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
          <tr>
            <th className="px-3 py-1.5 text-left">Lot</th>
            <th className="px-3 py-1.5 text-right">Qty</th>
            <th className="px-3 py-1.5 text-right">Net rate</th>
            <th className="px-3 py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {c.lots.map((l) => (
            <tr key={l.purchaseEntryId} className="border-t border-divider tabular-nums">
              <td className="px-3 py-1.5 font-medium">{l.lotNo}</td>
              <td className="px-3 py-1.5 text-right">{kg(l.qty)}</td>
              <td className="px-3 py-1.5 text-right">{perKg(l.ratePaise)}</td>
              <td className="px-3 py-1.5 text-right">{inr(l.amountPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export const columns: Column<ChippingView>[] = [
  { id: 'shift', header: 'Shift', width: '90px', cell: (c) => c.shift },
  { id: 'lots', header: 'Lots', cell: (c) => c.lots.map((l) => l.lotNo).join(', ') },
  { id: 'kg', header: 'Qty', width: '110px', align: 'right', className: 'font-semibold tabular-nums', cell: (c) => kg(c.totalKg) },
  { id: 'amt', header: 'Amount', width: '120px', align: 'right', className: 'tabular-nums', cell: (c) => inr(c.totalPaise) },
  { id: 'wip', header: 'WIP batch', width: '110px', className: 'tabular-nums', cell: (c) => c.wipNo ?? '—' },
];

/** Chipping register (legacy renderChipList), with "Create WIP batch" (legacy chipCreateWIP). */
export function ChippingPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const wip = useWipAction();
  const create = (c: ChippingView) =>
    void wip.mutateAsync({ kind: 'create', chippingId: c.id }).then(
      (w) => toast({ tone: 'success', title: `${w?.docNo} created`, description: `${qtyFmt(c.totalKg)} kg at ${perKg(c.avgRatePaise)}` }),
      (err) => toast({ tone: 'error', title: 'Couldn’t create the WIP batch', description: errorMessage(err) }),
    );
  return (
    <DocRegister
      kind="chipping"
      title="Chipping"
      description="Nilgiri wood chipped from Purchase lots. Each report becomes a WIP Nilgiri batch for production."
      newLabel="New report"
      searchPlaceholder="Report no., machine, operator"
      columns={columns}
      minWidth={980}
      Form={ChippingForm}
      Detail={ChippingDetail}
      extraMenu={(c, close) =>
        !c.wipId &&
        canDo('edit') && (
          <MenuItem icon={Layers} onClick={runAndClose(close, () => create(c))}>
            Create WIP batch
          </MenuItem>
        )
      }
      extraDetailActions={(c) =>
        !c.wipId &&
        canDo('edit') && (
          <Button icon={Layers} loading={wip.isPending} onClick={() => create(c)}>
            Create WIP batch
          </Button>
        )
      }
    />
  );
}
