import { isOverdue, type MtArea, type MtStatus, type TimelineEntry, type WorkOrder, type WorkOrderFilters } from '../../contracts/maintenance';
import { fyOf } from '../../contracts/purchase';
import { isoNow, type Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { newId } from '../../lib/crypto';
import { conflict, HttpError, notFound, validationFailed } from '../../lib/errors';
import { UniqueViolationError, type DataLayer, type ListQuery, type Repos } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';

/* eslint-disable @typescript-eslint/no-explicit-any -- inputs are validated by zod at the route */
type Input = Record<string, any>;

const LABEL: Record<string, string> = { title: 'title', category: 'category', area: 'area', priority: 'priority', dueDate: 'due date', description: 'description', notes: 'notes' };

/** Plant areas and work orders with their timeline (legacy Maintenance Work Tracker). */
export class WorkOrderService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  private today = () => businessToday(this.clock);
  private entry = (actor: Actor, type: TimelineEntry['type'], text: string, at: string): TimelineEntry => ({ id: newId(), type, text, by: actor.id, byName: actor.name, at });

  // ── Areas ─────────────────────────────────────────────────────────

  async areas(): Promise<MtArea[]> {
    return (await this.data.repos.mtAreas.listAll()).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Renaming an area renames it on its work orders (they store the name). */
  async saveArea(actor: Actor, id: string | null, input: Input): Promise<MtArea> {
    return this.data.uow.run(async (tx) => {
      const at = isoNow(this.clock);
      const before = id ? await tx.mtAreas.getById(id) : null;
      if (id && !before) throw notFound('Area');
      const fields = { name: input.name ?? before!.name, active: input.active ?? before?.active ?? true };
      const a = await (before ? tx.mtAreas.update(before.id, { ...fields, updatedAt: at }) : tx.mtAreas.create({ id: newId(), ...fields, createdBy: actor.id, createdAt: at, updatedAt: at })).catch((err) => {
        if (err instanceof UniqueViolationError) throw conflict('duplicate', `${fields.name} is already an area`);
        throw err;
      });
      if (before && before.name !== a!.name)
        for (const w of (await tx.mtWorkOrders.listAll()).filter((x) => x.area === before.name)) await tx.mtWorkOrders.update(w.id, { area: a!.name, updatedAt: at });
      await this.activity.record(tx, actor, { action: before ? 'Edit' : 'Create', entityType: 'maintenance_area', entityId: a!.id, details: before && before.name !== a!.name ? `Area ${before.name} renamed to ${a!.name}` : `Area ${a!.name}${a!.active ? '' : ' (inactive)'}` });
      return a!;
    });
  }

  /** Areas with work orders can't be removed (legacy removeArea); deactivate them instead. */
  async removeArea(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const a = await tx.mtAreas.getById(id);
      if (!a) throw notFound('Area');
      if ((await tx.mtWorkOrders.listAll()).some((w) => w.area === a.name)) throw new HttpError(409, 'in_use', `${a.name} has work orders; deactivate it instead`);
      await tx.mtAreas.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'maintenance_area', entityId: id, details: `Removed area ${a.name}` });
    });
  }

  // ── Work orders ───────────────────────────────────────────────────

  list(query: ListQuery<Partial<WorkOrderFilters> & { overdue?: boolean }>) {
    const { overdue, ...filters } = query.filters ?? {};
    return this.data.repos.mtWorkOrders.list({ ...query, filters: { ...filters, ...(overdue ? { overdueAsOf: this.today() } : {}) } });
  }

  async get(id: string): Promise<WorkOrder> {
    const w = await this.data.repos.mtWorkOrders.getById(id);
    if (!w) throw notFound('Work order');
    return w;
  }

  private async checkArea(tx: Repos, name: string, current?: string) {
    if (name === current) return;
    const a = (await tx.mtAreas.listAll()).find((x) => x.name === name);
    if (!a || !a.active) throw validationFailed('Invalid input', [{ path: 'area', message: 'Pick an active plant area' }]);
  }

  /** WO-26-0001 per FY of the raised date (legacy used random WO-XXXXXX ids). */
  async create(actor: Actor, input: Input): Promise<WorkOrder> {
    return this.data.uow.run(async (tx) => {
      await this.checkArea(tx, input.area);
      const at = isoNow(this.clock);
      const today = this.today();
      const fy = fyOf(today);
      const woNo = `WO-${fy.slice(2, 4)}-${String(await tx.counters.next(`MT-WO-${fy}`, at)).padStart(4, '0')}`;
      const status: MtStatus = input.status;
      const timeline = [this.entry(actor, 'created', 'Work order created.', at), this.entry(actor, 'assigned', `Assigned to ${input.assignee}.`, at)];
      if (status !== 'Open') timeline.push(this.entry(actor, 'status', `Status changed to ${status}.`, at));
      const w = await tx.mtWorkOrders.create({
        id: newId(),
        woNo,
        title: input.title,
        category: input.category,
        area: input.area,
        priority: input.priority,
        status,
        assignee: input.assignee,
        description: input.description ?? null,
        notes: input.notes ?? null,
        dueDate: input.dueDate,
        completedOn: status === 'Completed' ? today : null,
        timeline,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'maintenance_work_order', entityId: w.id, details: `${w.woNo} ${w.title} (${w.priority}, ${w.area}) assigned to ${w.assignee}` });
      return w;
    });
  }

  /** Edits log what changed on the timeline: a new assignee and a status change get their own entries. */
  async update(actor: Actor, id: string, patch: Input): Promise<WorkOrder> {
    return this.data.uow.run(async (tx) => {
      const before = await tx.mtWorkOrders.getById(id);
      if (!before) throw notFound('Work order');
      if (patch.area !== undefined) await this.checkArea(tx, patch.area, before.area);
      const at = isoNow(this.clock);
      const next = { ...before, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as WorkOrder;
      const changed = Object.keys(LABEL).filter((k) => (next as any)[k] !== (before as any)[k]);
      const timeline = [...before.timeline];
      if (changed.length) timeline.push(this.entry(actor, 'edited', `Edited ${changed.map((k) => LABEL[k]).join(', ')}.`, at));
      if (next.assignee !== before.assignee) timeline.push(this.entry(actor, 'assigned', `Reassigned from ${before.assignee} to ${next.assignee}.`, at));
      if (next.status !== before.status) timeline.push(this.entry(actor, 'status', `Status changed to ${next.status}.`, at));
      if (timeline.length === before.timeline.length) return before;
      const w = (await tx.mtWorkOrders.update(id, {
        title: next.title,
        category: next.category,
        area: next.area,
        priority: next.priority,
        status: next.status,
        assignee: next.assignee,
        description: next.description ?? null,
        notes: next.notes ?? null,
        dueDate: next.dueDate,
        completedOn: this.completedOn(before, next.status),
        timeline,
        updatedAt: at,
      }))!;
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'maintenance_work_order', entityId: id, details: `${w.woNo}: ${timeline.slice(before.timeline.length).map((e) => e.text).join(' ')}` });
      return w;
    });
  }

  private completedOn(before: WorkOrder, status: MtStatus) {
    if (status !== 'Completed') return null;
    return before.status === 'Completed' ? before.completedOn : this.today();
  }

  /** Quick status change from the detail panel (legacy updateStatus); an optional note goes on the same entry. */
  async setStatus(actor: Actor, id: string, status: MtStatus, note: string | null | undefined): Promise<WorkOrder> {
    return this.data.uow.run(async (tx) => {
      const before = await tx.mtWorkOrders.getById(id);
      if (!before) throw notFound('Work order');
      if (before.status === status) throw conflict('same_status', `${before.woNo} is already ${status}`);
      const at = isoNow(this.clock);
      const text = `Status changed to ${status}${note ? ` — ${note}` : ''}.`;
      const w = (await tx.mtWorkOrders.update(id, { status, completedOn: this.completedOn(before, status), timeline: [...before.timeline, this.entry(actor, 'status', text, at)], updatedAt: at }))!;
      await this.activity.record(tx, actor, { action: 'StatusChange', entityType: 'maintenance_work_order', entityId: id, details: `${w.woNo}: ${before.status} → ${status}${note ? ` (${note})` : ''}` });
      return w;
    });
  }

  /** A note on the timeline (legacy addNote). */
  async addNote(actor: Actor, id: string, text: string): Promise<WorkOrder> {
    return this.data.uow.run(async (tx) => {
      const before = await tx.mtWorkOrders.getById(id);
      if (!before) throw notFound('Work order');
      const at = isoNow(this.clock);
      const w = (await tx.mtWorkOrders.update(id, { timeline: [...before.timeline, this.entry(actor, 'note', text, at)], updatedAt: at }))!;
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'maintenance_work_order', entityId: id, details: `${w.woNo} note: ${text.slice(0, 200)}` });
      return w;
    });
  }

  async remove(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const w = await tx.mtWorkOrders.getById(id);
      if (!w) throw notFound('Work order');
      await tx.mtWorkOrders.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'maintenance_work_order', entityId: id, details: `Deleted ${w.woNo} ${w.title}` });
    });
  }

  /** Overdue count for the sidebar badge. */
  async overdueCount() {
    const today = this.today();
    return (await this.data.repos.mtWorkOrders.listAll()).filter((w) => isOverdue(w, today)).length;
  }
}
