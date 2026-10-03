import { Plus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { MDO_TYPES, minutesBetween, SHIFTS, type MdoView, type Shift } from '@contracts/production';
import { Button, Input, Modal, Select, Textarea, useToast, type Column } from '@/components/ui';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useProductionMeta, useSaveDoc } from '../api';
import { DocRegister, type FormProps } from '../components/DocRegister';
import { mins, qtyFmt } from '../ui';

type Item = { key: number; boardType: string; thickness: string; paper: string; type: string; finish: string; pcs: string; cycleTime: string };
type Form = { date: string; shift: Shift; operator: string; pressStart: string; pressEnd: string; paperUsed: string; paperWastage: string; remarks: string; items: Item[] };
let seq = 0;
const item = (o: Partial<Item> = {}): Item => ({ key: ++seq, boardType: '', thickness: '', paper: '', type: '', finish: '', pcs: '', cycleTime: '', ...o });

/** MDO press report (legacy openMDOForm / saveMDOReport). */
export function MdoForm({ open, doc, onClose, onSaved }: FormProps<MdoView>) {
  const toast = useToast();
  const meta = useProductionMeta().data;
  const save = useSaveDoc('mdo');
  const [f, setF] = useState<Form>({ date: '', shift: 'Day', operator: '', pressStart: '', pressEnd: '', paperUsed: '', paperWastage: '', remarks: '', items: [item()] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      doc
        ? {
            date: doc.date,
            shift: doc.shift,
            operator: doc.operator ?? '',
            pressStart: doc.pressStart ?? '',
            pressEnd: doc.pressEnd ?? '',
            paperUsed: doc.paperUsed?.toString() ?? '',
            paperWastage: doc.paperWastage?.toString() ?? '',
            remarks: doc.remarks ?? '',
            items: doc.items.map((x) => item({ boardType: x.boardType, thickness: x.thickness ?? '', paper: x.paper ?? '', type: x.type ?? '', finish: x.finish ?? '', pcs: String(x.pcs), cycleTime: x.cycleTime ?? '' })),
          }
        : { date: meta?.today ?? '', shift: 'Day', operator: '', pressStart: '', pressEnd: '', paperUsed: '', paperWastage: '', remarks: '', items: [item()] },
    );
  }, [open, doc]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const setItem = (key: number, p: Partial<Item>) => setF((x) => ({ ...x, items: x.items.map((i) => (i.key === key ? { ...i, ...p } : i)) }));
  const items = f.items.filter((i) => i.boardType.trim());
  const working = f.pressStart && f.pressEnd ? minutesBetween(f.pressStart, f.pressEnd) : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!items.length) return setErrors({ items: 'Add at least one item with a board type' });
    try {
      const saved = await save.mutateAsync({
        id: doc?.id,
        input: {
          date: f.date,
          shift: f.shift,
          operator: f.operator.trim() || null,
          pressStart: f.pressStart || null,
          pressEnd: f.pressEnd || null,
          paperUsed: f.paperUsed === '' ? null : Number(f.paperUsed),
          paperWastage: f.paperWastage === '' ? null : Number(f.paperWastage),
          remarks: f.remarks.trim() || null,
          items: items.map((i) => ({ boardType: i.boardType.trim(), thickness: i.thickness || null, paper: i.paper.trim() || null, type: i.type || null, finish: i.finish.trim() || null, pcs: Number(i.pcs) || 0, cycleTime: i.cycleTime.trim() || null })),
        },
      });
      toast({ tone: 'success', title: `${saved.docNo} saved`, description: `${saved.totalPcs} pcs, ${saved.items.length} item(s)` });
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
      title={doc ? `Edit ${doc.docNo}` : 'New MDO press report'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="mdo-form" loading={save.isPending}>
            Save report
          </Button>
        </>
      }
    >
      <form id="mdo-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-4 [&>*]:min-w-0">
          <Input label="Date" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} error={errors.date} />
          <Select label="Shift" options={SHIFTS.map((s) => ({ value: s, label: s }))} value={f.shift} onChange={(e) => set('shift', e.target.value as Shift)} />
          <Input label="Press start" type="time" value={f.pressStart} onChange={(e) => set('pressStart', e.target.value)} />
          <Input label="Press end" type="time" value={f.pressEnd} onChange={(e) => set('pressEnd', e.target.value)} hint={working !== null ? `Working ${mins(working)}` : undefined} />
          <Input label="Operator" value={f.operator} onChange={(e) => set('operator', e.target.value)} containerClassName="sm:col-span-2" />
          <Input label="Paper used" inputMode="decimal" value={f.paperUsed} onChange={(e) => set('paperUsed', e.target.value)} />
          <Input label="Paper wastage" inputMode="decimal" value={f.paperWastage} onChange={(e) => set('paperWastage', e.target.value)} />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">Items</legend>
          {errors.items && <p className="text-sm text-primary">{errors.items}</p>}
          {f.items.map((i, n) => (
            <div key={i.key} className="flex flex-col gap-2 rounded border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Item {n + 1}</span>
                <Button variant="ghost" size="sm" icon={X} aria-label={`Remove item ${n + 1}`} disabled={f.items.length === 1} onClick={() => setF((x) => ({ ...x, items: x.items.filter((y) => y.key !== i.key) }))} />
              </div>
              <div className="grid gap-2 sm:grid-cols-4 [&>*]:min-w-0">
                <Input label="Board type" placeholder="OSB, plywood" value={i.boardType} onChange={(e) => setItem(i.key, { boardType: e.target.value })} />
                <Select label="Thickness" placeholder="—" options={(meta?.settings.thicknesses ?? []).map((t) => ({ value: t, label: `${t} mm` }))} value={i.thickness} onChange={(e) => setItem(i.key, { thickness: e.target.value })} />
                <Input label="Paper" placeholder="Kraft 120gsm" value={i.paper} onChange={(e) => setItem(i.key, { paper: e.target.value })} />
                <Select label="Type" placeholder="—" options={MDO_TYPES.map((t) => ({ value: t, label: t }))} value={i.type} onChange={(e) => setItem(i.key, { type: e.target.value })} />
                <Input label="Finish" placeholder="Smooth / rough" value={i.finish} onChange={(e) => setItem(i.key, { finish: e.target.value })} />
                <Input label="Pcs" inputMode="numeric" value={i.pcs} onChange={(e) => setItem(i.key, { pcs: e.target.value })} />
                <Input label="Cycle time" placeholder="8m" value={i.cycleTime} onChange={(e) => setItem(i.key, { cycleTime: e.target.value })} />
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button size="sm" icon={Plus} onClick={() => setF((x) => ({ ...x, items: [...x.items, item()] }))}>
              Add item
            </Button>
            <span className="text-sm font-semibold tabular-nums">Total {qtyFmt(items.reduce((s, i) => s + (Number(i.pcs) || 0), 0))} pcs</span>
          </div>
        </fieldset>
        <Textarea label="Remarks" rows={2} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} />
      </form>
    </Modal>
  );
}

export function MdoDetail({ doc: m }: { doc: MdoView }) {
  return (
    <>
      <DetailList
        cols={3}
        items={[
          { label: 'Shift', value: m.shift },
          { label: 'Operator', value: m.operator },
          { label: 'Press', value: m.pressStart && m.pressEnd ? `${m.pressStart} → ${m.pressEnd}${m.workingMins !== null ? ` (${mins(m.workingMins)})` : ''}` : null },
          { label: 'Total pcs', value: qtyFmt(m.totalPcs) },
          { label: 'Paper used / wastage', value: `${m.paperUsed ?? '—'} / ${m.paperWastage ?? '—'}` },
          { label: 'Entered by', value: m.createdByName },
          { label: 'Remarks', value: m.remarks, wide: true },
        ]}
      />
      <table className="w-full text-sm" aria-label="MDO items">
        <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
          <tr>
            {['Board type', 'Thickness', 'Paper', 'Type', 'Finish', 'Pcs', 'Cycle'].map((h) => (
              <th key={h} className="px-3 py-1.5 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.items.map((x, i) => (
            <tr key={i} className="border-t border-divider">
              <td className="px-3 py-1.5">{x.boardType}</td>
              <td className="px-3 py-1.5">{x.thickness ? `${x.thickness} mm` : '—'}</td>
              <td className="px-3 py-1.5">{x.paper ?? '—'}</td>
              <td className="px-3 py-1.5">{x.type ?? '—'}</td>
              <td className="px-3 py-1.5">{x.finish ?? '—'}</td>
              <td className="px-3 py-1.5 tabular-nums">{x.pcs}</td>
              <td className="px-3 py-1.5">{x.cycleTime ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export const columns: Column<MdoView>[] = [
  { id: 'shift', header: 'Shift', width: '90px', cell: (m) => m.shift },
  { id: 'items', header: 'Items', cell: (m) => <span className="block truncate">{m.items.map((x) => `${x.boardType}${x.thickness ? ` ${x.thickness}mm` : ''}`).join(', ')}</span> },
  { id: 'pcs', header: 'Pcs', width: '80px', align: 'right', className: 'font-semibold tabular-nums', cell: (m) => qtyFmt(m.totalPcs) },
  { id: 'time', header: 'Working', width: '100px', className: 'tabular-nums', cell: (m) => (m.workingMins === null ? '—' : mins(m.workingMins)) },
  { id: 'paper', header: 'Paper / waste', width: '120px', className: 'tabular-nums', cell: (m) => `${m.paperUsed ?? '—'} / ${m.paperWastage ?? '—'}` },
];

/** MDO press register (legacy renderMDOList). */
export function MdoPage() {
  return (
    <DocRegister kind="mdo" title="MDO press" description="MDO press runs: working time, items pressed and paper used." newLabel="New report" searchPlaceholder="Report no., operator" columns={columns} minWidth={1000} Form={MdoForm} Detail={MdoDetail} />
  );
}
