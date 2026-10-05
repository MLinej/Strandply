import { achievementPct, lightOf, type DwDepartment, type DwEmployee, type DwPlan, type PlanLine, type PlanStep, type PlanView } from '../../contracts/dwpas';
import { isoNow, type Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { newId } from '../../lib/crypto';
import { conflict, notFound, validationFailed } from '../../lib/errors';
import { UniqueViolationError, type DataLayer, type ListQuery, type Repos } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';

/* eslint-disable @typescript-eslint/no-explicit-any -- inputs are validated by zod at the route */
type Input = Record<string, any>;
const bad = (path: string, message: string) => validationFailed('Invalid input', [{ path, message }]);
const unique = <T,>(what: string, fn: () => Promise<T>) =>
  fn().catch((err) => {
    if (err instanceof UniqueViolationError) throw conflict('duplicate', `There is already ${what}`);
    throw err;
  });

/** Totals for a plan: lines, manpower planned and actual, and the traffic-light counts (legacy dashboard / register). */
export function planView(p: DwPlan): PlanView {
  const pcts = p.lines.map((l) => achievementPct(l.qty, l.actualQty)).filter((x): x is number => x !== null);
  const sum = (f: (l: PlanLine) => number | null) => (p.lines.some((l) => f(l) !== null) ? p.lines.reduce((s, l) => s + (f(l) ?? 0), 0) : null);
  return {
    ...p,
    totals: {
      lines: p.lines.length,
      skilled: p.lines.reduce((s, l) => s + l.skilled, 0),
      unskilled: p.lines.reduce((s, l) => s + l.unskilled, 0),
      actualSkilled: sum((l) => l.actualSkilled),
      actualUnskilled: sum((l) => l.actualUnskilled),
      recorded: p.lines.filter((l) => l.actualQty !== null).length,
      green: pcts.filter((x) => lightOf(x) === 'green').length,
      amber: pcts.filter((x) => lightOf(x) === 'amber').length,
      red: pcts.filter((x) => lightOf(x) === 'red').length,
      highPriority: p.lines.filter((l) => l.priority === 'High').length,
    },
  };
}

/** Department and employee masters, daily plans, their approval and achievement (legacy DWPAS). */
export class DwpasService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  private today = () => businessToday(this.clock);
  private step = (actor: Actor, action: PlanStep['action'], at: string, note: string | null = null): PlanStep => ({ action, by: actor.id, byName: actor.name, at, note });

  // ── Masters ───────────────────────────────────────────────────────

  async departments(): Promise<DwDepartment[]> {
    return (await this.data.repos.dwDepartments.listAll()).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Renaming a department renames it on employees (plans keep the name they were saved with). */
  async saveDepartment(actor: Actor, id: string | null, input: Input): Promise<DwDepartment> {
    return this.data.uow.run(async (tx) => {
      const at = isoNow(this.clock);
      const before = id ? await tx.dwDepartments.getById(id) : null;
      if (id && !before) throw notFound('Department');
      const keep = <K extends keyof DwDepartment>(k: K, fallback: DwDepartment[K]) => (input[k] === undefined ? (before?.[k] ?? fallback) : input[k]);
      const fields = { name: keep('name', ''), code: keep('code', null), head: keep('head', ''), description: keep('description', null), active: keep('active', true) };
      const d = (await unique('a department with that name', () => (before ? tx.dwDepartments.update(before.id, { ...fields, updatedAt: at }) : tx.dwDepartments.create({ id: newId(), ...fields, createdBy: actor.id, createdAt: at, updatedAt: at }))))!;
      if (before && before.name !== d.name) for (const e of (await tx.dwEmployees.listAll()).filter((x) => x.department === before.name)) await tx.dwEmployees.update(e.id, { department: d.name, updatedAt: at });
      await this.activity.record(tx, actor, { action: before ? 'Edit' : 'Create', entityType: 'dwpas_department', entityId: d.id, details: `Department ${d.name}${d.code ? ` [${d.code}]` : ''}, head ${d.head}` });
      return d;
    });
  }

  async removeDepartment(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const d = await tx.dwDepartments.getById(id);
      if (!d) throw notFound('Department');
      if ((await tx.dwPlans.listAll()).some((p) => p.lines.some((l) => l.department === d.name))) throw conflict('in_use', `${d.name} is on plans; deactivate it instead`);
      await tx.dwDepartments.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'dwpas_department', entityId: id, details: `Deleted department ${d.name}` });
    });
  }

  async employees(): Promise<DwEmployee[]> {
    return (await this.data.repos.dwEmployees.listAll()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveEmployee(actor: Actor, id: string | null, input: Input): Promise<DwEmployee> {
    return this.data.uow.run(async (tx) => {
      const at = isoNow(this.clock);
      const before = id ? await tx.dwEmployees.getById(id) : null;
      if (id && !before) throw notFound('Employee');
      const keep = <K extends keyof DwEmployee>(k: K, fallback: DwEmployee[K]) => (input[k] === undefined ? (before?.[k] ?? fallback) : input[k]);
      const fields = { code: keep('code', null), name: keep('name', ''), department: keep('department', null), designation: keep('designation', null), type: keep('type', 'Skilled'), active: keep('active', true) };
      if (fields.code && (await tx.dwEmployees.listAll()).some((e) => e.id !== id && e.code?.toLowerCase() === fields.code!.toLowerCase())) throw conflict('duplicate', `Code ${fields.code} is already used`);
      const e = (await unique('an employee with that name', () => (before ? tx.dwEmployees.update(before.id, { ...fields, updatedAt: at }) : tx.dwEmployees.create({ id: newId(), ...fields, createdBy: actor.id, createdAt: at, updatedAt: at }))))!;
      await this.activity.record(tx, actor, { action: before ? 'Edit' : 'Create', entityType: 'dwpas_employee', entityId: e.id, details: `Employee ${e.name}${e.code ? ` [${e.code}]` : ''}, ${e.type}` });
      return e;
    });
  }

  async removeEmployee(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const e = await tx.dwEmployees.getById(id);
      if (!e) throw notFound('Employee');
      await tx.dwEmployees.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'dwpas_employee', entityId: id, details: `Deleted employee ${e.name}` });
    });
  }

  // ── Plans ─────────────────────────────────────────────────────────

  async list(query: ListQuery<{ status: string; from: string; to: string }>) {
    const res = await this.data.repos.dwPlans.list(query);
    return { rows: res.rows.map(planView), total: res.total };
  }

  async byDate(date: string): Promise<PlanView | null> {
    const p = (await this.data.repos.dwPlans.listAll()).find((x) => x.date === date);
    return p ? planView(p) : null;
  }

  async get(id: string): Promise<DwPlan> {
    const p = await this.data.repos.dwPlans.getById(id);
    if (!p) throw notFound('Plan');
    return p;
  }

  /** Departments must be on the master (active); the head is copied from it. */
  private async lines(tx: Repos, input: Input[], before?: PlanLine[]): Promise<PlanLine[]> {
    const depts = new Map((await tx.dwDepartments.listAll()).map((d) => [d.name, d]));
    return input.map((l, i) => {
      const d = depts.get(l.department);
      if (!d || (!d.active && before?.[i]?.department !== l.department)) throw bad(`lines.${i}.department`, 'Pick a department from the master');
      // Achievement already recorded stays with its line when the work and department are unchanged.
      const old = before?.find((b) => b.department === l.department && b.work === l.work);
      return {
        department: d.name,
        head: d.head,
        work: l.work,
        qty: l.qty,
        unit: l.unit,
        skilled: l.skilled,
        unskilled: l.unskilled,
        machine: l.machine ?? null,
        priority: l.priority,
        operator: l.operator ?? null,
        actualQty: old?.actualQty ?? null,
        actualSkilled: old?.actualSkilled ?? null,
        actualUnskilled: old?.actualUnskilled ?? null,
        reason: old?.reason ?? null,
        headRemarks: old?.headRemarks ?? null,
      };
    });
  }

  /**
   * Saves the plan for a date: creates it, or replaces the header and lines of that date's plan (legacy one plan
   * per date). An approved plan is fixed until an approver reopens it; a submitted one goes back to draft when edited.
   */
  async save(actor: Actor, input: Input): Promise<PlanView> {
    return this.data.uow.run(async (tx) => {
      const at = isoNow(this.clock);
      const before = (await tx.dwPlans.listAll()).find((p) => p.date === input.date);
      if (before?.status === 'Approved') throw conflict('locked', `The plan for ${input.date} is approved; ask an approver to reopen it`);
      const lines = await this.lines(tx, input.lines, before?.lines);
      const fields = { type: input.type, preparedBy: input.preparedBy ?? null, remarks: input.remarks ?? null, lines, status: 'Draft' as const };
      const p = before
        ? (await tx.dwPlans.update(before.id, { ...fields, trail: before.status === 'Submitted' ? [...before.trail, this.step(actor, 'reopened', at, 'Edited after submitting')] : before.trail, updatedAt: at }))!
        : await tx.dwPlans.create({ id: newId(), date: input.date, ...fields, trail: [], createdBy: actor.id, createdAt: at, updatedAt: at });
      await this.activity.record(tx, actor, { action: before ? 'Edit' : 'Create', entityType: 'dwpas_plan', entityId: p.id, details: `Plan ${p.date} (${p.type}): ${lines.length} line(s)` });
      return planView(p);
    });
  }

  /** Draft → Submitted (legacy step 2, dept head approval). */
  async submit(actor: Actor, id: string): Promise<PlanView> {
    return this.data.uow.run(async (tx) => {
      const p = await tx.dwPlans.getById(id);
      if (!p) throw notFound('Plan');
      if (p.status !== 'Draft') throw conflict('wrong_state', `The plan for ${p.date} is already ${p.status.toLowerCase()}`);
      const at = isoNow(this.clock);
      const u = (await tx.dwPlans.update(id, { status: 'Submitted', trail: [...p.trail, this.step(actor, 'submitted', at)], updatedAt: at }))!;
      await this.activity.record(tx, actor, { action: 'StatusChange', entityType: 'dwpas_plan', entityId: id, details: `Plan ${p.date} submitted for approval` });
      return planView(u);
    });
  }

  /** Submitted → Approved, or Approved → Draft (reopen). Needs dwpas_approve. */
  async decide(actor: Actor, id: string, approve: boolean, note: string | null | undefined): Promise<PlanView> {
    return this.data.uow.run(async (tx) => {
      const p = await tx.dwPlans.getById(id);
      if (!p) throw notFound('Plan');
      if (approve && p.status !== 'Submitted') throw conflict('wrong_state', `Only a submitted plan can be approved (this one is ${p.status.toLowerCase()})`);
      if (!approve && p.status === 'Draft') throw conflict('wrong_state', 'The plan is already a draft');
      const at = isoNow(this.clock);
      const u = (await tx.dwPlans.update(id, { status: approve ? 'Approved' : 'Draft', trail: [...p.trail, this.step(actor, approve ? 'approved' : 'reopened', at, note ?? null)], updatedAt: at }))!;
      await this.activity.record(tx, actor, { action: approve ? 'Approve' : 'StatusChange', entityType: 'dwpas_plan', entityId: id, details: `Plan ${p.date} ${approve ? 'approved' : 'reopened'}${note ? `: ${note}` : ''}` });
      return planView(u);
    });
  }

  /** Achievement against each line, in line order (legacy Achievement Entry). Not for a day still to come. */
  async achievement(actor: Actor, id: string, input: Input): Promise<PlanView> {
    return this.data.uow.run(async (tx) => {
      const p = await tx.dwPlans.getById(id);
      if (!p) throw notFound('Plan');
      if (p.date > this.today()) throw bad('date', 'Achievement can be entered from the plan’s day onwards');
      if (input.lines.length !== p.lines.length) throw bad('lines', `The plan has ${p.lines.length} line(s)`);
      const at = isoNow(this.clock);
      const lines = p.lines.map((l, i) => {
        const a = input.lines[i];
        return { ...l, actualQty: a.actualQty ?? null, actualSkilled: a.actualSkilled ?? null, actualUnskilled: a.actualUnskilled ?? null, reason: a.reason ?? null, headRemarks: a.headRemarks ?? null };
      });
      const recorded = lines.filter((l) => l.actualQty !== null).length;
      const u = (await tx.dwPlans.update(id, { lines, trail: [...p.trail, this.step(actor, 'achievement', at, `${recorded} of ${lines.length} line(s) recorded`)], updatedAt: at }))!;
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'dwpas_plan', entityId: id, details: `Achievement for ${p.date}: ${recorded} of ${lines.length} line(s)` });
      return planView(u);
    });
  }

  async remove(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const p = await tx.dwPlans.getById(id);
      if (!p) throw notFound('Plan');
      if (p.status === 'Approved') throw conflict('locked', 'An approved plan can’t be deleted; reopen it first');
      await tx.dwPlans.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'dwpas_plan', entityId: id, details: `Deleted plan ${p.date}` });
    });
  }

  /** Plans waiting for approval, for the sidebar badge. */
  async submittedCount() {
    return (await this.data.repos.dwPlans.listAll()).filter((p) => p.status === 'Submitted').length;
  }
}
