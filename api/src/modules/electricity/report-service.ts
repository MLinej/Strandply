import { pfBand, type BillSummary, type BillView, type DailyReport, type ElBill, type ElectricityDashboard, type ElectricityMeta, type MonthRow, type ReadingPreview, type TodayStatus } from '../../contracts/electricity';
import { fyOf } from '../../contracts/purchase';
import type { Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { writeXlsx } from '../../lib/spreadsheet';
import type { DataLayer } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { cost, dayRows, readingView, ReadingBook, totals, type RateBook } from './calc';
import type { ElectricityService } from './electricity-service';

export interface Range {
  from?: string;
  to?: string;
}
const rupees = (p: number | null) => (p === null ? null : Math.round(p) / 100);
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const FAR_PAST = '2000-01-01';

/** Meta and status, the punch preview, the 12-hr / 24-hr / monthly views, dashboard, bill views and exports. */
export class ElectricityReportService {
  constructor(
    private readonly data: DataLayer,
    private readonly electricity: ElectricityService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  private today = () => businessToday(this.clock);
  private async books() {
    const [readings, book] = await Promise.all([this.data.repos.elReadings.listAll(), this.electricity.rateBook()]);
    return { readings: new ReadingBook(readings), book };
  }

  async meta(): Promise<ElectricityMeta> {
    const { readings, book } = await this.books();
    const today = this.today();
    return { meter: await this.electricity.meter(), rates: book.on(today), status: this.status(readings, book, today), today };
  }

  /** Legacy status bar: diff = PM − AM once both are in; cost adds the day's fixed charge. */
  private status(readings: ReadingBook, book: RateBook, date: string): TodayStatus {
    const am = readings.shift(date, 'AM').at(-1) ?? null;
    const pm = readings.shift(date, 'PM').at(-1) ?? null;
    const diff = am && pm ? Math.round((pm.kwh - am.kwh) * 100) / 100 : null;
    const net = diff === null ? null : Math.round(diff * book.value('mf', date) * 100) / 100;
    const c = net === null ? null : cost(book, date, net);
    const pf = [...readings.sorted].reverse().find((r) => r.date === date && r.pf !== null)?.pf ?? null;
    return { date, am: am && { time: am.time, kwh: am.kwh }, pm: pm && { time: pm.time, kwh: pm.kwh }, diff, net, costPaise: c ? c.energyPaise + c.fuelPaise + Math.round(book.dailyFixed(date)) : null, pf };
  }

  /** What a reading would add, before it's saved (legacy updatePreview). */
  async preview(q: { date: string; time: string; kwh: number }): Promise<ReadingPreview> {
    const { readings, book } = await this.books();
    const prev = readings.before(q);
    const r = book.on(q.date);
    const diff = prev ? Math.round((q.kwh - prev.kwh) * 100) / 100 : null;
    const net = diff === null ? null : Math.round(diff * r.mf * 100) / 100;
    const c = net === null ? null : cost(book, q.date, net);
    const shiftFixedPaise = Math.round(book.dailyFixed(q.date) / 2);
    return {
      prev: prev && { date: prev.date, time: prev.time, kwh: prev.kwh },
      diff,
      mf: r.mf,
      net,
      energyRatePaise: r.energyPaise,
      fuelRatePaise: r.fuelPaise,
      energyPaise: c?.energyPaise ?? null,
      fuelPaise: c?.fuelPaise ?? null,
      shiftFixedPaise,
      totalPaise: c ? c.energyPaise + c.fuelPaise + shiftFixedPaise : null,
    };
  }

  /** Reading list rows with their difference and cost (legacy punch table). */
  async readingViews(query: Parameters<ElectricityService['listReadings']>[0]) {
    const [{ readings, book }, page] = await Promise.all([this.books(), this.electricity.listReadings(query)]);
    return { rows: page.rows.map((r) => readingView(r, readings, book)), total: page.total };
  }

  async daily(range: Range): Promise<DailyReport> {
    const { readings, book } = await this.books();
    const rows = dayRows(readings, book, range.from ?? FAR_PAST, range.to ?? this.today());
    return { rows, totals: totals(rows) };
  }

  /** Legacy dashboard: totals for the range and a row per month. */
  async dashboard(range: Range): Promise<ElectricityDashboard> {
    const { rows, totals: t } = await this.daily(range);
    const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort();
    return { totals: t, months: months.map((month): MonthRow => ({ month, ...totals(rows.filter((r) => r.date.startsWith(month))) })) };
  }

  // ── Bills ─────────────────────────────────────────────────────────

  /** Differences from the previous bill (by date) × the MF on the bill date; the readings' estimate for the same period. */
  async billViews(bills?: ElBill[]): Promise<BillView[]> {
    const [all, { readings, book }] = await Promise.all([this.data.repos.elBills.listAll(), this.books()]);
    const sorted = [...all].sort((a, b) => a.billDate.localeCompare(b.billDate));
    return (bills ?? sorted).map((b) => {
      const prev = [...sorted].reverse().find((x) => x.billDate < b.billDate) ?? null;
      const mf = book.value('mf', b.billDate);
      const kwhDiff = prev ? Math.round((b.kwhReading - prev.kwhReading) * 100) / 100 : null;
      const kvarhDiff = prev && prev.kvarhReading !== null && b.kvarhReading !== null ? Math.round((b.kvarhReading - prev.kvarhReading) * 100) / 100 : null;
      const periodFrom = prev ? nextDay(prev.billDate) : null;
      const est = periodFrom ? totals(dayRows(readings, book, periodFrom, b.billDate)) : null;
      const { invoice, ...rest } = b;
      return {
        ...rest,
        mf,
        kwhDiff,
        kwhNet: kwhDiff === null ? null : Math.round(kwhDiff * mf * 100) / 100,
        kvarhDiff,
        kvarhNet: kvarhDiff === null ? null : Math.round(kvarhDiff * mf * 100) / 100,
        periodFrom,
        estimatePaise: est && est.days ? est.totalPaise : null,
        estimateNet: est && est.days ? est.net : null,
        invoice: invoice && { name: invoice.name, sizeBytes: invoice.sizeBytes },
      };
    });
  }

  async bills(range: Range): Promise<{ rows: BillView[]; summary: BillSummary }> {
    const all = await this.billViews();
    const rows = all.filter((b) => (!range.from || b.billDate >= range.from) && (!range.to || b.billDate <= range.to)).reverse();
    const fy = fyOf(this.today());
    const pfs = all.map((b) => b.pf).filter((x): x is number => x !== null);
    return {
      rows,
      summary: {
        count: all.length,
        lastPaise: all.at(-1)?.totalPayablePaise ?? null,
        avgPaise: all.length ? Math.round(all.reduce((s, b) => s + b.totalPayablePaise, 0) / all.length) : null,
        fyPaise: all.filter((b) => fyOf(b.billDate) === fy).reduce((s, b) => s + b.totalPayablePaise, 0),
        avgPf: pfs.length ? Math.round((pfs.reduce((s, x) => s + x, 0) / pfs.length) * 1000) / 1000 : null,
      },
    };
  }

  async bill(id: string): Promise<BillView> {
    return (await this.billViews([await this.electricity.getBill(id)]))[0]!;
  }

  // ── Exports ───────────────────────────────────────────────────────

  async exportXlsx(actor: Actor, kind: 'readings' | 'daily' | 'bills', range: Range): Promise<Uint8Array> {
    let bytes: Uint8Array;
    let count: number;
    if (kind === 'readings') {
      const { readings, book } = await this.books();
      const rows = readings.sorted.filter((r) => (!range.from || r.date >= range.from) && (!range.to || r.date <= range.to)).map((r) => readingView(r, readings, book));
      count = rows.length;
      bytes = writeXlsx([
        {
          name: 'Meter readings',
          rows,
          columns: [
            { header: 'Date', value: (r) => r.date },
            { header: 'Shift', value: (r) => r.shift },
            { header: 'Time', value: (r) => r.time },
            { header: 'kWh', value: (r) => r.kwh },
            { header: 'kWh diff', value: (r) => r.diff },
            { header: 'MF', value: (r) => r.mf },
            { header: 'Net kWh', value: (r) => r.net },
            { header: 'Energy (₹)', value: (r) => rupees(r.energyPaise) },
            { header: 'Fuel (₹)', value: (r) => rupees(r.fuelPaise) },
            { header: 'Fixed, half day (₹)', value: (r) => rupees(r.shiftFixedPaise) },
            { header: 'Total (₹)', value: (r) => rupees(r.totalPaise) },
            { header: 'PF', value: (r) => r.pf },
            { header: 'PF band', value: (r) => (r.pf === null ? null : pfBand(r.pf)) },
            { header: 'Night units', value: (r) => r.nightKwh },
            { header: 'Remarks', value: (r) => r.remarks },
          ],
        },
      ]);
    } else if (kind === 'daily') {
      const { rows } = await this.daily(range);
      count = rows.length;
      bytes = writeXlsx([
        {
          name: 'Daily',
          rows,
          columns: [
            { header: 'Date', value: (r) => r.date },
            { header: 'AM time', value: (r) => r.am?.time ?? null },
            { header: 'AM reading', value: (r) => r.am?.kwh ?? null },
            { header: 'AM diff', value: (r) => r.amDiff },
            { header: 'AM net kWh', value: (r) => r.amNet },
            { header: 'PM time', value: (r) => r.pm?.time ?? null },
            { header: 'PM reading', value: (r) => r.pm?.kwh ?? null },
            { header: 'PM diff', value: (r) => r.pmDiff },
            { header: 'PM net kWh', value: (r) => r.pmNet },
            { header: 'Day diff', value: (r) => r.raw },
            { header: 'MF', value: (r) => r.mf },
            { header: 'Net kWh', value: (r) => r.net },
            { header: 'PF', value: (r) => r.pf },
            { header: 'Energy (₹)', value: (r) => rupees(r.energyPaise) },
            { header: 'Fuel (₹)', value: (r) => rupees(r.fuelPaise) },
            { header: 'Fixed (₹)', value: (r) => rupees(r.fixedPaise) },
            { header: 'Total (₹)', value: (r) => rupees(r.totalPaise) },
          ],
        },
      ]);
    } else {
      const rows = (await this.bills(range)).rows.reverse();
      count = rows.length;
      bytes = writeXlsx([
        {
          name: 'PGVCL bills',
          rows,
          columns: [
            { header: 'Bill date', value: (b) => b.billDate },
            { header: 'Due date', value: (b) => b.dueDate },
            { header: 'Paid date', value: (b) => b.paidDate },
            { header: 'kWh reading', value: (b) => b.kwhReading },
            { header: 'kWh diff', value: (b) => b.kwhDiff },
            { header: 'kWh × MF', value: (b) => b.kwhNet },
            { header: 'kVArh reading', value: (b) => b.kvarhReading },
            { header: 'kVArh diff', value: (b) => b.kvarhDiff },
            { header: 'kVArh × MF', value: (b) => b.kvarhNet },
            { header: 'PF', value: (b) => b.pf },
            { header: 'Night units', value: (b) => b.nightUnits },
            { header: 'Demand (₹)', value: (b) => rupees(b.charges.demand) },
            { header: 'Energy (₹)', value: (b) => rupees(b.charges.energy) },
            { header: 'Fuel surcharge (₹)', value: (b) => rupees(b.charges.fuelSurcharge) },
            { header: 'PF rebate (₹)', value: (b) => rupees(b.charges.pfRebate) },
            { header: 'Night rebate (₹)', value: (b) => rupees(b.charges.nightRebate) },
            { header: 'EHV rebate (₹)', value: (b) => rupees(b.charges.ehvRebate) },
            { header: 'Time of use (₹)', value: (b) => rupees(b.charges.timeOfUse) },
            { header: 'GT (₹)', value: (b) => rupees(b.charges.gt) },
            { header: 'Total consumption (₹)', value: (b) => rupees(b.charges.totalConsumption) },
            { header: 'Electricity duty (₹)', value: (b) => rupees(b.charges.electricityDuty) },
            { header: 'Meter charges (₹)', value: (b) => rupees(b.charges.meterCharges) },
            { header: 'TCS (₹)', value: (b) => rupees(b.charges.tcs) },
            { header: 'Advance adjusted (₹)', value: (b) => rupees(b.advancePaymentPaise) },
            { header: 'Net payable (₹)', value: (b) => rupees(b.netPayablePaise) },
            { header: 'Total payable (₹)', value: (b) => rupees(b.totalPayablePaise) },
            { header: 'Readings estimate (₹)', value: (b) => rupees(b.estimatePaise) },
            { header: 'Remarks', value: (b) => b.remarks },
          ],
        },
      ]);
    }
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'electricity_export', details: `Exported ${kind} (${count} rows)` }));
    return bytes;
  }
}
