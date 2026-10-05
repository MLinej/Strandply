import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { buildSeed } from '../src/seed';
import { upgradeSnapshot } from '../src/seed/upgrades';
import { makeTestApp, T0 } from './helpers';

const VN = '/api/vendors';

async function admin() {
  const t = await makeTestApp();
  const cookie = await t.login('admin');
  const call = (method: string, path: string, body?: unknown) => t.request(method, `${VN}${path}`, { cookie, body });
  return { t, cookie, call };
}

const upload = (name: string, text: string) => {
  const f = new FormData();
  f.append('file', new File([text], name, { type: 'text/csv' }));
  return f;
};

describe('vendors: create and edit', () => {
  it('assigns SPL-VEN-YY-NNN, submits for review by default, and returns categories and products by name', async () => {
    const { call } = await admin();
    const res = await call('POST', '', { name: '  Shree   Ram Timber ', categoryIds: ['vcat-raw-material'], productIds: ['vprod-002'], gst: '24aabcs1234f1z5' });
    expect(res.status).toBe(201);
    const v = await res.json();
    expect(v).toMatchObject({
      code: 'SPL-VEN-26-001',
      name: 'Shree Ram Timber',
      status: 'pending',
      submittedAt: T0.toISOString(),
      gst: '24AABCS1234F1Z5',
      categories: [{ id: 'vcat-raw-material', name: 'Raw Material', color: 'yellow' }],
      products: [{ id: 'vprod-002', name: 'Dry Strands', unit: 'MT', categoryName: 'Raw Material' }],
      createdByName: 'Admin User',
    });
    const second = await (await call('POST', '', { name: 'Second', categoryIds: ['vcat-resin'], status: 'inactive' })).json();
    expect(second).toMatchObject({ code: 'SPL-VEN-26-002', status: 'inactive', submittedAt: null });
  });

  it('checks fields: a category is required, and GSTIN, PAN, IFSC, pincode and rating formats', async () => {
    const { call } = await admin();
    const res = await call('POST', '', {
      name: 'Bad Co',
      categoryIds: [],
      gst: '24ABC',
      pan: 'ABCDE12345',
      ifsc: 'SBIN1234567',
      pincode: '0123',
      rating: 6,
      website: 'not a url at all',
    });
    expect(res.status).toBe(422);
    const paths = (await res.json()).error.details.map((d: { path: string }) => d.path).sort();
    expect(paths).toEqual(['categoryIds', 'gst', 'ifsc', 'pan', 'pincode', 'rating', 'website']);
    const unknown = await call('POST', '', { name: 'X', categoryIds: ['nope'] });
    expect((await unknown.json()).error.details).toEqual([{ path: 'categoryIds', message: 'Unknown category nope' }]);
  });

  it('warns about a duplicate name unless forced; a typed code must be unused', async () => {
    const { call } = await admin();
    const dup = await call('POST', '', { name: 'active strands', categoryIds: ['vcat-resin'] });
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toMatchObject({ code: 'possible_duplicate', details: { similar: [{ id: 'ven-act', code: 'V-VEN-ACT' }] } });
    const forced = await t_force(call);
    expect(forced.status).toBe(201);
    const taken = await call('POST', '', { name: 'Fresh Co', code: 'v-ven-act', categoryIds: ['vcat-resin'] });
    expect(taken.status).toBe(409);
    expect((await taken.json()).error.code).toBe('code_taken');
  });

  it('edits details only; a blank code keeps the current one; status is not editable here', async () => {
    const { call } = await admin();
    const res = await call('PATCH', '/ven-act', { code: '', rating: 2, productIds: ['vprod-005'], status: 'blacklisted' });
    const v = await res.json();
    expect(v).toMatchObject({ code: 'V-VEN-ACT', rating: 2, productIds: ['vprod-005'], status: 'active' });
  });
});

async function t_force(call: (m: string, p: string, b?: unknown) => Promise<Response>) {
  return call('POST', '?force=true', { name: 'Active Strands', categoryIds: ['vcat-resin'] });
}

describe('vendors: workflow (legacy approveV / activateV / openBL / reinstateV)', () => {
  it('pending → approved → active, recording who and when', async () => {
    const { call } = await admin();
    expect(await (await call('POST', '/ven-pend/approve')).json()).toMatchObject({ status: 'approved', approvedAt: T0.toISOString(), approvedByName: 'Admin User' });
    expect(await (await call('POST', '/ven-pend/activate')).json()).toMatchObject({ status: 'active', activatedByName: 'Admin User' });
  });

  it('blacklisting needs a reason; reinstating clears it and returns to approved', async () => {
    const { call } = await admin();
    expect((await call('POST', '/ven-act/blacklist', { reason: '  ' })).status).toBe(422);
    const bl = await (await call('POST', '/ven-act/blacklist', { reason: 'Short supply twice' })).json();
    expect(bl).toMatchObject({ status: 'blacklisted', blacklistReason: 'Short supply twice', blacklistedByName: 'Admin User' });
    const back = await (await call('POST', '/ven-act/reinstate')).json();
    expect(back).toMatchObject({ status: 'approved', blacklistReason: null, blacklistedAt: null });
  });

  it('refuses steps that do not start from the current status', async () => {
    const { call } = await admin();
    for (const [id, step] of [
      ['ven-act', 'approve'],
      ['ven-pend', 'activate'],
      ['ven-act', 'reinstate'],
      ['ven-black', 'blacklist'],
      ['ven-pend', 'submit'],
    ] as const) {
      const res = await call('POST', `/${id}/${step}`, step === 'blacklist' ? { reason: 'x' } : undefined);
      expect(res.status, `${id} ${step}`).toBe(409);
      expect((await res.json()).error.code).toBe('invalid_transition');
    }
    expect(await (await call('POST', '/ven-inact/submit')).json()).toMatchObject({ status: 'pending' });
  });

  it('each step is logged', async () => {
    const { t, call } = await admin();
    await call('POST', '/ven-pend/approve');
    const log = await t.services.activity.list({ filters: { entityType: 'vendor' } as never });
    expect(log.rows[0]).toMatchObject({ action: 'Approve', entityId: 'ven-pend', details: 'Approved vendor V-VEN-PEND Pending Timber: Pending → Approved' });
  });
});

describe('vendors: lists, stats, compare, find by product, reports', () => {
  it('filters by status, category and state; sorts by rating', async () => {
    const { call } = await admin();
    const names = async (q: string) => (await (await call('GET', q)).json()).rows.map((v: { name: string }) => v.name);
    expect(await names('?status=active')).toEqual(['Active Strands']);
    expect(await names('?categoryId=vcat-resin&sort=-rating')).toEqual(['Active Strands', 'Approved Resins']);
    expect(await names('?state=gujarat')).toEqual(['Active Strands', 'Pending Timber']);
    expect(await names('?q=rajkot')).toEqual(['Active Strands']);
  });

  it('counts each status', async () => {
    const { call } = await admin();
    expect(await (await call('GET', '/stats')).json()).toEqual({ total: 5, pending: 1, approved: 1, active: 1, inactive: 1, blacklisted: 1 });
  });

  it('compares 2 to 4 vendors, in the order asked', async () => {
    const { call } = await admin();
    const rows = await (await call('GET', '/compare?ids=ven-appr,ven-act')).json();
    expect(rows.map((v: { id: string }) => v.id)).toEqual(['ven-appr', 'ven-act']);
    expect((await call('GET', '/compare?ids=ven-act')).status).toBe(422);
  });

  it('find by product lists approved and active suppliers only, best rated first', async () => {
    const { call } = await admin();
    const rows = await (await call('GET', '/by-product?q=mdi')).json();
    expect(rows.map((r: { vendor: { name: string } }) => r.vendor.name)).toEqual(['Active Strands', 'Approved Resins']);
    // Blacklisted Film supplies Stretch Film Roll but is left out.
    expect(await (await call('GET', '/by-product?q=stretch')).json()).toEqual([]);
    const byCat = await (await call('GET', '/by-product?categoryId=vcat-raw-material')).json();
    expect(byCat.map((r: { productName: string }) => r.productName)).toEqual(['Wax-Coated Strands']);
  });

  it('report: overview with average rating, top breakdowns, every vendor by name', async () => {
    const { call } = await admin();
    const r = await (await call('GET', '/reports')).json();
    expect(r.overview).toMatchObject({ total: 5, active: 1, pending: 1, blacklisted: 1, ratedCount: 3, averageRating: 4 });
    expect(r.byCategory[0]).toEqual({ label: 'Packaging', count: 2 });
    expect(r.byState).toEqual([
      { label: 'Gujarat', count: 2 },
      { label: 'Maharashtra', count: 1 },
    ]);
    expect(r.byPaymentTerms).toEqual([{ label: '30 Days', count: 2 }]);
    expect(r.rows.map((v: { name: string }) => v.name)[0]).toBe('Active Strands');
  });

  it('exports CSV with categories and products joined by |', async () => {
    const { call } = await admin();
    const csv = await (await call('GET', '/export?format=csv&status=active')).text();
    const [head, row] = csv.replace('﻿', '').trim().split('\r\n');
    expect(head!.split(',').slice(0, 4)).toEqual(['Code', 'Name', 'Type', 'Categories']);
    expect(row).toContain('Raw Material | Resin & Chemicals');
    expect(row).toContain('Wax-Coated Strands | MDI Resin');
  });

  it('print payload carries the company header and logs a Print entry', async () => {
    const { t, call } = await admin();
    const p = await (await call('GET', '/ven-act/print')).json();
    expect(p.company.name).toBe('Strandply LLP');
    expect(p.vendors.map((v: { id: string }) => v.id)).toEqual(['ven-act']);
    const log = await t.services.activity.list({});
    expect(log.rows[0]).toMatchObject({ action: 'Print', details: 'Printed vendor card V-VEN-ACT Active Strands' });
  });
});

describe('vendor masters', () => {
  it('categories list counts products and vendors; names are unique; used ones cannot be deleted', async () => {
    const { call } = await admin();
    const cats = await (await call('GET', '/categories')).json();
    expect(cats.find((c: { id: string }) => c.id === 'vcat-resin')).toMatchObject({ productCount: 4, vendorCount: 2, sampleProducts: ['MDI Resin', 'PMDI Binder', 'Urea Formaldehyde Resin'] });
    expect((await call('POST', '/categories', { name: 'raw  material' })).status).toBe(409);
    const del = await call('DELETE', '/categories/vcat-resin');
    expect(del.status).toBe(409);
    expect((await del.json()).error.message).toBe('Category "Resin & Chemicals" is used by 4 products and 2 vendors and cannot be deleted');
    const created = await (await call('POST', '/categories', { name: 'Electrical', icon: '⚡' })).json();
    expect(created).toMatchObject({ sortOrder: 10, color: 'grey', status: 'active' }); // after vcat-free (9)
  });

  it('products get SPL-P-YY-NNN after the seeded ones; a supplied product cannot be deleted', async () => {
    const { call } = await admin();
    const p = await (await call('POST', '/products', { name: 'Phenolic Film', categoryId: 'vcat-packaging', unit: 'Roll', gstRate: '18', hsn: '3920' })).json();
    expect(p).toMatchObject({ code: 'SPL-P-26-015', gstRate: 18, categoryName: 'Packaging', vendorCount: 0 });
    expect((await call('POST', '/products', { name: 'X', categoryId: 'vcat-packaging', unit: 'Roll', gstRate: 7 })).status).toBe(422);
    const del = await call('DELETE', '/products/vprod-005');
    expect((await del.json()).error.message).toBe('Product "MDI Resin" is used by 2 vendors and cannot be deleted');
    expect(await (await call('GET', '/products/summary')).json()).toEqual({ total: 15, categories: 7, withVendors: 3 });
  });

  it('T&C: create with defaults, stats, edit', async () => {
    const { call } = await admin();
    const t = await (await call('POST', '/tnc', { title: 'Force Majeure', body: 'Neither party is liable…', category: 'Legal' })).json();
    expect(t).toMatchObject({ version: '1.0', status: 'active', appliesTo: 'all' });
    await call('PATCH', `/tnc/${t.id}`, { status: 'inactive' });
    // 5 vendor clauses + 4 PO clauses (0006) + the new one, now inactive.
    expect(await (await call('GET', '/tnc/stats')).json()).toEqual({ total: 10, categories: 5, active: 9 });
  });
});

describe('vendor import (legacy openImport / confirmImportData)', () => {
  it('preview reports each row; commit adds the valid ones together', async () => {
    const { t, cookie } = await admin();
    const csv = [
      'Name,Categories,Products,Phone,Status',
      'Morbi Timber,Raw Material,Dry Strands,98765 43210,active',
      'Active Strands,Raw Material,,,',
      'Ghost Co,Nonexistent,,,',
      'Morbi Timber,Raw Material,,,',
      'Bad Phone,Raw Material,,12345,',
    ].join('\n');
    const preview = await (await t.request('POST', `${VN}/import/vendors`, { cookie, form: upload('v.csv', csv) })).json();
    expect(preview.totals).toEqual({ rows: 5, added: 1, skipped: 2, errors: 2 });
    expect(preview.rows.map((r: { status: string; reason?: string }) => [r.status, r.reason ?? ''])).toEqual([
      ['would_add', ''],
      ['skipped', 'A vendor with this name already exists'],
      ['error', 'Unknown category: Nonexistent'],
      ['skipped', 'Repeated earlier in this file'],
      ['error', 'phone: Enter a valid phone number'],
    ]);
    expect((await (await t.request('GET', `${VN}/stats`, { cookie })).json()).total).toBe(5);

    const commit = await (await t.request('POST', `${VN}/import/vendors?commit=true`, { cookie, form: upload('v.csv', csv) })).json();
    expect(commit.totals.added).toBe(1);
    const added = (await (await t.request('GET', `${VN}?q=morbi timber`, { cookie })).json()).rows[0];
    expect(added).toMatchObject({ code: 'SPL-VEN-26-001', status: 'active', phone: '98765 43210', products: [{ name: 'Dry Strands' }] });
  });

  it('imports categories (legacy colour classes map to names) and cities with pincodes', async () => {
    const { t, cookie } = await admin();
    const cats = await (await t.request('POST', `${VN}/import/categories?commit=true`, { cookie, form: upload('c.csv', 'Name,Color\nElectrical,c11\n') })).json();
    expect(cats.totals.added).toBe(1);
    const all = await (await t.request('GET', `${VN}/categories`, { cookie })).json();
    expect(all.find((c: { name: string }) => c.name === 'Electrical')).toMatchObject({ color: 'amber' });

    const cities = await (
      await t.request('POST', `${VN}/import/cities?commit=true`, { cookie, form: upload('c.csv', 'City,State,Pincodes\nTankara,Gujarat,363650|363651\nNowhere,Atlantis,\nMorbi,Gujarat,\n') })
    ).json();
    expect(cities.rows.map((r: { status: string }) => r.status)).toEqual(['error', 'error', 'skipped']);
    expect(cities.rows[0].reason).toBe('Pincode 363650 already belongs to Morbi');
  });

  it('blank template per kind', async () => {
    const { t, cookie } = await admin();
    const res = await t.request('GET', `${VN}/import/products/template`, { cookie });
    const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' });
    const [row] = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets['Products']!);
    expect(Object.keys(row!)).toContain('Category');
    expect((await t.request('GET', `${VN}/import/nope/template`, { cookie })).status).toBe(404);
  });
});

describe('vendor e-mail settings', () => {
  it('reads defaults and saves changes', async () => {
    const { call } = await admin();
    expect(await (await call('GET', '/settings/email')).json()).toEqual({ fromName: 'Strandply LLP', replyTo: null });
    const saved = await (await call('PUT', '/settings/email', { replyTo: 'Buy@Strandply.in' })).json();
    expect(saved).toEqual({ fromName: 'Strandply LLP', replyTo: 'buy@strandply.in' });
    expect((await call('PUT', '/settings/email', { replyTo: 'nope' })).status).toBe(422);
  });
});

describe('dev snapshot upgrade (0005)', () => {
  it('adds the Vendors keys to old role rows once, pincodes to cities, and keeps custom changes', () => {
    const seed = buildSeed({ devUsers: false, at: T0.toISOString() });
    const old = structuredClone(seed) as Partial<typeof seed>;
    delete old.upgrades;
    delete old.vendors;
    const admin = old.rolePermissions!.find((r) => r.role === 'admin')!;
    admin.permissions = { pages: ['dashboard', 'users'], actions: ['edit'], widgets: [] }; // a custom set from before
    for (const c of old.cities!) delete (c as { pincodes?: string[] }).pincodes;
    old.cities = old.cities!.filter((c) => c.id !== 'city-valsad');

    const up = upgradeSnapshot(old, seed, T0.toISOString());
    const adminAfter = up.rolePermissions!.find((r) => r.role === 'admin')!.permissions;
    expect(adminAfter.pages.filter((p) => !p.startsWith('purchase_') && !p.startsWith('stores_') && !p.startsWith('stock_') && !p.startsWith('production_') && !p.startsWith('sales_') && !p.startsWith('crm_') && !p.startsWith('transport_') && !p.startsWith('maintenance_') && !p.startsWith('electricity_') && !p.startsWith('complaints_') && !p.startsWith('dwpas_') && !p.startsWith('hub_'))).toEqual(['dashboard', 'users', 'vendors', 'vendor_reports', 'vendor_masters', 'vendor_settings']);
    expect(adminAfter.actions).toEqual(['edit', 'vendor_approve', 'purchase_approve', 'stores_review', 'stores_approve', 'stores_account', 'production_review', 'production_approve', 'sales_approve', 'transport_approve', 'dwpas_approve']);
    expect(up.rolePermissions!.find((r) => r.role === 'dispatch')!.permissions.pages).not.toContain('vendors');
    expect(up.cities!.find((c) => c.id === 'city-morbi')!.pincodes).toEqual(['363641', '363650']);
    expect(up.cities!.some((c) => c.id === 'city-valsad')).toBe(true);
    expect(up.upgrades!.map((u) => u.name)).toEqual(['0005_vendors', '0006_purchase', '0007_stores', '0008_stock', '0009_production', '0010_sales', '0011_crm', '0012_transport', '0013_maintenance', '0014_electricity', '0015_complaints', '0016_dwpas', '0017_hub']);

    // Running again changes nothing.
    adminAfter.pages = ['dashboard'];
    const again = upgradeSnapshot(up, seed, T0.toISOString());
    expect(again.rolePermissions!.find((r) => r.role === 'admin')!.permissions.pages).toEqual(['dashboard']);
  });
});
