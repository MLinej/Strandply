// Repo interfaces for the Vendors module: categories, products, vendors, T&C.
// Every read ignores soft-deleted rows. Rows are returned as copies.
import type {
  TncClause,
  TncFilters,
  Vendor,
  VendorCategory,
  VendorFilters,
  VendorProduct,
  VendorProductFilters,
  VendorStatus,
} from '../contracts/vendors';
import type { NewRow, Patch } from './masters';
import type { ListQuery, ListResult } from './types';

// ── Categories (vn_categories) ───────────────────────────────────────

export type VendorCategoryPatch = Patch<VendorCategory, 'name' | 'icon' | 'color' | 'description' | 'sortOrder' | 'status' | 'notes'>;

export interface VendorCategoryRepo {
  getById(id: string): Promise<VendorCategory | null>;
  /** Every live category, by sortOrder then name. A small table. */
  listAll(): Promise<VendorCategory[]>;
  /** Case-insensitive, live rows only. */
  getByName(name: string): Promise<VendorCategory | null>;
  /** @throws UniqueViolationError('vendor_categories', 'name') */
  create(row: NewRow<VendorCategory>): Promise<VendorCategory>;
  /** @throws UniqueViolationError('vendor_categories', 'name') */
  update(id: string, patch: VendorCategoryPatch): Promise<VendorCategory | null>;
  softDelete(id: string, at: string): Promise<boolean>;
}

// ── Products (vn_products) ───────────────────────────────────────────

export type VendorProductPatch = Patch<
  VendorProduct,
  'name' | 'categoryId' | 'unit' | 'altUnit' | 'convFactor' | 'hsn' | 'gstRate' | 'moq' | 'leadTimeDays' | 'description' | 'notes'
>;

export interface VendorProductRepo {
  getById(id: string): Promise<VendorProduct | null>;
  /** Searches name, code, unit, hsn and description. Sortable: name (default), code, unit, createdAt. */
  list(query: ListQuery<VendorProductFilters>): Promise<ListResult<VendorProduct>>;
  /** Every live product, by name. Lets imports and pickers work in one read. */
  listAll(): Promise<VendorProduct[]>;
  /** @throws UniqueViolationError('vendor_products', 'code' | 'name') */
  create(row: NewRow<VendorProduct>): Promise<VendorProduct>;
  /** @throws UniqueViolationError('vendor_products', 'name') */
  update(id: string, patch: VendorProductPatch): Promise<VendorProduct | null>;
  softDelete(id: string, at: string): Promise<boolean>;
  /** Live products per category id. */
  countByCategory(): Promise<Map<string, number>>;
}

// ── Vendors (vn_vendors, vn_vendor_categories, vn_vendor_products) ───

export type VendorPatch = Patch<
  Vendor,
  | 'code'
  | 'name'
  | 'type'
  | 'yearEstablished'
  | 'categoryIds'
  | 'productIds'
  | 'contact'
  | 'designation'
  | 'phone'
  | 'email'
  | 'address'
  | 'pincode'
  | 'city'
  | 'state'
  | 'website'
  | 'gst'
  | 'pan'
  | 'msme'
  | 'paymentTerms'
  | 'bank'
  | 'accountNo'
  | 'ifsc'
  | 'rating'
  | 'notes'
  | 'status'
  | 'submittedAt'
  | 'approvedAt'
  | 'approvedBy'
  | 'activatedAt'
  | 'activatedBy'
  | 'blacklistReason'
  | 'blacklistedAt'
  | 'blacklistedBy'
>;

export interface VendorRepo {
  getById(id: string): Promise<Vendor | null>;
  /**
   * Searches name, code, city, state, gst, contact and phone. Filters: status, state (exact),
   * categoryId (vendor is tagged with it). Sortable: name (default), code, city, rating, createdAt.
   * The D1 version joins vn_vendor_categories / vn_vendor_products to fill categoryIds and productIds.
   */
  list(query: ListQuery<VendorFilters>): Promise<ListResult<Vendor>>;
  /** Every live vendor. Used by reports and find-by-product; fine at a few thousand rows. */
  listAll(): Promise<Vendor[]>;
  /** Live vendors whose name equals `name` ignoring case and repeated spaces. */
  findByName(name: string): Promise<Vendor[]>;
  /** @throws UniqueViolationError('vendors', 'code') */
  create(row: NewRow<Vendor>): Promise<Vendor>;
  /** @throws UniqueViolationError('vendors', 'code') */
  update(id: string, patch: VendorPatch): Promise<Vendor | null>;
  softDelete(id: string, at: string): Promise<boolean>;
  countByStatus(): Promise<Record<VendorStatus, number>>;
  /** Live vendors tagged with the category / supplying the product. */
  countUsingCategory(categoryId: string): Promise<number>;
  countUsingProduct(productId: string): Promise<number>;
}

// ── T&C (vn_tnc) ─────────────────────────────────────────────────────

export type TncPatch = Patch<TncClause, 'title' | 'category' | 'version' | 'body' | 'summary' | 'status' | 'appliesTo' | 'notes'>;

export interface TncRepo {
  getById(id: string): Promise<TncClause | null>;
  /** Searches title, category, body and summary. Sortable: title (default), category, createdAt. */
  list(query: ListQuery<TncFilters>): Promise<ListResult<TncClause>>;
  listAll(): Promise<TncClause[]>;
  create(row: NewRow<TncClause>): Promise<TncClause>;
  update(id: string, patch: TncPatch): Promise<TncClause | null>;
  softDelete(id: string, at: string): Promise<boolean>;
}
