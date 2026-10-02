import { createApp } from '../src/app';
import { hashPassword, TEST_ARGON2 } from '../src/auth/password';
import { SESSION_COOKIE } from '../src/auth/session-middleware';
import type { AppConfig } from '../src/config';
import { ROLES, type Role } from '../src/domain/access';
import type { Courier, Party, Product } from '../src/contracts/sampletrack';
import type { Vendor, VendorCategory } from '../src/contracts/vendors';
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
    vendors,
    vnCategories: [...seed.vnCategories, ...extraCategories],
    users,
    counters: seed.counters.map((c) => ({ ...c, lastValue: c.name === 'REQ' ? 2 : 1 })), // fixtures use REQ-0001..2, DSP-0001
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
