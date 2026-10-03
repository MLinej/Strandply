import { Plus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { PRODUCTS, round3, type Product, type SummaryView } from '@contracts/production';
import { Button, Input, Modal, Pill, Select, Textarea, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useCompare, useDocOptions, useMattBatches, useProductionMeta, useSaveDoc, useWip, type CompareRow } from '../api';
import { DocRegister, type FormProps } from '../components/DocRegister';
import { inr, kg, perKg, qtyFmt, rejectTone } from '../ui';

const NUMS = ['pressPcs', 'boards', 'boardRej', 'mattPcs', 'mattWtKg', 'mattRej', 'resinKg', 'dryWoodKg'] as const;
type Num = (typeof NUMS)[number];
type WipLine = { key: number; wipId: string; qty: string };
type Form = {
  date: string;
  product: Product | '';
  size: string;
  thickness: string;
  batch: string;
  planId: string;
  hotpressId: string;
  mattBatchId: string;
  cuttingId: string;
  resinIds: string[];
  remarks: string;
  wip: WipLine[];
} & Record<Num, string> & { resinRupees: string };
let seq = 0;
const blank = (today = ''): Form => ({
  date: today,
  product: '',
  size: '8x4',
  thickness: '',
  batch: '',
  planId: '',
  hotpressId: '',
  mattBatchId: '',
  cuttingId: '',
  resinIds: [],
  remarks: '',
  wip: [],
  pressPcs: '',
  boards: '',
  boardRej: '',
  mattPcs: '',
  mattWtKg: '',
  mattRej: '',
  resinKg: '',
  dryWoodKg: '',
  resinRupees: '',
});

/**
 * Production summary (legacy openPSForm / buildPSEntryFull). Picking a hot press, cutting, matt batch or resin entry
 * fills its figures (still editable); WIP Nilgiri lines give the wet wood used and its cost.
 */
export function SummaryForm({ open, doc, onClose, onSaved }: FormProps<SummaryView>) {
  const toast = useToast();
  const meta = useProductionMeta().data;
  const save = useSaveDoc('summary');
  const plans = useDocOptions('plan', open).data?.rows ?? [];
  const hps = useDocOptions('hotpress', open).data?.rows ?? [];
  const cuts = useDocOptions('cutting', open).data?.rows ?? [];
  const resins = useDocOptions('resin', open).data?.rows ?? [];
  const matts = useMattBatches({ pageSize: 100 }, { enabled: open }).data?.rows ?? [];
  const wips = useWip({ enabled: open }).data ?? [];
  const [f, setF] = useState<Form>(blank());
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (!doc) return setF(blank(meta?.today));
    const nums = Object.fromEntries(NUMS.map((k) => [k, String(doc[k])])) as Record<Num, string>;
    setF({
      ...blank(),
      ...nums,
      date: doc.date,
      product: doc.product,
      size: doc.size,
      thickness: doc.thickness ?? '',
      batch: doc.batch ?? '',
      planId: doc.planId ?? '',
      hotpressId: doc.hotpressId ?? '',
      mattBatchId: doc.mattBatchId ?? '',
      cuttingId: doc.cuttingId ?? '',
      resinIds: doc.resinIds,
      remarks: doc.remarks ?? '',
      resinRupees: String(doc.resinPaise / 100),
      wip: doc.wip.map((w) => ({ key: ++seq, wipId: w.wipId, qty: String(w.qty) })),
    });
  }, [open, doc]);
  const set = (p: Partial<Form>) => {
    setF((x) => ({ ...x, ...p }));
    setErrors({});
  };

  // Legacy psOn*Change: copy figures from the picked document.
  function pickHotpress(id: string) {
    const h = hps.find((x) => x.id === id);
    set({ hotpressId: id, ...(h ? { date: h.date, product: h.product, size: h.size, thickness: h.thickness ?? '', pressPcs: String(h.calc.totalBoards) } : {}) });
  }
  function pickCutting(id: string) {
    const b = cuts.find((x) => x.id === id);
    set({ cuttingId: id, ...(b ? { boards: String(b.cutPcs), boardRej: String(b.rejectPcs) } : {}) });
    if (b && !f.hotpressId) pickHotpress(b.hotpressId);
  }
  function pickMatt(id: string) {
    const m = matts.find((x) => x.id === id);
    set({ mattBatchId: id, ...(m ? { mattPcs: String(m.stats.count), mattWtKg: String(m.stats.avg), mattRej: String(m.stats.fail) } : {}) });
  }
  function toggleResin(id: string) {
    const ids = f.resinIds.includes(id) ? f.resinIds.filter((x) => x !== id) : [...f.resinIds, id];
    const picked = resins.filter((r) => ids.includes(r.id));
    set({ resinIds: ids, ...(picked.length ? { resinKg: String(round3(picked.reduce((s, r) => s + r.lot.qty, 0))), resinRupees: String(picked.reduce((s, r) => s + r.lot.amountPaise, 0) / 100) } : {}) });
  }
  const setWip = (key: number, p: Partial<WipLine>) => setF((x) => ({ ...x, wip: x.wip.map((w) => (w.key === key ? { ...w, ...p } : w)) }));
  const wipLines = f.wip.filter((w) => w.wipId && Number(w.qty) > 0);
  const wetKg = round3(wipLines.reduce((s, w) => s + Number(w.qty), 0));
  const wetPaise = wipLines.reduce((s, w) => s + Math.round((Number(w.qty) * (wips.find((b) => b.id === w.wipId)?.avgRatePaise ?? 0)) / 1000), 0);
  // What this summary already used is free again while editing.
  const availOf = (id: string) => (wips.find((b) => b.id === id)?.availKg ?? 0) + (doc?.wip.find((w) => w.wipId === id)?.qty ?? 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!f.product) return setErrors({ product: 'Pick a product' });
    try {
      const saved = await save.mutateAsync({
        id: doc?.id,
        input: {
          date: f.date,
          product: f.product,
          size: f.size,
          thickness: f.thickness || null,
          batch: f.batch.trim() || null,
          planId: f.planId || null,
          hotpressId: f.hotpressId || null,
          mattBatchId: f.mattBatchId || null,
          cuttingId: f.cuttingId || null,
          resinIds: f.resinIds,
          remarks: f.remarks.trim() || null,
          ...Object.fromEntries(NUMS.map((k) => [k, Number(f[k]) || 0])),
          resinPaise: Math.round((Number(f.resinRupees) || 0) * 100),
          wip: wipLines.map((w) => ({ wipId: w.wipId, qty: Number(w.qty) })),
        },
      });
      toast({ tone: 'success', title: `${saved.docNo} saved`, description: `${saved.boards} boards` });
      onSaved(saved);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save the summary', description: errorMessage(err) });
    }
  }
  const numInput = (k: Num, label: string, disabled = false) => <Input label={label} inputMode="decimal" value={f[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<Form>)} error={errors[k]} disabled={disabled} />;
  const linked = f.resinIds.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={doc ? `Edit ${doc.docNo}` : 'New production summary'}
      description="Link the shift’s documents to fill their figures; anything can still be corrected."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="ps-form" loading={save.isPending}>
            Save summary
          </Button>
        </>
      }
    >
      <form id="ps-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <fieldset className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">Linked documents</legend>
          <Select label="Production plan" placeholder="None" options={plans.map((p) => ({ value: p.id, label: `${p.docNo} · ${formatDate(p.date)} · ${p.shift} · ${p.calc.totalBoards} boards` }))} value={f.planId} onChange={(e) => set({ planId: e.target.value })} />
          <Select label="Hot press" placeholder="None" options={hps.map((h) => ({ value: h.id, label: `${h.docNo} · ${formatDate(h.date)} · ${h.product} · ${h.calc.totalBoards} boards` }))} value={f.hotpressId} onChange={(e) => pickHotpress(e.target.value)} error={errors.hotpressId} />
          <Select label="Board cutting" placeholder="None" options={cuts.map((b) => ({ value: b.id, label: `${b.docNo} · ${formatDate(b.date)} · cut ${b.cutPcs}` }))} value={f.cuttingId} onChange={(e) => pickCutting(e.target.value)} />
          <Select label="Matt batch" placeholder="None" options={matts.map((m) => ({ value: m.id, label: `${m.docNo} · ${formatDate(m.date)} · ${m.stats.count} matts` }))} value={f.mattBatchId} onChange={(e) => pickMatt(e.target.value)} />
          <div className="sm:col-span-2">
            <div className="mb-1 text-sm font-semibold text-ink">Resin entries</div>
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {resins.length === 0 && <span className="text-sm text-muted">No resin entries yet.</span>}
              {resins.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-1.5 rounded border border-border px-2 py-1 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={f.resinIds.includes(r.id)} onChange={() => toggleResin(r.id)} />
                  {r.docNo} · {formatDate(r.date)} · {kg(r.lot.qty)}
                </label>
              ))}
            </div>
          </div>
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-4 [&>*]:min-w-0">
          <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">Product</legend>
          <Input label="Date" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} error={errors.date} />
          <Select label="Product" placeholder="Select" options={PRODUCTS.map((p) => ({ value: p, label: p }))} value={f.product} onChange={(e) => set({ product: e.target.value as Product })} error={errors.product} />
          <Select label="Size" options={(meta?.settings.sizes ?? [f.size]).map((s) => ({ value: s, label: s }))} value={f.size} onChange={(e) => set({ size: e.target.value })} />
          <Select label="Thickness" placeholder="—" options={(meta?.settings.thicknesses ?? []).map((t) => ({ value: t, label: `${t} mm` }))} value={f.thickness} onChange={(e) => set({ thickness: e.target.value })} />
          <Input label="Batch" value={f.batch} onChange={(e) => set({ batch: e.target.value })} />
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-4 [&>*]:min-w-0">
          <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">Output and consumption</legend>
          {numInput('pressPcs', 'Press pcs')}
          {numInput('boards', 'Boards produced')}
          {numInput('boardRej', 'Board rejects')}
          {numInput('mattPcs', 'Matts')}
          {numInput('mattWtKg', 'Avg matt weight (kg)')}
          {numInput('mattRej', 'Matt rejects')}
          {numInput('resinKg', 'Resin (kg)', linked)}
          <Input label="Resin (₹)" inputMode="decimal" value={f.resinRupees} onChange={(e) => set({ resinRupees: e.target.value })} disabled={linked} hint={linked ? 'From the linked resin entries' : undefined} />
          {numInput('dryWoodKg', 'Dry wood (kg)')}
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">WIP Nilgiri used</legend>
          {f.wip.map((w, i) => {
            const b = wips.find((x) => x.id === w.wipId);
            const over = b && Number(w.qty) > availOf(w.wipId);
            return (
              <div key={w.key} className="grid items-start gap-2 sm:grid-cols-[1fr_160px_auto] [&>*]:min-w-0">
                <Select
                  label="WIP batch"
                  aria-label={`WIP batch ${i + 1}`}
                  placeholder="Select"
                  options={wips.filter((x) => x.id === w.wipId || (availOf(x.id) > 0 && !f.wip.some((y) => y.wipId === x.id))).map((x) => ({ value: x.id, label: `${x.docNo} (${x.chippingNo}) · ${kg(availOf(x.id))} left · ${perKg(x.avgRatePaise)}` }))}
                  value={w.wipId}
                  onChange={(e) => setWip(w.key, { wipId: e.target.value, qty: w.qty || String(availOf(e.target.value)) })}
                  error={errors[`wip.${i}.wipId`]}
                />
                <Input label="Qty (kg)" aria-label={`WIP quantity ${i + 1}`} inputMode="decimal" value={w.qty} onChange={(e) => setWip(w.key, { qty: e.target.value })} hint={over ? 'More than the batch holds: it will go negative' : undefined} />
                <Button variant="ghost" size="sm" icon={X} className="sm:mt-6" aria-label={`Remove WIP line ${i + 1}`} onClick={() => setF((x) => ({ ...x, wip: x.wip.filter((y) => y.key !== w.key) }))} />
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" icon={Plus} onClick={() => setF((x) => ({ ...x, wip: [...x.wip, { key: ++seq, wipId: '', qty: '' }] }))}>
              Add WIP batch
            </Button>
            <p className="text-sm tabular-nums" aria-label="Wet wood">
              Wet wood <strong>{kg(wetKg)}</strong> · {inr(wetPaise)}
              {wetKg > 0 && ` · ${perKg(Math.round((wetPaise / wetKg) * 1000))}`}
            </p>
          </div>
        </fieldset>
        <Textarea label="Remarks" rows={2} value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} />
      </form>
    </Modal>
  );
}

export function CompareTable({ rows, label }: { rows: CompareRow[]; label: string }) {
  if (!rows.length) return null;
  return (
    <section>
      <h3 className="mb-1.5 text-label font-semibold uppercase tracking-label text-faint">{label}</h3>
      <table className="w-full text-sm" aria-label={label}>
        <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
          <tr>
            <th className="px-3 py-1.5 text-left">Metric</th>
            <th className="px-3 py-1.5 text-right">Plan</th>
            <th className="px-3 py-1.5 text-right">Actual</th>
            <th className="px-3 py-1.5 text-right">Variance</th>
            <th className="px-3 py-1.5 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.metric} className="border-t border-divider tabular-nums">
              <td className="px-3 py-1.5">{r.metric}</td>
              <td className="px-3 py-1.5 text-right">{r.plan === null ? '—' : qtyFmt(r.plan)}</td>
              <td className="px-3 py-1.5 text-right">{r.actual === null ? '—' : qtyFmt(r.actual)}</td>
              <td className="px-3 py-1.5 text-right">{r.variance === null ? '—' : `${r.variance > 0 ? '+' : ''}${qtyFmt(r.variance)}`}</td>
              <td className="px-3 py-1.5">
                <Pill tone={r.status === 'On plan' || r.status === 'OK' ? 'green' : r.status === 'Not linked' || r.status === '—' ? 'neutral' : 'amber'}>{r.status}</Pill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function SummaryDetail({ doc: s }: { doc: SummaryView }) {
  const compare = useCompare('summary', s.planId ? s.id : null).data ?? [];
  return (
    <>
      <DetailList
        cols={3}
        items={[
          { label: 'Product', value: `${s.product} · ${s.size}${s.thickness ? ` · ${s.thickness} mm` : ''}` },
          { label: 'Batch', value: s.batch },
          { label: 'Press pcs', value: qtyFmt(s.pressPcs) },
          { label: 'Boards', value: qtyFmt(s.boards) },
          { label: 'Board rejects', value: <Pill tone={rejectTone(s.boardRejPct)}>{`${s.boardRej} (${s.boardRejPct}%)`}</Pill> },
          { label: 'Matts', value: `${qtyFmt(s.mattPcs)} · avg ${kg(s.mattWtKg)} · ${s.mattRej} rejected` },
          { label: 'Resin', value: `${kg(s.resinKg)} · ${inr(s.resinPaise)}` },
          { label: 'Dry wood', value: kg(s.dryWoodKg) },
          { label: 'Wet wood', value: `${kg(s.wetWoodKg)} · ${inr(s.wetWoodPaise)}${s.wetWoodKg ? ` · ${perKg(s.wetWoodRatePaise)}` : ''}` },
          { label: 'Plan', value: s.links.planNo },
          { label: 'Hot press / cutting', value: [s.links.hotpressNo, s.links.cuttingNo].filter(Boolean).join(' · ') || null },
          { label: 'Matt batch', value: s.links.mattNo },
          { label: 'Resin entries', value: s.links.resinNos.join(', ') || null },
          { label: 'WIP batches', value: s.wip.map((w, i) => `${s.links.wipNos[i]} (${kg(w.qty)})`).join(', ') || null },
          { label: 'Entered by', value: s.createdByName },
          { label: 'Remarks', value: s.remarks, wide: true },
        ]}
      />
      <CompareTable rows={compare} label="Plan vs actual" />
    </>
  );
}

export const columns: Column<SummaryView>[] = [
  { id: 'product', header: 'Product', cell: (s) => `${s.product} · ${s.size}${s.thickness ? ` · ${s.thickness} mm` : ''}` },
  { id: 'boards', header: 'Boards', width: '90px', align: 'right', className: 'font-semibold tabular-nums', cell: (s) => qtyFmt(s.boards) },
  { id: 'rej', header: 'Rejects', width: '120px', cell: (s) => <Pill tone={rejectTone(s.boardRejPct)}>{`${s.boardRej} (${s.boardRejPct}%)`}</Pill> },
  { id: 'resin', header: 'Resin', width: '110px', align: 'right', className: 'tabular-nums', cell: (s) => kg(s.resinKg) },
  { id: 'wet', header: 'Wet wood', width: '120px', align: 'right', className: 'tabular-nums', cell: (s) => kg(s.wetWoodKg) },
  { id: 'links', header: 'Linked', width: '170px', cell: (s) => <span className="block truncate text-caption text-muted">{[s.links.planNo, s.links.hotpressNo, s.links.cuttingNo].filter(Boolean).join(' · ') || '—'}</span> },
];

/** Production summary register (legacy renderPSList). */
export function SummaryPage() {
  return (
    <DocRegister
      kind="summary"
      title="Production summary"
      description="What each shift produced and consumed, with links to its hot press, cutting, matt, resin and WIP records."
      newLabel="New summary"
      searchPlaceholder="Summary no., product, batch"
      columns={columns}
      minWidth={1160}
      Form={SummaryForm}
      Detail={SummaryDetail}
    />
  );
}
