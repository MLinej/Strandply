import { achievementPct, lightOf, type DeptVariance, type DwpasMeta, type ManpowerRow, type PlanView, type VarianceReport, type VarianceRow } from '../../contracts/dwpas';
import { isoNow, type Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { writeXlsx } from '../../lib/spreadsheet';
import type { DataLayer } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import type { CompanyService } from '../sampletrack/settings/company-service';
import { planView, type DwpasService } from './dwpas-service';

export interface Range {
  from?: string;
  to?: string;
  department?: string;
}

/** Meta, the day dashboard, variance, manpower, Excel export and print data. */
export class DwpasReportService {
  constructor(
    private readonly data: DataLayer,
    private readonly dwpas: DwpasService,
    private readonly company: CompanyService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  async meta(): Promise<DwpasMeta> {
    const [depts, emps] = await Promise.all([this.dwpas.departments(), this.dwpas.employees()]);
    return {
      departments: depts.filter((d) => d.active).map((d) => ({ name: d.name, code: d.code, head: d.head })),
      employees: emps.filter((e) => e.active).map((e) => ({ name: e.name, code: e.code, department: e.department, type: e.type })),
      today: businessToday(this.clock),
    };
  }

  /** The day's plan (today by default) with its totals; the dashboard and manpower views are built from it. */
  async day(date?: string): Promise<{ date: string; plan: PlanView | null }> {
    const d = date ?? businessToday(this.clock);
    return { date: d, plan: await this.dwpas.byDate(d) };
  }

  async manpower(date?: string): Promise<{ date: string; plan: PlanView | null; rows: ManpowerRow[] }> {
    const { date: d, plan } = await this.day(date);
    return { date: d, plan, rows: (plan?.lines ?? []).map((l) => ({ department: l.department, head: l.head, work: l.work, priority: l.priority, skilled: l.skilled, unskilled: l.unskilled, actualSkilled: l.actualSkilled, actualUnskilled: l.actualUnskilled })) };
  }

  /** Lines with an achievement in the range (legacy Variance Analysis), plus a department summary. */
  async variance(r: Range): Promise<VarianceReport> {
    const plans = (await this.data.repos.dwPlans.listAll()).filter((p) => (!r.from || p.date >= r.from) && (!r.to || p.date <= r.to)).sort((a, b) => b.date.localeCompare(a.date));
    const lines = plans.flatMap((p) => p.lines.map((l) => ({ date: p.date, l }))).filter(({ l }) => !r.department || l.department === r.department);
    const rows: VarianceRow[] = lines
      .filter(({ l }) => l.actualQty !== null)
      .map(({ date, l }) => {
        const pct = achievementPct(l.qty, l.actualQty);
        return { date, department: l.department, work: l.work, unit: l.unit, planned: l.qty, actual: l.actualQty!, diff: Math.round((l.actualQty! - l.qty) * 100) / 100, pct, light: pct === null ? null : lightOf(pct), reason: l.reason, headRemarks: l.headRemarks };
      });
    const depts = [...new Set(rows.map((x) => x.department))];
    const byDepartment: DeptVariance[] = depts
      .map((department) => {
        const rs = rows.filter((x) => x.department === department);
        const pcts = rs.map((x) => x.pct).filter((x): x is number => x !== null);
        return { department, lines: rs.length, avgPct: pcts.length ? Math.round(pcts.reduce((s, x) => s + x, 0) / pcts.length) : null, green: rs.filter((x) => x.light === 'green').length, amber: rs.filter((x) => x.light === 'amber').length, red: rs.filter((x) => x.light === 'red').length };
      })
      .sort((a, b) => (a.avgPct ?? 999) - (b.avgPct ?? 999));
    return { rows, byDepartment, pending: lines.filter(({ date, l }) => l.actualQty === null && date <= businessToday(this.clock)).length };
  }

  async exportXlsx(actor: Actor, r: Range): Promise<Uint8Array> {
    const plans = (await this.data.repos.dwPlans.listAll()).filter((p) => (!r.from || p.date >= r.from) && (!r.to || p.date <= r.to)).sort((a, b) => a.date.localeCompare(b.date));
    const rows = plans.flatMap((p) => p.lines.filter((l) => !r.department || l.department === r.department).map((l) => ({ p, l, pct: achievementPct(l.qty, l.actualQty) })));
    const bytes = writeXlsx([
      {
        name: 'Plan and achievement',
        rows,
        columns: [
          { header: 'Date', value: (x) => x.p.date },
          { header: 'Plan type', value: (x) => x.p.type },
          { header: 'Status', value: (x) => x.p.status },
          { header: 'Prepared by', value: (x) => x.p.preparedBy },
          { header: 'Department', value: (x) => x.l.department },
          { header: 'Head', value: (x) => x.l.head },
          { header: 'Work planned', value: (x) => x.l.work },
          { header: 'Target', value: (x) => x.l.qty },
          { header: 'Unit', value: (x) => x.l.unit },
          { header: 'Actual', value: (x) => x.l.actualQty },
          { header: 'Achievement %', value: (x) => x.pct },
          { header: 'Light', value: (x) => (x.pct === null ? null : lightOf(x.pct)) },
          { header: 'Skilled planned', value: (x) => x.l.skilled },
          { header: 'Skilled actual', value: (x) => x.l.actualSkilled },
          { header: 'Unskilled planned', value: (x) => x.l.unskilled },
          { header: 'Unskilled actual', value: (x) => x.l.actualUnskilled },
          { header: 'Machine', value: (x) => x.l.machine },
          { header: 'Priority', value: (x) => x.l.priority },
          { header: 'Operator', value: (x) => x.l.operator },
          { header: 'Deviation reason', value: (x) => x.l.reason },
          { header: 'Head remarks', value: (x) => x.l.headRemarks },
        ],
      },
    ]);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'dwpas_export', details: `Exported plans (${rows.length} lines)` }));
    return bytes;
  }

  /** Plan, achievement or manpower sheet for printing (legacy three PDFs). */
  async print(actor: Actor, id: string, kind: 'plan' | 'achievement' | 'manpower') {
    const plan = planView(await this.dwpas.get(id));
    const company = await this.company.block();
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Print', entityType: 'dwpas_plan', entityId: id, details: `Printed ${kind} sheet for ${plan.date}` }));
    return { company, plan, generatedAt: isoNow(this.clock) };
  }
}
