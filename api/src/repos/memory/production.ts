import { fyEnd, fyStart } from '../../contracts/purchase';
import type { DocBase, DocFilters, MattBatch, WipAdjustment, WipBatch } from '../../contracts/production';
import type { DocRepo, MattBatchRepo, WipAdjustmentRepo, WipBatchRepo } from '../production';
import type { ListQuery } from '../types';
import { SoftTable } from './crud';
import { listRows } from './list';
import type { MemoryStore, TableName } from './store';

const inFy = (date: string, fy: unknown) => date >= fyStart(String(fy)) && date <= fyEnd(String(fy));
const chrono = <T extends { date: string; createdAt: string }>(a: T, b: T) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
const dateFilters = {
  fy: (r: { date: string }, v: unknown) => inFy(r.date, v),
  from: (r: { date: string }, v: unknown) => r.date >= String(v),
  to: (r: { date: string }, v: unknown) => r.date <= String(v),
};

/** One memory repo for every workflow document kind; `textFields` are searched besides docNo and remarks. */
export class MemoryDocRepo<T extends DocBase> extends SoftTable<T> implements DocRepo<T> {
  constructor(
    store: MemoryStore,
    table: TableName,
    entity: string,
    private readonly textFields: (keyof T & string)[] = [],
  ) {
    super(store, table, entity, ['docNo' as keyof T & string]);
  }

  async list(query: ListQuery<DocFilters>) {
    return listRows(this.live(), query, {
      searchFields: ['docNo', 'remarks', ...this.textFields] as (keyof T)[],
      sortable: ['date', 'docNo', 'createdAt'] as (keyof T)[],
      defaultSort: '-date',
      customFilters: dateFilters as never,
    });
  }

  async listAll() {
    return structuredClone(this.live().sort(chrono));
  }
}

export class MemoryMattBatchRepo extends SoftTable<MattBatch> implements MattBatchRepo {
  constructor(store: MemoryStore) {
    super(store, 'prMatt', 'matt_batches', ['docNo']);
  }

  async list(query: ListQuery<{ fy: string; from: string; to: string; status: 'open' | 'closed' }>) {
    return listRows(this.live(), query, {
      searchFields: ['docNo', 'product', 'operator', 'remarks'],
      sortable: ['date', 'docNo', 'createdAt'],
      defaultSort: '-date',
      customFilters: dateFilters,
    });
  }

  async listAll() {
    return structuredClone(this.live().sort(chrono));
  }
}

export class MemoryWipBatchRepo extends SoftTable<WipBatch> implements WipBatchRepo {
  constructor(store: MemoryStore) {
    super(store, 'prWip', 'wip_batches', ['docNo']);
  }

  async getByChipping(chippingId: string) {
    const b = this.live().find((x) => x.chippingId === chippingId);
    return b ? structuredClone(b) : null;
  }

  async listAll() {
    return structuredClone(this.live().sort(chrono));
  }
}

export class MemoryWipAdjustmentRepo extends SoftTable<WipAdjustment> implements WipAdjustmentRepo {
  constructor(store: MemoryStore) {
    super(store, 'prWipAdj', 'wip_adjustments');
  }

  async listAll() {
    return structuredClone(this.live().sort(chrono));
  }
}
