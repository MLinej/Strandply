import {
  APPROVAL_LABEL,
  boardTons,
  docTotals,
  EMPTY_DISPATCH,
  hasDispatch,
  lineAmount,
  PI_STATUS_LABEL,
  PI_STATUSES,
  round4,
  SO_STATUS_LABEL,
  SO_STATUSES,
  totalWeightKg,
  type DispatchInfo,
  type DocListFilters,
  type DocSummary,
  type InvoiceLine,
  type PiStatus,
  type Proforma,
  type ProformaView,
  type SalesInvoice,
  type SalesInvoiceView,
  type SalesOrder,
  type SalesOrderView,
  type SoLineProgress,
  type SoStatus,
} from '../../contracts/sales';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { conflict, HttpError, notFound, validationFailed } from '../../lib/errors';
import type { DataLayer, ListQuery, Repos } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { badRef, buildOrderLines, nameMap, nextNo, partyTaxType, readSettings, resolveParties, today } from './common';

/* eslint-disable @typescript-eslint/no-explicit-any -- inputs are validated by zod at the route */
type Input = Record<string, any>;

const money = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const defined = (o: Input) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
type ListRes<T> = { rows: T[]; total: number; summary: DocSummary };

/** What each invoice line took from an order, by order and line. */
async function invoicedBySo(repos: Repos, exceptInvoiceId?: string) {
  const out = new Map<string, { pcs: number; sqm: number }[]>();
  const nos = new Map<string, string[]>();
  for (const inv of await repos.salesInvoices.listAll()) {
    if (!inv.soId || inv.id === exceptInvoiceId) continue;
    nos.set(inv.soId, [...(nos.get(inv.soId) ?? []), inv.invNo]);
    const arr = out.get(inv.soId) ?? [];
    for (const l of inv.lines) {
      if (l.soLine === null) continue;
      const cur = arr[l.soLine] ?? { pcs: 0, sqm: 0 };
      arr[l.soLine] = { pcs: cur.pcs + l.pcs, sqm: round4(cur.sqm + l.qtySqm) };
    }
    out.set(inv.soId, arr);
  }
  return { taken: out, nos };
}

/** KPI figures over all of a firm's documents. */
function summarize(rows: { firm: string; totalPaise: number; status?: string; approval?: string; lines: { amountPaise: number }[]; freightPaise: number }[], firm: string | undefined): DocSummary {
  const mine = rows.filter((r) => !firm || r.firm === firm);
  const byStatus: Record<string, number> = {};
  for (const r of mine) {
    const k = r.status ?? r.approval ?? '';
    byStatus[k] = (byStatus[k] ?? 0) + 1;
  }
  const totalPaise = mine.reduce((s, r) => s + r.totalPaise, 0);
  const taxable = mine.reduce((s, r) => s + r.lines.reduce((t, l) => t + l.amountPaise, 0) + r.freightPaise, 0);
  return { count: mine.length, totalPaise, gstPaise: totalPaise - taxable, byStatus };
}

/** Proformas, sales orders and invoices (legacy proforma_invoice, sales_orders, sales_invoices). */
export class SalesDocumentService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  // ── Views ─────────────────────────────────────────────────────────

  async proformaViews(rows: Proforma[], repos: Repos = this.data.repos): Promise<ProformaView[]> {
    const name = await nameMap(repos, rows.map((r) => r.createdBy));
    return rows.map((r) => ({ ...r, totals: docTotals(r.lines, r.freightPaise, r.taxType, r.gstPct), totalWeightKg: totalWeightKg(r.lines), createdByName: name(r.createdBy) }));
  }

  async orderViews(rows: SalesOrder[], repos: Repos = this.data.repos): Promise<SalesOrderView[]> {
    const [name, { taken, nos }] = await Promise.all([nameMap(repos, rows.map((r) => r.createdBy)), invoicedBySo(repos)]);
    return rows.map((r) => {
      const t = taken.get(r.id) ?? [];
      const progress: SoLineProgress[] = r.lines.map((l, i) => {
        const done = t[i] ?? { pcs: 0, sqm: 0 };
        const balanceSqm = round4(Math.max(0, l.qtySqm - done.sqm));
        return { invoicedPcs: done.pcs, invoicedSqm: done.sqm, balancePcs: Math.max(0, l.pcs - done.pcs), balanceSqm, balancePaise: lineAmount(balanceSqm, l.ratePaise) };
      });
      return { ...r, totals: docTotals(r.lines, r.freightPaise, r.taxType, r.gstPct), totalWeightKg: totalWeightKg(r.lines), progress, invoiceNos: nos.get(r.id) ?? [], createdByName: name(r.createdBy) };
    });
  }

  async invoiceViews(rows: SalesInvoice[], repos: Repos = this.data.repos): Promise<SalesInvoiceView[]> {
    const name = await nameMap(repos, rows.map((r) => r.createdBy));
    return rows.map((r) => ({
      ...r,
      totals: docTotals(r.lines, r.freightPaise, r.taxType, r.gstPct),
      tons: r.weightTons ?? round4(r.lines.reduce((s, l) => s + boardTons(l.thic, l.width, l.length, l.pcs), 0)),
      createdByName: name(r.createdBy),
    }));
  }

  // ── Proformas ─────────────────────────────────────────────────────

  async listProformas(query: ListQuery<DocListFilters>): Promise<ListRes<ProformaView>> {
    const res = await this.data.repos.proformas.list(query);
    return { rows: await this.proformaViews(res.rows), total: res.total, summary: summarize(await this.data.repos.proformas.listAll(), query.filters?.firm) };
  }

  async getProforma(id: string): Promise<ProformaView> {
    const p = await this.data.repos.proformas.getById(id);
    if (!p) throw notFound('Proforma invoice');
    return (await this.proformaViews([p]))[0]!;
  }

  /** Parties, lines and tax for a proforma or order. */
  private async orderBody(tx: Repos, firm: SalesOrder['firm'], i: Input, requireActive: boolean) {
    const [{ bill, refs }, lines, s] = await Promise.all([resolveParties(tx, i.billToId, i.shipToId, { requireActive }), buildOrderLines(tx, i.lines), readSettings(tx)]);
    const taxType = partyTaxType(bill, firm, s);
    return { ...refs, lines, taxType, totalPaise: docTotals(lines, i.freightPaise, taxType, i.gstPct).total };
  }

  async createProforma(actor: Actor, input: Input): Promise<ProformaView> {
    const row = await this.data.uow.run(async (tx) => {
      const body = await this.orderBody(tx, input.firm, input, true);
      const at = isoNow(this.clock);
      const p = await tx.proformas.create({
        id: newId(),
        firm: input.firm,
        piNo: await nextNo(tx, 'proforma', input.firm, input.date, at),
        date: input.date,
        validUntil: input.validUntil ?? null,
        poRef: input.poRef ?? null,
        salesPerson: input.salesPerson ?? null,
        paymentTerms: input.paymentTerms ?? null,
        deliveryTerms: input.deliveryTerms ?? null,
        ...body,
        freightPaise: input.freightPaise,
        gstPct: input.gstPct,
        status: input.status,
        soId: null,
        soNo: null,
        remarks: input.remarks ?? null,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'sales_proforma', entityId: p.id, details: `${p.piNo} for ${p.billTo}: ${p.lines.length} item(s), ${money(p.totalPaise)}` });
      return p;
    });
    return (await this.proformaViews([row]))[0]!;
  }

  /** Confirmed (turned into an order) and cancelled proformas are locked (legacy shows no Edit for them). */
  async updateProforma(actor: Actor, id: string, patch: Input): Promise<ProformaView> {
    const row = await this.data.uow.run(async (tx) => {
      const before = await tx.proformas.getById(id);
      if (!before) throw notFound('Proforma invoice');
      if (before.status === 'confirmed') throw conflict('locked', `${before.piNo} is confirmed as ${before.soNo} and can no longer be edited`);
      if (before.status === 'cancelled') throw conflict('locked', `${before.piNo} is cancelled. Reopen it to edit.`);
      const m = { ...before, ...defined(patch) };
      const body = await this.orderBody(tx, before.firm, m, false);
      const updated = (await tx.proformas.update(id, {
        date: m.date,
        validUntil: m.validUntil ?? null,
        poRef: m.poRef ?? null,
        salesPerson: m.salesPerson ?? null,
        paymentTerms: m.paymentTerms ?? null,
        deliveryTerms: m.deliveryTerms ?? null,
        ...body,
        freightPaise: m.freightPaise,
        gstPct: m.gstPct,
        status: m.status,
        remarks: m.remarks ?? null,
        updatedAt: isoNow(this.clock),
      }))!;
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'sales_proforma', entityId: id, details: `Edited ${updated.piNo}: ${money(updated.totalPaise)}` });
      return updated;
    });
    return (await this.proformaViews([row]))[0]!;
  }

  /** Draft ↔ sent to party ↔ cancelled; a cancelled one can be reopened as draft. Confirming goes through confirmProforma. */
  async setProformaStatus(actor: Actor, id: string, status: string): Promise<ProformaView> {
    if (!(PI_STATUSES as readonly string[]).includes(status) || status === 'confirmed') throw validationFailed('Pick draft, sent or cancelled');
    const row = await this.data.uow.run(async (tx) => {
      const p = await tx.proformas.getById(id);
      if (!p) throw notFound('Proforma invoice');
      if (p.status === 'confirmed') throw conflict('locked', `${p.piNo} is already confirmed as ${p.soNo}`);
      const updated = (await tx.proformas.update(id, { status: status as PiStatus, updatedAt: isoNow(this.clock) }))!;
      await this.activity.record(tx, actor, { action: 'StatusChange', entityType: 'sales_proforma', entityId: id, details: `${p.piNo}: ${PI_STATUS_LABEL[p.status]} → ${PI_STATUS_LABEL[updated.status]}` });
      return updated;
    });
    return (await this.proformaViews([row]))[0]!;
  }

  /**
   * The party accepted: a Confirmed sales order is made from the proforma (same parties, terms, lines and
   * totals) and the proforma is locked (legacy confirmPiToSo). The order is dated today; the PI date becomes its PO date.
   */
  async confirmProforma(actor: Actor, id: string): Promise<{ proforma: ProformaView; order: SalesOrderView }> {
    const { p, o } = await this.data.uow.run(async (tx) => {
      const pi = await tx.proformas.getById(id);
      if (!pi) throw notFound('Proforma invoice');
      if (pi.status === 'confirmed') throw conflict('already_confirmed', `${pi.piNo} is already confirmed as ${pi.soNo}`);
      if (pi.status === 'cancelled') throw conflict('cancelled', `${pi.piNo} is cancelled. Reopen it first.`);
      const at = isoNow(this.clock);
      const date = today(this.clock);
      const order = await tx.salesOrders.create({
        id: newId(),
        firm: pi.firm,
        soNo: await nextNo(tx, 'order', pi.firm, date, at),
        date,
        poNo: pi.poRef,
        poDate: pi.date,
        edd: null,
        billToId: pi.billToId,
        billTo: pi.billTo,
        shipToId: pi.shipToId,
        shipTo: pi.shipTo,
        state: pi.state,
        city: pi.city,
        salesPerson: pi.salesPerson,
        paymentTerms: pi.paymentTerms,
        deliveryTerms: pi.deliveryTerms,
        taxType: pi.taxType,
        lines: structuredClone(pi.lines),
        freightPaise: pi.freightPaise,
        gstPct: pi.gstPct,
        totalPaise: pi.totalPaise,
        status: 'confirmed',
        remarks: `Created from proforma invoice ${pi.piNo}`,
        piId: pi.id,
        piNo: pi.piNo,
        dispatch: { ...EMPTY_DISPATCH },
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      const updated = (await tx.proformas.update(id, { status: 'confirmed', soId: order.id, soNo: order.soNo, updatedAt: at }))!;
      await this.activity.record(tx, actor, { action: 'StatusChange', entityType: 'sales_proforma', entityId: id, details: `Confirmed ${pi.piNo} → sales order ${order.soNo}` });
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'sales_order', entityId: order.id, details: `${order.soNo} from proforma ${pi.piNo}: ${money(order.totalPaise)}` });
      return { p: updated, o: order };
    });
    return { proforma: (await this.proformaViews([p]))[0]!, order: (await this.orderViews([o]))[0]! };
  }

  async removeProforma(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const p = await tx.proformas.getById(id);
      if (!p) throw notFound('Proforma invoice');
      if (p.status === 'confirmed') throw conflict('locked', `${p.piNo} is confirmed as ${p.soNo} and can’t be deleted`);
      await tx.proformas.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'sales_proforma', entityId: id, details: `Deleted ${p.piNo}` });
    });
  }

  // ── Sales orders ──────────────────────────────────────────────────

  async listOrders(query: ListQuery<DocListFilters>): Promise<ListRes<SalesOrderView>> {
    const res = await this.data.repos.salesOrders.list(query);
    return { rows: await this.orderViews(res.rows), total: res.total, summary: summarize(await this.data.repos.salesOrders.listAll(), query.filters?.firm) };
  }

  async getOrder(id: string): Promise<SalesOrderView> {
    const o = await this.data.repos.salesOrders.getById(id);
    if (!o) throw notFound('Sales order');
    return (await this.orderViews([o]))[0]!;
  }

  async createOrder(actor: Actor, input: Input): Promise<SalesOrderView> {
    const row = await this.data.uow.run(async (tx) => {
      const body = await this.orderBody(tx, input.firm, input, true);
      const at = isoNow(this.clock);
      const o = await tx.salesOrders.create({
        id: newId(),
        firm: input.firm,
        soNo: await nextNo(tx, 'order', input.firm, input.date, at),
        date: input.date,
        poNo: input.poNo ?? null,
        poDate: input.poDate ?? null,
        edd: input.edd ?? null,
        salesPerson: input.salesPerson ?? null,
        paymentTerms: input.paymentTerms ?? null,
        deliveryTerms: input.deliveryTerms ?? null,
        ...body,
        freightPaise: input.freightPaise,
        gstPct: input.gstPct,
        status: input.status,
        remarks: input.remarks ?? null,
        piId: null,
        piNo: null,
        dispatch: { ...EMPTY_DISPATCH },
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'sales_order', entityId: o.id, details: `${o.soNo} for ${o.billTo}: ${o.lines.length} item(s), ${money(o.totalPaise)}` });
      return o;
    });
    return (await this.orderViews([row]))[0]!;
  }

  /** Once an order has invoices its parties and lines are fixed (the invoices point at them); terms, dates and status can still change. */
  async updateOrder(actor: Actor, id: string, patch: Input): Promise<SalesOrderView> {
    const row = await this.data.uow.run(async (tx) => {
      const before = await tx.salesOrders.getById(id);
      if (!before) throw notFound('Sales order');
      const invoiced = (await invoicedBySo(tx)).nos.get(id) ?? [];
      const m = { ...before, ...defined(patch) };
      const body = await this.orderBody(tx, before.firm, m, false);
      const key = (o: { billToId: string | null; shipToId: string | null; lines: SalesOrder['lines'] }) =>
        JSON.stringify([o.billToId, o.shipToId, o.lines.map((l) => [l.itemId, l.itemName, l.pcs, l.qtySqm, l.ratePaise])]);
      if (invoiced.length && key(body) !== key(before)) throw conflict('invoiced', `${before.soNo} has invoices (${invoiced.join(', ')}), so its parties and items can’t change`);
      const updated = (await tx.salesOrders.update(id, {
        date: m.date,
        poNo: m.poNo ?? null,
        poDate: m.poDate ?? null,
        edd: m.edd ?? null,
        salesPerson: m.salesPerson ?? null,
        paymentTerms: m.paymentTerms ?? null,
        deliveryTerms: m.deliveryTerms ?? null,
        ...body,
        freightPaise: m.freightPaise,
        gstPct: m.gstPct,
        status: m.status,
        remarks: m.remarks ?? null,
        updatedAt: isoNow(this.clock),
      }))!;
      const statusNote = updated.status !== before.status ? ` (${SO_STATUS_LABEL[before.status]} → ${SO_STATUS_LABEL[updated.status]})` : '';
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'sales_order', entityId: id, details: `Edited ${updated.soNo}${statusNote}: ${money(updated.totalPaise)}` });
      return updated;
    });
    return (await this.orderViews([row]))[0]!;
  }

  async setOrderStatus(actor: Actor, id: string, status: string): Promise<SalesOrderView> {
    if (!(SO_STATUSES as readonly string[]).includes(status)) throw validationFailed('Unknown order status');
    const row = await this.data.uow.run(async (tx) => {
      const o = await tx.salesOrders.getById(id);
      if (!o) throw notFound('Sales order');
      const updated = (await tx.salesOrders.update(id, { status: status as SoStatus, updatedAt: isoNow(this.clock) }))!;
      await this.activity.record(tx, actor, { action: 'StatusChange', entityType: 'sales_order', entityId: id, details: `${o.soNo}: ${SO_STATUS_LABEL[o.status]} → ${SO_STATUS_LABEL[updated.status]}` });
      return updated;
    });
    return (await this.orderViews([row]))[0]!;
  }

  /** Vehicle, transporter, LR and driver for the Dispatch Register. */
  async recordDispatch(actor: Actor, id: string, d: Input): Promise<SalesOrderView> {
    const row = await this.data.uow.run(async (tx) => {
      const o = await tx.salesOrders.getById(id);
      if (!o) throw notFound('Sales order');
      if (o.status === 'cancelled') throw conflict('cancelled', `${o.soNo} is cancelled`);
      const dispatch: DispatchInfo = {
        date: d.date ?? null,
        vehicleNo: d.vehicleNo ?? null,
        transporter: d.transporter ?? null,
        transporterGstin: d.transporterGstin ?? null,
        lrNo: d.lrNo ?? null,
        driverName: d.driverName ?? null,
        driverMobile: d.driverMobile ?? null,
      };
      const updated = (await tx.salesOrders.update(id, { dispatch, updatedAt: isoNow(this.clock) }))!;
      await this.activity.record(tx, actor, {
        action: 'Edit',
        entityType: 'sales_order',
        entityId: id,
        details: hasDispatch(dispatch) ? `Dispatch for ${o.soNo}: ${[dispatch.vehicleNo, dispatch.transporter, dispatch.date].filter(Boolean).join(', ')}` : `Cleared dispatch details of ${o.soNo}`,
      });
      return updated;
    });
    return (await this.orderViews([row]))[0]!;
  }

  /** Orders with invoices can't be deleted (cancel them). Deleting one made from a proforma reopens that proforma as sent. */
  async removeOrder(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const o = await tx.salesOrders.getById(id);
      if (!o) throw notFound('Sales order');
      const invoiced = (await invoicedBySo(tx)).nos.get(id) ?? [];
      if (invoiced.length) throw new HttpError(409, 'in_use', `${o.soNo} has invoices (${invoiced.join(', ')}). Cancel it instead.`);
      const at = isoNow(this.clock);
      await tx.salesOrders.softDelete(id, at);
      if (o.piId) {
        const pi = await tx.proformas.getById(o.piId);
        if (pi) await tx.proformas.update(pi.id, { status: 'sent', soId: null, soNo: null, updatedAt: at });
      }
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'sales_order', entityId: id, details: `Deleted ${o.soNo}${o.piNo ? ` (${o.piNo} reopened)` : ''}` });
    });
  }

  // ── Invoices ──────────────────────────────────────────────────────

  async listInvoices(query: ListQuery<DocListFilters>): Promise<ListRes<SalesInvoiceView>> {
    const res = await this.data.repos.salesInvoices.list(query);
    return { rows: await this.invoiceViews(res.rows), total: res.total, summary: summarize(await this.data.repos.salesInvoices.listAll(), query.filters?.firm) };
  }

  async getInvoice(id: string): Promise<SalesInvoiceView> {
    const i = await this.data.repos.salesInvoices.getById(id);
    if (!i) throw notFound('Sales invoice');
    return (await this.invoiceViews([i]))[0]!;
  }

  /** Lines dispatched against the order's lines (legacy invLinesFromSoItems): item details and order quantities come from the order. */
  private invoiceLines(so: SalesOrder, lines: { soLine: number; pcs: number; qtySqm: number; ratePaise: number }[]): InvoiceLine[] {
    const seen = new Set<number>();
    return lines.map((l, n) => {
      const sl = so.lines[l.soLine];
      if (!sl) throw badRef(`lines.${n}.soLine`, `${so.soNo} has no line ${l.soLine + 1}`);
      if (seen.has(l.soLine)) throw badRef(`lines.${n}.soLine`, `Line ${l.soLine + 1} of ${so.soNo} is entered twice`);
      seen.add(l.soLine);
      const qtySqm = round4(l.qtySqm);
      const { pcs: soPcs, qtySqm: soQtySqm, ratePaise: _r, weightKg: _w, amountPaise: _a, ...item } = sl;
      return { ...item, soLine: l.soLine, soPcs, soQtySqm, pcs: l.pcs, qtySqm, ratePaise: l.ratePaise, amountPaise: lineAmount(qtySqm, l.ratePaise) };
    });
  }

  async createInvoice(actor: Actor, input: Input): Promise<SalesInvoiceView> {
    const row = await this.data.uow.run(async (tx) => {
      const so = await tx.salesOrders.getById(input.soId);
      if (!so) throw badRef('soId', 'Unknown sales order');
      if (so.status === 'cancelled') throw conflict('cancelled', `${so.soNo} is cancelled`);
      const lines = this.invoiceLines(so, input.lines);
      const taxType = input.taxType ?? (await this.orderTaxType(tx, so));
      const at = isoNow(this.clock);
      const inv = await tx.salesInvoices.create({
        id: newId(),
        firm: so.firm,
        invNo: await nextNo(tx, 'invoice', so.firm, input.date, at),
        date: input.date,
        soId: so.id,
        soNo: so.soNo,
        poNo: so.poNo,
        billToId: so.billToId,
        billTo: so.billTo,
        shipToId: so.shipToId,
        shipTo: so.shipTo,
        state: so.state,
        city: so.city,
        taxType,
        lines,
        freightPaise: input.freightPaise,
        gstPct: input.gstPct,
        totalPaise: docTotals(lines, input.freightPaise, taxType, input.gstPct).total,
        irn: input.irn ?? null,
        ewayBill: input.ewayBill ?? null,
        weightTons: input.weightTons ?? null,
        approval: 'pending',
        approvalNote: null,
        approvedBy: null,
        approvedByName: null,
        approvedAt: null,
        remarks: input.remarks ?? null,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'sales_invoice', entityId: inv.id, details: `${inv.invNo} against ${so.soNo} for ${inv.billTo}: ${money(inv.totalPaise)}` });
      return inv;
    });
    return (await this.invoiceViews([row]))[0]!;
  }

  /** The bill-to party's current tax type for the firm, falling back to the order's. */
  private async orderTaxType(tx: Repos, so: SalesOrder) {
    const bill = so.billToId ? await tx.salesCustomers.getById(so.billToId) : null;
    return bill ? partyTaxType(bill, so.firm, await readSettings(tx)) : so.taxType;
  }

  /** Approved invoices are locked. Editing a rejected one sends it back for approval. */
  async updateInvoice(actor: Actor, id: string, patch: Input): Promise<SalesInvoiceView> {
    const row = await this.data.uow.run(async (tx) => {
      const before = await tx.salesInvoices.getById(id);
      if (!before) throw notFound('Sales invoice');
      if (before.approval === 'approved') throw conflict('approved', `${before.invNo} is approved and can no longer be edited`);
      const so = before.soId ? await tx.salesOrders.getById(before.soId) : null;
      const m = { ...before, ...defined(patch) };
      let lines = before.lines;
      if (patch.lines !== undefined) {
        if (!so) throw conflict('no_order', `${before.invNo}’s sales order no longer exists, so its lines can’t change`);
        lines = this.invoiceLines(so, patch.lines);
      }
      const reset = before.approval === 'rejected';
      const updated = (await tx.salesInvoices.update(id, {
        date: m.date,
        taxType: m.taxType ?? before.taxType,
        lines,
        freightPaise: m.freightPaise,
        gstPct: m.gstPct,
        totalPaise: docTotals(lines, m.freightPaise, m.taxType ?? before.taxType, m.gstPct).total,
        irn: m.irn ?? null,
        ewayBill: m.ewayBill ?? null,
        weightTons: m.weightTons ?? null,
        remarks: m.remarks ?? null,
        ...(reset ? { approval: 'pending' as const, approvalNote: null } : {}),
        updatedAt: isoNow(this.clock),
      }))!;
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'sales_invoice', entityId: id, details: `Edited ${updated.invNo}${reset ? ' (back to pending approval)' : ''}: ${money(updated.totalPaise)}` });
      return updated;
    });
    return (await this.invoiceViews([row]))[0]!;
  }

  /** approve / reject a pending invoice, or reopen an approved one for correction (all need sales_approve). */
  async decideInvoice(actor: Actor, id: string, decision: 'approve' | 'reject' | 'reopen', note: string | null): Promise<SalesInvoiceView> {
    const row = await this.data.uow.run(async (tx) => {
      const inv = await tx.salesInvoices.getById(id);
      if (!inv) throw notFound('Sales invoice');
      const from = decision === 'reopen' ? 'approved' : 'pending';
      if (inv.approval !== from) throw conflict('wrong_state', `${inv.invNo} is ${APPROVAL_LABEL[inv.approval].toLowerCase()}, so it can’t be ${decision === 'reopen' ? 'reopened' : `${decision}d`}`);
      if (decision === 'reject' && !note) throw validationFailed('Give a reason for rejecting', [{ path: 'note', message: 'Give a reason' }]);
      const at = isoNow(this.clock);
      const updated = (await tx.salesInvoices.update(id, {
        approval: ({ approve: 'approved', reject: 'rejected', reopen: 'pending' } as const)[decision],
        approvalNote: note,
        approvedBy: decision === 'approve' ? actor.id : null,
        approvedByName: decision === 'approve' ? actor.name : null,
        approvedAt: decision === 'approve' ? at : null,
        updatedAt: at,
      }))!;
      const verb = decision === 'approve' ? 'Approved' : decision === 'reject' ? 'Rejected' : 'Reopened';
      await this.activity.record(tx, actor, { action: decision === 'approve' ? 'Approve' : 'StatusChange', entityType: 'sales_invoice', entityId: id, details: `${verb} ${inv.invNo}${note ? `: ${note}` : ''}` });
      return updated;
    });
    return (await this.invoiceViews([row]))[0]!;
  }

  async removeInvoice(actor: Actor, id: string) {
    await this.data.uow.run(async (tx) => {
      const inv = await tx.salesInvoices.getById(id);
      if (!inv) throw notFound('Sales invoice');
      if (inv.approval === 'approved') throw conflict('approved', `${inv.invNo} is approved and can’t be deleted`);
      await tx.salesInvoices.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'sales_invoice', entityId: id, details: `Deleted ${inv.invNo}` });
    });
  }

  // ── For reports ───────────────────────────────────────────────────

  async allOrders(repos: Repos = this.data.repos) {
    return this.orderViews(await repos.salesOrders.listAll(), repos);
  }

  async allInvoices(repos: Repos = this.data.repos) {
    return this.invoiceViews(await repos.salesInvoices.listAll(), repos);
  }

  async allProformas(repos: Repos = this.data.repos) {
    return this.proformaViews(await repos.proformas.listAll(), repos);
  }
}

