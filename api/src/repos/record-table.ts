// The repo shape shared by the simpler modules (CRM, Transport): get / list / create / update / soft-delete.
// Every read ignores soft-deleted rows. Rows are returned as copies.
import type { NewRow } from './masters';
import type { ListQuery, ListResult } from './types';

export type RecordPatch<T> = Partial<Omit<T, 'id' | 'createdBy' | 'createdAt' | 'deletedAt'>> & { updatedAt: string };

export interface RecordTable<T, F extends object = Record<string, never>> {
  getById(id: string): Promise<T | null>;
  /** Every live row, oldest first. */
  listAll(): Promise<T[]>;
  list(query: ListQuery<F>): Promise<ListResult<T>>;
  /** @throws UniqueViolationError on the table's unique fields (names, numbers) */
  create(row: NewRow<T>): Promise<T>;
  update(id: string, patch: RecordPatch<T>): Promise<T | null>;
  softDelete(id: string, at: string): Promise<boolean>;
}
