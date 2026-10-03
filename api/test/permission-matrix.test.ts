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
