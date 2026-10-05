import { describe, expect, it } from 'vitest';
import { calcHotPress } from '../src/contracts/production';
import { calcEntry } from '../src/contracts/purchase';
import { buildSeed } from '../src/seed';
import { upgradeSnapshot } from '../src/seed/upgrades';
import { makeTestApp, T0 } from './helpers';

const HB = '/api/hub';
const SEPT = 'from=2026-09-01&to=2026-09-30';

async function as(role = 'admin') {
  const t = await makeTestApp();
  const cookie = await t.login(role);
  const json = async (path: string) => (await t.request('GET', `${HB}${path}`, { cookie })).json();
  return { t, cookie, json };
}

describe('module figures agree with the modules', () => {
  it('purchase: entries saved for approval or approved, SPL total with tax and other charges', async () => {
    const { t, json } = await as();
    const all = (await t.data.repos.purchaseEntries.listBetween('2026-04-01', '2026-10-01')).filter((e) => e.status !== 'draft');
    const p = await json('/purchase');
    expect(p.entries).toBe(all.length);
    expect(p.valuePaise).toBe(all.reduce((s, e) => s + calcEntry(e).spl.total + e.otherChargesPaise, 0));
    expect(p.byMaterial.reduce((s: number, m: { valuePaise: number }) => s + m.valuePaise, 0)).toBe(p.valuePaise);
    const nilgiri = await json('/purchase?material=nilgiri');
    expect(nilgiri.byMaterial.map((m: { material: string }) => m.material)).toEqual(nilgiri.entries ? ['nilgiri'] : []);
  });

  it('production: hot press boards', async () => {
    const { t, json } = await as('management');
    const hps = (await t.data.repos.prodHotpress.listAll()).filter((h) => h.date >= '2026-04-01');
    const p = await json('/production');
    expect([p.reports, p.boards]).toEqual([hps.length, hps.reduce((s, h) => s + calcHotPress(h.charges).totalBoards, 0)]);
  });

  it('electricity: bills dated in the range and the metered estimate (the Electricity module’s own costing)', async () => {
    const { json } = await as();
    const e = await json(`/electricity?${SEPT}`);
    expect(e).toMatchObject({ bills: 1, billedUnits: 7200, billedPaise: 60_000_000, meteredUnits: 2750, meteredPaise: 1_155_000 + 632_500 + 3 * 2_128_917, readings: 7 });
  });

  it('sales: invoices in the range; every open order whatever its date; the order pipeline', async () => {
    const { t, json } = await as();
    const invs = (await t.data.repos.salesInvoices.listAll()).filter((i) => i.date >= '2026-04-01');
    const s = await json('/sales');
    expect([s.invoices, s.revenuePaise]).toEqual([invs.length, invs.reduce((x, i) => x + i.totalPaise, 0)]);
    const open = (await t.data.repos.salesOrders.listAll()).filter((o) => o.status !== 'completed' && o.status !== 'cancelled');
    expect(s.pendingOrders).toHaveLength(open.length);
    expect(s.pendingPaise).toBe(open.reduce((x, o) => x + o.totalPaise, 0));
    expect((await json('/sales?firm=osb')).invoices).toBe(invs.filter((i) => i.firm === 'osb').length);
  });

  it('maintenance: work orders touched in the range; overdue as of today', async () => {
    const { json } = await as();
    expect(await json(`/maintenance?${SEPT}`)).toMatchObject({ workOrders: 4, open: 3, overdue: 1, completed: 1 });
    expect((await json(`/maintenance?${SEPT}`)).openList[0]).toMatchObject({ woNo: 'WO-26-0001', overdue: true });
  });

  it('stock: the Purchase inventory ledger for the FY, and SKU stock by department', async () => {
    const { json } = await as();
    const s = await json('/stock?fy=2026-27');
    expect(s.fy).toBe('2026-27');
    expect(s.rawClosingPaise).toBe(s.raw.reduce((x: number, r: { closingPaise: number }) => x + r.closingPaise, 0));
    expect(Array.isArray(s.sku)).toBe(true);
  });
});

describe('analytics, overview, period', () => {
  it('cost per board = (raw material + metered power) ÷ boards; kWh per 1,000 boards', async () => {
    const { json } = await as();
    const [p, prod, e, a] = await Promise.all([json(`/purchase?${SEPT}`), json(`/production?${SEPT}`), json(`/electricity?${SEPT}`), json(`/analytics?${SEPT}`)]);
    expect(a.costPaise).toBe(p.valuePaise + e.meteredPaise);
    expect(a.boards).toBe(prod.boards);
    expect(a.costPerBoardPaise).toBe(prod.boards ? Math.round(a.costPaise / prod.boards) : null);
    expect(a.kwhPerThousand).toBe(prod.boards ? Math.round((e.meteredUnits / prod.boards) * 1000 * 100) / 100 : null);
  });

  it('overview defaults to the FY to date and sums the module figures', async () => {
    const { json } = await as('management');
    const o = await json('/overview');
    expect([o.from, o.to]).toEqual(['2026-04-01', '2026-10-01']);
    expect(o.purchasePaise).toBe((await json('/purchase')).valuePaise);
    expect(o.months.map((m: { month: string }) => m.month)).toEqual([...o.months.map((m: { month: string }) => m.month)].sort());
  });

  it('period: everything for the days, plus complaints, freight order forms and DWPAS achievement', async () => {
    const { json } = await as();
    const p = await json(`/period?${SEPT}`);
    expect(p.others).toEqual({ complaints: 3, complaintsOpen: 2, freightOrders: 1, freightPaise: 1_800_000, plans: 2, plansAchievedPct: 85 });
    expect(p.electricity.bills).toBe(1);
    const day = await json('/period?from=2026-09-29&to=2026-09-29');
    expect(day.others).toMatchObject({ plans: 1, complaints: 0 });
    const bad = await as();
    expect((await bad.t.request('GET', `${HB}/period?from=2026-10-01&to=2026-09-01`, { cookie: bad.cookie })).status).toBe(422);
    expect((await json('/period?fy=2025-26')).from).toBe('2025-04-01');
  });

  it('years, sources and the workbook', async () => {
    const { t, cookie, json } = await as();
    expect((await json('/years'))[0]).toBe('2026-27');
    const src = await json('/sources');
    expect(src.map((x: { module: string }) => x.module)).toEqual(['Purchase', 'Production', 'Stock (SKU)', 'Electricity', 'Sales', 'Maintenance', 'Complaints', 'Transport', 'DWPAS', 'CRM']);
    expect(src.find((x: { module: string }) => x.module === 'Complaints').records).toBe(4);
    const res = await t.request('GET', `${HB}/export?fy=2026-27`, { cookie });
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
  });
});

describe('upgrade', () => {
  it('0017 grants the hub pages (management without data sources)', () => {
    const seed = buildSeed({ devUsers: false, at: T0.toISOString() });
    const old = structuredClone(seed) as Partial<typeof seed>;
    old.upgrades = seed.upgrades.filter((u) => u.name !== '0017_hub');
    for (const r of old.rolePermissions!) r.permissions.pages = r.permissions.pages.filter((p) => !p.startsWith('hub_'));
    const up = upgradeSnapshot(old, seed, T0.toISOString());
    const pages = (role: string) => up.rolePermissions!.find((r) => r.role === role)!.permissions.pages.filter((p) => p.startsWith('hub_'));
    expect(pages('admin')).toEqual(['hub_dashboard', 'hub_modules', 'hub_periodic', 'hub_sources']);
    expect(pages('management')).toEqual(['hub_dashboard', 'hub_modules', 'hub_periodic']);
    expect(pages('marketing')).toEqual([]);
  });
});
