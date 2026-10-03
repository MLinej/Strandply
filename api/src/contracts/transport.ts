// Transport module contracts (legacy Transport Module: legacy/transport/index.html). Shared by the API and the web app.
// Freight flow: inquiry (INQ) → rate comparison (RC) → freight approval (FRA) → order form (SFO). Money is integer paise.

export const DELIVERY_TYPES = ['Door Delivery', 'Godown Delivery'] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];
export const FREIGHT_PAID_BY = ['Strandply', 'Party'] as const;
export type FreightPaidBy = (typeof FREIGHT_PAID_BY)[number];
export const TRANSIT_TIMES = ['Same Day', '1 Day', '2 Days', '3 Days', '4 Days', '5 Days', '6+ Days'] as const;
export const CREDIT_TERMS = ['Against Delivery', '7 Days', '15 Days', '30 Days', '45 Days'] as const;

/** Inquiry status follows its rate comparison: open → rate compared (draft or submitted) → approved → ordered; or rejected. */
export const INQUIRY_STATUSES = ['open', 'rate_compared', 'approved', 'rejected', 'ordered', 'cancelled'] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];
export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = { open: 'Open', rate_compared: 'Rates compared', approved: 'Approved', rejected: 'Rejected', ordered: 'Ordered', cancelled: 'Cancelled' };

export const RC_STATUSES = ['draft', 'pending', 'approved', 'rejected'] as const;
export type RcStatus = (typeof RC_STATUSES)[number];
export const RC_STATUS_LABEL: Record<RcStatus, string> = { draft: 'Draft', pending: 'Pending approval', approved: 'Approved', rejected: 'Rejected' };

export const ORDER_STATUSES = ['issued', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = { issued: 'Issued', delivered: 'Delivered', cancelled: 'Cancelled' };

interface Audit {
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** A city with the pincode picked for it. */
export interface Place {
  city: string;
  state: string | null;
  pincode: string | null;
}

export interface VehicleType extends Audit {
  id: string;
  name: string;
  description: string | null;
  capacity: string | null;
  active: boolean;
}

export interface Transporter extends Audit {
  id: string;
  /** TRP-26-001 */
  code: string;
  name: string;
  contactPerson: string | null;
  phone: string;
  phone2: string | null;
  email: string | null;
  address: string | null;
  city: string;
  state: string | null;
  pincode: string | null;
  gstin: string | null;
  pan: string | null;
  /** TDS declaration given. */
  tds: boolean;
  creditTerms: string;
  ifsc: string | null;
  bankName: string | null;
  bankBranch: string | null;
  accountName: string | null;
  accountNo: string | null;
  /** Vehicle type names they run. */
  vehicles: string[];
  operatingCities: Place[];
  /** 1–5 */
  rating: number;
  active: boolean;
}

export interface TransporterFilters {
  state: string;
  vehicle: string;
  /** Operates in (city name, any case). */
  operatesIn: string;
  active: boolean;
}

export interface Inquiry extends Audit {
  id: string;
  inqNo: string;
  date: string;
  from: Place;
  to: Place;
  material: string;
  weightMt: number | null;
  vehicle: string;
  pickupDate: string | null;
  deliveryType: DeliveryType;
  freightPaidBy: FreightPaidBy;
  /** Highest freight the dispatcher may agree, paise; 0 = none set. */
  budgetPaise: number;
  remarks: string | null;
  status: InquiryStatus;
}

/** One transporter's quote. Amount = rate × minimum guarantee weight, shown for comparison. */
export interface Quote {
  transporterId: string;
  transporterName: string;
  ratePaise: number;
  transit: string;
  /** Minimum guarantee weight, MT. */
  mgWeightMt: number | null;
  rating: number;
  phone: string | null;
}

export interface ApprovalStep {
  action: 'submitted' | 'approved' | 'exception_approved' | 'rejected' | 'reopened' | 'ordered';
  by: string | null;
  byName: string | null;
  note: string | null;
  at: string;
}

/** Rate comparison and its freight approval (legacy RATE_CMPS + APPROVALS: one record here). */
export interface RateComparison extends Audit {
  id: string;
  rcNo: string;
  inquiryId: string;
  quotes: Quote[];
  /** Index into quotes of the chosen one, once chosen. */
  selected: number | null;
  /** Required when the chosen rate isn't the lowest or is over budget. */
  justification: string | null;
  status: RcStatus;
  /** FRA-26-001, given on first submission. */
  approvalNo: string | null;
  trail: ApprovalStep[];
}

/** Calculated: the chosen quote, the lowest, and whether an exception is needed. */
export interface RcCheck {
  lowestPaise: number | null;
  selectedPaise: number | null;
  isLowest: boolean;
  exceedsBudget: boolean;
  /** Justification needed before submitting. */
  needsJustification: boolean;
}

export function rcCheck(quotes: Pick<Quote, 'ratePaise'>[], selected: number | null, budgetPaise: number): RcCheck {
  const rates = quotes.map((q) => q.ratePaise).filter((r) => r > 0);
  const lowestPaise = rates.length ? Math.min(...rates) : null;
  const selectedPaise = selected !== null ? (quotes[selected]?.ratePaise ?? null) : null;
  const isLowest = selectedPaise !== null && selectedPaise === lowestPaise;
  const exceedsBudget = selectedPaise !== null && budgetPaise > 0 && selectedPaise > budgetPaise;
  return { lowestPaise, selectedPaise, isLowest, exceedsBudget, needsJustification: selectedPaise !== null && (!isLowest || exceedsBudget) };
}

export interface RateComparisonView extends RateComparison, RcCheck {
  inqNo: string;
  inquiry: Pick<Inquiry, 'from' | 'to' | 'material' | 'weightMt' | 'vehicle' | 'budgetPaise' | 'pickupDate' | 'deliveryType' | 'freightPaidBy'>;
  orderId: string | null;
  orderNo: string | null;
}

/** The order form sent to the transporter (legacy ORDERS): a snapshot of the approved freight. */
export interface FreightOrder extends Audit {
  id: string;
  orderNo: string;
  rcId: string;
  inquiryId: string;
  date: string;
  transporterId: string;
  transporter: Pick<Transporter, 'name' | 'contactPerson' | 'phone' | 'gstin' | 'address' | 'city' | 'state' | 'creditTerms'>;
  from: Place;
  to: Place;
  vehicle: string;
  material: string;
  weightMt: number | null;
  pickupDate: string | null;
  deliveryType: DeliveryType;
  freightPaidBy: FreightPaidBy;
  ratePaise: number;
  transit: string;
  status: OrderStatus;
  deliveredOn: string | null;
  remarks: string | null;
}

export interface FreightOrderView extends FreightOrder {
  inqNo: string;
  rcNo: string;
  approvalNo: string | null;
}

export interface InquiryView extends Inquiry {
  rcId: string | null;
  rcNo: string | null;
  rcStatus: RcStatus | null;
  orderId: string | null;
  orderNo: string | null;
}

export interface Named {
  name: string;
  value: number;
}

export interface TransportDashboard {
  inquiries: number;
  open: number;
  drafts: number;
  pendingApproval: number;
  orders: number;
  inTransit: number;
  /** Freight on orders this month (not cancelled). */
  monthFreightPaise: number;
  lowestShare: number | null;
  recentInquiries: InquiryView[];
  pending: RateComparisonView[];
}

export interface TransportReports {
  orders: number;
  freightPaise: number;
  delivered: number;
  /** Chosen quote was the lowest, % of approved comparisons. */
  lowestShare: number | null;
  /** Sum of (highest quote − chosen) over approved comparisons. */
  savedVsHighestPaise: number;
  exceptions: number;
  byMonth: Named[];
  byTransporter: { name: string; orders: number; freightPaise: number }[];
  byRoute: { route: string; orders: number; freightPaise: number; avgPaise: number }[];
  byVehicle: Named[];
}

/** Quotes seen before on the same route and vehicle, newest per transporter (replaces legacy hard-coded MARKET_RATES). */
export interface PastQuote {
  transporterId: string;
  transporterName: string;
  ratePaise: number;
  transit: string;
  rcNo: string;
  date: string;
}

export interface TransportMeta {
  vehicles: string[];
  cities: Place[];
  transporters: { id: string; name: string; phone: string; rating: number; vehicles: string[]; cities: string[] }[];
  today: string;
}

export interface TransporterImportRow {
  row: number;
  name: string;
  phone: string;
  city: string;
  state: string | null;
  error: string | null;
}
export interface TransporterImportResult {
  total: number;
  valid: number;
  rows: TransporterImportRow[];
  imported: number;
}

/** "Rajkot → Mumbai" */
export const routeOf = (from: Place, to: Place) => `${from.city} → ${to.city}`;
