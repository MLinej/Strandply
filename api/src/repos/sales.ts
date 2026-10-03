// Repo interfaces for the Sales module. Every read ignores soft-deleted rows. Rows are returned as copies.
// Document lines live inside the row here; in D1 they are child tables (db/migrations/0010_sales.sql).
import type {
  Customer,
  CustomerFilters,
  DocListFilters,
  FgStock,
  Intercompany,
  PriceEntry,
  Proforma,
  SalesInvoice,
  SalesItem,
  SalesOrder,
  WeightEntry,
} from '../contracts/sales';
import type { NewRow } from './masters';
import type { ListQuery, ListResult } from './types';

type Locked = 'id' | 'createdBy' | 'createdAt' | 'deletedAt';
export type RowPatch<T> = Partial<Omit<T, Locked>> & { updatedAt: string };

/** get / create / update / soft-delete, the same for every Sales table. */
export interface SalesTable<T> {
  getById(id: string): Promise<T | null>;
  /** Every live row (oldest first). */
  listAll(): Promise<T[]>;
  create(row: NewRow<T>): Promise<T>;
  update(id: string, patch: RowPatch<T>): Promise<T | null>;
  softDelete(id: string, at: string): Promise<boolean>;
}

export interface CustomerRepo extends SalesTable<Customer> {
  /** Case- and space-insensitive. */
  getByName(name: string): Promise<Customer | null>;
  /**
   * Searches name, code, gstin, city, mobile1. Filters: state, city, group, dealerType, active.
   * Sortable: name (default), city, state, createdAt.
   * @throws UniqueViolationError('sales_customers', 'name') on create / update
   */
  list(query: ListQuery<CustomerFilters>): Promise<ListResult<Customer>>;
}

export interface SalesItemRepo extends SalesTable<SalesItem> {
  /** Searches name, subType, hsn. Filters: brand, grade, active. Sortable: name (default), grade, thic. @throws UniqueViolationError('sales_items', 'name') */
  list(query: ListQuery<{ brand: string; grade: string; active: boolean }>): Promise<ListResult<SalesItem>>;
}

export type PriceEntryRepo = SalesTable<PriceEntry>;
export type WeightEntryRepo = SalesTable<WeightEntry>;

/** Proformas, orders and invoices: numbered per firm. */
export interface SalesDocRepo<T> extends SalesTable<T> {
  /** By document number (PI/001/26-27, SO/12/26-27, SPL/07/26-27), case-insensitive. */
  getByNo(no: string): Promise<T | null>;
  /**
   * Searches the number, billTo, shipTo, poNo / poRef / soNo. Filters: firm, status (approval for invoices; 'open' = not completed or cancelled),
   * billTo, shipTo, state, city (exact), from / to (date, inclusive), fy.
   * Sortable: date (default -date), the number field (numeric order), billTo, totalPaise, edd (orders), createdAt.
   */
  list(query: ListQuery<DocListFilters>): Promise<ListResult<T>>;
}

export type ProformaRepo = SalesDocRepo<Proforma>;
export type SalesOrderRepo = SalesDocRepo<SalesOrder>;
export type SalesInvoiceRepo = SalesDocRepo<SalesInvoice>;

export type FgStockRepo = SalesTable<FgStock>;

export interface IntercompanyRepo extends SalesTable<Intercompany> {
  /** Searches billingDoc, materialDesc, vehicleNo. Filters: from / to (billing date). Default -billingDate. */
  list(query: ListQuery<{ from: string; to: string }>): Promise<ListResult<Intercompany>>;
}
