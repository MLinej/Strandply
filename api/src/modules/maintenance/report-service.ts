import { isOverdue, MT_PRIORITIES, type MaintenanceDashboard, type MaintenanceMeta, type MaintenanceReportRow, type MaintenanceReports, type Named, type WorkOrder } from '../../contracts/maintenance';
import { isoNow, type Clock } from '../../lib/clock';
import { businessToday, businessDateOf } from '../../lib/dates';
import { writeXlsx } from '../../lib/spreadsheet';
import type { DataLayer } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import type { CompanyService } from '../sampletrack/settings/company-service';
import type { WorkOrderService } from './work-order-service';

export interface Range {
  from?: string;
  to?: string;
}
const raisedOn = (w: WorkOrder) => businessDateOf(w.createdAt);
const inRange = (d: string, r: Range) => (!r.from || d >= r.from) && (!r.to || d <= r.to);
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
const count = (rows: WorkOrder[], key: (w: WorkOrder) => string): Named[] => {
  const m = new Map<string, number>();
  for (const w of rows) m.set(key(w), (m.get(key(w)) ?? 0) + 1);
  return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
};

/** Meta, dashboard, reports, Excel export and the work-order print. */
export class MaintenanceReportService {
  constructor(
    private readonly data: DataLayer,
    private readonly workOrders: WorkOrderService,
    private readonly company: CompanyService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  private today = () => businessToday(this.clock);

  async meta(): Promise<MaintenanceMeta> {
    const [areas, wos] = await Promise.all([this.workOrders.areas(), this.data.repos.mtWorkOrders.listAll()]);
    return { areas: areas.filter((a) => a.active).map((a) => a.name), assignees: [...new Set(wos.map((w) => w.assignee))].sort((a, b) => a.localeCompare(b)), today: this.today() };
  }

  async dashboard(): Promise<MaintenanceDashboard> {
    const all = await this.data.repos.mtWorkOrders.listAll();
    const today = this.today();
    const open = all.filter((w) => w.status !== 'Completed');
    const overdue = open.filter((w) => isOverdue(w, today)).sort((a, b) => MT_PRIORITIES.indexOf(a.priority) - MT_PRIORITIES.indexOf(b.priority) || a.dueDate.localeCompare(b.dueDate));
    return {
      total: all.length,
      open: all.filter((w) => w.status === 'Open').length,
      inProgress: all.filter((w) => w.status === 'In Progress').length,
      onHold: all.filter((w) => w.status === 'On Hold').length,
      completed: all.filter((w) => w.status === 'Completed').length,
      critical: open.filter((w) => w.priority === 'Critical').length,
      overdue: overdue.length,
      byArea: count(open, (w) => w.area),
      byCategory: count(open, (w) => w.category),
      byPriority: MT_PRIORITIES.map((p) => ({ name: p, value: open.filter((w) => w.priority === p).length })),
      overdueList: overdue.slice(0, 10),
      recent: all
        .flatMap((w) => w.timeline.map((e) => ({ ...e, workOrderId: w.id, woNo: w.woNo, title: w.title })))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 12),
    };
  }

  /** Work orders raised in the range: completion, time to complete, and the split by area, category, technician, priority. */
  async reports(range: Range): Promise<MaintenanceReports> {
    const all = await this.data.repos.mtWorkOrders.listAll();
    const today = this.today();
    const rows = all.filter((w) => inRange(raisedOn(w), range));
    const done = rows.filter((w) => w.status === 'Completed' && w.completedOn);
    const row = (name: string, ws: WorkOrder[]): MaintenanceReportRow => {
      const c = ws.filter((w) => w.status === 'Completed' && w.completedOn);
      return { name, raised: ws.length, completed: c.length, open: ws.length - c.length, overdue: ws.filter((w) => isOverdue(w, today)).length, avgDays: avg(c.map((w) => days(raisedOn(w), w.completedOn!))) };
    };
    const split = (key: (w: WorkOrder) => string) => {
      const m = new Map<string, WorkOrder[]>();
      for (const w of rows) m.set(key(w), [...(m.get(key(w)) ?? []), w]);
      return [...m].map(([name, ws]) => row(name, ws)).sort((a, b) => b.raised - a.raised || a.name.localeCompare(b.name));
    };
    const months = new Set([...rows.map((w) => raisedOn(w).slice(0, 7)), ...done.map((w) => w.completedOn!.slice(0, 7))]);
    return {
      raised: rows.length,
      completed: done.length,
      onTimeShare: done.length ? Math.round((done.filter((w) => w.completedOn! <= w.dueDate).length / done.length) * 100) : null,
      avgDays: avg(done.map((w) => days(raisedOn(w), w.completedOn!))),
      openNow: all.filter((w) => w.status !== 'Completed').length,
      overdueNow: all.filter((w) => isOverdue(w, today)).length,
      byMonth: [...months].sort().map((name) => ({ name, raised: rows.filter((w) => raisedOn(w).startsWith(name)).length, completed: done.filter((w) => w.completedOn!.startsWith(name)).length })),
      byArea: split((w) => w.area),
      byCategory: split((w) => w.category),
      byAssignee: split((w) => w.assignee),
      byPriority: MT_PRIORITIES.map((p) => row(p, rows.filter((w) => w.priority === p))),
    };
  }

  async exportXlsx(actor: Actor, range: Range): Promise<Uint8Array> {
    const today = this.today();
    const rows = (await this.data.repos.mtWorkOrders.listAll()).filter((w) => inRange(raisedOn(w), range)).sort((a, b) => a.woNo.localeCompare(b.woNo));
    const bytes = writeXlsx([
      {
        name: 'Work orders',
        rows,
        columns: [
          { header: 'WO #', value: (w) => w.woNo },
          { header: 'Raised', value: (w) => raisedOn(w) },
          { header: 'Title', value: (w) => w.title },
          { header: 'Category', value: (w) => w.category },
          { header: 'Area', value: (w) => w.area },
          { header: 'Priority', value: (w) => w.priority },
          { header: 'Status', value: (w) => w.status },
          { header: 'Assigned to', value: (w) => w.assignee },
          { header: 'Due', value: (w) => w.dueDate },
          { header: 'Overdue', value: (w) => (isOverdue(w, today) ? 'Yes' : '') },
          { header: 'Completed on', value: (w) => w.completedOn },
          { header: 'Description', value: (w) => w.description },
          { header: 'Notes', value: (w) => w.notes },
        ],
      },
    ]);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'maintenance_export', details: `Exported work orders (${rows.length} rows)` }));
    return bytes;
  }

  async print(actor: Actor, id: string) {
    const workOrder = await this.workOrders.get(id);
    const company = await this.company.block();
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Print', entityType: 'maintenance_work_order', entityId: id, details: `Printed ${workOrder.woNo}` }));
    return { company, workOrder, generatedAt: isoNow(this.clock) };
  }
}
