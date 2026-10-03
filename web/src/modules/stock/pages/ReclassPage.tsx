import { ArrowRightLeft, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RECLASS_SCENARIOS, skuCode, type ReclassScenario, type ReclassView } from '@contracts/stock';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, Select, Textarea, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { PageHeader } from '../../samples/ui/PageHeader';
import { useCreateReclass, useDeleteReclass, useReclasses, useStockMeta, type Side } from '../api';
import { SkuPicker } from '../components/SkuPicker';
import { qtyFmt } from '../ui';

type Form = { scenario: ReclassScenario; date: string; from: Side | null; to: Side | null; qty: string; reason: string; ref: string };
const blank = (today = ''): Form => ({ scenario: 'Custom', date: today, from: null, to: null, qty: '', reason: '', ref: '' });

/** Stock reclassification, STR/2026/001 (legacy renderReclass / saveReclass). */
export function ReclassPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const meta = useStockMeta().data;
  const groups = meta?.groups ?? [];
  const list = useReclasses();
  const save = useCreateReclass();
  const remove = useDeleteReclass();
  const [f, setF] = useState<Form>(blank());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<ReclassView | null>(null);
  const scenario = RECLASS_SCENARIOS.find((s) => s.label === f.scenario)!;
  const set = <K extends keyof Form>(k: K, v: Form[K], ...clear: string[]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([key]) => ![k, ...clear].includes(key))));
  };
  const code = (s: Side | null) => {
    const g = groups.find((x) => x.id === s?.groupId);
    return g && (g.thicknesses.length === 0 || s?.thick) ? skuCode(g, s!.thick) : null;
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.from) local['from.groupId'] = 'Pick the FROM item';
    else if (!code(f.from)) local['from.thick'] = 'Pick the thickness';
    if (!f.to) local['to.groupId'] = 'Pick the TO item';
    else if (!code(f.to)) local['to.thick'] = 'Pick the thickness';
    if (code(f.from) && code(f.from) === code(f.to)) local.to = 'FROM and TO can’t be the same SKU';
    if (!(Number(f.qty) > 0)) local.qty = 'Enter the quantity';
    if (!f.reason.trim()) local.reason = 'Reason is required';
    if (Object.keys(local).length) return setErrors(local);
    try {
      const r = await save.mutateAsync({ scenario: f.scenario, date: f.date || undefined, from: f.from!, to: f.to!, qty: Number(f.qty), reason: f.reason.trim(), ref: f.ref.trim() || null });
      toast({ tone: 'success', title: `${r.strNo} saved`, description: `${r.from.sku} → ${r.to.sku} · ${qtyFmt(r.qty)}` });
      setF(blank(meta?.today));
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save the reclassification', description: errorMessage(err) });
    }
  }

  const columns: Column<ReclassView>[] = [
    {
      id: 'no',
      header: 'STR',
      width: '140px',
      cell: (r) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold tabular-nums">{r.strNo}</span>
          <span className="text-caption text-faint">{formatDate(r.date)}</span>
        </span>
      ),
    },
    { id: 'scenario', header: 'Type', width: '160px', cell: (r) => r.scenario },
    {
      id: 'move',
      header: 'From → to',
      cell: (r) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold tabular-nums">
            <span className="text-primary">−</span> {r.from.sku} → <span className="text-green">+</span> {r.to.sku}
          </span>
          <span className="truncate text-caption text-faint">
            {r.fromInfo?.dept ?? '—'} → {r.toInfo?.dept ?? '—'}
          </span>
        </span>
      ),
    },
    { id: 'qty', header: 'Qty', width: '90px', align: 'right', className: 'font-semibold tabular-nums', cell: (r) => qtyFmt(r.qty) },
    {
      id: 'reason',
      header: 'Reason',
      width: '240px',
      cell: (r) => (
        <span className="flex flex-col leading-tight">
          <span className="truncate">{r.reason}</span>
          {r.ref && <span className="text-caption text-faint">Ref {r.ref}</span>}
        </span>
      ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '56px',
      align: 'right',
      cell: (r) => canDo('delete') && <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Reverse ${r.strNo}`} onClick={() => setToDelete(r)} />,
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Reclassification (STR)" description="Moves quantity from one SKU to another: regrading, rejects, cut sizes, closing WIP." />
      {canDo('edit') && (
        <Card title="New reclassification">
          <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] [&>*]:min-w-0">
              <Select
                label="Type"
                options={RECLASS_SCENARIOS.map((s) => ({ value: s.label, label: s.label }))}
                value={f.scenario}
                onChange={(e) => set('scenario', e.target.value as ReclassScenario)}
                hint={scenario.hint}
              />
              <Input label="Date" type="date" value={f.date || meta?.today || ''} max={meta?.today} onChange={(e) => set('date', e.target.value)} error={errors.date} containerClassName="w-[170px]" />
            </div>
            <div className="grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
              <SkuPicker idPrefix="rc-from" title={`FROM: ${scenario.from}`} tone="out" groups={groups} value={f.from} onChange={(v) => set('from', v, 'from.groupId', 'from.thick')} errors={{ groupId: errors['from.groupId'], thick: errors['from.thick'] }} />
              <SkuPicker
                idPrefix="rc-to"
                title={`TO: ${scenario.to}`}
                tone="in"
                groups={groups}
                value={f.to}
                onChange={(v) => set('to', v, 'to.groupId', 'to.thick', 'to')}
                errors={{ groupId: errors['to.groupId'] ?? errors.to, thick: errors['to.thick'] }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-[160px_1fr_2fr] [&>*]:min-w-0">
              <Input label="Quantity" inputMode="decimal" value={f.qty} onChange={(e) => set('qty', e.target.value)} error={errors.qty} />
              <Input label="STJ / Miracle ref" placeholder="STJ/2026/001" value={f.ref} onChange={(e) => set('ref', e.target.value)} />
              <Textarea label="Reason" rows={1} placeholder="Grade B boards upgraded after re-inspection" value={f.reason} onChange={(e) => set('reason', e.target.value)} error={errors.reason} />
            </div>
            <div>
              <Button variant="primary" type="submit" icon={ArrowRightLeft} loading={save.isPending}>
                Save reclassification
              </Button>
            </div>
          </form>
        </Card>
      )}
      <DataTable label="Reclassification history" columns={columns} rows={list.data ?? []} getRowId={(r) => r.id} minWidth={960} loading={list.isLoading} empty={<EmptyState icon={ArrowRightLeft} title="No reclassifications yet" />} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Reverse ${toDelete?.strNo ?? ''}?`}
        confirmLabel="Reverse"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: `${toDelete!.strNo} reversed` }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t reverse', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        {toDelete && `${qtyFmt(toDelete.qty)} goes back from ${toDelete.to.sku} to ${toDelete.from.sku}, if ${toDelete.to.sku} still holds it.`}
      </ConfirmDialog>
    </div>
  );
}
