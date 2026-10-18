import {
  amountFor,
  averageRate,
  fyOf,
  MATERIALS,
  poTotals,
  taxOn,
  type PoLine,
  type PoFilters,
  type PoOption,
  type PoStats,
  type PurchaseOrder,
  type PurchaseMeta,
  type PurchaseOrderView,
  type PurchaseProductOption,
  type PurchaseReturn,
  type PurchaseReturnView,
  type PurchaseType,
  type PurchaseVendorOption,
  type TaxType,
  type TypeKind,
} from '../../contracts/purchase';
import type { CompanyBlock } from '../../contracts/sampletrack';
import type { TncClause } from '../../contracts/vendors';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { conflict, HttpError, notFound, validationFailed } from '../../lib/errors';
import { writeXlsx } from '../../lib/spreadsheet';
import { normName } from '../../lib/text';
import { UniqueViolationError, type DataLayer, type ListQuery, type PoPatch, type Repos } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { changedKeys } from '../sampletrack/masters/common';
import type { CompanyService } from '../sampletrack/settings/company-service';
import { nextCode } from '../vendors/masters';
import { currentFy, fyList, isPosted, materialLabel, returnedByEntry, stockVariety } from './common';
import type { PoCreate, PoUpdate, ReturnCreate } from './validation';

const pad3 = (n: number) => String(n).padStart(3, '0');
const rupees = (p: number) => Math.round(p) / 100;

// ── Purchase orders ──────────────────────────────────────────────────

export interface PoPrintPayload {
  company: CompanyBlock;
  po: PurchaseOrderView;
  vendor: { address: string | null; gstin: string | null; pan: string | null; phone: string | null; email: string | null; paymentTerms: string | null } | null;
  tnc: Pick<TncClause, 'id' | 'title' | 'body'>[];
  generatedAt: string;
}

export class PurchaseOrderService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly company: CompanyService,
    private readonly clock: Clock,
  ) {}

  /** Received = SPL quantity of posted entries against the PO, less what was returned from those lots (legacy getReceivedQtyForPO). */
  private async views(pos: PurchaseOrder[], repos: Repos = this.data.repos): Promise<PurchaseOrderView[]> {
    const userIds = [...new Set(pos.flatMap((p) => [p.createdBy, p.reviewedBy, p.approvedBy]).filter((x): x is string => !!x))];
    const [people, returned] = await Promise.all([repos.users.getByIds(userIds), returnedByEntry(this.data)]);
    const name = (id: string | null | undefined) => (id ? (people.find((u) => u.id === id)?.name ?? null) : null);
    return Promise.all(
      pos.map(async (p) => {
        const received = Math.round((await repos.purchaseEntries.listByPo(p.id)).filter(isPosted).reduce((s, e) => s + e.splQty - (returned.get(e.id) ?? 0), 0) * 1000) / 1000;
        const pct = p.qty > 0 ? Math.min(100, Math.round((received / p.qty) * 100)) : 0;
        // POs saved before lines existed are one line of their material.
        const lines: PoLine[] = p.lines?.length ? p.lines : [{ itemId: null, itemName: materialLabel(p.material), hsn: null, qty: p.qty, ratePaise: p.ratePaise, amountPaise: amountFor(p.material, p.qty, p.ratePaise) }];
        const totals = poTotals(p.material, lines, p.freightPaise ?? 0, p.taxType ?? 'SG+CG', p.gstPct ?? 18);
        return {
          ...p,
          lines,
          taxType: p.taxType ?? 'SG+CG',
          gstPct: p.gstPct ?? 18,
          freightPaise: p.freightPaise ?? 0,
          paymentTerms: p.paymentTerms ?? null,
          deliveryTerms: p.deliveryTerms ?? null,
          deliveryDate: p.deliveryDate ?? null,
          quotationRef: p.quotationRef ?? null,
          reviewedBy: p.reviewedBy ?? null,
          reviewedAt: p.reviewedAt ?? null,
          valuePaise: totals.itemsPaise,
          totals,
          receivedQty: received,
          balanceQty: Math.round((p.qty - received) * 1000) / 1000,
          pctComplete: pct,
          progress: received >= p.qty ? 'Closed' : received > 0 ? 'Partial' : 'Open',
          createdByName: name(p.createdBy),
          reviewedByName: name(p.reviewedBy),
          approvedByName: name(p.approvedBy),
        };
      }),
    );
  }

  /** Lines with their amounts, and the PO's total quantity and average rate (what entries are received against). */
  private linesOf(material: PurchaseOrder['material'], input: { itemId?: string | null; itemName: string; hsn?: string | null; qty: number; ratePaise: number }[]) {
    const lines: PoLine[] = input.map((l) => ({ itemId: l.itemId ?? null, itemName: l.itemName, hsn: l.hsn ?? null, qty: l.qty, ratePaise: l.ratePaise, amountPaise: amountFor(material, l.qty, l.ratePaise) }));
    return { lines, qty: Math.round(lines.reduce((s, l) => s + l.qty, 0) * 1000) / 1000, ratePaise: averageRate(material, lines.map((l) => ({ invQty: l.qty, ratePaise: l.ratePaise }))) };
  }

  async list(query: ListQuery<PoFilters>): Promise<{ rows: PurchaseOrderView[]; total: number; stats: PoStats }> {
    const f = query.filters ?? {};
    const all = await this.views(await this.data.repos.purchaseOrders.listAll({ material: f.material }));
    const q = query.q?.trim().toLowerCase();
    const rows = all
      .filter((p) => !f.fy || fyOf(p.date) === f.fy)
      .filter((p) => !f.status || p.status === f.status)
      .filter((p) => !f.progress || p.progress === f.progress)
      .filter((p) => !q || [p.poNo, p.vendorName].some((s) => s.toLowerCase().includes(q)));
    const stats: PoStats = {
      total: all.length,
      valuePaise: all.reduce((s, p) => s + p.valuePaise, 0),
      open: all.filter((p) => p.progress === 'Open').length,
      partial: all.filter((p) => p.progress === 'Partial').length,
      closed: all.filter((p) => p.progress === 'Closed').length,
    };
    const page = Math.max(1, query.page ?? 1);
    const size = Math.min(100, query.pageSize ?? 20);
    return { rows: rows.slice((page - 1) * size, page * size), total: rows.length, stats };
  }

  async get(id: string): Promise<PurchaseOrderView> {
    const p = await this.data.repos.purchaseOrders.getById(id);
    if (!p) throw notFound('Purchase order');
    return (await this.views([p]))[0]!;
  }

  /** Entry form dropdown: this material's POs, with their balance (legacy openAddForm PO select). */
  async options(material: PurchaseOrder['material']): Promise<PoOption[]> {
    const views = await this.views(await this.data.repos.purchaseOrders.listAll({ material }));
    return views.map(({ id, poNo, vendorId, vendorName, ratePaise, balanceQty }) => ({ id, poNo, vendorId, vendorName, ratePaise, balanceQty }));
  }

  private async checkTnc(tx: Repos, ids: string[]) {
    for (const id of ids) if (!(await tx.tnc.getById(id))) throw validationFailed('Invalid input', [{ path: 'tncIds', message: `Unknown T&C clause ${id}` }]);
  }

  async create(actor: Actor, input: PoCreate): Promise<PurchaseOrderView> {
    const at = isoNow(this.clock);
    const po = await this.uniquePoNo(() =>
      this.data.uow.run(async (tx) => {
        await this.checkTnc(tx, input.tncIds);
        const poNo =
          input.poNo ??
          (await nextCode(tx, this.clock, 'PO', (yy, n) => `PO-${yy}-${pad3(n)}`, async (c) => !!(await tx.purchaseOrders.getByPoNo(c))));
        const p = await tx.purchaseOrders.create({
          id: newId(),
          poNo,
          date: input.date,
          material: input.material,
          vendorId: input.vendorId ?? null,
          vendorName: input.vendorName,
          ...this.linesOf(input.material, input.lines),
          taxType: input.taxType,
          gstPct: input.gstPct,
          freightPaise: input.freightPaise,
          paymentTerms: input.paymentTerms ?? null,
          deliveryTerms: input.deliveryTerms ?? null,
          deliveryDate: input.deliveryDate ?? null,
          quotationRef: input.quotationRef ?? null,
          remarks: input.remarks ?? null,
          tncIds: [...new Set(input.tncIds)],
          status: 'pending',
          reviewedBy: null,
          reviewedAt: null,
          approvedBy: null,
          approvedAt: null,
          createdBy: actor.id,
          createdAt: at,
          updatedAt: at,
        });
        await this.activity.record(tx, actor, { action: 'Create', entityType: 'purchase_order', entityId: p.id, details: `Created PO ${p.poNo} for ${materialLabel(p.material)} (${p.vendorName})` });
        return p;
      }),
    );
    return (await this.views([po]))[0]!;
  }

  /** Editing an approved PO sends it back for approval. */
  async update(actor: Actor, id: string, input: PoUpdate): Promise<PurchaseOrderView> {
    const po = await this.uniquePoNo(() =>
      this.data.uow.run(async (tx) => {
        const before = await tx.purchaseOrders.getById(id);
        if (!before) throw notFound('Purchase order');
        if (input.tncIds) await this.checkTnc(tx, input.tncIds);
        if (input.material && input.material !== before.material && (await tx.purchaseEntries.listByPo(id)).length) {
          throw conflict('po_in_use', 'Entries are already received against this PO, so its material can’t change');
        }
        const { poNo, lines, ...rest } = input;
        const material = input.material ?? before.material;
        const patchIn: Partial<PurchaseOrder> = { ...rest, ...(poNo ? { poNo } : {}), ...(lines ? this.linesOf(material, lines) : input.material && before.lines?.length ? this.linesOf(material, before.lines) : {}) };
        const changed = changedKeys(before, patchIn).filter((k) => (k !== 'tncIds' || patchIn.tncIds!.join() !== before.tncIds.join()) && (k !== 'lines' || JSON.stringify(patchIn.lines) !== JSON.stringify(before.lines)));
        if (!changed.length) return before;
        const patch: PoPatch = { ...Object.fromEntries(changed.map((k) => [k, patchIn[k]])), updatedAt: isoNow(this.clock) };
        if (before.status !== 'pending') Object.assign(patch, { status: 'pending', reviewedBy: null, reviewedAt: null, approvedBy: null, approvedAt: null });
        const updated = (await tx.purchaseOrders.update(id, patch))!;
        await this.activity.record(tx, actor, {
          action: 'Edit',
          entityType: 'purchase_order',
          entityId: id,
          details: `Updated PO ${updated.poNo}: ${changed.join(', ')}${before.status !== 'pending' ? '; needs review and approval again' : ''}`,
        });
        return updated;
      }),
    );
    return (await this.views([po]))[0]!;
  }

  /** pending → reviewed (the "Reviewed by" signature on the PO). */
  async review(actor: Actor, id: string): Promise<PurchaseOrderView> {
    const po = await this.data.uow.run(async (tx) => {
      const p = await tx.purchaseOrders.getById(id);
      if (!p) throw notFound('Purchase order');
      if (p.status !== 'pending') throw conflict('not_pending', p.status === 'approved' ? 'This PO is already approved' : 'This PO is already reviewed');
      const at = isoNow(this.clock);
      const updated = (await tx.purchaseOrders.update(id, { status: 'reviewed', reviewedBy: actor.id, reviewedAt: at, updatedAt: at }))!;
      await this.activity.record(tx, actor, { action: 'StatusChange', entityType: 'purchase_order', entityId: id, details: `Reviewed PO ${p.poNo}` });
      return updated;
    });
    return (await this.views([po]))[0]!;
  }

  async approve(actor: Actor, id: string): Promise<PurchaseOrderView> {
    const po = await this.data.uow.run(async (tx) => {
      const p = await tx.purchaseOrders.getById(id);
      if (!p) throw notFound('Purchase order');
      if (p.status === 'approved') throw conflict('already_approved', 'This PO is already approved');
      const at = isoNow(this.clock);
      const updated = (await tx.purchaseOrders.update(id, { status: 'approved', approvedBy: actor.id, approvedAt: at, updatedAt: at }))!;
      await this.activity.record(tx, actor, { action: 'Approve', entityType: 'purchase_order', entityId: id, details: `Approved PO ${p.poNo}` });
      return updated;
    });
    return (await this.views([po]))[0]!;
  }

  /** Blocked while entries are received against it. */
  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const p = await tx.purchaseOrders.getById(id);
      if (!p) throw notFound('Purchase order');
      const used = (await tx.purchaseEntries.listByPo(id)).length;
      if (used) throw new HttpError(409, 'in_use', `PO ${p.poNo} has ${used} entr${used === 1 ? 'y' : 'ies'} against it and cannot be deleted`);
      await tx.purchaseOrders.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'purchase_order', entityId: id, details: `Deleted PO ${p.poNo}` });
    });
  }

  async printPayload(actor: Actor, id: string): Promise<PoPrintPayload> {
    const po = await this.get(id);
    const v = po.vendorId ? await this.data.repos.vendors.getById(po.vendorId) : (await this.data.repos.vendors.findByName(po.vendorName))[0] ?? null;
    const clauses = (await Promise.all(po.tncIds.map((t) => this.data.repos.tnc.getById(t)))).filter((t): t is TncClause => !!t);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Print', entityType: 'purchase_order', entityId: id, details: `Printed PO ${po.poNo}` }));
    return {
      company: await this.company.block(),
      po,
      vendor: v
        ? { address: [v.address, v.city, v.state, v.pincode].filter(Boolean).join(', ') || null, gstin: v.gst, pan: v.pan, phone: v.phone, email: v.email, paymentTerms: v.paymentTerms }
        : null,
      tnc: clauses.map(({ id: cid, title, body }) => ({ id: cid, title, body })),
      generatedAt: isoNow(this.clock),
    };
  }

  async exportXlsx(actor: Actor): Promise<Uint8Array> {
    const rows = await this.views(await this.data.repos.purchaseOrders.listAll());
    const bytes = writeXlsx([
      {
        name: 'PO Register',
        rows,
        columns: [
          { header: 'PO No', value: (p: PurchaseOrderView) => p.poNo },
          { header: 'Date', value: (p: PurchaseOrderView) => p.date },
          { header: 'Material', value: (p: PurchaseOrderView) => materialLabel(p.material) },
          { header: 'Vendor', value: (p: PurchaseOrderView) => p.vendorName },
          { header: 'PO Qty', value: (p: PurchaseOrderView) => p.qty },
          { header: 'Rate (₹)', value: (p: PurchaseOrderView) => rupees(p.ratePaise) },
          { header: 'PO Value (₹)', value: (p: PurchaseOrderView) => rupees(p.valuePaise) },
          { header: 'Received Qty', value: (p: PurchaseOrderView) => p.receivedQty },
          { header: 'Balance Qty', value: (p: PurchaseOrderView) => p.balanceQty },
          { header: '% Complete', value: (p: PurchaseOrderView) => p.pctComplete },
          { header: 'Progress', value: (p: PurchaseOrderView) => p.progress },
          { header: 'Approval', value: (p: PurchaseOrderView) => p.status },
        ],
      },
    ]);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'purchase_order', details: `Exported ${rows.length} POs` }));
    return bytes;
  }

  private async uniquePoNo<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof UniqueViolationError && err.field === 'poNo') throw conflict('po_no_taken', 'Another PO already has that number');
      throw err;
    }
  }
}

// ── Returns (legacy saveReturn) ──────────────────────────────────────

export class PurchaseReturnService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  private async views(rows: PurchaseReturn[]): Promise<PurchaseReturnView[]> {
    const people = await this.data.repos.users.getByIds([...new Set(rows.map((r) => r.approvedBy).filter((x): x is string => !!x))]);
    return rows.map((r) => ({
      ...r,
      amount: taxOn(amountFor(r.material, r.qty, r.ratePaise), r.taxType, r.gstPct),
      approvedByName: r.approvedBy ? (people.find((u) => u.id === r.approvedBy)?.name ?? null) : null,
    }));
  }

  async list(query: ListQuery<{ material: string; status: string; fy: string }>) {
    const { rows, total } = await this.data.repos.purchaseReturns.list(query);
    return { rows: await this.views(rows), total };
  }

  /** Returns reduce stock, and the linked lot's quantity, as soon as they're saved (legacy); approval records who signed off. */
  async create(actor: Actor, input: ReturnCreate): Promise<PurchaseReturnView> {
    const at = isoNow(this.clock);
    const r = await this.data.uow.run(async (tx) => {
      const entry = input.entryId ? await tx.purchaseEntries.getById(input.entryId) : null;
      if (input.entryId && !entry) throw validationFailed('Invalid input', [{ path: 'entryId', message: 'Unknown purchase entry' }]);
      if (entry && entry.material !== input.material) throw validationFailed('Invalid input', [{ path: 'material', message: `That entry is ${materialLabel(entry.material)}` }]);
      if (entry) {
        const already = (await tx.purchaseReturns.listBetween('0000-01-01', '9999-12-31')).filter((x) => x.entryId === entry.id).reduce((t, x) => t + x.qty, 0);
        const left = Math.round((entry.splQty - already) * 1000) / 1000;
        if (input.qty > left) throw validationFailed('Invalid input', [{ path: 'qty', message: `Lot ${entry.lotNo} has ${left} left to return` }]);
      }
      const vendorName = input.vendorName ?? entry?.vendorName;
      if (!vendorName) throw validationFailed('Invalid input', [{ path: 'vendorName', message: 'Vendor is required' }]);
      const returnNo = await nextCode(tx, this.clock, 'RET', (yy, n) => `RET-${yy}-${pad3(n)}`, async () => false);
      const ret = await tx.purchaseReturns.create({
        id: newId(),
        returnNo,
        date: input.date,
        material: input.material,
        // Nilgiri: the stock row it comes off (the lot's product, as in the ledger).
        species: input.material === 'nilgiri' ? ((entry ? stockVariety(entry) : null) ?? input.species ?? null) : null,
        entryId: entry?.id ?? null,
        vendorName,
        originalInvoiceNo: input.originalInvoiceNo ?? entry?.invoiceNo ?? null,
        qty: input.qty,
        ratePaise: input.ratePaise,
        taxType: (input.taxType ?? entry?.taxType ?? 'SG+CG') as TaxType,
        gstPct: input.gstPct ?? entry?.gstPct ?? 18,
        reason: input.reason ?? null,
        status: 'pending',
        approvedBy: null,
        approvedAt: null,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await this.activity.record(tx, actor, {
        action: 'Create',
        entityType: 'purchase_return',
        entityId: ret.id,
        details: `Purchase return ${ret.returnNo}: ${ret.qty} ${materialLabel(ret.material)} to ${ret.vendorName}`,
      });
      return ret;
    });
    return (await this.views([r]))[0]!;
  }

  async approve(actor: Actor, id: string): Promise<PurchaseReturnView> {
    const r = await this.data.uow.run(async (tx) => {
      const ret = await tx.purchaseReturns.getById(id);
      if (!ret) throw notFound('Purchase return');
      if (ret.status === 'approved') throw conflict('already_approved', 'This return is already approved');
      const at = isoNow(this.clock);
      const u = (await tx.purchaseReturns.update(id, { status: 'approved', approvedBy: actor.id, approvedAt: at, updatedAt: at }))!;
      await this.activity.record(tx, actor, { action: 'Approve', entityType: 'purchase_return', entityId: id, details: `Approved purchase return ${ret.returnNo}` });
      return u;
    });
    return (await this.views([r]))[0]!;
  }

  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const ret = await tx.purchaseReturns.getById(id);
      if (!ret) throw notFound('Purchase return');
      await tx.purchaseReturns.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'purchase_return', entityId: id, details: `Deleted purchase return ${ret.returnNo}` });
    });
  }
}

// ── Type masters and the vendor picker ───────────────────────────────

export class PurchaseMasterService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  async meta(): Promise<PurchaseMeta> {
    return { materials: MATERIALS, currentFy: currentFy(this.clock), fys: await fyList(this.data, this.clock), types: await this.types() };
  }

  types(kind?: TypeKind): Promise<PurchaseType[]> {
    return this.data.repos.purchaseTypes.listAll(kind);
  }

  async addType(actor: Actor, input: { kind: TypeKind; name: string }): Promise<PurchaseType> {
    const at = isoNow(this.clock);
    try {
      return await this.data.uow.run(async (tx) => {
        const existing = await tx.purchaseTypes.listAll(input.kind);
        const t = await tx.purchaseTypes.create({
          id: newId(),
          kind: input.kind,
          name: input.name.replace(/\s+/g, ' '),
          sortOrder: existing.reduce((m, x) => Math.max(m, x.sortOrder), 0) + 1,
          createdBy: actor.id,
          createdAt: at,
          updatedAt: at,
        });
        await this.activity.record(tx, actor, { action: 'Create', entityType: 'purchase_type', entityId: t.id, details: `Added ${kindLabel(t.kind)} ${t.name}` });
        return t;
      });
    } catch (err) {
      if (err instanceof UniqueViolationError) throw conflict('type_exists', `${input.name} is already in the list`);
      throw err;
    }
  }

  /** At least one type of each kind must remain (legacy). Entries keep the name they were saved with. */
  async removeType(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const t = await tx.purchaseTypes.getById(id);
      if (!t) throw notFound('Type');
      if ((await tx.purchaseTypes.listAll(t.kind)).length <= 1) throw conflict('last_type', 'At least one type must remain');
      await tx.purchaseTypes.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'purchase_type', entityId: id, details: `Removed ${kindLabel(t.kind)} ${t.name}` });
    });
  }

  /** Every product in the product master, by name (entry and PO item pickers). */
  async productOptions(): Promise<PurchaseProductOption[]> {
    const [products, cats] = await Promise.all([this.data.repos.vendorProducts.listAll(), this.data.repos.vendorCategories.listAll()]);
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    return products
      .map((p) => ({ id: p.id, code: p.code, name: p.name, unit: p.unit, hsn: p.hsn, gstRate: p.gstRate, categoryName: catName.get(p.categoryId) ?? '' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  }

  /**
   * Entry and PO forms: vendors from the Vendors module (not blacklisted), with their items
   * (legacy fillVendorFromPortal / populateItemDropdown). Tax type: SG+CG in Gujarat, IGST elsewhere.
   */
  async vendorOptions(q: string | undefined): Promise<PurchaseVendorOption[]> {
    const { vendors, vendorProducts, vendorCategories } = this.data.repos;
    const [all, products, cats] = await Promise.all([vendors.listAll(), vendorProducts.listAll(), vendorCategories.listAll()]);
    const productById = new Map(products.map((p) => [p.id, p]));
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const needle = q ? normName(q) : '';
    return all
      .filter((v) => v.status !== 'blacklisted')
      .filter((v) => !needle || [v.name, v.code, v.city ?? '', v.gst ?? ''].some((s) => normName(s).includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
      .slice(0, 30)
      .map((v) => ({
        id: v.id,
        code: v.code,
        name: v.name,
        status: v.status,
        gstin: v.gst,
        pan: v.pan,
        city: v.city,
        state: v.state,
        mobile: v.phone,
        suggestedTaxType: !v.state || normName(v.state) === 'gujarat' ? 'SG+CG' : 'IGST',
        paymentTerms: v.paymentTerms,
        items: v.productIds
          .map((id) => productById.get(id))
          .filter((p) => !!p)
          .map((p) => ({ id: p.id, name: p.name, hsn: p.hsn, gstRate: p.gstRate, categoryName: catName.get(p.categoryId) ?? '' })),
      }));
  }
}

const kindLabel = (k: TypeKind) => (k === 'nilgiri_species' ? 'Nilgiri species' : 'face veneer type');
