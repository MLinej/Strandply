// Sales module contracts (legacy Sales ERP: legacy/sales/index.html). Shared by the API and the web app.
// Money is integer paise. Rates are paise per square metre. Square metres keep 4 decimals, as in legacy.
import { fyOf, taxOn, type TaxSplit } from './purchase';

// ── Firms and tax ───────────────────────────────────────────────────

export const FIRM_IDS = ['llp', 'osb'] as const;
export type Firm = (typeof FIRM_IDS)[number];
export const FIRM_LABEL: Record<Firm, string> = { llp: 'Strandply LLP', osb: 'Strandply OSB' };
export const isFirm = (v: unknown): v is Firm => v === 'llp' || v === 'osb';

/** Same values as Purchase. Legacy wrote them "+SG+CG" / "+IG". */
export const SALES_TAX_TYPES = ['SG+CG', 'IGST'] as const;
export type SalesTaxType = (typeof SALES_TAX_TYPES)[number];

/** Registered state of each firm, as the GST state code: LLP is in Gujarat, OSB in Maharashtra. */
export const DEFAULT_FIRM_STATE_CODES: Record<Firm, string> = { llp: '24', osb: '27' };

export function gstinStateCode(gstin: string | null | undefined): string | null {
  const m = /^(\d{2})/.exec(String(gstin ?? '').trim());
  return m ? m[1]! : null;
}

/** SG+CG when the party's GSTIN is from the firm's own state, IGST otherwise; `fallback` when there's no GSTIN (legacy taxTypeForBillTo). */
export function taxTypeFor(gstin: string | null | undefined, firmStateCode: string, fallback: SalesTaxType = 'SG+CG'): SalesTaxType {
  const code = gstinStateCode(gstin);
  if (!code) return fallback;
  return code === firmStateCode ? 'SG+CG' : 'IGST';
}

// ── Masters ─────────────────────────────────────────────────────────

export const DEALER_TYPES = ['Dealer', 'OEM', 'Distributor', 'Internal Company'] as const;
export type DealerType = (typeof DEALER_TYPES)[number];

export const DEFAULT_GRADES = ['S-OSB', 'OSB', 'OSB HYBRID', 'SEMI S-OSB', 'MDO', 'Hybrid Board', 'Plywood'];
export const DEFAULT_PAYMENT_TERMS = ['30 Days', '15 Days', '7 Days', 'Advance', 'Against Delivery', 'IMMEDIATE', 'Inter-Company'];
export const DEFAULT_DELIVERY_TERMS = ['EX WORKS', 'FOR', 'FOR Destination', 'To Pay'];
export const DEFAULT_BRANDS = ['Strandply'];
export const DEFAULT_GST_PCT = 18;
/** Board density used for dispatched tonnage (legacy calcInvWeightTons): t per m³. */
export const BOARD_DENSITY = 0.65;

interface Audit {
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Party Master. Shared by both firms; the tax type is kept per firm (legacy taxTypeLLP / taxTypeOSB). */
export interface Customer extends Audit {
  id: string;
  name: string;
  code: string | null;
  dealerType: DealerType;
  gstin: string | null;
  pan: string | null;
  /** Account group, e.g. SUNDRY DEBTORS. */
  group: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  pincode: string | null;
  contactPerson: string | null;
  mobile1: string | null;
  mobile2: string | null;
  email: string | null;
  creditDays: number;
  creditLimitPaise: number;
  transportPref: string | null;
  paymentTerms: string | null;
  taxTypes: Record<Firm, SalesTaxType>;
  active: boolean;
}

export interface CustomerFilters {
  state: string;
  city: string;
  group: string;
  dealerType: DealerType;
  active: boolean;
}

/** Item Master (finished boards). */
export interface SalesItem extends Audit {
  id: string;
  name: string;
  brand: string;
  grade: string;
  subType: string | null;
  /** mm */
  thic: number;
  width: number;
  length: number;
  /** Square metres per board; W × L by default but editable. */
  sqmFactor: number;
  /** Paise per sq m. */
  defaultRatePaise: number;
  hsn: string | null;
  active: boolean;
}

/** Price List / Weight Chart row: the value applies from its effective date until a later row for the same item. */
export interface PriceEntry extends Audit {
  id: string;
  itemId: string;
  effectiveDate: string;
  /** Paise per sq m. */
  ratePaise: number;
}

export interface WeightEntry extends Audit {
  id: string;
  itemId: string;
  effectiveDate: string;
  /** Kg per board. */
  weightKg: number;
}

/** Latest entry for the item whose effective date is on or before `asOf` (legacy resolveEffectiveEntry). */
export function effectiveEntry<T extends { itemId: string; effectiveDate: string }>(rows: T[], itemId: string, asOf: string): T | null {
  let best: T | null = null;
  for (const r of rows) if (r.itemId === itemId && r.effectiveDate <= asOf && (!best || r.effectiveDate > best.effectiveDate)) best = r;
  return best;
}

export const round4 = (n: number) => Math.round(n * 10000) / 10000;
export const round2 = (n: number) => Math.round(n * 100) / 100;
/** Sq m per board from width and length in mm. */
export const sqmFactorOf = (widthMm: number, lengthMm: number) => round4((widthMm / 1000) * (lengthMm / 1000));
/**
 * Rate per sq ft, for reference only (never used in amounts). Strandply's trade convention: an 8×4 board is
 * 2.9768 sq m = 32 sq ft, so rate/sq ft = rate/sq m × 2.9768 / 32.
 */
export const rateSqftOf = (ratePaise: number) => Math.round((ratePaise * 2.9768) / 32);
/** Board tonnage: thickness × width × length (m³) × pcs × density. */
export const boardTons = (thic: number | null, width: number | null, length: number | null, pcs: number) =>
  thic && width && length && pcs ? (thic / 1000) * (width / 1000) * (length / 1000) * pcs * BOARD_DENSITY : 0;

// ── Document lines and totals ───────────────────────────────────────

/** Item details copied onto a line when it's saved, so later master edits don't change old documents. */
export interface LineItem {
  itemId: string | null;
  itemName: string;
  brand: string | null;
  grade: string | null;
  subType: string | null;
  thic: number | null;
  width: number | null;
  length: number | null;
  hsn: string | null;
  sqmFactor: number;
}

/** Proforma / sales order line. Amount = sq m × rate (legacy recomputeLineAmount). */
export interface OrderLine extends LineItem {
  pcs: number;
  qtySqm: number;
  ratePaise: number;
  /** Kg per board, from the Weight Chart (editable). */
  weightKg: number;
  amountPaise: number;
}

export interface InvoiceLine extends LineItem {
  /** Index of the sales order line this was dispatched against. */
  soLine: number | null;
  /** The order's quantity, for reference. */
  soPcs: number;
  soQtySqm: number;
  /** Dispatched in this invoice. */
  pcs: number;
  qtySqm: number;
  ratePaise: number;
  amountPaise: number;
}

export const lineAmount = (qtySqm: number, ratePaise: number) => Math.round(qtySqm * ratePaise);

export interface DocTotals extends TaxSplit {
  itemsPaise: number;
  freightPaise: number;
  /** Items + freight: GST is charged on both. */
  taxablePaise: number;
  gstPaise: number;
}

/** Items + freight, then GST split by tax type (legacy recalcInv; orders and proformas show the same total). */
export function docTotals(lines: { amountPaise: number }[], freightPaise: number, taxType: SalesTaxType, gstPct: number): DocTotals {
  const itemsPaise = lines.reduce((s, l) => s + l.amountPaise, 0);
  const taxablePaise = itemsPaise + freightPaise;
  const t = taxOn(taxablePaise, taxType, gstPct);
  return { ...t, itemsPaise, freightPaise, taxablePaise, gstPaise: t.cgst + t.sgst + t.igst };
}

export const totalWeightKg = (lines: { pcs: number; weightKg: number }[]) => round2(lines.reduce((s, l) => s + l.pcs * l.weightKg, 0));

// ── Numbering ───────────────────────────────────────────────────────

/** "26-27" for FY 2026-27. */
export const fyShort = (fy: string) => fy.slice(2);
/**
 * Legacy numbers: SO/12/26-27, PI/004/26-27, invoices SPL/07/26-27 (LLP) and OSB/07/26-27.
 * OSB orders and proformas get an OSB- prefix so they never clash with LLP's.
 */
export function docNumber(kind: 'order' | 'proforma' | 'invoice', firm: Firm, n: number, fy: string) {
  const yy = fyShort(fy);
  if (kind === 'invoice') return `${firm === 'llp' ? 'SPL' : 'OSB'}/${String(n).padStart(2, '0')}/${yy}`;
  const base = kind === 'order' ? `SO/${n}/${yy}` : `PI/${String(n).padStart(3, '0')}/${yy}`;
  return firm === 'llp' ? base : `OSB-${base}`;
}
export const counterName = (kind: 'order' | 'proforma' | 'invoice', firm: Firm, fy: string) => `SL-${kind === 'order' ? 'SO' : kind === 'proforma' ? 'PI' : 'INV'}-${firm}-${fy}`;
/** The running number in SO/12/26-27 → 12. */
export const docSeq = (no: string) => Number(/(\d+)\//.exec(no)?.[1] ?? 0);
export { fyOf };

// ── Proforma invoices ───────────────────────────────────────────────

export const PI_STATUSES = ['draft', 'sent', 'confirmed', 'cancelled'] as const;
export type PiStatus = (typeof PI_STATUSES)[number];
export const PI_STATUS_LABEL: Record<PiStatus, string> = { draft: 'Draft', sent: 'Sent to party', confirmed: 'Confirmed', cancelled: 'Cancelled' };

interface PartyRefs {
  billToId: string | null;
  /** Name as it was when saved. */
  billTo: string;
  shipToId: string | null;
  shipTo: string;
  /** Ship-to party's state and city as they were when saved (lists and reports filter and group by them). */
  state: string | null;
  city: string | null;
}

interface OrderTerms {
  salesPerson: string | null;
  paymentTerms: string | null;
  deliveryTerms: string | null;
}

export interface Proforma extends Audit, PartyRefs, OrderTerms {
  id: string;
  firm: Firm;
  piNo: string;
  date: string;
  validUntil: string | null;
  /** The party's PO reference. */
  poRef: string | null;
  taxType: SalesTaxType;
  lines: OrderLine[];
  freightPaise: number;
  gstPct: number;
  /** Grand total, stored for sorting and lists (always docTotals(...).total). */
  totalPaise: number;
  status: PiStatus;
  /** Set when confirmed into a sales order (the proforma is then locked). */
  soId: string | null;
  soNo: string | null;
  remarks: string | null;
}

export interface ProformaView extends Proforma {
  totals: DocTotals;
  totalWeightKg: number;
  createdByName: string | null;
}

export interface DocListFilters {
  firm: Firm;
  /** A status, or 'open' for orders not completed or cancelled. */
  status: string;
  billTo: string;
  shipTo: string;
  state: string;
  city: string;
  from: string;
  to: string;
  fy: string;
}

/** Counts and values over every document of the list's firm (for the register's KPI tiles), whatever the other filters. */
export interface DocSummary {
  count: number;
  totalPaise: number;
  gstPaise: number;
  byStatus: Record<string, number>;
}

// ── Sales orders ────────────────────────────────────────────────────

export const SO_STATUSES = ['draft', 'confirmed', 'planned', 'ready', 'partial', 'completed', 'cancelled'] as const;
export type SoStatus = (typeof SO_STATUSES)[number];
export const SO_STATUS_LABEL: Record<SoStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  planned: 'Production planned',
  ready: 'Ready for dispatch',
  partial: 'Partially dispatched',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
/** Pending = not completed and not cancelled. */
export const isOpenSo = (s: SoStatus) => s !== 'completed' && s !== 'cancelled';

/** Vehicle and transporter, recorded when the order is dispatched (Dispatch Register). */
export interface DispatchInfo {
  date: string | null;
  vehicleNo: string | null;
  transporter: string | null;
  transporterGstin: string | null;
  lrNo: string | null;
  driverName: string | null;
  driverMobile: string | null;
}
export const EMPTY_DISPATCH: DispatchInfo = { date: null, vehicleNo: null, transporter: null, transporterGstin: null, lrNo: null, driverName: null, driverMobile: null };
export const hasDispatch = (d: DispatchInfo) => !!(d.date || d.vehicleNo);

export interface SalesOrder extends Audit, PartyRefs, OrderTerms {
  id: string;
  firm: Firm;
  soNo: string;
  /** SO date (legacy poDate). */
  date: string;
  /** The customer's PO number and date. */
  poNo: string | null;
  poDate: string | null;
  /** Expected dispatch date. */
  edd: string | null;
  taxType: SalesTaxType;
  lines: OrderLine[];
  freightPaise: number;
  gstPct: number;
  /** Grand total, stored for sorting and lists (always docTotals(...).total). */
  totalPaise: number;
  status: SoStatus;
  remarks: string | null;
  piId: string | null;
  piNo: string | null;
  dispatch: DispatchInfo;
}

export interface SoLineProgress {
  invoicedPcs: number;
  invoicedSqm: number;
  balancePcs: number;
  balanceSqm: number;
  balancePaise: number;
}

export interface SalesOrderView extends SalesOrder {
  totals: DocTotals;
  totalWeightKg: number;
  /** Per line: what invoices have taken so far and what's left. */
  progress: SoLineProgress[];
  invoiceNos: string[];
  createdByName: string | null;
}

// ── Sales invoices ──────────────────────────────────────────────────

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export const APPROVAL_LABEL: Record<ApprovalStatus, string> = { pending: 'Pending approval', approved: 'Approved', rejected: 'Rejected' };

export interface SalesInvoice extends Audit, PartyRefs {
  id: string;
  firm: Firm;
  invNo: string;
  date: string;
  soId: string | null;
  soNo: string | null;
  poNo: string | null;
  taxType: SalesTaxType;
  lines: InvoiceLine[];
  freightPaise: number;
  gstPct: number;
  /** Grand total, stored for sorting and lists (always docTotals(...).total). */
  totalPaise: number;
  /** E-invoice reference number. */
  irn: string | null;
  ewayBill: string | null;
  weightTons: number | null;
  approval: ApprovalStatus;
  approvalNote: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  remarks: string | null;
}

export interface SalesInvoiceView extends SalesInvoice {
  totals: DocTotals;
  /** Calculated from board sizes when no weight was entered. */
  tons: number;
  createdByName: string | null;
}

// ── FG inventory and inter-company ──────────────────────────────────

export interface FgStock extends Audit {
  id: string;
  firm: Firm;
  grade: string;
  thic: number;
  width: number;
  length: number;
  qtyOnHandSqm: number;
  reorderSqm: number;
}

export const specKey = (grade: string | null, thic: number | null, width: number | null, length: number | null) => `${grade ?? ''}|${thic ?? ''}|${width ?? ''}|${length ?? ''}`;

export interface FgStockView extends FgStock {
  /** Sq m on pending sales orders of the same specification. */
  reservedSqm: number;
  availableSqm: number;
  low: boolean;
}

/** An LLP → OSB billing document as recorded in OSB's purchase register. */
export interface Intercompany extends Audit {
  id: string;
  billingDoc: string;
  billingDate: string;
  materialDesc: string;
  grade: string | null;
  thic: number | null;
  width: number | null;
  length: number | null;
  pcs: number;
  qtySqm: number;
  ratePaise: number;
  materialPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  freightPaise: number;
  totalPaise: number;
  vehicleNo: string | null;
}

export interface IntercompanyView extends Intercompany {
  taxPaise: number;
  /** An LLP sales invoice with the same number exists. */
  matched: boolean;
}

// ── Settings ────────────────────────────────────────────────────────

export const EMAIL_DOCS = ['proforma', 'order', 'invoice'] as const;
export type EmailDoc = (typeof EMAIL_DOCS)[number];
export const EMAIL_DOC_LABEL: Record<EmailDoc, string> = { proforma: 'Proforma invoice', order: 'Sales order', invoice: 'Sales invoice' };

export interface EmailTemplate {
  subject: string;
  body: string;
}

/** {{token}} placeholders each template may use. */
export const EMAIL_TOKENS: Record<EmailDoc, string[]> = {
  proforma: ['piNo', 'piDate', 'validUntil', 'billTo', 'shipTo', 'totalValue', 'firm'],
  order: ['soNo', 'soDate', 'billTo', 'shipTo', 'orderValue', 'firm'],
  invoice: ['invNo', 'invDate', 'billTo', 'shipTo', 'total', 'firm'],
};

export const DEFAULT_EMAIL_RECIPIENTS: Record<EmailDoc, string[]> = {
  proforma: ['sales@strandply.com'],
  order: ['jimit@strandply.com', 'sanjay@strandply.com'],
  invoice: ['accounts@strandply.com'],
};

export const DEFAULT_EMAIL_TEMPLATES: Record<EmailDoc, EmailTemplate> = {
  proforma: {
    subject: 'Proforma Invoice {{piNo}} — {{firm}}',
    body: 'Dear {{billTo}},\n\nPlease find attached the Proforma Invoice for your review and confirmation.\n\nPI No.: {{piNo}}\nDate: {{piDate}}\nValid Until: {{validUntil}}\nShip To: {{shipTo}}\nTotal Value: {{totalValue}}\n\nKindly review and confirm your acceptance. Upon confirmation, we will process the Sales Order.\n\nRegards,\n{{firm}}',
  },
  order: {
    subject: 'Sales Order {{soNo}} — {{firm}}',
    body: 'Dear {{billTo}},\n\nPlease find attached the Sales Order confirmation.\n\nSO No.: {{soNo}}\nSO Date: {{soDate}}\nShip To: {{shipTo}}\nOrder Value: {{orderValue}}\n\nKindly review and confirm. The detailed SO PDF is attached.\n\nRegards,\n{{firm}}',
  },
  invoice: {
    subject: 'Tax Invoice {{invNo}} — {{firm}}',
    body: 'Dear {{billTo}},\n\nPlease find attached the Tax Invoice for your records.\n\nInvoice No.: {{invNo}}\nInvoice Date: {{invDate}}\nShip To: {{shipTo}}\nTotal Amount: {{total}}\n\nThe detailed Invoice PDF is attached.\n\nRegards,\n{{firm}}',
  },
};

/** Replaces {{token}} with its value; unknown tokens become blank (legacy fillEmailTemplate). */
export const fillTemplate = (s: string, values: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => values[k] ?? '');

export interface SalesSettings {
  paymentTerms: string[];
  deliveryTerms: string[];
  salesPersons: string[];
  brands: string[];
  grades: string[];
  firmStateCodes: Record<Firm, string>;
  emailRecipients: Record<EmailDoc, string[]>;
  emailTemplates: Record<EmailDoc, EmailTemplate>;
}

export interface EmailDraft {
  to: string[];
  subject: string;
  body: string;
}

// ── Lookups, dashboard and reports ──────────────────────────────────

/** What document forms need to pick parties and items and prefill rates and weights. */
export interface SalesOptions {
  customers: Pick<Customer, 'id' | 'name' | 'city' | 'state' | 'gstin' | 'taxTypes' | 'paymentTerms' | 'dealerType'>[];
  items: SalesItem[];
  prices: Pick<PriceEntry, 'itemId' | 'effectiveDate' | 'ratePaise'>[];
  weights: Pick<WeightEntry, 'itemId' | 'effectiveDate' | 'weightKg'>[];
}

export interface SalesMeta {
  settings: SalesSettings;
  firms: { id: Firm; label: string }[];
  dealerTypes: readonly DealerType[];
  soStatuses: { id: SoStatus; label: string }[];
  piStatuses: { id: PiStatus; label: string }[];
  currentFy: string;
  fys: string[];
  today: string;
}

export interface Named {
  name: string;
  value: number;
}

export interface SalesDashboard {
  invoiceCount: number;
  orderCount: number;
  totalPaise: number;
  basicPaise: number;
  tons: number;
  pcs: number;
  pendingOrders: number;
  /** Everything invoiced in the period (there's no receipt tracking yet, as in legacy). */
  outstandingPaise: number;
  topCustomer: string | null;
  topProduct: string | null;
  dispatchPending: number;
  pendingApproval: number;
  grades: { grade: string; tons: number; pcs: number; basicPaise: number }[];
  topCustomers: Named[];
  months: Named[];
  states: Named[];
}

export const REPORT_IDS = [
  'sales_register',
  'pending_orders',
  'thickness_wise',
  'dealer_wise',
  'top_customers',
  'state_wise',
  'product_wise',
  'monthly_trend',
  'intercompany',
  'dispatch_vs_sales',
  'credit_days',
  'customer_outstanding',
  'order_ageing',
  'customer_credit',
] as const;
export type ReportId = (typeof REPORT_IDS)[number];

export const REPORT_DEFS: { id: ReportId; label: string; description: string }[] = [
  { id: 'sales_register', label: 'Sales register', description: 'Every invoice line, newest first' },
  { id: 'pending_orders', label: 'Pending order report', description: 'Balance still to dispatch, by order, EDD, ship-to and product' },
  { id: 'thickness_wise', label: 'Thickness-wise sales', description: 'Sales grouped by board thickness' },
  { id: 'dealer_wise', label: 'Dealer-wise sales', description: 'Sales by ship-to party' },
  { id: 'top_customers', label: 'Top 10 customers', description: 'Highest invoice value by ship-to party' },
  { id: 'state_wise', label: 'State-wise sales', description: 'Sales by the ship-to party’s state' },
  { id: 'product_wise', label: 'Product-wise sales', description: 'Sales by grade' },
  { id: 'monthly_trend', label: 'Monthly trend', description: 'Month-by-month invoice count, GST and value' },
  { id: 'intercompany', label: 'Inter-company sales', description: 'LLP to OSB transfers' },
  { id: 'dispatch_vs_sales', label: 'Dispatch vs sales', description: 'Orders dispatched against invoices raised' },
  { id: 'credit_days', label: 'Credit days analysis', description: 'Customers with credit terms' },
  { id: 'customer_outstanding', label: 'Customer outstanding', description: 'Invoiced value by ship-to party' },
  { id: 'order_ageing', label: 'Order ageing', description: 'Pending orders by days since the SO date' },
  { id: 'customer_credit', label: 'Credit utilisation', description: 'Sales, invoiced value and credit-limit use by party' },
];

export type ReportCell = string | number | null;
export interface ReportColumn {
  key: string;
  label: string;
  kind?: 'text' | 'money' | 'qty' | 'sqm' | 'date' | 'pct';
}
export interface ReportTable {
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  totals?: Record<string, ReportCell>;
}
export interface PendingPivot {
  orders: { soId: string; soNo: string; edd: string | null; shipTo: string; pcs: number; amountPaise: number; lines: { itemName: string; pcs: number; amountPaise: number }[] }[];
  products: { itemName: string; pcs: number }[];
  pcs: number;
  amountPaise: number;
}
export interface ReportResult {
  id: ReportId;
  label: string;
  table: ReportTable | null;
  pivot?: PendingPivot;
  kpis?: { label: string; value: number; note: string }[];
}

export interface PartyLedger {
  customer: Customer;
  invoices: { id: string; invNo: string; date: string; firm: Firm; lines: { itemName: string; qtySqm: number }[]; totalPaise: number }[];
  totalPaise: number;
  count: number;
}

export interface DispatchRow {
  soId: string;
  soNo: string;
  firm: Firm;
  shipTo: string;
  state: string | null;
  city: string | null;
  dispatch: DispatchInfo;
  freightPaise: number;
}

export interface DispatchRegister {
  rows: DispatchRow[];
  total: number;
  kpis: { dispatches: number; freightPaise: number; vehicles: number; transporters: number };
  byVehicle: Named[];
  byTransporter: Named[];
}
