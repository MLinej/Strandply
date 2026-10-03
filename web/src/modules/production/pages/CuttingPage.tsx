import { useEffect, useState, type FormEvent } from 'react';
import { calcCutting, SHIFTS, type CuttingView, type Shift } from '@contracts/production';
import { Button, Input, Modal, Pill, Select, Textarea, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useDocOptions, useProductionMeta, useSaveDoc } from '../api';
import { DocRegister, type FormProps } from '../components/DocRegister';
import { qtyFmt, rejectTone } from '../ui';

type Form = { hotpressId: string; date: string; shift: Shift; operator: string; cutPcs: string; remarks: string };

/** Board cutting against a hot press report; rejects = boards pressed − cut (legacy openBCForm / bcCalcReject). */
export function CuttingForm({ open, doc, onClose, onSaved }: FormProps<CuttingView>) {
  const toast = useToast();
  const meta = useProductionMeta().data;
  const save = useSaveDoc('cutting');
  const hps = useDocOptions('hotpress', open).data?.rows ?? [];
  const cuts = useDocOptions('cutting', open).data?.rows ?? [];
  const [f, setF] = useState<Form>({ hotpressId: '', date: '', shift: 'Day', operator: '', cutPcs: '', remarks: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(doc ? { hotpressId: doc.hotpressId, date: doc.date, shift: doc.shift, operator: doc.operator ?? '', cutPcs: String(doc.cutPcs), remarks: doc.remarks ?? '' } : { hotpressId: '', date: meta?.today ?? '', shift: 'Day', operator: '', cutPcs: '', remarks: '' });
  }, [open, doc]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };
  // Hot press reports without a cutting report yet (plus this one's own).
  const options = hps.filter((h) => !cuts.some((c) => c.hotpressId === h.id && c.id !== doc?.id));
  const hp = hps.find((h) => h.id === f.hotpressId);
  const preview = hp && Number(f.cutPcs) > 0 ? calcCutting(hp.calc.totalBoards, Number(f.cutPcs)) : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.hotpressId) local.hotpressId = 'Pick the hot press report';
    if (!(Number(f.cutPcs) > 0)) local.cutPcs = 'Enter the boards cut';
    if (Object.keys(local).length) return setErrors(local);
    try {
      const saved = await save.mutateAsync({ id: doc?.id, input: { hotpressId: f.hotpressId, date: f.date, shift: f.shift, operator: f.operator.trim() || null, cutPcs: Number(f.cutPcs), remarks: f.remarks.trim() || null } });
      toast({ tone: 'success', title: `${saved.docNo} saved`, description: `${saved.rejectPcs} rejects (${saved.rejectPct}%)` });
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
      closeOnBackdrop={false}
      title={doc ? `Edit ${doc.docNo}` : 'New board cutting report'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="bc-form" loading={save.isPending}>
            Save report
          </Button>
        </>
      }
    >
      <form id="bc-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Select
          label="Hot press report"
          placeholder={options.length ? 'Select' : 'No hot press report is waiting for cutting'}
          options={options.map((h) => ({ value: h.id, label: `${h.docNo} · ${formatDate(h.date)} · ${h.product} ${h.size} · ${h.calc.totalBoards} boards` }))}
          value={f.hotpressId}
          onChange={(e) => {
            const h = hps.find((x) => x.id === e.target.value);
            setF((x) => ({ ...x, hotpressId: e.target.value, date: doc ? x.date : (h?.date ?? x.date), shift: h?.shift ?? x.shift }));
            setErrors((er) => ({ ...er, hotpressId: '' }));
          }}
          error={errors.hotpressId}
          containerClassName="sm:col-span-2"
        />
        <Input label="Date" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} error={errors.date} />
        <Select label="Shift" options={SHIFTS.map((s) => ({ value: s, label: s }))} value={f.shift} onChange={(e) => set('shift', e.target.value as Shift)} />
        <Input label="Boards cut" inputMode="numeric" value={f.cutPcs} onChange={(e) => set('cutPcs', e.target.value)} error={errors.cutPcs} />
        <Input label="Operator" value={f.operator} onChange={(e) => set('operator', e.target.value)} />
        <div className="rounded bg-page px-3 py-2 text-sm sm:col-span-2" aria-label="Reject preview">
          {hp ? (
            <>
              Pressed <strong className="tabular-nums">{hp.calc.totalBoards}</strong>
              {preview && (
                <>
                  {' '}
                  · rejects <strong className="tabular-nums">{preview.rejectPcs}</strong> <Pill tone={rejectTone(preview.rejectPct)}>{preview.rejectPct}%</Pill>
                </>
              )}
            </>
          ) : (
            <span className="text-muted">Pick a hot press report to see rejects.</span>
          )}
        </div>
        <Textarea label="Remarks" rows={2} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} containerClassName="sm:col-span-2" />
      </form>
    </Modal>
  );
}

export function CuttingDetail({ doc: b }: { doc: CuttingView }) {
  return (
    <DetailList
      cols={3}
      items={[
        { label: 'Hot press', value: b.hotpressNo },
        { label: 'Product', value: [b.product, b.size].filter(Boolean).join(' · ') || null },
        { label: 'Shift', value: b.shift },
        { label: 'Pressed', value: qtyFmt(b.hpPcs) },
        { label: 'Cut', value: qtyFmt(b.cutPcs) },
        { label: 'Rejects', value: <Pill tone={rejectTone(b.rejectPct)}>{`${b.rejectPcs} (${b.rejectPct}%)`}</Pill> },
        { label: 'Operator', value: b.operator },
        { label: 'Entered by', value: b.createdByName },
        { label: 'Remarks', value: b.remarks, wide: true },
      ]}
    />
  );
}

export const columns: Column<CuttingView>[] = [
  { id: 'hp', header: 'Hot press', width: '110px', className: 'tabular-nums', cell: (b) => b.hotpressNo ?? '—' },
  { id: 'product', header: 'Product', cell: (b) => [b.product, b.size].filter(Boolean).join(' · ') || '—' },
  { id: 'pressed', header: 'Pressed', width: '90px', align: 'right', className: 'tabular-nums', cell: (b) => qtyFmt(b.hpPcs) },
  { id: 'cut', header: 'Cut', width: '90px', align: 'right', className: 'font-semibold tabular-nums', cell: (b) => qtyFmt(b.cutPcs) },
  { id: 'rej', header: 'Rejects', width: '130px', cell: (b) => <Pill tone={rejectTone(b.rejectPct)}>{`${b.rejectPcs} (${b.rejectPct}%)`}</Pill> },
];

/** Board cutting register (legacy renderBCList). */
export function CuttingPage() {
  return (
    <DocRegister
      kind="cutting"
      title="Board cutting"
      description="Boards cut from each hot press report; rejects are worked out from what was pressed."
      newLabel="New report"
      searchPlaceholder="Report no., operator"
      columns={columns}
      minWidth={980}
      Form={CuttingForm}
      Detail={CuttingDetail}
    />
  );
}
