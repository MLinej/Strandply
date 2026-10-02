// Repo interfaces for the Stores module (MRN and GRN). Every read ignores soft-deleted rows. Rows are returned as copies.
// Line items live inside the row here; in D1 they are sto_mrn_items / sto_grn_items (db/migrations/0007_stores.sql).
import type { Grn, GrnFilters, Mrn, MrnFilters } from '../contracts/stores';
import type { NewRow, Patch } from './masters';
import type { ListQuery, ListResult } from './types';

export type MrnPatch = Patch<Mrn, Exclude<keyof Mrn, 'id' | 'mrnNo' | 'fy' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>>;

export interface MrnRepo {
  getById(id: string): Promise<Mrn | null>;
  /** Case-insensitive. */
  getByMrnNo(mrnNo: string): Promise<Mrn | null>;
  /**
   * Searches mrnNo, vendorName, vehicleNo, invoiceNo.
   * Filters: material (any item), status, from / to (gate date, inclusive), fy.
   * Sortable: createdAt (default -createdAt), date, mrnNo, vendorName.
   */
  list(query: ListQuery<MrnFilters>): Promise<ListResult<Mrn>>;
  /** Every live MRN waiting for a GRN, oldest gate date first. */
  listPending(): Promise<Mrn[]>;
  countByDate(date: string): Promise<number>;
  /** @throws UniqueViolationError('store_mrns', 'mrnNo') */
  create(row: NewRow<Mrn>): Promise<Mrn>;
  update(id: string, patch: MrnPatch): Promise<Mrn | null>;
  softDelete(id: string, at: string): Promise<boolean>;
}

export type GrnPatch = Patch<Grn, Exclude<keyof Grn, 'id' | 'grnNo' | 'fy' | 'mrnId' | 'mrnNo' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>>;

export interface GrnRepo {
  getById(id: string): Promise<Grn | null>;
  getByGrnNo(grnNo: string): Promise<Grn | null>;
  /** The live GRN for an MRN (at most one). */
  getByMrn(mrnId: string): Promise<Grn | null>;
  /**
   * Searches grnNo, mrnNo, vendorName, invoiceNo.
   * Filters: status, fy, accounted (true / false).
   * Sortable: createdAt (default -createdAt), date, grnNo, approvedAt.
   */
  list(query: ListQuery<GrnFilters>): Promise<ListResult<Grn>>;
  countByDate(date: string): Promise<number>;
  countByStatus(): Promise<Record<Grn['status'], number> & { unaccounted: number }>;
  /** @throws UniqueViolationError('store_grns', 'grnNo') */
  create(row: NewRow<Grn>): Promise<Grn>;
  update(id: string, patch: GrnPatch): Promise<Grn | null>;
  softDelete(id: string, at: string): Promise<boolean>;
}
