import type {
  CountRow,
  ProductSourceRow,
  ProductSourceSort,
  Vendor,
  VendorAction,
  VendorFilters,
  VendorOption,
  VendorReport,
  VendorStats,
  VendorStatus,
  VendorView,
} from '../../contracts/vendors';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { conflict, HttpError, notFound, validationFailed } from '../../lib/errors';
import { writeCsv, writeXlsx, type Column } from '../../lib/spreadsheet';
import { normName } from '../../lib/text';
import { UniqueViolationError, type DataLayer, type ListQuery, type Repos, type VendorPatch } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { changedKeys, collectAll } from '../sampletrack/masters/common';
import { nextCode, vendorCode } from './masters';
import type { VendorCreate, VendorUpdate } from './validation';

/** Which statuses each workflow step starts from, and where it goes. */
export const TRANSITIONS: Record<VendorAction, { from: VendorStatus[]; to: VendorStatus; verb: string }> = {
  submit: { from: ['inactive'], to: 'pending', verb: 'Submitted for review' },
  approve: { from: ['pending'], to: 'approved', verb: 'Approved' },
  activate: { from: ['approved'], to: 'active', verb: 'Activated' },
  blacklist: { from: ['pending', 'approved', 'active', 'inactive'], to: 'blacklisted', verb: 'Blacklisted' },
  reinstate: { from: ['blacklisted'], to: 'approved', verb: 'Reinstated' },
};

const STATUS_LABEL: Record<VendorStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  active: 'Active',
  inactive: 'Inactive',
  blacklisted: 'Blacklisted',
};

const EXPORT_COLUMNS: Column<VendorView>[] = [
  { header: 'Code', value: (v) => v.code },
  { header: 'Name', value: (v) => v.name },
  { header: 'Type', value: (v) => v.type },
  { header: 'Categories', value: (v) => v.categories.map((c) => c.name).join(' | ') },
  { header: 'Contact', value: (v) => v.contact },
  { header: 'Designation', value: (v) => v.designation },
  { header: 'Phone', value: (v) => v.phone },
  { header: 'Email', value: (v) => v.email },
  { header: 'Address', value: (v) => v.address },
  { header: 'City', value: (v) => v.city },
  { header: 'State', value: (v) => v.state },
  { header: 'Pincode', value: (v) => v.pincode },
  { header: 'Website', value: (v) => v.website },
  { header: 'GSTIN', value: (v) => v.gst },
  { header: 'PAN', value: (v) => v.pan },
  { header: 'MSME', value: (v) => v.msme },
  { header: 'Payment Terms', value: (v) => v.paymentTerms },
  { header: 'Status', value: (v) => STATUS_LABEL[v.status] },
  { header: 'Rating', value: (v) => v.rating },
  { header: 'Products', value: (v) => v.products.map((p) => p.name).join(' | ') },
  { header: 'Notes', value: (v) => v.notes },
];

export class VendorService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  // ── Reading ────────────────────────────────────────────────────────

  private async views(rows: Vendor[]): Promise<VendorView[]> {
    const { vendorCategories, vendorProducts, users } = this.data.repos;
    const userIds = [...new Set(rows.flatMap((v) => [v.createdBy, v.approvedBy, v.activatedBy, v.blacklistedBy]).filter((x): x is string => !!x))];
    const [cats, products, people] = await Promise.all([vendorCategories.listAll(), vendorProducts.listAll(), users.getByIds(userIds)]);
    const catById = new Map(cats.map((c) => [c.id, c]));
    const productById = new Map(products.map((p) => [p.id, p]));
    const nameOf = (id: string | null) => (id ? (people.find((u) => u.id === id)?.name ?? null) : null);
    return rows.map((v) => ({
      ...v,
      categories: v.categoryIds
        .map((id) => catById.get(id))
        .filter((c) => !!c)
        .map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color })),
      products: v.productIds
        .map((id) => productById.get(id))
        .filter((p) => !!p)
        .map((p) => ({ id: p.id, code: p.code, name: p.name, unit: p.unit, categoryName: catById.get(p.categoryId)?.name ?? '' })),
      createdByName: nameOf(v.createdBy),
      approvedByName: nameOf(v.approvedBy),
      activatedByName: nameOf(v.activatedBy),
      blacklistedByName: nameOf(v.blacklistedBy),
    }));
  }

  async list(query: ListQuery<VendorFilters>) {
    const { rows, total } = await this.data.repos.vendors.list(query);
    return { rows: await this.views(rows), total };
  }

  async get(id: string): Promise<VendorView> {
    const v = await this.data.repos.vendors.getById(id);
    if (!v) throw notFound('Vendor');
    return (await this.views([v]))[0]!;
  }

  /** Several vendors by id, in the order asked (compare). Unknown ids are left out. */
  async getMany(ids: string[]): Promise<VendorView[]> {
    const rows = (await Promise.all(ids.map((id) => this.data.repos.vendors.getById(id)))).filter((v): v is Vendor => !!v);
    return this.views(rows);
  }

  async stats(): Promise<VendorStats> {
    const c = await this.data.repos.vendors.countByStatus();
    return { total: Object.values(c).reduce((a, b) => a + b, 0), ...c };
  }

  /** Picker rows: name/code/city search, optionally limited to some statuses. */
  async options(q: string | undefined, statuses: VendorStatus[] | undefined): Promise<VendorOption[]> {
    const needle = q ? normName(q) : '';
    return (await this.data.repos.vendors.listAll())
      .filter((v) => !statuses?.length || statuses.includes(v.status))
      .filter((v) => !needle || [v.name, v.code, v.city ?? ''].some((s) => normName(s).includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
      .slice(0, 50)
      .map(({ id, code, name, city, status }) => ({ id, code, name, city, status }));
  }

  /**
   * Find by product (legacy renderProc): every (approved or active vendor, product it supplies),
   * filtered by product/vendor name and category. sort 'rating' = best rated first; 'lead' = shortest lead time first.
   */
  async byProduct(opts: { q?: string; categoryId?: string; sort?: ProductSourceSort }): Promise<ProductSourceRow[]> {
    const { vendors, vendorProducts, vendorCategories } = this.data.repos;
    const [all, products, cats] = await Promise.all([vendors.listAll(), vendorProducts.listAll(), vendorCategories.listAll()]);
    const productById = new Map(products.map((p) => [p.id, p]));
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const needle = opts.q ? normName(opts.q) : '';
    const out: ProductSourceRow[] = [];
    for (const v of all) {
      if (v.status !== 'active' && v.status !== 'approved') continue;
      for (const pid of v.productIds) {
        const p = productById.get(pid);
        if (!p) continue;
        if (opts.categoryId && p.categoryId !== opts.categoryId) continue;
        if (needle && !normName(p.name).includes(needle) && !normName(v.name).includes(needle)) continue;
        out.push({
          productId: p.id,
          productName: p.name,
          unit: p.unit,
          categoryName: catName.get(p.categoryId) ?? '',
          leadTimeDays: p.leadTimeDays,
          vendor: { id: v.id, code: v.code, name: v.name, city: v.city, state: v.state, rating: v.rating, status: v.status },
        });
      }
    }
    const byName = (a: ProductSourceRow, b: ProductSourceRow) => a.productName.localeCompare(b.productName) || a.vendor.name.localeCompare(b.vendor.name);
    return opts.sort === 'lead'
      ? out.sort((a, b) => (a.leadTimeDays ?? Infinity) - (b.leadTimeDays ?? Infinity) || byName(a, b))
      : out.sort((a, b) => (b.vendor.rating ?? 0) - (a.vendor.rating ?? 0) || byName(a, b));
  }

  /** Vendor reports (legacy renderReports): overview, top-6 breakdowns, and every vendor by name. */
  async report(): Promise<VendorReport> {
    const rows = (await this.views(await this.data.repos.vendors.listAll())).sort((a, b) =>
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
    );
    const stats = await this.stats();
    const rated = rows.filter((v) => v.rating);
    const top = (keys: string[]): CountRow[] => {
      const m = new Map<string, number>();
      for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
      return [...m.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .slice(0, 6);
    };
    return {
      overview: {
        ...stats,
        ratedCount: rated.length,
        averageRating: rated.length ? Math.round((rated.reduce((s, v) => s + v.rating!, 0) / rated.length) * 10) / 10 : null,
      },
      byCategory: top(rows.flatMap((v) => v.categories.map((c) => c.name))),
      byState: top(rows.flatMap((v) => (v.state ? [v.state] : []))),
      byPaymentTerms: top(rows.flatMap((v) => (v.paymentTerms ? [v.paymentTerms] : []))),
      rows,
    };
  }

  async export(actor: Actor, query: ListQuery<VendorFilters>, format: 'xlsx' | 'csv'): Promise<Uint8Array> {
    const rows = await this.views(await collectAll((q) => this.data.repos.vendors.list(q), query));
    const bytes = format === 'csv' ? writeCsv(EXPORT_COLUMNS, rows) : writeXlsx([{ name: 'Vendors', columns: EXPORT_COLUMNS, rows }]);
    await this.data.uow.run((tx) =>
      this.activity.record(tx, actor, { action: 'Export', entityType: 'vendor', details: `Exported ${rows.length} vendors (${format})` }),
    );
    return bytes;
  }

  // ── Writing ────────────────────────────────────────────────────────

  private async checkRefs(tx: Repos, categoryIds?: string[], productIds?: string[]) {
    const issues: { path: string; message: string }[] = [];
    if (categoryIds) {
      for (const id of categoryIds) if (!(await tx.vendorCategories.getById(id))) issues.push({ path: 'categoryIds', message: `Unknown category ${id}` });
    }
    if (productIds) {
      for (const id of productIds) if (!(await tx.vendorProducts.getById(id))) issues.push({ path: 'productIds', message: `Unknown product ${id}` });
    }
    if (issues.length) throw validationFailed('Invalid input', issues);
  }

  /** 409 possible_duplicate when a vendor with the same name exists, unless `force`. */
  private async assertNoDuplicate(tx: Repos, name: string, excludeId?: string) {
    const similar = (await tx.vendors.findByName(name)).filter((v) => v.id !== excludeId);
    if (!similar.length) return;
    throw new HttpError(409, 'possible_duplicate', `A vendor named "${similar[0]!.name}" already exists (${similar[0]!.code}). Save anyway with force=true.`, {
      similar: similar.map(({ id, code, name, city, status }) => ({ id, code, name, city, status })),
    });
  }

  async create(actor: Actor, input: VendorCreate, { force = false } = {}): Promise<VendorView> {
    const at = isoNow(this.clock);
    const vendor = await this.uniqueCode(() =>
      this.data.uow.run(async (tx) => {
        await this.checkRefs(tx, input.categoryIds, input.productIds);
        if (!force) await this.assertNoDuplicate(tx, input.name);
        const code =
          input.code ??
          (await nextCode(tx, this.clock, 'VEN', vendorCode, async (c) => (await tx.vendors.listAll()).some((v) => v.code === c)));
        const status = input.status ?? 'pending';
        const v = await tx.vendors.create({
          id: newId(),
          code,
          name: input.name.replace(/\s+/g, ' '),
          type: input.type ?? null,
          yearEstablished: input.yearEstablished ?? null,
          categoryIds: [...new Set(input.categoryIds)],
          productIds: [...new Set(input.productIds ?? [])],
          contact: input.contact ?? null,
          designation: input.designation ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          address: input.address ?? null,
          pincode: input.pincode ?? null,
          city: input.city ?? null,
          state: input.state ?? null,
          website: input.website ?? null,
          gst: input.gst ?? null,
          pan: input.pan ?? null,
          msme: input.msme ?? null,
          paymentTerms: input.paymentTerms ?? null,
          bank: input.bank ?? null,
          accountNo: input.accountNo ?? null,
          ifsc: input.ifsc ?? null,
          rating: input.rating ?? null,
          notes: input.notes ?? null,
          status,
          submittedAt: status === 'pending' ? at : null,
          approvedAt: null,
          approvedBy: null,
          activatedAt: null,
          activatedBy: null,
          blacklistReason: null,
          blacklistedAt: null,
          blacklistedBy: null,
          createdBy: actor.id,
          createdAt: at,
          updatedAt: at,
        });
        await this.activity.record(tx, actor, {
          action: 'Create',
          entityType: 'vendor',
          entityId: v.id,
          details: `Added vendor ${v.code} ${v.name} (${status === 'pending' ? 'submitted for review' : 'saved inactive'})${force ? ', despite a similar name' : ''}`,
        });
        return v;
      }),
    );
    return (await this.views([vendor]))[0]!;
  }

  /** Edits details only. Status changes go through act(). */
  async update(actor: Actor, id: string, input: VendorUpdate, { force = false } = {}): Promise<VendorView> {
    const vendor = await this.uniqueCode(() =>
      this.data.uow.run(async (tx) => {
        const before = await tx.vendors.getById(id);
        if (!before) throw notFound('Vendor');
        await this.checkRefs(tx, input.categoryIds, input.productIds);
        const { code, ...rest } = input;
        const patch: Partial<Vendor> = {
          ...rest,
          ...(code ? { code } : {}), // a blank code keeps the current one
          ...(input.name ? { name: input.name.replace(/\s+/g, ' ') } : {}),
          ...(input.categoryIds ? { categoryIds: [...new Set(input.categoryIds)] } : {}),
          ...(input.productIds ? { productIds: [...new Set(input.productIds)] } : {}),
        };
        const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
        const changed = changedKeys(before, patch).filter(
          (k) => !((k === 'categoryIds' || k === 'productIds') && sameList(before[k], patch[k] as string[])),
        );
        if (!changed.length) return before;
        if (changed.includes('name') && !force) await this.assertNoDuplicate(tx, patch.name!, id);
        const updated = (await tx.vendors.update(id, {
          ...Object.fromEntries(changed.map((k) => [k, patch[k]])),
          updatedAt: isoNow(this.clock),
        } as VendorPatch))!;
        await this.activity.record(tx, actor, {
          action: 'Edit',
          entityType: 'vendor',
          entityId: id,
          details: `Updated vendor ${updated.code} ${updated.name}: ${changed.join(', ')}`,
        });
        return updated;
      }),
    );
    return (await this.views([vendor]))[0]!;
  }

  /** One workflow step (see TRANSITIONS). 409 invalid_transition when the vendor isn't in a starting status. */
  async act(actor: Actor, id: string, action: VendorAction, reason?: string): Promise<VendorView> {
    const t = TRANSITIONS[action];
    const vendor = await this.data.uow.run(async (tx) => {
      const before = await tx.vendors.getById(id);
      if (!before) throw notFound('Vendor');
      if (!t.from.includes(before.status)) {
        throw conflict('invalid_transition', `A ${STATUS_LABEL[before.status].toLowerCase()} vendor can't be ${t.verb.toLowerCase()}`);
      }
      const at = isoNow(this.clock);
      const patch: VendorPatch = { status: t.to, updatedAt: at };
      if (action === 'submit') patch.submittedAt = at;
      if (action === 'approve') Object.assign(patch, { approvedAt: at, approvedBy: actor.id });
      if (action === 'activate') Object.assign(patch, { activatedAt: at, activatedBy: actor.id });
      if (action === 'blacklist') {
        if (!reason?.trim()) throw validationFailed('Invalid input', [{ path: 'reason', message: 'Give a reason for blacklisting' }]);
        Object.assign(patch, { blacklistReason: reason.trim(), blacklistedAt: at, blacklistedBy: actor.id });
      }
      if (action === 'reinstate') Object.assign(patch, { blacklistReason: null, blacklistedAt: null, blacklistedBy: null });
      const updated = (await tx.vendors.update(id, patch))!;
      await this.activity.record(tx, actor, {
        action: action === 'approve' ? 'Approve' : 'StatusChange',
        entityType: 'vendor',
        entityId: id,
        details: `${t.verb} vendor ${updated.code} ${updated.name}: ${STATUS_LABEL[before.status]} → ${STATUS_LABEL[t.to]}${action === 'blacklist' ? ` (${reason!.trim()})` : ''}`,
      });
      return updated;
    });
    return (await this.views([vendor]))[0]!;
  }

  // TODO(purchase): block the delete while purchase orders reference the vendor.
  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const v = await tx.vendors.getById(id);
      if (!v) throw notFound('Vendor');
      await tx.vendors.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'vendor', entityId: id, details: `Deleted vendor ${v.code} ${v.name}` });
    });
  }

  private async uniqueCode<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof UniqueViolationError && err.field === 'code') throw conflict('code_taken', 'Another vendor already uses that code');
      throw err;
    }
  }
}
