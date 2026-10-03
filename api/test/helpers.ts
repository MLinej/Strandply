import { createApp } from '../src/app';
import { hashPassword, TEST_ARGON2 } from '../src/auth/password';
import { SESSION_COOKIE } from '../src/auth/session-middleware';
import type { AppConfig } from '../src/config';
import { ROLES, type Role } from '../src/domain/access';
import type { Courier, Party, Product } from '../src/contracts/sampletrack';
import type { Vendor, VendorCategory } from '../src/contracts/vendors';
import type { PurchaseEntry, PurchaseOrder, PurchaseReturn } from '../src/contracts/purchase';
import type { Grn, Mrn } from '../src/contracts/stores';
import type { OpeningEntry, Reclass, StockSlip } from '../src/contracts/stock';
import type { Chipping, Cutting, DocBase, HotPress, MattBatch, Mdo, Plan, ResinUse, Summary, WipBatch } from '../src/contracts/production';
import { docTotals, EMPTY_DISPATCH, lineAmount, type Customer, type FgStock, type Intercompany, type OrderLine, type Proforma, type SalesInvoice, type SalesOrder } from '../src/contracts/sales';
import type { DataLayer, User } from '../src/repos';
import { memoryDataLayerFrom } from '../src/repos/memory';
import { buildSeed } from '../src/seed';

export const T0 = new Date('2026-10-01T09:00:00.000Z');

export const testConfig = (over: Partial<AppConfig> = {}): AppConfig => ({
  sessionIdleHours: 12,
  sessionMaxDays: 7,
  cookieSecure: false,
  permissionCacheMs: 5000,
  argon2: TEST_ARGON2,
  ...over,
});

/** A clock tests can move forward. */
export function testClock(start = T0) {
  let now = start.getTime();
  const clock = () => new Date(now);
  return Object.assign(clock, {
    advance(ms: number) {
      now += ms;
    },
  });
}

export const passwordFor = (username: string) => `pw-${username}-123`;

/** One user per role, named after the role, plus a spare dispatch user called "victim". */
export async function seedUsers(at = T0.toISOString()): Promise<User[]> {
  const names: [string, Role][] = [...ROLES.map((r) => [r, r] as [string, Role]), ['victim', 'dispatch']];
  return Promise.all(
    names.map(async ([username, role]) => ({
      id: `u-${username}`,
      username,
      name: `${username[0]!.toUpperCase()}${username.slice(1)} User`,
      email: `${username}@test.local`,
      phone: null,
      department: null,
      role,
      status: 'Active' as const,
      passwordHash: await hashPassword(passwordFor(username), TEST_ARGON2),
      createdBy: null,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    })),
  );
}

let cachedUsers: Promise<User[]> | null = null;

export interface TestAppOptions {
  config?: Partial<AppConfig>;
  clock?: ReturnType<typeof testClock>;
  /** Share a data layer between two app instances (e.g. two server processes). */
  data?: DataLayer;
}

export async function makeTestApp(opts: TestAppOptions = {}) {
  cachedUsers ??= seedUsers();
  const clock = opts.clock ?? testClock();
  const data =
    opts.data ??
    memoryDataLayerFrom(testData(structuredClone(await cachedUsers)));
  const { app, routePolicies, services } = createApp({ data, config: testConfig(opts.config), clock });

  async function request(
    method: string,
    path: string,
    { cookie, body, form, csrf = true }: { cookie?: string; body?: unknown; form?: FormData; csrf?: boolean } = {},
  ) {
    const headers: Record<string, string> = {};
    if (cookie) headers.cookie = cookie;
    if (csrf) headers['x-requested-with'] = 'fetch';
    if (body !== undefined) headers['content-type'] = 'application/json';
    const payload = form ?? (body === undefined ? undefined : JSON.stringify(body));
    const res = await app.request(path, { method, headers, body: payload });
    return res as TestResponse;
  }

  /** Signs in and returns the cookie header value. */
  async function login(username: string, password = passwordFor(username)): Promise<string> {
    const res = await request('POST', '/api/auth/login', { body: { username, password } });
    if (res.status !== 200) throw new Error(`login ${username} failed: ${res.status} ${await res.text()}`);
    return sessionCookieFrom(res)!;
  }

  return { app, data, clock, services, routePolicies, request, login };
}

const audit = { createdBy: null, createdAt: T0.toISOString(), updatedAt: T0.toISOString(), deletedAt: null as string | null };

export const party = (id: string, over: Partial<Party> = {}): Party => ({
  id,
  name: `Party ${id}`,
  contact: null,
  mobile: null,
  email: null,
  gst: null,
  address: null,
  city: null,
  state: null,
  pin: null,
  industry: null,
  type: 'Existing Customer',
  assignedUserId: null,
  remarks: null,
  ...audit,
  ...over,
});

export const courier = (id: string, over: Partial<Courier> = {}): Courier => ({
  id,
  name: `Courier ${id}`,
  type: 'Courier',
  contact: null,
  mobile: null,
  email: null,
  coverage: null,
  trackingUrlTemplate: null,
  rating: null,
  status: 'Active',
  remarks: null,
  ...audit,
  ...over,
});

export const vendor = (id: string, over: Partial<Vendor> = {}): Vendor => ({
  id,
  code: `V-${id.toUpperCase()}`,
  name: `Vendor ${id}`,
  type: null,
  yearEstablished: null,
  categoryIds: ['vcat-raw-material'],
  productIds: [],
  contact: null,
  designation: null,
  phone: null,
  email: null,
  address: null,
  pincode: null,
  city: null,
  state: null,
  website: null,
  gst: null,
  pan: null,
  msme: null,
  paymentTerms: null,
  bank: null,
  accountNo: null,
  ifsc: null,
  rating: null,
  notes: null,
  status: 'pending',
  submittedAt: null,
  approvedAt: null,
  approvedBy: null,
  activatedAt: null,
  activatedBy: null,
  blacklistReason: null,
  blacklistedAt: null,
  blacklistedBy: null,
  ...audit,
  ...over,
});

/**
 * Vendors fixtures (besides the reference categories, products and T&C):
 * one vendor per status; ven-act supplies Wax-Coated Strands and MDI Resin; vcat-free is unused.
 */
export function vendorFixtures() {
  return {
    vendors: [
      vendor('ven-pend', { name: 'Pending Timber', status: 'pending', city: 'Morbi', state: 'Gujarat', rating: 3 }),
      vendor('ven-appr', { name: 'Approved Resins', status: 'approved', categoryIds: ['vcat-resin'], productIds: ['vprod-005'], rating: 4, state: 'Maharashtra', paymentTerms: '30 Days' }),
      vendor('ven-act', {
        name: 'Active Strands',
        status: 'active',
        categoryIds: ['vcat-raw-material', 'vcat-resin'],
        productIds: ['vprod-001', 'vprod-005'],
        rating: 5,
        city: 'Rajkot',
        state: 'Gujarat',
        paymentTerms: '30 Days',
      }),
      vendor('ven-inact', { name: 'Inactive Packaging', status: 'inactive', categoryIds: ['vcat-packaging'] }),
      vendor('ven-black', { name: 'Blacklisted Film', status: 'blacklisted', categoryIds: ['vcat-packaging'], productIds: ['vprod-009'], blacklistReason: 'Bad film', blacklistedAt: T0.toISOString() }),
    ],
    extraCategories: [
      { id: 'vcat-free', name: 'Unused Category', icon: null, color: 'grey', description: null, sortOrder: 9, status: 'active', notes: null, ...audit } satisfies VendorCategory,
    ],
  };
}

export const purchaseEntry = (id: string, over: Partial<PurchaseEntry> = {}): PurchaseEntry => ({
  id,
  material: 'nilgiri',
  date: '2026-09-10',
  lotNo: 'N01',
  poId: null,
  vendorId: null,
  vendorName: 'TM Nilgiri Supplier',
  vendorCode: null,
  gstin: null,
  pan: null,
  city: 'Morbi',
  state: 'Gujarat',
  mobile: null,
  invoiceNo: `INV-${id}`,
  invoiceDate: '2026-09-10',
  taxType: 'SG+CG',
  gstPct: 18,
  vehicleNo: 'GJ01HT0324',
  driver: null,
  transporter: null,
  rstNo: '4713',
  mrnNo: '1499',
  grnNo: '1499',
  remarks: null,
  itemId: null,
  itemName: null,
  hsn: null,
  species: 'Eucalyptus',
  veneerType: null,
  altQtyPcs: null,
  invQty: 12400,
  splQty: 12730,
  ratePaise: 770000,
  rateDiffPaise: 20000,
  otherChargesPaise: 0,
  status: 'pending',
  approvedBy: null,
  approvedAt: null,
  qtyNoteStatus: 'Pending',
  rateNoteStatus: 'Pending',
  ...audit,
  ...over,
});

/**
 * Purchase fixtures (FY 2026-27; the test clock is 2026-10-01):
 * - po-used: nilgiri PO for 300 000 kg at ₹7,700/t, with pe-1 (12 730 kg received) against it
 * - po-free: resin PO with nothing received (deletable)
 * - pe-1: the legacy GT/1/26-27 numbers (inv 12 400, SPL 12 730, rate diff +₹200) → qty CN + rate DN
 * - pe-2: resin, inv 18 265 > SPL 18 250 → qty DN; pe-draft: a draft
 * - ret-1: 1 000 kg nilgiri (Eucalyptus) returned
 */
export function purchaseFixtures() {
  const po = (id: string, over: Partial<PurchaseOrder>): PurchaseOrder => ({
    id,
    poNo: id.toUpperCase(),
    date: '2026-09-01',
    material: 'nilgiri',
    vendorId: null,
    vendorName: 'TM Nilgiri Supplier',
    qty: 300000,
    ratePaise: 770000,
    remarks: null,
    tncIds: [],
    status: 'pending',
    approvedBy: null,
    approvedAt: null,
    ...audit,
    ...over,
  });
  const ret: PurchaseReturn = {
    id: 'ret-1',
    returnNo: 'RET-26-001',
    date: '2026-09-20',
    material: 'nilgiri',
    species: 'Eucalyptus',
    entryId: 'pe-1',
    vendorName: 'TM Nilgiri Supplier',
    originalInvoiceNo: 'INV-pe-1',
    qty: 1000,
    ratePaise: 770000,
    taxType: 'SG+CG',
    gstPct: 18,
    reason: 'Wet wood',
    status: 'pending',
    approvedBy: null,
    approvedAt: null,
    ...audit,
  };
  return {
    puOrders: [po('po-used', {}), po('po-free', { material: 'resin', vendorName: 'V.K.Industrioes', qty: 100000, ratePaise: 4000000 })],
    puEntries: [
      purchaseEntry('pe-1', { poId: 'po-used' }),
      purchaseEntry('pe-2', { material: 'resin', date: '2026-09-15', lotNo: 'R01', vendorName: 'V.K.Industrioes', species: null, invQty: 18265, splQty: 18250, ratePaise: 4000000, rateDiffPaise: 0 }),
      purchaseEntry('pe-draft', { material: 'kraft', lotNo: 'K01', species: null, invQty: 3000, splQty: 3000, ratePaise: 3200, rateDiffPaise: 0, status: 'draft' }),
    ],
    puReturns: [ret],
  };
}

export const mrn = (id: string, n: number, over: Partial<Mrn> = {}): Mrn => ({
  id,
  mrnNo: `MRN/26-27/${String(n).padStart(4, '0')}`,
  fy: '2026-27',
  date: '2026-09-28',
  time: '10:15',
  vehicleNo: 'GJ01HT0324',
  securityName: 'Ramesh',
  driverName: 'Suresh',
  driverPhone: '9876543210',
  vendorId: null,
  vendorName: 'TM Nilgiri Supplier',
  invoiceNo: 'INV-pe-1',
  remarks: null,
  items: [
    { id: `${id}-1`, material: 'nilgiri', approxQty: 12000, unit: 'Kg', packages: null, remarks: null },
    { id: `${id}-2`, material: 'resin', approxQty: 500, unit: 'Kg', packages: '2 drums', remarks: null },
  ],
  status: 'pending_grn',
  grnId: null,
  grnNo: null,
  ...audit,
  ...over,
});

export const grn = (id: string, n: number, m: Mrn, over: Partial<Grn> = {}): Grn => ({
  id,
  grnNo: `GRN/26-27/${String(n).padStart(4, '0')}`,
  fy: '2026-27',
  date: m.date,
  time: '11:00',
  mrnId: m.id,
  mrnNo: m.mrnNo,
  vehicleNo: m.vehicleNo,
  vendorName: m.vendorName,
  invoiceNo: m.invoiceNo ?? 'INV-1',
  purchaseEntryId: null,
  items: m.items.map((it) => ({ id: `${id}-${it.id}`, mrnItemId: it.id, material: it.material, approxQty: it.approxQty, actualQty: it.approxQty, unit: it.unit, quality: 'ok' as const, qualityRemarks: null })),
  receivedByName: 'Stores Keeper',
  remarks: null,
  status: 'draft',
  reviewedBy: null,
  reviewedAt: null,
  approvedBy: null,
  approvedAt: null,
  accounted: false,
  voucherNo: null,
  accountedBy: null,
  accountedAt: null,
  ...audit,
  ...over,
});

/**
 * Stores fixtures:
 * - mrn-open (MRN/26-27/0001): pending GRN, nilgiri + resin lines, invoice INV-pe-1 (= purchase entry pe-1)
 * - grn-draft / grn-rev / grn-appr / grn-acct (GRN 0001..0004) on MRNs 0002..0005, one per workflow stage
 * Counters MRN-2026-27 = 5, GRN-2026-27 = 4.
 */
export function storesFixtures() {
  const open = mrn('mrn-open', 1);
  const stages = [
    { id: 'grn-draft', over: {} },
    { id: 'grn-rev', over: { status: 'reviewed' as const, reviewedAt: T0.toISOString() } },
    { id: 'grn-appr', over: { status: 'approved' as const, reviewedAt: T0.toISOString(), approvedAt: T0.toISOString() } },
    {
      id: 'grn-acct',
      over: { status: 'approved' as const, reviewedAt: T0.toISOString(), approvedAt: T0.toISOString(), accounted: true, voucherNo: 'PV/001/26-27', accountedAt: T0.toISOString() },
    },
  ];
  const mrns: Mrn[] = [open];
  const grns: Grn[] = [];
  stages.forEach((s, i) => {
    const m = mrn(`mrn-${s.id.slice(4)}`, i + 2, { vendorName: `Vendor ${i + 2}`, invoiceNo: `INV-${i + 2}`, date: '2026-09-20' });
    const g = grn(s.id, i + 1, m, s.over);
    mrns.push({ ...m, status: 'grn_created', grnId: g.id, grnNo: g.grnNo });
    grns.push(g);
  });
  return { stoMrns: mrns, stoGrns: grns };
}

/**
 * Stock fixtures (on the seeded item master):
 * - op-1: opening OC-61112 + 100 (2026-09-01); op-2: opening RM-05000 (resin, fixed code) + 5000
 * - sl-1 (ISS/2026/001, 2026-09-10): OC-61112 − 30 → OC-I0112 + 30
 * - rc-1 (STR/2026/001, 2026-09-12): OC-61112 − 10 → OC-62112 + 10
 * Balances: OC-61112 60, OC-I0112 30, OC-62112 10, RM-05000 5000. Counters ISS-2026 = 1, STR-2026 = 1.
 */
export function stockFixtures() {
  const ref = (prefix: string, thick: string | null) => ({ groupId: `skug-${prefix.toLowerCase()}`, thick, sku: `${prefix}${thick ?? ''}` });
  const opening: OpeningEntry[] = [
    { id: 'op-1', date: '2026-09-01', item: ref('OC-611', '12'), qty: 100, note: null, ...audit, createdAt: '2026-09-01T04:00:00.000Z' },
    { id: 'op-2', date: '2026-09-01', item: ref('RM-05000', null), qty: 5000, note: 'Physical count', ...audit, createdAt: '2026-09-01T04:00:01.000Z' },
  ];
  const slips: StockSlip[] = [
    {
      id: 'sl-1',
      type: 'SIS',
      slipNo: 'ISS/2026/001',
      date: '2026-09-10',
      from: ref('OC-611', '12'),
      to: ref('OC-I01', '12'),
      qty: 30,
      batch: 'B-00001',
      refNo: 'OSB-PR/2026/001',
      shift: 'Day',
      remarks: null,
      ...audit,
      createdAt: '2026-09-10T04:00:00.000Z',
    },
  ];
  const reclass: Reclass[] = [
    {
      id: 'rc-1',
      strNo: 'STR/2026/001',
      date: '2026-09-12',
      scenario: 'Grade A → Grade B',
      from: ref('OC-611', '12'),
      to: ref('OC-621', '12'),
      qty: 10,
      reason: 'Surface marks',
      ref: null,
      ...audit,
      createdAt: '2026-09-12T04:00:00.000Z',
    },
  ];
  return { skOpening: opening, skSlips: slips, skReclass: reclass };
}

/**
 * Production fixtures (on purchase fixtures pe-1 nilgiri 12 730 kg at net ₹7,500/t, pe-2 resin 18 250 kg at ₹40,000/t):
 * - hp-1 HP-0001 (2026-09-20): OSB 8x4 12 mm, 2 charges × 30 pcs (08:00–08:40, 08:50–09:30)
 * - bc-1 BC-0001: 57 cut from hp-1 (3 rejects, 5%)
 * - ch-1 CHR-0001: 5 000 kg from pe-1 → wip-1 WIP-0001
 * - rc-1 RC-0001: 500 kg resin from pe-2
 * - mb-1 MWB-0001: open, setpoint 42 ± 0.5, weights 42.1 (pass), 41.2 (warn), 43.5 (reject)
 * - pp-1 PPR-0001: 60 boards OSB 8x4, matt 42 kg × 60, resin 4 kg/matt; links hp-1, bc-1, mb-1
 * - ps-1 PS-0001: links everything, 2 000 kg from wip-1
 * - mdo-1 MDO-0001: approved (locked)
 * Every PR-<prefix> counter is at 1.
 */
export function productionFixtures() {
  const doc = (id: string, docNo: string, date: string, over: Partial<DocBase> = {}) => ({ id, docNo, date, wfState: 'draft' as const, wfTrail: [], remarks: null, ...audit, ...over });
  const hp: HotPress = {
    ...doc('hp-1', 'HP-0001', '2026-09-20'),
    shift: 'Day',
    product: 'OSB',
    size: '8x4',
    thickness: '12',
    operator: 'Ramesh',
    charges: [
      { label: 'Charge 1', pcs: 30, load: '08:00', unload: '08:40', remarks: null },
      { label: 'Charge 2', pcs: 30, load: '08:50', unload: '09:30', remarks: null },
    ],
  };
  const bc: Cutting = { ...doc('bc-1', 'BC-0001', '2026-09-20'), shift: 'Day', hotpressId: 'hp-1', operator: null, cutPcs: 57 };
  const ch: Chipping = {
    ...doc('ch-1', 'CHR-0001', '2026-09-21'),
    shift: 'Day',
    operator: null,
    machine: 'Chipper 1',
    lots: [{ purchaseEntryId: 'pe-1', lotNo: 'N01', qty: 5000, ratePaise: 750000, amountPaise: 3750000 }],
  };
  const wip: WipBatch = { id: 'wip-1', docNo: 'WIP-0001', chippingId: 'ch-1', date: '2026-09-21', remarks: null, ...audit };
  const rc: ResinUse = { ...doc('rc-1', 'RC-0001', '2026-09-21'), shift: 'Day', lot: { purchaseEntryId: 'pe-2', lotNo: 'R01', qty: 500, ratePaise: 4000000, amountPaise: 2000000 }, product: 'OSB', operator: null };
  const at = (m: number) => new Date(T0.getTime() + m * 60000).toISOString();
  const mb: MattBatch = {
    id: 'mb-1',
    docNo: 'MWB-0001',
    date: '2026-09-20',
    shift: 'Day',
    product: 'OSB',
    size: '8x4',
    thickness: '12',
    operator: null,
    setpoint: 42,
    band: 0.5,
    targetQty: 60,
    remarks: null,
    status: 'open',
    weights: [
      { n: 1, weight: 42.1, at: at(1) },
      { n: 2, weight: 41.2, at: at(2) },
      { n: 3, weight: 43.5, at: at(3) },
    ],
    closedAt: null,
    ...audit,
  };
  const pp: Plan = {
    ...doc('pp-1', 'PPR-0001', '2026-09-19'),
    shift: 'Day',
    planOp: 'Planner',
    products: [{ product: 'OSB', size: '8x4', thickness: '12', priority: 'High', targetBoards: 60 }],
    mattWtKg: 42,
    matts: 60,
    resinPerMattKg: 4,
    wetWoodAvailKg: 9000,
    process: { pressTemp: '180' },
    hotpressId: 'hp-1',
    mattBatchId: 'mb-1',
    cuttingId: 'bc-1',
  };
  const ps: Summary = {
    ...doc('ps-1', 'PS-0001', '2026-09-21'),
    product: 'OSB',
    size: '8x4',
    thickness: '12',
    batch: 'B1',
    hotpressId: 'hp-1',
    mattBatchId: 'mb-1',
    resinIds: ['rc-1'],
    cuttingId: 'bc-1',
    planId: 'pp-1',
    pressPcs: 60,
    boards: 57,
    boardRej: 3,
    mattPcs: 3,
    mattWtKg: 42.27,
    mattRej: 1,
    resinKg: 500,
    resinPaise: 2000000,
    dryWoodKg: 2400,
    wip: [{ wipId: 'wip-1', qty: 2000 }],
  };
  const mdo: Mdo = {
    ...doc('mdo-1', 'MDO-0001', '2026-09-22', { wfState: 'approved' }),
    shift: 'Day',
    operator: null,
    pressStart: '22:00',
    pressEnd: '02:30',
    items: [{ boardType: 'OSB', thickness: '12', paper: 'Kraft 120gsm', type: 'BSL', finish: 'Smooth', pcs: 40, cycleTime: '8m' }],
    paperUsed: 80,
    paperWastage: 4,
  };
  return { prHotpress: [hp], prCutting: [bc], prChipping: [ch], prWip: [wip], prResin: [rc], prMatt: [mb], prPlans: [pp], prSummary: [ps], prMdo: [mdo] };
}

/**
 * Masters every test app starts with (besides the reference seed):
 * - p-free / c-free / prod-osb-12-8x4: unreferenced, so they can be deleted
 * - p-used / c-used / prod-used: referenced by request REQ-0001 and dispatch DSP-0001 (linked to REQ-0001)
 * - r2 (REQ-0002): Pending, p-used, a free-text line, no dispatch
 * - city-custom: a custom city ("Halvad", Gujarat)
 */
/** Sales: two parties (Gujarat, Maharashtra) and an unused one; SO/1 confirmed with invoices SPL/01 (pending) and SPL/02 (approved); SO/2 draft. */
export function salesFixtures() {
  const party = (id: string, name: string, gstin: string | null, city: string, state: string, over: Partial<Customer> = {}): Customer => ({
    id,
    name,
    code: null,
    dealerType: 'Dealer',
    gstin,
    pan: null,
    group: 'SUNDRY DEBTORS',
    address: null,
    city,
    state,
    country: 'India',
    pincode: null,
    contactPerson: null,
    mobile1: '9800000000',
    mobile2: null,
    email: null,
    creditDays: 30,
    creditLimitPaise: 50000000,
    transportPref: null,
    paymentTerms: '30 Days',
    taxTypes: { llp: gstin?.startsWith('24') ? 'SG+CG' : 'IGST', osb: gstin?.startsWith('27') ? 'SG+CG' : 'IGST' },
    active: true,
    ...audit,
    ...over,
  });
  // sli-1 is the seed's "S-OSB PRELAM + MDO 1220mm X 2440mm X 12mm" (2.9768 sq m a board).
  const item = { itemId: 'sli-1', itemName: 'S-OSB PRELAM + MDO 1220mm X 2440mm X 12mm', brand: 'Strandply', grade: 'S-OSB', subType: 'PRELAM + MDO', thic: 12, width: 1220, length: 2440, hsn: '441012', sqmFactor: 2.9768 };
  const free = { itemId: null, itemName: 'Custom board', brand: null, grade: null, subType: null, thic: null, width: null, length: null, hsn: null, sqmFactor: 2 };
  const line = (base: typeof item | typeof free, pcs: number, qtySqm: number, ratePaise: number, weightKg = 0): OrderLine => ({ ...base, pcs, qtySqm, ratePaise, weightKg, amountPaise: lineAmount(qtySqm, ratePaise) });
  const g = { billToId: 'slc-g', billTo: 'GUJARAT TRADERS', shipToId: 'slc-g', shipTo: 'GUJARAT TRADERS', state: 'GUJARAT', city: 'RAJKOT' };
  const soLines = [line(item, 100, 297.68, 44000, 25), line(free, 10, 20, 30000)];
  const so1: SalesOrder = {
    id: 'so-1',
    firm: 'llp',
    soNo: 'SO/1/26-27',
    date: '2026-09-01',
    poNo: 'PO-77',
    poDate: '2026-08-30',
    edd: '2026-09-10',
    ...g,
    salesPerson: 'VIPUL PANCHAL',
    paymentTerms: '30 Days',
    deliveryTerms: 'EX WORKS',
    taxType: 'SG+CG',
    lines: soLines,
    freightPaise: 80000,
    gstPct: 18,
    totalPaise: docTotals(soLines, 80000, 'SG+CG', 18).total,
    status: 'confirmed',
    remarks: null,
    piId: null,
    piNo: null,
    dispatch: { ...EMPTY_DISPATCH, date: '2026-09-05', vehicleNo: 'GJ03AB1234', transporter: 'VRL Logistics', lrNo: 'LR-9' },
    ...audit,
  };
  const so2Lines = [line(item, 50, 148.84, 45000)];
  const so2: SalesOrder = {
    ...so1,
    id: 'so-2',
    soNo: 'SO/2/26-27',
    date: '2026-09-15',
    poNo: null,
    poDate: null,
    edd: '2026-09-25',
    billToId: 'slc-m',
    billTo: 'MAHARASHTRA BOARDS',
    shipToId: 'slc-m',
    shipTo: 'MAHARASHTRA BOARDS',
    state: 'MAHARASHTRA',
    city: 'PUNE',
    taxType: 'IGST',
    lines: so2Lines,
    freightPaise: 0,
    totalPaise: docTotals(so2Lines, 0, 'IGST', 18).total,
    status: 'draft',
    dispatch: { ...EMPTY_DISPATCH },
  };
  const invLine = (n: number, pcs: number, qtySqm: number) => {
    const { pcs: soPcs, qtySqm: soQtySqm, weightKg: _w, amountPaise: _a, ...rest } = soLines[n]!;
    return { ...rest, soLine: n, soPcs, soQtySqm, pcs, qtySqm, amountPaise: lineAmount(qtySqm, rest.ratePaise) };
  };
  const inv = (id: string, invNo: string, lines: SalesInvoice['lines'], over: Partial<SalesInvoice> = {}): SalesInvoice => ({
    id,
    firm: 'llp',
    invNo,
    date: '2026-09-06',
    soId: 'so-1',
    soNo: 'SO/1/26-27',
    poNo: 'PO-77',
    ...g,
    taxType: 'SG+CG',
    lines,
    freightPaise: 0,
    gstPct: 18,
    totalPaise: docTotals(lines, 0, 'SG+CG', 18).total,
    irn: null,
    ewayBill: 'EWB-1',
    weightTons: null,
    approval: 'pending',
    approvalNote: null,
    approvedBy: null,
    approvedByName: null,
    approvedAt: null,
    remarks: null,
    ...audit,
    ...over,
  });
  const piLines = [line(item, 20, 59.536, 44000)];
  const pi: Proforma = {
    id: 'pi-1',
    firm: 'llp',
    piNo: 'PI/001/26-27',
    date: '2026-09-20',
    validUntil: '2026-10-20',
    poRef: 'Verbal',
    ...g,
    salesPerson: null,
    paymentTerms: 'Advance',
    deliveryTerms: 'EX WORKS',
    taxType: 'SG+CG',
    lines: piLines,
    freightPaise: 0,
    gstPct: 18,
    totalPaise: docTotals(piLines, 0, 'SG+CG', 18).total,
    status: 'draft',
    soId: null,
    soNo: null,
    remarks: null,
    ...audit,
  };
  const fg: FgStock = { id: 'fg-1', firm: 'llp', grade: 'S-OSB', thic: 12, width: 1220, length: 2440, qtyOnHandSqm: 1000, reorderSqm: 900, ...audit };
  const ic: Intercompany = {
    id: 'ic-1',
    billingDoc: 'SPL/01/26-27',
    billingDate: '2026-09-06',
    materialDesc: 'S-OSB 1220mm X 2440mm X 12mm (PRELAM + MDO)',
    grade: 'S-OSB',
    thic: 12,
    width: 1220,
    length: 2440,
    pcs: 40,
    qtySqm: 119.072,
    ratePaise: 44000,
    materialPaise: 5239168,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: 943050,
    freightPaise: 0,
    totalPaise: 6182218,
    vehicleNo: 'GJ03AB1234',
    ...audit,
  };
  return {
    slCustomers: [party('slc-g', 'GUJARAT TRADERS', '24AAAAA0000A1Z5', 'RAJKOT', 'GUJARAT'), party('slc-m', 'MAHARASHTRA BOARDS', '27BBBBB1111B1Z5', 'PUNE', 'MAHARASHTRA'), party('slc-x', 'UNUSED PARTY', null, 'SURAT', 'GUJARAT', { creditDays: 0, creditLimitPaise: 0 })],
    slPrices: [{ id: 'pl-1', itemId: 'sli-1', effectiveDate: '2026-04-01', ratePaise: 44000, ...audit }],
    slWeights: [{ id: 'wc-1', itemId: 'sli-1', effectiveDate: '2026-04-01', weightKg: 25, ...audit }],
    slProformas: [pi],
    slOrders: [so1, so2],
    slInvoices: [inv('inv-1', 'SPL/01/26-27', [invLine(0, 40, 119.072)]), inv('inv-2', 'SPL/02/26-27', [invLine(1, 10, 20)], { approval: 'approved', approvedBy: 'u-admin', approvedByName: 'Admin User', approvedAt: T0.toISOString() })],
    slFgStock: [fg],
    slIntercompany: [ic],
  };
}

export function fixtures() {
  return {
    parties: [
      party('p-free', { name: 'Free Party', city: 'Rajkot', state: 'Gujarat' }),
      party('p-used', { name: 'Used Party', city: 'Halvad', state: 'Gujarat' }),
    ],
    couriers: [courier('c-free', { name: 'Free Courier' }), courier('c-used', { name: 'Used Transport', type: 'Transport' })],
    products: [] as Product[],
    requests: [
      {
        id: 'r1',
        reqNo: 'REQ-0001',
        date: '2026-09-30',
        partyId: 'p-used',
        purpose: null,
        priority: 'Normal' as const,
        requiredDispatchDate: null,
        requestedByUserId: null,
        remarks: null,
        status: 'Pending' as const,
        approvedBy: null,
        approvedAt: null,
        ...audit,
      },
      {
        id: 'r2',
        reqNo: 'REQ-0002',
        date: '2026-09-30',
        partyId: 'p-used',
        purpose: 'Testing',
        priority: 'High' as const,
        requiredDispatchDate: null,
        requestedByUserId: 'u-marketing',
        remarks: null,
        status: 'Pending' as const,
        approvedBy: null,
        approvedAt: null,
        ...audit,
      },
    ],
    requestItems: [
      {
        id: 'r1-1',
        requestId: 'r1',
        lineNo: 1,
        productId: 'prod-used',
        productName: 'Used Product',
        board: null,
        thickness: null,
        size: null,
        qtyValue: 1,
        qtyUnit: 'sheets',
        qtyRaw: '1 sheets',
        ...audit,
      },
      {
        id: 'r2-1',
        requestId: 'r2',
        lineNo: 1,
        productId: null,
        productName: 'Custom Laminate',
        board: null,
        thickness: null,
        size: null,
        qtyValue: 3,
        qtyUnit: 'sheets',
        qtyRaw: '3 sheets',
        ...audit,
      },
    ],
    dispatches: [
      {
        id: 'd1',
        dspNo: 'DSP-0001',
        date: '2026-09-30',
        partyId: 'p-used',
        mode: 'Transport' as const,
        courierId: 'c-used',
        courierNameManual: null,
        trackingNo: null,
        vehicleNo: null,
        driverDetails: null,
        expectedDeliveryDate: null,
        freightPaise: 0,
        weightKg: null,
        dimensions: null,
        productDescription: null,
        linkedRequestId: 'r1',
        remarks: null,
        status: 'Pending' as const,
        approvedBy: null,
        approvedAt: null,
        ...audit,
      },
    ],
    dispatchHistory: [
      {
        id: 'd1-h1',
        dispatchId: 'd1',
        status: 'Pending' as const,
        changedBy: null,
        changedAt: T0.toISOString(),
        note: 'Created',
        ...audit,
      },
    ],
    extraCities: [{ id: 'city-custom', city: 'Halvad', stateId: 'state-24', isCustom: true, pincodes: ['363330'], ...audit }],
    extraProducts: [
      {
        id: 'prod-used',
        code: 'USED-1',
        name: 'Used Product',
        boardType: 'OSB' as const,
        thicknessMm: 9,
        size: '8x4 ft',
        category: 'Standard',
        unitPricePaise: 50000,
        stockStatus: 'Available' as const,
        description: null,
        ...audit,
      },
    ],
  };
}

export function testData(users: User[]) {
  const seed = buildSeed({ devUsers: false, at: T0.toISOString() });
  const { extraCities, extraProducts, ...f } = fixtures();
  const { vendors, extraCategories } = vendorFixtures();
  return {
    ...seed,
    ...f,
    ...purchaseFixtures(),
    ...storesFixtures(),
    ...stockFixtures(),
    ...productionFixtures(),
    ...salesFixtures(),
    vendors,
    vnCategories: [...seed.vnCategories, ...extraCategories],
    users,
    counters: [
      ...seed.counters.map((c) => ({ ...c, lastValue: c.name === 'REQ' ? 2 : 1 })), // fixtures use REQ-0001..2, DSP-0001
      { name: 'MRN-2026-27', lastValue: 5, createdBy: null, createdAt: T0.toISOString(), updatedAt: T0.toISOString(), deletedAt: null },
      { name: 'GRN-2026-27', lastValue: 4, createdBy: null, createdAt: T0.toISOString(), updatedAt: T0.toISOString(), deletedAt: null },
      { name: 'ISS-2026', lastValue: 1, createdBy: null, createdAt: T0.toISOString(), updatedAt: T0.toISOString(), deletedAt: null },
      { name: 'STR-2026', lastValue: 1, createdBy: null, createdAt: T0.toISOString(), updatedAt: T0.toISOString(), deletedAt: null },
      ...[['SL-SO-llp-2026-27', 2], ['SL-INV-llp-2026-27', 2], ['SL-PI-llp-2026-27', 1]].map(([name, lastValue]) => ({ name: name as string, lastValue: lastValue as number, createdBy: null, createdAt: T0.toISOString(), updatedAt: T0.toISOString(), deletedAt: null })),
      ...['PPR', 'HP', 'BC', 'CHR', 'WIP', 'RC', 'MWB', 'PS', 'MDO'].map((p) => ({ name: `PR-${p}`, lastValue: 1, createdBy: null, createdAt: T0.toISOString(), updatedAt: T0.toISOString(), deletedAt: null })),
    ],
    cities: [...seed.cities, ...extraCities],
    products: [...seed.products, ...extraProducts],
  };
}

export function sessionCookieFrom(res: Response): string | null {
  const raw = res.headers.get('set-cookie') ?? '';
  const m = new RegExp(`${SESSION_COOKIE}=([^;]*)`).exec(raw);
  return m && m[1] ? `${SESSION_COOKIE}=${m[1]}` : null;
}

/** Response with loosely typed JSON, for terse assertions in tests. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TestResponse = Omit<Response, 'json' | 'clone'> & { json(): Promise<any>; clone(): TestResponse };

export type TestApp = Awaited<ReturnType<typeof makeTestApp>>;
