import { fyEnd, fyStart } from '../../contracts/purchase';
import type { Customer, CustomerFilters, DocListFilters, FgStock, Intercompany, PriceEntry, SalesItem, WeightEntry } from '../../contracts/sales';
import { normName } from '../../lib/text';
import type { CustomerRepo, FgStockRepo, IntercompanyRepo, PriceEntryRepo, SalesDocRepo, SalesItemRepo, WeightEntryRepo } from '../sales';
import type { ListQuery } from '../types';
import { SoftTable } from './crud';
import { listRows } from './list';
import type { MemoryStore, TableName } from './store';

type Row = { id: string; createdAt: string; updatedAt: string; deletedAt: string | null };
const byCreated = <T extends { createdAt: string }>(a: T, b: T) => a.createdAt.localeCompare(b.createdAt);

/** A Sales table with the plain listAll the services use for reports. */
class MemorySalesTable<T extends Row> extends SoftTable<T> {
  async listAll() {
    return structuredClone(this.live().sort(byCreated));
  }
}

export class MemoryCustomerRepo extends MemorySalesTable<Customer> implements CustomerRepo {
  constructor(store: MemoryStore) {
    super(store, 'slCustomers', 'sales_customers', ['name']);
  }

  async getByName(name: string) {
    const n = normName(name);
    const r = this.live().find((x) => normName(x.name) === n);
    return r ? structuredClone(r) : null;
  }

  async list(query: ListQuery<CustomerFilters>) {
    return listRows(this.live(), query, {
      searchFields: ['name', 'code', 'gstin', 'city', 'mobile1'],
      sortable: ['name', 'city', 'state', 'createdAt'],
      defaultSort: 'name',
    });
  }
}

export class MemorySalesItemRepo extends MemorySalesTable<SalesItem> implements SalesItemRepo {
  constructor(store: MemoryStore) {
    super(store, 'slItems', 'sales_items', ['name']);
  }

  async list(query: ListQuery<{ brand: string; grade: string; active: boolean }>) {
    return listRows(this.live(), query, {
      searchFields: ['name', 'subType', 'hsn'],
      sortable: ['name', 'grade', 'thic'],
      defaultSort: 'name',
    });
  }
}

export class MemoryPriceEntryRepo extends MemorySalesTable<PriceEntry> implements PriceEntryRepo {
  constructor(store: MemoryStore) {
    super(store, 'slPrices', 'sales_price_list');
  }
}

export class MemoryWeightEntryRepo extends MemorySalesTable<WeightEntry> implements WeightEntryRepo {
  constructor(store: MemoryStore) {
    super(store, 'slWeights', 'sales_weight_chart');
  }
}

type DocRow = Row & { firm: string; date: string; billTo: string; shipTo: string; state: string | null; city: string | null };

/** Proformas, orders and invoices. `noField` is the document number; `statusField` backs the status filter. */
export class MemorySalesDocRepo<T extends DocRow> extends MemorySalesTable<T> implements SalesDocRepo<T> {
  constructor(
    store: MemoryStore,
    table: TableName,
    entity: string,
    private readonly noField: keyof T & string,
    private readonly statusField: keyof T & string,
    private readonly refFields: (keyof T & string)[],
  ) {
    super(store, table, entity, [noField]);
  }

  async getByNo(no: string) {
    const n = normName(no);
    const r = this.live().find((x) => normName(String(x[this.noField])) === n);
    return r ? structuredClone(r) : null;
  }

  async list(query: ListQuery<DocListFilters>) {
    const status = this.statusField;
    return listRows(this.live(), query, {
      searchFields: [this.noField, 'billTo', 'shipTo', ...this.refFields] as (keyof T)[],
      sortable: ['date', this.noField, 'billTo', 'totalPaise', 'edd', 'createdAt'] as (keyof T)[],
      defaultSort: '-date',
      customFilters: {
        status: (r, v) => (v === 'open' ? !['completed', 'cancelled'].includes(String((r as Record<string, unknown>)[status])) : (r as Record<string, unknown>)[status] === v),
        from: (r, v) => r.date >= String(v),
        to: (r, v) => r.date <= String(v),
        fy: (r, v) => r.date >= fyStart(String(v)) && r.date <= fyEnd(String(v)),
      },
    });
  }
}

export class MemoryFgStockRepo extends MemorySalesTable<FgStock> implements FgStockRepo {
  constructor(store: MemoryStore) {
    super(store, 'slFgStock', 'sales_fg_stock');
  }
}

export class MemoryIntercompanyRepo extends MemorySalesTable<Intercompany> implements IntercompanyRepo {
  constructor(store: MemoryStore) {
    super(store, 'slIntercompany', 'sales_intercompany', ['billingDoc']);
  }

  async list(query: ListQuery<{ from: string; to: string }>) {
    return listRows(this.live(), query, {
      searchFields: ['billingDoc', 'materialDesc', 'vehicleNo'],
      sortable: ['billingDate', 'billingDoc', 'totalPaise', 'createdAt'],
      defaultSort: '-billingDate',
      customFilters: {
        from: (r, v) => r.billingDate >= String(v),
        to: (r, v) => r.billingDate <= String(v),
      },
    });
  }
}
