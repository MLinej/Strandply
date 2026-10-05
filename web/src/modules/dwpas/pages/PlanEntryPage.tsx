import { Plus, Printer, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { LINE_PRIORITIES, PLAN_TYPES, UNITS, type PlanView } from '@contracts/dwpas';
import { useSession } from '@/app/session';
import { Button, Card, Input, Select, Skeleton, Textarea, useToast } from '@/components/ui';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { useDwpasMeta, usePlanByDate, usePlanStep, useSavePlan } from '../api';
import { printPlan } from '../print';
import { d, StatusPill } from '../ui';

interface Row {
  department: string;
  work: string;
  qty: string;
  unit: string;
  skilled: string;
  unskilled: string;
  machine: string;
  priority: string;
  operator: string;
}
const blank = (): Row => ({ department: '', work: '', qty: '', unit: 'Sheets', skilled: '0', unskilled: '0', machine: '', priority: 'High', operator: '' });
const STEPS = ['Supervisor entry', 'Submitted', 'Approved'] as const;

/** Daily plan entry (legacy Daily Plan Entry): pick the date (its plan loads if there is one), the header and the department lines. */
export function PlanEntryPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { canDo } = useSession();
  const meta = useDwpasMeta().data;
  const url = useUrlState(['date'] as const);
  const date = url.values.date || meta?.today || '';
  const existing = usePlanByDate(date || null);
  const save = useSavePlan();
  const step = usePlanStep();
  const plan = existing.data ?? null;
  const [head, setHead] = useState({ type: 'Regular Day', preparedBy: '', remarks: '' });
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (existing.isLoading) return;
    if (plan) {
      setHead({ type: plan.type, preparedBy: plan.preparedBy ?? '', remarks: plan.remarks ?? '' });
      setRows(plan.lines.map((l) => ({ department: l.department, work: l.work, qty: String(l.qty), unit: l.unit, skilled: String(l.skilled), unskilled: String(l.unskilled), machine: l.machine ?? '', priority: l.priority, operator: l.operator ?? '' })));
    } else {
      setHead({ type: 'Regular Day', preparedBy: '', remarks: '' });
      setRows([blank()]);
    }
    setErrors({});
  }, [date, plan?.id, plan?.updatedAt, existing.isLoading]);
  if (!meta || !date || existing.isPending) return <Skeleton className="m-6 h-96" />;
  const locked = plan?.status === 'Approved' || !canDo('edit');
  const setRow = (i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    if (Object.keys(errors).length) setErrors({});
  };
  const headOf = (name: string) => meta.departments.find((x) => x.name === name)?.head ?? '';
  const lines = rows.filter((r) => r.department || r.work);
  const totals = lines.reduce((s, r) => ({ skilled: s.skilled + (Number(r.skilled) || 0), unskilled: s.unskilled + (Number(r.unskilled) || 0) }), { skilled: 0, unskilled: 0 });

  async function persist(then?: (p: PlanView) => Promise<unknown>) {
    try {
      const p = await save.mutateAsync({
        date,
        type: head.type,
        preparedBy: head.preparedBy || null,
        remarks: head.remarks || null,
        lines: lines.map((r) => ({ ...r, qty: r.qty || 0, machine: r.machine || null, operator: r.operator || null })),
      });
      if (then) await then(p);
      setErrors({});
      toast({ tone: 'success', title: then ? `Plan for ${d(date)} submitted` : `Plan for ${d(date)} saved as draft` });
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }
  const stage = plan ? (plan.status === 'Approved' ? 2 : plan.status === 'Submitted' ? 1 : 0) : 0;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Daily plan entry"
        description="One plan per day. Pick the date: its plan opens if there is one, otherwise you start a new one."
        actions={
          plan &&
          canDo('print') && (
            <Button icon={Printer} onClick={() => void printPlan(plan.id, 'plan')}>
              Print plan
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label="Planning date" type="date" value={date} onChange={(e) => url.set({ date: e.target.value })} containerClassName="w-[170px]" />
        {plan ? <StatusPill s={plan.status} /> : <span className="text-sm text-muted">No plan for {d(date)} yet</span>}
        <ol className="ml-auto flex items-center gap-2 text-caption" aria-label="Workflow">
          {STEPS.map((s, i) => (
            <li key={s} className={`rounded-full px-2.5 py-0.5 ${i < stage ? 'bg-green-light text-green' : i === stage ? 'bg-primary-tint font-semibold text-primary' : 'bg-page text-faint'}`}>
              {i + 1}. {s}
            </li>
          ))}
        </ol>
      </div>
      {plan?.status === 'Approved' && <p className="rounded-md bg-amber-light px-3 py-2 text-sm text-amber">This plan is approved and can’t be changed. An approver can reopen it from the register.</p>}
      <Card title="Plan header">
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-3">
          <Select label="Plan type" options={PLAN_TYPES.map((x) => ({ value: x, label: x }))} value={head.type} onChange={(e) => setHead({ ...head, type: e.target.value })} disabled={locked} />
          <Select label="Prepared by" placeholder="Select employee" options={meta.employees.map((e) => ({ value: e.name, label: `${e.name}${e.code ? ` (${e.code})` : ''}` }))} value={head.preparedBy} onChange={(e) => setHead({ ...head, preparedBy: e.target.value })} disabled={locked} />
          <div className="md:col-span-3">
            <Textarea label="Overall remarks / special instructions" rows={2} value={head.remarks} onChange={(e) => setHead({ ...head, remarks: e.target.value })} disabled={locked} />
          </div>
        </div>
      </Card>
      <Card title="Department-wise plan lines" description={`${lines.length} line(s) · skilled ${totals.skilled} · unskilled ${totals.unskilled}`} flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] table-fixed text-sm" aria-label="Plan lines">
            <colgroup>
              <col className="w-8" />
              <col className="w-[170px]" />
              <col className="w-[130px]" />
              <col />
              <col className="w-[90px]" />
              <col className="w-[100px]" />
              <col className="w-[75px]" />
              <col className="w-[75px]" />
              <col className="w-[150px]" />
              <col className="w-[100px]" />
              <col className="w-[150px]" />
              <col className="w-10" />
            </colgroup>
            <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
              <tr>
                {['#', 'Department', 'Head', 'Work planned', 'Target', 'Unit', 'Skilled', 'Unskilled', 'Machine / resource', 'Priority', 'Operator', ''].map((h, i) => (
                  <th key={i} className="px-2 py-2 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-divider align-top">
                  <td className="px-2 py-2 pt-4 text-caption text-faint">{i + 1}</td>
                  <td className="px-1 py-1.5">
                    <Select aria-label={`Department ${i + 1}`} placeholder="Select" options={[...new Set([...meta.departments.map((x) => x.name), ...(r.department ? [r.department] : [])])].map((x) => ({ value: x, label: x }))} value={r.department} onChange={(e) => setRow(i, { department: e.target.value })} error={errors[`lines.${i}.department`]} disabled={locked} />
                  </td>
                  <td className="px-2 py-1.5 pt-3.5 text-caption text-muted">{headOf(r.department) || '—'}</td>
                  <td className="px-1 py-1.5">
                    <Input aria-label={`Work ${i + 1}`} value={r.work} onChange={(e) => setRow(i, { work: e.target.value })} error={errors[`lines.${i}.work`]} placeholder="Work to be done" disabled={locked} />
                  </td>
                  <td className="px-1 py-1.5">
                    <Input aria-label={`Target ${i + 1}`} inputMode="decimal" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} error={errors[`lines.${i}.qty`]} disabled={locked} />
                  </td>
                  <td className="px-1 py-1.5">
                    <Select aria-label={`Unit ${i + 1}`} options={UNITS.map((x) => ({ value: x, label: x }))} value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} disabled={locked} />
                  </td>
                  <td className="px-1 py-1.5">
                    <Input aria-label={`Skilled ${i + 1}`} inputMode="numeric" value={r.skilled} onChange={(e) => setRow(i, { skilled: e.target.value })} error={errors[`lines.${i}.skilled`]} disabled={locked} />
                  </td>
                  <td className="px-1 py-1.5">
                    <Input aria-label={`Unskilled ${i + 1}`} inputMode="numeric" value={r.unskilled} onChange={(e) => setRow(i, { unskilled: e.target.value })} error={errors[`lines.${i}.unskilled`]} disabled={locked} />
                  </td>
                  <td className="px-1 py-1.5">
                    <Input aria-label={`Machine ${i + 1}`} value={r.machine} onChange={(e) => setRow(i, { machine: e.target.value })} disabled={locked} />
                  </td>
                  <td className="px-1 py-1.5">
                    <Select aria-label={`Priority ${i + 1}`} options={LINE_PRIORITIES.map((x) => ({ value: x, label: x }))} value={r.priority} onChange={(e) => setRow(i, { priority: e.target.value })} disabled={locked} />
                  </td>
                  <td className="px-1 py-1.5">
                    <Select aria-label={`Operator ${i + 1}`} placeholder="None" options={meta.employees.map((x) => ({ value: x.name, label: x.name }))} value={r.operator} onChange={(e) => setRow(i, { operator: e.target.value })} disabled={locked} />
                  </td>
                  <td className="px-1 py-1.5">
                    {!locked && <Button variant="ghost" size="sm" icon={Trash2} aria-label={`Remove line ${i + 1}`} onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [blank()]))} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!locked && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider px-3 py-2">
            <Button size="sm" icon={Plus} onClick={() => setRows((rs) => [...rs, blank()])} disabled={rows.length >= 60}>
              Add department line
            </Button>
            {errors.lines && <span className="text-sm text-primary">{errors.lines}</span>}
          </div>
        )}
      </Card>
      {!locked && (
        <div className="flex justify-end gap-2">
          <Button onClick={() => navigate(`/dwpas/register${plan ? `?open=${plan.id}` : ''}`)}>Register</Button>
          <Button loading={save.isPending && !step.isPending} onClick={() => void persist()}>
            Save draft
          </Button>
          <Button variant="primary" icon={Send} loading={step.isPending} onClick={() => void persist((p) => step.mutateAsync({ id: p.id, step: 'submit' }))}>
            Submit for approval
          </Button>
        </div>
      )}
    </div>
  );
}
