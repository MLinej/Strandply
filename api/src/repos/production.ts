// Repo interfaces for the Production module. Every read ignores soft-deleted rows. Rows are returned as copies.
// The seven workflow document kinds share one interface (DocRepo); line items (charges, lots, products,
// WIP use, MDO items, matt weights) live inside the row here and in child tables on D1 (0009_production.sql).
import type { Chipping, Cutting, DocBase, DocFilters, HotPress, MattBatch, Mdo, Plan, ResinUse, Summary, WipAdjustment, WipBatch } from '../contracts/production';
import type { NewRow } from './masters';
import type { ListQuery, ListResult } from './types';

export type DocPatch<T extends DocBase> = Partial<Omit<T, 'id' | 'docNo' | 'createdBy' | 'createdAt' | 'deletedAt'>> & { updatedAt: string };

export interface DocRepo<T extends DocBase> {
  getById(id: string): Promise<T | null>;
  /**
   * Searches docNo, remarks and the kind's own text fields (product, operator…).
   * Filters: fy, from / to (date, inclusive), wfState. Sortable: date (default -date), docNo, createdAt.
   */
  list(query: ListQuery<DocFilters>): Promise<ListResult<T>>;
  /** Every live row, oldest first (date, then createdAt). */
  listAll(): Promise<T[]>;
  create(row: NewRow<T>): Promise<T>;
  update(id: string, patch: DocPatch<T>): Promise<T | null>;
  softDelete(id: string, at: string): Promise<boolean>;
}

export type PlanRepo = DocRepo<Plan>;
export type HotPressRepo = DocRepo<HotPress>;
export type ChippingRepo = DocRepo<Chipping>;
export type ResinUseRepo = DocRepo<ResinUse>;
export type CuttingRepo = DocRepo<Cutting>;
export type SummaryRepo = DocRepo<Summary>;
export type MdoRepo = DocRepo<Mdo>;

export type MattBatchPatch = Partial<Omit<MattBatch, 'id' | 'docNo' | 'createdBy' | 'createdAt' | 'deletedAt'>> & { updatedAt: string };
export interface MattBatchRepo {
  getById(id: string): Promise<MattBatch | null>;
  /** Searches docNo, product, operator, remarks. Filters: fy, from / to, status. Default -date. */
  list(query: ListQuery<{ fy: string; from: string; to: string; status: 'open' | 'closed' }>): Promise<ListResult<MattBatch>>;
  listAll(): Promise<MattBatch[]>;
  create(row: NewRow<MattBatch>): Promise<MattBatch>;
  update(id: string, patch: MattBatchPatch): Promise<MattBatch | null>;
  softDelete(id: string, at: string): Promise<boolean>;
}

export interface WipBatchRepo {
  getById(id: string): Promise<WipBatch | null>;
  /** The live batch made from a chipping report (at most one). */
  getByChipping(chippingId: string): Promise<WipBatch | null>;
  /** Oldest first. */
  listAll(): Promise<WipBatch[]>;
  create(row: NewRow<WipBatch>): Promise<WipBatch>;
  softDelete(id: string, at: string): Promise<boolean>;
}

export interface WipAdjustmentRepo {
  /** Oldest first. */
  listAll(): Promise<WipAdjustment[]>;
  create(row: NewRow<WipAdjustment>): Promise<WipAdjustment>;
}
