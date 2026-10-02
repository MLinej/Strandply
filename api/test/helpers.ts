import { createApp } from '../src/app';
import { hashPassword, TEST_ARGON2 } from '../src/auth/password';
import { SESSION_COOKIE } from '../src/auth/session-middleware';
import type { AppConfig } from '../src/config';
import { ROLES, type Role } from '../src/domain/access';
import type { Courier, Party, Product } from '../src/contracts/sampletrack';
import type { Vendor, VendorCategory } from '../src/contracts/vendors';
import type { PurchaseEntry, PurchaseOrder, PurchaseReturn } from '../src/contracts/purchase';
import type { Grn, Mrn } from '../src/contracts/stores';
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
 * Masters every test app starts with (besides the reference seed):
 * - p-free / c-free / prod-osb-12-8x4: unreferenced, so they can be deleted
 * - p-used / c-used / prod-used: referenced by request REQ-0001 and dispatch DSP-0001 (linked to REQ-0001)
 * - r2 (REQ-0002): Pending, p-used, a free-text line, no dispatch
 * - city-custom: a custom city ("Halvad", Gujarat)
 */
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
    vendors,
    vnCategories: [...seed.vnCategories, ...extraCategories],
    users,
    counters: [
      ...seed.counters.map((c) => ({ ...c, lastValue: c.name === 'REQ' ? 2 : 1 })), // fixtures use REQ-0001..2, DSP-0001
      { name: 'MRN-2026-27', lastValue: 5, createdBy: null, createdAt: T0.toISOString(), updatedAt: T0.toISOString(), deletedAt: null },
      { name: 'GRN-2026-27', lastValue: 4, createdBy: null, createdAt: T0.toISOString(), updatedAt: T0.toISOString(), deletedAt: null },
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
