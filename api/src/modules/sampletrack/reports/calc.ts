// Pure calculations for the dashboard and the reports: plain rows in, numbers out.
// No data access here, so every figure can be unit-tested with fixture rows.
import type {
  DispatchStatus,
  DispatchView,
  Product,
  ReportColumn,
  ReportSummaryItem,
  ReportTable,
  RequestView,
  StatusSlice,
  TrendPoint,
} from '../../../contracts/sampletrack';
import { normName } from '../../../lib/text';

export type ReportDispatch = Pick<
  DispatchView,
  | 'id'
  | 'dspNo'
  | 'date'
  | 'partyId'
  | 'partyName'
  | 'partyCity'
  | 'courierName'
  | 'trackingNo'
  | 'mode'
  | 'vehicleNo'
  | 'driverDetails'
  | 'expectedDeliveryDate'
  | 'weightKg'
  | 'freightPaise'
  | 'dimensions'
  | 'productDescription'
  | 'linkedRequestNo'
  | 'status'
  | 'overdue'
  | 'remarks'
>;

export type ReportRequest = Pick<RequestView, 'id' | 'reqNo' | 'date' | 'partyName' | 'status' | 'requestedByUserId' | 'requestedByName' | 'items'>;

export interface ReportBody {
  title: string;
  summary: ReportSummaryItem[];
  tables: ReportTable[];
}

/** Percentage with one decimal; 0 when the denominator is 0. */
export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

const byText = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const col = (key: string, label: string, type: ReportColumn['type'] = 'text'): ReportColumn => ({ key, label, type });

// ── Dashboard ────────────────────────────────────────────────────────

/** The last `n` months up to and including the month of `today` (YYYY-MM-DD), oldest first. */
export function lastMonths(today: string, n = 6): string[] {
  const [y, m] = today.split('-').map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * Dispatched vs delivered per month.
 * - dispatched: dispatches whose dispatch date is in the month.
 * - delivered: dispatches now Delivered, counted in the month of their delivery date (India calendar),
 *   or of their dispatch date when there is no history.
 */
export function monthlyTrend(
  months: string[],
  dispatches: Pick<ReportDispatch, 'id' | 'date' | 'status'>[],
  deliveredOn: Record<string, string>,
): TrendPoint[] {
  const points = new Map(
    months.map((m) => [m, { month: m, label: monthLabel.format(new Date(`${m}-01T00:00:00Z`)), dispatched: 0, delivered: 0 }]),
  );
  for (const d of dispatches) {
    const sent = points.get(d.date.slice(0, 7));
    if (sent) sent.dispatched++;
    if (d.status === 'Delivered') {
      const got = points.get((deliveredOn[d.id] ?? d.date).slice(0, 7));
      if (got) got.delivered++;
    }
  }
  return [...points.values()];
}

export const DISTRIBUTION_STATUSES: StatusSlice['status'][] = ['Pending', 'Dispatched', 'In Transit', 'Delivered', 'Delayed'];

/** Legacy doughnut: five dispatch statuses, with Pending requests added to the Pending slice. */
export function statusDistribution(dispatchCounts: Record<DispatchStatus, number>, pendingRequests: number) {
  return {
    slices: DISTRIBUTION_STATUSES.map((status) => ({
      status,
      count: (dispatchCounts[status] ?? 0) + (status === 'Pending' ? pendingRequests : 0),
    })),
    pendingBreakdown: { dispatches: dispatchCounts.Pending ?? 0, requests: pendingRequests },
  };
}

// ── Reports ──────────────────────────────────────────────────────────

const chronological = <T extends { date: string; no: string }>(a: T, b: T) => a.date.localeCompare(b.date) || byText(a.no, b.no);
const sortDispatches = (ds: ReportDispatch[]) =>
  [...ds].sort((a, b) => chronological({ date: a.date, no: a.dspNo }, { date: b.date, no: b.dspNo }));

/** 1. Every dispatch with all register columns, plus the record count and total freight. */
export function dispatchRegister(dispatches: ReportDispatch[]): ReportBody {
  const rows = sortDispatches(dispatches).map((d) => ({
    dspNo: d.dspNo,
    date: d.date,
    party: d.partyName,
    city: d.partyCity,
    courier: d.courierName,
    trackingNo: d.trackingNo,
    mode: d.mode,
    vehicleNo: d.vehicleNo,
    driver: d.driverDetails,
    expectedDelivery: d.expectedDeliveryDate,
    weightKg: d.weightKg,
    freight: d.freightPaise,
    dimensions: d.dimensions,
    product: d.productDescription,
    linkedRequest: d.linkedRequestNo,
    status: d.status,
    overdue: d.overdue ? 'Yes' : null,
    remarks: d.remarks,
  }));
  const totalFreight = sum(dispatches.map((d) => d.freightPaise));
  return {
    title: 'Dispatch Register',
    summary: [
      { label: 'Total Records', value: dispatches.length, type: 'number' },
      { label: 'Total Freight', value: totalFreight, type: 'money' },
    ],
    tables: [
      {
        name: 'register',
        title: 'Dispatch Register',
        columns: [
          col('dspNo', 'Dispatch ID'),
          col('date', 'Date', 'date'),
          col('party', 'Party'),
          col('city', 'City'),
          col('courier', 'Courier'),
          col('trackingNo', 'Tracking No'),
          col('mode', 'Mode'),
          col('vehicleNo', 'Vehicle'),
          col('driver', 'Driver'),
          col('expectedDelivery', 'Expected Delivery', 'date'),
          col('weightKg', 'Weight (KG)', 'number'),
          col('freight', 'Freight', 'money'),
          col('dimensions', 'Dimensions'),
          col('product', 'Product'),
          col('linkedRequest', 'Linked Request'),
          col('status', 'Status'),
          col('overdue', 'Overdue'),
          col('remarks', 'Remarks'),
        ],
        rows,
        totals: { dspNo: 'Total', freight: totalFreight, weightKg: sum(dispatches.map((d) => d.weightKg ?? 0)) },
      },
    ],
  };
}

export const PENDING_DISPATCH_STATUSES: DispatchStatus[] = ['Pending', 'In Transit', 'Dispatched', 'Delayed'];

/** 2. Open work: dispatches in Pending/In Transit/Dispatched/Delayed, plus Pending requests. Oldest first. */
export function pendingReport(dispatches: ReportDispatch[], requests: ReportRequest[], { includeRequests = true } = {}): ReportBody {
  const ds = dispatches.filter((d) => PENDING_DISPATCH_STATUSES.includes(d.status));
  const rs = includeRequests ? requests.filter((r) => r.status === 'Pending') : [];
  const rows = [
    ...ds.map((d) => ({ date: d.date, no: d.dspNo, type: 'Dispatch', party: d.partyName, status: d.status, overdue: d.overdue ? 'Yes' : null })),
    ...rs.map((r) => ({ date: r.date, no: r.reqNo, type: 'Request', party: r.partyName, status: r.status, overdue: null })),
  ].sort(chronological);
  return {
    title: 'Pending Sample Report',
    summary: [
      { label: 'Open Dispatches', value: ds.length, type: 'number' },
      { label: 'Pending Requests', value: rs.length, type: 'number' },
      { label: 'Total', value: rows.length, type: 'number' },
    ],
    tables: [
      {
        name: 'pending',
        title: 'Pending Samples',
        columns: [col('no', 'ID'), col('type', 'Type'), col('party', 'Party'), col('status', 'Status'), col('date', 'Date', 'date'), col('overdue', 'Overdue')],
        rows: rows.map(({ no, type, party, status, date, overdue }) => ({ no, type, party, status, date, overdue })),
      },
    ],
  };
}

/** 3. Dispatches grouped by party: a per-party summary and the dispatch lines. */
export function partyWise(dispatches: ReportDispatch[]): ReportBody {
  const groups = new Map<string, ReportDispatch[]>();
  for (const d of dispatches) groups.set(d.partyId, [...(groups.get(d.partyId) ?? []), d]);
  const parties = [...groups.values()].sort((a, b) => byText(a[0]!.partyName, b[0]!.partyName));
  const totalFreight = sum(dispatches.map((d) => d.freightPaise));
  return {
    title: 'Party-wise Sample Report',
    summary: [
      { label: 'Parties', value: parties.length, type: 'number' },
      { label: 'Dispatches', value: dispatches.length, type: 'number' },
      { label: 'Total Freight', value: totalFreight, type: 'money' },
    ],
    tables: [
      {
        name: 'parties',
        title: 'By Party',
        columns: [
          col('party', 'Party'),
          col('city', 'City'),
          col('dispatches', 'Dispatches', 'number'),
          col('delivered', 'Delivered', 'number'),
          col('freight', 'Freight', 'money'),
        ],
        rows: parties.map((ds) => ({
          party: ds[0]!.partyName,
          city: ds[0]!.partyCity,
          dispatches: ds.length,
          delivered: ds.filter((d) => d.status === 'Delivered').length,
          freight: sum(ds.map((d) => d.freightPaise)),
        })),
        totals: { party: 'Total', dispatches: dispatches.length, delivered: dispatches.filter((d) => d.status === 'Delivered').length, freight: totalFreight },
      },
      {
        name: 'dispatches',
        title: 'Dispatches by Party',
        columns: [col('party', 'Party'), col('dspNo', 'ID'), col('date', 'Date', 'date'), col('mode', 'Mode'), col('freight', 'Freight', 'money'), col('status', 'Status')],
        rows: parties.flatMap((ds) =>
          sortDispatches(ds).map((d) => ({ party: d.partyName, dspNo: d.dspNo, date: d.date, mode: d.mode, freight: d.freightPaise, status: d.status })),
        ),
      },
    ],
  };
}

/** 4. Per courier ("Unknown" when none): total, delivered, delivery rate %, freight. Busiest first. */
export function courierPerformance(dispatches: ReportDispatch[]): ReportBody {
  const groups = new Map<string, { courier: string; total: number; delivered: number; freight: number }>();
  for (const d of dispatches) {
    const name = d.courierName?.trim() || 'Unknown';
    const key = normName(name);
    const g = groups.get(key) ?? { courier: name, total: 0, delivered: 0, freight: 0 };
    g.total++;
    if (d.status === 'Delivered') g.delivered++;
    g.freight += d.freightPaise;
    groups.set(key, g);
  }
  const rows = [...groups.values()]
    .sort((a, b) => b.total - a.total || byText(a.courier, b.courier))
    .map((g) => ({ ...g, rate: pct(g.delivered, g.total) }));
  const delivered = sum(rows.map((r) => r.delivered));
  return {
    title: 'Courier Performance Report',
    summary: [
      { label: 'Couriers', value: rows.length, type: 'number' },
      { label: 'Overall Delivery Rate', value: pct(delivered, dispatches.length), type: 'percent' },
    ],
    tables: [
      {
        name: 'couriers',
        title: 'Courier Performance',
        columns: [
          col('courier', 'Courier'),
          col('total', 'Total Dispatches', 'number'),
          col('delivered', 'Delivered', 'number'),
          col('rate', 'Delivery Rate', 'percent'),
          col('freight', 'Total Freight', 'money'),
        ],
        rows,
        totals: { courier: 'Total', total: dispatches.length, delivered, rate: pct(delivered, dispatches.length), freight: sum(rows.map((r) => r.freight)) },
      },
    ],
  };
}

/** 5. Freight totals, count, average per dispatch (rounded to the paisa), and freight with % share per mode. */
export function costTracking(dispatches: ReportDispatch[]): ReportBody {
  const total = sum(dispatches.map((d) => d.freightPaise));
  const byMode = new Map<string, { mode: string; dispatches: number; freight: number }>();
  for (const d of dispatches) {
    const g = byMode.get(d.mode) ?? { mode: d.mode, dispatches: 0, freight: 0 };
    g.dispatches++;
    g.freight += d.freightPaise;
    byMode.set(d.mode, g);
  }
  const rows = [...byMode.values()]
    .sort((a, b) => b.freight - a.freight || byText(a.mode, b.mode))
    .map((g) => ({ ...g, share: pct(g.freight, total) }));
  const average = dispatches.length ? Math.round(total / dispatches.length) : 0;
  return {
    title: 'Cost Tracking Report',
    summary: [
      { label: 'Total Freight', value: total, type: 'money' },
      { label: 'Total Dispatches', value: dispatches.length, type: 'number' },
      { label: 'Avg per Dispatch', value: average, type: 'money' },
    ],
    tables: [
      {
        name: 'modes',
        title: 'Freight by Mode',
        columns: [col('mode', 'Mode'), col('dispatches', 'Dispatches', 'number'), col('freight', 'Total Freight', 'money'), col('share', '% Share', 'percent')],
        rows,
        totals: { mode: 'Total', dispatches: dispatches.length, freight: total, share: total ? 100 : 0 },
      },
    ],
  };
}

/**
 * 6. How often each product was requested (one count per request line), with the board types
 * seen on those lines. Master products are grouped by id; free-text lines are grouped by name,
 * ignoring case. Also gives the product master summary.
 */
export function productAnalysis(requests: ReportRequest[], products: Pick<Product, 'id' | 'code' | 'name' | 'boardType' | 'unitPricePaise' | 'stockStatus'>[]): ReportBody {
  const master = new Map(products.map((p) => [p.id, p]));
  const groups = new Map<string, { product: string; code: string | null; times: number; requests: Set<string>; boards: Set<string>; sheets: number }>();
  for (const r of requests) {
    for (const i of r.items) {
      const p = i.productId ? master.get(i.productId) : undefined;
      const key = i.productId ? `id:${i.productId}` : `name:${normName(i.productName)}`;
      const g = groups.get(key) ?? { product: p?.name ?? i.productName, code: p?.code ?? null, times: 0, requests: new Set(), boards: new Set(), sheets: 0 };
      g.times++;
      g.requests.add(r.id);
      const board = i.board?.trim() || p?.boardType;
      if (board) g.boards.add(board);
      if (i.qtyUnit === 'sheets' && i.qtyValue !== null) g.sheets += i.qtyValue;
      groups.set(key, g);
    }
  }
  const rows = [...groups.values()]
    .sort((a, b) => b.times - a.times || byText(a.product, b.product))
    .map((g) => ({ product: g.product, code: g.code, times: g.times, requests: g.requests.size, boards: [...g.boards].sort(byText).join(', ') || null, sheets: g.sheets }));
  const lines = sum(rows.map((r) => r.times));
  return {
    title: 'Product-wise Sample Analysis',
    summary: [
      { label: 'Products Requested', value: rows.length, type: 'number' },
      { label: 'Request Lines', value: lines, type: 'number' },
      { label: 'Products in Master', value: products.length, type: 'number' },
    ],
    tables: [
      {
        name: 'requested',
        title: 'Times Requested',
        columns: [
          col('product', 'Product Name'),
          col('code', 'Code'),
          col('times', 'Times Requested', 'number'),
          col('requests', 'Requests', 'number'),
          col('boards', 'Board Type'),
          col('sheets', 'Sheets Requested', 'number'),
        ],
        rows,
      },
      {
        name: 'master',
        title: 'Product Master Summary',
        columns: [col('code', 'Code'), col('name', 'Product'), col('board', 'Board'), col('price', 'Price', 'money'), col('stock', 'Stock')],
        rows: [...products]
          .sort((a, b) => byText(a.code, b.code))
          .map((p) => ({ code: p.code, name: p.name, board: p.boardType, price: p.unitPricePaise, stock: p.stockStatus })),
      },
    ],
  };
}

/** 7. Per requester ("Unassigned" when none): total, delivered, pending, success rate % (delivered / total). */
export function marketingPerformance(requests: ReportRequest[]): ReportBody {
  const groups = new Map<string, { person: string; total: number; delivered: number; pending: number }>();
  for (const r of requests) {
    const key = r.requestedByUserId ?? '';
    const g = groups.get(key) ?? { person: (r.requestedByUserId && r.requestedByName) || 'Unassigned', total: 0, delivered: 0, pending: 0 };
    g.total++;
    if (r.status === 'Delivered') g.delivered++;
    if (r.status === 'Pending') g.pending++;
    groups.set(key, g);
  }
  const rows = [...groups.values()]
    .sort((a, b) => b.total - a.total || byText(a.person, b.person))
    .map((g) => ({ ...g, rate: pct(g.delivered, g.total) }));
  const delivered = sum(rows.map((r) => r.delivered));
  return {
    title: 'Marketing Performance Report',
    summary: [
      { label: 'Requests', value: requests.length, type: 'number' },
      { label: 'Overall Success Rate', value: pct(delivered, requests.length), type: 'percent' },
    ],
    tables: [
      {
        name: 'people',
        title: 'Marketing Performance',
        columns: [
          col('person', 'Marketing Person'),
          col('total', 'Total Requests', 'number'),
          col('delivered', 'Delivered', 'number'),
          col('pending', 'Pending', 'number'),
          col('rate', 'Success Rate', 'percent'),
        ],
        rows,
        totals: { person: 'Total', total: requests.length, delivered, pending: sum(rows.map((r) => r.pending)), rate: pct(delivered, requests.length) },
      },
    ],
  };
}
