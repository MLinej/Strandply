import { ArrowLeft, Delete, Lock, Pencil, Plus, Printer, Scale, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { mattStatus, PRODUCTS, SHIFTS, type MattBatchView, type Product, type Shift } from '@contracts/production';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, KpiTile, MenuItem, MenuSeparator, Modal, Pagination, Pill, Select, Textarea, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { useMattAction, useMattBatch, useMattBatches, useProductionMeta, useSaveMatt } from '../api';
import { printMatt } from '../print';
import { FySelect, MattPill, stamp } from '../ui';

const PAGE_SIZE = 20;

type Form = { date: string; shift: Shift; product: Product | ''; size: string; thickness: string; operator: string; setpoint: string; band: string; targetQty: string; remarks: string };

function BatchForm({ open, batch, onClose, onSaved }: { open: boolean; batch: MattBatchView | null; onClose: () => void; onSaved: (b: MattBatchView) => void }) {
  const toast = useToast();
  const meta = useProductionMeta().data;
  const save = useSaveMatt();
  const [f, setF] = useState<Form>({ date: '', shift: 'Day', product: '', size: '8x4', thickness: '', operator: '', setpoint: '', band: '0.5', targetQty: '', remarks: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      batch
        ? { date: batch.date, shift: batch.shift, product: batch.product, size: batch.size, thickness: batch.thickness ?? '', operator: batch.operator ?? '', setpoint: String(batch.setpoint), band: String(batch.band), targetQty: batch.targetQty?.toString() ?? '', remarks: batch.remarks ?? '' }
        : { date: meta?.today ?? '', shift: 'Day', product: '', size: meta?.settings.sizes[0] ?? '8x4', thickness: '', operator: '', setpoint: '', band: '0.5', targetQty: '', remarks: '' },
    );
  }, [open, batch]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.product) local.product = 'Pick a product';
    if (!(Number(f.setpoint) > 0)) local.setpoint = 'Enter the target weight';
    if (!(Number(f.band) > 0)) local.band = 'Enter the pass band';
    if (Object.keys(local).length) return setErrors(local);
    try {
      const b = await save.mutateAsync({
        id: batch?.id,
        input: { date: f.date, shift: f.shift, product: f.product, size: f.size, thickness: f.thickness || null, operator: f.operator.trim() || null, setpoint: Number(f.setpoint), band: Number(f.band), targetQty: f.targetQty === '' ? null : Number(f.targetQty), remarks: f.remarks.trim() || null },
      });
      toast({ tone: 'success', title: batch ? `${b.docNo} updated` : `${b.docNo} opened`, description: batch ? undefined : 'Start punching weights.' });
      onSaved(b);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save the batch', description: errorMessage(err) });
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      title={batch ? `Edit ${batch.docNo}` : 'New matt batch'}
      description={batch ? 'Changing the setpoint or band re-grades every weight already punched.' : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="matt-form" loading={save.isPending}>
            {batch ? 'Save changes' : 'Open batch'}
          </Button>
        </>
      }
    >
      <form id="matt-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
        <Input label="Date" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} error={errors.date} />
        <Select label="Shift" options={SHIFTS.map((s) => ({ value: s, label: s }))} value={f.shift} onChange={(e) => set('shift', e.target.value as Shift)} />
        <Input label="Operator" value={f.operator} onChange={(e) => set('operator', e.target.value)} />
        <Select label="Product" placeholder="Select" options={PRODUCTS.map((p) => ({ value: p, label: p }))} value={f.product} onChange={(e) => set('product', e.target.value as Product)} error={errors.product} />
        <Select label="Size" options={(meta?.settings.sizes ?? [f.size]).map((s) => ({ value: s, label: s }))} value={f.size} onChange={(e) => set('size', e.target.value)} />
        <Select label="Thickness" placeholder="—" options={(meta?.settings.thicknesses ?? []).map((t) => ({ value: t, label: `${t} mm` }))} value={f.thickness} onChange={(e) => set('thickness', e.target.value)} />
        <Input label="Setpoint (kg)" inputMode="decimal" value={f.setpoint} onChange={(e) => set('setpoint', e.target.value)} error={errors.setpoint} />
        <Input label="Pass band (± kg)" inputMode="decimal" value={f.band} onChange={(e) => set('band', e.target.value)} error={errors.band} hint="Warn up to twice this" />
        <Input label="Target matts" inputMode="numeric" value={f.targetQty} onChange={(e) => set('targetQty', e.target.value)} />
        <Textarea label="Remarks" rows={2} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} containerClassName="sm:col-span-3" />
      </form>
    </Modal>
  );
}

/** Weight spread in 0.1 kg steps around the setpoint (weight-system distribution chart). */
function Distribution({ b }: { b: MattBatchView }) {
  const bins = useMemo(() => {
    if (!b.weights.length) return [];
    const map = new Map<number, number>();
    for (const w of b.weights) {
      const k = Math.round(w.weight * 10) / 10;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map].sort((x, y) => x[0] - y[0]);
  }, [b.weights]);
  const max = Math.max(1, ...bins.map((x) => x[1]));
  if (!bins.length) return <p className="text-sm text-muted">No weights yet.</p>;
  return (
    <div className="flex h-36 items-end gap-1 overflow-x-auto" role="img" aria-label="Weight distribution">
      {bins.map(([w, n]) => {
        const s = mattStatus(w, b.setpoint, b.band);
        return (
          <div key={w} className="flex min-w-[28px] flex-1 flex-col items-center justify-end gap-0.5" title={`${w.toFixed(1)} kg: ${n}`}>
            <span className="text-caption tabular-nums">{n}</span>
            <span className={s === 'pass' ? 'w-full rounded-t bg-green' : s === 'warn' ? 'w-full rounded-t bg-amber' : 'w-full rounded-t bg-primary'} style={{ height: `${(n / max) * 100}px` }} />
            <span className="text-caption tabular-nums text-faint">{w.toFixed(1)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The last 60 weights against the setpoint and warn lines (weight-system trend chart). */
function Trend({ b }: { b: MattBatchView }) {
  const ws = b.weights.slice(-60);
  if (ws.length < 2) return <p className="text-sm text-muted">Needs two or more weights.</p>;
  const W = 600;
  const H = 140;
  const lo = Math.min(b.setpoint - 2 * b.band, ...ws.map((w) => w.weight)) - 0.1;
  const hi = Math.max(b.setpoint + 2 * b.band, ...ws.map((w) => w.weight)) + 0.1;
  const x = (i: number) => (i / (ws.length - 1)) * (W - 20) + 10;
  const y = (v: number) => H - 10 - ((v - lo) / (hi - lo)) * (H - 20);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" role="img" aria-label="Weight trend">
      {[b.setpoint - b.band, b.setpoint + b.band].map((v) => (
        <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-amber" strokeDasharray="4 4" strokeWidth={1} />
      ))}
      <line x1={0} x2={W} y1={y(b.setpoint)} y2={y(b.setpoint)} stroke="currentColor" className="text-green" strokeWidth={1} />
      <polyline points={ws.map((w, i) => `${x(i)},${y(w.weight)}`).join(' ')} fill="none" stroke="currentColor" className="text-ink" strokeWidth={1.5} />
      {ws.map((w, i) => {
        const s = mattStatus(w.weight, b.setpoint, b.band);
        return <circle key={w.n} cx={x(i)} cy={y(w.weight)} r={2.5} className={s === 'pass' ? 'fill-green' : s === 'warn' ? 'fill-amber' : 'fill-primary'} />;
      })}
    </svg>
  );
}

/** Punching weights for one open batch (legacy renderMattPunchView + weight-system punch screen). Keyboard: digits, ., Backspace, Enter. */
function PunchView({ id, onBack }: { id: string; onBack: () => void }) {
  const toast = useToast();
  const { canDo } = useSession();
  const b = useMattBatch(id).data;
  const act = useMattAction();
  const [entry, setEntry] = useState('');
  const [editing, setEditing] = useState<{ n: number; weight: string } | null>(null);
  const [closing, setClosing] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const open = b?.status === 'open' && canDo('edit');
  const busy = useRef(false);

  async function punch() {
    const w = Number(entry);
    if (!open || !(w > 0) || busy.current) return;
    busy.current = true;
    try {
      const r = await act.mutateAsync({ id, kind: 'punch', weight: w });
      const last = r.weights.at(-1)!;
      const s = mattStatus(last.weight, r.setpoint, r.band);
      toast({ tone: s === 'pass' ? 'success' : s === 'warn' ? 'warning' : 'error', title: `Matt #${last.n}: ${last.weight} kg · ${{ pass: 'Pass', warn: 'Warn', fail: 'Reject' }[s]}` });
      setEntry('');
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t punch the weight', description: errorMessage(err) });
    } finally {
      busy.current = false;
    }
  }
  const press = (k: string) => setEntry((e) => (k === '←' ? e.slice(0, -1) : k === '.' ? (e.includes('.') ? e : `${e || '0'}.`) : e.length >= 8 ? e : e + k));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editing || closing) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === '.' || e.key === ',') press('.');
      else if (e.key === 'Backspace') press('←');
      else if (e.key === 'Enter') void punch();
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!b) return <p className="p-6 text-muted">Loading…</p>;
  const w = Number(entry);
  const preview = w > 0 ? mattStatus(w, b.setpoint, b.band) : null;
  const s = b.stats;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title={`Matt batch ${b.docNo}`}
        description={`${b.product} · ${b.size}${b.thickness ? ` · ${b.thickness} mm` : ''} · ${b.shift} · setpoint ${b.setpoint} kg ± ${b.band}${b.status === 'closed' ? ' · closed' : ''}`}
        actions={
          <>
            <Button icon={ArrowLeft} onClick={onBack}>
              All batches
            </Button>
            {canDo('print') && (
              <Button icon={Printer} onClick={() => void printMatt(b.id).catch((err) => toast({ tone: 'error', title: 'Couldn’t print', description: errorMessage(err) }))}>
                Print
              </Button>
            )}
            {open && (
              <Button icon={Lock} onClick={() => setClosing(true)}>
                Close batch
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        <KpiTile variant="compact" label="Matts" value={`${s.count}${b.targetQty ? ` / ${b.targetQty}` : ''}`} />
        <KpiTile variant="compact" label="Average" value={`${s.avg} kg`} />
        <KpiTile variant="compact" label="Pass" value={s.pass} />
        <KpiTile variant="compact" label="Warn" value={s.warn} />
        <KpiTile variant="compact" label="Reject" value={s.fail} emphasis={s.fail ? 'bad' : undefined} />
        <KpiTile variant="compact" label="Pass rate" value={`${s.passRate}%`} meta={`σ ${s.stdDev} · ${s.min}–${s.max} kg`} />
      </div>
      <div className="grid gap-3 lg:grid-cols-[360px_1fr]">
        {open ? (
          <Card title="Punch weight">
            <div className="mb-3 rounded-lg bg-ink px-4 py-3 text-right text-card" aria-live="polite">
              <div className="text-[40px] font-bold leading-none tabular-nums" data-testid="matt-display">
                {entry || '0.00'}
              </div>
              <div className="mt-1 text-sm">
                {preview ? (
                  <span className={preview === 'pass' ? 'text-green-light' : preview === 'warn' ? 'text-amber-light' : 'text-primary-light'}>
                    {{ pass: 'Pass', warn: 'Warn', fail: 'Reject' }[preview]} · {w - b.setpoint >= 0 ? '+' : ''}
                    {(w - b.setpoint).toFixed(3)} kg
                  </span>
                ) : (
                  <span className="text-faint">Type or tap a weight</span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Numpad">
              {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '←'].map((k) => (
                <Button key={k} size="lg" onClick={() => press(k)} aria-label={k === '←' ? 'Backspace' : k} icon={k === '←' ? Delete : undefined}>
                  {k === '←' ? '' : k}
                </Button>
              ))}
            </div>
            <Button variant="primary" size="lg" fullWidth className="mt-3" icon={Scale} disabled={!(w > 0)} loading={act.isPending} onClick={() => void punch()}>
              Punch
            </Button>
          </Card>
        ) : (
          <Card title="Batch closed">
            <p className="text-sm text-muted">No more weights can be punched. Open a new batch to continue.</p>
          </Card>
        )}
        <div className="flex flex-col gap-3">
          <Card title="Distribution">
            <Distribution b={b} />
          </Card>
          <Card title="Trend">
            <Trend b={b} />
          </Card>
        </div>
      </div>
      <Card flush title="Matts punched" description="Newest first. Corrections need the Approve production permission.">
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm" aria-label="Matts punched">
            <thead className="sticky top-0 bg-page text-label font-semibold uppercase tracking-label text-muted">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-right">Weight</th>
                <th className="px-4 py-2 text-right">Deviation</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Time</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {[...b.weights].reverse().map((x) => {
                const dev = Math.round((x.weight - b.setpoint) * 1000) / 1000;
                return (
                  <tr key={x.n} className="border-t border-divider tabular-nums">
                    <td className="px-4 py-1.5">{x.n}</td>
                    <td className="px-4 py-1.5 text-right font-semibold">{x.weight.toFixed(3)}</td>
                    <td className="px-4 py-1.5 text-right">{`${dev > 0 ? '+' : ''}${dev.toFixed(3)}`}</td>
                    <td className="px-4 py-1.5">
                      <MattPill status={mattStatus(x.weight, b.setpoint, b.band)} />
                    </td>
                    <td className="px-4 py-1.5 text-muted">{stamp(x.at)}</td>
                    <td className="px-4 py-1.5 text-right">
                      {canDo('production_approve') && (
                        <span className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" icon={Pencil} aria-label={`Correct matt ${x.n}`} onClick={() => setEditing({ n: x.n, weight: String(x.weight) })} />
                          <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete matt ${x.n}`} onClick={() => setRemoving(x.n)} />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {b.weights.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-muted">
                    No matts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        size="sm"
        title={`Correct matt #${editing?.n ?? ''}`}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={act.isPending}
              onClick={() =>
                void act
                  .mutateAsync({ id, kind: 'edit', n: editing!.n, weight: Number(editing!.weight) })
                  .then(() => {
                    toast({ tone: 'success', title: `Matt #${editing!.n} corrected` });
                    setEditing(null);
                  })
                  .catch((err) => toast({ tone: 'error', title: 'Couldn’t correct', description: errorMessage(err) }))
              }
            >
              Save
            </Button>
          </>
        }
      >
        <Input label="Weight (kg)" inputMode="decimal" autoFocus value={editing?.weight ?? ''} onChange={(e) => setEditing((x) => x && { ...x, weight: e.target.value })} />
      </Modal>
      <ConfirmDialog
        open={removing !== null}
        title={`Delete matt #${removing ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={act.isPending}
        onConfirm={() =>
          void act
            .mutateAsync({ id, kind: 'delete', n: removing! })
            .then(() => toast({ tone: 'success', title: `Matt #${removing} deleted` }))
            .catch((err) => toast({ tone: 'error', title: 'Couldn’t delete', description: errorMessage(err) }))
            .finally(() => setRemoving(null))
        }
        onClose={() => setRemoving(null)}
      >
        The other matts keep their numbers.
      </ConfirmDialog>
      <ConfirmDialog
        open={closing}
        title={`Close ${b.docNo}?`}
        confirmLabel="Close batch"
        busy={act.isPending}
        onConfirm={() =>
          void act
            .mutateAsync({ id, kind: 'close' })
            .then(() => toast({ tone: 'success', title: `${b.docNo} closed` }))
            .catch((err) => toast({ tone: 'error', title: 'Couldn’t close', description: errorMessage(err) }))
            .finally(() => setClosing(false))
        }
        onClose={() => setClosing(false)}
      >
        No more weights can be punched after closing. Nothing is deleted.
      </ConfirmDialog>
    </div>
  );
}

/** Matt weight batches (legacy renderMattList). `?batch=<id>` opens the punch screen. */
export function MattPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { canDo } = useSession();
  const url = useUrlState(['batch', 'status', 'fy'] as const);
  const [search, setSearch] = useSearchParam(url);
  const list = useMattBatches({ q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE, filters: { status: (url.values.status || undefined) as 'open' | 'closed' | undefined, fy: url.values.fy || undefined } });
  const act = useMattAction();
  const [form, setForm] = useState<MattBatchView | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<MattBatchView | null>(null);
  if (url.values.batch) return <PunchView id={url.values.batch} onBack={() => url.set({ batch: null })} />;
  const openBatch = (b: MattBatchView) => navigate(`/production/matt?batch=${b.id}`);

  const columns: Column<MattBatchView>[] = [
    {
      id: 'no',
      header: 'Batch',
      width: '130px',
      cell: (b) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold tabular-nums">{b.docNo}</span>
          <span className="text-caption text-faint">{formatDate(b.date)}</span>
        </span>
      ),
    },
    { id: 'product', header: 'Product', cell: (b) => `${b.product} · ${b.size}${b.thickness ? ` · ${b.thickness} mm` : ''} · ${b.shift}` },
    { id: 'sp', header: 'Setpoint', width: '120px', className: 'tabular-nums', cell: (b) => `${b.setpoint} ± ${b.band}` },
    { id: 'matts', header: 'Matts', width: '90px', align: 'right', className: 'font-semibold tabular-nums', cell: (b) => `${b.stats.count}${b.targetQty ? `/${b.targetQty}` : ''}` },
    { id: 'avg', header: 'Average', width: '100px', align: 'right', className: 'tabular-nums', cell: (b) => (b.stats.count ? `${b.stats.avg} kg` : '—') },
    { id: 'pass', header: 'Pass rate', width: '100px', cell: (b) => (b.stats.count ? <Pill tone={b.stats.passRate >= 95 ? 'green' : b.stats.passRate >= 80 ? 'amber' : 'red'}>{`${b.stats.passRate}%`}</Pill> : '—') },
    { id: 'status', header: 'Status', width: '90px', cell: (b) => (b.status === 'open' ? <Pill tone="green">Open</Pill> : <Pill>Closed</Pill>) },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (b) => (
        <RowMenu label={`Actions for ${b.docNo}`}>
          {(close) => (
            <>
              <MenuItem icon={Scale} onClick={runAndClose(close, () => openBatch(b))}>
                {b.status === 'open' && canDo('edit') ? 'Punch weights' : 'View'}
              </MenuItem>
              {canDo('edit') && (
                <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(b))}>
                  Edit
                </MenuItem>
              )}
              {canDo('print') && (
                <MenuItem icon={Printer} onClick={runAndClose(close, () => void printMatt(b.id).catch((err) => toast({ tone: 'error', title: 'Couldn’t print', description: errorMessage(err) })))}>
                  Print
                </MenuItem>
              )}
              {canDo('delete') && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(b))}>
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
        title="Matt weight"
        description="Matt batches with a target weight; every matt is weighed and graded pass, warn or reject."
        actions={
          canDo('edit') && (
            <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
              New batch
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search batches" icon={Search} placeholder="Batch no., product, operator" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[240px]" />
        <Select aria-label="Status" placeholder="Open and closed" options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }]} value={url.values.status} onChange={(e) => url.set({ status: e.target.value })} containerClassName="w-[170px]" />
        <FySelect value={url.values.fy} onChange={(v) => url.set({ fy: v })} />
      </div>
      <DataTable
        label="Matt batches"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(b) => b.id}
        minWidth={1000}
        loading={list.isLoading}
        onRowClick={openBatch}
        empty={<EmptyState icon={Scale} title="No matt batches" />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <BatchForm
        open={form !== null}
        batch={form === 'new' ? null : form}
        onClose={() => setForm(null)}
        onSaved={(b) => {
          const isNew = form === 'new';
          setForm(null);
          if (isNew) openBatch(b);
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.docNo ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={act.isPending}
        onConfirm={() =>
          void act
            .mutateAsync({ id: toDelete!.id, kind: 'remove' })
            .then(() => toast({ tone: 'success', title: `${toDelete!.docNo} deleted` }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        {toDelete && `All ${toDelete.stats.count} weights go with it. A batch linked from a plan or summary can’t be deleted.`}
      </ConfirmDialog>
    </div>
  );
}
