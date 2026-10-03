// CRM module contracts (legacy Marketing & Sales CRM: legacy/crm/index.html). Shared by the API and the web app.
// Money is integer paise.

export const CUSTOMER_TYPES = ['Dealer', 'Distributor', 'Architect', 'Contractor', 'Builder', 'Furniture Manufacturer', 'Plywood/Hardware Dealer', 'Project Customer', 'Other'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export const LEAD_STAGES = ['New Lead', 'Contacted', 'Qualified', 'Product Discussion', 'Sample Required', 'Sample Sent', 'Follow-Up', 'Quotation', 'Negotiation', 'Order Won', 'Order Lost'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
/** Stages that count as qualified (legacy dashboard / source performance). */
export const QUALIFIED_STAGES: readonly LeadStage[] = ['Qualified', 'Product Discussion', 'Sample Required', 'Sample Sent', 'Follow-Up', 'Quotation', 'Negotiation', 'Order Won'];
export const FOLLOWUP_TYPES = ['Call', 'WhatsApp', 'Email', 'Meeting', 'Site Visit', 'Sample Discussion', 'Quotation Discussion', 'Payment Discussion', 'Other'] as const;
export type FollowupType = (typeof FOLLOWUP_TYPES)[number];
export const FOLLOWUP_STATUSES = ['Pending', 'Completed', 'Rescheduled', 'Customer Not Reachable', 'Customer Requested Later', 'Converted', 'Lost'] as const;
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];
/** Follow-ups still to be done (legacy followupBuckets). */
export const OPEN_FOLLOWUP: readonly FollowupStatus[] = ['Pending', 'Rescheduled'];
export const OPP_STAGES = ['Qualification', 'Product Discussion', 'Sample', 'Quotation', 'Negotiation', 'Order Won', 'Order Lost'] as const;
export type OppStage = (typeof OPP_STAGES)[number];
export const isOpenOpp = (s: OppStage) => s !== 'Order Won' && s !== 'Order Lost';
export const QUOTE_STATUSES = ['Draft', 'Sent', 'Under Discussion', 'Negotiation', 'Accepted', 'Rejected', 'Expired'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const TASK_TYPES = ['Call Customer', 'Send Quotation', 'Send Sample', 'Send Catalogue', 'Site Visit', 'Meeting', 'Price Follow-Up', 'Payment Follow-Up', 'Dealer Visit', 'Architect Visit', 'Contractor Visit', 'Other'] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export const TASK_STATUSES = ['Pending', 'In Progress', 'Completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const PRIORITIES = ['Hot', 'Warm', 'Cold'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const CUSTOMER_STATUSES = ['Active', 'Inactive', 'Archived'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const DEFAULT_SOURCES = ['Website', 'Google', 'Facebook', 'Instagram', 'WhatsApp', 'IndiaMART', 'TradeIndia', 'Exhibition', 'Dealer Reference', 'Customer Reference', 'Architect Reference', 'Contractor Reference', 'Existing Customer', 'Outbound Calling', 'Salesperson Visit', 'Email Campaign', 'Digital Advertisement', 'Other'];
export const DEFAULT_LOST_REASONS = ['Price Too High', 'Competitor Lower Price', 'Customer Selected Competitor', 'Product Specification Issue', 'Quality Concern', 'Delivery Time', 'Stock Not Available', 'Credit Terms', 'Payment Terms', 'Customer Project Cancelled', 'Customer Requirement Changed', 'Sample Rejected', 'No Response', 'Competitor Relationship', 'Customer Not Genuine', 'Internal Delay', 'Wrong Lead', 'Product Not Suitable', 'Quantity Too Small', 'Other'];

/** Days with no contact before a customer counts as dormant (legacy: 30). */
export const DORMANT_DAYS = 30;
/** A sent quotation with no answer for this many days is flagged (legacy: 15). */
export const STALE_QUOTE_DAYS = 15;
/** An open opportunity above this value with no follow-up for 14 days is flagged (legacy: ₹2,00,000). */
export const HIGH_VALUE_PAISE = 20_000_000;
export const QUIET_DAYS = 14;

interface Audit {
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Raw lead / lead in the pipeline. */
export interface Lead extends Audit {
  id: string;
  dateAdded: string;
  companyName: string;
  contactPerson: string | null;
  contactPerson2: string | null;
  mobile: string;
  mobile2: string | null;
  altMobile: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  address: string | null;
  customerType: CustomerType | null;
  product: string | null;
  source: string | null;
  campaign: string | null;
  salesperson: string | null;
  stage: LeadStage;
  nextAction: string | null;
  nextFollowUpDate: string | null;
  remarks: string | null;
  /** 'Good' when keyed in, 'Imported' from a sheet. */
  dataQuality: 'Good' | 'Imported';
  /** The CRM customer it was converted into. */
  customerId: string | null;
}

export interface LeadFilters {
  stage: LeadStage;
  salesperson: string;
  customerType: CustomerType;
  product: string;
  source: string;
  converted: boolean;
}

/** CRM customer profile (legacy Customer / Party Master): prospects and buyers, with business and relationship details. */
export interface CrmCustomer extends Audit {
  id: string;
  companyName: string;
  contactPerson: string | null;
  contactPerson2: string | null;
  designation: string | null;
  mobile: string;
  mobile2: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  address: string | null;
  gstin: string | null;
  pan: string | null;
  customerType: CustomerType | null;
  // Business
  estMonthlyReq: string | null;
  productsUsed: string | null;
  currentSupplier: string | null;
  approxPurchaseValue: string | null;
  preferredThickness: string | null;
  preferredSize: string | null;
  application: string | null;
  existingBrand: string | null;
  competitorBrand: string | null;
  paymentPreference: string | null;
  creditRequirement: string | null;
  territory: string | null;
  // Relationship
  leadSource: string | null;
  salesperson: string | null;
  status: CustomerStatus;
  priority: Priority;
  firstContactDate: string | null;
  lastContactDate: string | null;
  nextFollowUp: string | null;
  remarks: string | null;
  leadId: string | null;
  /** The Sales party master record, once they buy (their Sales orders and invoices show on the 360 view). */
  salesCustomerId: string | null;
}

export interface CrmCustomerFilters {
  customerType: CustomerType;
  priority: Priority;
  status: CustomerStatus;
  salesperson: string;
  city: string;
}

export interface Followup extends Audit {
  id: string;
  customerId: string;
  date: string;
  time: string | null;
  type: FollowupType;
  contactPerson: string | null;
  salesperson: string | null;
  discussion: string | null;
  customerResponse: string | null;
  nextAction: string | null;
  nextFollowUpDate: string | null;
  status: FollowupStatus;
  priority: Priority;
}

export interface FollowupView extends Followup {
  customerName: string;
  city: string | null;
  mobile: string | null;
  whatsapp: string | null;
  /** When it's due: the next follow-up date, else its own date. */
  due: string;
}

export interface FollowupFilters {
  customerId: string;
  from: string;
  to: string;
  city: string;
  salesperson: string;
  type: FollowupType;
  status: FollowupStatus;
}

export interface Opportunity extends Audit {
  id: string;
  customerId: string;
  product: string;
  thickness: string | null;
  size: string | null;
  quantity: string | null;
  estValuePaise: number;
  expectedClosingDate: string | null;
  salesperson: string | null;
  stage: OppStage;
  probability: number;
  competitor: string | null;
  currentSupplier: string | null;
  notes: string | null;
  /** The lost order it was reactivated from. */
  reactivatedFrom: string | null;
}

export interface Quotation extends Audit {
  id: string;
  quoteNo: string;
  customerId: string;
  opportunityId: string | null;
  product: string;
  quantity: number;
  /** Per unit. */
  ratePaise: number;
  gstPct: number;
  date: string;
  validUntil: string | null;
  salesperson: string | null;
  status: QuoteStatus;
  remarks: string | null;
}

export const quoteTotals = (q: Pick<Quotation, 'quantity' | 'ratePaise' | 'gstPct'>) => {
  const totalPaise = Math.round(q.quantity * q.ratePaise);
  const gstPaise = Math.round((totalPaise * q.gstPct) / 100);
  return { totalPaise, gstPaise, finalPaise: totalPaise + gstPaise };
};

export interface OrderWon extends Audit {
  id: string;
  orderNo: string;
  opportunityId: string | null;
  customerId: string;
  orderDate: string;
  product: string;
  quantity: string | null;
  ratePaise: number;
  orderValuePaise: number;
  dispatchDate: string | null;
  reason: string | null;
  remarks: string | null;
  salesperson: string | null;
  source: string | null;
  /** Days from the customer's first contact to the order. */
  leadToOrderDays: number | null;
}

export interface OrderLost extends Audit {
  id: string;
  opportunityId: string | null;
  customerId: string;
  lostDate: string;
  product: string;
  quantity: string | null;
  estValuePaise: number;
  competitor: string | null;
  competitorPricePaise: number | null;
  ourPricePaise: number | null;
  expectedPricePaise: number | null;
  lostReason: string;
  remarks: string | null;
  reactivationDate: string | null;
  salesperson: string | null;
  /** The opportunity made when it was reactivated. */
  reactivatedOppId: string | null;
}

export interface CrmTask extends Audit {
  id: string;
  type: TaskType;
  customerId: string | null;
  assignedTo: string | null;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
  remarks: string | null;
}

export interface Campaign extends Audit {
  id: string;
  name: string;
  platform: string | null;
  startDate: string | null;
  endDate: string | null;
  budgetPaise: number;
  targetAudience: string | null;
  product: string | null;
}

export interface CrmProduct extends Audit {
  id: string;
  name: string;
  thickness: string | null;
  size: string | null;
  grade: string | null;
  application: string | null;
  ratePaise: number;
  moq: string | null;
  active: boolean;
}

export interface Salesperson extends Audit {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  territory: string | null;
  designation: string | null;
  active: boolean;
}

// ── Views ───────────────────────────────────────────────────────────

/** Records show their customer's name and city. */
export interface WithCustomer {
  customerName: string;
  city: string | null;
}
export type OpportunityView = Opportunity & WithCustomer;
export type QuotationView = Quotation & WithCustomer & ReturnType<typeof quoteTotals> & { opportunity: string | null };
export type OrderWonView = OrderWon & WithCustomer;
export type OrderLostView = OrderLost & WithCustomer;
export type TaskView = CrmTask & { customerName: string | null; overdue: boolean };
export type CampaignView = Campaign & { leads: number; costPerLeadPaise: number | null };
export type SalespersonView = Salesperson & { leads: number; overdue: number; pipelinePaise: number; wonPaise: number; won: number; lost: number };

export interface CustomerSales {
  orders: number;
  invoices: number;
  invoicedPaise: number;
  lastInvoice: string | null;
}

export interface Customer360 {
  customer: CrmCustomer;
  salesParty: { id: string; name: string } | null;
  opportunities: OpportunityView[];
  followups: FollowupView[];
  quotations: QuotationView[];
  won: OrderWonView[];
  lost: OrderLostView[];
  tasks: TaskView[];
  /** From the linked Sales party, when there is one. */
  sales: CustomerSales | null;
  timeline: { date: string; kind: string; text: string }[];
}

export interface Named {
  name: string;
  value: number;
}

export interface CrmAlert {
  tone: 'red' | 'amber' | 'green';
  text: string;
  /** Page slug to open. */
  page: string;
}

export interface CrmDashboard {
  leads: number;
  qualified: number;
  openOpps: number;
  pipelinePaise: number;
  dueToday: number;
  overdue: number;
  won: number;
  wonPaise: number;
  lost: number;
  lostPaise: number;
  customers: number;
  quotesSent: number;
  quotes: number;
  alerts: CrmAlert[];
  funnel: Named[];
  sources: Named[];
  lostReasons: Named[];
  overdueList: FollowupView[];
}

export interface FollowupBoard {
  overdue: FollowupView[];
  today: FollowupView[];
  tomorrow: FollowupView[];
  upcoming: FollowupView[];
}

export interface SourceRow {
  source: string;
  leads: number;
  qualified: number;
  quotations: number;
  won: number;
  lost: number;
  revenuePaise: number;
}

export interface CrmReports {
  products: Named[];
  cities: Named[];
  salespeople: { name: string; won: number; lost: number; wonPaise: number }[];
  ageing: Named[];
  competitors: Named[];
  dormant: { id: string; name: string; salesperson: string | null; days: number }[];
  followupTypes: Named[];
  followupTrend: Named[];
  sources: SourceRow[];
}

export interface CrmMeta {
  sources: string[];
  lostReasons: string[];
  products: string[];
  salespersons: string[];
  campaigns: string[];
  customers: { id: string; name: string; city: string | null; salesperson: string | null; priority: Priority; contactPerson: string | null }[];
  today: string;
}

/** A row of a lead import sheet after mapping, with what it may duplicate. */
export interface LeadImportRow {
  row: number;
  companyName: string;
  contactPerson: string | null;
  mobile: string;
  email: string | null;
  city: string | null;
  state: string | null;
  customerType: CustomerType | null;
  product: string | null;
  source: string | null;
  salesperson: string | null;
  remarks: string | null;
  duplicates: string[];
  error: string | null;
}

export interface LeadImportResult {
  total: number;
  valid: number;
  duplicates: number;
  rows: LeadImportRow[];
  imported: number;
}

/** Possible duplicates of a lead: same mobile, same company + city, or same email (legacy findDuplicateLeadOrCustomer). */
export function duplicateHits(
  rec: { companyName?: string | null; mobile?: string | null; email?: string | null; city?: string | null },
  leads: Pick<Lead, 'id' | 'companyName' | 'mobile' | 'email' | 'city'>[],
  customers: Pick<CrmCustomer, 'id' | 'companyName' | 'mobile' | 'city'>[],
  exceptLeadId?: string,
): string[] {
  const n = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
  const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').slice(-10);
  const hits: string[] = [];
  for (const l of leads) {
    if (l.id === exceptLeadId) continue;
    if (rec.mobile && digits(l.mobile) && digits(l.mobile) === digits(rec.mobile)) hits.push(`Lead with the same mobile: ${l.companyName}`);
    else if (rec.companyName && rec.city && n(l.companyName) === n(rec.companyName) && n(l.city) === n(rec.city)) hits.push(`Lead with the same name and city: ${l.companyName}`);
    else if (rec.email && n(l.email) && n(l.email) === n(rec.email)) hits.push(`Lead with the same email: ${l.companyName}`);
  }
  for (const c of customers) {
    if (rec.mobile && digits(c.mobile) && digits(c.mobile) === digits(rec.mobile)) hits.push(`Customer with the same mobile: ${c.companyName}`);
    else if (rec.companyName && rec.city && n(c.companyName) === n(rec.companyName) && n(c.city) === n(rec.city)) hits.push(`Customer with the same name and city: ${c.companyName}`);
  }
  return hits;
}

/** Days from a to b (YYYY-MM-DD). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Open-lead ageing buckets (legacy Lead Ageing chart). */
export const AGEING_BUCKETS: [string, number][] = [
  ['0–7 days', 7],
  ['8–15 days', 15],
  ['16–30 days', 30],
  ['31–60 days', 60],
  ['61–90 days', 90],
  ['90+ days', Infinity],
];
