import { CheckCircle2, ClipboardList, Download, Pencil, Printer, RotateCcw, Search, Target, Trash2, Users, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PLAN_STATUSES, type PlanView } from '@contracts/dwpas';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, Pagination, Pill, Select, Textarea, useToast, type Column } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportPlans, useDeletePlan, usePlans, usePlanStep } from '../api';
import { printPlan } from '../print';
import { Achievement, d, num, PriorityPill, stamp, StatusPill } from '../ui';

const PAGE_SIZE = 25;
const STEP: Record<string, string> = { submitted: 'Submitted', approved: 'Approved', reopened: 'Reopened', achievement: 'Achievement' };

/** One plan (legacy register detail panel): totals, lines with achievement, actions and the trail. */
function Detail({ plan: p, onClose }: { plan: PlanView; onClose: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { canDo } = useSession();
  const step = usePlanStep();
  const remove = useDeletePlan();
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const t = p.totals;
  const run = (s: 'submit' | 'approve' | 'reopen') =>
    void step
      .mutateAsync({ id: p.id, step: s, note: note.trim() || null })
      .then((x) => {
        setNote('');
        toast({ tone: 'success', title: `Plan ${d(x.date)}: ${x.status}` });
      })
      .catch((err) => toast({ tone: 'error', title: 'Couldn’t update', description: errorMessage(err) }));
  return (
    <Card aria-label={`Plan ${p.date}`} title={d(p.date)} description={`${p.type} · ${p.preparedBy ?? 'no preparer'}`} actions={<Button variant="ghost" size="sm" icon={X} aria-label="Close" onClick={onClose} />}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill s={p.status} />
          <span className="text-sm text-muted">
            {t.lines} depts · skilled {t.skilled} · unskilled {t.unskilled} · achievement {t.recorded}/{t.lines}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {canDo('edit') && p.status !== 'Approved' && (
            <Button size="sm" icon={Pencil} onClick={() => navigate(`/dwpas/plan?date=${p.date}`)}>
              Edit plan
            </Button>
          )}
          {canDo('edit') && (
            <Button size="sm" icon={Target} onClick={() => navigate(`/dwpas/achievement?date=${p.date}`)}>
              Enter achievement
            </Button>
          )}
          <Button size="sm" icon={Users} onClick={() => navigate(`/dwpas/manpower?date=${p.date}`)}>
            Manpower view
          </Button>
          {canDo('print') &&
            (['plan', 'achievement', 'manpower'] as const).map((k) => (
              <Button key={k} size="sm" icon={Printer} onClick={() => void printPlan(p.id, k).catch((err) => toast({ tone: 'error', title: 'Couldn’t print', description: errorMessage(err) }))}>
                {`Print ${k}`}
              </Button>
            ))}
        </div>
        {(p.status === 'Draft' && canDo('edit')) || (p.status !== 'Draft' && canDo('dwpas_approve')) ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            {p.status !== 'Draft' && <Textarea label="Note (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
            <div className="flex flex-wrap justify-end gap-2">
              {p.status === 'Draft' && (
                <Button size="sm" loading={step.isPending} onClick={() => run('submit')}>
                  Submit for approval
                </Button>
              )}
              {p.status !== 'Draft' && canDo('dwpas_approve') && (
                <Button size="sm" icon={RotateCcw} loading={step.isPending} onClick={() => run('reopen')}>
                  Reopen
                </Button>
              )}
              {p.status === 'Submitted' && canDo('dwpas_approve') && (
                <Button size="sm" icon={CheckCircle2} loading={step.isPending} onClick={() => run('approve')}>
                  Approve
                </Button>
              )}
            </div>
          </div>
        ) : null}
        {p.remarks && <p className="rounded-md bg-amber-light px-3 py-2 text-sm text-amber">{p.remarks}</p>}
        <ul className="flex flex-col divide-y divide-divider" aria-label="Plan lines">
          {p.lines.map((l, i) => (
            <li key={i} className="py-2 text-sm">
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  {i + 1}. {l.department}
                </span>
                <span className="flex gap-1.5">
                  <PriorityPill p={l.priority} />
                  <Achievement line={l} />
                </span>
              </span>
              <span className="block text-muted">{l.work}</span>
              <span className="block text-caption text-faint">
                Target {num(l.qty)} {l.unit} · actual {l.actualQty === null ? 'not recorded' : `${num(l.actualQty)} ${l.unit}`} · head {l.head}
                {l.machine ? ` · ${l.machine}` : ''}
              </span>
              {l.reason && <span className="block text-caption text-amber">Reason: {l.reason}</span>}
              {l.headRemarks && <span className="block text-caption text-muted">Head: {l.headRemarks}</span>}
            </li>
          ))}
        </ul>
        {p.trail.length > 0 && (
          <ol className="flex flex-col gap-1 border-t border-divider pt-2 text-caption text-muted" aria-label="Trail">
            {p.trail.map((s, i) => (
              <li key={i}>
                <span className="font-semibold text-ink">{STEP[s.action]}</span> · {s.byName} · {stamp(s.at)}
                {s.note ? ` · ${s.note}` : ''}
              </li>
            ))}
          </ol>
        )}
        {canDo('delete') && p.status !== 'Approved' && (
          <Button size="sm" variant="danger-outline" icon={Trash2} onClick={() => setConfirm(true)}>
            Delete plan
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        title={`Delete the plan for ${d(p.date)}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(p.id)
            .then(() => {
              toast({ tone: 'success', title: 'Plan deleted' });
              onClose();
            })
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setConfirm(false))
        }
        onClose={() => setConfirm(false)}
      >
        Its lines and achievement go with it.
      </ConfirmDialog>
    </Card>
  );
}

/** Plan register (legacy Plan Register): plans by date with status, departments and manpower; open one for the detail. */
export function RegisterPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['status', 'from', 'to'] as const);
  const [search, setSearch] = useSearchParam(url);
  const v = url.values;
  const list = usePlans({ q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE, filters: { status: v.status || undefined, from: v.from || undefined, to: v.to || undefined } });
  const selected = list.data?.rows.find((p) => p.id === url.open) ?? null;
  const columns: Column<PlanView>[] = [
    { id: 'date', header: 'Date', width: '120px', className: 'font-semibold tabular-nums', cell: (p) => d(p.date) },
    { id: 'type', header: 'Type', width: '130px', className: 'text-sm', cell: (p) => p.type },
    { id: 'by', header: 'Prepared by', className: 'text-sm', cell: (p) => p.preparedBy ?? '—' },
    { id: 'lines', header: 'Depts', width: '70px', align: 'right', className: 'tabular-nums', cell: (p) => p.totals.lines },
    { id: 'manpower', header: 'Skilled / unskilled', width: '140px', align: 'right', className: 'tabular-nums text-sm', cell: (p) => `${p.totals.skilled} / ${p.totals.unskilled}` },
    {
      id: 'ach',
      header: 'Achievement',
      width: '170px',
      cell: (p) =>
        p.totals.recorded ? (
          <span className="flex gap-1">
            {p.totals.green > 0 && <Pill tone="green">{p.totals.green}</Pill>}
            {p.totals.amber > 0 && <Pill tone="amber">{p.totals.amber}</Pill>}
            {p.totals.red > 0 && <Pill tone="red">{p.totals.red}</Pill>}
            {p.totals.recorded < p.totals.lines && <span className="text-caption text-faint">+{p.totals.lines - p.totals.recorded} pending</span>}
          </span>
        ) : (
          <span className="text-faint">Not recorded</span>
        ),
    },
    { id: 'status', header: 'Status', width: '110px', cell: (p) => <StatusPill s={p.status} /> },
  ];
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Plan register"
        description="Every day’s plan, newest first. Open one to see its lines, achievement and trail."
        actions={
          canDo('export') && (
            <Button icon={Download} onClick={() => void exportPlans({ from: v.from || undefined, to: v.to || undefined }).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
              Excel
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search" icon={Search} placeholder="Prepared by, type" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[220px]" />
        <Select aria-label="Status" placeholder="All statuses" options={PLAN_STATUSES.map((x) => ({ value: x, label: x }))} value={v.status} onChange={(e) => url.set({ status: e.target.value })} containerClassName="w-[150px]" />
        <Input aria-label="From date" type="date" value={v.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={v.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
      </div>
      <div className={selected ? 'grid items-start gap-3.5 xl:grid-cols-[minmax(0,1fr)_440px]' : undefined}>
        <DataTable
          label="Plan register"
          columns={selected ? columns.filter((c) => ['date', 'lines', 'ach', 'status'].includes(c.id)) : columns}
          rows={list.data?.rows ?? []}
          getRowId={(p) => p.id}
          minWidth={selected ? 520 : 900}
          loading={list.isLoading}
          onRowClick={(p) => url.set({ open: p.id, page: url.page })}
          empty={<EmptyState icon={ClipboardList} title="No plans match" />}
          footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
        />
        {selected && <Detail key={selected.id} plan={selected} onClose={() => url.set({ open: null, page: url.page })} />}
      </div>
    </div>
  );
}
