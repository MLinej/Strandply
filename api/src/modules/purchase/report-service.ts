// Purchase dashboard and analytics (legacy renderDashboard / renderReports / renderDaywiseChart /
// renderProdDayReport and their Excel exports). The legacy consumption, yield and ageing figures were
// fixed percentages; here they come from the stock ledger.
import {
  MATERIALS,
  type DayRow,
  type MaterialId,
  type MaterialSummary,
  type PurchaseDashboard,
  type PurchaseEntryView,
  type PurchaseReports,
  type RateVarianceRow,
  type VendorPerformance,
} from '../../contracts/purchase';
import type { Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { writeXlsx } from '../../lib/spreadsheet';
import type { DataLayer } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { entryViews, fyRange, isPosted, materialLabel, monthRange } from './common';
import type { InventoryService } from './inventory-service';

const rupees = (p: number) => Math.round(p) / 100;
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayName = (date: string) => DAY[new Date(`${date}T00:00:00Z`).getUTCDay()]!;

export interface ReportScope {
  fy: string;
  month?: string;
  material?: MaterialId;
}

function summarize(rows: PurchaseEntryView[]): MaterialSummary[] {
  return MATERIALS.map((m) => {
    const rs = rows.filter((r) => r.material === m.id);
    return {
      material: m.id,
      entries: rs.length,
      invQty: rs.reduce((s, r) => s + r.invQty, 0),
      splQty: rs.reduce((s, r) => s + r.splQty, 0),
      avgRatePaise: avg(rs.map((r) => r.ratePaise)),
      basicSplPaise: rs.reduce((s, r) => s + r.calc.spl.basic, 0),
      totalSplPaise: rs.reduce((s, r) => s + r.calc.spl.total, 0),
      notes: rs.filter((r) => r.calc.qtyNote || r.calc.rateNote).length,
    };
  });
}

function topN(rows: PurchaseEntryView[], key: (r: PurchaseEntryView) => string | null, value: (r: PurchaseEntryView) => number, n: number) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) m.set(k, (m.get(k) ?? 0) + value(r));
  }
  return [...m.entries()]
    .map(([label, v]) => ({ label, value: v }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, n);
}

export class PurchaseReportService {
  constructor(
    private readonly data: DataLayer,
    private readonly inventory: InventoryService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  /** Posted entries in the FY (narrowed to a month and/or material), oldest first. */
  private async entries(scope: ReportScope): Promise<PurchaseEntryView[]> {
    const { from, to } = scope.month ? monthRange(scope.month) : fyRange(scope.fy);
    const rows = (await this.data.repos.purchaseEntries.listBetween(from, to)).filter((e) => isPosted(e) && (!scope.material || e.material === scope.material));
    return entryViews(this.data, rows);
  }

  async dashboard(scope: ReportScope): Promise<PurchaseDashboard> {
    const rows = await this.entries(scope);
    const today = businessToday(this.clock);
    const todays = rows.filter((r) => r.date === today);
    // Quantity notes not yet issued or settled.
    const pendingNote = (type: 'dn' | 'cn') => {
      const open = rows.filter((r) => r.calc.qtyNote?.type === type && ['Pending', 'Under Review'].includes(r.qtyNoteStatus));
      return { count: open.length, paise: open.reduce((s, r) => s + r.calc.qtyNote!.total, 0) };
    };
    const monthly = new Map<string, number>();
    for (const r of rows) monthly.set(r.date.slice(0, 7), (monthly.get(r.date.slice(0, 7)) ?? 0) + r.calc.spl.total);
    return {
      fy: scope.fy,
      month: scope.month ?? null,
      kpis: {
        totalSplPaise: rows.reduce((s, r) => s + r.calc.spl.total, 0),
        entries: rows.length,
        splQty: rows.reduce((s, r) => s + r.splQty, 0),
        vendors: new Set(rows.map((r) => r.vendorName.toLowerCase())).size,
        pendingDebitNotes: pendingNote('dn'),
        pendingCreditNotes: pendingNote('cn'),
        pendingApproval: rows.filter((r) => r.status === 'pending').length,
        inventoryPaise: await this.inventory.closingPaise(scope.fy),
        todayInward: { count: todays.length, paise: todays.reduce((s, r) => s + r.calc.spl.total, 0) },
      },
      monthly: [...monthly.entries()].sort().map(([label, value]) => ({ label, value })),
      topVendors: topN(rows, (r) => r.vendorName, (r) => r.calc.spl.total, 6),
      byMaterial: summarize(rows),
      topVehicles: topN(rows, (r) => r.vehicleNo, (r) => r.splQty, 5),
      recent: [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 10),
    };
  }

  async reports(scope: ReportScope): Promise<PurchaseReports> {
    const rows = await this.entries(scope);

    const dayMap = new Map<string, PurchaseEntryView[]>();
    for (const r of rows) {
      const k = `${r.date}|${r.material}`;
      dayMap.set(k, [...(dayMap.get(k) ?? []), r]);
    }
    const productDay: DayRow[] = [...dayMap.values()].map((rs) => ({
      date: rs[0]!.date,
      material: rs[0]!.material,
      entries: rs.length,
      invQty: rs.reduce((s, r) => s + r.invQty, 0),
      splQty: rs.reduce((s, r) => s + r.splQty, 0),
      avgRatePaise: avg(rs.map((r) => r.ratePaise)) ?? 0,
      basicInvPaise: rs.reduce((s, r) => s + r.calc.invoice.basic, 0),
      basicSplPaise: rs.reduce((s, r) => s + r.calc.spl.basic, 0),
      totalSplPaise: rs.reduce((s, r) => s + r.calc.spl.total, 0),
    }));
    productDay.sort((a, b) => a.date.localeCompare(b.date) || materialLabel(a.material).localeCompare(materialLabel(b.material)));

    const months = new Map<string, PurchaseEntryView[]>();
    for (const r of rows) months.set(r.date.slice(0, 7), [...(months.get(r.date.slice(0, 7)) ?? []), r]);

    const vendorMap = new Map<string, PurchaseEntryView[]>();
    for (const r of rows) vendorMap.set(r.vendorName, [...(vendorMap.get(r.vendorName) ?? []), r]);
    const vendors: VendorPerformance[] = [...vendorMap.entries()]
      .map(([vendorName, rs]) => {
        const inv = rs.reduce((s, r) => s + r.invQty, 0);
        return {
          vendorName,
          entries: rs.length,
          totalSplPaise: rs.reduce((s, r) => s + r.calc.spl.total, 0),
          invQty: inv,
          splQty: rs.reduce((s, r) => s + r.splQty, 0),
          qtyVariancePct: inv ? Math.round((rs.reduce((s, r) => s + Math.abs(r.calc.diffQty), 0) / inv) * 10000) / 100 : 0,
          rateNotes: rs.filter((r) => r.calc.rateNote).length,
        };
      })
      .sort((a, b) => b.totalSplPaise - a.totalSplPaise);

    const rateVariance: RateVarianceRow[] = rows
      .filter((r) => r.calc.rateNote)
      .map((r) => ({
        entryId: r.id,
        date: r.date,
        material: r.material,
        vendorName: r.vendorName,
        invoiceNo: r.invoiceNo,
        invoiceRatePaise: r.ratePaise,
        agreedRatePaise: r.ratePaise - r.rateDiffPaise,
        diffPaise: r.rateDiffPaise,
        impactPaise: r.calc.rateNote!.basic * (r.rateDiffPaise > 0 ? 1 : -1),
      }));

    const ledger = (await this.inventory.view(scope.fy)).rows;
    const nilgiri = ledger.filter((l) => l.material === 'nilgiri');
    const purchasedQty = nilgiri.reduce((s, l) => s + l.purchQty, 0);
    const consumedQty = nilgiri.reduce((s, l) => s + l.consumeQty, 0);

    return {
      fy: scope.fy,
      month: scope.month ?? null,
      material: scope.material ?? null,
      daywise: rows,
      productDay,
      byMaterial: summarize(rows),
      monthly: [...months.entries()].sort().map(([month, rs]) => ({
        month,
        totalSplPaise: rs.reduce((s, r) => s + r.calc.spl.total, 0),
        avgRatePaise: avg(rs.map((r) => r.ratePaise)) ?? 0,
      })),
      vendors,
      rateVariance,
      nilgiriYield: {
        purchasedQty,
        consumedQty,
        consumedPct: purchasedQty ? Math.round((consumedQty / purchasedQty) * 1000) / 10 : null,
        byspecies: nilgiri.map((l) => ({ species: l.species ?? 'Unspecified', purchasedQty: l.purchQty, consumedQty: l.consumeQty })),
      },
      consumption: MATERIALS.map((m) => {
        const ls = ledger.filter((l) => l.material === m.id);
        return { material: m.id, purchasedQty: ls.reduce((s, l) => s + l.purchQty, 0), consumedQty: ls.reduce((s, l) => s + l.consumeQty, 0) };
      }),
    };
  }

  /** Day-wise detail (legacy exportDaywise) or the product × day workbook (legacy exportProdDayExcel, 3 sheets). */
  async exportXlsx(actor: Actor, scope: ReportScope, kind: 'daywise' | 'product-day'): Promise<Uint8Array> {
    const r = await this.reports(scope);
    const detail = {
      name: 'Full Detail',
      rows: r.daywise,
      columns: [
        { header: 'Date', value: (e: PurchaseEntryView) => e.date },
        { header: 'Day', value: (e: PurchaseEntryView) => dayName(e.date) },
        { header: 'Material', value: (e: PurchaseEntryView) => materialLabel(e.material) },
        { header: 'Invoice No', value: (e: PurchaseEntryView) => e.invoiceNo },
        { header: 'Vendor', value: (e: PurchaseEntryView) => e.vendorName },
        { header: 'Inv Qty', value: (e: PurchaseEntryView) => e.invQty },
        { header: 'SPL Qty', value: (e: PurchaseEntryView) => e.splQty },
        { header: 'Rate (₹)', value: (e: PurchaseEntryView) => rupees(e.ratePaise) },
        { header: 'Basic Inv (₹)', value: (e: PurchaseEntryView) => rupees(e.calc.invoice.basic) },
        { header: 'Basic SPL (₹)', value: (e: PurchaseEntryView) => rupees(e.calc.spl.basic) },
        { header: 'Total SPL (₹)', value: (e: PurchaseEntryView) => rupees(e.calc.spl.total) },
      ],
    };
    const sheets =
      kind === 'daywise'
        ? [{ ...detail, name: 'Day-wise Purchase' }]
        : [
            {
              name: 'Day × Product Summary',
              rows: r.productDay,
              columns: [
                { header: 'Date', value: (d: DayRow) => d.date },
                { header: 'Day', value: (d: DayRow) => dayName(d.date) },
                { header: 'Material', value: (d: DayRow) => materialLabel(d.material) },
                { header: 'Entries', value: (d: DayRow) => d.entries },
                { header: 'Total Inv Qty', value: (d: DayRow) => d.invQty },
                { header: 'Total SPL Qty', value: (d: DayRow) => d.splQty },
                { header: 'Avg Rate (₹)', value: (d: DayRow) => rupees(d.avgRatePaise) },
                { header: 'Basic Inv (₹)', value: (d: DayRow) => rupees(d.basicInvPaise) },
                { header: 'Basic SPL (₹)', value: (d: DayRow) => rupees(d.basicSplPaise) },
                { header: 'Total SPL (₹)', value: (d: DayRow) => rupees(d.totalSplPaise) },
              ],
            },
            {
              name: 'Product Totals',
              rows: r.byMaterial.filter((m) => m.entries),
              columns: [
                { header: 'Material', value: (m: MaterialSummary) => materialLabel(m.material) },
                { header: 'Entries', value: (m: MaterialSummary) => m.entries },
                { header: 'Total SPL Qty', value: (m: MaterialSummary) => m.splQty },
                { header: 'Avg Rate (₹)', value: (m: MaterialSummary) => (m.avgRatePaise === null ? null : rupees(m.avgRatePaise)) },
                { header: 'Basic SPL (₹)', value: (m: MaterialSummary) => rupees(m.basicSplPaise) },
                { header: 'Total SPL (₹)', value: (m: MaterialSummary) => rupees(m.totalSplPaise) },
              ],
            },
            detail,
          ];
    const bytes = writeXlsx(sheets);
    await this.data.uow.run((tx) =>
      this.activity.record(tx, actor, { action: 'Export', entityType: 'purchase_report', entityId: kind, details: `Exported ${kind} purchase report, FY ${scope.fy}${scope.month ? ` ${scope.month}` : ''}` }),
    );
    return bytes;
  }
}
