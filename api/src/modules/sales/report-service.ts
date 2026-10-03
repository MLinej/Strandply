import type { CompanyBlock } from '../../contracts/sampletrack';
import {
  APPROVAL_LABEL,
  boardTons,
  DEALER_TYPES,
  FIRM_IDS,
  FIRM_LABEL,
  fillTemplate,
  hasDispatch,
  isOpenSo,
  PI_STATUS_LABEL,
  PI_STATUSES,
  rateSqftOf,
  REPORT_DEFS,
  round2,
  round4,
  SO_STATUS_LABEL,
  SO_STATUSES,
  type DispatchRegister,
  type DispatchRow,
  type EmailDraft,
  type EmailDoc,
  type Firm,
  type Named,
  type PartyLedger,
  type PendingPivot,
  type ReportId,
  type ReportResult,
  type ReportTable,
  type SalesDashboard,
  type SalesMeta,
  type SalesOptions,
  type ProformaView,
  type SalesInvoiceView,
  type SalesOrderView,
} from '../../contracts/sales';
import { isoNow, type Clock } from '../../lib/clock';
import { notFound } from '../../lib/errors';
import { writeXlsx, type SheetSpec } from '../../lib/spreadsheet';
import type { DataLayer } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import type { CompanyService } from '../sampletrack/settings/company-service';
import { currentFy, fyOptions, readSettings, today } from './common';
import type { SalesDocumentService } from './document-service';
import type { SalesMasterService } from './master-service';

export interface Range {
  firm?: Firm;
  from?: string;
  to?: string;
}

/** OSB's letterhead. LLP's comes from the company settings. */
const OSB_LETTERHEAD: CompanyBlock = { name: 'Strandply OSB (a division of SKM Steels Ltd)', city: 'Maharashtra', phone: null, llpin: null, gst: '27AADCS7801F5ZC' };

const rupees = (p: number) => Math.round(p) / 100;
/** Types each sheet's column callbacks from its rows. */
const sheet = <T,>(spec: SheetSpec<T>): SheetSpec<any> => spec;
const fmtMoney = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
const inRange = (d: string | null, r: Range) => !!d && (!r.from || d >= r.from) && (!r.to || d <= r.to);
const ofFirm = (firm: Firm, r: Range) => !r.firm || r.firm === firm;
const daysBetween = (a: string, b: string) => Math.floor((Date.parse(b) - Date.parse(a)) / 86400000);

function group<T>(rows: T[], key: (r: T) => string, value: (r: T) => number): Named[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + value(r));
  return [...m].map(([name, v]) => ({ name, value: v })).sort((a, b) => b.value - a.value);
}

/** Meta, lookups, dashboard, reports, ledger, dispatch register, exports, prints and email drafts. */
export class SalesReportService {
  constructor(
    private readonly data: DataLayer,
    private readonly docs: SalesDocumentService,
    private readonly masters: SalesMasterService,
    private readonly company: CompanyService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  async meta(): Promise<SalesMeta> {
    return {
      settings: await readSettings(this.data.repos),
      firms: FIRM_IDS.map((id) => ({ id, label: FIRM_LABEL[id] })),
      dealerTypes: DEALER_TYPES,
      soStatuses: SO_STATUSES.map((id) => ({ id, label: SO_STATUS_LABEL[id] })),
      piStatuses: PI_STATUSES.map((id) => ({ id, label: PI_STATUS_LABEL[id] })),
      currentFy: currentFy(this.clock),
      fys: fyOptions(this.clock),
      today: today(this.clock),
    };
  }

  /** Active parties and items, and every price / weight entry, for document forms. */
  async options(): Promise<SalesOptions> {
    const r = this.data.repos;
    const [customers, items, prices, weights] = await Promise.all([r.salesCustomers.listAll(), r.salesItems.listAll(), r.salesPrices.listAll(), r.salesWeights.listAll()]);
    return {
      customers: customers
        .filter((c) => c.active)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ id: c.id, name: c.name, city: c.city, state: c.state, gstin: c.gstin, taxTypes: c.taxTypes, paymentTerms: c.paymentTerms, dealerType: c.dealerType })),
      items: items.filter((i) => i.active).sort((a, b) => a.name.localeCompare(b.name)),
      prices: prices.map((p) => ({ itemId: p.itemId, effectiveDate: p.effectiveDate, ratePaise: p.ratePaise })),
      weights: weights.map((w) => ({ itemId: w.itemId, effectiveDate: w.effectiveDate, weightKg: w.weightKg })),
    };
  }

  private async invoicesIn(r: Range) {
    return (await this.docs.allInvoices()).filter((i) => ofFirm(i.firm, r) && inRange(i.date, r));
  }

  private async stateOf() {
    const customers = await this.data.repos.salesCustomers.listAll();
    const byId = new Map(customers.map((c) => [c.id, c]));
    return (d: { shipToId: string | null; state: string | null }) => (d.shipToId ? byId.get(d.shipToId)?.state : null) ?? d.state ?? 'Unknown';
  }

  // ── Dashboard (legacy dashboardCalc) ──────────────────────────────

  async dashboard(r: Range): Promise<SalesDashboard> {
    const [invs, orders, stateOf] = await Promise.all([this.invoicesIn(r), this.docs.allOrders(), this.stateOf()]);
    const firmOrders = orders.filter((o) => ofFirm(o.firm, r));
    const lines = invs.flatMap((i) => i.lines);
    const grades = new Map<string, { grade: string; tons: number; pcs: number; basicPaise: number }>();
    for (const l of lines) {
      const g = grades.get(l.grade ?? l.itemName) ?? { grade: l.grade ?? l.itemName, tons: 0, pcs: 0, basicPaise: 0 };
      g.tons += boardTons(l.thic, l.width, l.length, l.pcs);
      g.pcs += l.pcs;
      g.basicPaise += l.amountPaise;
      grades.set(g.grade, g);
    }
    const byCustomer = group(invs, (i) => i.shipTo, (i) => i.totals.total);
    const byProduct = group(lines, (l) => l.grade ?? l.itemName, (l) => l.amountPaise);
    const totalPaise = invs.reduce((s, i) => s + i.totals.total, 0);
    return {
      invoiceCount: invs.length,
      orderCount: firmOrders.length,
      totalPaise,
      basicPaise: invs.reduce((s, i) => s + i.totals.itemsPaise, 0),
      tons: round2(invs.reduce((s, i) => s + i.tons, 0)),
      pcs: lines.reduce((s, l) => s + l.pcs, 0),
      pendingOrders: firmOrders.filter((o) => isOpenSo(o.status)).length,
      outstandingPaise: totalPaise,
      topCustomer: byCustomer[0]?.name ?? null,
      topProduct: byProduct[0]?.name ?? null,
      dispatchPending: firmOrders.filter((o) => isOpenSo(o.status) && !o.dispatch.date).length,
      pendingApproval: (await this.docs.allInvoices()).filter((i) => ofFirm(i.firm, r) && i.approval === 'pending').length,
      grades: [...grades.values()].map((g) => ({ ...g, tons: round2(g.tons) })).sort((a, b) => a.grade.localeCompare(b.grade)),
      topCustomers: byCustomer.slice(0, 8),
      months: group(invs, (i) => i.date.slice(0, 7), (i) => i.totals.total).sort((a, b) => a.name.localeCompare(b.name)),
      states: group(invs, stateOf, (i) => i.totals.total),
    };
  }

  // ── Reports hub (legacy REPORT_DEFS / openReportModal) ────────────

  /** Pending order report: what's left to dispatch per order line, by EDD (legacy buildPendingOrderPivot, on balances). */
  async pendingPivot(r: Range): Promise<PendingPivot> {
    const orders = (await this.docs.allOrders()).filter((o) => ofFirm(o.firm, r) && isOpenSo(o.status));
    const rows = orders
      .map((o) => {
        const lines = o.lines.map((l, i) => ({ itemName: l.itemName, pcs: o.progress[i]!.balancePcs, amountPaise: o.progress[i]!.balancePaise })).filter((l) => l.pcs > 0 || l.amountPaise > 0);
        return { soId: o.id, soNo: o.soNo, edd: o.edd, shipTo: o.shipTo, pcs: lines.reduce((s, l) => s + l.pcs, 0), amountPaise: lines.reduce((s, l) => s + l.amountPaise, 0), lines };
      })
      .filter((o) => o.lines.length)
      .sort((a, b) => (a.edd ?? '9999').localeCompare(b.edd ?? '9999') || a.soNo.localeCompare(b.soNo, 'en', { numeric: true }));
    const products = group(
      rows.flatMap((o) => o.lines),
      (l) => l.itemName,
      (l) => l.pcs,
    ).map((p) => ({ itemName: p.name, pcs: p.value }));
    return { orders: rows, products, pcs: rows.reduce((s, o) => s + o.pcs, 0), amountPaise: rows.reduce((s, o) => s + o.amountPaise, 0) };
  }

  async report(id: ReportId, r: Range): Promise<ReportResult> {
    const def = REPORT_DEFS.find((d) => d.id === id)!;
    const base = { id, label: def.label };
    const named = (rows: Named[], label: string, valueLabel = 'Sales'): ReportTable => ({
      columns: [
        { key: 'name', label },
        { key: 'value', label: valueLabel, kind: 'money' },
      ],
      rows: rows.map((x) => ({ name: x.name, value: x.value })),
      totals: { name: 'Total', value: rows.reduce((s, x) => s + x.value, 0) },
    });
    switch (id) {
      case 'sales_register': {
        const invs = (await this.invoicesIn(r)).sort((a, b) => b.date.localeCompare(a.date) || b.invNo.localeCompare(a.invNo, 'en', { numeric: true }));
        return {
          ...base,
          table: {
            columns: [
              { key: 'date', label: 'Date', kind: 'date' },
              { key: 'invNo', label: 'Invoice' },
              { key: 'billTo', label: 'Bill to' },
              { key: 'shipTo', label: 'Ship to' },
              { key: 'item', label: 'Item' },
              { key: 'pcs', label: 'Pcs', kind: 'qty' },
              { key: 'sqm', label: 'Sq m', kind: 'sqm' },
              { key: 'amount', label: 'Amount', kind: 'money' },
              { key: 'total', label: 'Invoice total', kind: 'money' },
            ],
            rows: invs.flatMap((i) => i.lines.map((l, n) => ({ date: i.date, invNo: i.invNo, billTo: i.billTo, shipTo: i.shipTo, item: l.itemName, pcs: l.pcs, sqm: l.qtySqm, amount: l.amountPaise, total: n === 0 ? i.totals.total : null }))),
            totals: { date: 'Total', pcs: invs.reduce((s, i) => s + i.lines.reduce((t, l) => t + l.pcs, 0), 0), sqm: round4(invs.reduce((s, i) => s + i.lines.reduce((t, l) => t + l.qtySqm, 0), 0)), amount: invs.reduce((s, i) => s + i.totals.itemsPaise, 0), total: invs.reduce((s, i) => s + i.totals.total, 0) },
          },
        };
      }
      case 'pending_orders': {
        const pivot = await this.pendingPivot(r);
        return {
          ...base,
          pivot,
          table: {
            columns: [
              { key: 'soNo', label: 'SO No.' },
              { key: 'edd', label: 'EDD', kind: 'date' },
              { key: 'shipTo', label: 'Ship to' },
              { key: 'item', label: 'Product' },
              { key: 'pcs', label: 'Balance pcs', kind: 'qty' },
              { key: 'amount', label: 'Balance amount', kind: 'money' },
            ],
            rows: pivot.orders.flatMap((o) => o.lines.map((l, n) => ({ soNo: n === 0 ? o.soNo : '', edd: n === 0 ? o.edd : null, shipTo: n === 0 ? o.shipTo : '', item: l.itemName, pcs: l.pcs, amount: l.amountPaise }))),
            totals: { soNo: 'Grand total', pcs: pivot.pcs, amount: pivot.amountPaise },
          },
        };
      }
      case 'thickness_wise': {
        const lines = (await this.invoicesIn(r)).flatMap((i) => i.lines);
        const sqm = group(lines, (l) => (l.thic ? `${l.thic} mm` : 'Unknown'), (l) => l.qtySqm);
        const amt = group(lines, (l) => (l.thic ? `${l.thic} mm` : 'Unknown'), (l) => l.amountPaise);
        return {
          ...base,
          table: {
            columns: [
              { key: 'name', label: 'Thickness' },
              { key: 'sqm', label: 'Sq m', kind: 'sqm' },
              { key: 'value', label: 'Sales', kind: 'money' },
            ],
            rows: amt.map((a) => ({ name: a.name, sqm: round4(sqm.find((s) => s.name === a.name)?.value ?? 0), value: a.value })),
            totals: { name: 'Total', sqm: round4(lines.reduce((s, l) => s + l.qtySqm, 0)), value: lines.reduce((s, l) => s + l.amountPaise, 0) },
          },
        };
      }
      case 'dealer_wise':
        return { ...base, table: named(group(await this.invoicesIn(r), (i) => i.shipTo, (i) => i.totals.total), 'Ship-to party') };
      case 'customer_outstanding':
        return { ...base, table: named(group(await this.invoicesIn(r), (i) => i.shipTo, (i) => i.totals.total), 'Ship-to party', 'Invoiced (outstanding)') };
      case 'top_customers': {
        const top = group(await this.invoicesIn(r), (i) => i.shipTo, (i) => i.totals.total).slice(0, 10);
        return {
          ...base,
          table: {
            columns: [
              { key: 'rank', label: 'Rank', kind: 'qty' },
              { key: 'name', label: 'Ship-to party' },
              { key: 'value', label: 'Sales', kind: 'money' },
            ],
            rows: top.map((x, n) => ({ rank: n + 1, name: x.name, value: x.value })),
          },
        };
      }
      case 'state_wise': {
        const stateOf = await this.stateOf();
        return { ...base, table: named(group(await this.invoicesIn(r), stateOf, (i) => i.totals.total), 'State (ship to)') };
      }
      case 'product_wise': {
        const lines = (await this.invoicesIn(r)).flatMap((i) => i.lines);
        const amt = group(lines, (l) => l.grade ?? 'Other', (l) => l.amountPaise);
        return {
          ...base,
          table: {
            columns: [
              { key: 'name', label: 'Grade' },
              { key: 'pcs', label: 'Pcs', kind: 'qty' },
              { key: 'sqm', label: 'Sq m', kind: 'sqm' },
              { key: 'value', label: 'Sales', kind: 'money' },
            ],
            rows: amt.map((a) => {
              const ls = lines.filter((l) => (l.grade ?? 'Other') === a.name);
              return { name: a.name, pcs: ls.reduce((s, l) => s + l.pcs, 0), sqm: round4(ls.reduce((s, l) => s + l.qtySqm, 0)), value: a.value };
            }),
            totals: { name: 'Total', pcs: lines.reduce((s, l) => s + l.pcs, 0), sqm: round4(lines.reduce((s, l) => s + l.qtySqm, 0)), value: lines.reduce((s, l) => s + l.amountPaise, 0) },
          },
        };
      }
      case 'monthly_trend': {
        const invs = await this.invoicesIn(r);
        const months = [...new Set(invs.map((i) => i.date.slice(0, 7)))].sort();
        return {
          ...base,
          table: {
            columns: [
              { key: 'month', label: 'Month' },
              { key: 'count', label: 'Invoices', kind: 'qty' },
              { key: 'gst', label: 'GST', kind: 'money' },
              { key: 'value', label: 'Sales', kind: 'money' },
            ],
            rows: months.map((m) => {
              const ms = invs.filter((i) => i.date.startsWith(m));
              return { month: m, count: ms.length, gst: ms.reduce((s, i) => s + i.totals.gstPaise, 0), value: ms.reduce((s, i) => s + i.totals.total, 0) };
            }),
            totals: { month: 'Total', count: invs.length, gst: invs.reduce((s, i) => s + i.totals.gstPaise, 0), value: invs.reduce((s, i) => s + i.totals.total, 0) },
          },
        };
      }
      case 'intercompany': {
        const rows = (await this.masters.allIntercompany()).filter((x) => inRange(x.billingDate, r)).sort((a, b) => b.billingDate.localeCompare(a.billingDate));
        return {
          ...base,
          table: {
            columns: [
              { key: 'doc', label: 'Billing doc' },
              { key: 'date', label: 'Date', kind: 'date' },
              { key: 'material', label: 'Material' },
              { key: 'sqm', label: 'Sq m', kind: 'sqm' },
              { key: 'value', label: 'Total value', kind: 'money' },
              { key: 'match', label: 'LLP invoice' },
            ],
            rows: rows.map((x) => ({ doc: x.billingDoc, date: x.billingDate, material: x.materialDesc, sqm: x.qtySqm, value: x.totalPaise, match: x.matched ? 'Matched' : 'Check' })),
            totals: { doc: 'Total', sqm: round4(rows.reduce((s, x) => s + x.qtySqm, 0)), value: rows.reduce((s, x) => s + x.totalPaise, 0) },
          },
        };
      }
      case 'dispatch_vs_sales': {
        const [orders, invs] = await Promise.all([this.docs.allOrders(), this.invoicesIn(r)]);
        const dispatched = orders.filter((o) => ofFirm(o.firm, r) && inRange(o.dispatch.date, r));
        const notInvoiced = dispatched.filter((o) => !o.invoiceNos.length);
        return {
          ...base,
          kpis: [
            { label: 'Orders dispatched', value: dispatched.length, note: 'Dispatch date in the period' },
            { label: 'Invoices raised', value: invs.length, note: 'Invoice date in the period' },
            { label: 'Dispatched, not invoiced', value: notInvoiced.length, note: 'Orders with no invoice yet' },
          ],
          table: {
            columns: [
              { key: 'soNo', label: 'SO No.' },
              { key: 'date', label: 'Dispatched', kind: 'date' },
              { key: 'shipTo', label: 'Ship to' },
              { key: 'vehicle', label: 'Vehicle' },
              { key: 'value', label: 'Order value', kind: 'money' },
            ],
            rows: notInvoiced.map((o) => ({ soNo: o.soNo, date: o.dispatch.date, shipTo: o.shipTo, vehicle: o.dispatch.vehicleNo, value: o.totals.total })),
          },
        };
      }
      case 'credit_days': {
        const cs = (await this.data.repos.salesCustomers.listAll()).filter((c) => c.creditDays > 0).sort((a, b) => b.creditDays - a.creditDays || a.name.localeCompare(b.name));
        return {
          ...base,
          table: {
            columns: [
              { key: 'name', label: 'Party' },
              { key: 'days', label: 'Credit days', kind: 'qty' },
              { key: 'limit', label: 'Credit limit', kind: 'money' },
              { key: 'terms', label: 'Payment terms' },
            ],
            rows: cs.map((c) => ({ name: c.name, days: c.creditDays, limit: c.creditLimitPaise || null, terms: c.paymentTerms })),
          },
        };
      }
      case 'order_ageing': {
        const now = today(this.clock);
        const open = (await this.docs.allOrders()).filter((o) => ofFirm(o.firm, r) && isOpenSo(o.status)).map((o) => ({ o, age: Math.max(0, daysBetween(o.date, now)) }));
        open.sort((a, b) => b.age - a.age);
        return {
          ...base,
          table: {
            columns: [
              { key: 'soNo', label: 'SO No.' },
              { key: 'billTo', label: 'Bill to' },
              { key: 'date', label: 'SO date', kind: 'date' },
              { key: 'age', label: 'Age (days)', kind: 'qty' },
              { key: 'status', label: 'Status' },
              { key: 'value', label: 'Order value', kind: 'money' },
            ],
            rows: open.map(({ o, age }) => ({ soNo: o.soNo, billTo: o.billTo, date: o.date, age, status: SO_STATUS_LABEL[o.status], value: o.totals.total })),
          },
        };
      }
      case 'customer_credit': {
        const [invs, customers] = await Promise.all([this.invoicesIn(r), this.data.repos.salesCustomers.listAll()]);
        const byId = new Map(customers.map((c) => [c.id, c]));
        const parties = new Map<string, { name: string; count: number; total: number; limit: number }>();
        for (const i of invs) {
          const k = i.shipToId ?? i.shipTo;
          const p = parties.get(k) ?? { name: i.shipTo, count: 0, total: 0, limit: (i.shipToId && byId.get(i.shipToId)?.creditLimitPaise) || 0 };
          p.count++;
          p.total += i.totals.total;
          parties.set(k, p);
        }
        return {
          ...base,
          table: {
            columns: [
              { key: 'name', label: 'Party' },
              { key: 'count', label: 'Invoices', kind: 'qty' },
              { key: 'total', label: 'Sales', kind: 'money' },
              { key: 'limit', label: 'Credit limit', kind: 'money' },
              { key: 'use', label: 'Utilisation', kind: 'pct' },
            ],
            rows: [...parties.values()]
              .sort((a, b) => b.total - a.total)
              .map((p) => ({ name: p.name, count: p.count, total: p.total, limit: p.limit || null, use: p.limit ? Math.min(100, Math.round((p.total / p.limit) * 100)) : null })),
          },
        };
      }
    }
  }

  // ── Party ledger (keyed on ship-to, as legacy) ────────────────────

  async ledger(customerId: string, firm?: Firm): Promise<PartyLedger> {
    const customer = await this.data.repos.salesCustomers.getById(customerId);
    if (!customer) throw notFound('Party');
    const invs = (await this.docs.allInvoices()).filter((i) => i.shipToId === customerId && (!firm || i.firm === firm)).sort((a, b) => a.date.localeCompare(b.date));
    return {
      customer,
      invoices: invs.map((i) => ({ id: i.id, invNo: i.invNo, date: i.date, firm: i.firm, lines: i.lines.map((l) => ({ itemName: l.itemName, qtySqm: l.qtySqm })), totalPaise: i.totals.total })),
      totalPaise: invs.reduce((s, i) => s + i.totals.total, 0),
      count: invs.length,
    };
  }

  // ── Dispatch register ─────────────────────────────────────────────

  async dispatchRegister(q: Range & { q?: string; shipTo?: string; state?: string; city?: string; page?: number; pageSize?: number }): Promise<DispatchRegister> {
    const all: DispatchRow[] = (await this.data.repos.salesOrders.listAll())
      .filter((o) => ofFirm(o.firm, q) && hasDispatch(o.dispatch) && (!q.from && !q.to ? true : inRange(o.dispatch.date, q)))
      .sort((a, b) => (b.dispatch.date ?? '').localeCompare(a.dispatch.date ?? '') || b.soNo.localeCompare(a.soNo, 'en', { numeric: true }))
      .map((o) => ({ soId: o.id, soNo: o.soNo, firm: o.firm, shipTo: o.shipTo, state: o.state, city: o.city, dispatch: o.dispatch, freightPaise: o.freightPaise }));
    const text = q.q?.trim().toLowerCase();
    const rows = all.filter(
      (o) =>
        (!text || [o.soNo, o.shipTo, o.dispatch.vehicleNo, o.dispatch.transporter, o.dispatch.lrNo].some((v) => v?.toLowerCase().includes(text))) &&
        (!q.shipTo || o.shipTo === q.shipTo) &&
        (!q.state || o.state === q.state) &&
        (!q.city || o.city === q.city),
    );
    const page = q.page ?? 1;
    const size = q.pageSize ?? 20;
    const vehicles = group(
      all.filter((o) => o.dispatch.vehicleNo),
      (o) => o.dispatch.vehicleNo!,
      () => 1,
    );
    const transporters = group(
      all.filter((o) => o.dispatch.transporter),
      (o) => o.dispatch.transporter!,
      (o) => o.freightPaise,
    );
    return {
      rows: rows.slice((page - 1) * size, page * size),
      total: rows.length,
      kpis: { dispatches: all.length, freightPaise: all.reduce((s, o) => s + o.freightPaise, 0), vehicles: vehicles.length, transporters: transporters.length },
      byVehicle: vehicles,
      byTransporter: transporters,
    };
  }

  // ── Exports ───────────────────────────────────────────────────────

  async exportXlsx(actor: Actor, kind: string, r: Range): Promise<Uint8Array> {
    const sheets = await this.sheets(kind, r);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'sales_export', details: `Exported ${kind} (${sheets.reduce((s, x) => s + x.rows.length, 0)} rows)` }));
    return writeXlsx(sheets);
  }

  private async sheets(kind: string, r: Range): Promise<SheetSpec<any>[]> {
    const repos = this.data.repos;
    const firmLabel = (f: Firm) => FIRM_LABEL[f];
    switch (kind) {
      case 'customers':
        return [
          sheet({
            name: 'Party master',
            rows: (await repos.salesCustomers.listAll()).sort((a, b) => a.name.localeCompare(b.name)),
            columns: [
              { header: 'Customer name', value: (c) => c.name },
              { header: 'Code', value: (c) => c.code },
              { header: 'Type', value: (c) => c.dealerType },
              { header: 'GSTIN', value: (c) => c.gstin },
              { header: 'PAN', value: (c) => c.pan },
              { header: 'Address', value: (c) => c.address },
              { header: 'City', value: (c) => c.city },
              { header: 'State', value: (c) => c.state },
              { header: 'Country', value: (c) => c.country },
              { header: 'Pincode', value: (c) => c.pincode },
              { header: 'Contact person', value: (c) => c.contactPerson },
              { header: 'Mobile', value: (c) => c.mobile1 },
              { header: 'Mobile 2', value: (c) => c.mobile2 },
              { header: 'Email', value: (c) => c.email },
              { header: 'Credit days', value: (c) => c.creditDays },
              { header: 'Credit limit (₹)', value: (c) => rupees(c.creditLimitPaise) },
              { header: 'Group', value: (c) => c.group },
              { header: 'Tax type LLP', value: (c) => c.taxTypes.llp },
              { header: 'Tax type OSB', value: (c) => c.taxTypes.osb },
              { header: 'Active', value: (c) => (c.active ? 'Yes' : 'No') },
            ],
          }),
        ];
      case 'items':
        return [
          sheet({
            name: 'Item master',
            rows: (await repos.salesItems.listAll()).sort((a, b) => a.name.localeCompare(b.name)),
            columns: [
              { header: 'Item name', value: (i) => i.name },
              { header: 'Brand', value: (i) => i.brand },
              { header: 'Grade', value: (i) => i.grade },
              { header: 'Sub type', value: (i) => i.subType },
              { header: 'Thickness (mm)', value: (i) => i.thic },
              { header: 'Width (mm)', value: (i) => i.width },
              { header: 'Length (mm)', value: (i) => i.length },
              { header: 'Sq m factor', value: (i) => i.sqmFactor },
              { header: 'Default rate / sq m (₹)', value: (i) => rupees(i.defaultRatePaise) },
              { header: 'HSN', value: (i) => i.hsn },
              { header: 'Active', value: (i) => (i.active ? 'Yes' : 'No') },
            ],
          }),
        ];
      case 'prices':
        return [
          sheet({
            name: 'Price list',
            rows: await this.masters.listPrices(),
            columns: [
              { header: 'Item', value: (p) => p.itemName },
              { header: 'Effective from', value: (p) => p.effectiveDate },
              { header: 'Rate / sq m (₹)', value: (p) => rupees(p.ratePaise) },
              { header: 'Rate / sq ft (₹)', value: (p) => rupees(rateSqftOf(p.ratePaise)) },
            ],
          }),
        ];
      case 'weights':
        return [
          sheet({
            name: 'Weight chart',
            rows: await this.masters.listWeights(),
            columns: [
              { header: 'Item', value: (w) => w.itemName },
              { header: 'Effective from', value: (w) => w.effectiveDate },
              { header: 'Weight per board (kg)', value: (w) => w.weightKg },
            ],
          }),
        ];
      case 'proformas': {
        const ps = (await this.docs.allProformas()).filter((p) => ofFirm(p.firm, r) && inRange(p.date, r));
        return [
          sheet({
            name: 'Proforma invoices',
            rows: ps.flatMap((p) => p.lines.map((l) => ({ p, l }))),
            columns: [
              { header: 'Firm', value: (x) => firmLabel(x.p.firm) },
              { header: 'PI No', value: (x) => x.p.piNo },
              { header: 'PI date', value: (x) => x.p.date },
              { header: 'Valid until', value: (x) => x.p.validUntil },
              { header: 'Bill to', value: (x) => x.p.billTo },
              { header: 'Ship to', value: (x) => x.p.shipTo },
              { header: 'Tax type', value: (x) => x.p.taxType },
              { header: 'Item', value: (x) => x.l.itemName },
              { header: 'Pcs', value: (x) => x.l.pcs },
              { header: 'Qty (sq m)', value: (x) => x.l.qtySqm },
              { header: 'Rate / sq m (₹)', value: (x) => rupees(x.l.ratePaise) },
              { header: 'Amount (₹)', value: (x) => rupees(x.l.amountPaise) },
              { header: 'Freight (₹)', value: (x) => rupees(x.p.freightPaise) },
              { header: 'Total value (₹)', value: (x) => rupees(x.p.totals.total) },
              { header: 'Status', value: (x) => PI_STATUS_LABEL[x.p.status] },
              { header: 'Sales order', value: (x) => x.p.soNo },
            ],
          }),
        ];
      }
      case 'orders': {
        const os = (await this.docs.allOrders()).filter((o) => ofFirm(o.firm, r) && inRange(o.date, r));
        return [
          sheet({
            name: 'Sales orders',
            rows: os.flatMap((o) => o.lines.map((l, i) => ({ o, l, p: o.progress[i]! }))),
            columns: [
              { header: 'Firm', value: (x) => firmLabel(x.o.firm) },
              { header: 'SO No', value: (x) => x.o.soNo },
              { header: 'SO date', value: (x) => x.o.date },
              { header: 'PO No', value: (x) => x.o.poNo },
              { header: 'Bill to', value: (x) => x.o.billTo },
              { header: 'Ship to', value: (x) => x.o.shipTo },
              { header: 'State', value: (x) => x.o.state },
              { header: 'Sales person', value: (x) => x.o.salesPerson },
              { header: 'Tax type', value: (x) => x.o.taxType },
              { header: 'Item', value: (x) => x.l.itemName },
              { header: 'Pcs', value: (x) => x.l.pcs },
              { header: 'Qty (sq m)', value: (x) => x.l.qtySqm },
              { header: 'Rate / sq m (₹)', value: (x) => rupees(x.l.ratePaise) },
              { header: 'Rate / sq ft (₹)', value: (x) => rupees(rateSqftOf(x.l.ratePaise)) },
              { header: 'Weight / board (kg)', value: (x) => x.l.weightKg },
              { header: 'Total weight (kg)', value: (x) => round2(x.l.pcs * x.l.weightKg) },
              { header: 'Amount (₹)', value: (x) => rupees(x.l.amountPaise) },
              { header: 'Balance pcs', value: (x) => x.p.balancePcs },
              { header: 'Balance sq m', value: (x) => x.p.balanceSqm },
              { header: 'Freight (₹)', value: (x) => rupees(x.o.freightPaise) },
              { header: 'Order value (₹)', value: (x) => rupees(x.o.totals.total) },
              { header: 'EDD', value: (x) => x.o.edd },
              { header: 'Status', value: (x) => SO_STATUS_LABEL[x.o.status] },
            ],
          }),
        ];
      }
      case 'invoices': {
        const is = (await this.docs.allInvoices()).filter((i) => ofFirm(i.firm, r) && inRange(i.date, r));
        return [
          sheet({
            name: 'Sales invoices',
            rows: is.flatMap((i) => i.lines.map((l) => ({ i, l }))),
            columns: [
              { header: 'Firm', value: (x) => firmLabel(x.i.firm) },
              { header: 'Invoice No', value: (x) => x.i.invNo },
              { header: 'Date', value: (x) => x.i.date },
              { header: 'Bill to', value: (x) => x.i.billTo },
              { header: 'Ship to', value: (x) => x.i.shipTo },
              { header: 'SO No', value: (x) => x.i.soNo },
              { header: 'Item', value: (x) => x.l.itemName },
              { header: 'Brand', value: (x) => x.l.brand },
              { header: 'SO qty (sq m)', value: (x) => x.l.soQtySqm },
              { header: 'Dispatched pcs', value: (x) => x.l.pcs },
              { header: 'Dispatched sq m', value: (x) => x.l.qtySqm },
              { header: 'Rate / sq m (₹)', value: (x) => rupees(x.l.ratePaise) },
              { header: 'Rate / sq ft (₹)', value: (x) => rupees(rateSqftOf(x.l.ratePaise)) },
              { header: 'Amount (₹)', value: (x) => rupees(x.l.amountPaise) },
              { header: 'CGST (₹)', value: (x) => rupees(x.i.totals.cgst) },
              { header: 'SGST (₹)', value: (x) => rupees(x.i.totals.sgst) },
              { header: 'IGST (₹)', value: (x) => rupees(x.i.totals.igst) },
              { header: 'Total (₹)', value: (x) => rupees(x.i.totals.total) },
              { header: 'Weight (tons)', value: (x) => x.i.tons },
              { header: 'E-way bill', value: (x) => x.i.ewayBill },
              { header: 'IRN', value: (x) => x.i.irn },
              { header: 'Approval', value: (x) => APPROVAL_LABEL[x.i.approval] },
            ],
          }),
        ];
      }
      case 'dispatch': {
        const reg = await this.dispatchRegister({ ...r, pageSize: 100000 });
        return [
          sheet({
            name: 'Dispatch register',
            rows: reg.rows,
            columns: [
              { header: 'Firm', value: (o) => firmLabel(o.firm) },
              { header: 'SO No', value: (o) => o.soNo },
              { header: 'Ship to', value: (o) => o.shipTo },
              { header: 'Vehicle No', value: (o) => o.dispatch.vehicleNo },
              { header: 'Transporter', value: (o) => o.dispatch.transporter },
              { header: 'Transporter GSTIN', value: (o) => o.dispatch.transporterGstin },
              { header: 'LR No', value: (o) => o.dispatch.lrNo },
              { header: 'Driver', value: (o) => o.dispatch.driverName },
              { header: 'Driver mobile', value: (o) => o.dispatch.driverMobile },
              { header: 'Dispatch date', value: (o) => o.dispatch.date },
              { header: 'Freight (₹)', value: (o) => rupees(o.freightPaise) },
            ],
          }),
        ];
      }
      case 'fg':
        return [
          sheet({
            name: 'FG inventory',
            rows: await this.masters.listFg(r.firm),
            columns: [
              { header: 'Firm', value: (f) => firmLabel(f.firm) },
              { header: 'Grade', value: (f) => f.grade },
              { header: 'Thickness (mm)', value: (f) => f.thic },
              { header: 'Size (mm)', value: (f) => `${f.width} x ${f.length}` },
              { header: 'On hand (sq m)', value: (f) => f.qtyOnHandSqm },
              { header: 'Reserved (sq m)', value: (f) => f.reservedSqm },
              { header: 'Available (sq m)', value: (f) => f.availableSqm },
              { header: 'Reorder level (sq m)', value: (f) => f.reorderSqm },
              { header: 'Status', value: (f) => (f.low ? 'Low stock' : 'OK') },
            ],
          }),
        ];
      case 'intercompany':
        return [
          sheet({
            name: 'Inter-company',
            rows: (await this.masters.allIntercompany()).filter((x) => !r.from && !r.to ? true : inRange(x.billingDate, r)),
            columns: [
              { header: 'Billing doc', value: (x) => x.billingDoc },
              { header: 'Billing date', value: (x) => x.billingDate },
              { header: 'Material', value: (x) => x.materialDesc },
              { header: 'Pcs', value: (x) => x.pcs },
              { header: 'Qty (sq m)', value: (x) => x.qtySqm },
              { header: 'Rate (₹)', value: (x) => rupees(x.ratePaise) },
              { header: 'Material value (₹)', value: (x) => rupees(x.materialPaise) },
              { header: 'IGST (₹)', value: (x) => rupees(x.igstPaise) },
              { header: 'SGST (₹)', value: (x) => rupees(x.sgstPaise) },
              { header: 'CGST (₹)', value: (x) => rupees(x.cgstPaise) },
              { header: 'Total tax (₹)', value: (x) => rupees(x.taxPaise) },
              { header: 'Freight (₹)', value: (x) => rupees(x.freightPaise) },
              { header: 'Total invoice value (₹)', value: (x) => rupees(x.totalPaise) },
              { header: 'Vehicle No', value: (x) => x.vehicleNo },
              { header: 'LLP invoice', value: (x) => (x.matched ? 'Matched' : 'Check') },
            ],
          }),
        ];
      default: {
        const id = kind.replace(/^report:/, '') as ReportId;
        const rep = await this.report(id, r);
        const t = rep.table;
        const sheets: SheetSpec<any>[] = [];
        if (t) {
          const cell = (kindOf: string | undefined, v: unknown) => (typeof v === 'number' && kindOf === 'money' ? rupees(v) : (v as string | number | null));
          sheets.push({
            name: rep.label,
            rows: t.totals ? [...t.rows, t.totals] : t.rows,
            columns: t.columns.map((c) => ({ header: c.kind === 'money' ? `${c.label} (₹)` : c.label, value: (row: Record<string, unknown>) => cell(c.kind, row[c.key]) })),
          });
        }
        if (rep.pivot)
          sheets.push({
            name: 'Product summary',
            rows: [...rep.pivot.products, { itemName: 'Grand total', pcs: rep.pivot.pcs }],
            columns: [
              { header: 'Product', value: (p) => p.itemName },
              { header: 'Balance pcs', value: (p) => p.pcs },
            ],
          });
        return sheets;
      }
    }
  }

  // ── Print and email ───────────────────────────────────────────────

  async letterhead(firm: Firm): Promise<CompanyBlock> {
    return firm === 'llp' ? this.company.block() : OSB_LETTERHEAD;
  }

  /** The document with letterhead and both parties' details. */
  async printPayload(actor: Actor, kind: EmailDoc, id: string) {
    const doc = kind === 'proforma' ? await this.docs.getProforma(id) : kind === 'order' ? await this.docs.getOrder(id) : await this.docs.getInvoice(id);
    const no = kind === 'proforma' ? (doc as ProformaView).piNo : kind === 'order' ? (doc as SalesOrderView).soNo : (doc as SalesInvoiceView).invNo;
    const [company, billParty, shipParty] = await Promise.all([
      this.letterhead(doc.firm),
      doc.billToId ? this.data.repos.salesCustomers.getById(doc.billToId) : null,
      doc.shipToId ? this.data.repos.salesCustomers.getById(doc.shipToId) : null,
    ]);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Print', entityType: `sales_${kind}`, entityId: id, details: `Printed ${no}` }));
    return { company, doc, billParty, shipParty, generatedAt: isoNow(this.clock) };
  }

  /** Subject and body from the Sales settings template, and the default recipients (legacy openSendEmailModal). */
  async emailDraft(kind: EmailDoc, id: string): Promise<EmailDraft> {
    const s = await readSettings(this.data.repos);
    const t = s.emailTemplates[kind];
    let values: Record<string, string>;
    if (kind === 'proforma') {
      const p = await this.docs.getProforma(id);
      values = { piNo: p.piNo, piDate: fmtDate(p.date), validUntil: fmtDate(p.validUntil) || '—', billTo: p.billTo, shipTo: p.shipTo, totalValue: fmtMoney(p.totals.total), firm: FIRM_LABEL[p.firm] };
    } else if (kind === 'order') {
      const o: SalesOrderView = await this.docs.getOrder(id);
      values = { soNo: o.soNo, soDate: fmtDate(o.date), billTo: o.billTo, shipTo: o.shipTo, orderValue: fmtMoney(o.totals.total), firm: FIRM_LABEL[o.firm] };
    } else {
      const i = await this.docs.getInvoice(id);
      values = { invNo: i.invNo, invDate: fmtDate(i.date), billTo: i.billTo, shipTo: i.shipTo, total: fmtMoney(i.totals.total), firm: FIRM_LABEL[i.firm] };
    }
    return { to: s.emailRecipients[kind], subject: fillTemplate(t.subject, values), body: fillTemplate(t.body, values) };
  }
}
