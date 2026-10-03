import {
  FIRM_LABEL,
  isOpenSo,
  round4,
  specKey,
  sqmFactorOf,
  taxTypeFor,
  type Customer,
  type CustomerFilters,
  type FgStock,
  type FgStockView,
  type Firm,
  type Intercompany,
  type IntercompanyView,
  type PriceEntry,
  type SalesItem,
  type SalesSettings,
  type SalesTaxType,
  type WeightEntry,
} from '../../contracts/sales';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { conflict, HttpError, notFound } from '../../lib/errors';
import { UniqueViolationError, type DataLayer, type ListQuery, type Repos } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { badRef, readSettings, SETTING_KEYS } from './common';

/* eslint-disable @typescript-eslint/no-explicit-any -- inputs are validated by zod at the route */
type Input = Record<string, any>;

const defined = (o: Input) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const money = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Party, item, price list, weight chart, FG stock, inter-company and settings (legacy Masters and Admin). */
export class SalesMasterService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  private repos() {
    return this.data.repos;
  }

  // ── Party master ──────────────────────────────────────────────────

  listCustomers(query: ListQuery<CustomerFilters>) {
    return this.repos().salesCustomers.list(query);
  }

  async getCustomer(id: string) {
    const c = await this.repos().salesCustomers.getById(id);
    if (!c) throw notFound('Party');
    return c;
  }

  /** With a GSTIN both firms' tax types follow its state code; without one, what was entered (default SG+CG). */
  private taxTypes(gstin: string | null, given: Partial<Record<Firm, SalesTaxType>>, before: Customer | null, s: SalesSettings): Record<Firm, SalesTaxType> {
    if (gstin) return { llp: taxTypeFor(gstin, s.firmStateCodes.llp), osb: taxTypeFor(gstin, s.firmStateCodes.osb) };
    return { llp: given.llp ?? before?.taxTypes.llp ?? 'SG+CG', osb: given.osb ?? before?.taxTypes.osb ?? 'SG+CG' };
  }

  async createCustomer(actor: Actor, input: Input): Promise<Customer> {
    return this.data.uow.run(async (tx) => {
      const s = await readSettings(tx);
      const at = isoNow(this.clock);
      const gstin = input.gstin ?? null;
      try {
        const c = await tx.salesCustomers.create({
          id: newId(),
          name: input.name,
          code: input.code ?? null,
          dealerType: input.dealerType,
          gstin,
          pan: input.pan ?? null,
          group: input.group,
          address: input.address ?? null,
          city: input.city ?? null,
          state: input.state ?? null,
          country: input.country,
          pincode: input.pincode ?? null,
          contactPerson: input.contactPerson ?? null,
          mobile1: input.mobile1 ?? null,
          mobile2: input.mobile2 ?? null,
          email: input.email ?? null,
          creditDays: input.creditDays,
          creditLimitPaise: input.creditLimitPaise,
          transportPref: input.transportPref ?? null,
          paymentTerms: input.paymentTerms ?? null,
          taxTypes: this.taxTypes(gstin, input.taxTypes ?? {}, null, s),
          active: input.active,
          createdBy: actor.id,
          createdAt: at,
          updatedAt: at,
        });
        await this.activity.record(tx, actor, { action: 'Create', entityType: 'sales_customer', entityId: c.id, details: `Added party ${c.name}${c.gstin ? ` (${c.gstin})` : ''}` });
        return c;
      } catch (err) {
        if (err instanceof UniqueViolationError) throw conflict('name_taken', 'Another party already has that name');
        throw err;
      }
    });
  }

  async updateCustomer(actor: Actor, id: string, patch: Input): Promise<Customer> {
    return this.data.uow.run(async (tx) => {
      const before = await tx.salesCustomers.getById(id);
      if (!before) throw notFound('Party');
      const s = await readSettings(tx);
      const gstin = patch.gstin === undefined ? before.gstin : patch.gstin;
      const { taxTypes, ...rest } = patch;
      try {
        const c = (await tx.salesCustomers.update(id, { ...defined(rest), taxTypes: this.taxTypes(gstin, taxTypes ?? {}, before, s), updatedAt: isoNow(this.clock) }))!;
        await this.activity.record(tx, actor, { action: 'Edit', entityType: 'sales_customer', entityId: id, details: `Edited party ${c.name}` });
        return c;
      } catch (err) {
        if (err instanceof UniqueViolationError) throw conflict('name_taken', 'Another party already has that name');
        throw err;
      }
    });
  }

  /** Parties on any proforma, order or invoice can't be deleted; mark them inactive instead. */
  async removeCustomer(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const c = await tx.salesCustomers.getById(id);
      if (!c) throw notFound('Party');
      const uses = (await Promise.all([tx.proformas.listAll(), tx.salesOrders.listAll(), tx.salesInvoices.listAll()])).flat().filter((d) => d.billToId === id || d.shipToId === id);
      if (uses.length) throw new HttpError(409, 'in_use', `${c.name} is on ${uses.length} document(s). Mark the party inactive instead.`);
      await tx.salesCustomers.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'sales_customer', entityId: id, details: `Deleted party ${c.name}` });
    });
  }

  // ── Item master ───────────────────────────────────────────────────

  listItems(query: ListQuery<{ brand: string; grade: string; active: boolean }>) {
    return this.repos().salesItems.list(query);
  }

  private async itemFields(tx: Repos, i: Input) {
    const s = await readSettings(tx);
    if (!s.brands.includes(i.brand)) throw badRef('brand', 'Pick a brand from Sales settings');
    return { ...i, sqmFactor: i.sqmFactor ? round4(i.sqmFactor) : sqmFactorOf(i.width, i.length), subType: i.subType ?? null, hsn: i.hsn ?? null };
  }

  async createItem(actor: Actor, input: Input): Promise<SalesItem> {
    return this.data.uow.run(async (tx) => {
      const at = isoNow(this.clock);
      try {
        const it = await tx.salesItems.create({ id: newId(), ...((await this.itemFields(tx, input)) as Omit<SalesItem, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>), createdBy: actor.id, createdAt: at, updatedAt: at });
        await this.activity.record(tx, actor, { action: 'Create', entityType: 'sales_item', entityId: it.id, details: `Added item ${it.name}` });
        return it;
      } catch (err) {
        if (err instanceof UniqueViolationError) throw conflict('name_taken', 'Another item already has that name');
        throw err;
      }
    });
  }

  async updateItem(actor: Actor, id: string, patch: Input): Promise<SalesItem> {
    return this.data.uow.run(async (tx) => {
      const before = await tx.salesItems.getById(id);
      if (!before) throw notFound('Item');
      const { id: _i, createdBy: _c, createdAt: _a, updatedAt: _u, deletedAt: _d, ...cur } = before;
      // A changed size recalculates the factor unless one was given.
      const sizeChanged = (patch.width ?? cur.width) !== cur.width || (patch.length ?? cur.length) !== cur.length;
      const merged = { ...cur, ...defined(patch), ...(patch.sqmFactor === undefined && sizeChanged ? { sqmFactor: null } : {}) };
      try {
        const it = (await tx.salesItems.update(id, { ...(await this.itemFields(tx, merged)), updatedAt: isoNow(this.clock) }))!;
        await this.activity.record(tx, actor, { action: 'Edit', entityType: 'sales_item', entityId: id, details: `Edited item ${it.name}` });
        return it;
      } catch (err) {
        if (err instanceof UniqueViolationError) throw conflict('name_taken', 'Another item already has that name');
        throw err;
      }
    });
  }

  /** Items on documents can't be deleted (mark them inactive). Their price-list and weight-chart rows go with them. */
  async removeItem(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const it = await tx.salesItems.getById(id);
      if (!it) throw notFound('Item');
      const docs = (await Promise.all([tx.proformas.listAll(), tx.salesOrders.listAll(), tx.salesInvoices.listAll()])).flat() as { lines: { itemId: string | null }[] }[];
      if (docs.some((d) => d.lines.some((l) => l.itemId === id))) throw new HttpError(409, 'in_use', `${it.name} is on sales documents. Mark it inactive instead.`);
      const at = isoNow(this.clock);
      for (const p of (await tx.salesPrices.listAll()).filter((x) => x.itemId === id)) await tx.salesPrices.softDelete(p.id, at);
      for (const w of (await tx.salesWeights.listAll()).filter((x) => x.itemId === id)) await tx.salesWeights.softDelete(w.id, at);
      await tx.salesItems.softDelete(id, at);
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'sales_item', entityId: id, details: `Deleted item ${it.name}` });
    });
  }

  // ── Price list and weight chart ───────────────────────────────────

  /** Newest effective date first, with item names. */
  async listPrices(itemId?: string) {
    const [rows, items] = await Promise.all([this.repos().salesPrices.listAll(), this.repos().salesItems.listAll()]);
    const name = new Map(items.map((i) => [i.id, i.name]));
    return rows
      .filter((r) => !itemId || r.itemId === itemId)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ ...r, itemName: name.get(r.itemId) ?? '—' }));
  }

  async listWeights(itemId?: string) {
    const [rows, items] = await Promise.all([this.repos().salesWeights.listAll(), this.repos().salesItems.listAll()]);
    const name = new Map(items.map((i) => [i.id, i.name]));
    return rows
      .filter((r) => !itemId || r.itemId === itemId)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ ...r, itemName: name.get(r.itemId) ?? '—' }));
  }

  /** One row per item and date: a second one for the same day is a conflict (edit the first). */
  private async entry<K extends 'salesPrices' | 'salesWeights'>(tx: Repos, repo: K, i: Input, exceptId: string | null) {
    const item = await tx.salesItems.getById(i.itemId);
    if (!item) throw badRef('itemId', 'Unknown item');
    const rows = (await tx[repo].listAll()) as (PriceEntry | WeightEntry)[];
    if (rows.some((r) => r.id !== exceptId && r.itemId === i.itemId && r.effectiveDate === i.effectiveDate)) throw conflict('duplicate', `${item.name} already has an entry effective ${i.effectiveDate}`);
    return item;
  }

  async savePrice(actor: Actor, id: string | null, input: Input) {
    return this.data.uow.run(async (tx) => {
      const before = id ? await tx.salesPrices.getById(id) : null;
      if (id && !before) throw notFound('Price entry');
      const merged = { ...before, ...defined(input) } as PriceEntry;
      const item = await this.entry(tx, 'salesPrices', merged, id);
      const at = isoNow(this.clock);
      const row = before
        ? (await tx.salesPrices.update(before.id, { itemId: merged.itemId, effectiveDate: merged.effectiveDate, ratePaise: merged.ratePaise, updatedAt: at }))!
        : await tx.salesPrices.create({ id: newId(), itemId: merged.itemId, effectiveDate: merged.effectiveDate, ratePaise: merged.ratePaise, createdBy: actor.id, createdAt: at, updatedAt: at });
      await this.activity.record(tx, actor, { action: before ? 'Edit' : 'Create', entityType: 'sales_price', entityId: row.id, details: `${item.name}: ${money(row.ratePaise)}/sq m from ${row.effectiveDate}` });
      return { ...row, itemName: item.name };
    });
  }

  async saveWeight(actor: Actor, id: string | null, input: Input) {
    return this.data.uow.run(async (tx) => {
      const before = id ? await tx.salesWeights.getById(id) : null;
      if (id && !before) throw notFound('Weight entry');
      const merged = { ...before, ...defined(input) } as WeightEntry;
      const item = await this.entry(tx, 'salesWeights', merged, id);
      const at = isoNow(this.clock);
      const row = before
        ? (await tx.salesWeights.update(before.id, { itemId: merged.itemId, effectiveDate: merged.effectiveDate, weightKg: merged.weightKg, updatedAt: at }))!
        : await tx.salesWeights.create({ id: newId(), itemId: merged.itemId, effectiveDate: merged.effectiveDate, weightKg: merged.weightKg, createdBy: actor.id, createdAt: at, updatedAt: at });
      await this.activity.record(tx, actor, { action: before ? 'Edit' : 'Create', entityType: 'sales_weight', entityId: row.id, details: `${item.name}: ${row.weightKg} kg/board from ${row.effectiveDate}` });
      return { ...row, itemName: item.name };
    });
  }

  async removeEntry(actor: Actor, kind: 'price' | 'weight', id: string) {
    await this.data.uow.run(async (tx) => {
      const repo = kind === 'price' ? tx.salesPrices : tx.salesWeights;
      const row = await repo.getById(id);
      if (!row) throw notFound(kind === 'price' ? 'Price entry' : 'Weight entry');
      await repo.softDelete(id, isoNow(this.clock));
      const item = await tx.salesItems.getById(row.itemId);
      await this.activity.record(tx, actor, { action: 'Delete', entityType: `sales_${kind}`, entityId: id, details: `Removed ${kind} entry for ${item?.name ?? 'an item'} from ${row.effectiveDate}` });
    });
  }

  // ── FG inventory ──────────────────────────────────────────────────

  /** Stock by specification, with what pending orders of the same firm and spec have reserved (legacy fg_inventory). */
  async listFg(firm?: Firm, grade?: string): Promise<FgStockView[]> {
    const [rows, orders] = await Promise.all([this.repos().fgStock.listAll(), this.repos().salesOrders.listAll()]);
    const reserved = new Map<string, number>();
    for (const o of orders)
      if (isOpenSo(o.status))
        for (const l of o.lines) {
          const k = `${o.firm}|${specKey(l.grade, l.thic, l.width, l.length)}`;
          reserved.set(k, (reserved.get(k) ?? 0) + l.qtySqm);
        }
    return rows
      .filter((r) => (!firm || r.firm === firm) && (!grade || r.grade === grade))
      .sort((a, b) => a.grade.localeCompare(b.grade) || a.thic - b.thic)
      .map((r) => {
        const reservedSqm = round4(reserved.get(`${r.firm}|${specKey(r.grade, r.thic, r.width, r.length)}`) ?? 0);
        const availableSqm = round4(Math.max(0, r.qtyOnHandSqm - reservedSqm));
        return { ...r, reservedSqm, availableSqm, low: availableSqm < r.reorderSqm };
      });
  }

  async saveFg(actor: Actor, id: string | null, input: Input): Promise<FgStock> {
    return this.data.uow.run(async (tx) => {
      const before = id ? await tx.fgStock.getById(id) : null;
      if (id && !before) throw notFound('Stock entry');
      const m = { ...before, ...defined(input) } as FgStock;
      const dup = (await tx.fgStock.listAll()).find((r) => r.id !== id && r.firm === m.firm && specKey(r.grade, r.thic, r.width, r.length) === specKey(m.grade, m.thic, m.width, m.length));
      if (dup) throw conflict('duplicate', 'That specification already has a stock entry; edit it instead');
      const at = isoNow(this.clock);
      const fields = { firm: m.firm, grade: m.grade, thic: m.thic, width: m.width, length: m.length, qtyOnHandSqm: round4(m.qtyOnHandSqm), reorderSqm: round4(m.reorderSqm) };
      const row = before ? (await tx.fgStock.update(before.id, { ...fields, updatedAt: at }))! : await tx.fgStock.create({ id: newId(), ...fields, createdBy: actor.id, createdAt: at, updatedAt: at });
      await this.activity.record(tx, actor, {
        action: before ? 'Edit' : 'Create',
        entityType: 'sales_fg',
        entityId: row.id,
        details: `${FIRM_LABEL[row.firm]} FG ${row.grade} ${row.thic} mm ${row.width}×${row.length}: ${row.qtyOnHandSqm} sq m on hand`,
      });
      return row;
    });
  }

  async removeFg(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const r = await tx.fgStock.getById(id);
      if (!r) throw notFound('Stock entry');
      await tx.fgStock.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'sales_fg', entityId: id, details: `Removed FG entry ${r.grade} ${r.thic} mm ${r.width}×${r.length}` });
    });
  }

  // ── Inter-company ─────────────────────────────────────────────────

  private async icViews(rows: Intercompany[]): Promise<IntercompanyView[]> {
    const llp = new Set((await this.repos().salesInvoices.listAll()).filter((i) => i.firm === 'llp').map((i) => i.invNo.toLowerCase()));
    return rows.map((r) => ({ ...r, taxPaise: r.cgstPaise + r.sgstPaise + r.igstPaise, matched: llp.has(r.billingDoc.toLowerCase()) }));
  }

  async listIntercompany(query: ListQuery<{ from: string; to: string }>) {
    const res = await this.repos().intercompany.list(query);
    const all = await this.icViews(await this.repos().intercompany.listAll());
    return {
      rows: await this.icViews(res.rows),
      total: res.total,
      kpis: {
        count: all.length,
        qtySqm: round4(all.reduce((s, r) => s + r.qtySqm, 0)),
        totalPaise: all.reduce((s, r) => s + r.totalPaise, 0),
        taxPaise: all.reduce((s, r) => s + r.taxPaise, 0),
        matched: all.filter((r) => r.matched).length,
      },
    };
  }

  async allIntercompany() {
    return this.icViews(await this.repos().intercompany.listAll());
  }

  async saveIntercompany(actor: Actor, id: string | null, input: Input): Promise<IntercompanyView> {
    const row = await this.data.uow.run(async (tx) => {
      const before = id ? await tx.intercompany.getById(id) : null;
      if (id && !before) throw notFound('Inter-company entry');
      const m = { ...before, ...defined(input) } as Intercompany;
      const materialPaise = Math.round(round4(m.qtySqm) * m.ratePaise);
      const fields = {
        billingDoc: m.billingDoc,
        billingDate: m.billingDate,
        materialDesc: m.materialDesc,
        grade: m.grade ?? null,
        thic: m.thic ?? null,
        width: m.width ?? null,
        length: m.length ?? null,
        pcs: m.pcs,
        qtySqm: round4(m.qtySqm),
        ratePaise: m.ratePaise,
        materialPaise,
        cgstPaise: m.cgstPaise,
        sgstPaise: m.sgstPaise,
        igstPaise: m.igstPaise,
        freightPaise: m.freightPaise,
        totalPaise: materialPaise + m.cgstPaise + m.sgstPaise + m.igstPaise + m.freightPaise,
        vehicleNo: m.vehicleNo ?? null,
      };
      const at = isoNow(this.clock);
      try {
        const r = before ? (await tx.intercompany.update(before.id, { ...fields, updatedAt: at }))! : await tx.intercompany.create({ id: newId(), ...fields, createdBy: actor.id, createdAt: at, updatedAt: at });
        await this.activity.record(tx, actor, { action: before ? 'Edit' : 'Create', entityType: 'sales_intercompany', entityId: r.id, details: `${r.billingDoc}: ${r.materialDesc}, ${money(r.totalPaise)}` });
        return r;
      } catch (err) {
        if (err instanceof UniqueViolationError) throw conflict('duplicate', 'That billing document is already recorded');
        throw err;
      }
    });
    return (await this.icViews([row]))[0]!;
  }

  async removeIntercompany(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const r = await tx.intercompany.getById(id);
      if (!r) throw notFound('Inter-company entry');
      await tx.intercompany.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'sales_intercompany', entityId: id, details: `Removed inter-company ${r.billingDoc}` });
    });
  }

  // ── Settings ──────────────────────────────────────────────────────

  async updateSettings(actor: Actor, input: Partial<Omit<SalesSettings, 'emailRecipients' | 'emailTemplates'>> & { emailRecipients?: Partial<SalesSettings['emailRecipients']>; emailTemplates?: Partial<SalesSettings['emailTemplates']> }): Promise<SalesSettings> {
    return this.data.uow.run(async (tx) => {
      const at = isoNow(this.clock);
      const cur = await readSettings(tx);
      const patch = {
        ...input,
        ...(input.emailRecipients ? { emailRecipients: { ...cur.emailRecipients, ...input.emailRecipients } } : {}),
        ...(input.emailTemplates ? { emailTemplates: { ...cur.emailTemplates, ...input.emailTemplates } } : {}),
      };
      const changed = Object.entries(patch).filter(([, v]) => v !== undefined) as [keyof SalesSettings, unknown][];
      for (const [k, v] of changed) await tx.settings.set(SETTING_KEYS[k], v, actor.id, at);
      if (changed.length) await this.activity.record(tx, actor, { action: 'Edit', entityType: 'sales_settings', details: `Changed Sales settings: ${changed.map(([k]) => k).join(', ')}` });
      return readSettings(tx);
    });
  }
}
