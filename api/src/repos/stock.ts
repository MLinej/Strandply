// Repo interfaces for the Stock module. Every read ignores soft-deleted rows. Rows are returned as copies.
// Balances are not stored: the service sums the legs of every live movement (see docs/DB-CONNECT-LATER.md).
import type { OpeningEntry, Reclass, SkuGroup, SlipFilters, StockSlip } from '../contracts/stock';
import type { NewRow, Patch } from './masters';
import type { ListQuery, ListResult } from './types';

export type SkuGroupPatch = Patch<SkuGroup, Exclude<keyof SkuGroup, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>>;

export interface SkuGroupRepo {
  getById(id: string): Promise<SkuGroup | null>;
  /** Case-insensitive. */
  getByPrefix(prefix: string): Promise<SkuGroup | null>;
  /** By sortOrder, then prefix. */
  listAll(): Promise<SkuGroup[]>;
  /** @throws UniqueViolationError('sku_groups', 'prefix') */
  create(row: NewRow<SkuGroup>): Promise<SkuGroup>;
  /** @throws UniqueViolationError('sku_groups', 'prefix') */
  update(id: string, patch: SkuGroupPatch): Promise<SkuGroup | null>;
  softDelete(id: string, at: string): Promise<boolean>;
}

export interface StockSlipRepo {
  getById(id: string): Promise<StockSlip | null>;
  /**
   * Searches slipNo, batch, refNo, remarks and both SKU codes.
   * Filters: type, from / to (date, inclusive), sku (either leg).
   * Sortable: createdAt (default -createdAt), date, slipNo, qty.
   */
  list(query: ListQuery<SlipFilters>): Promise<ListResult<StockSlip>>;
  /** Every live slip, oldest first (date, then createdAt). */
  listAll(): Promise<StockSlip[]>;
  create(row: NewRow<StockSlip>): Promise<StockSlip>;
  softDelete(id: string, at: string): Promise<boolean>;
}

export interface StockOpeningRepo {
  getById(id: string): Promise<OpeningEntry | null>;
  /** Oldest first. */
  listAll(): Promise<OpeningEntry[]>;
  create(row: NewRow<OpeningEntry>): Promise<OpeningEntry>;
  softDelete(id: string, at: string): Promise<boolean>;
}

export interface ReclassRepo {
  getById(id: string): Promise<Reclass | null>;
  /** Oldest first. */
  listAll(): Promise<Reclass[]>;
  create(row: NewRow<Reclass>): Promise<Reclass>;
  softDelete(id: string, at: string): Promise<boolean>;
}
