// Vendors module wire types, shared with the web app (import type only).
// Files in src/contracts must not import anything outside this folder.
// Behaviour: docs/vendors-spec.md.

interface Audit {
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ── Enumerations (legacy Vendor Portal lists) ────────────────────────

/** pending → approved → active. Any of the first four → blacklisted. blacklisted → approved (reinstate). inactive → pending (submit). */
export const VENDOR_STATUSES = ['pending', 'approved', 'active', 'inactive', 'blacklisted'] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export const VENDOR_TYPES = ['Manufacturer', 'Trader', 'Distributor', 'Transporter', 'Service Provider', 'Sub-contractor'] as const;
export type VendorType = (typeof VENDOR_TYPES)[number];

export const PAYMENT_TERMS = ['Advance', 'Against Delivery', '15 Days', '30 Days', '45 Days', '60 Days'] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];

export const PRODUCT_UNITS = [
  'MT', 'KG', 'Gram', 'Litre', 'ML', 'Drum', 'Can', 'Bag', 'Nos', 'Pcs', 'Sheets', 'Roll',
  'Bundle', 'Box', 'Trip', 'Visit', 'Job', 'Metres', 'Sq.Ft',
] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const GST_RATES = [0, 5, 12, 18, 28] as const;
export type GstRate = (typeof GST_RATES)[number];

/** Category colour themes (legacy c1…c12). The web maps each to a pill style. */
export const CATEGORY_COLORS = ['yellow', 'indigo', 'pink', 'blue', 'green', 'purple', 'grey', 'orange', 'red', 'teal', 'amber', 'lime'] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export const MASTER_STATUSES = ['active', 'inactive'] as const;
export type MasterStatus = (typeof MASTER_STATUSES)[number];

export const TNC_CATEGORIES = ['Payment', 'Delivery', 'Quality', 'Legal', 'Warranty', 'General'] as const;
export type TncCategory = (typeof TNC_CATEGORIES)[number];

export const TNC_APPLIES = ['all', 'po', 'vendor', 'quote'] as const;
export type TncApplies = (typeof TNC_APPLIES)[number];

// ── Categories (vn_categories) ───────────────────────────────────────

export interface VendorCategory extends Audit {
  id: string;
  name: string;
  /** One emoji. */
  icon: string | null;
  color: CategoryColor;
  description: string | null;
  /** Lower first. Ties sort by name. */
  sortOrder: number;
  status: MasterStatus;
  notes: string | null;
}

export interface VendorCategoryView extends VendorCategory {
  productCount: number;
  vendorCount: number;
  /** Up to three product names, for the "products per category" table. */
  sampleProducts: string[];
}

export interface VendorCategoryInput {
  name: string;
  icon?: string | null;
  color?: CategoryColor;
  description?: string | null;
  sortOrder?: number;
  status?: MasterStatus;
  notes?: string | null;
}

// ── Products (vn_products) ───────────────────────────────────────────

export interface VendorProduct extends Audit {
  id: string;
  /** SPL-P-YY-NNN, assigned on create. */
  code: string;
  name: string;
  categoryId: string;
  unit: ProductUnit;
  altUnit: string | null;
  /** 1 unit = convFactor altUnit. */
  convFactor: number | null;
  hsn: string | null;
  gstRate: GstRate | null;
  moq: number | null;
  leadTimeDays: number | null;
  description: string | null;
  notes: string | null;
}

export interface VendorProductView extends VendorProduct {
  categoryName: string;
  /** Live vendors that supply it. */
  vendorCount: number;
}

export interface VendorProductInput {
  name: string;
  categoryId: string;
  unit: ProductUnit;
  altUnit?: string | null;
  convFactor?: number | null;
  hsn?: string | null;
  gstRate?: GstRate | null;
  moq?: number | null;
  leadTimeDays?: number | null;
  description?: string | null;
  notes?: string | null;
}

export interface VendorProductFilters {
  categoryId: string;
}

export interface VendorProductSummary {
  total: number;
  categories: number;
  /** Products at least one live vendor supplies. */
  withVendors: number;
}

// ── Vendors (vn_vendors + vn_vendor_categories + vn_vendor_products) ─

export interface Vendor extends Audit {
  id: string;
  /** SPL-VEN-YY-NNN unless one was typed in. Unique. */
  code: string;
  name: string;
  type: VendorType | null;
  yearEstablished: number | null;
  categoryIds: string[];
  productIds: string[];
  contact: string | null;
  designation: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  pincode: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  gst: string | null;
  pan: string | null;
  msme: string | null;
  paymentTerms: PaymentTerms | null;
  bank: string | null;
  accountNo: string | null;
  ifsc: string | null;
  /** 1–5 stars; null = not rated. */
  rating: number | null;
  notes: string | null;
  status: VendorStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  activatedAt: string | null;
  activatedBy: string | null;
  blacklistReason: string | null;
  blacklistedAt: string | null;
  blacklistedBy: string | null;
}

export interface VendorCategoryRef {
  id: string;
  name: string;
  icon: string | null;
  color: CategoryColor;
}

export interface VendorProductRef {
  id: string;
  code: string;
  name: string;
  unit: ProductUnit;
  categoryName: string;
}

/** A vendor with its categories, products and the names of the people behind each step. */
export interface VendorView extends Vendor {
  categories: VendorCategoryRef[];
  products: VendorProductRef[];
  createdByName: string | null;
  approvedByName: string | null;
  activatedByName: string | null;
  blacklistedByName: string | null;
}

export interface VendorInput {
  name: string;
  /** Blank = assign the next SPL-VEN-YY-NNN. */
  code?: string | null;
  type?: VendorType | null;
  yearEstablished?: number | null;
  categoryIds: string[];
  productIds?: string[];
  contact?: string | null;
  designation?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  pincode?: string | null;
  city?: string | null;
  state?: string | null;
  website?: string | null;
  gst?: string | null;
  pan?: string | null;
  msme?: string | null;
  paymentTerms?: PaymentTerms | null;
  bank?: string | null;
  accountNo?: string | null;
  ifsc?: string | null;
  rating?: number | null;
  notes?: string | null;
}

/** On create: 'pending' (Submit for review, the default) or 'inactive' (Save inactive). */
export type VendorCreateStatus = 'pending' | 'inactive';

export interface VendorFilters {
  status: VendorStatus;
  categoryId: string;
  state: string;
}

export interface VendorStats {
  total: number;
  pending: number;
  approved: number;
  active: number;
  inactive: number;
  blacklisted: number;
}

export const VENDOR_ACTIONS = ['submit', 'approve', 'activate', 'blacklist', 'reinstate'] as const;
export type VendorAction = (typeof VENDOR_ACTIONS)[number];

export interface VendorActionInput {
  action: VendorAction;
  /** Required for blacklist. */
  reason?: string;
}

/** Light row for pickers (Purchase, compare). */
export interface VendorOption {
  id: string;
  code: string;
  name: string;
  city: string | null;
  status: VendorStatus;
}

// ── Find by product ──────────────────────────────────────────────────

export interface ProductSourceRow {
  productId: string;
  productName: string;
  unit: ProductUnit;
  categoryName: string;
  leadTimeDays: number | null;
  vendor: { id: string; code: string; name: string; city: string | null; state: string | null; rating: number | null; status: VendorStatus };
}

export type ProductSourceSort = 'rating' | 'lead';

// ── T&C master (vn_tnc) ──────────────────────────────────────────────

export interface TncClause extends Audit {
  id: string;
  title: string;
  category: TncCategory | null;
  version: string;
  body: string;
  summary: string | null;
  status: MasterStatus;
  appliesTo: TncApplies;
  notes: string | null;
}

export interface TncInput {
  title: string;
  category?: TncCategory | null;
  version?: string;
  body: string;
  summary?: string | null;
  status?: MasterStatus;
  appliesTo?: TncApplies;
  notes?: string | null;
}

export interface TncFilters {
  category: TncCategory;
  status: MasterStatus;
  appliesTo: TncApplies;
}

export interface TncStats {
  total: number;
  categories: number;
  active: number;
}

// ── Reports ──────────────────────────────────────────────────────────

export interface CountRow {
  label: string;
  count: number;
}

export interface VendorReport {
  overview: VendorStats & { averageRating: number | null; ratedCount: number };
  /** Highest first, top 6 each (legacy). */
  byCategory: CountRow[];
  byState: CountRow[];
  byPaymentTerms: CountRow[];
  rows: VendorView[];
}

// ── Pincode lookup ───────────────────────────────────────────────────

export interface PincodeMatch {
  pincode: string;
  city: string;
  state: string;
}

// ── Settings ─────────────────────────────────────────────────────────

/** Sender details for vendor e-mails. Sending itself is connected with the e-mail relay (TODO, see docs/vendors-spec.md). */
export interface VendorEmailSettings {
  fromName: string;
  replyTo: string | null;
}

// ── Import ───────────────────────────────────────────────────────────

export const VENDOR_IMPORT_KINDS = ['vendors', 'products', 'categories', 'cities'] as const;
export type VendorImportKind = (typeof VENDOR_IMPORT_KINDS)[number];

export interface VendorImportRow {
  /** Spreadsheet row number (header = 1). */
  row: number;
  status: 'would_add' | 'added' | 'skipped' | 'error';
  /** What the row describes, e.g. the vendor name. */
  label: string;
  reason?: string;
}

export interface VendorImportReport {
  kind: VendorImportKind;
  mode: 'preview' | 'commit';
  /** Field → spreadsheet header that fed it (null = not found). */
  columns: Record<string, string | null>;
  totals: { rows: number; added: number; skipped: number; errors: number };
  rows: VendorImportRow[];
}
