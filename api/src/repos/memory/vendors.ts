import { VENDOR_STATUSES, type TncClause, type TncFilters, type Vendor, type VendorCategory, type VendorFilters, type VendorProduct, type VendorProductFilters, type VendorStatus } from '../../contracts/vendors';
import { normName } from '../../lib/text';
import type { ListQuery } from '../types';
import type { TncRepo, VendorCategoryRepo, VendorProductRepo, VendorRepo } from '../vendors';
import { SoftTable } from './crud';
import { listRows } from './list';
import type { MemoryStore } from './store';

export class MemoryVendorCategoryRepo extends SoftTable<VendorCategory> implements VendorCategoryRepo {
  constructor(store: MemoryStore) {
    super(store, 'vnCategories', 'vendor_categories', ['name']);
  }

  async listAll() {
    return structuredClone(
      this.live().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
    );
  }

  async getByName(name: string) {
    const n = normName(name);
    const c = this.live().find((x) => normName(x.name) === n);
    return c ? structuredClone(c) : null;
  }
}

export class MemoryVendorProductRepo extends SoftTable<VendorProduct> implements VendorProductRepo {
  constructor(store: MemoryStore) {
    super(store, 'vnProducts', 'vendor_products', ['code', 'name']);
  }

  async list(query: ListQuery<VendorProductFilters>) {
    return listRows(this.live(), query, {
      searchFields: ['name', 'code', 'unit', 'hsn', 'description'],
      sortable: ['name', 'code', 'unit', 'createdAt'],
      defaultSort: 'name',
    });
  }

  async listAll() {
    return structuredClone(this.live().sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })));
  }

  async countByCategory() {
    const out = new Map<string, number>();
    for (const p of this.live()) out.set(p.categoryId, (out.get(p.categoryId) ?? 0) + 1);
    return out;
  }
}

export class MemoryVendorRepo extends SoftTable<Vendor> implements VendorRepo {
  constructor(store: MemoryStore) {
    super(store, 'vendors', 'vendors', ['code']);
  }

  async list(query: ListQuery<VendorFilters>) {
    return listRows(this.live(), query, {
      searchFields: ['name', 'code', 'city', 'state', 'gst', 'contact', 'phone'],
      sortable: ['name', 'code', 'city', 'rating', 'createdAt'],
      defaultSort: 'name',
      customFilters: {
        categoryId: (v, id) => v.categoryIds.includes(id as string),
        state: (v, s) => v.state !== null && normName(v.state) === normName(String(s)),
      },
    });
  }

  async listAll() {
    return structuredClone(this.live());
  }

  async findByName(name: string) {
    const n = normName(name);
    return structuredClone(this.live().filter((v) => normName(v.name) === n));
  }

  async countByStatus() {
    const out = Object.fromEntries(VENDOR_STATUSES.map((s) => [s, 0])) as Record<VendorStatus, number>;
    for (const v of this.live()) out[v.status]++;
    return out;
  }

  async countUsingCategory(categoryId: string) {
    return this.live().filter((v) => v.categoryIds.includes(categoryId)).length;
  }

  async countUsingProduct(productId: string) {
    return this.live().filter((v) => v.productIds.includes(productId)).length;
  }
}

export class MemoryTncRepo extends SoftTable<TncClause> implements TncRepo {
  constructor(store: MemoryStore) {
    super(store, 'vnTnc', 'tnc');
  }

  async list(query: ListQuery<TncFilters>) {
    return listRows(this.live(), query, {
      searchFields: ['title', 'category', 'body', 'summary'],
      sortable: ['title', 'category', 'createdAt'],
      defaultSort: 'title',
    });
  }

  async listAll() {
    return structuredClone(this.live());
  }
}
