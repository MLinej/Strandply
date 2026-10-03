import type { RecordTable } from '../record-table';
import type { ListQuery } from '../types';
import { SoftTable } from './crud';
import { listRows, type ListSpec } from './list';
import type { MemoryStore, TableName } from './store';

type Row = { id: string; createdAt: string; updatedAt: string; deletedAt: string | null };

/** One memory table for any record kind; `spec` is how list() searches, filters and sorts. */
export class MemoryRecordTable<T extends Row, F extends object = Record<string, never>> extends SoftTable<T> implements RecordTable<T, F> {
  constructor(
    store: MemoryStore,
    table: TableName,
    entity: string,
    unique: (keyof T & string)[],
    private readonly spec: ListSpec<T>,
  ) {
    super(store, table, entity, unique);
  }

  async listAll() {
    return structuredClone(this.live().sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }

  async list(query: ListQuery<F>) {
    return listRows(this.live(), query, this.spec);
  }
}

/** Date range filters on a field: from / to, inclusive. */
export const dateRange = <T,>(field: keyof T) => ({
  from: (r: T, v: unknown) => String(r[field] ?? '') >= String(v),
  to: (r: T, v: unknown) => String(r[field] ?? '') <= String(v),
});
