import type {
  Dispatch,
  DispatchFilters,
  DispatchMode,
  DispatchStatus,
  DispatchView,
  LinkableRequest,
  PartyPick,
  RequestStatus,
  TrackingDetail,
} from '../../../contracts/sampletrack';
import { conflict, notFound, validationFailed } from '../../../lib/errors';
import { isoNow, type Clock } from '../../../lib/clock';
import { newId } from '../../../lib/crypto';
import { businessToday } from '../../../lib/dates';
import { writeXlsx, type Column } from '../../../lib/spreadsheet';
import type { DataLayer, DispatchListFilters, DispatchPatch, DispatchRow, ListQuery, Repos } from '../../../repos';
import type { ActivityService } from '../activity-service';
import type { Actor } from '../actor';
import { changedKeys, collectAll, rupees } from '../masters/common';
import type { NotificationService } from '../notification-service';
import { productSummary } from '../requests/request-service';
import { buildTimeline, resolveTracking } from './tracking';
import type { DispatchCreate, DispatchUpdateInput } from './validation';

export const DSP_COUNTER = 'DSP';
export const formatDspNo = (n: number) => `DSP-${String(n).padStart(4, '0')}`;

/**
 * What a linked request becomes when its dispatch enters a status. A request never moves
 * backwards: a Delivered request stays Delivered whatever later happens to the dispatch.
 */
export const REQUEST_SYNC: Partial<Record<DispatchStatus, { to: RequestStatus; from: RequestStatus[] }>> = {
  Dispatched: { to: 'Dispatched', from: ['Pending', 'Approved'] },
  'In Transit': { to: 'Dispatched', from: ['Pending', 'Approved'] },
  Delivered: { to: 'Delivered', from: ['Pending', 'Approved', 'Dispatched'] },
};

const CLOSED: DispatchStatus[] = ['Delivered', 'Returned'];

const EXPORT_COLUMNS: Column<DispatchView>[] = [
  { header: 'Dispatch ID', value: (d) => d.dspNo },
  { header: 'Date', value: (d) => d.date },
  { header: 'Party', value: (d) => d.partyName },
  { header: 'City', value: (d) => d.partyCity },
  { header: 'Courier', value: (d) => d.courierName },
  { header: 'Tracking No', value: (d) => d.trackingNo },
  { header: 'Mode', value: (d) => d.mode },
  { header: 'Vehicle', value: (d) => d.vehicleNo },
  { header: 'Driver', value: (d) => d.driverDetails },
  { header: 'Expected Delivery', value: (d) => d.expectedDeliveryDate },
  { header: 'Weight (KG)', value: (d) => d.weightKg },
  { header: 'Freight (₹)', value: (d) => rupees(d.freightPaise) },
  { header: 'Dimensions', value: (d) => d.dimensions },
  { header: 'Product', value: (d) => d.productDescription },
  { header: 'Linked Request', value: (d) => d.linkedRequestNo },
  { header: 'Status', value: (d) => d.status },
  { header: 'Overdue', value: (d) => (d.overdue ? 'Yes' : '') },
  { header: 'Remarks', value: (d) => d.remarks },
];

const issue = (path: string, message: string) => validationFailed('Invalid input', [{ path, message }]);

export class DispatchService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationService,
    private readonly clock: Clock,
  ) {}

  // ── Reads ──────────────────────────────────────────────────────────

  private view(row: DispatchRow, today = businessToday(this.clock)): DispatchView {
    const { courierTemplate, ...rest } = row;
    return {
      ...rest,
      overdue: isOverdue(row, today),
      tracking: resolveTracking(row.trackingNo, row.courierName, courierTemplate),
    };
  }

  private repoQuery(query: ListQuery<DispatchFilters>): ListQuery<DispatchListFilters> {
    const { overdue, ...filters } = query.filters ?? {};
    return { ...query, filters: { ...filters, ...(overdue ? { overdueBefore: businessToday(this.clock) } : {}) } };
  }

  async list(query: ListQuery<DispatchFilters>) {
    const today = businessToday(this.clock);
    const { rows, total } = await this.data.repos.dispatches.list(this.repoQuery(query));
    return { rows: rows.map((r) => this.view(r, today)), total };
  }

  async get(id: string): Promise<DispatchView> {
    const row = await this.data.repos.dispatches.getRow(id);
    if (!row) throw notFound('Dispatch');
    return this.view(row);
  }

  /** Live tracking detail: the dispatch, its 6-step timeline, off-path events and full history. */
  async tracking(id: string): Promise<TrackingDetail> {
    const dispatch = await this.get(id);
    const history = await this.data.repos.dispatches.history(id);
    return { dispatch, ...buildTimeline(dispatch.status, history), history };
  }

  /** Party picker for the dispatch form (the dispatch role has no Parties page). */
  async partyOptions(q?: string): Promise<PartyPick[]> {
    const { rows } = await this.data.repos.parties.list({ q, pageSize: 20 });
    return rows.map(({ id, name, city }) => ({ id, name, city }));
  }

  /** Requests a dispatch can link to (newest first): Pending, Approved or already Dispatched (a partial shipment). Optionally only one party's. */
  async linkableRequests(partyId?: string): Promise<LinkableRequest[]> {
    const { rows } = await this.data.repos.requests.list({ filters: { partyId }, sort: '-reqNo', pageSize: 100 });
    return rows
      .filter((r) => r.status !== 'Delivered')
      .map((r) => ({ id: r.id, reqNo: r.reqNo, partyId: r.partyId, partyName: r.partyName, status: r.status, productSummary: productSummary(r.items) }));
  }

  async exportXlsx(actor: Actor, query: ListQuery<DispatchFilters>): Promise<Uint8Array> {
    const today = businessToday(this.clock);
    const rows = (await collectAll((q) => this.data.repos.dispatches.list(q), this.repoQuery(query))).map((r) => this.view(r, today));
    const bytes = writeXlsx([{ name: 'DispatchRegister', columns: EXPORT_COLUMNS, rows }]);
    await this.data.uow.run((tx) =>
      this.activity.record(tx, actor, { action: 'Export', entityType: 'dispatch', details: `Exported ${rows.length} dispatches` }),
    );
    return bytes;
  }

  // ── Writes ─────────────────────────────────────────────────────────

  async create(actor: Actor, input: DispatchCreate): Promise<DispatchView> {
    const date = input.date ?? businessToday(this.clock);
    assertDates(date, input.expectedDeliveryDate ?? null);

    const id = await this.data.uow.run(async (tx) => {
      const party = await tx.parties.getById(input.partyId);
      if (!party) throw issue('partyId', 'Select an existing party');
      await this.checkCarrier(tx, input.mode, input.courierId ?? null, input.courierNameManual ?? null, true);
      await this.checkLinkedRequest(tx, input.linkedRequestId ?? null, party.id);

      const at = isoNow(this.clock);
      const dspNo = formatDspNo(await tx.counters.next(DSP_COUNTER, at));
      const d = await tx.dispatches.create({
        id: newId(),
        dspNo,
        date,
        partyId: party.id,
        mode: input.mode,
        courierId: input.courierId ?? null,
        courierNameManual: input.courierNameManual ?? null,
        trackingNo: input.trackingNo ?? null,
        vehicleNo: input.vehicleNo ?? null,
        driverDetails: input.driverDetails ?? null,
        expectedDeliveryDate: input.expectedDeliveryDate ?? null,
        freightPaise: input.freightPaise,
        weightKg: input.weightKg,
        dimensions: input.dimensions ?? null,
        productDescription: input.productDescription ?? null,
        linkedRequestId: input.linkedRequestId ?? null,
        remarks: input.remarks ?? null,
        status: input.status,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await tx.dispatches.appendHistory(this.historyRow(d.id, d.status, actor, at, 'Created'));
      await this.notifications.notify(tx, actor, {
        type: 'info',
        title: 'Dispatch Created',
        message: `${dspNo} for ${party.name}`,
        entityType: 'dispatch',
        entityId: d.id,
      });
      await this.activity.record(tx, actor, {
        action: 'Create',
        entityType: 'dispatch',
        entityId: d.id,
        details: `Dispatch ${dspNo} for ${party.name} (${d.mode}, ${d.status})`,
      });
      await this.afterStatusEntered(tx, actor, d, party.name, at);
      return d.id;
    });
    return this.get(id);
  }

  /** Edits fields. A different `status` is applied exactly like a quick status update, in the same transaction. */
  async update(actor: Actor, id: string, input: DispatchUpdateInput): Promise<DispatchView> {
    await this.data.uow.run(async (tx) => {
      const before = await tx.dispatches.getById(id);
      if (!before) throw notFound('Dispatch');
      const { status, statusNote, ...fields } = input;
      const changed = changedKeys(before, fields as Partial<Dispatch>);
      const next = { ...before, ...fields } as Dispatch;

      if (changed.includes('partyId') && !(await tx.parties.getById(next.partyId))) throw issue('partyId', 'Select an existing party');
      if (changed.some((k) => k === 'mode' || k === 'courierId' || k === 'courierNameManual')) {
        await this.checkCarrier(tx, next.mode, next.courierId, next.courierNameManual, changed.includes('courierId'));
      }
      if (changed.some((k) => k === 'linkedRequestId' || k === 'partyId')) {
        await this.checkLinkedRequest(tx, next.linkedRequestId, next.partyId);
      }
      assertDates(next.date, next.expectedDeliveryDate);

      const at = isoNow(this.clock);
      if (changed.length) {
        const patch = Object.fromEntries(changed.map((k) => [k, (fields as Record<string, unknown>)[k]]));
        await tx.dispatches.update(id, { ...patch, updatedAt: at } as DispatchPatch);
        const row = (await tx.dispatches.getRow(id))!;
        await this.activity.record(tx, actor, {
          action: 'Edit',
          entityType: 'dispatch',
          entityId: id,
          details: `Dispatch ${row.dspNo} for ${row.partyName}: ${changed.join(', ')}`,
        });
        // A newly linked request catches up with the dispatch's current status.
        if (changed.includes('linkedRequestId')) await this.syncRequest(tx, actor, (await tx.dispatches.getById(id))!, at);
      }
      if (status !== undefined && status !== before.status) {
        await this.applyStatus(tx, actor, id, status, statusNote ?? null);
      }
    });
    return this.get(id);
  }

  /** Quick status update (tracking page / list). Same status = no change and no history row. */
  async changeStatus(actor: Actor, id: string, status: DispatchStatus, note: string | null): Promise<DispatchView> {
    await this.data.uow.run(async (tx) => {
      if (!(await tx.dispatches.getById(id))) throw notFound('Dispatch');
      await this.applyStatus(tx, actor, id, status, note);
    });
    return this.get(id);
  }

  /** Soft delete. The linked request keeps its status (it never moves backwards), and history is kept. */
  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const row = await tx.dispatches.getRow(id);
      if (!row) throw notFound('Dispatch');
      await tx.dispatches.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, {
        action: 'Delete',
        entityType: 'dispatch',
        entityId: id,
        details: `Deleted dispatch ${row.dspNo} for ${row.partyName} (${row.status})`,
      });
    });
  }

  // ── Status machinery (always inside a unit of work) ────────────────

  /**
   * The single path for every status change: a guarded update, a history row (user and time),
   * notifications, the request sync and the activity log, all in the caller's transaction.
   */
  private async applyStatus(tx: Repos, actor: Actor, id: string, to: DispatchStatus, note: string | null) {
    const before = (await tx.dispatches.getRow(id))!;
    if (before.status === to) return;
    const at = isoNow(this.clock);
    if (!(await tx.dispatches.setStatus(id, before.status, to, at))) {
      throw conflict('stale_status', `${before.dspNo} changed while you were editing; reload and try again`);
    }
    await tx.dispatches.appendHistory(this.historyRow(id, to, actor, at, note));
    await this.activity.record(tx, actor, {
      action: 'StatusChange',
      entityType: 'dispatch',
      entityId: id,
      details: `Dispatch ${before.dspNo}: ${before.status} → ${to}${note ? ` (${note})` : ''}`,
    });
    await this.afterStatusEntered(tx, actor, (await tx.dispatches.getById(id))!, before.partyName, at);
  }

  /** Notifications for Delayed/Delivered, then the request sync. Also runs for the initial status on create. */
  private async afterStatusEntered(tx: Repos, actor: Actor, d: Dispatch, partyName: string, at: string) {
    if (d.status === 'Delayed') {
      await this.notifications.notify(tx, actor, {
        type: 'warning',
        title: 'Delay Alert',
        message: `${d.dspNo} to ${partyName} is delayed`,
        entityType: 'dispatch',
        entityId: d.id,
      });
    }
    if (d.status === 'Delivered') {
      await this.notifications.notify(tx, actor, {
        type: 'success',
        title: 'Delivered',
        message: `${d.dspNo} delivered to ${partyName}`,
        entityType: 'dispatch',
        entityId: d.id,
      });
    }
    await this.syncRequest(tx, actor, d, at);
  }

  /** Dispatched / In Transit → request Dispatched; Delivered → request Delivered. Forward only. */
  private async syncRequest(tx: Repos, actor: Actor, d: Dispatch, at: string) {
    const rule = REQUEST_SYNC[d.status];
    if (!d.linkedRequestId || !rule) return;
    const req = await tx.requests.getById(d.linkedRequestId);
    if (!req) return;
    if (await tx.requests.setStatus(req.id, rule.from, rule.to, at)) {
      await this.activity.record(tx, actor, {
        action: 'StatusChange',
        entityType: 'request',
        entityId: req.id,
        details: `Sample request ${req.reqNo}: ${req.status} → ${rule.to} (dispatch ${d.dspNo} is ${d.status})`,
      });
    }
  }

  private historyRow(dispatchId: string, status: DispatchStatus, actor: Actor, at: string, note: string | null) {
    return { id: newId(), dispatchId, status, changedBy: actor.id, changedAt: at, note, createdBy: actor.id, createdAt: at, updatedAt: at };
  }

  // ── Validation helpers ─────────────────────────────────────────────

  /**
   * Carrier: a master courier (by id) or a manual name, not both. Courier/Transport/Bus need one of
   * them, and Hand Delivery may have neither. A master courier must match the mode (any type is fine
   * for Hand Delivery), and must be Active when newly chosen.
   */
  private async checkCarrier(tx: Repos, mode: DispatchMode, courierId: string | null, manual: string | null, newlyChosen: boolean) {
    if (courierId && manual) throw issue('courierNameManual', 'Pick a courier from the list or type a name, not both');
    if (!courierId) {
      if (!manual && mode !== 'Hand Delivery') throw issue('courierId', `Select a ${mode.toLowerCase()} or enter its name`);
      return;
    }
    const c = await tx.couriers.getById(courierId);
    if (!c) throw issue('courierId', 'Courier not found');
    if (newlyChosen && c.status !== 'Active') throw issue('courierId', `${c.name} is inactive`);
    if (mode !== 'Hand Delivery' && c.type !== mode) throw issue('courierId', `${c.name} is a ${c.type}, not a ${mode}`);
  }

  /** A linked request must exist and be for the same party. */
  private async checkLinkedRequest(tx: Repos, requestId: string | null, partyId: string) {
    if (!requestId) return;
    const r = await tx.requests.getById(requestId);
    if (!r) throw issue('linkedRequestId', 'Linked request not found');
    if (r.partyId !== partyId) throw issue('linkedRequestId', `${r.reqNo} is for a different party`);
  }
}

export function isOverdue(d: Pick<Dispatch, 'expectedDeliveryDate' | 'status'>, today: string): boolean {
  return d.expectedDeliveryDate !== null && d.expectedDeliveryDate < today && !CLOSED.includes(d.status);
}

function assertDates(date: string, expected: string | null) {
  if (expected && expected < date) throw issue('expectedDeliveryDate', 'Expected delivery cannot be before the dispatch date');
}
