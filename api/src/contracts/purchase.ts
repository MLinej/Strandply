// Purchase module wire types, shared with the web app.
// Unlike the other contracts this file also holds two pure helpers (the entry calculation and the
// financial-year maths), so the web form previews exactly what the server will store.
// Files in src/contracts must not import anything outside this folder.
// Behaviour: docs/purchase-spec.md.

interface Audit {
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ── Materials ────────────────────────────────────────────────────────

export const MATERIAL_IDS = ['nilgiri', 'resin', 'kraft', 'firewood', 'core', 'face'] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];

export interface MaterialDef {
  id: MaterialId;
  label: string;
  /** Unit the quantities are counted in. */
  unit: 'Kg' | 'Pcs' | 'Sq Mtr';
  /** 'ton': quantities in kg, rate per ton (amount = qty × rate ÷ 1000). 'unit': rate per `unit`. */
  rateBasis: 'ton' | 'unit';
  /** Lot number prefix (legacy LOT_PREFIX). */
  lotPrefix: string;
  /** Extra fields on the entry form. */
  hasSpecies?: boolean;
  hasVeneerType?: boolean;
}

/** Legacy MATS. Nilgiri is priced per ton: the legacy data was, though its form said per kg (a bug). */
export const MATERIALS: readonly MaterialDef[] = [
  { id: 'nilgiri', label: 'Nilgiri Wood', unit: 'Kg', rateBasis: 'ton', lotPrefix: 'N', hasSpecies: true },
  { id: 'resin', label: 'Resin', unit: 'Kg', rateBasis: 'ton', lotPrefix: 'R' },
  { id: 'kraft', label: 'Kraft Paper', unit: 'Pcs', rateBasis: 'unit', lotPrefix: 'K' },
  { id: 'firewood', label: 'Fire Wood', unit: 'Kg', rateBasis: 'ton', lotPrefix: 'F' },
  { id: 'core', label: 'Core Veneer', unit: 'Pcs', rateBasis: 'unit', lotPrefix: 'C' },
  { id: 'face', label: 'Face Veneer', unit: 'Sq Mtr', rateBasis: 'unit', lotPrefix: 'V', hasVeneerType: true },
];
export const MATERIAL_BY_ID = Object.fromEntries(MATERIALS.map((m) => [m.id, m])) as Record<MaterialId, MaterialDef>;
export const rateUnitOf = (m: MaterialDef) => (m.rateBasis === 'ton' ? 'Ton' : m.unit);

export const TAX_TYPES = ['SG+CG', 'IGST', 'URD'] as const;
export type TaxType = (typeof TAX_TYPES)[number];
export const PURCHASE_GST_RATES = [0, 5, 12, 18, 28] as const;

// ── The entry calculation (legacy calcEntry / renderSlip) ────────────

export interface CalcInput {
  material: MaterialId;
  invQty: number;
  splQty: number;
  /** Paise per rate unit (per ton or per unit). */
  ratePaise: number;
  /** Paise per rate unit. > 0: the invoice rate is higher than agreed (rate debit note). < 0: rate credit note. */
  rateDiffPaise: number;
  /** Freight and other charges on the invoice, paise. */
  otherChargesPaise: number;
  taxType: TaxType;
  gstPct: number;
}

export interface TaxSplit {
  basic: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface NoteCalc extends TaxSplit {
  /** dn = debit note (we owe less), cn = credit note (we owe more). */
  type: 'dn' | 'cn';
  qty: number;
}

export interface EntryCalc {
  invoice: TaxSplit;
  /** Amounts at our (Strandply) weighbridge quantity. */
  spl: TaxSplit;
  /** splQty − invQty: positive when we received more than invoiced. */
  diffQty: number;
  /** Quantity note: reconciles the invoice to what was received (invoice ∓ note = SPL + other charges). */
  qtyNote: NoteCalc | null;
  /** Rate-difference note, on the SPL quantity. */
  rateNote: NoteCalc | null;
  /** What is owed: SPL total + other charges − rate DN + rate CN. All in paise. */
  payable: number;
}

/** GST on a basic amount, each component rounded to the paisa. */
export function taxOn(basic: number, taxType: TaxType, gstPct: number): TaxSplit {
  if (taxType === 'URD' || !gstPct) return { basic, cgst: 0, sgst: 0, igst: 0, total: basic };
  if (taxType === 'IGST') {
    const igst = Math.round((basic * gstPct) / 100);
    return { basic, cgst: 0, sgst: 0, igst, total: basic + igst };
  }
  const half = Math.round((basic * gstPct) / 200);
  return { basic, cgst: half, sgst: half, igst: 0, total: basic + half * 2 };
}

/** Basic amount in paise for a quantity at a rate (per ton or per unit). */
export function amountFor(material: MaterialId, qty: number, ratePaise: number): number {
  const divisor = MATERIAL_BY_ID[material].rateBasis === 'ton' ? 1000 : 1;
  return Math.round((qty * ratePaise) / divisor);
}

export function calcEntry(i: CalcInput): EntryCalc {
  const inv = taxOn(amountFor(i.material, i.invQty, i.ratePaise), i.taxType, i.gstPct);
  const invoice = { ...inv, total: inv.total + i.otherChargesPaise };
  const spl = taxOn(amountFor(i.material, i.splQty, i.ratePaise), i.taxType, i.gstPct);
  const diffQty = Math.round((i.splQty - i.invQty) * 1000) / 1000;
  const note = (type: 'dn' | 'cn', qty: number, rate: number): NoteCalc => ({
    type,
    qty,
    ...taxOn(amountFor(i.material, qty, rate), i.taxType, i.gstPct),
  });
  const qtyNote = diffQty === 0 ? null : note(diffQty < 0 ? 'dn' : 'cn', Math.abs(diffQty), i.ratePaise);
  const rateNote = i.rateDiffPaise === 0 || i.splQty === 0 ? null : note(i.rateDiffPaise > 0 ? 'dn' : 'cn', i.splQty, Math.abs(i.rateDiffPaise));
  const rateAdj = rateNote ? (rateNote.type === 'dn' ? -rateNote.total : rateNote.total) : 0;
  return { invoice, spl, diffQty, qtyNote, rateNote, payable: spl.total + i.otherChargesPaise + rateAdj };
}

// ── Financial years (Indian FY: 1 April – 31 March), labelled "2026-27" ──

export const fyLabel = (startYear: number) => `${startYear}-${String(startYear + 1).slice(-2)}`;
export const fyStartYear = (fy: string) => Number(fy.slice(0, 4));
/** FY of a YYYY-MM-DD date. */
export function fyOf(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return fyLabel(m >= 4 ? y : y - 1);
}
export const fyStart = (fy: string) => `${fyStartYear(fy)}-04-01`;
export const fyEnd = (fy: string) => `${fyStartYear(fy) + 1}-03-31`;
export const prevFy = (fy: string) => fyLabel(fyStartYear(fy) - 1);
export const isFy = (s: string) => /^\d{4}-\d{2}$/.test(s) && Number(s.slice(5)) === (fyStartYear(s) + 1) % 100;

// ── Masters: Nilgiri species and face veneer types ───────────────────

export const TYPE_KINDS = ['nilgiri_species', 'face_veneer'] as const;
export type TypeKind = (typeof TYPE_KINDS)[number];

export interface PurchaseType extends Audit {
  id: string;
  kind: TypeKind;
  name: string;
  sortOrder: number;
}

// ── Inward entries ───────────────────────────────────────────────────

/** draft: saved, not posted (left out of registers and stock). pending: posted, awaiting approval. approved. */
export const ENTRY_STATUSES = ['draft', 'pending', 'approved'] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

/** Legacy DN_STATUS_FLOW. */
export const NOTE_STATUSES = ['Pending', 'Under Review', 'Issued', 'Settled', 'Cancelled'] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

export interface VendorSnapshot {
  /** Vendors module id when picked from there; null for a typed-in name. */
  vendorId: string | null;
  vendorName: string;
  vendorCode: string | null;
  gstin: string | null;
  pan: string | null;
  city: string | null;
  state: string | null;
  mobile: string | null;
}

export interface PurchaseEntry extends Audit, VendorSnapshot {
  id: string;
  material: MaterialId;
  /** Inward date, YYYY-MM-DD. */
  date: string;
  /** e.g. N01; suggested per material and FY. */
  lotNo: string;
  poId: string | null;
  invoiceNo: string;
  invoiceDate: string | null;
  taxType: TaxType;
  gstPct: number;
  vehicleNo: string | null;
  driver: string | null;
  transporter: string | null;
  rstNo: string | null;
  mrnNo: string | null;
  grnNo: string | null;
  remarks: string | null;
  /** Vendors-module product (item) picked on the form, with its HSN at the time. */
  itemId: string | null;
  itemName: string | null;
  hsn: string | null;
  /** Nilgiri species / face veneer type (names from the type masters). */
  species: string | null;
  veneerType: string | null;
  /** Face veneer: the piece count of the Sq Mtr quantity, for reference only. */
  altQtyPcs: number | null;
  invQty: number;
  splQty: number;
  ratePaise: number;
  rateDiffPaise: number;
  otherChargesPaise: number;
  status: EntryStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  qtyNoteStatus: NoteStatus;
  rateNoteStatus: NoteStatus;
}

export interface PurchaseEntryView extends PurchaseEntry {
  calc: EntryCalc;
  poNo: string | null;
  approvedByName: string | null;
  createdByName: string | null;
  documentCount: number;
}

export type EntryInput = Omit<
  PurchaseEntry,
  keyof Audit | 'id' | 'status' | 'approvedBy' | 'approvedAt' | 'qtyNoteStatus' | 'rateNoteStatus' | 'lotNo'
> & { lotNo?: string | null };

export interface EntryFilters {
  material: MaterialId;
  status: EntryStatus;
  /** true: pending and approved only (no drafts). */
  posted: boolean;
  fy: string;
  /** YYYY-MM */
  month: string;
  poId: string;
  vendorId: string;
}

/** Register header tiles (legacy updateMatStats), for the filtered rows. */
export interface EntryStats {
  entries: number;
  splQty: number;
  splTotalPaise: number;
  payablePaise: number;
  /** Simple average of rates, paise. */
  avgRatePaise: number | null;
  notes: number;
  notesPaise: number;
}

// ── Debit / credit notes (derived from entries) ──────────────────────

export const NOTE_KINDS = ['qty', 'rate'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export interface NoteRow {
  /** `${entryId}:${kind}` */
  id: string;
  entryId: string;
  kind: NoteKind;
  type: 'dn' | 'cn';
  material: MaterialId;
  date: string;
  lotNo: string;
  vendorName: string;
  invoiceNo: string;
  invQty: number;
  splQty: number;
  qty: number;
  ratePaise: number;
  /** Rate notes: the difference per rate unit. */
  rateDiffPaise: number | null;
  note: TaxSplit;
  status: NoteStatus;
}

export interface NoteFilters {
  /** dn / cn: quantity notes; rd: rate-difference notes. */
  type: 'dn' | 'cn' | 'rd';
  material: MaterialId;
  status: NoteStatus;
  fy: string;
}

export interface NoteStats {
  debit: { count: number; paise: number };
  credit: { count: number; paise: number };
  rate: { count: number; paise: number };
  /** Debit − credit (quantity notes). */
  netPaise: number;
}

// ── Purchase orders ──────────────────────────────────────────────────

export interface PurchaseOrder extends Audit {
  id: string;
  /** Typed in (legacy "PO-002", "008/26-27"), or PO-YY-NNN when left blank. Unique. */
  poNo: string;
  date: string;
  material: MaterialId;
  vendorId: string | null;
  vendorName: string;
  qty: number;
  ratePaise: number;
  remarks: string | null;
  /** T&C clauses (Vendors T&C master) printed on the PO. */
  tncIds: string[];
  status: 'pending' | 'approved';
  approvedBy: string | null;
  approvedAt: string | null;
}

export type PoProgress = 'Open' | 'Partial' | 'Closed';

export interface PurchaseOrderView extends PurchaseOrder {
  valuePaise: number;
  /** SPL quantity of posted entries against the PO. */
  receivedQty: number;
  balanceQty: number;
  pctComplete: number;
  progress: PoProgress;
  approvedByName: string | null;
}

export interface PoInput {
  poNo?: string | null;
  date: string;
  material: MaterialId;
  vendorId?: string | null;
  vendorName: string;
  qty: number;
  ratePaise: number;
  remarks?: string | null;
  tncIds?: string[];
}

export interface PoFilters {
  material: MaterialId;
  progress: PoProgress;
  status: 'pending' | 'approved';
  fy: string;
}

export interface PoStats {
  total: number;
  valuePaise: number;
  open: number;
  partial: number;
  closed: number;
}

/** Entry form PO dropdown. */
export interface PoOption {
  id: string;
  poNo: string;
  vendorId: string | null;
  vendorName: string;
  ratePaise: number;
  balanceQty: number;
}

// ── Returns ──────────────────────────────────────────────────────────

export interface PurchaseReturn extends Audit {
  id: string;
  /** RET-YY-NNN */
  returnNo: string;
  date: string;
  material: MaterialId;
  species: string | null;
  entryId: string | null;
  vendorName: string;
  originalInvoiceNo: string | null;
  qty: number;
  ratePaise: number;
  taxType: TaxType;
  gstPct: number;
  reason: string | null;
  status: 'pending' | 'approved';
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface PurchaseReturnView extends PurchaseReturn {
  amount: TaxSplit;
  approvedByName: string | null;
}

export interface ReturnInput {
  date: string;
  material: MaterialId;
  species?: string | null;
  entryId?: string | null;
  vendorName?: string | null;
  originalInvoiceNo?: string | null;
  qty: number;
  ratePaise: number;
  taxType?: TaxType;
  gstPct?: number;
  reason?: string | null;
}

// ── Inventory ────────────────────────────────────────────────────────

/** One opening line: a material, or for Nilgiri one line per species (as in the ledger). */
export interface OpeningItem {
  material: MaterialId;
  species: string | null;
  qty: number;
  ratePaise: number;
  remarks: string | null;
}

export interface OpeningStock extends Audit {
  fy: string;
  asOnDate: string;
  items: OpeningItem[];
  status: 'draft' | 'pending' | 'approved';
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface OpeningStockView {
  fy: string;
  asOnDate: string;
  /** Saved for this FY, or carried forward from last FY's closing (not saved yet). */
  source: 'saved' | 'carried' | 'blank';
  status: OpeningStock['status'] | null;
  approvedByName: string | null;
  approvedAt: string | null;
  items: (OpeningItem & { valuePaise: number })[];
  totalPaise: number;
}

export interface OpeningStockInput {
  asOnDate: string;
  items: OpeningItem[];
  /** draft: save only. submit: save and ask for approval. */
  mode: 'draft' | 'submit';
}

/** One ledger row: a material, or a Nilgiri species. Quantities in the material's unit, values in paise at basic (GST excluded). */
export interface LedgerRow {
  /** `nilgiri::Eucalyptus` or a material id. */
  key: string;
  material: MaterialId;
  species: string | null;
  openQty: number;
  openPaise: number;
  purchQty: number;
  purchPaise: number;
  returnQty: number;
  returnPaise: number;
  consumeQty: number;
  consumePaise: number;
  closingQty: number;
  closingPaise: number;
  /** Paise per rate unit (per ton or per unit). */
  avgRatePaise: number | null;
  entries: number;
}

export interface AgeBucket {
  label: string;
  qty: number;
  paise: number;
}

export interface InventoryView {
  fy: string;
  opening: OpeningStockView;
  rows: LedgerRow[];
  /** Closing stock age by material (FIFO over the FY's receipts). */
  ageing: { material: MaterialId; buckets: AgeBucket[] }[];
}

export interface ConsumptionInput {
  key: string;
  qty: number;
}

// ── Dashboard and reports ────────────────────────────────────────────

export interface LabelValue {
  label: string;
  value: number;
}

export interface MaterialSummary {
  material: MaterialId;
  entries: number;
  invQty: number;
  splQty: number;
  avgRatePaise: number | null;
  basicSplPaise: number;
  totalSplPaise: number;
  notes: number;
}

export interface PurchaseDashboard {
  fy: string;
  month: string | null;
  kpis: {
    totalSplPaise: number;
    entries: number;
    splQty: number;
    vendors: number;
    pendingDebitNotes: { count: number; paise: number };
    pendingCreditNotes: { count: number; paise: number };
    pendingApproval: number;
    inventoryPaise: number;
    todayInward: { count: number; paise: number };
  };
  /** Month (YYYY-MM) → SPL total, paise. */
  monthly: LabelValue[];
  topVendors: LabelValue[];
  byMaterial: MaterialSummary[];
  /** Vehicle → SPL qty. */
  topVehicles: LabelValue[];
  recent: PurchaseEntryView[];
}

export interface DayRow {
  date: string;
  material: MaterialId;
  entries: number;
  invQty: number;
  splQty: number;
  avgRatePaise: number;
  basicInvPaise: number;
  basicSplPaise: number;
  totalSplPaise: number;
}

export interface VendorPerformance {
  vendorName: string;
  entries: number;
  totalSplPaise: number;
  invQty: number;
  splQty: number;
  /** Σ|SPL − invoice| ÷ Σ invoice, as a percentage. */
  qtyVariancePct: number;
  rateNotes: number;
}

export interface RateVarianceRow {
  entryId: string;
  date: string;
  material: MaterialId;
  vendorName: string;
  invoiceNo: string;
  invoiceRatePaise: number;
  agreedRatePaise: number;
  diffPaise: number;
  impactPaise: number;
}

export interface PurchaseReports {
  fy: string;
  month: string | null;
  material: MaterialId | null;
  /** Every posted entry in range, oldest first (day-wise detail). */
  daywise: PurchaseEntryView[];
  /** Grouped by date × material. */
  productDay: DayRow[];
  byMaterial: MaterialSummary[];
  monthly: { month: string; totalSplPaise: number; avgRatePaise: number }[];
  vendors: VendorPerformance[];
  rateVariance: RateVarianceRow[];
  /** Nilgiri: purchased vs consumed (from the stock ledger) this FY. */
  nilgiriYield: { purchasedQty: number; consumedQty: number; consumedPct: number | null; byspecies: { species: string; purchasedQty: number; consumedQty: number }[] };
  /** Materials: consumed vs purchased this FY. */
  consumption: { material: MaterialId; purchasedQty: number; consumedQty: number }[];
}

// ── Documents ────────────────────────────────────────────────────────

export const DOCUMENT_TYPES = ['Invoice', 'Weighment Slip', 'GRN/MRN', 'Debit Note', 'Credit Note', 'Photo', 'Transport Doc', 'Other'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface PurchaseDocument extends Audit {
  id: string;
  name: string;
  type: DocumentType;
  mime: string;
  sizeBytes: number;
  /** Key in the blob store. */
  blobKey: string;
  entryId: string | null;
}

export interface PurchaseDocumentView extends PurchaseDocument {
  entryLabel: string | null;
  uploadedByName: string | null;
}

export interface DocumentFilters {
  type: DocumentType;
  entryId: string;
}

// ── Vendor picker (entry and PO forms) ───────────────────────────────

export interface PurchaseVendorOption {
  id: string;
  code: string;
  name: string;
  status: string;
  gstin: string | null;
  pan: string | null;
  city: string | null;
  state: string | null;
  mobile: string | null;
  /** SG+CG inside Gujarat, IGST elsewhere (legacy fillVendorFromPortal). */
  suggestedTaxType: TaxType;
  paymentTerms: string | null;
  items: { id: string; name: string; hsn: string | null; gstRate: number | null; categoryName: string }[];
}

export interface PurchaseMeta {
  materials: readonly MaterialDef[];
  currentFy: string;
  /** Newest first, from the earliest FY with data to next FY. */
  fys: string[];
  types: PurchaseType[];
}
