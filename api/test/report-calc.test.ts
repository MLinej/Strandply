// Unit tests for every dashboard/report calculation, on hand-worked fixture data.
import { describe, expect, it } from 'vitest';
import type { DispatchStatus, ReportTable } from '../src/contracts/sampletrack';
import {
  costTracking,
  courierPerformance,
  dispatchRegister,
  lastMonths,
  marketingPerformance,
  monthlyTrend,
  partyWise,
  pct,
  pendingReport,
  productAnalysis,
  statusDistribution,
  type ReportDispatch,
  type ReportRequest,
} from '../src/modules/sampletrack/reports/calc';
import { toCsv } from '../src/modules/sampletrack/reports/report-service';

// ── Fixtures ─────────────────────────────────────────────────────────
//  #     date        party  courier            mode           freight   status      weight
//  0001  2026-09-05  Alpha  Blue Dart          Courier         450.00   Delivered    25
//  0002  2026-09-10  Beta   Gujarat Transport  Transport      1200.00   In Transit   80
//  0003  2026-08-20  Alpha  Blue Dart          Courier         680.00   Delayed      40  (overdue)
//  0004  2026-10-01  Beta   —                  Hand Delivery     0.00   Pending       5
//  0010  2026-10-01  Alpha  blue dart (typed)  Courier         300.00   Delivered    10
//  0005  2026-07-15  Gamma  DTDC               Courier         270.00   Returned     12
//  Total freight 2,900.00 (290000 paise), 6 dispatches.

const parties = {
  A: { partyId: 'pa', partyName: 'Alpha Ply', partyCity: 'Rajkot' },
  B: { partyId: 'pb', partyName: 'Beta Boards', partyCity: 'Pune' },
  C: { partyId: 'pc', partyName: 'Gamma Interiors', partyCity: null },
};

const dsp = (
  no: string,
  date: string,
  party: keyof typeof parties,
  courierName: string | null,
  mode: ReportDispatch['mode'],
  freightPaise: number,
  status: DispatchStatus,
  weightKg: number,
  overdue = false,
): ReportDispatch => ({
  id: `d${no}`,
  dspNo: `DSP-${no}`,
  date,
  ...parties[party],
  courierName,
  trackingNo: null,
  mode,
  vehicleNo: null,
  driverDetails: null,
  expectedDeliveryDate: null,
  weightKg,
  freightPaise,
  dimensions: null,
  productDescription: null,
  linkedRequestNo: null,
  status,
  overdue,
  remarks: null,
});

const D: ReportDispatch[] = [
  dsp('0001', '2026-09-05', 'A', 'Blue Dart', 'Courier', 45000, 'Delivered', 25),
  dsp('0002', '2026-09-10', 'B', 'Gujarat Transport', 'Transport', 120000, 'In Transit', 80),
  dsp('0003', '2026-08-20', 'A', 'Blue Dart', 'Courier', 68000, 'Delayed', 40, true),
  dsp('0004', '2026-10-01', 'B', null, 'Hand Delivery', 0, 'Pending', 5),
  dsp('0010', '2026-10-01', 'A', 'blue dart', 'Courier', 30000, 'Delivered', 10),
  dsp('0005', '2026-07-15', 'C', 'DTDC', 'Courier', 27000, 'Returned', 12),
];

//  REQ   date        party  by     status      lines
//  0001  2026-09-01  Alpha  Asha   Delivered   p1 OSB "5 sheets"; free "Teak Veneer" "2 pcs"
//  0002  2026-09-08  Beta   Asha   Pending     p1 OSB "3 sheets"
//  0003  2026-09-15  Alpha  Ravi   Dispatched  free "teak veneer" board Veneer "1"
//  0004  2026-08-25  Gamma  —      Pending     p2 MDO "4 sheets"; p1 (no board) "5-6 sheets"
//  0005  2026-07-01  Beta   Ravi   Delivered   p2 MDO "2 sheets"
const line = (
  requestId: string,
  lineNo: number,
  productId: string | null,
  productName: string,
  board: string | null,
  qtyValue: number | null,
  qtyUnit: string | null,
) => ({
  id: `${requestId}-${lineNo}`,
  requestId,
  lineNo,
  productId,
  productName,
  board,
  thickness: null,
  size: null,
  qtyValue,
  qtyUnit,
  qtyRaw: null,
  createdBy: null,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});

const req = (
  no: string,
  date: string,
  partyName: string,
  by: [string, string] | null,
  status: ReportRequest['status'],
  items: ReturnType<typeof line>[],
): ReportRequest => ({
  id: `r${no}`,
  reqNo: `REQ-${no}`,
  date,
  partyName,
  status,
  requestedByUserId: by?.[0] ?? null,
  requestedByName: by?.[1] ?? null,
  items,
});

const ASHA: [string, string] = ['u1', 'Asha'];
const RAVI: [string, string] = ['u2', 'Ravi'];
const R: ReportRequest[] = [
  req('0001', '2026-09-01', 'Alpha Ply', ASHA, 'Delivered', [line('r0001', 1, 'p1', 'OSB 18mm', 'OSB', 5, 'sheets'), line('r0001', 2, null, 'Teak Veneer', null, 2, 'pcs')]),
  req('0002', '2026-09-08', 'Beta Boards', ASHA, 'Pending', [line('r0002', 1, 'p1', 'OSB 18mm', 'OSB', 3, 'sheets')]),
  req('0003', '2026-09-15', 'Alpha Ply', RAVI, 'Dispatched', [line('r0003', 1, null, 'teak veneer', 'Veneer', 1, 'sheets')]),
  req('0004', '2026-08-25', 'Gamma Interiors', null, 'Pending', [
    line('r0004', 1, 'p2', 'MDO 12mm', 'MDO', 4, 'sheets'),
    line('r0004', 2, 'p1', 'OSB 18mm', null, null, null),
  ]),
  req('0005', '2026-07-01', 'Beta Boards', RAVI, 'Delivered', [line('r0005', 1, 'p2', 'MDO 12mm', 'MDO', 2, 'sheets')]),
];

const PRODUCTS = [
  { id: 'p1', code: 'OSB-18', name: 'OSB 18mm Premium', boardType: 'OSB' as const, unitPricePaise: 120000, stockStatus: 'Available' as const },
  { id: 'p2', code: 'MDO-12', name: 'MDO 12mm Board', boardType: 'MDO' as const, unitPricePaise: 95000, stockStatus: 'Limited' as const },
  { id: 'p3', code: 'CV-06', name: 'Core Veneer 6mm', boardType: 'Core Veneer' as const, unitPricePaise: 65000, stockStatus: 'Available' as const },
];

const table = (t: ReportTable, ...keys: string[]) => t.rows.map((r) => keys.map((k) => r[k]));

// ── Tests ────────────────────────────────────────────────────────────

describe('pct', () => {
  it('rounds to one decimal and is 0 for an empty whole', () => {
    expect(pct(2, 3)).toBe(66.7);
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(1, 8)).toBe(12.5);
    expect(pct(3, 3)).toBe(100);
    expect(pct(0, 0)).toBe(0);
  });
});

describe('dashboard calculations', () => {
  it('lastMonths: six months ending in the current one, across a year boundary too', () => {
    expect(lastMonths('2026-10-01')).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(lastMonths('2026-02-28')).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
    expect(lastMonths('2026-03-31', 3)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('monthlyTrend: dispatched by dispatch date; delivered by delivery date, falling back to dispatch date', () => {
    const extra = [
      { id: 'x1', date: '2026-04-28', status: 'Delivered' as const }, // dispatched before the window, delivered in May
      { id: 'x2', date: '2026-06-10', status: 'Delivered' as const }, // no history → counted in June
    ];
    const trend = monthlyTrend(lastMonths('2026-10-01'), [...D, ...extra], {
      d0001: '2026-09-07',
      d0010: '2026-10-02',
      x1: '2026-05-02',
    });
    expect(trend.map((p) => [p.month, p.dispatched, p.delivered])).toEqual([
      ['2026-05', 0, 1],
      ['2026-06', 1, 1],
      ['2026-07', 1, 0], // 0005 Returned: not delivered
      ['2026-08', 1, 0],
      ['2026-09', 2, 1],
      ['2026-10', 2, 1],
    ]);
    expect(trend[0]!.label).toBe('May 2026');
    expect(trend[5]!.label).toBe('Oct 2026');
  });

  it('statusDistribution: five statuses; Pending adds Pending requests (legacy)', () => {
    const counts = { Pending: 1, Approved: 4, Packed: 2, Dispatched: 0, 'In Transit': 1, Delivered: 2, Delayed: 1, Returned: 1 };
    expect(statusDistribution(counts, 2)).toEqual({
      slices: [
        { status: 'Pending', count: 3 },
        { status: 'Dispatched', count: 0 },
        { status: 'In Transit', count: 1 },
        { status: 'Delivered', count: 2 },
        { status: 'Delayed', count: 1 },
      ],
      pendingBreakdown: { dispatches: 1, requests: 2 },
    });
  });
});

describe('1. dispatch register', () => {
  it('lists every dispatch by date then number, with record count and total freight', () => {
    const r = dispatchRegister(D);
    expect(r.summary).toEqual([
      { label: 'Total Records', value: 6, type: 'number' },
      { label: 'Total Freight', value: 290000, type: 'money' },
    ]);
    const t = r.tables[0]!;
    expect(table(t, 'dspNo', 'date', 'party', 'courier', 'freight', 'status', 'overdue')).toEqual([
      ['DSP-0005', '2026-07-15', 'Gamma Interiors', 'DTDC', 27000, 'Returned', null],
      ['DSP-0003', '2026-08-20', 'Alpha Ply', 'Blue Dart', 68000, 'Delayed', 'Yes'],
      ['DSP-0001', '2026-09-05', 'Alpha Ply', 'Blue Dart', 45000, 'Delivered', null],
      ['DSP-0002', '2026-09-10', 'Beta Boards', 'Gujarat Transport', 120000, 'In Transit', null],
      ['DSP-0004', '2026-10-01', 'Beta Boards', null, 0, 'Pending', null],
      ['DSP-0010', '2026-10-01', 'Alpha Ply', 'blue dart', 30000, 'Delivered', null],
    ]);
    expect(t.columns.map((c) => c.key)).toEqual([
      'dspNo', 'date', 'party', 'city', 'courier', 'trackingNo', 'mode', 'vehicleNo', 'driver', 'expectedDelivery',
      'weightKg', 'freight', 'dimensions', 'product', 'linkedRequest', 'status', 'overdue', 'remarks',
    ]);
    expect(t.totals).toEqual({ dspNo: 'Total', freight: 290000, weightKg: 172 });
  });

  it('is empty-safe', () => {
    expect(dispatchRegister([]).summary.map((s) => s.value)).toEqual([0, 0]);
  });
});

describe('2. pending', () => {
  it('Pending/In Transit/Dispatched/Delayed dispatches plus Pending requests, oldest first', () => {
    const r = pendingReport(D, R);
    expect(table(r.tables[0]!, 'no', 'type', 'party', 'status', 'date', 'overdue')).toEqual([
      ['DSP-0003', 'Dispatch', 'Alpha Ply', 'Delayed', '2026-08-20', 'Yes'],
      ['REQ-0004', 'Request', 'Gamma Interiors', 'Pending', '2026-08-25', null],
      ['REQ-0002', 'Request', 'Beta Boards', 'Pending', '2026-09-08', null],
      ['DSP-0002', 'Dispatch', 'Beta Boards', 'In Transit', '2026-09-10', null],
      ['DSP-0004', 'Dispatch', 'Beta Boards', 'Pending', '2026-10-01', null],
    ]);
    expect(r.summary.map((s) => [s.label, s.value])).toEqual([
      ['Open Dispatches', 3],
      ['Pending Requests', 2],
      ['Total', 5],
    ]);
  });

  it('a Dispatched dispatch counts as open; requests can be left out (courier filter)', () => {
    const r = pendingReport([dsp('0020', '2026-09-01', 'A', 'DTDC', 'Courier', 0, 'Dispatched', 1)], R, { includeRequests: false });
    expect(table(r.tables[0]!, 'no')).toEqual([['DSP-0020']]);
  });
});

describe('3. party-wise', () => {
  it('groups dispatches by party with counts, delivered and freight, plus the lines', () => {
    const r = partyWise(D);
    const [summary, detail] = r.tables;
    expect(table(summary!, 'party', 'city', 'dispatches', 'delivered', 'freight')).toEqual([
      ['Alpha Ply', 'Rajkot', 3, 2, 143000],
      ['Beta Boards', 'Pune', 2, 0, 120000],
      ['Gamma Interiors', null, 1, 0, 27000],
    ]);
    expect(summary!.totals).toEqual({ party: 'Total', dispatches: 6, delivered: 2, freight: 290000 });
    expect(table(detail!, 'party', 'dspNo', 'status', 'freight')).toEqual([
      ['Alpha Ply', 'DSP-0003', 'Delayed', 68000],
      ['Alpha Ply', 'DSP-0001', 'Delivered', 45000],
      ['Alpha Ply', 'DSP-0010', 'Delivered', 30000],
      ['Beta Boards', 'DSP-0002', 'In Transit', 120000],
      ['Beta Boards', 'DSP-0004', 'Pending', 0],
      ['Gamma Interiors', 'DSP-0005', 'Returned', 27000],
    ]);
    expect(r.summary.map((s) => s.value)).toEqual([3, 6, 290000]);
  });
});

describe('4. courier performance', () => {
  it('per courier (names merged ignoring case; Unknown when blank): total, delivered, rate %, freight', () => {
    const r = courierPerformance(D);
    expect(table(r.tables[0]!, 'courier', 'total', 'delivered', 'rate', 'freight')).toEqual([
      ['Blue Dart', 3, 2, 66.7, 143000],
      ['DTDC', 1, 0, 0, 27000],
      ['Gujarat Transport', 1, 0, 0, 120000],
      ['Unknown', 1, 0, 0, 0],
    ]);
    expect(r.tables[0]!.totals).toEqual({ courier: 'Total', total: 6, delivered: 2, rate: 33.3, freight: 290000 });
    expect(r.summary.map((s) => s.value)).toEqual([4, 33.3]);
  });

  it('a whitespace-only courier name is Unknown', () => {
    const r = courierPerformance([dsp('0030', '2026-09-01', 'A', '   ', 'Courier', 100, 'Delivered', 1)]);
    expect(table(r.tables[0]!, 'courier', 'rate')).toEqual([['Unknown', 100]]);
  });
});

describe('5. cost tracking', () => {
  it('total, count, average (rounded to the paisa) and freight with % share by mode', () => {
    const r = costTracking(D);
    expect(r.summary).toEqual([
      { label: 'Total Freight', value: 290000, type: 'money' },
      { label: 'Total Dispatches', value: 6, type: 'number' },
      { label: 'Avg per Dispatch', value: 48333, type: 'money' }, // 290000 / 6 = 48333.33
    ]);
    expect(table(r.tables[0]!, 'mode', 'dispatches', 'freight', 'share')).toEqual([
      ['Courier', 4, 170000, 58.6],
      ['Transport', 1, 120000, 41.4],
      ['Hand Delivery', 1, 0, 0],
    ]);
  });

  it('no dispatches: zeros, no division by zero', () => {
    const r = costTracking([]);
    expect(r.summary.map((s) => s.value)).toEqual([0, 0, 0]);
    expect(r.tables[0]!.rows).toEqual([]);
    expect(r.tables[0]!.totals!.share).toBe(0);
  });
});

describe('6. product analysis', () => {
  it('times requested per product (by id, or by name for free text), board types, sheets, and the master summary', () => {
    const r = productAnalysis(R, PRODUCTS);
    const [requested, master] = r.tables;
    expect(table(requested!, 'product', 'code', 'times', 'requests', 'boards', 'sheets')).toEqual([
      ['OSB 18mm Premium', 'OSB-18', 3, 3, 'OSB', 8], // master name wins over the line text; "5-6 sheets" adds no sheets
      ['MDO 12mm Board', 'MDO-12', 2, 2, 'MDO', 6],
      ['Teak Veneer', null, 2, 2, 'Veneer', 1], // "Teak Veneer" + "teak veneer" are one product; pcs don't count as sheets
    ]);
    expect(table(master!, 'code', 'name', 'board', 'price', 'stock')).toEqual([
      ['CV-06', 'Core Veneer 6mm', 'Core Veneer', 65000, 'Available'],
      ['MDO-12', 'MDO 12mm Board', 'MDO', 95000, 'Limited'],
      ['OSB-18', 'OSB 18mm Premium', 'OSB', 120000, 'Available'],
    ]);
    expect(r.summary.map((s) => s.value)).toEqual([3, 7, 3]);
  });

  it('counts two lines of the same product in one request as two lines but one request', () => {
    const r = productAnalysis(
      [req('0009', '2026-09-01', 'Alpha Ply', ASHA, 'Pending', [line('r9', 1, 'p1', 'x', 'OSB', 1, 'sheets'), line('r9', 2, 'p1', 'x', 'S-OSB', 1, 'sheets')])],
      PRODUCTS,
    );
    expect(table(r.tables[0]!, 'times', 'requests', 'boards', 'sheets')).toEqual([[2, 1, 'OSB, S-OSB', 2]]);
  });
});

describe('7. marketing performance', () => {
  it('per requester (Unassigned when blank): total, delivered, pending, success rate %', () => {
    const r = marketingPerformance(R);
    expect(table(r.tables[0]!, 'person', 'total', 'delivered', 'pending', 'rate')).toEqual([
      ['Asha', 2, 1, 1, 50],
      ['Ravi', 2, 1, 0, 50],
      ['Unassigned', 1, 0, 1, 0],
    ]);
    expect(r.tables[0]!.totals).toEqual({ person: 'Total', total: 5, delivered: 2, pending: 2, rate: 40 });
    expect(r.summary.map((s) => s.value)).toEqual([5, 40]);
  });
});

describe('CSV', () => {
  it('BOM, money in rupees, quoting, and formula-injection guard', () => {
    const csv = toCsv({
      name: 't',
      title: 'T',
      columns: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'freight', label: 'Freight', type: 'money' },
        { key: 'rate', label: 'Rate', type: 'percent' },
      ],
      rows: [
        { name: 'Pune Traders & Co., "PT"', freight: 125050, rate: 66.7 },
        { name: '=HYPERLINK("http://evil")', freight: 0, rate: null },
        { name: '-5 sheets', freight: -100, rate: 0 },
      ],
      totals: { name: 'Total', freight: 124950, rate: null },
    });
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Name,Freight (₹),Rate (%)',
      '"Pune Traders & Co., ""PT""",1250.5,66.7',
      `"'=HYPERLINK(""http://evil"")",0,`,
      "'-5 sheets,-1,0",
      'Total,1249.5,',
      '',
    ]);
  });
});
