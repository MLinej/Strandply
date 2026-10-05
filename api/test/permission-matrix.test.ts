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

// Purchase module. Admins have everything. Management: purchase_dashboard and purchase_inventory pages
// with print and export, no edit/delete/purchase_approve. Dispatch and marketing: nothing.
const PU = '/api/purchase';
const PU_VIEW: Role[] = ['superadmin', 'admin', 'management']; // dashboard / inventory pages
const pdf = () => {
  const f = new FormData();
  f.append('file', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], 'invoice.pdf', { type: 'application/pdf' }));
  f.append('type', 'Invoice');
  return f;
};
const newEntry = { material: 'resin', date: '2026-09-25', vendorName: 'V.K.Industrioes', invoiceNo: 'VK/99', taxType: 'SG+CG', invQty: 1000, splQty: 1000, ratePaise: 4000000 };
CASES.push(
  { method: 'GET', route: `${PU}/meta`, path: `${PU}/meta`, allowed: PU_VIEW, ok: 200 },
  { method: 'POST', route: `${PU}/types`, path: `${PU}/types`, body: { kind: 'nilgiri_species', name: 'Casuarina' }, allowed: ADMINS, ok: 201 },
  { method: 'DELETE', route: `${PU}/types/:id`, path: `${PU}/types/ptype-nilgiri-other`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${PU}/vendor-options`, path: `${PU}/vendor-options?q=active`, allowed: ADMINS, ok: 200 },
  // Entries
  { method: 'GET', route: `${PU}/entries`, path: `${PU}/entries?material=nilgiri&fy=2026-27`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${PU}/entries/stats`, path: `${PU}/entries/stats?month=2026-09`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${PU}/entries/next-lot`, path: `${PU}/entries/next-lot?material=nilgiri&date=2026-09-30`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${PU}/entries/export`, path: `${PU}/entries/export`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${PU}/entries/:id`, path: `${PU}/entries/pe-1`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${PU}/entries/:id/print`, path: `${PU}/entries/pe-1/print?kind=label`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${PU}/entries`, path: `${PU}/entries`, body: newEntry, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${PU}/entries/:id`, path: `${PU}/entries/pe-1`, body: { remarks: 'x' }, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${PU}/entries/:id/approve`, path: `${PU}/entries/pe-1/approve`, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${PU}/entries/:id`, path: `${PU}/entries/pe-2`, allowed: ADMINS, ok: 204 },
  // Notes
  { method: 'GET', route: `${PU}/notes`, path: `${PU}/notes?type=rd`, allowed: ADMINS, ok: 200 },
  { method: 'PATCH', route: `${PU}/notes/:entryId/:kind`, path: `${PU}/notes/pe-1/rate`, body: { status: 'Issued' }, allowed: ADMINS, ok: 204 },
  // POs
  { method: 'GET', route: `${PU}/pos`, path: `${PU}/pos?progress=Partial`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${PU}/pos/options`, path: `${PU}/pos/options?material=nilgiri`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${PU}/pos/tnc-options`, path: `${PU}/pos/tnc-options`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${PU}/pos/export`, path: `${PU}/pos/export`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${PU}/pos/:id`, path: `${PU}/pos/po-used`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${PU}/pos/:id/print`, path: `${PU}/pos/po-used/print`, allowed: ADMINS, ok: 200 },
  {
    method: 'POST',
    route: `${PU}/pos`,
    path: `${PU}/pos`,
    body: { date: '2026-09-30', material: 'kraft', vendorName: 'V.K.Industrioes', qty: 5000, ratePaise: 3200 },
    allowed: ADMINS,
    ok: 201,
  },
  { method: 'PATCH', route: `${PU}/pos/:id`, path: `${PU}/pos/po-free`, body: { remarks: 'Urgent' }, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${PU}/pos/:id/approve`, path: `${PU}/pos/po-free/approve`, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${PU}/pos/:id`, path: `${PU}/pos/po-free`, allowed: ADMINS, ok: 204 },
  // Returns
  { method: 'GET', route: `${PU}/returns`, path: `${PU}/returns`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${PU}/returns`, path: `${PU}/returns`, body: { date: '2026-09-28', material: 'resin', entryId: 'pe-2', qty: 100, ratePaise: 4000000 }, allowed: ADMINS, ok: 201 },
  { method: 'POST', route: `${PU}/returns/:id/approve`, path: `${PU}/returns/ret-1/approve`, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${PU}/returns/:id`, path: `${PU}/returns/ret-1`, allowed: ADMINS, ok: 204 },
  // Inventory
  { method: 'GET', route: `${PU}/inventory`, path: `${PU}/inventory?fy=2026-27`, allowed: PU_VIEW, ok: 200 },
  { method: 'GET', route: `${PU}/inventory/export`, path: `${PU}/inventory/export`, allowed: PU_VIEW, ok: 200 },
  {
    method: 'PUT',
    route: `${PU}/opening-stock/:fy`,
    path: `${PU}/opening-stock/2026-27`,
    body: { asOnDate: '2026-03-31', mode: 'submit', items: [{ material: 'resin', qty: 500, ratePaise: 4000000 }] },
    allowed: ADMINS,
    ok: 200,
  },
  // Nothing is saved for FY 2025-26, so allowed roles get 409 (the guard let them through).
  { method: 'POST', route: `${PU}/opening-stock/:fy/approve`, path: `${PU}/opening-stock/2025-26/approve`, allowed: ADMINS, ok: 409 },
  { method: 'POST', route: `${PU}/opening-stock/:fy/unlock`, path: `${PU}/opening-stock/2025-26/unlock`, allowed: ADMINS, ok: 409 },
  { method: 'PUT', route: `${PU}/consumption/:fy`, path: `${PU}/consumption/2026-27`, body: { key: 'resin', qty: 100 }, allowed: ADMINS, ok: 204 },
  // Dashboard, reports, audit
  { method: 'GET', route: `${PU}/dashboard`, path: `${PU}/dashboard?fy=2026-27`, allowed: PU_VIEW, ok: 200 },
  { method: 'GET', route: `${PU}/reports`, path: `${PU}/reports?month=2026-09`, allowed: PU_VIEW, ok: 200 },
  { method: 'GET', route: `${PU}/reports/export`, path: `${PU}/reports/export?kind=product-day`, allowed: PU_VIEW, ok: 200 },
  { method: 'GET', route: `${PU}/audit`, path: `${PU}/audit`, allowed: PU_VIEW, ok: 200 },
  // Documents (the file route 404s for an unknown id once the guard lets the role through)
  { method: 'GET', route: `${PU}/documents`, path: `${PU}/documents`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${PU}/documents`, path: `${PU}/documents`, form: pdf, allowed: ADMINS, ok: 201 },
  { method: 'GET', route: `${PU}/documents/:id/file`, path: `${PU}/documents/nope/file`, allowed: ADMINS, ok: 404 },
  { method: 'DELETE', route: `${PU}/documents/:id`, path: `${PU}/documents/nope`, allowed: ADMINS, ok: 404 },
);

// Stores module. Admins have everything. Management: stores_dashboard and stores_reports with print and
// export (so the reports, accounting status and GRN print), no gate / GRN / accounting pages. Others: nothing.
const STO = '/api/stores';
const STO_VIEW: Role[] = ['superadmin', 'admin', 'management'];
const gateEntry = { vehicleNo: 'gj03ab1234', securityName: 'Ramesh', vendorName: 'Typed Vendor', items: [{ material: 'kraft', approxQty: 3000, unit: 'Nos' }] };
const receive = { mrnId: 'mrn-open', invoiceNo: 'INV-pe-1', receivedByName: 'Keeper', items: [{ mrnItemId: 'mrn-open-1', actualQty: 11950, unit: 'Kg', quality: 'short' }] };
CASES.push(
  { method: 'GET', route: `${STO}/meta`, path: `${STO}/meta`, allowed: STO_VIEW, ok: 200 },
  { method: 'PATCH', route: `${STO}/settings`, path: `${STO}/settings`, body: { autoPunchGrn: false }, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${STO}/vendor-options`, path: `${STO}/vendor-options?q=a`, allowed: ADMINS, ok: 200 },
  // MRN
  { method: 'GET', route: `${STO}/mrns`, path: `${STO}/mrns?status=pending_grn`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${STO}/mrns/export`, path: `${STO}/mrns/export`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${STO}/mrns/:id`, path: `${STO}/mrns/mrn-open`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${STO}/mrns/:id/print`, path: `${STO}/mrns/mrn-open/print`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${STO}/mrns`, path: `${STO}/mrns`, body: gateEntry, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${STO}/mrns/:id`, path: `${STO}/mrns/mrn-open`, body: { remarks: 'Seal intact' }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${STO}/mrns/:id`, path: `${STO}/mrns/mrn-open`, allowed: ADMINS, ok: 204 },
  // GRN
  { method: 'GET', route: `${STO}/grns`, path: `${STO}/grns?status=draft`, allowed: STO_VIEW, ok: 200 },
  { method: 'GET', route: `${STO}/grns/export`, path: `${STO}/grns/export`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${STO}/grns/invoice-link`, path: `${STO}/grns/invoice-link?invoiceNo=INV-pe-1`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${STO}/grns/:id`, path: `${STO}/grns/grn-appr`, allowed: STO_VIEW, ok: 200 },
  { method: 'GET', route: `${STO}/grns/:id/print`, path: `${STO}/grns/grn-appr/print`, allowed: STO_VIEW, ok: 200 },
  { method: 'POST', route: `${STO}/grns`, path: `${STO}/grns`, body: receive, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${STO}/grns/:id`, path: `${STO}/grns/grn-draft`, body: { remarks: 'Two logs cracked' }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${STO}/grns/:id`, path: `${STO}/grns/grn-draft`, allowed: ADMINS, ok: 204 },
  { method: 'POST', route: `${STO}/grns/:id/review`, path: `${STO}/grns/grn-draft/review`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${STO}/grns/:id/approve`, path: `${STO}/grns/grn-rev/approve`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${STO}/grns/:id/account`, path: `${STO}/grns/grn-appr/account`, body: { voucherNo: 'PV/009/26-27' }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${STO}/grns/:id/account`, path: `${STO}/grns/grn-acct/account`, allowed: ADMINS, ok: 200 },
  // Dashboard and reports
  { method: 'GET', route: `${STO}/dashboard`, path: `${STO}/dashboard`, allowed: STO_VIEW, ok: 200 },
  { method: 'GET', route: `${STO}/reports/pending`, path: `${STO}/reports/pending?minDays=1`, allowed: STO_VIEW, ok: 200 },
  { method: 'GET', route: `${STO}/reports/pending/export`, path: `${STO}/reports/pending/export`, allowed: STO_VIEW, ok: 200 },
  { method: 'GET', route: `${STO}/accounting`, path: `${STO}/accounting?accounted=false`, allowed: STO_VIEW, ok: 200 },
  { method: 'GET', route: `${STO}/accounting/export`, path: `${STO}/accounting/export`, allowed: STO_VIEW, ok: 200 },
  { method: 'GET', route: `${STO}/audit`, path: `${STO}/audit`, allowed: STO_VIEW, ok: 200 },
);

// Stock module. Admins have everything. Management: stock_dashboard and stock_ledger with print and export.
const SK = '/api/stock';
const SK_VIEW: Role[] = ['superadmin', 'admin', 'management'];
const side = (prefix: string, thick: string | null) => ({ groupId: `skug-${prefix.toLowerCase()}`, thick });
CASES.push(
  { method: 'GET', route: `${SK}/meta`, path: `${SK}/meta`, allowed: SK_VIEW, ok: 200 },
  { method: 'POST', route: `${SK}/items`, path: `${SK}/items`, body: { prefix: 'OC-999', label: 'Test board', family: 'OC', dept: 'Stock (FG)', thicknesses: ['12'] }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${SK}/items/:id`, path: `${SK}/items/skug-oc-611`, body: { label: 'OSB-CAL Graded A – full size' }, allowed: ADMINS, ok: 200 },
  // OC-611 has movements, so allowed roles get 409 (the guard let them through).
  { method: 'DELETE', route: `${SK}/items/:id`, path: `${SK}/items/skug-oc-611`, allowed: ADMINS, ok: 409 },
  { method: 'GET', route: `${SK}/balance`, path: `${SK}/balance?sku=OC-61112`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${SK}/slips`, path: `${SK}/slips?type=SIS`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${SK}/slips/:id`, path: `${SK}/slips/sl-1`, allowed: SK_VIEW, ok: 200 },
  { method: 'GET', route: `${SK}/slips/:id/print`, path: `${SK}/slips/sl-1/print`, allowed: SK_VIEW, ok: 200 },
  { method: 'POST', route: `${SK}/slips`, path: `${SK}/slips`, body: { type: 'SIS', from: side('OC-611', '12'), to: side('OC-I01', '12'), qty: 5 }, allowed: ADMINS, ok: 201 },
  { method: 'DELETE', route: `${SK}/slips/:id`, path: `${SK}/slips/sl-1`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${SK}/opening`, path: `${SK}/opening`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${SK}/opening`, path: `${SK}/opening`, body: { item: side('RM-11000', null), qty: 250 }, allowed: ADMINS, ok: 201 },
  { method: 'DELETE', route: `${SK}/opening/:id`, path: `${SK}/opening/op-2`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${SK}/reclass`, path: `${SK}/reclass`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${SK}/reclass`, path: `${SK}/reclass`, body: { from: side('OC-611', '12'), to: side('OC-771', '12'), qty: 2, reason: 'Broken corner' }, allowed: ADMINS, ok: 201 },
  { method: 'DELETE', route: `${SK}/reclass/:id`, path: `${SK}/reclass/rc-1`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${SK}/live`, path: `${SK}/live?family=OC`, allowed: SK_VIEW, ok: 200 },
  { method: 'GET', route: `${SK}/ledger/sku`, path: `${SK}/ledger/sku?sku=OC-61112`, allowed: SK_VIEW, ok: 200 },
  { method: 'GET', route: `${SK}/ledger/dept`, path: `${SK}/ledger/dept?from=2026-09-01`, allowed: SK_VIEW, ok: 200 },
  { method: 'GET', route: `${SK}/movements`, path: `${SK}/movements`, allowed: SK_VIEW, ok: 200 },
  { method: 'GET', route: `${SK}/export`, path: `${SK}/export?kind=stock`, allowed: SK_VIEW, ok: 200 },
  { method: 'GET', route: `${SK}/dashboard`, path: `${SK}/dashboard`, allowed: SK_VIEW, ok: 200 },
  { method: 'GET', route: `${SK}/audit`, path: `${SK}/audit`, allowed: SK_VIEW, ok: 200 },
);

// Production module. Admins have everything. Management: production_dashboard (with print and export), which
// reads every register (for the reports), opens and prints documents, plan-vs-actual and exports, but writes nothing.
const PR = '/api/production';
const PR_VIEW: Role[] = ['superadmin', 'admin', 'management'];
const prKinds: { path: string; id: string; create: object; createOk: number; patch: object; patchOk: number; deleteOk: number; sendOk: number }[] = [
  { path: 'plans', id: 'pp-1', create: { date: '2026-09-25', shift: 'Day', products: [{ product: 'OSB', size: '8x4', thickness: '12', priority: 'High', targetBoards: 30 }] }, createOk: 201, patch: { remarks: 'x' }, patchOk: 200, deleteOk: 409, sendOk: 200 },
  { path: 'hotpress', id: 'hp-1', create: { date: '2026-09-25', shift: 'Day', product: 'OSB', size: '8x4', charges: [{ pcs: 30 }] }, createOk: 201, patch: { remarks: 'x' }, patchOk: 200, deleteOk: 409, sendOk: 200 },
  // hp-1 already has a cutting report, so a new one for it is a 409 once the guard lets the role through.
  { path: 'cutting', id: 'bc-1', create: { date: '2026-09-25', shift: 'Day', hotpressId: 'hp-1', cutPcs: 10 }, createOk: 409, patch: { cutPcs: 58 }, patchOk: 200, deleteOk: 409, sendOk: 200 },
  { path: 'chipping', id: 'ch-1', create: { date: '2026-09-25', shift: 'Day', lots: [{ purchaseEntryId: 'pe-1', qty: 100 }] }, createOk: 201, patch: { remarks: 'x' }, patchOk: 200, deleteOk: 409, sendOk: 200 },
  { path: 'resin', id: 'rc-1', create: { date: '2026-09-25', shift: 'Day', lot: { purchaseEntryId: 'pe-2', qty: 10 } }, createOk: 201, patch: { remarks: 'x' }, patchOk: 200, deleteOk: 409, sendOk: 200 },
  { path: 'summaries', id: 'ps-1', create: { date: '2026-09-25', product: 'OSB', size: '8x4' }, createOk: 201, patch: { remarks: 'x' }, patchOk: 200, deleteOk: 204, sendOk: 200 },
  // mdo-1 is approved: locked.
  { path: 'mdo', id: 'mdo-1', create: { date: '2026-09-25', shift: 'Day', items: [{ boardType: 'OSB', pcs: 5 }] }, createOk: 201, patch: { remarks: 'x' }, patchOk: 409, deleteOk: 409, sendOk: 409 },
];
CASES.push(
  { method: 'GET', route: `${PR}/meta`, path: `${PR}/meta`, allowed: PR_VIEW, ok: 200 },
  { method: 'PATCH', route: `${PR}/settings`, path: `${PR}/settings`, body: { sizes: ['8x4', '4x4', '6x4', '7x4'] }, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${PR}/fy/:fy/close`, path: `${PR}/fy/2025-26/close`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${PR}/fy/:fy/reopen`, path: `${PR}/fy/2025-26/reopen`, allowed: ADMINS, ok: 409 },
  { method: 'GET', route: `${PR}/lots`, path: `${PR}/lots?material=nilgiri`, allowed: PR_VIEW, ok: 200 },
  ...prKinds.flatMap((k) => {
    const b = `${PR}/${k.path}`;
    return [
      { method: 'GET', route: b, path: b, allowed: PR_VIEW, ok: 200 },
      { method: 'GET', route: `${b}/:id`, path: `${b}/${k.id}`, allowed: PR_VIEW, ok: 200 },
      { method: 'GET', route: `${b}/:id/print`, path: `${b}/${k.id}/print`, allowed: PR_VIEW, ok: 200 },
      { method: 'POST', route: b, path: b, body: k.create, allowed: ADMINS, ok: k.createOk },
      { method: 'PATCH', route: `${b}/:id`, path: `${b}/${k.id}`, body: k.patch, allowed: ADMINS, ok: k.patchOk },
      { method: 'DELETE', route: `${b}/:id`, path: `${b}/${k.id}`, allowed: ADMINS, ok: k.deleteOk },
      { method: 'POST', route: `${b}/:id/send`, path: `${b}/${k.id}/send`, body: { note: 'Please check' }, allowed: ADMINS, ok: k.sendOk },
      // Fixtures are in draft or approved, so review / approve are refused once the guard lets the role through.
      { method: 'POST', route: `${b}/:id/review`, path: `${b}/${k.id}/review`, body: { decision: 'review' }, allowed: ADMINS, ok: 409 },
      { method: 'POST', route: `${b}/:id/approve`, path: `${b}/${k.id}/approve`, body: { decision: 'approve' }, allowed: ADMINS, ok: 409 },
    ];
  }),
  { method: 'GET', route: `${PR}/plans/:id/compare`, path: `${PR}/plans/pp-1/compare`, allowed: PR_VIEW, ok: 200 },
  { method: 'GET', route: `${PR}/summaries/:id/compare`, path: `${PR}/summaries/ps-1/compare`, allowed: PR_VIEW, ok: 200 },
  // Matt weight
  { method: 'GET', route: `${PR}/matt`, path: `${PR}/matt?status=open`, allowed: PR_VIEW, ok: 200 },
  { method: 'GET', route: `${PR}/matt/:id`, path: `${PR}/matt/mb-1`, allowed: PR_VIEW, ok: 200 },
  { method: 'GET', route: `${PR}/matt/:id/print`, path: `${PR}/matt/mb-1/print`, allowed: PR_VIEW, ok: 200 },
  { method: 'POST', route: `${PR}/matt`, path: `${PR}/matt`, body: { date: '2026-09-25', shift: 'Day', product: 'OSB', size: '8x4', setpoint: 40 }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${PR}/matt/:id`, path: `${PR}/matt/mb-1`, body: { operator: 'Suresh' }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${PR}/matt/:id`, path: `${PR}/matt/mb-1`, allowed: ADMINS, ok: 409 },
  { method: 'POST', route: `${PR}/matt/:id/close`, path: `${PR}/matt/mb-1/close`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${PR}/matt/:id/weights`, path: `${PR}/matt/mb-1/weights`, body: { weight: 42.05 }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${PR}/matt/:id/weights/:n`, path: `${PR}/matt/mb-1/weights/2`, body: { weight: 42 }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${PR}/matt/:id/weights/:n`, path: `${PR}/matt/mb-1/weights/3`, allowed: ADMINS, ok: 200 },
  // WIP Nilgiri
  { method: 'GET', route: `${PR}/wip`, path: `${PR}/wip`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${PR}/wip/ledger`, path: `${PR}/wip/ledger?wipId=wip-1`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${PR}/wip`, path: `${PR}/wip`, body: { chippingId: 'ch-1' }, allowed: ADMINS, ok: 409 },
  { method: 'POST', route: `${PR}/wip/:id/adjust`, path: `${PR}/wip/wip-1/adjust`, body: { qty: -50, reason: 'Moisture loss' }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${PR}/wip/:id`, path: `${PR}/wip/wip-1`, allowed: ADMINS, ok: 409 },
  { method: 'GET', route: `${PR}/dashboard`, path: `${PR}/dashboard?fy=2026-27`, allowed: PR_VIEW, ok: 200 },
  { method: 'GET', route: `${PR}/export`, path: `${PR}/export?kind=hotpress`, allowed: PR_VIEW, ok: 200 },
  { method: 'GET', route: `${PR}/audit`, path: `${PR}/audit`, allowed: PR_VIEW, ok: 200 },
);

// Sales module. Admins have everything. Management: sales_dashboard and sales_reports (with print and export),
// so it reads the registers the reports need, but opens no forms and writes nothing.
const SL = '/api/sales';
const SL_VIEW: Role[] = ['superadmin', 'admin', 'management'];
const slLine = { itemId: 'sli-1', pcs: 10, qtySqm: 29.768, ratePaise: 44000 };
CASES.push(
  { method: 'GET', route: `${SL}/meta`, path: `${SL}/meta`, allowed: SL_VIEW, ok: 200 },
  { method: 'GET', route: `${SL}/options`, path: `${SL}/options`, allowed: ADMINS, ok: 200 },
  { method: 'PATCH', route: `${SL}/settings`, path: `${SL}/settings`, body: { brands: ['Strandply', 'Strandply Gold'] }, allowed: ADMINS, ok: 200 },
  // Party master
  { method: 'GET', route: `${SL}/customers`, path: `${SL}/customers?state=GUJARAT`, allowed: SL_VIEW, ok: 200 },
  { method: 'GET', route: `${SL}/customers/:id`, path: `${SL}/customers/slc-g`, allowed: SL_VIEW, ok: 200 },
  { method: 'GET', route: `${SL}/customers/:id/ledger`, path: `${SL}/customers/slc-g/ledger`, allowed: SL_VIEW, ok: 200 },
  { method: 'POST', route: `${SL}/customers`, path: `${SL}/customers`, body: { name: 'NEW PARTY', gstin: '24CCCCC2222C1Z5' }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${SL}/customers/:id`, path: `${SL}/customers/slc-g`, body: { creditDays: 45 }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${SL}/customers/:id`, path: `${SL}/customers/slc-x`, allowed: ADMINS, ok: 204 },
  // Items, price list, weight chart
  { method: 'GET', route: `${SL}/items`, path: `${SL}/items?grade=OSB`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${SL}/items`, path: `${SL}/items`, body: { name: 'OSB TEST 1220mm X 2440mm X 6mm', brand: 'Strandply', grade: 'OSB', thic: 6, width: 1220, length: 2440 }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${SL}/items/:id`, path: `${SL}/items/sli-2`, body: { defaultRatePaise: 35000 }, allowed: ADMINS, ok: 200 },
  // sli-1 is on orders.
  { method: 'DELETE', route: `${SL}/items/:id`, path: `${SL}/items/sli-1`, allowed: ADMINS, ok: 409 },
  { method: 'GET', route: `${SL}/prices`, path: `${SL}/prices?itemId=sli-1`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${SL}/prices`, path: `${SL}/prices`, body: { itemId: 'sli-1', effectiveDate: '2026-10-01', ratePaise: 46000 }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${SL}/prices/:id`, path: `${SL}/prices/pl-1`, body: { ratePaise: 44500 }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${SL}/prices/:id`, path: `${SL}/prices/pl-1`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${SL}/weights`, path: `${SL}/weights`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${SL}/weights`, path: `${SL}/weights`, body: { itemId: 'sli-1', effectiveDate: '2026-10-01', weightKg: 26 }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${SL}/weights/:id`, path: `${SL}/weights/wc-1`, body: { weightKg: 25.5 }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${SL}/weights/:id`, path: `${SL}/weights/wc-1`, allowed: ADMINS, ok: 204 },
  // Proformas
  { method: 'GET', route: `${SL}/proformas`, path: `${SL}/proformas?firm=llp`, allowed: SL_VIEW, ok: 200 },
  { method: 'GET', route: `${SL}/proformas/:id`, path: `${SL}/proformas/pi-1`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${SL}/proformas/:id/print`, path: `${SL}/proformas/pi-1/print`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${SL}/proformas/:id/email`, path: `${SL}/proformas/pi-1/email`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${SL}/proformas`, path: `${SL}/proformas`, body: { firm: 'llp', date: '2026-10-01', billToId: 'slc-g', lines: [slLine] }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${SL}/proformas/:id`, path: `${SL}/proformas/pi-1`, body: { remarks: 'Rate valid 30 days' }, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${SL}/proformas/:id/status`, path: `${SL}/proformas/pi-1/status`, body: { status: 'sent' }, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${SL}/proformas/:id/confirm`, path: `${SL}/proformas/pi-1/confirm`, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${SL}/proformas/:id`, path: `${SL}/proformas/pi-1`, allowed: ADMINS, ok: 204 },
  // Orders
  { method: 'GET', route: `${SL}/orders`, path: `${SL}/orders?status=confirmed`, allowed: SL_VIEW, ok: 200 },
  { method: 'GET', route: `${SL}/orders/:id`, path: `${SL}/orders/so-1`, allowed: SL_VIEW, ok: 200 },
  { method: 'GET', route: `${SL}/orders/:id/print`, path: `${SL}/orders/so-1/print`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${SL}/orders/:id/email`, path: `${SL}/orders/so-1/email`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${SL}/orders`, path: `${SL}/orders`, body: { firm: 'llp', date: '2026-10-01', billToId: 'slc-m', lines: [slLine] }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${SL}/orders/:id`, path: `${SL}/orders/so-1`, body: { edd: '2026-09-12' }, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${SL}/orders/:id/status`, path: `${SL}/orders/so-2/status`, body: { status: 'confirmed' }, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${SL}/orders/:id/dispatch`, path: `${SL}/orders/so-2/dispatch`, body: { date: '2026-09-26', vehicleNo: 'MH12XY9999' }, allowed: ADMINS, ok: 200 },
  // so-1 has invoices.
  { method: 'DELETE', route: `${SL}/orders/:id`, path: `${SL}/orders/so-1`, allowed: ADMINS, ok: 409 },
  // Invoices
  { method: 'GET', route: `${SL}/invoices`, path: `${SL}/invoices?status=pending`, allowed: SL_VIEW, ok: 200 },
  { method: 'GET', route: `${SL}/invoices/:id`, path: `${SL}/invoices/inv-1`, allowed: SL_VIEW, ok: 200 },
  { method: 'GET', route: `${SL}/invoices/:id/print`, path: `${SL}/invoices/inv-1/print`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${SL}/invoices/:id/email`, path: `${SL}/invoices/inv-1/email`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${SL}/invoices`, path: `${SL}/invoices`, body: { soId: 'so-1', date: '2026-10-01', lines: [{ soLine: 0, pcs: 10, qtySqm: 29.768, ratePaise: 44000 }] }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${SL}/invoices/:id`, path: `${SL}/invoices/inv-1`, body: { ewayBill: 'EWB-2' }, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${SL}/invoices/:id/approve`, path: `${SL}/invoices/inv-1/approve`, body: { decision: 'approve' }, allowed: ADMINS, ok: 200 },
  // inv-2 is approved.
  { method: 'DELETE', route: `${SL}/invoices/:id`, path: `${SL}/invoices/inv-2`, allowed: ADMINS, ok: 409 },
  // Dispatch register, FG, inter-company
  { method: 'GET', route: `${SL}/dispatch`, path: `${SL}/dispatch?firm=llp`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${SL}/fg`, path: `${SL}/fg?firm=llp`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${SL}/fg`, path: `${SL}/fg`, body: { firm: 'llp', grade: 'OSB', thic: 9, width: 1220, length: 2440, qtyOnHandSqm: 500 }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${SL}/fg/:id`, path: `${SL}/fg/fg-1`, body: { qtyOnHandSqm: 1200 }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${SL}/fg/:id`, path: `${SL}/fg/fg-1`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${SL}/intercompany`, path: `${SL}/intercompany`, allowed: SL_VIEW, ok: 200 },
  { method: 'POST', route: `${SL}/intercompany`, path: `${SL}/intercompany`, body: { billingDoc: 'SPL/02/26-27', billingDate: '2026-09-06', materialDesc: 'Custom board', pcs: 10, qtySqm: 20, ratePaise: 30000, igstPaise: 108000 }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${SL}/intercompany/:id`, path: `${SL}/intercompany/ic-1`, body: { vehicleNo: 'GJ03AB9999' }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${SL}/intercompany/:id`, path: `${SL}/intercompany/ic-1`, allowed: ADMINS, ok: 204 },
  // Dashboard, reports, exports, audit
  { method: 'GET', route: `${SL}/dashboard`, path: `${SL}/dashboard?firm=llp`, allowed: SL_VIEW, ok: 200 },
  { method: 'GET', route: `${SL}/reports/:id`, path: `${SL}/reports/pending_orders`, allowed: SL_VIEW, ok: 200 },
  { method: 'GET', route: `${SL}/reports/:id/export`, path: `${SL}/reports/sales_register/export`, allowed: SL_VIEW, ok: 200 },
  ...['customers', 'items', 'prices', 'weights', 'proformas', 'orders', 'invoices', 'dispatch', 'fg'].map((k) => ({ method: 'GET', route: `${SL}/export/${k}`, path: `${SL}/export/${k}`, allowed: ADMINS, ok: 200 })),
  { method: 'GET', route: `${SL}/export/intercompany`, path: `${SL}/export/intercompany`, allowed: SL_VIEW, ok: 200 },
  { method: 'GET', route: `${SL}/audit`, path: `${SL}/audit`, allowed: SL_VIEW, ok: 200 },
);

// CRM module. Admins have everything. Marketing works the pipeline (dashboard, leads, follow-ups, customers,
// opportunities, quotations) with edit and print but no delete or export. Management: dashboard and reports.
const CR = '/api/crm';
const CR_ALL: Role[] = ['superadmin', 'admin', 'marketing', 'management'];
const CR_WORK: Role[] = ['superadmin', 'admin', 'marketing'];
const CR_MGMT: Role[] = ['superadmin', 'admin', 'management'];
const leadsCsv = () => csv('Company Name,Mobile,City\nDelta Traders,9825099999,Baroda\n');
const crKinds: { path: string; id: string; read: Role[]; write: Role[]; create?: object; patch: object; deleteId: string; deleteOk: number }[] = [
  { path: 'leads', id: 'crl-a', read: CR_ALL, write: CR_WORK, create: { companyName: 'Delta Traders', mobile: '9825099999', city: 'Baroda' }, patch: { stage: 'Contacted' }, deleteId: 'crl-a', deleteOk: 204 },
  { path: 'customers', id: 'crc-a', read: CR_ALL, write: CR_WORK, create: { companyName: 'Epsilon Ply', mobile: '9825088888' }, patch: { priority: 'Cold' }, deleteId: 'crc-b', deleteOk: 409 },
  { path: 'followups', id: 'fu-1', read: CR_ALL, write: CR_WORK, create: { customerId: 'crc-a', discussion: 'Asked for samples' }, patch: { status: 'Completed' }, deleteId: 'fu-3', deleteOk: 204 },
  { path: 'tasks', id: 't-1', read: CR_ALL, write: CR_WORK, create: { type: 'Site Visit', dueDate: '2026-10-05' }, patch: { status: 'Completed' }, deleteId: 't-1', deleteOk: 204 },
  { path: 'opportunities', id: 'op-1', read: CR_ALL, write: CR_WORK, create: { customerId: 'crc-b', product: 'S-OSB' }, patch: { probability: 70 }, deleteId: 'op-2', deleteOk: 204 },
  { path: 'quotations', id: 'qt-1', read: CR_ALL, write: CR_WORK, create: { customerId: 'crc-a', product: 'OSB', quantity: 50, ratePaise: 150000 }, patch: { status: 'Negotiation' }, deleteId: 'qt-1', deleteOk: 204 },
  { path: 'won', id: 'w-1', read: CR_ALL, write: CR_WORK, patch: { dispatchDate: '2026-10-05' }, deleteId: 'w-1', deleteOk: 204 },
  { path: 'lost', id: 'l-1', read: CR_ALL, write: CR_WORK, patch: { remarks: 'Price gap 10%' }, deleteId: 'l-1', deleteOk: 204 },
  { path: 'campaigns', id: 'cp-1', read: CR_ALL, write: ADMINS, create: { name: 'Diwali Offer' }, patch: { budgetPaise: 2000000 }, deleteId: 'cp-1', deleteOk: 204 },
  { path: 'products', id: 'crp-osb', read: CR_ALL, write: ADMINS, create: { name: 'Plywood' }, patch: { moq: '1 truck' }, deleteId: 'crp-other', deleteOk: 204 },
  { path: 'salespersons', id: 'crs-suresh', read: CR_ALL, write: ADMINS, create: { name: 'Nita Shah' }, patch: { territory: 'Saurashtra' }, deleteId: 'crs-kaushik', deleteOk: 204 },
];
CASES.push(
  { method: 'GET', route: `${CR}/meta`, path: `${CR}/meta`, allowed: CR_ALL, ok: 200 },
  { method: 'PATCH', route: `${CR}/settings`, path: `${CR}/settings`, body: { sources: ['Website', 'Referral'] }, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${CR}/leads/duplicates`, path: `${CR}/leads/duplicates?mobile=9825011111`, allowed: CR_WORK, ok: 200 },
  { method: 'POST', route: `${CR}/leads/import`, path: `${CR}/leads/import`, form: leadsCsv, allowed: CR_WORK, ok: 200 },
  { method: 'GET', route: `${CR}/leads/stages`, path: `${CR}/leads/stages`, allowed: CR_ALL, ok: 200 },
  { method: 'GET', route: `${CR}/followups/board`, path: `${CR}/followups/board`, allowed: CR_ALL, ok: 200 },
  { method: 'GET', route: `${CR}/salespersons/stats`, path: `${CR}/salespersons/stats`, allowed: CR_MGMT, ok: 200 },
  { method: 'GET', route: `${CR}/sources`, path: `${CR}/sources`, allowed: CR_MGMT, ok: 200 },
  ...crKinds.flatMap((k) => {
    const b = `${CR}/${k.path}`;
    const deleters = k.write.filter((r) => ADMINS.includes(r));
    return [
      { method: 'GET', route: b, path: b, allowed: k.read, ok: 200 },
      { method: 'GET', route: `${b}/:id`, path: `${b}/${k.id}`, allowed: k.read, ok: 200 },
      ...(k.create ? [{ method: 'POST', route: b, path: b, body: k.create, allowed: k.write, ok: 201 }] : []),
      { method: 'PATCH', route: `${b}/:id`, path: `${b}/${k.id}`, body: k.patch, allowed: k.write, ok: 200 },
      { method: 'DELETE', route: `${b}/:id`, path: `${b}/${k.deleteId}`, allowed: deleters, ok: k.deleteOk },
    ];
  }),
  { method: 'POST', route: `${CR}/leads/:id/convert`, path: `${CR}/leads/crl-a/convert`, allowed: CR_WORK, ok: 201 },
  { method: 'GET', route: `${CR}/customers/:id/360`, path: `${CR}/customers/crc-a/360`, allowed: CR_ALL, ok: 200 },
  { method: 'POST', route: `${CR}/opportunities/:id/won`, path: `${CR}/opportunities/op-1/won`, body: { orderValuePaise: 30000000 }, allowed: CR_WORK, ok: 201 },
  { method: 'POST', route: `${CR}/opportunities/:id/lost`, path: `${CR}/opportunities/op-2/lost`, body: { lostReason: 'Price Too High' }, allowed: CR_WORK, ok: 201 },
  { method: 'POST', route: `${CR}/lost/:id/reactivate`, path: `${CR}/lost/l-1/reactivate`, allowed: CR_WORK, ok: 201 },
  { method: 'GET', route: `${CR}/quotations/:id/print`, path: `${CR}/quotations/qt-1/print`, allowed: CR_WORK, ok: 200 },
  { method: 'GET', route: `${CR}/dashboard`, path: `${CR}/dashboard`, allowed: CR_ALL, ok: 200 },
  { method: 'GET', route: `${CR}/reports`, path: `${CR}/reports?from=2026-09-01`, allowed: CR_MGMT, ok: 200 },
  ...['leads', 'customers', 'followups', 'opportunities', 'won', 'lost'].map((k) => ({ method: 'GET', route: `${CR}/export/${k}`, path: `${CR}/export/${k}`, allowed: CR_MGMT, ok: 200 })),
  { method: 'GET', route: `${CR}/export/quotations`, path: `${CR}/export/quotations`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${CR}/audit`, path: `${CR}/audit`, allowed: CR_ALL, ok: 200 },
);

// Transport module. Admins have everything (masters writes, approval, exports). Dispatch runs the freight flow
// (inquiries, rate comparisons, order forms) with edit and print, no approval, delete or export. Management:
// dashboard and reports, with export.
const TR = '/api/transport';
const TR_ALL: Role[] = ['superadmin', 'admin', 'dispatch', 'management'];
const TR_WORK: Role[] = ['superadmin', 'admin', 'dispatch'];
const TR_MGMT: Role[] = ['superadmin', 'admin', 'management'];
const transportersCsv = () => csv('Name,Mobile,City\nDelta Roadlines,9825099999,Baroda\n');
CASES.push(
  { method: 'GET', route: `${TR}/meta`, path: `${TR}/meta`, allowed: TR_ALL, ok: 200 },
  { method: 'GET', route: `${TR}/vehicles`, path: `${TR}/vehicles`, allowed: TR_ALL, ok: 200 },
  { method: 'POST', route: `${TR}/vehicles`, path: `${TR}/vehicles`, body: { name: 'Tanker' }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${TR}/vehicles/:id`, path: `${TR}/vehicles/trv-lcv`, body: { capacity: '3 Ton' }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${TR}/vehicles/:id`, path: `${TR}/vehicles/trv-lcv`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${TR}/transporters`, path: `${TR}/transporters?vehicle=Open%20Body`, allowed: TR_WORK, ok: 200 },
  { method: 'POST', route: `${TR}/transporters/import`, path: `${TR}/transporters/import`, form: transportersCsv, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${TR}/transporters/:id`, path: `${TR}/transporters/trt-a`, allowed: TR_WORK, ok: 200 },
  { method: 'POST', route: `${TR}/transporters`, path: `${TR}/transporters`, body: { name: 'Delta Roadlines', phone: '9825099999', city: 'Baroda', vehicles: ['Open Body'] }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${TR}/transporters/:id`, path: `${TR}/transporters/trt-a`, body: { rating: 5 }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${TR}/transporters/:id`, path: `${TR}/transporters/trt-c`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${TR}/inquiries`, path: `${TR}/inquiries?status=open`, allowed: TR_ALL, ok: 200 },
  { method: 'GET', route: `${TR}/inquiries/:id`, path: `${TR}/inquiries/inq-1`, allowed: TR_ALL, ok: 200 },
  { method: 'GET', route: `${TR}/inquiries/:id/past-quotes`, path: `${TR}/inquiries/inq-1/past-quotes`, allowed: TR_WORK, ok: 200 },
  { method: 'POST', route: `${TR}/inquiries`, path: `${TR}/inquiries`, body: { from: { city: 'Halvad' }, to: { city: 'Surat' }, material: 'OSB 12mm', vehicle: '32FT (10T)' }, allowed: TR_WORK, ok: 201 },
  { method: 'PATCH', route: `${TR}/inquiries/:id`, path: `${TR}/inquiries/inq-1`, body: { remarks: 'Tarpaulin needed' }, allowed: TR_WORK, ok: 200 },
  { method: 'POST', route: `${TR}/inquiries/:id/cancel`, path: `${TR}/inquiries/inq-5/cancel`, allowed: TR_WORK, ok: 200 },
  { method: 'POST', route: `${TR}/inquiries/:id/reopen`, path: `${TR}/inquiries/inq-6/reopen`, allowed: TR_WORK, ok: 200 },
  { method: 'PUT', route: `${TR}/inquiries/:id/rates`, path: `${TR}/inquiries/inq-5/rates`, body: { quotes: [{ transporterId: 'trt-c', ratePaise: 1_500_000 }], selected: 0 }, allowed: TR_WORK, ok: 200 },
  { method: 'GET', route: `${TR}/rates`, path: `${TR}/rates?status=pending`, allowed: TR_ALL, ok: 200 },
  { method: 'GET', route: `${TR}/rates/:id`, path: `${TR}/rates/rc-1`, allowed: TR_ALL, ok: 200 },
  { method: 'POST', route: `${TR}/rates/:id/submit`, path: `${TR}/rates/rc-1/submit`, allowed: TR_WORK, ok: 200 },
  { method: 'POST', route: `${TR}/rates/:id/decision`, path: `${TR}/rates/rc-2/decision`, body: { decision: 'approve' }, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${TR}/rates/:id/order`, path: `${TR}/rates/rc-3/order`, allowed: TR_WORK, ok: 201 },
  { method: 'GET', route: `${TR}/orders`, path: `${TR}/orders?status=issued`, allowed: TR_ALL, ok: 200 },
  { method: 'GET', route: `${TR}/orders/:id`, path: `${TR}/orders/sfo-1`, allowed: TR_ALL, ok: 200 },
  { method: 'GET', route: `${TR}/orders/:id/print`, path: `${TR}/orders/sfo-1/print`, allowed: TR_WORK, ok: 200 },
  { method: 'PATCH', route: `${TR}/orders/:id`, path: `${TR}/orders/sfo-1`, body: { status: 'delivered' }, allowed: TR_WORK, ok: 200 },
  { method: 'GET', route: `${TR}/dashboard`, path: `${TR}/dashboard`, allowed: TR_ALL, ok: 200 },
  { method: 'GET', route: `${TR}/reports`, path: `${TR}/reports?from=2026-09-01`, allowed: TR_MGMT, ok: 200 },
  { method: 'GET', route: `${TR}/export/transporters`, path: `${TR}/export/transporters`, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${TR}/export/inquiries`, path: `${TR}/export/inquiries`, allowed: TR_MGMT, ok: 200 },
  { method: 'GET', route: `${TR}/export/orders`, path: `${TR}/export/orders`, allowed: TR_MGMT, ok: 200 },
  { method: 'GET', route: `${TR}/audit`, path: `${TR}/audit`, allowed: TR_ALL, ok: 200 },
);

// Maintenance module. Admins have everything. Management: dashboard and reports (with export). Others: nothing.
const MT = '/api/maintenance';
const MT_ALL: Role[] = ['superadmin', 'admin', 'management'];
CASES.push(
  { method: 'GET', route: `${MT}/meta`, path: `${MT}/meta`, allowed: MT_ALL, ok: 200 },
  { method: 'GET', route: `${MT}/areas`, path: `${MT}/areas`, allowed: MT_ALL, ok: 200 },
  { method: 'POST', route: `${MT}/areas`, path: `${MT}/areas`, body: { name: 'CNC Machine Shop' }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${MT}/areas/:id`, path: `${MT}/areas/mta-4`, body: { name: 'Boiler House' }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${MT}/areas/:id`, path: `${MT}/areas/mta-4`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${MT}/work-orders`, path: `${MT}/work-orders?overdue=true`, allowed: MT_ALL, ok: 200 },
  { method: 'GET', route: `${MT}/work-orders/:id`, path: `${MT}/work-orders/wo-a`, allowed: MT_ALL, ok: 200 },
  { method: 'GET', route: `${MT}/work-orders/:id/print`, path: `${MT}/work-orders/wo-a/print`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${MT}/work-orders`, path: `${MT}/work-orders`, body: { title: 'Boiler feed pump seal', area: 'Boiler Room', assignee: 'Raj Kumar', dueDate: '2026-10-03' }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${MT}/work-orders/:id`, path: `${MT}/work-orders/wo-a`, body: { priority: 'High' }, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${MT}/work-orders/:id/status`, path: `${MT}/work-orders/wo-a/status`, body: { status: 'In Progress' }, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${MT}/work-orders/:id/notes`, path: `${MT}/work-orders/wo-a/notes`, body: { text: 'Seal ordered' }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${MT}/work-orders/:id`, path: `${MT}/work-orders/wo-c`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${MT}/dashboard`, path: `${MT}/dashboard`, allowed: MT_ALL, ok: 200 },
  { method: 'GET', route: `${MT}/reports`, path: `${MT}/reports?from=2026-09-01`, allowed: MT_ALL, ok: 200 },
  { method: 'GET', route: `${MT}/export/work-orders`, path: `${MT}/export/work-orders`, allowed: MT_ALL, ok: 200 },
  { method: 'GET', route: `${MT}/audit`, path: `${MT}/audit`, allowed: MT_ALL, ok: 200 },
);

// Electricity module. Admins have everything. Management: dashboard, reports and bills (read, export). Others: nothing.
const EL = '/api/electricity';
const EL_ALL: Role[] = ['superadmin', 'admin', 'management'];
const invoicePdf = () => {
  const f = new FormData();
  f.append('file', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], 'invoice.pdf', { type: 'application/pdf' }));
  return f;
};
CASES.push(
  { method: 'GET', route: `${EL}/meta`, path: `${EL}/meta`, allowed: EL_ALL, ok: 200 },
  { method: 'GET', route: `${EL}/settings`, path: `${EL}/settings`, allowed: EL_ALL, ok: 200 },
  { method: 'PATCH', route: `${EL}/settings/meter`, path: `${EL}/settings/meter`, body: { meterNo: 'HT-1001' }, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${EL}/rates`, path: `${EL}/rates`, body: { kind: 'energy', value: 450, effectiveFrom: '2026-10-01' }, allowed: ADMINS, ok: 201 },
  { method: 'DELETE', route: `${EL}/rates/:id`, path: `${EL}/rates/elr-mf2`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${EL}/readings`, path: `${EL}/readings?shift=AM`, allowed: EL_ALL, ok: 200 },
  { method: 'GET', route: `${EL}/readings/preview`, path: `${EL}/readings/preview?date=2026-10-01&time=06:00&kwh=1100`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${EL}/readings`, path: `${EL}/readings`, body: { date: '2026-10-01', shift: 'AM', time: '06:00', kwh: 1100 }, allowed: ADMINS, ok: 201 },
  { method: 'DELETE', route: `${EL}/readings/:id`, path: `${EL}/readings/elm-7`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${EL}/daily`, path: `${EL}/daily?from=2026-09-01`, allowed: EL_ALL, ok: 200 },
  { method: 'GET', route: `${EL}/dashboard`, path: `${EL}/dashboard?from=2026-09-01`, allowed: EL_ALL, ok: 200 },
  { method: 'GET', route: `${EL}/bills`, path: `${EL}/bills`, allowed: EL_ALL, ok: 200 },
  { method: 'GET', route: `${EL}/bills/:id`, path: `${EL}/bills/elb-2`, allowed: EL_ALL, ok: 200 },
  { method: 'POST', route: `${EL}/bills`, path: `${EL}/bills`, body: { billDate: '2026-10-31', kwhReading: 1300, totalPayablePaise: 70_000_000 }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${EL}/bills/:id`, path: `${EL}/bills/elb-2`, body: { paidDate: '2026-10-01' }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${EL}/bills/:id`, path: `${EL}/bills/elb-1`, allowed: ADMINS, ok: 204 },
  { method: 'POST', route: `${EL}/bills/:id/invoice`, path: `${EL}/bills/elb-2/invoice`, form: invoicePdf, allowed: ADMINS, ok: 200 },
  { method: 'GET', route: `${EL}/bills/:id/invoice`, path: `${EL}/bills/elb-2/invoice`, allowed: EL_ALL, ok: 404 },
  { method: 'DELETE', route: `${EL}/bills/:id/invoice`, path: `${EL}/bills/elb-2/invoice`, allowed: ADMINS, ok: 404 },
  { method: 'GET', route: `${EL}/export/readings`, path: `${EL}/export/readings`, allowed: EL_ALL, ok: 200 },
  { method: 'GET', route: `${EL}/export/daily`, path: `${EL}/export/daily`, allowed: EL_ALL, ok: 200 },
  { method: 'GET', route: `${EL}/export/bills`, path: `${EL}/export/bills`, allowed: EL_ALL, ok: 200 },
  { method: 'GET', route: `${EL}/audit`, path: `${EL}/audit`, allowed: EL_ALL, ok: 200 },
);

// Complaints module. Admins have everything. Marketing (salesmen) raise and follow complaints with edit and print.
// Management: dashboard, register (read) and reports, with export. Dispatch: nothing.
const CP = '/api/complaints';
const CP_ALL: Role[] = ['superadmin', 'admin', 'marketing', 'management'];
const CP_WORK: Role[] = ['superadmin', 'admin', 'marketing'];
const CP_MGMT: Role[] = ['superadmin', 'admin', 'management'];
const jpg = () => {
  const f = new FormData();
  f.append('file', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])], 'damage.jpg', { type: 'image/jpeg' }));
  f.append('text', 'Photo from site');
  return f;
};
CASES.push(
  { method: 'GET', route: `${CP}/meta`, path: `${CP}/meta`, allowed: CP_ALL, ok: 200 },
  { method: 'GET', route: `${CP}/party-invoices`, path: `${CP}/party-invoices?customerId=slc-g`, allowed: CP_ALL, ok: 200 },
  { method: 'GET', route: `${CP}/recipients`, path: `${CP}/recipients`, allowed: CP_ALL, ok: 200 },
  { method: 'POST', route: `${CP}/recipients`, path: `${CP}/recipients`, body: { name: 'Q A Head', email: 'qa@strandply.in' }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${CP}/recipients/:id`, path: `${CP}/recipients/cpr-sinha`, body: { email: 'pk@strandply.in' }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${CP}/recipients/:id`, path: `${CP}/recipients/cpr-old`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${CP}/complaints`, path: `${CP}/complaints?open=true`, allowed: CP_ALL, ok: 200 },
  { method: 'GET', route: `${CP}/complaints/:id`, path: `${CP}/complaints/cmp-a`, allowed: CP_ALL, ok: 200 },
  { method: 'GET', route: `${CP}/complaints/:id/print`, path: `${CP}/complaints/cmp-a/print`, allowed: CP_ALL, ok: 200 },
  { method: 'POST', route: `${CP}/complaints`, path: `${CP}/complaints`, body: { salesman: 'Suresh Kumar', customerName: 'New Party', material: 'Plywood', category: 'Other', description: 'x', recipientId: 'cpr-jimit' }, allowed: CP_WORK, ok: 201 },
  { method: 'PATCH', route: `${CP}/complaints/:id`, path: `${CP}/complaints/cmp-c`, body: { priority: 'High' }, allowed: CP_WORK, ok: 200 },
  { method: 'POST', route: `${CP}/complaints/:id/status`, path: `${CP}/complaints/cmp-c/status`, body: { status: 'In Progress' }, allowed: CP_WORK, ok: 200 },
  { method: 'POST', route: `${CP}/complaints/:id/photos`, path: `${CP}/complaints/cmp-c/photos`, form: jpg, allowed: CP_WORK, ok: 200 },
  { method: 'DELETE', route: `${CP}/complaints/:id/photos/:fileId`, path: `${CP}/complaints/cmp-c/photos/nope`, allowed: CP_WORK, ok: 404 },
  { method: 'POST', route: `${CP}/complaints/:id/comments`, path: `${CP}/complaints/cmp-c/comments`, form: jpg, allowed: CP_WORK, ok: 200 },
  { method: 'GET', route: `${CP}/complaints/:id/files/:fileId`, path: `${CP}/complaints/cmp-c/files/nope`, allowed: CP_ALL, ok: 404 },
  { method: 'DELETE', route: `${CP}/complaints/:id`, path: `${CP}/complaints/cmp-d`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${CP}/dashboard`, path: `${CP}/dashboard`, allowed: CP_ALL, ok: 200 },
  { method: 'GET', route: `${CP}/reports`, path: `${CP}/reports?fy=2026-27`, allowed: CP_MGMT, ok: 200 },
  { method: 'GET', route: `${CP}/export`, path: `${CP}/export`, allowed: CP_MGMT, ok: 200 },
  { method: 'GET', route: `${CP}/audit`, path: `${CP}/audit`, allowed: CP_ALL, ok: 200 },
);

// DWPAS. Admins have everything, including dwpas_approve. Management: dashboard, plans (read, print, export) and
// reports. Others: nothing.
const DW = '/api/dwpas';
const DW_ALL: Role[] = ['superadmin', 'admin', 'management'];
CASES.push(
  { method: 'GET', route: `${DW}/meta`, path: `${DW}/meta`, allowed: DW_ALL, ok: 200 },
  { method: 'GET', route: `${DW}/departments`, path: `${DW}/departments`, allowed: DW_ALL, ok: 200 },
  { method: 'POST', route: `${DW}/departments`, path: `${DW}/departments`, body: { name: 'Packing', head: 'Packing Head' }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${DW}/departments/:id`, path: `${DW}/departments/dwd-12`, body: { head: 'QC Manager' }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${DW}/departments/:id`, path: `${DW}/departments/dwd-8`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${DW}/employees`, path: `${DW}/employees`, allowed: DW_ALL, ok: 200 },
  { method: 'POST', route: `${DW}/employees`, path: `${DW}/employees`, body: { name: 'Asha Patel', type: 'Unskilled' }, allowed: ADMINS, ok: 201 },
  { method: 'PATCH', route: `${DW}/employees/:id`, path: `${DW}/employees/dwe-4`, body: { designation: 'Yard Supervisor' }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${DW}/employees/:id`, path: `${DW}/employees/dwe-4`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${DW}/plans`, path: `${DW}/plans?status=Submitted`, allowed: DW_ALL, ok: 200 },
  { method: 'GET', route: `${DW}/plans/by-date/:date`, path: `${DW}/plans/by-date/2026-09-29`, allowed: DW_ALL, ok: 200 },
  { method: 'GET', route: `${DW}/plans/:id/print`, path: `${DW}/plans/dwp-a/print?kind=achievement`, allowed: DW_ALL, ok: 200 },
  { method: 'PUT', route: `${DW}/plans`, path: `${DW}/plans`, body: { date: '2026-10-05', lines: [{ department: 'Peeling', work: 'Peel logs' }] }, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${DW}/plans/:id/submit`, path: `${DW}/plans/dwp-c/submit`, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${DW}/plans/:id/approve`, path: `${DW}/plans/dwp-b/approve`, body: {}, allowed: ADMINS, ok: 200 },
  { method: 'POST', route: `${DW}/plans/:id/reopen`, path: `${DW}/plans/dwp-a/reopen`, body: {}, allowed: ADMINS, ok: 200 },
  { method: 'PUT', route: `${DW}/plans/:id/achievement`, path: `${DW}/plans/dwp-b/achievement`, body: { lines: [{ actualQty: 1100 }, { actualQty: 3 }] }, allowed: ADMINS, ok: 200 },
  { method: 'DELETE', route: `${DW}/plans/:id`, path: `${DW}/plans/dwp-c`, allowed: ADMINS, ok: 204 },
  { method: 'GET', route: `${DW}/dashboard`, path: `${DW}/dashboard?date=2026-09-29`, allowed: DW_ALL, ok: 200 },
  { method: 'GET', route: `${DW}/manpower`, path: `${DW}/manpower`, allowed: DW_ALL, ok: 200 },
  { method: 'GET', route: `${DW}/variance`, path: `${DW}/variance?from=2026-09-01`, allowed: DW_ALL, ok: 200 },
  { method: 'GET', route: `${DW}/export`, path: `${DW}/export`, allowed: DW_ALL, ok: 200 },
  { method: 'GET', route: `${DW}/audit`, path: `${DW}/audit`, allowed: DW_ALL, ok: 200 },
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
