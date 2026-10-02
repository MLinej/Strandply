import type {
  City,
  CityFilters,
  Courier,
  CourierFilters,
  CourierType,
  Party,
  PartyFilters,
  Product,
  ProductFilters,
  State,
} from '../../contracts/sampletrack';
import { BOARD_TYPES } from '../../contracts/sampletrack';
import type { CityRepo, CourierRepo, PartyRepo, ProductRepo, StateRepo, UsageCount, UsageRepo } from '../masters';
import { UniqueViolationError, type ListQuery } from '../types';
import { normName } from '../../lib/text';
import { SoftTable } from './crud';
import { listRows } from './list';
import type { MemoryStore } from './store';

export class MemoryPartyRepo extends SoftTable<Party> implements PartyRepo {
  constructor(store: MemoryStore) {
    super(store, 'parties', 'parties');
  }

  async list(query: ListQuery<PartyFilters>) {
    return listRows(this.live(), query, {
      searchFields: ['name', 'contact', 'mobile', 'email', 'gst', 'city', 'state'],
      sortable: ['name', 'city', 'state', 'type', 'createdAt'],
      defaultSort: 'name',
      customFilters: {
        city: (r, v) => !!r.city && normName(r.city) === normName(String(v)),
        state: (r, v) => !!r.state && normName(r.state) === normName(String(v)),
      },
    });
  }

  async findByName(name: string, excludeId?: string) {
    const n = normName(name);
    return structuredClone(this.live().filter((p) => p.id !== excludeId && normName(p.name) === n));
  }

  async usedCities() {
    const seen = new Map<string, { city: string; state: string | null }>();
    for (const p of this.live()) {
      if (!p.city?.trim()) continue;
      const key = `${normName(p.city)}|${p.state ? normName(p.state) : ''}`;
      if (!seen.has(key)) seen.set(key, { city: p.city.trim(), state: p.state });
    }
    return [...seen.values()];
  }
}

export class MemoryCourierRepo extends SoftTable<Courier> implements CourierRepo {
  constructor(store: MemoryStore) {
    super(store, 'couriers', 'couriers');
  }

  async list(query: ListQuery<CourierFilters>) {
    return listRows(this.live(), query, {
      searchFields: ['name', 'contact', 'mobile', 'email', 'coverage'],
      sortable: ['name', 'type', 'rating', 'status', 'createdAt'],
      defaultSort: 'name',
    });
  }

  async listActive(type?: CourierType) {
    const rows = this.live().filter((c) => c.status === 'Active' && (!type || c.type === type));
    return structuredClone(rows.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })));
  }
}

export class MemoryProductRepo extends SoftTable<Product> implements ProductRepo {
  constructor(store: MemoryStore) {
    super(store, 'products', 'products', ['code']);
  }

  async getByCode(code: string) {
    const n = normName(code);
    const p = this.live().find((x) => normName(x.code) === n);
    return p ? structuredClone(p) : null;
  }

  async list(query: ListQuery<ProductFilters>) {
    return listRows(this.live(), query, {
      searchFields: ['code', 'name', 'size', 'category', 'description'],
      sortable: ['name', 'code', 'boardType', 'thicknessMm', 'unitPricePaise', 'stockStatus', 'createdAt'],
      defaultSort: 'name',
    });
  }

  async listKeys() {
    return this.live().map(({ id, code, name }) => ({ id, code, name }));
  }

  async countByBoardType() {
    const live = this.live();
    return BOARD_TYPES.map((boardType) => ({ boardType, count: live.filter((p) => p.boardType === boardType).length })).filter(
      (c) => c.count > 0,
    );
  }
}

export class MemoryStateRepo implements StateRepo {
  constructor(private readonly store: MemoryStore) {}

  private all(): State[] {
    return [...this.store.tables.states.values()];
  }

  async listAll() {
    return structuredClone(this.all().sort((a, b) => a.name.localeCompare(b.name)));
  }

  async getById(id: string) {
    const s = this.store.tables.states.get(id);
    return s ? structuredClone(s) : null;
  }

  async getByName(name: string) {
    const n = normName(name);
    const s = this.all().find((x) => normName(x.name) === n);
    return s ? structuredClone(s) : null;
  }
}

export class MemoryCityRepo extends SoftTable<City> implements CityRepo {
  constructor(store: MemoryStore) {
    super(store, 'cities', 'cities');
  }

  async list(query: ListQuery<CityFilters>) {
    return listRows(this.live(), query, {
      searchFields: ['city'],
      sortable: ['city', 'createdAt'],
      defaultSort: 'city',
    });
  }

  async listAll() {
    return structuredClone(this.live());
  }

  async find(city: string, stateId: string) {
    const n = normName(city);
    const c = this.live().find((x) => x.stateId === stateId && normName(x.city) === n);
    return c ? structuredClone(c) : null;
  }

  override async create(row: Omit<City, 'deletedAt'>) {
    if (await this.find(row.city, row.stateId)) throw new UniqueViolationError('cities', 'city');
    return super.create(row);
  }
}

export class MemoryUsageRepo implements UsageRepo {
  constructor(private readonly store: MemoryStore) {}

  private liveRequests() {
    return [...this.store.tables.requests.values()].filter((r) => r.deletedAt === null);
  }

  private liveDispatches() {
    return [...this.store.tables.dispatches.values()].filter((d) => d.deletedAt === null);
  }

  async party(id: string): Promise<UsageCount> {
    return {
      requests: this.liveRequests().filter((r) => r.partyId === id).length,
      dispatches: this.liveDispatches().filter((d) => d.partyId === id).length,
    };
  }

  async courier(id: string): Promise<UsageCount> {
    return { requests: 0, dispatches: this.liveDispatches().filter((d) => d.courierId === id).length };
  }

  async product(id: string): Promise<UsageCount> {
    const liveRequestIds = new Set(this.liveRequests().map((r) => r.id));
    const requestIds = new Set(
      [...this.store.tables.requestItems.values()]
        .filter((i) => i.deletedAt === null && i.productId === id && liveRequestIds.has(i.requestId))
        .map((i) => i.requestId),
    );
    return { requests: requestIds.size, dispatches: 0 };
  }

  async requestDispatches(requestId: string) {
    return this.liveDispatches().filter((d) => d.linkedRequestId === requestId).length;
  }
}
