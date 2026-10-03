import type { OpeningEntry, Reclass, SkuGroup, SlipFilters, StockSlip } from '../../contracts/stock';
import { normName } from '../../lib/text';
import type { ReclassRepo, SkuGroupRepo, StockOpeningRepo, StockSlipRepo } from '../stock';
import type { ListQuery } from '../types';
import { SoftTable } from './crud';
import { listRows } from './list';
import type { MemoryStore } from './store';

const chrono = <T extends { date: string; createdAt: string }>(a: T, b: T) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);

export class MemorySkuGroupRepo extends SoftTable<SkuGroup> implements SkuGroupRepo {
  constructor(store: MemoryStore) {
    super(store, 'skGroups', 'sku_groups', ['prefix']);
  }

  async getByPrefix(prefix: string) {
    const n = normName(prefix);
    const g = this.live().find((x) => normName(x.prefix) === n);
    return g ? structuredClone(g) : null;
  }

  async listAll() {
    return structuredClone(this.live().sort((a, b) => a.sortOrder - b.sortOrder || a.prefix.localeCompare(b.prefix)));
  }
}

export class MemoryStockSlipRepo extends SoftTable<StockSlip> implements StockSlipRepo {
  constructor(store: MemoryStore) {
    super(store, 'skSlips', 'stock_slips');
  }

  async list(query: ListQuery<SlipFilters>) {
    const q = query.q?.trim().toLowerCase();
    const rows = q
      ? this.live().filter((s) => [s.slipNo, s.batch, s.refNo ?? '', s.remarks ?? '', s.from.sku, s.to.sku].some((v) => v.toLowerCase().includes(q)))
      : this.live();
    return listRows(rows, { ...query, q: undefined }, {
      searchFields: [],
      sortable: ['createdAt', 'date', 'slipNo', 'qty'],
      defaultSort: '-createdAt',
      customFilters: {
        from: (r, v) => r.date >= String(v),
        to: (r, v) => r.date <= String(v),
        sku: (r, v) => r.from.sku === v || r.to.sku === v,
      },
    });
  }

  async listAll() {
    return structuredClone(this.live().sort(chrono));
  }
}

export class MemoryStockOpeningRepo extends SoftTable<OpeningEntry> implements StockOpeningRepo {
  constructor(store: MemoryStore) {
    super(store, 'skOpening', 'stock_opening');
  }

  async listAll() {
    return structuredClone(this.live().sort(chrono));
  }
}

export class MemoryReclassRepo extends SoftTable<Reclass> implements ReclassRepo {
  constructor(store: MemoryStore) {
    super(store, 'skReclass', 'stock_reclass');
  }

  async listAll() {
    return structuredClone(this.live().sort(chrono));
  }
}
