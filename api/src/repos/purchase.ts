// Repo interfaces for the Purchase module. Every read ignores soft-deleted rows. Rows are returned as copies.
import type {
  DocumentFilters,
  EntryFilters,
  OpeningStock,
  PoFilters,
  PurchaseDocument,
  PurchaseEntry,
  PurchaseOrder,
  PurchaseReturn,
  PurchaseType,
  TypeKind,
} from '../contracts/purchase';
import type { NewRow, Patch } from './masters';
import type { ListQuery, ListResult } from './types';

export interface PurchaseTypeRepo {
  getById(id: string): Promise<PurchaseType | null>;
  /** By sortOrder then name. */
  listAll(kind?: TypeKind): Promise<PurchaseType[]>;
  /** @throws UniqueViolationError('purchase_types', 'name') — unique per kind, ignoring case. */
  create(row: NewRow<PurchaseType>): Promise<PurchaseType>;
  softDelete(id: string, at: string): Promise<boolean>;
}

export type EntryPatch = Patch<PurchaseEntry, Exclude<keyof PurchaseEntry, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>>;

/** Range reads use the inward date (YYYY-MM-DD, inclusive). */
export interface PurchaseEntryRepo {
  getById(id: string): Promise<PurchaseEntry | null>;
  /**
   * Searches vendorName, invoiceNo, lotNo, vehicleNo, rstNo, mrnNo and poNo-free text fields.
   * Filters: material, status, poId, vendorId, fy (inward date in that FY), month (YYYY-MM).
   * Sortable: date (default -date), lotNo, invoiceNo, vendorName, splQty, createdAt.
   */
  list(query: ListQuery<EntryFilters>): Promise<ListResult<PurchaseEntry>>;
  /** Live entries with from ≤ date ≤ to, oldest first. */
  listBetween(from: string, to: string): Promise<PurchaseEntry[]>;
  /** Live entries against a PO. */
  listByPo(poId: string): Promise<PurchaseEntry[]>;
  /** Live entries with this invoice number from this vendor (ignoring case and spaces). */
  findByInvoice(vendorName: string, invoiceNo: string): Promise<PurchaseEntry[]>;
  /** Lot numbers already used for a material between two dates. */
  lotNos(material: string, from: string, to: string): Promise<string[]>;
  create(row: NewRow<PurchaseEntry>): Promise<PurchaseEntry>;
  update(id: string, patch: EntryPatch): Promise<PurchaseEntry | null>;
  softDelete(id: string, at: string): Promise<boolean>;
}

export type PoPatch = Patch<PurchaseOrder, Exclude<keyof PurchaseOrder, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>>;

export interface PurchaseOrderRepo {
  getById(id: string): Promise<PurchaseOrder | null>;
  /** Case-insensitive. */
  getByPoNo(poNo: string): Promise<PurchaseOrder | null>;
  /** Every live PO, newest first. Small table; progress filters need the received quantities anyway. */
  listAll(filters?: Partial<Pick<PoFilters, 'material'>>): Promise<PurchaseOrder[]>;
  /** @throws UniqueViolationError('purchase_orders', 'poNo') */
  create(row: NewRow<PurchaseOrder>): Promise<PurchaseOrder>;
  /** @throws UniqueViolationError('purchase_orders', 'poNo') */
  update(id: string, patch: PoPatch): Promise<PurchaseOrder | null>;
  softDelete(id: string, at: string): Promise<boolean>;
}

export type ReturnPatch = Patch<PurchaseReturn, 'status' | 'approvedBy' | 'approvedAt'>;

export interface PurchaseReturnRepo {
  getById(id: string): Promise<PurchaseReturn | null>;
  /** Newest first. Filters by material; searches returnNo, vendorName, originalInvoiceNo, reason. */
  list(query: ListQuery<{ material: string; status: string; fy: string }>): Promise<ListResult<PurchaseReturn>>;
  listBetween(from: string, to: string): Promise<PurchaseReturn[]>;
  create(row: NewRow<PurchaseReturn>): Promise<PurchaseReturn>;
  update(id: string, patch: ReturnPatch): Promise<PurchaseReturn | null>;
  softDelete(id: string, at: string): Promise<boolean>;
}

/** pu_opening_stock + pu_opening_stock_items: one record per FY. */
export interface OpeningStockRepo {
  get(fy: string): Promise<OpeningStock | null>;
  /** Insert or replace the FY's record (createdAt/createdBy kept on replace). */
  put(row: Omit<OpeningStock, 'deletedAt'>): Promise<OpeningStock>;
}

/** pu_consumption: quantity consumed per FY per ledger key (a material, or nilgiri::species). */
export interface ConsumptionRepo {
  forFy(fy: string): Promise<Record<string, number>>;
  set(fy: string, key: string, qty: number, by: string | null, at: string): Promise<void>;
}

export interface PurchaseDocumentRepo {
  getById(id: string): Promise<PurchaseDocument | null>;
  /** Newest first; searches name. */
  list(query: ListQuery<DocumentFilters>): Promise<ListResult<PurchaseDocument>>;
  /** Live documents per entry id, for the given entries. */
  countByEntry(entryIds: string[]): Promise<Map<string, number>>;
  /** Live documents per type. */
  countByType(): Promise<Record<string, number>>;
  create(row: NewRow<PurchaseDocument>): Promise<PurchaseDocument>;
  softDelete(id: string, at: string): Promise<boolean>;
}
