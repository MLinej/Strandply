import { Plus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { calcPlan, PLAN_SECTIONS, PRIORITIES, PRODUCTS, SHIFTS, type PlanProcessKey, type PlanView, type Priority, type Product, type Shift } from '@contracts/production';
import { Button, Input, Modal, Pill, Select, Textarea, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useCompare, useDocOptions, useLots, useMattBatches, useProductionMeta, useSaveDoc } from '../api';
import { DocRegister, type FormProps } from '../components/DocRegister';
import { kg, qtyFmt } from '../ui';
import { CompareTable } from './SummaryPage';

type Line = { key: number; product: Product | ''; size: string; thickness: string; priority: Priority; targetBoards: string };
type Form = {
  date: string;
  shift: Shift;
  planOp: string;
  mattWtKg: string;
  matts: string;
  resinPerMattKg: string;
  wetWoodAvailKg: string;
  hotpressId: string;
  mattBatchId: string;
  cuttingId: string;
  remarks: string;
  products: Line[];
  process: Partial<Record<PlanProcessKey, string>>;
};
let seq = 0;
const line = (o: Partial<Line> = {}): Line => ({ key: ++seq, product: '', size: '8x4', thickness: '', priority: 'Medium', targetBoards: '', ...o });
const optNum = (s: string) => (s.trim() === '' ? null : Number(s));

/** What the plan needs against what is in stock (legacy ppRenderRMTable). */
function Requirement({ need }: { need: { resin: number; dry: number; wet: number; wetFloor: number | null } }) {
  const resin = (useLots('resin').data ?? []).reduce((s, l) => s + Math.max(0, l.availKg), 0);
  const nilgiri = (useLots('nilgiri').data ?? []).reduce((s, l) => s + Math.max(0, l.availKg), 0);
  const rows = [
    { m: 'Wet wood', req: need.wet, avail: need.wetFloor, note: 'Floor stock entered on the plan' },
    { m: 'Resin', req: need.resin, avail: resin, note: 'Purchase resin lots' },
    { m: 'Nilgiri (dry wood)', req: need.dry, avail: nilgiri, note: 'Purchase Nilgiri lots' },
  ];
  return (
    <table className="w-full text-sm" aria-label="Raw material requirement">
      <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
        <tr>
          <th className="px-3 py-1.5 text-left">Material</th>
          <th className="px-3 py-1.5 text-right">Required</th>
          <th className="px-3 py-1.5 text-right">Available</th>
          <th className="px-3 py-1.5 text-left">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.m} className="border-t border-divider tabular-nums">
            <td className="px-3 py-1.5">
              {r.m}
              <span className="block text-caption text-faint">{r.note}</span>
            </td>
            <td className="px-3 py-1.5 text-right">{r.req ? kg(r.req) : '—'}</td>
            <td className="px-3 py-1.5 text-right">{r.avail === null ? '—' : kg(r.avail)}</td>
            <td className="px-3 py-1.5">{!r.req || r.avail === null ? <span className="text-faint">—</span> : r.avail >= r.req ? <Pill tone="green">OK</Pill> : <Pill tone="red">{`Short ${kg(Math.round(r.req - r.avail))}`}</Pill>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Production plan (legacy openPPForm / savePPReport): product lines, department parameters, raw material and links. */
export function PlanForm({ open, doc, onClose, onSaved }: FormProps<PlanView>) {
  const toast = useToast();
  const meta = useProductionMeta().data;
  const save = useSaveDoc('plan');
  const hps = useDocOptions('hotpress', open).data?.rows ?? [];
  const cuts = useDocOptions('cutting', open).data?.rows ?? [];
  const matts = useMattBatches({ pageSize: 100 }, { enabled: open }).data?.rows ?? [];
  const empty = (today = ''): Form => ({ date: today, shift: 'Day', planOp: '', mattWtKg: '', matts: '', resinPerMattKg: '', wetWoodAvailKg: '', hotpressId: '', mattBatchId: '', cuttingId: '', remarks: '', products: [line()], process: {} });
  const [f, setF] = useState<Form>(empty());
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      doc
        ? {
            date: doc.date,
            shift: doc.shift,
            planOp: doc.planOp ?? '',
            mattWtKg: doc.mattWtKg?.toString() ?? '',
            matts: doc.matts?.toString() ?? '',
            resinPerMattKg: doc.resinPerMattKg?.toString() ?? '',
            wetWoodAvailKg: doc.wetWoodAvailKg?.toString() ?? '',
            hotpressId: doc.hotpressId ?? '',
            mattBatchId: doc.mattBatchId ?? '',
            cuttingId: doc.cuttingId ?? '',
            remarks: doc.remarks ?? '',
            products: doc.products.map((p) => line({ ...p, targetBoards: String(p.targetBoards) })),
            process: { ...doc.process },
          }
        : empty(meta?.today),
    );
  }, [open, doc]);
  const set = (p: Partial<Form>) => {
    setF((x) => ({ ...x, ...p }));
    setErrors({});
  };
  const setLine = (key: number, p: Partial<Line>) => set({ products: f.products.map((l) => (l.key === key ? { ...l, ...p } : l)) });
  const filled = f.products.filter((l) => l.product && Number(l.targetBoards) > 0);
  const calc = calcPlan(
    filled.map((l) => ({ product: l.product as Product, size: l.size, thickness: l.thickness, priority: l.priority, targetBoards: Number(l.targetBoards) })),
    { mattWtKg: optNum(f.mattWtKg), matts: optNum(f.matts), resinPerMattKg: optNum(f.resinPerMattKg) },
    meta?.settings,
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!filled.length) local.products = 'Add at least one product line with target boards';
    f.products.forEach((l, i) => {
      if ((l.product || l.targetBoards) && !l.thickness) local[`products.${i}.thickness`] = 'Pick a thickness';
    });
    if (Object.keys(local).length) return setErrors(local);
    try {
      const saved = await save.mutateAsync({
        id: doc?.id,
        input: {
          date: f.date,
          shift: f.shift,
          planOp: f.planOp.trim() || null,
          mattWtKg: optNum(f.mattWtKg),
          matts: optNum(f.matts),
          resinPerMattKg: optNum(f.resinPerMattKg),
          wetWoodAvailKg: optNum(f.wetWoodAvailKg),
          hotpressId: f.hotpressId || null,
          mattBatchId: f.mattBatchId || null,
          cuttingId: f.cuttingId || null,
          remarks: f.remarks.trim() || null,
          products: filled.map((l) => ({ product: l.product, size: l.size, thickness: l.thickness, priority: l.priority, targetBoards: Number(l.targetBoards) })),
          process: Object.fromEntries(Object.entries(f.process).map(([k, v]) => [k, (v ?? '').trim()])),
        },
      });
      toast({ tone: 'success', title: `${saved.docNo} saved`, description: `${saved.products.length} product line(s), ${saved.calc.totalBoards} boards planned` });
      onSaved(saved);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save the plan', description: errorMessage(err) });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={doc ? `Edit ${doc.docNo}` : 'New production plan'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="pp-form" loading={save.isPending}>
            Save plan
          </Button>
        </>
      }
    >
      <form id="pp-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
          <Input label="Plan date" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} error={errors.date} />
          <Select label="Shift" options={SHIFTS.map((s) => ({ value: s, label: s }))} value={f.shift} onChange={(e) => set({ shift: e.target.value as Shift })} />
          <Input label="Planned by" value={f.planOp} onChange={(e) => set({ planOp: e.target.value })} />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">Products</legend>
          {errors.products && <p className="text-sm text-primary">{errors.products}</p>}
          {f.products.map((l, i) => (
            <div key={l.key} className="grid items-end gap-2 rounded border border-border p-2 sm:grid-cols-[1fr_0.8fr_0.8fr_0.8fr_0.9fr_auto] [&>*]:min-w-0">
              <Select label="Product" aria-label={`Product ${i + 1}`} placeholder="Select" options={PRODUCTS.map((p) => ({ value: p, label: p }))} value={l.product} onChange={(e) => setLine(l.key, { product: e.target.value as Product })} />
              <Select label="Size" options={(meta?.settings.sizes ?? [l.size]).map((s) => ({ value: s, label: s }))} value={l.size} onChange={(e) => setLine(l.key, { size: e.target.value })} />
              <Select
                label="Thickness"
                placeholder="—"
                options={(meta?.settings.thicknesses ?? []).map((t) => ({ value: t, label: `${t} mm` }))}
                value={l.thickness}
                onChange={(e) => setLine(l.key, { thickness: e.target.value })}
                error={errors[`products.${i}.thickness`]}
              />
              <Select label="Priority" options={PRIORITIES.map((p) => ({ value: p, label: p }))} value={l.priority} onChange={(e) => setLine(l.key, { priority: e.target.value as Priority })} />
              <Input label="Target boards" aria-label={`Target boards ${i + 1}`} inputMode="numeric" value={l.targetBoards} onChange={(e) => setLine(l.key, { targetBoards: e.target.value })} />
              <Button variant="ghost" size="sm" icon={X} aria-label={`Remove product ${i + 1}`} disabled={f.products.length === 1} onClick={() => set({ products: f.products.filter((y) => y.key !== l.key) })} />
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" icon={Plus} onClick={() => set({ products: [...f.products, line({ size: meta?.settings.sizes[0] ?? '8x4' })] })}>
              Add product
            </Button>
            <p className="text-sm tabular-nums" aria-label="Plan totals">
              <strong>{qtyFmt(calc.totalBoards)} boards</strong> · {qtyFmt(calc.totalSqft)} sqft · {calc.totalCharges} charges
            </p>
          </div>
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-4 [&>*]:min-w-0">
          <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">Raw material</legend>
          <Input label="Target matt weight (kg)" inputMode="decimal" value={f.mattWtKg} onChange={(e) => set({ mattWtKg: e.target.value })} />
          <Input label="No. of matts" inputMode="numeric" placeholder={String(calc.totalBoards || '')} value={f.matts} onChange={(e) => set({ matts: e.target.value })} />
          <Input label="Resin per matt (kg)" inputMode="decimal" value={f.resinPerMattKg} onChange={(e) => set({ resinPerMattKg: e.target.value })} />
          <Input label="Wet wood on floor (kg)" inputMode="decimal" value={f.wetWoodAvailKg} onChange={(e) => set({ wetWoodAvailKg: e.target.value })} />
          <div className="sm:col-span-4">
            <Requirement need={{ resin: calc.resinReqKg, dry: calc.dryWoodReqKg, wet: calc.wetWoodReqKg, wetFloor: optNum(f.wetWoodAvailKg) }} />
          </div>
        </fieldset>
        {PLAN_SECTIONS.map((s) => (
          <fieldset key={s.title} className="grid gap-3 sm:grid-cols-4 [&>*]:min-w-0">
            <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">{s.title}</legend>
            {s.fields.map((fl) => (
              <Input
                key={fl.key}
                label={fl.label}
                type={fl.type === 'time' ? 'time' : 'text'}
                inputMode={fl.type === 'number' ? 'decimal' : undefined}
                value={f.process[fl.key] ?? ''}
                onChange={(e) => set({ process: { ...f.process, [fl.key]: e.target.value } })}
              />
            ))}
          </fieldset>
        ))}
        <fieldset className="grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
          <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">Linked reports (for plan vs actual)</legend>
          <Select label="Hot press" placeholder="None" options={hps.map((h) => ({ value: h.id, label: `${h.docNo} · ${formatDate(h.date)} · ${h.calc.totalBoards} boards` }))} value={f.hotpressId} onChange={(e) => set({ hotpressId: e.target.value })} />
          <Select label="Board cutting" placeholder="None" options={cuts.map((b) => ({ value: b.id, label: `${b.docNo} · cut ${b.cutPcs}` }))} value={f.cuttingId} onChange={(e) => set({ cuttingId: e.target.value })} />
          <Select label="Matt batch" placeholder="None" options={matts.map((m) => ({ value: m.id, label: `${m.docNo} · ${m.stats.count} matts` }))} value={f.mattBatchId} onChange={(e) => set({ mattBatchId: e.target.value })} />
        </fieldset>
        <Textarea label="Remarks" rows={2} value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} />
      </form>
    </Modal>
  );
}

export function PlanDetail({ doc: p }: { doc: PlanView }) {
  const compare = useCompare('plan', p.id).data ?? [];
  const filled = PLAN_SECTIONS.map((s) => ({ ...s, fields: s.fields.filter((f) => p.process[f.key]) })).filter((s) => s.fields.length);
  return (
    <>
      <DetailList
        cols={3}
        items={[
          { label: 'Shift', value: p.shift },
          { label: 'Planned by', value: p.planOp },
          { label: 'Boards / sqft / charges', value: `${qtyFmt(p.calc.totalBoards)} / ${qtyFmt(p.calc.totalSqft)} / ${p.calc.totalCharges}` },
          { label: 'Matts', value: `${p.matts ?? p.calc.totalBoards}${p.mattWtKg ? ` × ${kg(p.mattWtKg)}` : ''}` },
          { label: 'Resin required', value: kg(p.calc.resinReqKg) },
          { label: 'Wet wood required', value: kg(p.calc.wetWoodReqKg) },
          { label: 'Remarks', value: p.remarks, wide: true },
        ]}
      />
      <table className="w-full text-sm" aria-label="Plan products">
        <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
          <tr>
            {['Product', 'Size', 'Thickness', 'Priority', 'Boards', 'Sqft', 'Charges'].map((h, i) => (
              <th key={h} className={i >= 4 ? 'px-3 py-1.5 text-right' : 'px-3 py-1.5 text-left'}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.products.map((x, i) => (
            <tr key={i} className="border-t border-divider tabular-nums">
              <td className="px-3 py-1.5">{x.product}</td>
              <td className="px-3 py-1.5">{x.size}</td>
              <td className="px-3 py-1.5">{x.thickness} mm</td>
              <td className="px-3 py-1.5">
                <Pill tone={x.priority === 'High' ? 'red' : x.priority === 'Medium' ? 'amber' : 'green'}>{x.priority}</Pill>
              </td>
              <td className="px-3 py-1.5 text-right">{qtyFmt(x.targetBoards)}</td>
              <td className="px-3 py-1.5 text-right">{qtyFmt(p.calc.lines[i]!.sqft)}</td>
              <td className="px-3 py-1.5 text-right">{p.calc.lines[i]!.charges}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filled.map((s) => (
        <DetailList key={s.title} cols={3} items={s.fields.map((f) => ({ label: `${s.title} · ${f.label}`, value: p.process[f.key] }))} />
      ))}
      <Requirement need={{ resin: p.calc.resinReqKg, dry: p.calc.dryWoodReqKg, wet: p.calc.wetWoodReqKg, wetFloor: p.wetWoodAvailKg }} />
      <CompareTable rows={compare} label="Production vs plan" />
    </>
  );
}

export const columns: Column<PlanView>[] = [
  { id: 'shift', header: 'Shift', width: '90px', cell: (p) => p.shift },
  { id: 'products', header: 'Products', cell: (p) => <span className="block truncate">{p.products.map((x) => `${x.product} ${x.size}·${x.thickness}mm`).join(', ')}</span> },
  { id: 'priority', header: 'Priority', width: '100px', cell: (p) => <Pill tone={p.products[0]?.priority === 'High' ? 'red' : p.products[0]?.priority === 'Medium' ? 'amber' : 'green'}>{p.products[0]?.priority ?? '—'}</Pill> },
  { id: 'boards', header: 'Boards', width: '90px', align: 'right', className: 'font-semibold tabular-nums', cell: (p) => qtyFmt(p.calc.totalBoards) },
  { id: 'sqft', header: 'Sqft', width: '90px', align: 'right', className: 'tabular-nums', cell: (p) => qtyFmt(p.calc.totalSqft) },
  { id: 'charges', header: 'Charges', width: '80px', align: 'right', className: 'tabular-nums', cell: (p) => p.calc.totalCharges },
];

/** Production planning register (legacy renderPPList). */
export function PlanPage() {
  return (
    <DocRegister
      kind="plan"
      title="Production planning"
      description="Daily plan by shift: products and targets, department parameters, raw material needed, and how production compared."
      newLabel="New plan"
      searchPlaceholder="Plan no., planner"
      columns={columns}
      minWidth={1100}
      Form={PlanForm}
      Detail={PlanDetail}
    />
  );
}
