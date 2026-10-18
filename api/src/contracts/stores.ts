// Stores module (legacy "Stores — MRN & GRN"): gate entry by Security (MRN), receiving by Stores (GRN),
// the GRN review → approval flow, and the accounting audit trail. See docs/stores-spec.md.
import type { ListResult } from './common';

/** Materials Security can log at the gate. Ids match Purchase materials, plus "other". */
export const STORE_MATERIALS = [
  { id: 'nilgiri', label: 'Nilgiri Wood' },
  { id: 'resin', label: 'Resin' },
  { id: 'kraft', label: 'Kraft Paper' },
  { id: 'firewood', label: 'Fire Wood' },
  { id: 'core', label: 'Core Veneer' },
  { id: 'face', label: 'Face Veneer' },
  { id: 'other', label: 'Other' },
] as const;
export type StoreMaterial = (typeof STORE_MATERIALS)[number]['id'];
export const STORE_MATERIAL_IDS = STORE_MATERIALS.map((m) => m.id) as [StoreMaterial, ...StoreMaterial[]];
export const storeMaterialLabel = (id: string) => STORE_MATERIALS.find((m) => m.id === id)?.label ?? id;

/** A line's name: the product picked from the product master, or (older lines) its material. */
export const storeItemLabel = (it: { material: string; itemName?: string | null }) => it.itemName || storeMaterialLabel(it.material);

/**
 * The material group a product belongs to, from its name and category (so gate and receiving reports by
 * material still work once lines name products). Anything unrecognised is "other".
 */
export function materialForProduct(name: string, categoryName = ''): StoreMaterial {
  const t = `${name} ${categoryName}`.toLowerCase();
  if (/nilgiri|eucalyptus|log|strand/.test(t)) return 'nilgiri';
  if (/resin|mdi|adhesive|glue/.test(t)) return 'resin';
  if (/kraft/.test(t)) return 'kraft';
  if (/fire\s?wood|fuel wood/.test(t)) return 'firewood';
  if (/face/.test(t) && /veneer/.test(t)) return 'face';
  if (/core/.test(t) && /veneer/.test(t)) return 'core';
  return 'other';
}

/** Product master row for the gate and receiving forms. */
export interface StoreProductOption {
  id: string;
  name: string;
  unit: string;
  categoryName: string;
}

export const STORE_UNITS = ['Kg', 'MT', 'Nos', 'Sheets', 'Bundle', 'Litre', 'Roll'] as const;
export type StoreUnit = (typeof STORE_UNITS)[number];

/** Per-item receiving quality. Listed worst first (legacy grnItemsWorstQuality priority). */
export const QUALITY_STATUSES = [
  { id: 'damaged', label: 'Damaged / Rejected' },
  { id: 'short', label: 'Short received' },
  { id: 'partial', label: 'Partial, balance pending' },
  { id: 'excess', label: 'Excess received' },
  { id: 'ok', label: 'OK, matches MRN' },
] as const;
export type QualityStatus = (typeof QUALITY_STATUSES)[number]['id'];
export const QUALITY_IDS = QUALITY_STATUSES.map((q) => q.id) as [QualityStatus, ...QualityStatus[]];
export const qualityLabel = (id: string) => QUALITY_STATUSES.find((q) => q.id === id)?.label ?? id;

/** The worst quality across items, or null for none. */
export function worstQuality(items: { quality: QualityStatus }[]): QualityStatus | null {
  let worst: QualityStatus | null = null;
  for (const it of items) if (worst === null || QUALITY_IDS.indexOf(it.quality) < QUALITY_IDS.indexOf(worst)) worst = it.quality;
  return worst;
}

/** Condition of a line as seen at the gate. */
export const GATE_CONDITIONS = ['Sealed', 'Good', 'Damaged', 'Leaking', 'Wet'] as const;
export type GateCondition = (typeof GATE_CONDITIONS)[number];

/** A GRN line's QC result from its rejected quantity. */
export const qcOf = (it: { actualQty: number; rejectedQty?: number }): 'Passed' | 'Partly rejected' | 'Rejected' =>
  !it.rejectedQty ? 'Passed' : it.rejectedQty >= it.actualQty ? 'Rejected' : 'Partly rejected';

export const MRN_STATUSES = ['pending_grn', 'grn_created'] as const;
export type MrnStatus = (typeof MRN_STATUSES)[number];
export const GRN_STATUSES = ['draft', 'reviewed', 'approved'] as const;
export type GrnStatus = (typeof GRN_STATUSES)[number];

export interface MrnItem {
  id: string;
  /** Product master (Vendors → products) line; null on lines saved before products were picked. */
  itemId: string | null;
  itemName: string | null;
  /** From the product (materialForProduct), or picked on older lines. */
  material: StoreMaterial;
  /** Counted at the gate. */
  approxQty: number;
  /** As per the challan / invoice, when it says. */
  challanQty: number | null;
  unit: StoreUnit;
  packages: string | null;
  condition: GateCondition | null;
  remarks: string | null;
}

/** Material Receipt Note: what Security logs when a truck reaches the gate. */
export interface Mrn {
  id: string;
  /** MRN/26-27/0001, numbered per FY of the gate date. */
  mrnNo: string;
  fy: string;
  date: string;
  /** HH:MM, India time. */
  time: string;
  vehicleNo: string;
  securityName: string;
  driverName: string | null;
  driverPhone: string | null;
  /** Set when picked from the vendor directory; null for a typed-in name. */
  vendorId: string | null;
  vendorName: string;
  /** Invoice / challan number, if the driver has it at the gate. */
  invoiceNo: string | null;
  challanDate: string | null;
  /** Purchase order the delivery is against (typed, as on the challan). */
  poNo: string | null;
  /** HH:MM the vehicle left the gate. */
  timeOut: string | null;
  transporter: string | null;
  lrNo: string | null;
  ewayBill: string | null;
  remarks: string | null;
  items: MrnItem[];
  status: MrnStatus;
  grnId: string | null;
  grnNo: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface GrnItem {
  id: string;
  /** The MRN line it receives; null for an unlisted / extra item found on unloading. */
  mrnItemId: string | null;
  itemId: string | null;
  itemName: string | null;
  material: StoreMaterial;
  /** From the MRN (0 for unlisted items). */
  approxQty: number;
  actualQty: number;
  /** Of actualQty, rejected at QC (accepted = actual − rejected). */
  rejectedQty: number;
  unit: StoreUnit;
  quality: QualityStatus;
  qualityRemarks: string | null;
}

/** Goods Receipt Note: what Stores actually received against an MRN. */
export interface Grn {
  id: string;
  grnNo: string;
  fy: string;
  date: string;
  time: string;
  mrnId: string;
  mrnNo: string;
  vehicleNo: string;
  vendorName: string;
  invoiceNo: string;
  /** The Purchase entry with this invoice number, found when the GRN was saved. */
  purchaseEntryId: string | null;
  items: GrnItem[];
  /** Store / location it went into, e.g. "Main Stores · Maintenance spares". */
  location: string | null;
  receivedByName: string;
  remarks: string | null;
  status: GrnStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  accounted: boolean;
  voucherNo: string | null;
  accountedBy: string | null;
  accountedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MrnView extends Mrn {
  createdByName: string | null;
  /** Whole days since the gate date (only meaningful while pending GRN). */
  daysPending: number;
}

export interface GrnView extends Grn {
  worstQuality: QualityStatus | null;
  reviewedByName: string | null;
  approvedByName: string | null;
  accountedByName: string | null;
  createdByName: string | null;
  /** Lot and material of the linked Purchase entry. */
  purchaseEntry: InvoiceMatch | null;
}

export interface MrnFilters {
  material: StoreMaterial;
  status: MrnStatus;
  from: string;
  to: string;
  fy: string;
}
export interface GrnFilters {
  status: GrnStatus;
  fy: string;
  /** Approved GRNs only, by accounting state. */
  accounted: boolean;
}

/** A Purchase entry whose invoice number matches. */
export interface InvoiceMatch {
  entryId: string;
  lotNo: string;
  material: string;
  vendorName: string;
  date: string;
}

export interface StoresSettings {
  /** Stamp the MRN date and time from the server clock instead of letting Security type them. */
  autoPunchMrn: boolean;
  autoPunchGrn: boolean;
}

export interface StoresMeta {
  materials: typeof STORE_MATERIALS;
  units: typeof STORE_UNITS;
  qualities: typeof QUALITY_STATUSES;
  currentFy: string;
  fys: string[];
  settings: StoresSettings;
  nextMrnNo: string;
  nextGrnNo: string;
  today: string;
  now: string;
}

/** Stores vendor picker (vendor directory, blacklisted left out). */
export interface StoresVendorOption {
  id: string;
  code: string;
  name: string;
  city: string | null;
}

export interface StoresDashboard {
  kpis: {
    mrnToday: number;
    pendingGrn: number;
    grnToday: number;
    awaitingReview: number;
    awaitingApproval: number;
    pendingAccounting: number;
  };
  recentMrns: MrnView[];
  /** Oldest MRNs still waiting for a GRN, up to 10. */
  ageing: MrnView[];
}

/** MRN-prepared-but-GRN-pending report: one row per MRN item. */
export interface PendingReportRow {
  mrnId: string;
  mrnNo: string;
  date: string;
  time: string;
  vendorName: string;
  vehicleNo: string;
  securityName: string;
  material: StoreMaterial;
  itemName: string | null;
  approxQty: number;
  unit: StoreUnit;
  daysPending: number;
}
export interface PendingReport {
  rows: PendingReportRow[];
  kpis: { items: number; mrns: number; oldestDays: number; avgDays: number };
}

export interface AccountingReport {
  rows: GrnView[];
  kpis: { accounted: number; pending: number; pct: number; awaitingApproval: number };
}

export type MrnListResult = ListResult<MrnView>;
export type GrnListResult = ListResult<GrnView>;
