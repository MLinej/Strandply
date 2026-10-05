// SampleTrack wire types: the entities as the API returns them, plus input shapes.
// Field names are camelCase versions of the st_* columns (db/migrations/0002_sampletrack.sql).
// Money is integer paise and timestamps are UTC ISO strings.

export * from './common';
import type { ListResult } from './common';

// ── Enumerations (must match the CHECK constraints) ──────────────────

export const PARTY_TYPES = ['Existing Customer', 'New Lead'] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

/** A soft list: the UI suggests these, and the API accepts any text. */
export const INDUSTRIES = [
  'Furniture',
  'Construction',
  'Interior Design',
  'Contractor',
  'Trader / Dealer',
  'Architect',
  'Manufacturer',
  'Other',
] as const;

export const COURIER_TYPES = ['Courier', 'Transport', 'Bus'] as const;
export type CourierType = (typeof COURIER_TYPES)[number];

export const COURIER_STATUSES = ['Active', 'Inactive'] as const;
export type CourierStatus = (typeof COURIER_STATUSES)[number];

export const DISPATCH_MODES = ['Courier', 'Transport', 'Bus', 'Hand Delivery'] as const;
export type DispatchMode = (typeof DISPATCH_MODES)[number];

export const BOARD_TYPES = ['OSB', 'S-OSB', 'Hybrid', 'MDO', 'Core Veneer', 'Face Veneer'] as const;
export type BoardType = (typeof BOARD_TYPES)[number];

export const STOCK_STATUSES = ['Available', 'Limited', 'Out of Stock'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const REQUEST_PRIORITIES = ['Normal', 'Medium', 'High', 'Urgent'] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];

export const REQUEST_STATUSES = ['Pending', 'Approved', 'Dispatched', 'Delivered'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const DISPATCH_STATUSES = [
  'Pending',
  'Approved',
  'Packed',
  'Dispatched',
  'In Transit',
  'Delivered',
  'Delayed',
  'Returned',
] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

interface Audit {
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ── Parties ──────────────────────────────────────────────────────────

export interface Party extends Audit {
  id: string;
  name: string;
  contact: string | null;
  /** Indian mobile, stored as 10 digits. */
  mobile: string | null;
  email: string | null;
  /** 15-character GSTIN, upper case. */
  gst: string | null;
  address: string | null;
  city: string | null;
  /** Canonical st_states name. */
  state: string | null;
  /** 6 digits. */
  pin: string | null;
  industry: string | null;
  type: PartyType;
  assignedUserId: string | null;
  remarks: string | null;
}

/** Party plus the assigned person's name, as lists and detail views return it. */
export interface PartyView extends Party {
  assignedUserName: string | null;
}

export interface PartyInput {
  name: string;
  contact?: string | null;
  mobile?: string | null;
  email?: string | null;
  gst?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pin?: string | null;
  industry?: string | null;
  type?: PartyType;
  assignedUserId?: string | null;
  remarks?: string | null;
}

export interface PartyFilters {
  type: PartyType;
  assignedUserId: string;
  city: string;
  state: string;
}

/** Details of the 409 `possible_duplicate` error. Send again with ?force=true to save anyway. */
export interface DuplicatePartyDetails {
  similar: Pick<Party, 'id' | 'name' | 'city' | 'state' | 'mobile' | 'gst'>[];
}

/** Someone a party can be assigned to: an active marketing/admin/superadmin user. */
export interface AssigneeOption {
  id: string;
  name: string;
  role: string;
}

// ── Couriers ─────────────────────────────────────────────────────────

export interface Courier extends Audit {
  id: string;
  name: string;
  type: CourierType;
  contact: string | null;
  mobile: string | null;
  email: string | null;
  coverage: string | null;
  /** URL in which '{tracking}' is replaced by the tracking number. */
  trackingUrlTemplate: string | null;
  rating: number | null;
  status: CourierStatus;
  remarks: string | null;
}

export interface CourierInput {
  name: string;
  type?: CourierType;
  contact?: string | null;
  mobile?: string | null;
  email?: string | null;
  coverage?: string | null;
  trackingUrlTemplate?: string | null;
  rating?: number | null;
  status?: CourierStatus;
  remarks?: string | null;
}

export interface CourierFilters {
  type: CourierType;
  status: CourierStatus;
}

export type CourierOption = Pick<Courier, 'id' | 'name' | 'type' | 'trackingUrlTemplate'>;

// ── Products ─────────────────────────────────────────────────────────

export interface Product extends Audit {
  id: string;
  code: string;
  name: string;
  boardType: BoardType;
  thicknessMm: number | null;
  size: string | null;
  category: string | null;
  unitPricePaise: number;
  stockStatus: StockStatus;
  description: string | null;
}

export interface ProductInput {
  code: string;
  name: string;
  boardType?: BoardType;
  thicknessMm?: number | null;
  size?: string | null;
  category?: string | null;
  unitPricePaise?: number;
  stockStatus?: StockStatus;
  description?: string | null;
}

export interface ProductFilters {
  boardType: BoardType;
  stockStatus: StockStatus;
}

export interface ProductSummary {
  total: number;
  osb: number;
  sosb: number;
  mdo: number;
  /** Hybrid, Core Veneer and Face Veneer. */
  others: number;
}

export type ImportField = 'code' | 'name' | 'boardType' | 'thicknessMm' | 'size' | 'category' | 'unitPricePaise' | 'stockStatus';

export interface ImportRowResult {
  /** Row number as shown in the spreadsheet (the header is row 1). */
  row: number;
  /** In a preview: would_add | skipped | error. In a commit: added | skipped | error. */
  status: 'would_add' | 'added' | 'skipped' | 'error';
  reason?: string;
  product?: ProductInput;
}

export interface ImportReport {
  mode: 'preview' | 'commit';
  /** Which spreadsheet column fed each field (null = not found, so the default is used). */
  columns: Record<ImportField, string | null>;
  totals: { rows: number; added: number; skipped: number; errors: number };
  rows: ImportRowResult[];
}

// ── Geography ────────────────────────────────────────────────────────

export interface State {
  id: string;
  name: string;
  gstCode: string | null;
  kind: 'State' | 'UT';
}

export interface City extends Audit {
  id: string;
  city: string;
  stateId: string;
  isCustom: boolean;
  /** 6-digit pincodes, for the vendor form's pincode → city lookup. A pincode belongs to one city. */
  pincodes: string[];
}

export interface CityView {
  id: string;
  city: string;
  stateId: string;
  stateName: string;
  isCustom: boolean;
  pincodes: string[];
}

export interface CityFilters {
  stateId: string;
  isCustom: boolean;
}

/** One entry in the party form's city dropdown. */
export interface CityOption {
  city: string;
  /** null when a city only appears on a party record and has no state there. */
  state: string | null;
  source: 'builtin' | 'custom' | 'party';
}

// ── Requests and dispatches (rows only for now; used for reference checks) ─────────

export interface SampleRequest extends Audit {
  id: string;
  reqNo: string;
  date: string;
  partyId: string;
  purpose: string | null;
  priority: RequestPriority;
  requiredDispatchDate: string | null;
  requestedByUserId: string | null;
  remarks: string | null;
  status: RequestStatus;
  /** Who approved it and when (null until approved). */
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface SampleRequestItem extends Audit {
  id: string;
  requestId: string;
  lineNo: number;
  productId: string | null;
  productName: string;
  board: string | null;
  thickness: string | null;
  size: string | null;
  qtyValue: number | null;
  qtyUnit: string | null;
  qtyRaw: string | null;
}

export interface Dispatch extends Audit {
  id: string;
  dspNo: string;
  date: string;
  partyId: string;
  mode: DispatchMode;
  courierId: string | null;
  courierNameManual: string | null;
  trackingNo: string | null;
  vehicleNo: string | null;
  driverDetails: string | null;
  expectedDeliveryDate: string | null;
  freightPaise: number;
  weightKg: number | null;
  dimensions: string | null;
  productDescription: string | null;
  linkedRequestId: string | null;
  remarks: string | null;
  status: DispatchStatus;
}

/** Details of the 409 `in_use` error when deleting a referenced master record. */
export interface InUseDetails {
  requests: number;
  dispatches: number;
}

// ── Sample request workflow ──────────────────────────────────────────

/** A request with what lists and detail views need: party and requester names, and the product lines. */
export interface RequestView extends SampleRequest {
  partyName: string;
  requestedByName: string | null;
  approvedByName: string | null;
  items: SampleRequestItem[];
}

/** Tab counts for the request list. They follow the current search and filters, but not the status tab. */
export interface RequestCounts {
  all: number;
  Pending: number;
  Approved: number;
  Dispatched: number;
  Delivered: number;
}

export interface RequestListResult extends ListResult<RequestView> {
  counts: RequestCounts;
}

export interface RequestFilters {
  status: RequestStatus;
  partyId: string;
  requestedByUserId: string;
  /** Inclusive range on the request date (YYYY-MM-DD). */
  dateFrom: string;
  dateTo: string;
}

/**
 * One product line. With `productId`, any blank board/thickness/size/name is filled from the
 * product master. Without it, the line is a free-text product and needs `productName`.
 * `qty` is what the user typed ("5 sheets"). The server keeps it as qtyRaw and parses qtyValue/qtyUnit.
 */
export interface RequestLineInput {
  productId?: string | null;
  productName?: string | null;
  board?: string | null;
  thickness?: string | null;
  size?: string | null;
  qty?: string | null;
}

export interface RequestInput {
  /** Defaults to today (India time). */
  date?: string;
  partyId: string;
  purpose?: string | null;
  priority?: RequestPriority;
  requiredDispatchDate?: string | null;
  /** Defaults to the signed-in user. Must be an active marketing/admin/superadmin user. */
  requestedByUserId?: string | null;
  remarks?: string | null;
  items: RequestLineInput[];
}

/** Fields an edit can change. Status, created_by and created_at never change through an edit. Sending `items` replaces all lines. */
export type RequestUpdate = Partial<RequestInput>;

/** Fills in a new dispatch form from a request ("Create dispatch from request"). */
export interface DispatchDraft {
  partyId: string;
  partyName: string;
  /** "name qty, name qty", as in the legacy app. */
  productDescription: string;
  linkedRequestId: string;
  linkedRequestNo: string;
  requestStatus: RequestStatus;
}

// ── Counters and notifications ───────────────────────────────────────

export interface Counter {
  name: string;
  lastValue: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export const NOTIFICATION_TYPES = ['info', 'success', 'warning', 'danger'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface Notification extends Audit {
  id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  entityType: 'request' | 'dispatch' | null;
  entityId: string | null;
  /** null = everyone who can open Notifications. */
  targetUserId: string | null;
}

// ── Dispatch and tracking ────────────────────────────────────────────

/** One row of st_dispatch_history: a status the dispatch entered, who set it, and when. */
export interface DispatchHistoryEntry {
  id: string;
  dispatchId: string;
  status: DispatchStatus;
  changedBy: string | null;
  changedAt: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DispatchHistoryView extends DispatchHistoryEntry {
  changedByName: string | null;
}

/**
 * Where to track a shipment: a link (the courier's template, or a built-in for
 * Blue Dart/DTDC/Delhivery), or a text hint when no link is known.
 */
export type TrackingLink = { kind: 'url'; url: string } | { kind: 'text'; text: string };

/** A dispatch with names joined in and computed fields. */
export interface DispatchView extends Dispatch {
  partyName: string;
  partyCity: string | null;
  partyState: string | null;
  /** The master courier's name, or the manual name. */
  courierName: string | null;
  linkedRequestNo: string | null;
  /** expected_delivery_date < today (India) and status not Delivered/Returned. Computed, never stored. */
  overdue: boolean;
  /** null when there is no tracking number. */
  tracking: TrackingLink | null;
}

export interface DispatchFilters {
  mode: DispatchMode;
  status: DispatchStatus;
  partyId: string;
  courierId: string;
  linkedRequestId: string;
  dateFrom: string;
  dateTo: string;
  /** true = only overdue dispatches. */
  overdue: boolean;
}

export interface DispatchInput {
  /** Defaults to today (India time). */
  date?: string;
  partyId: string;
  mode: DispatchMode;
  /** From the courier master. Use either this or courierNameManual. */
  courierId?: string | null;
  courierNameManual?: string | null;
  trackingNo?: string | null;
  vehicleNo?: string | null;
  driverDetails?: string | null;
  expectedDeliveryDate?: string | null;
  freightPaise?: number;
  /** Must be > 0. */
  weightKg: number;
  dimensions?: string | null;
  productDescription?: string | null;
  linkedRequestId?: string | null;
  remarks?: string | null;
  /** Initial status (default Pending). */
  status?: DispatchStatus;
}

/** A status sent here is applied like a quick update (history row, notifications, request sync). */
export type DispatchUpdate = Partial<DispatchInput> & { statusNote?: string | null };

export interface DispatchStatusChange {
  status: DispatchStatus;
  note?: string | null;
}

/** Steps on the normal path, in order. Delayed and Returned are off-path events. */
export const TIMELINE_STEPS = ['Pending', 'Approved', 'Packed', 'Dispatched', 'In Transit', 'Delivered'] as const;
export const OFF_PATH_STATUSES = ['Delayed', 'Returned'] as const;

export interface TimelineStep {
  status: (typeof TIMELINE_STEPS)[number];
  /** done = passed (a time may be missing if the step was skipped); current = where it is now. */
  state: 'done' | 'current' | 'pending';
  /** When the dispatch most recently entered this status, from history. */
  at: string | null;
  by: string | null;
}

export interface OffPathEvent {
  status: (typeof OFF_PATH_STATUSES)[number];
  at: string;
  by: string | null;
  note: string | null;
  /** True when this is the dispatch's status right now. */
  current: boolean;
}

export interface TrackingDetail {
  dispatch: DispatchView;
  timeline: TimelineStep[];
  offPath: OffPathEvent[];
  history: DispatchHistoryView[];
}

/** A dispatch form picker entry: a request that can still be linked. */
export interface LinkableRequest {
  id: string;
  reqNo: string;
  partyId: string;
  partyName: string;
  status: RequestStatus;
  productSummary: string;
}

export interface PartyPick {
  id: string;
  name: string;
  city: string | null;
}

// ── Settings (st_settings) ───────────────────────────────────────────

/** One st_settings row. `value` is the decoded JSON. */
export interface Setting {
  key: string;
  value: unknown;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** The company details printed on labels, slips and share messages. */
export interface CompanyBlock {
  name: string;
  /** The "City / State" line, e.g. "Wankaner, Morbi, Gujarat". */
  city: string;
  phone: string | null;
  llpin: string | null;
  gst: string | null;
}

// ── Print and share payloads ─────────────────────────────────────────

export interface PageSpec {
  size: 'A4' | 'A5';
  orientation: 'portrait' | 'landscape';
  widthMm: number;
  heightMm: number;
}

/** Everything the A5-landscape courier label shows. Layout comes from the design system. */
export interface CourierLabel {
  page: PageSpec;
  from: CompanyBlock;
  dispatch: {
    id: string;
    dspNo: string;
    date: string;
    mode: DispatchMode;
    trackingNo: string | null;
    courierName: string | null;
    vehicleNo: string | null;
    dimensions: string | null;
    contents: string | null;
    expectedDeliveryDate: string | null;
    status: DispatchStatus;
  };
  to: {
    name: string;
    contact: string | null;
    mobile: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    /** "City, State" (whichever parts exist), or null. */
    cityState: string | null;
    pin: string | null;
    email: string | null;
  };
  /** Text to encode in the label's QR code (render it locally). */
  qrPayload: string;
  printedAt: string;
}

export interface SlipSignature {
  label: 'Requested By' | 'Approved By' | 'Dispatched By';
  role: string;
  /** Pre-filled where known; the signature itself is by hand. */
  name: string | null;
}

/** Everything the A4 sample request slip shows. */
export interface RequestSlip {
  page: PageSpec;
  company: CompanyBlock;
  request: {
    id: string;
    reqNo: string;
    status: RequestStatus;
    date: string;
    /** When it was raised (UTC). */
    createdAt: string;
    requiredDispatchDate: string | null;
    priority: RequestPriority;
    /** High and Urgent are highlighted on the slip. */
    highPriority: boolean;
    purpose: string | null;
    requestedByName: string | null;
    remarks: string | null;
  };
  party: {
    name: string;
    contact: string | null;
    mobile: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    pin: string | null;
    gst: string | null;
  };
  items: { lineNo: number; productName: string; board: string | null; thickness: string | null; size: string | null; qty: string | null }[];
  approvedBy: { name: string | null; at: string } | null;
  signatures: SlipSignature[];
  printedAt: string;
}

export interface WhatsAppShare {
  text: string;
  /** The party's mobile in wa.me form (91XXXXXXXXXX), when it is a valid Indian mobile. */
  phone: string | null;
}

export interface QrPayload {
  payload: string;
}

// ── Dashboard ────────────────────────────────────────────────────────

export interface DashboardWidgets {
  /** Live dispatches. */
  total?: number;
  /** Requests in Pending. */
  pending?: number;
  /** Dispatches in Delivered. */
  delivered?: number;
  /** Dispatches in Delayed. */
  delayed?: number;
  /** Live parties (all of them, as in the legacy dashboard). */
  parties?: number;
  /** Live couriers (all statuses, as in the legacy dashboard). */
  couriers?: number;
}

export interface DashboardRecentDispatch {
  id: string;
  dspNo: string;
  date: string;
  partyName: string;
  partyCity: string | null;
  status: DispatchStatus;
}

export interface DashboardPendingRequest {
  id: string;
  reqNo: string;
  date: string;
  partyName: string;
  priority: RequestPriority;
}

export interface TrendPoint {
  /** YYYY-MM */
  month: string;
  /** "May 2026" */
  label: string;
  /** Dispatches whose dispatch date falls in the month. */
  dispatched: number;
  /** Dispatches delivered in the month (time they last entered Delivered, India time; dispatch date if no history). */
  delivered: number;
}

export interface StatusSlice {
  status: 'Pending' | 'Dispatched' | 'In Transit' | 'Delivered' | 'Delayed';
  count: number;
}

/**
 * Role-aware: only the widgets the role may see are present.
 * Charts need dashboard_full. Recent dispatches need dashboard_full or the "total" widget;
 * pending requests need dashboard_full or the "pending" widget.
 */
export interface DashboardData {
  asOf: string;
  full: boolean;
  widgets: DashboardWidgets;
  visibleWidgets: string[];
  recentDispatches?: DashboardRecentDispatch[];
  pendingRequests?: DashboardPendingRequest[];
  charts?: {
    trend: TrendPoint[];
    /** The Pending slice adds Pending requests to Pending dispatches (legacy behaviour); see pendingBreakdown. */
    statusDistribution: StatusSlice[];
    pendingBreakdown: { dispatches: number; requests: number };
  };
}

// ── Reports ──────────────────────────────────────────────────────────

export const REPORT_KEYS = [
  'dispatch-register',
  'pending',
  'party-wise',
  'courier-performance',
  'cost-tracking',
  'product-analysis',
  'marketing-performance',
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export interface ReportFilters {
  /** Inclusive, on the dispatch date or request date. */
  dateFrom?: string;
  dateTo?: string;
  partyId?: string;
  /** Dispatch-based reports only. On the pending report it limits the list to dispatches. */
  courierId?: string;
}

/** money = integer paise, percent = 0–100 (one decimal), date = YYYY-MM-DD. */
export type ReportColumnType = 'text' | 'number' | 'money' | 'percent' | 'date';

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
}

export type ReportCell = string | number | null;

export interface ReportTable {
  name: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  /** Optional totals row, keyed like the rows. */
  totals?: Record<string, ReportCell>;
}

export interface ReportSummaryItem {
  label: string;
  value: number;
  type: ReportColumnType;
}

export interface Report {
  key: ReportKey;
  title: string;
  filters: ReportFilters & { partyName?: string | null; courierName?: string | null };
  generatedAt: string;
  summary: ReportSummaryItem[];
  tables: ReportTable[];
}

export interface ReportPrint {
  page: PageSpec;
  company: CompanyBlock;
  report: Report;
  printedAt: string;
}

// ── Notifications (per user) ─────────────────────────────────────────

/** st_notification_reads: one row per (notification, user) once that user reads or clears it. */
export interface NotificationRead {
  notificationId: string;
  userId: string;
  readAt: string | null;
  /** "Clear" hides the notification for this user only. */
  dismissedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** A notification as one user sees it. */
export interface NotificationView extends Notification {
  read: boolean;
  readAt: string | null;
}

export interface NotificationFeedFilters {
  /** true = only unread. */
  unread: boolean;
  type: NotificationType;
}

/** Sidebar badges. Each count is present only if the user may see that page. */
export interface Badges {
  unreadNotifications?: number;
  pendingRequests?: number;
  /** Vendors waiting for approval (Vendors module). */
  pendingVendors?: number;
  /** MRNs waiting for a GRN (Stores module). */
  pendingGrn?: number;
  /** CRM follow-ups overdue or due today. */
  dueFollowups?: number;
  /** Freight rate comparisons waiting for approval (Transport, approvers only). */
  pendingFreight?: number;
  /** Work orders past their due date and not completed (Maintenance). */
  overdueWorkOrders?: number;
  /** Complaints still Open (not yet taken up). */
  openComplaints?: number;
  /** Work plans submitted and waiting for approval (DWPAS, approvers only). */
  pendingPlans?: number;
}

/** Company details (Settings). Printed on labels and slips and used in WhatsApp messages. */
export interface CompanySettings {
  name: string;
  llpin: string | null;
  /** The "City / State" line, e.g. "Wankaner, Morbi, Gujarat". */
  city: string | null;
  phone: string | null;
  gst: string | null;
}
