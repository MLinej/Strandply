// Role × endpoint matrix under the default permissions (legacy ROLE_PERMS).
// The table below is written out by hand on purpose. A coverage test checks that it lists
// every registered route, so a new endpoint can't ship without a matrix row.
import { describe, expect, it } from 'vitest';
import { ROLES, type Role } from '../src/domain/access';
import { makeTestApp } from './helpers';

const ALL: Role[] = [...ROLES];
const ADMINS: Role[] = ['superadmin', 'admin'];
const SUPER: Role[] = ['superadmin'];
const PARTY_ROLES: Role[] = ['superadmin', 'admin', 'marketing']; // parties/products page (+edit)
const COURIER_ROLES: Role[] = ['superadmin', 'admin', 'dispatch']; // couriers page (+edit), dispatch page

const csv = (text: string) => {
  const f = new FormData();
  f.append('file', new File([text], 'products.csv', { type: 'text/csv' }));
  return f;
};

interface Case {
  method: string;
  /** Route template as registered. */
  route: string;
  /** Concrete path to call. */
  path: string;
  body?: unknown;
  form?: () => FormData;
  allowed: Role[];
  /** Status an allowed role must get. */
  ok: number;
}

const fullSet = { pages: ['dashboard'], actions: ['print'], widgets: ['total'] };

const CASES: Case[] = [
  { method: 'GET', route: '/api/me', path: '/api/me', allowed: ALL, ok: 200 },
  { method: 'POST', route: '/api/auth/logout', path: '/api/auth/logout', allowed: ALL, ok: 204 },

  { method: 'GET', route: '/api/sampletrack/users', path: '/api/sampletrack/users', allowed: ADMINS, ok: 200 },
  { method: 'GET', route: '/api/sampletrack/users/stats', path: '/api/sampletrack/users/stats', allowed: ADMINS, ok: 200 },
  { method: 'GET', route: '/api/sampletrack/users/:id', path: '/api/sampletrack/users/u-victim', allowed: ADMINS, ok: 200 },
  {
    method: 'POST',
    route: '/api/sampletrack/users',
    path: '/api/sampletrack/users',
    body: { username: 'newbie', name: 'New Bie', role: 'marketing', password: 'long-enough-pw' },
    allowed: ADMINS,
    ok: 201,
  },
  {
    method: 'PATCH',
    route: '/api/sampletrack/users/:id',
    path: '/api/sampletrack/users/u-victim',
    body: { department: 'Ops' },
    allowed: ADMINS,
    ok: 200,
  },
  {
    method: 'POST',
    route: '/api/sampletrack/users/:id/toggle-status',
    path: '/api/sampletrack/users/u-victim/toggle-status',
    allowed: ADMINS,
    ok: 200,
  },
  { method: 'DELETE', route: '/api/sampletrack/users/:id', path: '/api/sampletrack/users/u-victim', allowed: ADMINS, ok: 204 },

  { method: 'GET', route: '/api/sampletrack/role-permissions', path: '/api/sampletrack/role-permissions', allowed: ADMINS, ok: 200 },
  {
    method: 'PUT',
    route: '/api/sampletrack/role-permissions/:role',
    path: '/api/sampletrack/role-permissions/management',
    body: fullSet,
    allowed: SUPER,
    ok: 200,
  },
  { method: 'POST', route: '/api/sampletrack/role-permissions/reset', path: '/api/sampletrack/role-permissions/reset', allowed: SUPER, ok: 200 },

  { method: 'GET', route: '/api/sampletrack/activity', path: '/api/sampletrack/activity', allowed: ADMINS, ok: 200 },
  {
    method: 'POST',
    route: '/api/sampletrack/activity/purge',
    path: '/api/sampletrack/activity/purge',
    body: { olderThanDays: 30 },
    allowed: SUPER,
    ok: 200,
  },
];

const ST = '/api/sampletrack';
const MASTER_CASES: Case[] = [
  // Parties
  { method: 'GET', route: `${ST}/parties`, path: `${ST}/parties`, allowed: PARTY_ROLES, ok: 200 },
  { method: 'GET', route: `${ST}/parties/export`, path: `${ST}/parties/export`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${ST}/parties/assignees`, path: `${ST}/parties/assignees`, allowed: PARTY_ROLES, ok: 200 },
  { method: 'GET', route: `${ST}/parties/:id`, path: `${ST}/parties/p-free`, allowed: PARTY_ROLES, ok: 200 },
  { method: 'POST', route: `${ST}/parties`, path: `${ST}/parties`, body: { name: 'Brand New Party' }, allowed: PARTY_ROLES, ok: 201 },
  { method: 'PATCH', route: `${ST}/parties/:id`, path: `${ST}/parties/p-free`, body: { remarks: 'x' }, allowed: PARTY_ROLES, ok: 200 },
  { method: 'DELETE', route: `${ST}/parties/:id`, path: `${ST}/parties/p-free`, allowed: ADMINS, ok: 204 },
  // Couriers
  { method: 'GET', route: `${ST}/couriers`, path: `${ST}/couriers`, allowed: COURIER_ROLES, ok: 200 },
  { method: 'GET', route: `${ST}/couriers/options`, path: `${ST}/couriers/options?mode=Courier`, allowed: COURIER_ROLES, ok: 200 },
  { method: 'GET', route: `${ST}/couriers/:id`, path: `${ST}/couriers/c-free`, allowed: COURIER_ROLES, ok: 200 },
  { method: 'POST', route: `${ST}/couriers`, path: `${ST}/couriers`, body: { name: 'New Courier' }, allowed: COURIER_ROLES, ok: 201 },
  { method: 'PATCH', route: `${ST}/couriers/:id`, path: `${ST}/couriers/c-free`, body: { rating: 3 }, allowed: COURIER_ROLES, ok: 200 },
  { method: 'DELETE', route: `${ST}/couriers/:id`, path: `${ST}/couriers/c-free`, allowed: ADMINS, ok: 204 },
  // Products
  { method: 'GET', route: `${ST}/products`, path: `${ST}/products`, allowed: PARTY_ROLES, ok: 200 },
  { method: 'GET', route: `${ST}/products/summary`, path: `${ST}/products/summary`, allowed: PARTY_ROLES, ok: 200 },
  { method: 'GET', route: `${ST}/products/export`, path: `${ST}/products/export`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${ST}/products/import-template`, path: `${ST}/products/import-template`, allowed: PARTY_ROLES, ok: 200 },
  {
    method: 'POST',
    route: `${ST}/products/import`,
    path: `${ST}/products/import`,
    form: () => csv('Code,Name\nNEW-1,New Board\n'),
    allowed: PARTY_ROLES,
    ok: 200,
  },
  { method: 'GET', route: `${ST}/products/:id`, path: `${ST}/products/prod-osb-12-8x4`, allowed: PARTY_ROLES, ok: 200 },
  { method: 'POST', route: `${ST}/products`, path: `${ST}/products`, body: { code: 'N-1', name: 'New' }, allowed: PARTY_ROLES, ok: 201 },
  { method: 'PATCH', route: `${ST}/products/:id`, path: `${ST}/products/prod-osb-12-8x4`, body: { size: '6x4 ft' }, allowed: PARTY_ROLES, ok: 200 },
  { method: 'DELETE', route: `${ST}/products/:id`, path: `${ST}/products/prod-osb-12-8x4`, allowed: ADMINS, ok: 204 },
  // States and cities
  // Party and vendor forms: management reaches them through the vendors page.
  { method: 'GET', route: `${ST}/states`, path: `${ST}/states`, allowed: [...PARTY_ROLES, 'management'], ok: 200 },
  { method: 'GET', route: `${ST}/cities/options`, path: `${ST}/cities/options`, allowed: [...PARTY_ROLES, 'management'], ok: 200 },
  { method: 'GET', route: `${ST}/cities`, path: `${ST}/cities`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${ST}/cities/export`, path: `${ST}/cities/export`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${ST}/cities`, path: `${ST}/cities`, body: { city: 'Tankara', stateId: 'state-24' }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${ST}/cities/:id`, path: `${ST}/cities/city-custom`, body: { pincodes: ['363330', '363331'] }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${ST}/cities/:id`, path: `${ST}/cities/city-custom`, allowed: ADMINS, ok: 204 },
  // Vendor form auto-fill: the vendors page (management has it by default) or a city-master page.
  { method: 'GET', route: `${ST}/cities/pincode/:pincode`, path: `${ST}/cities/pincode/363641`, allowed: ['superadmin', 'admin', 'management'], ok: 200 },
];
CASES.push(...MASTER_CASES);

const REQUEST_ROLES: Role[] = ['superadmin', 'admin', 'marketing']; // requests page (+edit)
CASES.push(
  { method: 'GET', route: `${ST}/requests`, path: `${ST}/requests?status=Pending`, allowed: REQUEST_ROLES, ok: 200 },
  { method: 'GET', route: `${ST}/requests/pending-count`, path: `${ST}/requests/pending-count`, allowed: REQUEST_ROLES, ok: 200 },
  { method: 'GET', route: `${ST}/requests/export`, path: `${ST}/requests/export`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${ST}/requests/:id`, path: `${ST}/requests/r2`, allowed: REQUEST_ROLES, ok: 200 },
  // Needs the dispatch page + edit, not the requests page.
  { method: 'GET', route: `${ST}/requests/:id/dispatch-draft`, path: `${ST}/requests/r1/dispatch-draft`, allowed: COURIER_ROLES, ok: 200 },
  {
    method: 'POST',
    route: `${ST}/requests`,
    path: `${ST}/requests`,
    body: { partyId: 'p-free', items: [{ productId: 'prod-osb-12-8x4', qty: '2 sheets' }] },
    allowed: REQUEST_ROLES,
    ok: 201,
  },
  { method: 'PATCH', route: `${ST}/requests/:id`, path: `${ST}/requests/r2`, body: { purpose: 'Expo' }, allowed: REQUEST_ROLES, ok: 200 },
  // approve is its own action: marketing can edit requests but not approve them.
  { method: 'POST', route: `${ST}/requests/:id/approve`, path: `${ST}/requests/r2/approve`, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${ST}/requests/:id`, path: `${ST}/requests/r2`, allowed: ADMINS, ok: 204 },
);

const DISPATCH_ROLES = COURIER_ROLES; // superadmin, admin, dispatch
const TRACKING_ROLES: Role[] = ['superadmin', 'admin', 'dispatch', 'marketing'];
CASES.push(
  { method: 'GET', route: `${ST}/dispatches`, path: `${ST}/dispatches?status=Packed`, allowed: DISPATCH_ROLES, ok: 200 },
  { method: 'GET', route: `${ST}/dispatches/export`, path: `${ST}/dispatches/export`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${ST}/dispatches/party-options`, path: `${ST}/dispatches/party-options?q=free`, allowed: DISPATCH_ROLES, ok: 200 },
  { method: 'GET', route: `${ST}/dispatches/request-options`, path: `${ST}/dispatches/request-options`, allowed: DISPATCH_ROLES, ok: 200 },
  { method: 'GET', route: `${ST}/dispatches/:id`, path: `${ST}/dispatches/d1`, allowed: DISPATCH_ROLES, ok: 200 },
  {
    method: 'POST',
    route: `${ST}/dispatches`,
    path: `${ST}/dispatches`,
    body: { partyId: 'p-free', mode: 'Courier', courierId: 'c-free', weightKg: 2.5 },
    allowed: DISPATCH_ROLES,
    ok: 201,
  },
  { method: 'PATCH', route: `${ST}/dispatches/:id`, path: `${ST}/dispatches/d1`, body: { remarks: 'x' }, allowed: DISPATCH_ROLES, ok: 200 },
  { method: 'POST', route: `${ST}/dispatches/:id/status`, path: `${ST}/dispatches/d1/status`, body: { status: 'Packed' }, allowed: DISPATCH_ROLES, ok: 200 },
  { method: 'DELETE', route: `${ST}/dispatches/:id`, path: `${ST}/dispatches/d1`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${ST}/tracking`, path: `${ST}/tracking?q=dsp`, allowed: TRACKING_ROLES, ok: 200 },
  { method: 'GET', route: `${ST}/tracking/:id`, path: `${ST}/tracking/d1`, allowed: TRACKING_ROLES, ok: 200 },
);

// Print/share: the print action plus the dispatch or tracking page (slip: the requests page).
// Management has print but none of those pages.
CASES.push(
  { method: 'GET', route: `${ST}/dispatches/:id/label`, path: `${ST}/dispatches/d1/label`, allowed: TRACKING_ROLES, ok: 200 },
  { method: 'GET', route: `${ST}/dispatches/:id/whatsapp`, path: `${ST}/dispatches/d1/whatsapp`, allowed: TRACKING_ROLES, ok: 200 },
  { method: 'GET', route: `${ST}/dispatches/:id/qr`, path: `${ST}/dispatches/d1/qr`, allowed: TRACKING_ROLES, ok: 200 },
  { method: 'GET', route: `${ST}/requests/:id/slip`, path: `${ST}/requests/r2/slip`, allowed: REQUEST_ROLES, ok: 200 },
);

// Every role has the dashboard page; what it returns is role-aware (see dashboard.test.ts).
// Reports: superadmin, admin and management (who also have export and print).
const REPORT_ROLES: Role[] = ['superadmin', 'admin', 'management'];
CASES.push(
  { method: 'GET', route: `${ST}/dashboard`, path: `${ST}/dashboard`, allowed: ALL, ok: 200 },
  { method: 'GET', route: `${ST}/reports/:key`, path: `${ST}/reports/cost-tracking`, allowed: REPORT_ROLES, ok: 200 },
  { method: 'GET', route: `${ST}/reports/:key/export`, path: `${ST}/reports/pending/export?format=csv`, allowed: REPORT_ROLES, ok: 200 },
  { method: 'GET', route: `${ST}/reports/:key/print`, path: `${ST}/reports/party-wise/print`, allowed: REPORT_ROLES, ok: 200 },
);

// Every role has the Notifications page by default. Settings: superadmin and admin.
CASES.push(
  { method: 'GET', route: `${ST}/notifications`, path: `${ST}/notifications?unread=true`, allowed: ALL, ok: 200 },
  { method: 'GET', route: `${ST}/notifications/unread-count`, path: `${ST}/notifications/unread-count`, allowed: ALL, ok: 200 },
  { method: 'POST', route: `${ST}/notifications/read`, path: `${ST}/notifications/read`, body: { ids: ['n1'] }, allowed: ALL, ok: 200 },
  { method: 'POST', route: `${ST}/notifications/read-all`, path: `${ST}/notifications/read-all`, body: {}, allowed: ALL, ok: 200 },
  { method: 'POST', route: `${ST}/notifications/clear`, path: `${ST}/notifications/clear`, body: {}, allowed: ALL, ok: 200 },
  { method: 'GET', route: `${ST}/badges`, path: `${ST}/badges`, allowed: ALL, ok: 200 },
  { method: 'GET', route: `${ST}/settings/company`, path: `${ST}/settings/company`, allowed: ADMINS, ok: 200 },
  { method: 'PUT', route: `${ST}/settings/company`, path: `${ST}/settings/company`, body: { phone: '02828 123456' }, allowed: ADMINS, ok: 200 },
);

// Vendors module. Admins have everything; management has the vendors and vendor_reports pages
// with print and export but no edit, delete or vendor_approve. Dispatch and marketing have none of it.
const VN = '/api/vendors';
const VIEWERS: Role[] = ['superadmin', 'admin', 'management'];
const xlsxFile = (name: string, text: string) => () => {
  const f = new FormData();
  f.append('file', new File([text], name, { type: 'text/csv' }));
  return f;
};
CASES.push(
  // Categories and products: the vendor form reads them, so the vendors page is enough to read.
  { method: 'GET', route: `${VN}/categories`, path: `${VN}/categories`, allowed: VIEWERS, ok: 200 },
  { method: 'GET', route: `${VN}/categories/export`, path: `${VN}/categories/export`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${VN}/categories`, path: `${VN}/categories`, body: { name: 'Electrical' }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${VN}/categories/:id`, path: `${VN}/categories/vcat-free`, body: { color: 'teal' }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${VN}/categories/:id`, path: `${VN}/categories/vcat-free`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${VN}/products`, path: `${VN}/products?categoryId=vcat-resin`, allowed: VIEWERS, ok: 200 },
  { method: 'GET', route: `${VN}/products/all`, path: `${VN}/products/all`, allowed: VIEWERS, ok: 200 },
  { method: 'GET', route: `${VN}/products/summary`, path: `${VN}/products/summary`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${VN}/products/export`, path: `${VN}/products/export`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${VN}/products/:id`, path: `${VN}/products/vprod-001`, allowed: VIEWERS, ok: 200 },
  {
    method: 'POST',
    route: `${VN}/products`,
    path: `${VN}/products`,
    body: { name: 'Phenolic Film', categoryId: 'vcat-packaging', unit: 'Roll' },
    allowed: ADMINS,
    ok: 201,
  },
  { method: 'PATCH', route: `${VN}/products/:id`, path: `${VN}/products/vprod-014`, body: { leadTimeDays: 3 }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${VN}/products/:id`, path: `${VN}/products/vprod-014`, allowed: ADMINS, ok: 204 },
  // T&C master
  { method: 'GET', route: `${VN}/tnc`, path: `${VN}/tnc?category=Payment`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${VN}/tnc/stats`, path: `${VN}/tnc/stats`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${VN}/tnc/:id`, path: `${VN}/tnc/tnc-warranty`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${VN}/tnc`, path: `${VN}/tnc`, body: { title: 'Force majeure', body: 'Neither party…' }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${VN}/tnc/:id`, path: `${VN}/tnc/tnc-warranty`, body: { version: '1.1' }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${VN}/tnc/:id`, path: `${VN}/tnc/tnc-warranty`, allowed: ADMINS, ok: 204 },
  // Reports
  { method: 'GET', route: `${VN}/reports`, path: `${VN}/reports`, allowed: VIEWERS, ok: 200 },
  { method: 'GET', route: `${VN}/reports/export`, path: `${VN}/reports/export?format=csv`, allowed: VIEWERS, ok: 200 },
  // Settings and import
  { method: 'GET', route: `${VN}/settings/email`, path: `${VN}/settings/email`, allowed: ADMINS, ok: 200 },
  { method: 'PUT', route: `${VN}/settings/email`, path: `${VN}/settings/email`, body: { replyTo: 'buy@strandply.in' }, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${VN}/import/:kind/template`, path: `${VN}/import/products/template`, allowed: ADMINS, ok: 200 },
  {
    method: 'POST',
    route: `${VN}/import/:kind`,
    path: `${VN}/import/categories`,
    form: xlsxFile('categories.csv', 'Name\nElectrical\n'),
    allowed: ADMINS,
    ok: 200,
  },
  // Vendors
  { method: 'GET', route: VN, path: `${VN}?status=active`, allowed: VIEWERS, ok: 200 },
  { method: 'GET', route: `${VN}/stats`, path: `${VN}/stats`, allowed: VIEWERS, ok: 200 },
  { method: 'GET', route: `${VN}/options`, path: `${VN}/options?status=active,approved`, allowed: VIEWERS, ok: 200 },
  { method: 'GET', route: `${VN}/compare`, path: `${VN}/compare?ids=ven-act,ven-appr`, allowed: VIEWERS, ok: 200 },
  { method: 'GET', route: `${VN}/by-product`, path: `${VN}/by-product?q=resin`, allowed: VIEWERS, ok: 200 },
  { method: 'GET', route: `${VN}/export`, path: `${VN}/export?format=csv`, allowed: VIEWERS, ok: 200 },
  { method: 'GET', route: `${VN}/print`, path: `${VN}/print?status=active`, allowed: VIEWERS, ok: 200 },
  {
    method: 'POST',
    route: VN,
    path: VN,
    body: { name: 'New Timber Co', categoryIds: ['vcat-raw-material'] },
    allowed: ADMINS,
    ok: 201,
  },
  { method: 'GET', route: `${VN}/:id`, path: `${VN}/ven-act`, allowed: VIEWERS, ok: 200 },
  { method: 'GET', route: `${VN}/:id/print`, path: `${VN}/ven-act/print`, allowed: VIEWERS, ok: 200 },
  { method: 'PATCH', route: `${VN}/:id`, path: `${VN}/ven-act`, body: { rating: 4 }, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${VN}/:id/submit`, path: `${VN}/ven-inact/submit`, allowed: ADMINS, ok: 200 },
  // vendor_approve: the legacy "Director only" steps.
  { method: 'POST', route: `${VN}/:id/approve`, path: `${VN}/ven-pend/approve`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${VN}/:id/activate`, path: `${VN}/ven-appr/activate`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${VN}/:id/blacklist`, path: `${VN}/ven-act/blacklist`, body: { reason: 'Late twice' }, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${VN}/:id/reinstate`, path: `${VN}/ven-black/reinstate`, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${VN}/:id`, path: `${VN}/ven-pend`, allowed: ADMINS, ok: 204 },
);

const PUBLIC_ROUTES = new Set(['POST /api/auth/login']);

describe('permission matrix: default role permissions × every endpoint', () => {
  for (const c of CASES) {
    describe(`${c.method} ${c.route}`, () => {
      for (const role of ROLES) {
        const allowed = c.allowed.includes(role);
        it(`${role} → ${allowed ? c.ok : 403}`, async () => {
          const t = await makeTestApp(); // fresh state per case, so mutations don't leak
          const cookie = await t.login(role);
          const res = await t.request(c.method, c.path, { cookie, body: c.body, form: c.form?.() });
          expect(res.status, await res.clone().text()).toBe(allowed ? c.ok : 403);
        });
      }

      it('anonymous → 401', async () => {
        const t = await makeTestApp();
        const res = await t.request(c.method, c.path, { body: c.body, form: c.form?.() });
        expect(res.status).toBe(401);
      });
    });
  }
});

describe('route coverage', () => {
  it('every registered route declares a policy, and the matrix table covers it', async () => {
    const t = await makeTestApp();
    const registered = new Set(t.routePolicies.map((p) => `${p.method} ${p.path}`));

    // 1. Every Hono handler route went through SecureRouter (so it has guards).
    const honoRoutes = new Set(t.app.routes.filter((r) => r.method !== 'ALL').map((r) => `${r.method} ${r.path}`));
    expect([...honoRoutes].sort()).toEqual([...registered].sort());

    // 2. The matrix covers every non-public route, and lists nothing that no longer exists.
    const tested = new Set(CASES.map((c) => `${c.method} ${c.route}`));
    const expected = [...registered].filter((r) => !PUBLIC_ROUTES.has(r)).sort();
    expect([...tested].sort()).toEqual(expected);
  });

  it('only the login endpoint is public', async () => {
    const t = await makeTestApp();
    const publicRoutes = t.routePolicies.filter((p) => p.policy.kind === 'public').map((p) => `${p.method} ${p.path}`);
    expect(publicRoutes).toEqual([...PUBLIC_ROUTES]);
  });
});

describe('page vs action checks are separate', () => {
  it('a role granted the users page without delete can list and create but not delete', async () => {
    const t = await makeTestApp();
    const su = await t.login('superadmin');
    // dispatch: add the users page, keep the default edit + print (no delete)
    const put = await t.request('PUT', '/api/sampletrack/role-permissions/dispatch', {
      cookie: su,
      body: { pages: ['dashboard', 'dispatch', 'users'], actions: ['edit', 'print'], widgets: [] },
    });
    expect(put.status).toBe(200);

    const d = await t.login('dispatch');
    expect((await t.request('GET', '/api/sampletrack/users', { cookie: d })).status).toBe(200);
    const created = await t.request('POST', '/api/sampletrack/users', {
      cookie: d,
      body: { username: 'by-dispatch', name: 'X', role: 'marketing', password: 'long-enough-pw' },
    });
    expect(created.status).toBe(201);
    const del = await t.request('DELETE', '/api/sampletrack/users/u-victim', { cookie: d });
    expect(del.status).toBe(403);
    expect((await del.json()).error.code).toBe('action_forbidden');
  });

  it('management with the users page but no edit cannot create', async () => {
    const t = await makeTestApp();
    const su = await t.login('superadmin');
    await t.request('PUT', '/api/sampletrack/role-permissions/management', {
      cookie: su,
      body: { pages: ['users'], actions: ['print', 'export'], widgets: [] },
    });
    const m = await t.login('management');
    expect((await t.request('GET', '/api/sampletrack/users', { cookie: m })).status).toBe(200);
    const res = await t.request('POST', '/api/sampletrack/users', {
      cookie: m,
      body: { username: 'nope', name: 'N', role: 'marketing', password: 'long-enough-pw' },
    });
    expect(res.status).toBe(403);
  });

  it('a page denial reports page_forbidden', async () => {
    const t = await makeTestApp();
    const res = await t.request('GET', '/api/sampletrack/users', { cookie: await t.login('marketing') });
    expect((await res.json()).error.code).toBe('page_forbidden');
  });
});
