// Repo interfaces for the SampleTrack workflow: counters, requests, notifications, dispatches.
import type {
  Dispatch,
  DispatchFilters,
  DispatchHistoryEntry,
  DispatchHistoryView,
  DispatchStatus,
  DispatchView,
  Notification,
  NotificationFeedFilters,
  NotificationType,
  NotificationView,
  RequestFilters,
  RequestStatus,
  RequestView,
  SampleRequest,
  SampleRequestItem,
} from '../contracts/sampletrack';
import type { NewRow, Patch } from './masters';
import type { ListQuery, ListResult } from './types';

// ── Counters (st_counters) ───────────────────────────────────────────

export interface CounterRepo {
  /**
   * Adds 1 to the counter and returns the new value. A missing counter starts at 0.
   * Must run inside the same unit of work as the insert that uses the number, so a failed
   * insert never uses up a number.
   * TODO(d1): UPDATE … RETURNING inside the batch. See docs/DB-CONNECT-LATER.md.
   */
  next(name: string, at: string): Promise<number>;
  /** The last value handed out (0 if none). */
  current(name: string): Promise<number>;
}

// ── Requests (st_requests + st_request_items) ────────────────────────

export type RequestPatch = Patch<
  SampleRequest,
  'date' | 'partyId' | 'purpose' | 'priority' | 'requiredDispatchDate' | 'requestedByUserId' | 'remarks'
>;

export type RequestCountQuery = Pick<ListQuery<RequestFilters>, 'q' | 'filters'>;

export interface RequestRepo {
  getById(id: string): Promise<SampleRequest | null>;
  /** The request with party name, requester name and live lines (in lineNo order). */
  getView(id: string): Promise<RequestView | null>;
  /**
   * q searches the request no., party name, product names on live lines and the requester's name.
   * Filters: status, partyId, requestedByUserId, dateFrom/dateTo (inclusive).
   * Sort: -createdAt (default), date, reqNo (numeric), status, requiredDispatchDate.
   */
  list(query: ListQuery<RequestFilters>): Promise<ListResult<RequestView>>;
  /** Live requests per status for the same q/filters. filters.status is ignored, since it is the tab being counted. */
  countByStatus(query: RequestCountQuery): Promise<Record<RequestStatus, number>>;
  /** Inserts the request and its lines. @throws UniqueViolationError('requests', 'reqNo') */
  create(request: NewRow<SampleRequest>, items: NewRow<SampleRequestItem>[]): Promise<RequestView>;
  /** Field edits only. Status changes go through setStatus. */
  update(id: string, patch: RequestPatch): Promise<SampleRequest | null>;
  /** Soft-deletes the current lines and inserts `items` in their place. */
  replaceItems(requestId: string, items: NewRow<SampleRequestItem>[], at: string): Promise<void>;
  /**
   * Guarded transition: sets `to` only when the current status is in `from`.
   * Returns false when the request is missing, deleted or in another status, so two
   * concurrent approvals can't both succeed.
   */
  setStatus(id: string, from: RequestStatus[], to: RequestStatus, at: string): Promise<boolean>;
  /** Guarded Pending → Approved that also records who approved it and when. Returns false if it isn't Pending. */
  approve(id: string, by: string, at: string): Promise<boolean>;
  /** Soft-deletes the request and its lines. */
  softDelete(id: string, at: string): Promise<boolean>;
}

// ── Notifications (st_notifications) ─────────────────────────────────

export interface NotificationFilters {
  type: NotificationType;
  entityType: 'request' | 'dispatch';
  entityId: string;
}

/**
 * A notification is visible to a user when it is live, is broadcast (targetUserId null) or
 * addressed to them, and they haven't cleared it. Read and cleared state is per user, in st_notification_reads.
 */
export interface NotificationRepo {
  create(n: NewRow<Notification>): Promise<Notification>;
  /** All notifications, newest first (admin/test view; ignores per-user state). */
  list(query: ListQuery<NotificationFilters>): Promise<ListResult<Notification>>;
  /** Visible to `userId`, newest first, each with its read state. */
  listForUser(userId: string, query: ListQuery<NotificationFeedFilters>): Promise<ListResult<NotificationView>>;
  unreadCount(userId: string): Promise<number>;
  /** Marks visible, unread notifications among `ids` as read. Returns how many changed. */
  markRead(userId: string, ids: string[], at: string): Promise<number>;
  /** Marks every visible unread notification created at or before `upTo` (default: all) as read. */
  markAllRead(userId: string, at: string, upTo?: string): Promise<number>;
  /** Hides notifications for this user only: `ids`, or every visible one created at or before `upTo`. */
  dismiss(userId: string, at: string, opts: { ids?: string[]; upTo?: string }): Promise<number>;
}

// ── Dispatches (st_dispatches + st_dispatch_history) ─────────────────

/** A dispatch with joined names. The service adds the computed fields (overdue, tracking) to make a DispatchView. */
export type DispatchRow = Omit<DispatchView, 'overdue' | 'tracking'> & {
  /** The master courier's URL template (null for manual couriers). */
  courierTemplate: string | null;
};

export interface DispatchListFilters extends Omit<DispatchFilters, 'overdue'> {
  /** Only dispatches with expectedDeliveryDate < this date whose status is not Delivered/Returned. */
  overdueBefore: string;
}

export type DispatchPatch = Patch<
  Dispatch,
  | 'date'
  | 'partyId'
  | 'mode'
  | 'courierId'
  | 'courierNameManual'
  | 'trackingNo'
  | 'vehicleNo'
  | 'driverDetails'
  | 'expectedDeliveryDate'
  | 'freightPaise'
  | 'weightKg'
  | 'dimensions'
  | 'productDescription'
  | 'linkedRequestId'
  | 'remarks'
>;

export interface DispatchRepo {
  getById(id: string): Promise<Dispatch | null>;
  getRow(id: string): Promise<DispatchRow | null>;
  /**
   * q searches the dispatch no., tracking no. and party name.
   * Sort: -createdAt (default), date, dspNo (numeric), expectedDeliveryDate, status, partyName.
   */
  list(query: ListQuery<DispatchListFilters>): Promise<ListResult<DispatchRow>>;
  /** @throws UniqueViolationError('dispatches', 'dspNo') */
  create(row: NewRow<Dispatch>): Promise<Dispatch>;
  /** Field edits only. Status goes through setStatus. */
  update(id: string, patch: DispatchPatch): Promise<Dispatch | null>;
  /** Guarded: sets `to` only if the current status is still `from`. Returns false otherwise. */
  setStatus(id: string, from: DispatchStatus, to: DispatchStatus, at: string): Promise<boolean>;
  softDelete(id: string, at: string): Promise<boolean>;
  appendHistory(entry: NewRow<DispatchHistoryEntry>): Promise<DispatchHistoryEntry>;
  /** Oldest first, with the changer's name. */
  history(dispatchId: string): Promise<DispatchHistoryView[]>;
  /** Live dispatches per status for the same q/filters (filters.status is ignored). Statuses with no rows are 0. */
  countByStatus(query: Pick<ListQuery<DispatchListFilters>, 'q' | 'filters'>): Promise<Record<DispatchStatus, number>>;
  /** For each of `dispatchIds`, when it most recently entered `status` (live history only). Ids with no such entry are left out. */
  latestStatusAt(status: DispatchStatus, dispatchIds: string[]): Promise<Record<string, string>>;
}
