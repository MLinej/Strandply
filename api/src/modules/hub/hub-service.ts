import { achievementPct } from '../../contracts/dwpas';
import { isOverdue } from '../../contracts/maintenance';
import { calcHotPress } from '../../contracts/production';
import { calcEntry, fyEnd, fyOf, fyStart, MATERIAL_BY_ID } from '../../contracts/purchase';
import { boardTons, isOpenSo } from '../../contracts/sales';
import type { HubAnalytics, HubElectricity, HubMaintenance, HubOverview, HubPeriod, HubProduction, HubPurchase, HubSales, HubSource, HubStock, MonthValue, Named } from '../../contracts/hub';
import type { Clock } from '../../lib/clock';
import { businessDateOf, businessToday } from '../../lib/dates';
import { writeXlsx } from '../../lib/spreadsheet';
import type { DataLayer } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import type { ElectricityReportService } from '../electricity/report-service';
import type { InventoryService } from '../purchase/inventory-service';
import type { StockService } from '../stock/stock-service';

export interface Range {
  from: string;
  to: string;
}
const within = (d: string | null | undefined, r: Range) => !!d && d >= r.from && d <= r.to;
const month = (d: string) => d.slice(0, 7);
const r2 = (n: number) => Math.round(n * 100) / 100;
function tally<T>(rows: T[], key: (x: T) => string, value: (x: T) => number = () => 1): Named[] {
  const m = new Map<string, number>();
  for (const x of rows) m.set(key(x), (m.get(key(x)) ?? 0) + value(x));
  return [...m].map(([name, v]) => ({ name, value: r2(v) })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}
const byMonth = <T,>(rows: T[], date: (x: T) => string, value: (x: T) => number): MonthValue[] =>
  tally(rows, (x) => month(date(x)), value)
    .map((x) => ({ month: x.name, value: x.value }))
    .sort((a, b) => a.month.localeCompare(b.month));
/** A document's board tonnage from its lines. */
const tonsOf = (lines: { thic: number | null; width: number | null; length: number | null; pcs: number }[]) => r2(lines.reduce((s, l) => s + boardTons(l.thic, l.width, l.length, l.pcs), 0));
const SO_LABEL: Record<string, string> = { draft: 'Draft', confirmed: 'Confirmed', planned: 'Production planned', ready: 'Ready for dispatch', partial: 'Partially dispatched', completed: 'Completed', cancelled: 'Cancelled' };

/**
 * Cross-module reports (legacy Reports Hub). Reads each module's own records through the repos and the modules'
 * own calculations (purchase entry totals, hot press boards, the electricity costing, the purchase inventory ledger),
 * so the hub always agrees with the module screens.
 */
export class HubService {
  constructor(
    private readonly data: DataLayer,
    private readonly electricity: ElectricityReportService,
    private readonly inventory: InventoryService,
    private readonly stock: StockService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  today = () => businessToday(this.clock);
  /** The current FY to date when no range is given. */
  range(from?: string, to?: string): Range {
    const today = this.today();
    return { from: from ?? fyStart(fyOf(today)), to: to ?? today };
  }

  // ── Per module ────────────────────────────────────────────────────

  /** Purchase entries saved for approval or approved (drafts are left out); value is the SPL total with tax and other charges. */
  async purchase(r: Range, material?: string): Promise<HubPurchase> {
    const rows = (await this.data.repos.purchaseEntries.listBetween(r.from, r.to))
      .filter((e) => e.status !== 'draft' && (!material || e.material === material))
      .map((e) => {
        const c = calcEntry(e);
        return { e, value: c.spl.total + e.otherChargesPaise };
      });
    const mats = [...new Set(rows.map((x) => x.e.material))];
    return {
      entries: rows.length,
      valuePaise: rows.reduce((s, x) => s + x.value, 0),
      vendors: new Set(rows.map((x) => x.e.vendorName)).size,
      pendingEntries: rows.filter((x) => x.e.status !== 'approved').length,
      byMaterial: mats.map((m) => {
        const xs = rows.filter((x) => x.e.material === m);
        const def = MATERIAL_BY_ID[m];
        return { material: m, label: def.label, unit: def.unit, entries: xs.length, qty: r2(xs.reduce((s, x) => s + x.e.splQty, 0)), valuePaise: xs.reduce((s, x) => s + x.value, 0) };
      }),
      byMonth: byMonth(rows, (x) => x.e.date, (x) => x.value),
      topVendors: tally(rows, (x) => x.e.vendorName, (x) => x.value).slice(0, 8),
      recent: [...rows]
        .sort((a, b) => b.e.date.localeCompare(a.e.date) || b.e.createdAt.localeCompare(a.e.createdAt))
        .slice(0, 25)
        .map(({ e, value }) => ({ id: e.id, date: e.date, material: MATERIAL_BY_ID[e.material].label, vendor: e.vendorName, invoiceNo: e.invoiceNo, qty: e.splQty, unit: MATERIAL_BY_ID[e.material].unit, valuePaise: value })),
    };
  }

  /** Hot press reports (legacy HP_REPORTS): boards pressed. */
  async production(r: Range): Promise<HubProduction> {
    const rows = (await this.data.repos.prodHotpress.listAll()).filter((h) => within(h.date, r)).map((h) => ({ h, boards: calcHotPress(h.charges).totalBoards }));
    const products = [...new Set(rows.map((x) => x.h.product))];
    return {
      reports: rows.length,
      boards: rows.reduce((s, x) => s + x.boards, 0),
      byMonth: byMonth(rows, (x) => x.h.date, (x) => x.boards),
      byProduct: products.map((product) => ({ product, reports: rows.filter((x) => x.h.product === product).length, boards: rows.filter((x) => x.h.product === product).reduce((s, x) => s + x.boards, 0) })).sort((a, b) => b.boards - a.boards),
      byShift: tally(rows, (x) => x.h.shift, (x) => x.boards),
    };
  }

  /** PGVCL bills dated in the range, and the meter readings' net units and estimate day by day. */
  async power(r: Range): Promise<HubElectricity & { readings: number }> {
    const [bills, daily, readings] = await Promise.all([this.electricity.billViews(), this.electricity.daily(r), this.data.repos.elReadings.listAll()]);
    const inRange = bills.filter((b) => within(b.billDate, r));
    const months = [...new Set([...inRange.map((b) => month(b.billDate)), ...daily.rows.map((d) => month(d.date))])].sort();
    return {
      bills: inRange.length,
      billedUnits: r2(inRange.reduce((s, b) => s + (b.kwhNet ?? 0), 0)),
      billedPaise: inRange.reduce((s, b) => s + b.totalPayablePaise, 0),
      meteredUnits: daily.totals.net,
      meteredPaise: daily.totals.totalPaise,
      byMonth: months.map((m) => {
        const ds = daily.rows.filter((d) => d.date.startsWith(m));
        return { month: m, billedPaise: inRange.filter((b) => b.billDate.startsWith(m)).reduce((s, b) => s + b.totalPayablePaise, 0), meteredUnits: r2(ds.reduce((s, d) => s + d.net, 0)), meteredPaise: ds.reduce((s, d) => s + d.totalPaise, 0) };
      }),
      billList: inRange.sort((a, b) => b.billDate.localeCompare(a.billDate)).map((b) => ({ id: b.id, billDate: b.billDate, dueDate: b.dueDate, paidDate: b.paidDate, units: b.kwhNet, totalPaise: b.totalPayablePaise })),
      readings: readings.filter((x) => within(x.date, r)).length,
    };
  }

  /** Invoices in the range, and the sales orders still open (whatever their date). */
  async sales(r: Range, firm?: string): Promise<HubSales> {
    const [invs, orders] = await Promise.all([this.data.repos.salesInvoices.listAll(), this.data.repos.salesOrders.listAll()]);
    const rows = invs.filter((i) => within(i.date, r) && (!firm || i.firm === firm)).map((i) => ({ i, tons: tonsOf(i.lines) }));
    const sos = orders.filter((o) => !firm || o.firm === firm);
    const open = sos.filter((o) => isOpenSo(o.status)).sort((a, b) => b.totalPaise - a.totalPaise);
    return {
      invoices: rows.length,
      revenuePaise: rows.reduce((s, x) => s + x.i.totalPaise, 0),
      tons: r2(rows.reduce((s, x) => s + x.tons, 0)),
      pendingApproval: rows.filter((x) => x.i.approval === 'pending').length,
      byMonth: byMonth(rows, (x) => x.i.date, (x) => x.i.totalPaise),
      topCustomers: tally(rows, (x) => x.i.billTo, (x) => x.i.totalPaise).slice(0, 8),
      byFirm: tally(rows, (x) => x.i.firm.toUpperCase(), (x) => x.i.totalPaise),
      pendingOrders: open.map((o) => ({ soNo: o.soNo, firm: o.firm, date: o.date, party: o.billTo, status: SO_LABEL[o.status] ?? o.status, tons: tonsOf(o.lines), valuePaise: o.totalPaise })),
      pendingPaise: open.reduce((s, o) => s + o.totalPaise, 0),
      pendingTons: r2(open.reduce((s, o) => s + tonsOf(o.lines), 0)),
      pipeline: Object.keys(SO_LABEL)
        .map((status) => ({ status: SO_LABEL[status]!, orders: sos.filter((o) => o.status === status).length, valuePaise: sos.filter((o) => o.status === status).reduce((s, o) => s + o.totalPaise, 0) }))
        .filter((x) => x.orders),
      recent: [...rows]
        .sort((a, b) => b.i.date.localeCompare(a.i.date))
        .slice(0, 25)
        .map(({ i, tons }) => ({ id: i.id, invNo: i.invNo, date: i.date, firm: i.firm, party: i.billTo, tons, totalPaise: i.totalPaise })),
    };
  }

  /** Work orders raised, due or worked on in the range (legacy taskTouchedInRange); overdue as of today. */
  async maintenance(r: Range): Promise<HubMaintenance> {
    const today = this.today();
    const rows = (await this.data.repos.mtWorkOrders.listAll()).filter((w) => within(businessDateOf(w.createdAt), r) || within(w.dueDate, r) || w.timeline.some((e) => within(businessDateOf(e.at), r)));
    const open = rows.filter((w) => w.status !== 'Completed');
    return {
      workOrders: rows.length,
      open: open.length,
      overdue: open.filter((w) => isOverdue(w, today)).length,
      completed: rows.length - open.length,
      byCategory: tally(rows, (w) => w.category),
      byPriority: tally(rows, (w) => w.priority),
      openList: open
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .map((w) => ({ id: w.id, woNo: w.woNo, title: w.title, category: w.category, priority: w.priority, assignee: w.assignee, dueDate: w.dueDate, status: w.status, overdue: isOverdue(w, today) })),
    };
  }

  /** Raw material from the Purchase inventory ledger for the FY, and SKU stock now by department. */
  async stockView(fy?: string): Promise<HubStock> {
    const f = fy ?? fyOf(this.today());
    const [inv, live] = await Promise.all([this.inventory.view(f), this.stock.liveStock()]);
    const mats = [...new Set(inv.rows.map((x) => x.material))];
    const raw = mats.map((m) => {
      const xs = inv.rows.filter((x) => x.material === m);
      const sum = (k: 'openQty' | 'purchQty' | 'consumeQty' | 'closingQty') => r2(xs.reduce((s, x) => s + x[k], 0));
      return { material: m, label: MATERIAL_BY_ID[m].label, unit: MATERIAL_BY_ID[m].unit, openQty: sum('openQty'), purchQty: sum('purchQty'), consumeQty: sum('consumeQty'), closingQty: sum('closingQty'), closingPaise: xs.reduce((s, x) => s + x.closingPaise, 0) };
    });
    return { fy: f, raw, rawClosingPaise: raw.reduce((s, x) => s + x.closingPaise, 0), sku: live.byDept.map((d) => ({ dept: d.dept, skus: d.skus, qty: d.qty })) };
  }

  /** Cost per board and power per board (legacy Cross-Module Analytics), month by month. */
  async analytics(r: Range): Promise<HubAnalytics> {
    const [p, prod, power] = await Promise.all([this.purchase(r), this.production(r), this.power(r)]);
    const months = [...new Set([...p.byMonth.map((x) => x.month), ...prod.byMonth.map((x) => x.month), ...power.byMonth.map((x) => x.month)])].sort();
    const per = (cost: number, boards: number) => (boards > 0 ? Math.round(cost / boards) : null);
    const kwh = (units: number, boards: number) => (boards > 0 ? r2((units / boards) * 1000) : null);
    const cost = p.valuePaise + power.meteredPaise;
    return {
      costPaise: cost,
      boards: prod.boards,
      costPerBoardPaise: per(cost, prod.boards),
      kwhPerThousand: kwh(power.meteredUnits, prod.boards),
      rawShare: cost > 0 ? Math.round((p.valuePaise / cost) * 100) : null,
      byMonth: months.map((m) => {
        const boards = prod.byMonth.find((x) => x.month === m)?.value ?? 0;
        const rawPaise = p.byMonth.find((x) => x.month === m)?.value ?? 0;
        const pw = power.byMonth.find((x) => x.month === m);
        return { month: m, boards, rawPaise, powerPaise: pw?.meteredPaise ?? 0, units: pw?.meteredUnits ?? 0, costPerBoardPaise: per(rawPaise + (pw?.meteredPaise ?? 0), boards), kwhPerThousand: kwh(pw?.meteredUnits ?? 0, boards) };
      }),
    };
  }

  // ── Consolidated ──────────────────────────────────────────────────

  async overview(r: Range): Promise<HubOverview> {
    const [p, prod, power, s, m, a] = await Promise.all([this.purchase(r), this.production(r), this.power(r), this.sales(r), this.maintenance(r), this.analytics(r)]);
    const months = [...new Set([...p.byMonth, ...prod.byMonth, ...s.byMonth].map((x) => x.month).concat(power.byMonth.map((x) => x.month)))].sort();
    const at = (xs: MonthValue[], mo: string) => xs.find((x) => x.month === mo)?.value ?? 0;
    return {
      from: r.from,
      to: r.to,
      purchasePaise: p.valuePaise,
      purchaseEntries: p.entries,
      boards: prod.boards,
      hpReports: prod.reports,
      powerPaise: power.meteredPaise,
      powerUnits: power.meteredUnits,
      revenuePaise: s.revenuePaise,
      invoices: s.invoices,
      costPerBoardPaise: a.costPerBoardPaise,
      openWorkOrders: m.open,
      months: months.map((mo) => ({ month: mo, purchasePaise: at(p.byMonth, mo), boards: at(prod.byMonth, mo), powerPaise: power.byMonth.find((x) => x.month === mo)?.meteredPaise ?? 0, revenuePaise: at(s.byMonth, mo) })),
      materialShare: p.byMaterial.map((x) => ({ name: x.label, value: x.valuePaise })).sort((a2, b) => b.value - a2.value),
    };
  }

  /** Everything for a period: one day (daily report), a month or a financial year. */
  async period(r: Range): Promise<HubPeriod> {
    const [purchase, production, electricity, sales, maintenance, complaints, orders, plans] = await Promise.all([
      this.purchase(r),
      this.production(r),
      this.power(r),
      this.sales(r),
      this.maintenance(r),
      this.data.repos.complaints.listAll(),
      this.data.repos.trOrders.listAll(),
      this.data.repos.dwPlans.listAll(),
    ]);
    const cps = complaints.filter((c) => within(c.date, r));
    const fos = orders.filter((o) => o.status !== 'cancelled' && within(o.date, r));
    const pls = plans.filter((p) => within(p.date, r));
    const pcts = pls.flatMap((p) => p.lines.map((l) => achievementPct(l.qty, l.actualQty))).filter((x): x is number => x !== null);
    return {
      from: r.from,
      to: r.to,
      purchase,
      production,
      electricity,
      sales,
      maintenance,
      others: {
        complaints: cps.length,
        complaintsOpen: cps.filter((c) => c.status === 'Open' || c.status === 'In Progress').length,
        freightOrders: fos.length,
        freightPaise: fos.reduce((s, o) => s + o.ratePaise, 0),
        plans: pls.length,
        plansAchievedPct: pcts.length ? Math.round(pcts.reduce((s, x) => s + x, 0) / pcts.length) : null,
      },
    };
  }

  /** What each module holds (legacy Data Sources, which checked browser storage). */
  async sources(): Promise<HubSource[]> {
    const r = this.data.repos;
    const latest = (rows: { updatedAt: string }[]) => rows.reduce<string | null>((m, x) => (!m || x.updatedAt > m ? x.updatedAt : m), null);
    const [pe, hp, ch, el, bills, inv, so, wo, sk, cp, trq, dw, leads] = await Promise.all([
      r.purchaseEntries.listBetween('0000-01-01', '9999-12-31'),
      r.prodHotpress.listAll(),
      r.prodChipping.listAll(),
      r.elReadings.listAll(),
      r.elBills.listAll(),
      r.salesInvoices.listAll(),
      r.salesOrders.listAll(),
      r.mtWorkOrders.listAll(),
      r.stockSlips.listAll(),
      r.complaints.listAll(),
      r.trInquiries.listAll(),
      r.dwPlans.listAll(),
      r.crmLeads.listAll(),
    ]);
    return [
      { module: 'Purchase', page: '/purchase/register', records: pe.length, label: 'purchase entries', updatedAt: latest(pe) },
      { module: 'Production', page: '/production/hot-press', records: hp.length + ch.length, label: 'hot press and chipping reports', updatedAt: latest([...hp, ...ch]) },
      { module: 'Stock (SKU)', page: '/stock/live', records: sk.length, label: 'stock slips', updatedAt: latest(sk) },
      { module: 'Electricity', page: '/electricity/readings', records: el.length + bills.length, label: 'meter readings and bills', updatedAt: latest([...el, ...bills]) },
      { module: 'Sales', page: '/sales/invoices', records: inv.length + so.length, label: 'invoices and sales orders', updatedAt: latest([...inv, ...so]) },
      { module: 'Maintenance', page: '/maintenance/work-orders', records: wo.length, label: 'work orders', updatedAt: latest(wo) },
      { module: 'Complaints', page: '/complaints/register', records: cp.length, label: 'complaints', updatedAt: latest(cp) },
      { module: 'Transport', page: '/transport/inquiries', records: trq.length, label: 'freight inquiries', updatedAt: latest(trq) },
      { module: 'DWPAS', page: '/dwpas/register', records: dw.length, label: 'work plans', updatedAt: latest(dw) },
      { module: 'CRM', page: '/crm/leads', records: leads.length, label: 'leads', updatedAt: latest(leads) },
    ];
  }

  /** The consolidated report as a workbook: summary, purchase, production, power, sales, pending orders, maintenance. */
  async exportXlsx(actor: Actor, r: Range): Promise<Uint8Array> {
    const [p, a] = await Promise.all([this.period(r), this.analytics(r)]);
    const rupees = (x: number | null) => (x === null ? null : Math.round(x) / 100);
    const bytes = writeXlsx([
      {
        name: 'Summary',
        rows: [
          ['Period', `${r.from} to ${r.to}`],
          ['Purchase value (₹)', rupees(p.purchase.valuePaise)],
          ['Purchase entries', p.purchase.entries],
          ['Boards pressed', p.production.boards],
          ['Power, metered estimate (₹)', rupees(p.electricity.meteredPaise)],
          ['Power, metered net kWh', p.electricity.meteredUnits],
          ['PGVCL bills (₹)', rupees(p.electricity.billedPaise)],
          ['Sales revenue (₹)', rupees(p.sales.revenuePaise)],
          ['Invoices', p.sales.invoices],
          ['Cost per board (₹)', rupees(a.costPerBoardPaise)],
          ['kWh per 1,000 boards', a.kwhPerThousand],
          ['Work orders', p.maintenance.workOrders],
          ['Complaints', p.others.complaints],
          ['Freight order forms', p.others.freightOrders],
        ] as [string, string | number | null][],
        columns: [
          { header: 'Measure', value: (x) => x[0] },
          { header: 'Value', value: (x) => x[1] },
        ],
      },
      {
        name: 'Purchase',
        rows: p.purchase.byMaterial,
        columns: [
          { header: 'Material', value: (x) => x.label },
          { header: 'Entries', value: (x) => x.entries },
          { header: 'Quantity', value: (x) => x.qty },
          { header: 'Unit', value: (x) => x.unit },
          { header: 'Value (₹)', value: (x) => rupees(x.valuePaise) },
        ],
      },
      {
        name: 'Production',
        rows: p.production.byProduct,
        columns: [
          { header: 'Product', value: (x) => x.product },
          { header: 'Reports', value: (x) => x.reports },
          { header: 'Boards', value: (x) => x.boards },
        ],
      },
      {
        name: 'Cost per board',
        rows: a.byMonth,
        columns: [
          { header: 'Month', value: (x) => x.month },
          { header: 'Boards', value: (x) => x.boards },
          { header: 'Raw material (₹)', value: (x) => rupees(x.rawPaise) },
          { header: 'Power (₹)', value: (x) => rupees(x.powerPaise) },
          { header: 'kWh', value: (x) => x.units },
          { header: 'Cost per board (₹)', value: (x) => rupees(x.costPerBoardPaise) },
          { header: 'kWh per 1,000 boards', value: (x) => x.kwhPerThousand },
        ],
      },
      {
        name: 'Sales',
        rows: p.sales.recent,
        columns: [
          { header: 'Date', value: (x) => x.date },
          { header: 'Invoice', value: (x) => x.invNo },
          { header: 'Firm', value: (x) => x.firm.toUpperCase() },
          { header: 'Party', value: (x) => x.party },
          { header: 'Tons', value: (x) => x.tons },
          { header: 'Amount (₹)', value: (x) => rupees(x.totalPaise) },
        ],
      },
      {
        name: 'Pending orders',
        rows: p.sales.pendingOrders,
        columns: [
          { header: 'SO', value: (x) => x.soNo },
          { header: 'Date', value: (x) => x.date },
          { header: 'Party', value: (x) => x.party },
          { header: 'Status', value: (x) => x.status },
          { header: 'Tons', value: (x) => x.tons },
          { header: 'Value (₹)', value: (x) => rupees(x.valuePaise) },
        ],
      },
      {
        name: 'Maintenance',
        rows: p.maintenance.openList,
        columns: [
          { header: 'WO', value: (x) => x.woNo },
          { header: 'Title', value: (x) => x.title },
          { header: 'Category', value: (x) => x.category },
          { header: 'Priority', value: (x) => x.priority },
          { header: 'Assigned to', value: (x) => x.assignee },
          { header: 'Due', value: (x) => x.dueDate },
          { header: 'Status', value: (x) => x.status },
          { header: 'Overdue', value: (x) => (x.overdue ? 'Yes' : '') },
        ],
      },
    ]);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'hub_export', details: `Exported the consolidated report ${r.from} to ${r.to}` }));
    return bytes;
  }

  /** Financial years that have data, newest first (for the FY picker). */
  async years(): Promise<string[]> {
    const r = this.data.repos;
    const [pe, hp, inv] = await Promise.all([r.purchaseEntries.listBetween('0000-01-01', '9999-12-31'), r.prodHotpress.listAll(), r.salesInvoices.listAll()]);
    return [...new Set([fyOf(this.today()), ...[...pe, ...hp, ...inv].map((x) => fyOf(x.date))])].sort().reverse();
  }

  fyRange = (fy: string): Range => ({ from: fyStart(fy), to: fyEnd(fy) });
}
