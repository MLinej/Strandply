import { describe, expect, it } from 'vitest';
import { duplicateHits, quoteTotals } from '../src/contracts/crm';
import { buildSeed } from '../src/seed';
import { upgradeSnapshot } from '../src/seed/upgrades';
import { makeTestApp, T0 } from './helpers';

const CR = '/api/crm';

async function admin() {
  const t = await makeTestApp();
  const cookie = await t.login('admin');
  const call = (method: string, path: string, body?: unknown) => t.request(method, `${CR}${path}`, { cookie, body });
  const json = async (method: string, path: string, body?: unknown) => (await call(method, path, body)).json();
  return { t, cookie, call, json };
}
const paths = async (res: Response) => ((await res.json()) as { error: { details: { path: string }[] } }).error.details.map((d) => d.path);
const sheet = (text: string) => {
  const f = new FormData();
  f.append('file', new File([text], 'leads.csv', { type: 'text/csv' }));
  return f;
};

describe('rules', () => {
  it('duplicates: same mobile (last 10 digits), same name and city, or same email', () => {
    const leads = [{ id: 'a', companyName: 'Alpha Ply', mobile: '+91 98250 11111', email: 'a@x.in', city: 'Ahmedabad' }];
    const customers = [{ id: 'c', companyName: 'Beta Boards', mobile: '9825022222', city: 'Surat' }];
    expect(duplicateHits({ mobile: '9825011111' }, leads, customers)).toEqual(['Lead with the same mobile: Alpha Ply']);
    expect(duplicateHits({ companyName: ' beta boards', city: 'SURAT' }, leads, customers)).toEqual(['Customer with the same name and city: Beta Boards']);
    expect(duplicateHits({ email: 'A@X.IN' }, leads, customers)).toEqual(['Lead with the same email: Alpha Ply']);
    expect(duplicateHits({ mobile: '9825011111' }, leads, customers, 'a')).toEqual([]);
    expect(quoteTotals({ quantity: 100, ratePaise: 150000, gstPct: 18 })).toEqual({ totalPaise: 15000000, gstPaise: 2700000, finalPaise: 17700000 });
  });
});

describe('leads', () => {
  it('a new lead defaults to today and New Lead; duplicates can be checked before saving', async () => {
    const { call, json } = await admin();
    const l = await json('POST', '/leads', { companyName: 'Delta Traders', mobile: '98250 99999', city: 'Baroda' });
    expect(l).toMatchObject({ dateAdded: '2026-10-01', stage: 'New Lead', dataQuality: 'Good', customerId: null });
    expect(await json('GET', '/leads/duplicates?mobile=9825011111')).toEqual(['Lead with the same mobile: Alpha Ply', 'Customer with the same mobile: Alpha Ply']);
    expect(await json('GET', `/leads/duplicates?mobile=9825099999&except=${l.id}`)).toEqual([]);
    expect(await paths(await call('POST', '/leads', { companyName: '', mobile: 'abc' }))).toEqual(['companyName', 'mobile']);
  });

  it('converting copies the lead into a customer profile and moves the lead on; once only', async () => {
    const { call, json } = await admin();
    const c = await json('POST', '/leads/crl-a/convert');
    expect(c).toMatchObject({ companyName: 'Gamma Interiors', mobile: '9825033333', city: 'Rajkot', productsUsed: 'OSB', leadSource: 'Exhibition', salesperson: 'Suresh Kumar', firstContactDate: '2026-09-01', lastContactDate: '2026-10-01', status: 'Active', priority: 'Warm', leadId: 'crl-a' });
    expect(await json('GET', '/leads/crl-a')).toMatchObject({ customerId: c.id, stage: 'Contacted' });
    expect((await call('POST', '/leads/crl-a/convert')).status).toBe(409);
    expect((await call('DELETE', '/leads/crl-a')).status).toBe(204);
    expect((await json('GET', `/customers/${c.id}`)).leadId).toBeNull();
  });

  it('import: a dry run flags missing fields and duplicates (saved and within the sheet); commit adds the valid rows', async () => {
    const { t, cookie, json } = await admin();
    const csv = 'Company Name,Mobile Number,City,Customer Type,Source\nDelta Traders,9825099999,Baroda,architect,\nAlpha Copy,9825011111,Ahmedabad,Dealer,Google\n,9825077777,Pune,,\nDelta Again,9825099999,Baroda,,\n';
    const dry = await (await t.request('POST', `${CR}/leads/import`, { cookie, form: sheet(csv) })).json();
    expect(dry).toMatchObject({ total: 4, valid: 3, duplicates: 2, imported: 0 });
    expect(dry.rows.map((r: { companyName: string; customerType: string; source: string; error: string | null; duplicates: string[] }) => [r.companyName, r.customerType, r.source, r.error, r.duplicates.length])).toEqual([
      ['Delta Traders', 'Architect', 'Other', null, 0],
      ['Alpha Copy', 'Dealer', 'Google', null, 2],
      ['', null, 'Other', 'Company name is missing', 0],
      ['Delta Again', null, 'Other', null, 1],
    ]);
    const done = await (await t.request('POST', `${CR}/leads/import?commit=true`, { cookie, form: sheet(csv) })).json();
    expect(done.imported).toBe(3);
    const imported = (await json('GET', '/leads?pageSize=100')).rows.filter((l: { dataQuality: string }) => l.dataQuality === 'Imported');
    expect(imported).toHaveLength(3);
  });
});

describe('follow-ups', () => {
  it('logging one fills contact, salesperson and priority from the customer and updates its last contact and next follow-up', async () => {
    const { json } = await admin();
    const f = await json('POST', '/followups', { customerId: 'crc-b', discussion: 'Asked for samples', nextFollowUpDate: '2026-10-04' });
    expect(f).toMatchObject({ date: '2026-10-01', type: 'Call', status: 'Pending', contactPerson: 'Mehul', salesperson: 'Kaushik Kothari', priority: 'Warm', customerName: 'Beta Boards', due: '2026-10-04' });
    expect(await json('GET', '/customers/crc-b')).toMatchObject({ lastContactDate: '2026-10-01', nextFollowUp: '2026-10-04' });
  });

  it('the board buckets open follow-ups by due date; completing one counts as contact', async () => {
    const { json } = await admin();
    const b = await json('GET', '/followups/board');
    expect([b.overdue, b.today, b.tomorrow, b.upcoming].map((x: { id: string }[]) => x.map((f) => f.id))).toEqual([['fu-1'], ['fu-2'], [], []]);
    await json('PATCH', '/followups/fu-2', { status: 'Rescheduled', nextFollowUpDate: '2026-10-02' });
    expect((await json('GET', '/followups/board')).tomorrow.map((f: { id: string }) => f.id)).toEqual(['fu-2']);
    expect((await json('GET', '/customers/crc-a')).nextFollowUp).toBe('2026-10-02');
    await json('PATCH', '/followups/fu-1', { status: 'Completed' });
    expect((await json('GET', '/followups/board')).overdue).toEqual([]);
    expect((await json('GET', '/followups?city=surat')).rows.map((f: { id: string }) => f.id)).toEqual(['fu-3']);
    expect((await json('GET', '/leads/stages')).filter((s: { value: number }) => s.value)).toEqual([{ name: 'New Lead', value: 1 }, { name: 'Qualified', value: 1 }]);
    expect((await json('GET', '/customers/crc-a')).lastContactDate).toBe('2026-10-01');
  });
});

describe('pipeline', () => {
  it('won: an ORD number, days from first contact, the opportunity closes; deleting the order reopens it', async () => {
    const { call, json } = await admin();
    const w = await json('POST', '/opportunities/op-1/won', { orderValuePaise: 31000000, ratePaise: 155000, dispatchDate: '2026-10-10' });
    expect(w).toMatchObject({ orderNo: 'ORD/26-27/0002', orderDate: '2026-10-01', customerName: 'Alpha Ply', product: 'OSB', source: 'IndiaMART', leadToOrderDays: 30, salesperson: 'Suresh Kumar' });
    expect(await json('GET', '/opportunities/op-1')).toMatchObject({ stage: 'Order Won', probability: 100 });
    expect((await call('POST', '/opportunities/op-1/won', { orderValuePaise: 1 })).status).toBe(409);
    expect((await call('POST', '/opportunities/op-1/lost', { lostReason: 'Other' })).status).toBe(409);
    expect((await call('PATCH', '/opportunities/op-1', { stage: 'Negotiation' })).status).toBe(409);
    expect((await call('DELETE', '/opportunities/op-1')).status).toBe(409);
    expect((await call('DELETE', `/won/${w.id}`)).status).toBe(204);
    expect((await json('GET', '/opportunities/op-1')).stage).toBe('Negotiation');
    expect(await paths(await call('PATCH', '/opportunities/op-1', { stage: 'Order Won' }))).toEqual(['stage']);
  });

  it('lost → reactivate makes a new 20% opportunity, once; a reactivated lost order can’t be deleted', async () => {
    const { call, json } = await admin();
    const l = await json('POST', '/opportunities/op-2/lost', { lostReason: 'Price Too High', competitor: 'Local OSB', ourPricePaise: 135000, reactivationDate: '2026-12-01' });
    expect(l).toMatchObject({ lostDate: '2026-10-01', estValuePaise: 5000000, salesperson: 'Kaushik Kothari', competitor: 'Local OSB' });
    expect((await json('GET', '/opportunities/op-2')).stage).toBe('Order Lost');
    const o = await json('POST', '/lost/l-1/reactivate');
    expect(o).toMatchObject({ customerId: 'crc-b', stage: 'Qualification', probability: 20, reactivatedFrom: 'l-1', customerName: 'Beta Boards' });
    expect((await call('POST', '/lost/l-1/reactivate')).status).toBe(409);
    expect((await call('DELETE', '/lost/l-1')).status).toBe(409);
  });

  it('quotations: QT numbers, totals with GST, the opportunity must be the same customer’s; print carries the letterhead', async () => {
    const { call, json } = await admin();
    const q = await json('POST', '/quotations', { customerId: 'crc-a', opportunityId: 'op-1', product: 'OSB', quantity: 50, ratePaise: 150000, date: null });
    expect(q).toMatchObject({ quoteNo: 'QT/26-27/0002', date: '2026-10-01', status: 'Draft', gstPct: 18, totalPaise: 7500000, gstPaise: 1350000, finalPaise: 8850000, opportunity: 'OSB · 1 truck', salesperson: 'Suresh Kumar' });
    expect(await paths(await call('POST', '/quotations', { customerId: 'crc-a', opportunityId: 'op-2', product: 'OSB', quantity: 1, ratePaise: 1 }))).toEqual(['opportunityId']);
    const p = await json('GET', `/quotations/${q.id}/print`);
    expect(p.customer.companyName).toBe('Alpha Ply');
    expect(p.quotation.finalPaise).toBe(8850000);
    expect(p.company.name).toBeTruthy();
  });
});

describe('customers', () => {
  it('360 view gathers everything, and the linked Sales party’s orders and invoices', async () => {
    const { call, json } = await admin();
    expect((await call('DELETE', '/customers/crc-a')).status).toBe(409);
    expect(await paths(await call('PATCH', '/customers/crc-a', { salesCustomerId: 'nope' }))).toEqual(['salesCustomerId']);
    await json('PATCH', '/customers/crc-a', { salesCustomerId: 'slc-g' });
    const v = await json('GET', '/customers/crc-a/360');
    expect(v.salesParty).toEqual({ id: 'slc-g', name: 'GUJARAT TRADERS' });
    expect(v.sales).toMatchObject({ orders: 1, invoices: 2, lastInvoice: '2026-09-06' });
    expect([v.opportunities.length, v.followups.length, v.quotations.length, v.tasks.length]).toEqual([1, 2, 1, 1]);
    expect(v.tasks[0]).toMatchObject({ overdue: true, customerName: 'Alpha Ply' });
    expect(v.timeline.map((e: { kind: string }) => e.kind)).toEqual(['WhatsApp', 'Call', 'Quotation']);
    const n = await json('POST', '/customers', { companyName: 'Epsilon Ply', mobile: '9825088888' });
    expect(n).toMatchObject({ status: 'Active', priority: 'Warm', firstContactDate: '2026-10-01' });
    expect((await call('DELETE', `/customers/${n.id}`)).status).toBe(204);
  });
});

describe('dashboard, reports, masters', () => {
  it('dashboard figures and management alerts', async () => {
    const { json } = await admin();
    const d = await json('GET', '/dashboard');
    expect(d).toMatchObject({ leads: 2, qualified: 1, openOpps: 2, pipelinePaise: 35000000, dueToday: 1, overdue: 1, won: 1, wonPaise: 4800000, lost: 1, customers: 2, quotesSent: 1 });
    expect(d.alerts.map((a: { text: string }) => a.text)).toEqual([
      '1 follow-up overdue',
      '1 quotation sent 15+ days ago with no answer',
      '1 open opportunity whose customer has no next follow-up date',
      '1 dormant customer: no contact for 30+ days',
      '1 lost order due for reactivation',
    ]);
    expect(d.overdueList.map((f: { id: string }) => f.id)).toEqual(['fu-1']);
  });

  it('reports: product and city enquiries, ageing, competitors, dormant customers, sources; salesperson figures', async () => {
    const { json } = await admin();
    const r = await json('GET', '/reports');
    expect(r.products).toEqual([{ name: 'OSB', value: 2 }]);
    expect(r.ageing.find((a: { name: string }) => a.name === '16–30 days').value).toBe(2);
    expect(r.competitors).toEqual([{ name: 'Local OSB', value: 1 }]);
    expect(r.dormant).toEqual([{ id: 'crc-b', name: 'Beta Boards', salesperson: 'Kaushik Kothari', days: 47 }]);
    expect(r.sources.find((s: { source: string }) => s.source === 'Website')).toMatchObject({ won: 1, lost: 1, revenuePaise: 4800000 });
    expect(r.sources.find((s: { source: string }) => s.source === 'IndiaMART')).toMatchObject({ leads: 1, qualified: 1, quotations: 1 });
    const sp = await json('GET', '/salespersons/stats');
    expect(sp.find((p: { name: string }) => p.name === 'Suresh Kumar')).toMatchObject({ leads: 2, overdue: 1, pipelinePaise: 30000000 });
    const camp = await json('GET', '/campaigns');
    expect(camp.rows[0]).toMatchObject({ name: 'Expo 2026', leads: 1, costPerLeadPaise: 1000000 });
  });

  it('settings lists can’t be emptied; master names are unique; exports are logged', async () => {
    const { call, json } = await admin();
    expect(await paths(await call('PATCH', '/settings', { lostReasons: [] }))).toEqual(['lostReasons']);
    expect((await json('PATCH', '/settings', { sources: ['Website', 'Website', 'Referral'] })).sources).toEqual(['Website', 'Referral']);
    expect((await call('POST', '/products', { name: ' osb ' })).status).toBe(409);
    for (const k of ['leads', 'customers', 'followups', 'opportunities', 'quotations', 'won', 'lost']) expect((await call('GET', `/export/${k}`)).status, k).toBe(200);
    expect((await json('GET', '/audit')).rows.filter((a: { action: string }) => a.action === 'Export')).toHaveLength(7);
  });
});

describe('seed and dev snapshot upgrade (0011)', () => {
  it('products, salespersons and settings everywhere; demo records only in dev', () => {
    const prod = buildSeed({ devUsers: false, at: T0.toISOString() });
    expect([prod.crmProducts.length, prod.crmSalespersons.length, prod.crmLeads.length]).toEqual([6, 2, 0]);
    const dev = buildSeed({ devUsers: true, at: T0.toISOString() });
    expect(dev.crmLeads.length).toBeGreaterThan(5);
    expect(dev.crmFollowups.every((f) => dev.crmCustomers.some((c) => c.id === f.customerId))).toBe(true);
  });

  it('0011 grants the CRM pages (marketing works the pipeline) and adds settings once', () => {
    const seed = buildSeed({ devUsers: false, at: T0.toISOString() });
    const old = structuredClone(seed) as Partial<typeof seed>;
    old.upgrades = seed.upgrades.filter((u) => u.name !== '0011_crm');
    for (const r of old.rolePermissions!) r.permissions.pages = r.permissions.pages.filter((p) => !p.startsWith('crm_'));
    old.settings = old.settings!.filter((s) => !s.key.startsWith('crm.'));
    delete old.crmProducts;
    const up = upgradeSnapshot(old, seed, T0.toISOString());
    expect(up.rolePermissions!.find((r) => r.role === 'marketing')!.permissions.pages.filter((p) => p.startsWith('crm_'))).toEqual(['crm_dashboard', 'crm_leads', 'crm_followups', 'crm_customers', 'crm_pipeline']);
    expect(up.rolePermissions!.find((r) => r.role === 'management')!.permissions.pages.filter((p) => p.startsWith('crm_'))).toEqual(['crm_dashboard', 'crm_reports']);
    expect(up.settings!.filter((s) => s.key.startsWith('crm.'))).toHaveLength(2);
    expect(up.crmProducts).toHaveLength(6);
    expect(upgradeSnapshot(up, seed, T0.toISOString()).settings!.filter((s) => s.key.startsWith('crm.'))).toHaveLength(2);
  });
});
