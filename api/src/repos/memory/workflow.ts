import {
  DISPATCH_STATUSES,
  REQUEST_STATUSES,
  type Dispatch,
  type DispatchHistoryEntry,
  type DispatchHistoryView,
  type DispatchStatus,
  type Notification,
  type NotificationFeedFilters,
  type NotificationRead,
  type NotificationView,
  type RequestFilters,
  type RequestStatus,
  type RequestView,
  type SampleRequest,
  type SampleRequestItem,
} from '../../contracts/sampletrack';
import type { NewRow } from '../masters';
import { UniqueViolationError, type ListQuery } from '../types';
import type {
  CounterRepo,
  DispatchListFilters,
  DispatchPatch,
  DispatchRepo,
  DispatchRow,
  NotificationFilters,
  NotificationRepo,
  RequestCountQuery,
  RequestPatch,
  RequestRepo,
} from '../workflow';
import { SoftTable } from './crud';
import { listRows } from './list';
import { readKey, type MemoryStore } from './store';

export class MemoryCounterRepo implements CounterRepo {
  constructor(private readonly store: MemoryStore) {}

  async next(name: string, at: string) {
    const rows = this.store.tables.counters;
    const current = rows.get(name);
    const lastValue = (current?.lastValue ?? 0) + 1;
    rows.set(name, current ? { ...current, lastValue, updatedAt: at } : { name, lastValue, createdBy: null, createdAt: at, updatedAt: at, deletedAt: null });
    this.store.changed();
    return lastValue;
  }

  async current(name: string) {
    return this.store.tables.counters.get(name)?.lastValue ?? 0;
  }
}

/** Joined row used for search and sort. Stripped back to RequestView before returning. */
type Joined = RequestView & { _search: string };

export class MemoryRequestRepo implements RequestRepo {
  constructor(private readonly store: MemoryStore) {}

  private get t() {
    return this.store.tables;
  }

  private liveItems(requestId: string): SampleRequestItem[] {
    return [...this.t.requestItems.values()]
      .filter((i) => i.requestId === requestId && i.deletedAt === null)
      .sort((a, b) => a.lineNo - b.lineNo);
  }

  private join(r: SampleRequest): Joined {
    const items = this.liveItems(r.id);
    const partyName = this.t.parties.get(r.partyId)?.name ?? '';
    const requestedByName = r.requestedByUserId ? (this.t.users.get(r.requestedByUserId)?.name ?? null) : null;
    return {
      ...r,
      partyName,
      requestedByName,
      approvedByName: r.approvedBy ? (this.t.users.get(r.approvedBy)?.name ?? null) : null,
      items,
      _search: [r.reqNo, partyName, requestedByName ?? '', ...items.map((i) => i.productName)].join('\u0001').toLowerCase(),
    };
  }

  private strip({ _search: _, ...view }: Joined): RequestView {
    return structuredClone(view);
  }

  private live(): SampleRequest[] {
    return [...this.t.requests.values()].filter((r) => r.deletedAt === null);
  }

  /** Applies q and every filter except status (that one is the tab). */
  private matching({ q, filters = {} }: RequestCountQuery): Joined[] {
    const needle = q?.trim().toLowerCase();
    return this.live()
      .map((r) => this.join(r))
      .filter(
        (r) =>
          (!needle || r._search.includes(needle)) &&
          (!filters.partyId || r.partyId === filters.partyId) &&
          (!filters.requestedByUserId || r.requestedByUserId === filters.requestedByUserId) &&
          (!filters.dateFrom || r.date >= filters.dateFrom) &&
          (!filters.dateTo || r.date <= filters.dateTo),
      );
  }

  async getById(id: string) {
    const r = this.t.requests.get(id);
    return r && r.deletedAt === null ? structuredClone(r) : null;
  }

  async getView(id: string) {
    const r = this.t.requests.get(id);
    return r && r.deletedAt === null ? this.strip(this.join(r)) : null;
  }

  async list(query: ListQuery<RequestFilters>) {
    const { status, ...rest } = query.filters ?? {};
    const rows = this.matching({ q: query.q, filters: rest });
    const result = listRows<Joined, Pick<RequestFilters, 'status'>>(
      rows,
      { ...query, q: undefined, filters: { status } },
      {
        searchFields: [],
        sortable: ['createdAt', 'date', 'reqNo', 'status', 'requiredDispatchDate', 'partyName'],
        defaultSort: '-createdAt',
      },
    );
    return { total: result.total, rows: result.rows.map((r) => this.strip(r)) };
  }

  async countByStatus(query: RequestCountQuery) {
    const counts = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, 0])) as Record<RequestStatus, number>;
    for (const r of this.matching(query)) counts[r.status]++;
    return counts;
  }

  async create(request: NewRow<SampleRequest>, items: NewRow<SampleRequestItem>[]) {
    if ([...this.t.requests.values()].some((r) => r.reqNo === request.reqNo)) throw new UniqueViolationError('requests', 'reqNo');
    if (this.t.requests.has(request.id)) throw new UniqueViolationError('requests', 'id');
    const row: SampleRequest = { ...structuredClone(request), deletedAt: null };
    this.t.requests.set(row.id, row);
    for (const i of items) this.t.requestItems.set(i.id, { ...structuredClone(i), deletedAt: null });
    this.store.changed();
    return this.strip(this.join(row));
  }

  async update(id: string, patch: RequestPatch) {
    const current = this.t.requests.get(id);
    if (!current || current.deletedAt !== null) return null;
    const next = { ...current };
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (next as Record<string, unknown>)[k] = v;
    this.t.requests.set(id, next);
    this.store.changed();
    return structuredClone(next);
  }

  async replaceItems(requestId: string, items: NewRow<SampleRequestItem>[], at: string) {
    for (const i of this.liveItems(requestId)) this.t.requestItems.set(i.id, { ...i, deletedAt: at, updatedAt: at });
    for (const i of items) this.t.requestItems.set(i.id, { ...structuredClone(i), deletedAt: null });
    this.store.changed();
  }

  async setStatus(id: string, from: RequestStatus[], to: RequestStatus, at: string) {
    const current = this.t.requests.get(id);
    if (!current || current.deletedAt !== null || !from.includes(current.status)) return false;
    this.t.requests.set(id, { ...current, status: to, updatedAt: at });
    this.store.changed();
    return true;
  }

  async approve(id: string, by: string, at: string) {
    const current = this.t.requests.get(id);
    if (!current || current.deletedAt !== null || current.status !== 'Pending') return false;
    this.t.requests.set(id, { ...current, status: 'Approved', approvedBy: by, approvedAt: at, updatedAt: at });
    this.store.changed();
    return true;
  }

  async softDelete(id: string, at: string) {
    const current = this.t.requests.get(id);
    if (!current || current.deletedAt !== null) return false;
    this.t.requests.set(id, { ...current, deletedAt: at, updatedAt: at });
    for (const i of this.liveItems(id)) this.t.requestItems.set(i.id, { ...i, deletedAt: at, updatedAt: at });
    this.store.changed();
    return true;
  }
}

export class MemoryNotificationRepo extends SoftTable<Notification> implements NotificationRepo {
  constructor(store: MemoryStore) {
    super(store, 'notifications', 'notifications');
  }

  private get reads() {
    return this.store.tables.notificationReads;
  }

  private visibleTo(userId: string) {
    return this.live()
      .filter((n) => n.targetUserId === null || n.targetUserId === userId)
      .map((n) => ({ n, r: this.reads.get(readKey(n.id, userId)) }))
      .filter(({ r }) => !r?.dismissedAt);
  }

  private upsertRead(notificationId: string, userId: string, at: string, patch: Partial<NotificationRead>) {
    const key = readKey(notificationId, userId);
    const current = this.reads.get(key);
    this.reads.set(key, {
      notificationId,
      userId,
      readAt: null,
      dismissedAt: null,
      createdBy: userId,
      createdAt: at,
      deletedAt: null,
      ...current,
      ...patch,
      updatedAt: at,
    });
  }

  async list(query: ListQuery<NotificationFilters>) {
    return listRows(this.live(), query, {
      searchFields: ['title', 'message'],
      sortable: ['createdAt'],
      defaultSort: '-createdAt',
    });
  }

  async listForUser(userId: string, query: ListQuery<NotificationFeedFilters>) {
    const { unread, type } = query.filters ?? {};
    const rows: NotificationView[] = this.visibleTo(userId)
      .map(({ n, r }) => ({ ...n, read: !!r?.readAt, readAt: r?.readAt ?? null }))
      .filter((v) => (!unread || !v.read) && (!type || v.type === type));
    return listRows(rows, { ...query, filters: {} }, { searchFields: ['title', 'message'], sortable: ['createdAt'], defaultSort: '-createdAt' });
  }

  async unreadCount(userId: string) {
    return this.visibleTo(userId).filter(({ r }) => !r?.readAt).length;
  }

  async markRead(userId: string, ids: string[], at: string) {
    const want = new Set(ids);
    let n = 0;
    for (const { n: note, r } of this.visibleTo(userId)) {
      if (!want.has(note.id) || r?.readAt) continue;
      this.upsertRead(note.id, userId, at, { readAt: at });
      n++;
    }
    if (n) this.store.changed();
    return n;
  }

  async markAllRead(userId: string, at: string, upTo?: string) {
    let n = 0;
    for (const { n: note, r } of this.visibleTo(userId)) {
      if (r?.readAt || (upTo && note.createdAt > upTo)) continue;
      this.upsertRead(note.id, userId, at, { readAt: at });
      n++;
    }
    if (n) this.store.changed();
    return n;
  }

  async dismiss(userId: string, at: string, { ids, upTo }: { ids?: string[]; upTo?: string }) {
    const want = ids ? new Set(ids) : null;
    let n = 0;
    for (const { n: note, r } of this.visibleTo(userId)) {
      if (want ? !want.has(note.id) : upTo !== undefined && note.createdAt > upTo) continue;
      this.upsertRead(note.id, userId, at, { dismissedAt: at, readAt: r?.readAt ?? at });
      n++;
    }
    if (n) this.store.changed();
    return n;
  }
}

type JoinedDispatch = DispatchRow & { _search: string };

export class MemoryDispatchRepo implements DispatchRepo {
  constructor(private readonly store: MemoryStore) {}

  private get t() {
    return this.store.tables;
  }

  private join(d: Dispatch): JoinedDispatch {
    const party = this.t.parties.get(d.partyId);
    const courier = d.courierId ? this.t.couriers.get(d.courierId) : undefined;
    const partyName = party?.name ?? '';
    return {
      ...d,
      partyName,
      partyCity: party?.city ?? null,
      partyState: party?.state ?? null,
      courierName: courier?.name ?? d.courierNameManual ?? null,
      courierTemplate: courier?.trackingUrlTemplate ?? null,
      linkedRequestNo: d.linkedRequestId ? (this.t.requests.get(d.linkedRequestId)?.reqNo ?? null) : null,
      _search: [d.dspNo, d.trackingNo ?? '', partyName].join('\u0001').toLowerCase(),
    };
  }

  private strip({ _search: _, ...row }: JoinedDispatch): DispatchRow {
    return structuredClone(row);
  }

  async getById(id: string) {
    const d = this.t.dispatches.get(id);
    return d && d.deletedAt === null ? structuredClone(d) : null;
  }

  async getRow(id: string) {
    const d = this.t.dispatches.get(id);
    return d && d.deletedAt === null ? this.strip(this.join(d)) : null;
  }

  /** Every live dispatch matching q and the filters (status included only when asked). Not paginated. */
  private matching(query: Pick<ListQuery<DispatchListFilters>, 'q' | 'filters'>): JoinedDispatch[] {
    const { overdueBefore, dateFrom, dateTo, ...exact } = query.filters ?? {};
    const needle = query.q?.trim().toLowerCase();
    return [...this.t.dispatches.values()]
      .filter((d) => d.deletedAt === null)
      .map((d) => this.join(d))
      .filter(
        (d) =>
          (!needle || d._search.includes(needle)) &&
          (!dateFrom || d.date >= dateFrom) &&
          (!dateTo || d.date <= dateTo) &&
          (!overdueBefore ||
            (d.expectedDeliveryDate !== null && d.expectedDeliveryDate < overdueBefore && d.status !== 'Delivered' && d.status !== 'Returned')) &&
          Object.entries(exact).every(([k, v]) => v === undefined || v === null || v === '' || (d as Record<string, unknown>)[k] === v),
      );
  }

  async list(query: ListQuery<DispatchListFilters>) {
    const result = listRows<JoinedDispatch, Record<string, never>>(
      this.matching(query),
      { sort: query.sort, page: query.page, pageSize: query.pageSize },
      {
        searchFields: [],
        sortable: ['createdAt', 'date', 'dspNo', 'expectedDeliveryDate', 'status', 'partyName'],
        defaultSort: '-createdAt',
      },
    );
    return { total: result.total, rows: result.rows.map((r) => this.strip(r)) };
  }

  async create(row: NewRow<Dispatch>) {
    if ([...this.t.dispatches.values()].some((d) => d.dspNo === row.dspNo)) throw new UniqueViolationError('dispatches', 'dspNo');
    if (this.t.dispatches.has(row.id)) throw new UniqueViolationError('dispatches', 'id');
    const full: Dispatch = { ...structuredClone(row), deletedAt: null };
    this.t.dispatches.set(full.id, full);
    this.store.changed();
    return structuredClone(full);
  }

  async update(id: string, patch: DispatchPatch) {
    const current = this.t.dispatches.get(id);
    if (!current || current.deletedAt !== null) return null;
    const next = { ...current };
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (next as Record<string, unknown>)[k] = v;
    this.t.dispatches.set(id, next);
    this.store.changed();
    return structuredClone(next);
  }

  async setStatus(id: string, from: DispatchStatus, to: DispatchStatus, at: string) {
    const current = this.t.dispatches.get(id);
    if (!current || current.deletedAt !== null || current.status !== from) return false;
    this.t.dispatches.set(id, { ...current, status: to, updatedAt: at });
    this.store.changed();
    return true;
  }

  async softDelete(id: string, at: string) {
    const current = this.t.dispatches.get(id);
    if (!current || current.deletedAt !== null) return false;
    this.t.dispatches.set(id, { ...current, deletedAt: at, updatedAt: at });
    this.store.changed();
    return true;
  }

  async appendHistory(entry: NewRow<DispatchHistoryEntry>) {
    const full: DispatchHistoryEntry = { ...structuredClone(entry), deletedAt: null };
    this.t.dispatchHistory.set(full.id, full);
    this.store.changed();
    return structuredClone(full);
  }

  async countByStatus(query: Pick<ListQuery<DispatchListFilters>, 'q' | 'filters'>) {
    const { status: _ignored, ...filters } = query.filters ?? {};
    const rows = this.matching({ q: query.q, filters });
    const counts = Object.fromEntries(DISPATCH_STATUSES.map((s) => [s, 0])) as Record<DispatchStatus, number>;
    for (const r of rows) counts[r.status]++;
    return counts;
  }

  async latestStatusAt(status: DispatchStatus, dispatchIds: string[]) {
    const want = new Set(dispatchIds);
    const out: Record<string, string> = {};
    for (const h of this.t.dispatchHistory.values()) {
      if (h.deletedAt !== null || h.status !== status || !want.has(h.dispatchId)) continue;
      if (!out[h.dispatchId] || h.changedAt > out[h.dispatchId]!) out[h.dispatchId] = h.changedAt;
    }
    return out;
  }

  async history(dispatchId: string): Promise<DispatchHistoryView[]> {
    return [...this.t.dispatchHistory.values()]
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => h.dispatchId === dispatchId && h.deletedAt === null)
      .sort((a, b) => a.h.changedAt.localeCompare(b.h.changedAt) || a.i - b.i)
      .map(({ h }) => ({ ...structuredClone(h), changedByName: h.changedBy ? (this.t.users.get(h.changedBy)?.name ?? null) : null }));
  }
}
