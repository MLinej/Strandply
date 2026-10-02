// Vendors masters: categories, products and the T&C master.
import type {
  TncClause,
  TncFilters,
  TncStats,
  VendorCategory,
  VendorCategoryView,
  VendorProduct,
  VendorProductFilters,
  VendorProductSummary,
  VendorProductView,
} from '../../contracts/vendors';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { businessToday } from '../../lib/dates';
import { conflict, HttpError, notFound, validationFailed } from '../../lib/errors';
import { writeXlsx } from '../../lib/spreadsheet';
import {
  UniqueViolationError,
  type DataLayer,
  type ListQuery,
  type Repos,
  type TncPatch,
  type VendorCategoryPatch,
  type VendorProductPatch,
} from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { changedKeys, collectAll } from '../sampletrack/masters/common';
import type { CategoryCreate, CategoryUpdate, ProductCreate, ProductUpdate, TncCreate, TncUpdate } from './validation';

/** Next code from a per-year counter, skipping any already taken (e.g. typed in by hand or imported). */
export async function nextCode(
  tx: Repos,
  clock: Clock,
  counterPrefix: string,
  format: (yy: string, n: number) => string,
  taken: (code: string) => Promise<boolean>,
): Promise<string> {
  const yy = businessToday(clock).slice(2, 4);
  for (let i = 0; i < 1000; i++) {
    const n = await tx.counters.next(`${counterPrefix}-${yy}`, isoNow(clock));
    const code = format(yy, n);
    if (!(await taken(code))) return code;
  }
  throw new Error(`No free ${counterPrefix} code`);
}

const pad3 = (n: number) => String(n).padStart(3, '0');
export const productCode = (yy: string, n: number) => `SPL-P-${yy}-${pad3(n)}`;
export const vendorCode = (yy: string, n: number) => `SPL-VEN-${yy}-${pad3(n)}`;

const inUse = (what: string, parts: string[]) =>
  new HttpError(409, 'in_use', `${what} is used by ${parts.join(' and ')} and cannot be deleted`);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

// ── Categories ───────────────────────────────────────────────────────

export class VendorCategoryService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  /** Every category with its product and vendor counts, by sort order then name. */
  async list(): Promise<VendorCategoryView[]> {
    const { vendorCategories, vendorProducts, vendors } = this.data.repos;
    const [cats, products, allVendors] = await Promise.all([vendorCategories.listAll(), vendorProducts.listAll(), vendors.listAll()]);
    return cats.map((c) => {
      const mine = products.filter((p) => p.categoryId === c.id);
      return {
        ...c,
        productCount: mine.length,
        vendorCount: allVendors.filter((v) => v.categoryIds.includes(c.id)).length,
        sampleProducts: mine.slice(0, 3).map((p) => p.name),
      };
    });
  }

  async create(actor: Actor, input: CategoryCreate): Promise<VendorCategory> {
    const at = isoNow(this.clock);
    return this.uniqueName(() =>
      this.data.uow.run(async (tx) => {
        const sortOrder = input.sortOrder ?? (await tx.vendorCategories.listAll()).reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1;
        const cat = await tx.vendorCategories.create({
          id: newId(),
          name: input.name.replace(/\s+/g, ' '),
          icon: input.icon ?? null,
          color: input.color ?? 'grey',
          description: input.description ?? null,
          sortOrder,
          status: input.status ?? 'active',
          notes: input.notes ?? null,
          createdBy: actor.id,
          createdAt: at,
          updatedAt: at,
        });
        await this.activity.record(tx, actor, { action: 'Create', entityType: 'vendor_category', entityId: cat.id, details: `Created vendor category ${cat.name}` });
        return cat;
      }),
    );
  }

  async update(actor: Actor, id: string, input: CategoryUpdate): Promise<VendorCategory> {
    return this.uniqueName(() =>
      this.data.uow.run(async (tx) => {
        const before = await tx.vendorCategories.getById(id);
        if (!before) throw notFound('Category');
        const changed = changedKeys(before, input as Partial<VendorCategory>);
        if (!changed.length) return before;
        const patch = Object.fromEntries(changed.map((k) => [k, (input as Record<string, unknown>)[k]]));
        const updated = (await tx.vendorCategories.update(id, { ...patch, updatedAt: isoNow(this.clock) } as VendorCategoryPatch))!;
        await this.activity.record(tx, actor, { action: 'Edit', entityType: 'vendor_category', entityId: id, details: `Updated vendor category ${updated.name}: ${changed.join(', ')}` });
        return updated;
      }),
    );
  }

  /** Blocked while products or vendors use it (legacy deleted silently and left them pointing at nothing). */
  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const cat = await tx.vendorCategories.getById(id);
      if (!cat) throw notFound('Category');
      const products = (await tx.vendorProducts.countByCategory()).get(id) ?? 0;
      const vendorCount = await tx.vendors.countUsingCategory(id);
      const parts = [products ? plural(products, 'product') : '', vendorCount ? plural(vendorCount, 'vendor') : ''].filter(Boolean);
      if (parts.length) throw inUse(`Category "${cat.name}"`, parts);
      await tx.vendorCategories.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'vendor_category', entityId: id, details: `Deleted vendor category ${cat.name}` });
    });
  }

  async exportXlsx(actor: Actor): Promise<Uint8Array> {
    const rows = await this.list();
    const bytes = writeXlsx([
      {
        name: 'Categories',
        rows,
        columns: [
          { header: 'Name', value: (c: VendorCategoryView) => c.name },
          { header: 'Icon', value: (c: VendorCategoryView) => c.icon },
          { header: 'Color', value: (c: VendorCategoryView) => c.color },
          { header: 'Description', value: (c: VendorCategoryView) => c.description },
          { header: 'Sort Order', value: (c: VendorCategoryView) => c.sortOrder },
          { header: 'Status', value: (c: VendorCategoryView) => c.status },
          { header: 'Products', value: (c: VendorCategoryView) => c.productCount },
          { header: 'Vendors', value: (c: VendorCategoryView) => c.vendorCount },
        ],
      },
    ]);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'vendor_category', details: `Exported ${rows.length} vendor categories` }));
    return bytes;
  }

  private async uniqueName<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof UniqueViolationError) throw conflict('name_taken', 'Another category already has that name');
      throw err;
    }
  }
}

// ── Products ─────────────────────────────────────────────────────────

export class VendorProductService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  private async views(rows: VendorProduct[]): Promise<VendorProductView[]> {
    const [cats, vendors] = await Promise.all([this.data.repos.vendorCategories.listAll(), this.data.repos.vendors.listAll()]);
    const names = new Map(cats.map((c) => [c.id, c.name]));
    return rows.map((p) => ({
      ...p,
      categoryName: names.get(p.categoryId) ?? '',
      vendorCount: vendors.filter((v) => v.productIds.includes(p.id)).length,
    }));
  }

  async list(query: ListQuery<VendorProductFilters>) {
    const { rows, total } = await this.data.repos.vendorProducts.list(query);
    return { rows: await this.views(rows), total };
  }

  /** Every product (pickers: vendor form, find by product). */
  async all(): Promise<VendorProductView[]> {
    return this.views(await this.data.repos.vendorProducts.listAll());
  }

  async get(id: string): Promise<VendorProductView> {
    const p = await this.data.repos.vendorProducts.getById(id);
    if (!p) throw notFound('Product');
    return (await this.views([p]))[0]!;
  }

  async summary(): Promise<VendorProductSummary> {
    const [products, cats, vendors] = await Promise.all([
      this.data.repos.vendorProducts.listAll(),
      this.data.repos.vendorCategories.listAll(),
      this.data.repos.vendors.listAll(),
    ]);
    const supplied = new Set(vendors.flatMap((v) => v.productIds));
    return { total: products.length, categories: cats.length, withVendors: products.filter((p) => supplied.has(p.id)).length };
  }

  private async assertCategory(tx: Repos, categoryId: string) {
    if (!(await tx.vendorCategories.getById(categoryId))) {
      throw validationFailed('Invalid input', [{ path: 'categoryId', message: 'Unknown category' }]);
    }
  }

  async create(actor: Actor, input: ProductCreate): Promise<VendorProductView> {
    const at = isoNow(this.clock);
    const product = await this.uniqueName(() =>
      this.data.uow.run(async (tx) => {
        await this.assertCategory(tx, input.categoryId);
        const code = await nextCode(tx, this.clock, 'VP', productCode, async (c) => (await tx.vendorProducts.listAll()).some((p) => p.code === c));
        const p = await tx.vendorProducts.create({
          id: newId(),
          code,
          name: input.name.replace(/\s+/g, ' '),
          categoryId: input.categoryId,
          unit: input.unit,
          altUnit: input.altUnit ?? null,
          convFactor: input.convFactor ?? null,
          hsn: input.hsn ?? null,
          gstRate: input.gstRate ?? null,
          moq: input.moq ?? null,
          leadTimeDays: input.leadTimeDays ?? null,
          description: input.description ?? null,
          notes: input.notes ?? null,
          createdBy: actor.id,
          createdAt: at,
          updatedAt: at,
        });
        await this.activity.record(tx, actor, { action: 'Create', entityType: 'vendor_product', entityId: p.id, details: `Created vendor product ${p.code} ${p.name}` });
        return p;
      }),
    );
    return (await this.views([product]))[0]!;
  }

  async update(actor: Actor, id: string, input: ProductUpdate): Promise<VendorProductView> {
    const product = await this.uniqueName(() =>
      this.data.uow.run(async (tx) => {
        const before = await tx.vendorProducts.getById(id);
        if (!before) throw notFound('Product');
        if (input.categoryId) await this.assertCategory(tx, input.categoryId);
        const changed = changedKeys(before, input as Partial<VendorProduct>);
        if (!changed.length) return before;
        const patch = Object.fromEntries(changed.map((k) => [k, (input as Record<string, unknown>)[k]]));
        const updated = (await tx.vendorProducts.update(id, { ...patch, updatedAt: isoNow(this.clock) } as VendorProductPatch))!;
        await this.activity.record(tx, actor, { action: 'Edit', entityType: 'vendor_product', entityId: id, details: `Updated vendor product ${updated.code}: ${changed.join(', ')}` });
        return updated;
      }),
    );
    return (await this.views([product]))[0]!;
  }

  /** Blocked while a vendor lists it as supplied. */
  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const p = await tx.vendorProducts.getById(id);
      if (!p) throw notFound('Product');
      const used = await tx.vendors.countUsingProduct(id);
      if (used) throw inUse(`Product "${p.name}"`, [plural(used, 'vendor')]);
      await tx.vendorProducts.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'vendor_product', entityId: id, details: `Deleted vendor product ${p.code} ${p.name}` });
    });
  }

  async exportXlsx(actor: Actor, query: ListQuery<VendorProductFilters>): Promise<Uint8Array> {
    const rows = await this.views(await collectAll((q) => this.data.repos.vendorProducts.list(q), query));
    const bytes = writeXlsx([
      {
        name: 'Products',
        rows,
        columns: [
          { header: 'Code', value: (p: VendorProductView) => p.code },
          { header: 'Name', value: (p: VendorProductView) => p.name },
          { header: 'Category', value: (p: VendorProductView) => p.categoryName },
          { header: 'Unit', value: (p: VendorProductView) => p.unit },
          { header: 'Alt Unit', value: (p: VendorProductView) => p.altUnit },
          { header: 'Conv Factor', value: (p: VendorProductView) => p.convFactor },
          { header: 'HSN', value: (p: VendorProductView) => p.hsn },
          { header: 'GST%', value: (p: VendorProductView) => p.gstRate },
          { header: 'MOQ', value: (p: VendorProductView) => p.moq },
          { header: 'Lead Days', value: (p: VendorProductView) => p.leadTimeDays },
          { header: 'Description', value: (p: VendorProductView) => p.description },
          { header: 'Vendors', value: (p: VendorProductView) => p.vendorCount },
        ],
      },
    ]);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'vendor_product', details: `Exported ${rows.length} vendor products` }));
    return bytes;
  }

  private async uniqueName<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof UniqueViolationError) throw conflict('name_taken', 'Another product already has that name');
      throw err;
    }
  }
}

// ── T&C master ───────────────────────────────────────────────────────

export class TncService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  list(query: ListQuery<TncFilters>) {
    return this.data.repos.tnc.list(query);
  }

  async get(id: string): Promise<TncClause> {
    const t = await this.data.repos.tnc.getById(id);
    if (!t) throw notFound('T&C clause');
    return t;
  }

  async stats(): Promise<TncStats> {
    const all = await this.data.repos.tnc.listAll();
    return {
      total: all.length,
      categories: new Set(all.map((t) => t.category).filter(Boolean)).size,
      active: all.filter((t) => t.status === 'active').length,
    };
  }

  async create(actor: Actor, input: TncCreate): Promise<TncClause> {
    const at = isoNow(this.clock);
    return this.data.uow.run(async (tx) => {
      const t = await tx.tnc.create({
        id: newId(),
        title: input.title,
        category: input.category ?? null,
        version: input.version ?? '1.0',
        body: input.body,
        summary: input.summary ?? null,
        status: input.status ?? 'active',
        appliesTo: input.appliesTo ?? 'all',
        notes: input.notes ?? null,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'tnc', entityId: t.id, details: `Created T&C clause ${t.title}` });
      return t;
    });
  }

  async update(actor: Actor, id: string, input: TncUpdate): Promise<TncClause> {
    return this.data.uow.run(async (tx) => {
      const before = await tx.tnc.getById(id);
      if (!before) throw notFound('T&C clause');
      const changed = changedKeys(before, input as Partial<TncClause>);
      if (!changed.length) return before;
      const patch = Object.fromEntries(changed.map((k) => [k, (input as Record<string, unknown>)[k]]));
      const updated = (await tx.tnc.update(id, { ...patch, updatedAt: isoNow(this.clock) } as TncPatch))!;
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'tnc', entityId: id, details: `Updated T&C clause ${updated.title}: ${changed.join(', ')}` });
      return updated;
    });
  }

  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const t = await tx.tnc.getById(id);
      if (!t) throw notFound('T&C clause');
      await tx.tnc.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'tnc', entityId: id, details: `Deleted T&C clause ${t.title}` });
    });
  }
}
