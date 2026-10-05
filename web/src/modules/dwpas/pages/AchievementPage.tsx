import { Printer, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { achievementPct } from '@contracts/dwpas';
import { useSession } from '@/app/session';
import { Button, Card, EmptyState, Input, Skeleton, useToast } from '@/components/ui';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { useDwpasMeta, usePlanByDate, useSaveAchievement } from '../api';
import { printPlan } from '../print';
import { Achievement, d, num, StatusPill } from '../ui';

interface Row {
  actualQty: string;
  actualSkilled: string;
  actualUnskilled: string;
  reason: string;
  headRemarks: string;
}
const text = (n: number | null) => (n === null ? '' : String(n));

/** Achievement entry (legacy Achievement Entry): actuals, manpower used and remarks against each line of a day’s plan. */
export function AchievementPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const meta = useDwpasMeta().data;
  const url = useUrlState(['date'] as const);
  const date = url.values.date || meta?.today || '';
  const planQ = usePlanByDate(date || null);
  const save = useSaveAchievement();
  const plan = planQ.data ?? null;
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    setRows((plan?.lines ?? []).map((l) => ({ actualQty: text(l.actualQty), actualSkilled: text(l.actualSkilled), actualUnskilled: text(l.actualUnskilled), reason: l.reason ?? '', headRemarks: l.headRemarks ?? '' })));
    setErrors({});
  }, [plan?.id, plan?.updatedAt]);
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const future = !!meta && date > meta.today;
  const submit = () =>
    void save
      .mutateAsync({ id: plan!.id, lines: rows.map((r) => ({ ...r, reason: r.reason || null, headRemarks: r.headRemarks || null })) })
      .then(() => {
        setErrors({});
        toast({ tone: 'success', title: `Achievement saved for ${d(date)}` });
      })
      .catch((err) => {
        setErrors(fieldErrors(err));
        toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
      });
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Achievement entry"
        description="What each department actually did against the plan. 95% and up is green, 80% and up amber, below that red."
        actions={
          plan &&
          canDo('print') && (
            <Button icon={Printer} onClick={() => void printPlan(plan.id, 'achievement')}>
              Print achievement
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label="Plan date" type="date" value={date} onChange={(e) => url.set({ date: e.target.value })} containerClassName="w-[170px]" />
        {plan && <StatusPill s={plan.status} />}
      </div>
      {!meta || planQ.isLoading ? (
        <Skeleton className="h-80" />
      ) : !plan ? (
        <EmptyState title={`No plan for ${d(date)}`} description="Create the plan first on Daily plan entry." />
      ) : (
        <Card flush title={`${d(plan.date)} · ${plan.lines.length} line(s)`} description={future ? 'This day hasn’t come yet: achievement can be entered from the plan’s day onwards.' : undefined}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] table-fixed text-sm" aria-label="Achievement">
              <colgroup>
                <col className="w-8" />
                <col className="w-[140px]" />
                <col />
                <col className="w-[105px]" />
                <col className="w-[100px]" />
                <col className="w-[75px]" />
                <col className="w-[105px]" />
                <col className="w-[105px]" />
                <col className="w-[150px]" />
                <col className="w-[140px]" />
              </colgroup>
              <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
                <tr>
                  {['#', 'Department', 'Work', 'Target', 'Actual', 'Achv', 'Skilled P → A', 'Unskilled P → A', 'Deviation reason', 'Head remarks'].map((h, i) => (
                    <th key={i} className="px-2 py-2 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.lines.map((l, i) => {
                  const r = rows[i];
                  if (!r) return null;
                  const live = { qty: l.qty, actualQty: r.actualQty === '' ? null : Number(r.actualQty) };
                  const low = (achievementPct(live.qty, live.actualQty) ?? 100) < 95;
                  const disabled = future || !canDo('edit');
                  return (
                    <tr key={i} className="border-t border-divider align-top">
                      <td className="px-2 py-2 pt-4 text-caption text-faint">{i + 1}</td>
                      <td className="px-2 py-2">
                        <span className="block font-semibold">{l.department}</span>
                        <span className="text-caption text-faint">{l.head}</span>
                      </td>
                      <td className="px-2 py-2 text-muted">{l.work}</td>
                      <td className="px-2 py-2 pt-3.5 font-semibold tabular-nums">
                        {num(l.qty)} {l.unit}
                      </td>
                      <td className="px-1 py-1.5">
                        <Input aria-label={`Actual ${i + 1}`} inputMode="decimal" value={r.actualQty} onChange={(e) => setRow(i, { actualQty: e.target.value })} error={errors[`lines.${i}.actualQty`]} disabled={disabled} />
                      </td>
                      <td className="px-2 py-2 pt-3.5">
                        <Achievement line={live} />
                      </td>
                      <td className="px-1 py-1.5">
                        <Input aria-label={`Skilled actual ${i + 1}`} inputMode="numeric" suffix={`/ ${l.skilled}`} value={r.actualSkilled} onChange={(e) => setRow(i, { actualSkilled: e.target.value })} error={errors[`lines.${i}.actualSkilled`]} disabled={disabled} />
                      </td>
                      <td className="px-1 py-1.5">
                        <Input aria-label={`Unskilled actual ${i + 1}`} inputMode="numeric" suffix={`/ ${l.unskilled}`} value={r.actualUnskilled} onChange={(e) => setRow(i, { actualUnskilled: e.target.value })} error={errors[`lines.${i}.actualUnskilled`]} disabled={disabled} />
                      </td>
                      <td className="px-1 py-1.5">
                        <Input aria-label={`Reason ${i + 1}`} value={r.reason} onChange={(e) => setRow(i, { reason: e.target.value })} placeholder={low && r.actualQty !== '' ? 'Why short?' : 'Deviation reason'} disabled={disabled} />
                      </td>
                      <td className="px-1 py-1.5">
                        <Input aria-label={`Head remarks ${i + 1}`} value={r.headRemarks} onChange={(e) => setRow(i, { headRemarks: e.target.value })} disabled={disabled} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canDo('edit') && !future && (
            <div className="flex justify-end border-t border-divider px-3 py-2">
              <Button variant="primary" icon={Save} loading={save.isPending} onClick={submit}>
                Save achievement
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
