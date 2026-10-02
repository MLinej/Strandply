import type {
  Report,
  ReportCell,
  ReportColumn,
  ReportFilters,
  ReportKey,
  ReportPrint,
  ReportTable,
} from '../../../contracts/sampletrack';
import { isoNow, type Clock } from '../../../lib/clock';
import { validationFailed } from '../../../lib/errors';
import { writeXlsx } from '../../../lib/spreadsheet';
import type { DataLayer } from '../../../repos';
import type { ActivityService } from '../activity-service';
import type { Actor } from '../actor';
import type { DispatchService } from '../dispatches/dispatch-service';
import { collectAll, rupees } from '../masters/common';
import type { PrintService } from '../print/print-service';
import {
  costTracking,
  courierPerformance,
  dispatchRegister,
  marketingPerformance,
  partyWise,
  pendingReport,
  productAnalysis,
  type ReportBody,
} from './calc';

/** Reports built from requests only, where a courier filter means nothing. */
const REQUEST_REPORTS: ReportKey[] = ['product-analysis', 'marketing-performance'];

export const A4_LANDSCAPE = { size: 'A4', orientation: 'landscape', widthMm: 297, heightMm: 210 } as const;

export class ReportService {
  constructor(
    private readonly data: DataLayer,
    private readonly dispatches: DispatchService,
    private readonly print: PrintService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  async build(key: ReportKey, filters: ReportFilters): Promise<Report> {
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      throw validationFailed('Invalid input', [{ path: 'dateTo', message: 'End date is before the start date' }]);
    }
    if (filters.courierId && REQUEST_REPORTS.includes(key)) {
      throw validationFailed('Invalid input', [{ path: 'courierId', message: 'This report is built from requests and has no courier' }]);
    }
    const { repos } = this.data;
    const party = filters.partyId ? await repos.parties.getById(filters.partyId) : null;
    if (filters.partyId && !party) throw validationFailed('Invalid input', [{ path: 'partyId', message: 'Unknown party' }]);
    const courier = filters.courierId ? await repos.couriers.getById(filters.courierId) : null;
    if (filters.courierId && !courier) throw validationFailed('Invalid input', [{ path: 'courierId', message: 'Unknown courier' }]);

    const { dateFrom, dateTo, partyId, courierId } = filters;
    const dispatches = () => collectAll((q) => this.dispatches.list(q), { filters: { dateFrom, dateTo, partyId, courierId } });
    const requests = () => collectAll((q) => repos.requests.list(q), { filters: { dateFrom, dateTo, partyId } });

    let body: ReportBody;
    switch (key) {
      case 'dispatch-register':
        body = dispatchRegister(await dispatches());
        break;
      case 'pending':
        body = pendingReport(await dispatches(), courierId ? [] : await requests(), { includeRequests: !courierId });
        break;
      case 'party-wise':
        body = partyWise(await dispatches());
        break;
      case 'courier-performance':
        body = courierPerformance(await dispatches());
        break;
      case 'cost-tracking':
        body = costTracking(await dispatches());
        break;
      case 'product-analysis':
        body = productAnalysis(await requests(), await collectAll((q) => repos.products.list(q), {}));
        break;
      case 'marketing-performance':
        body = marketingPerformance(await requests());
        break;
    }
    return {
      key,
      ...body,
      filters: { ...filters, partyName: party?.name ?? null, courierName: courier?.name ?? null },
      generatedAt: isoNow(this.clock),
    };
  }

  /** xlsx: a Summary sheet plus one sheet per table. csv: one table (default: the first). Money is in rupees. */
  async export(actor: Actor, key: ReportKey, filters: ReportFilters, format: 'xlsx' | 'csv', tableName?: string) {
    const report = await this.build(key, filters);
    const stamp = report.generatedAt.slice(0, 10);
    let out: { bytes: Uint8Array; contentType: string; fileName: string };
    if (format === 'xlsx') {
      const sheets = [
        {
          name: 'Summary',
          columns: [
            { header: 'Report', value: (r: { label: string }) => r.label },
            { header: 'Value', value: (r: { value: ReportCell }) => r.value },
          ],
          rows: [
            { label: report.title, value: null },
            ...filterLines(report).map(([label, value]) => ({ label, value })),
            ...report.summary.map((s) => ({ label: s.label, value: exportValue(s.value, s.type) })),
          ],
        },
        ...report.tables.map((t) => ({
          name: t.title,
          columns: t.columns.map((c) => ({ header: headerOf(c), value: (r: Record<string, ReportCell>) => exportValue(r[c.key] ?? null, c.type) })),
          rows: t.totals ? [...t.rows, t.totals] : t.rows,
        })),
      ];
      out = { bytes: writeXlsx(sheets), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName: `${key}-${stamp}.xlsx` };
    } else {
      const table = tableName ? report.tables.find((t) => t.name === tableName) : report.tables[0];
      if (!table) {
        throw validationFailed('Invalid input', [{ path: 'table', message: `Use one of: ${report.tables.map((t) => t.name).join(', ')}` }]);
      }
      out = {
        bytes: new TextEncoder().encode(toCsv(table)),
        contentType: 'text/csv; charset=utf-8',
        fileName: `${key}${report.tables.length > 1 ? `-${table.name}` : ''}-${stamp}.csv`,
      };
    }
    await this.data.uow.run((tx) =>
      this.activity.record(tx, actor, { action: 'Export', entityType: 'report', entityId: key, details: `Exported ${report.title} (${format})` }),
    );
    return out;
  }

  /** The report plus page and company data for a printed copy. Logged as a print. */
  async printPayload(actor: Actor, key: ReportKey, filters: ReportFilters): Promise<ReportPrint> {
    const report = await this.build(key, filters);
    const payload: ReportPrint = { page: { ...A4_LANDSCAPE }, company: await this.print.company(), report, printedAt: isoNow(this.clock) };
    await this.data.uow.run((tx) =>
      this.activity.record(tx, actor, { action: 'Print', entityType: 'report', entityId: key, details: `Printed ${report.title}` }),
    );
    return payload;
  }
}

const headerOf = (c: ReportColumn) => (c.type === 'money' ? `${c.label} (₹)` : c.type === 'percent' ? `${c.label} (%)` : c.label);

/** Money leaves the API in paise; spreadsheets get rupees. */
function exportValue(v: ReportCell, type: ReportColumn['type']): ReportCell {
  return type === 'money' && typeof v === 'number' ? rupees(v) : v;
}

function filterLines(r: Report): [string, string][] {
  const f = r.filters;
  return [
    ['From', f.dateFrom ?? 'Start'],
    ['To', f.dateTo ?? 'Today'],
    ...(f.partyName ? ([['Party', f.partyName]] as [string, string][]) : []),
    ...(f.courierName ? ([['Courier', f.courierName]] as [string, string][]) : []),
    ['Generated (UTC)', r.generatedAt],
  ];
}

/**
 * RFC 4180 CSV with a UTF-8 BOM (so Excel shows ₹ correctly). Text that starts with = + - @ or a tab
 * gets a leading apostrophe, so a spreadsheet won't run it as a formula.
 */
export function toCsv(table: ReportTable): string {
  const cell = (v: ReportCell): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v);
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [table.columns.map((c) => cell(headerOf(c)))];
  for (const r of table.totals ? [...table.rows, table.totals] : table.rows) {
    lines.push(table.columns.map((c) => cell(exportValue(r[c.key] ?? null, c.type))));
  }
  return '\uFEFF' + lines.map((l) => l.join(',')).join('\r\n') + '\r\n';
}
