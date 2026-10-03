import { describe, expect, it } from 'vitest';
import { skuCode } from '../src/contracts/stock';
import { buildSeed } from '../src/seed';
import { REF_SKU_GROUPS } from '../src/seed/stock';
import { upgradeSnapshot } from '../src/seed/upgrades';
import { makeTestApp, T0 } from './helpers';

const SK = '/api/stock';
const side = (prefix: string, thick: string | null = null) => ({ groupId: `skug-${prefix.toLowerCase()}`, thick });

async function admin() {
  const t = await makeTestApp();
  const cookie = await t.login('admin');
  const call = (method: string, path: string, body?: unknown) => t.request(method, `${SK}${path}`, { cookie, body });
  const bal = async (sku: string) => ((await (await call('GET', `/balance?sku=${sku}`)).json()) as { qty: number }).qty;
  return { t, call, bal };
}
const paths = async (res: Response) => ((await res.json()) as { error: { details: { path: string }[] } }).error.details.map((d) => d.path);

describe('item master', () => {
  it('seeds the 103 legacy groups; codes are prefix + thickness, or the prefix for fixed codes', () => {
    expect(REF_SKU_GROUPS).toHaveLength(103);
    expect(new Set(REF_SKU_GROUPS.map((g) => g.prefix)).size).toBe(103);
    const oc611 = REF_SKU_GROUPS.find((g) => g.prefix === 'OC-611')!;
    expect(skuCode(oc611, '12')).toBe('OC-61112');
    expect(skuCode(REF_SKU_GROUPS.find((g) => g.prefix === 'RM-05000')!, null)).toBe('RM-05000');
  });

  it('adds items with a unique prefix, sorted thicknesses and default unit', async () => {
    const { call } = await admin();
    const res = await call('POST', '/items', { prefix: 'oc-999', label: 'Test board', family: 'OC', dept: 'Stock (FG)', thicknesses: ['18', '12', '12'] });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ prefix: 'OC-999', unit: 'pcs', thicknesses: ['12', '18'], size: null });
    const dup = await call('POST', '/items', { prefix: 'OC-999', label: 'Again', family: 'OC', dept: 'Stock (FG)' });
    expect(dup.status).toBe(409);
    expect((await dup.json()).error.code).toBe('prefix_taken');
  });

  it('protects items with movements: no prefix change, no dropping a used thickness, no delete', async () => {
    const { call } = await admin();
    expect((await call('PATCH', '/items/skug-oc-611', { prefix: 'OC-6110' })).status).toBe(409);
    const drop = await call('PATCH', '/items/skug-oc-611', { thicknesses: ['06', '08'] });
    expect(drop.status).toBe(409);
    expect((await drop.json()).error.message).toContain('12 mm');
    expect((await call('PATCH', '/items/skug-oc-611', { label: 'Renamed', thicknesses: ['06', '12'] })).status).toBe(200);
    expect((await call('DELETE', '/items/skug-oc-611')).status).toBe(409);
    expect((await call('DELETE', '/items/skug-hy-m22')).status).toBe(204);
    // A PATCH without unit / thicknesses leaves them alone.
    const unit = await (await call('PATCH', '/items/skug-rm-05000', { label: 'Melamine Resin (MR)' })).json();
    expect(unit).toMatchObject({ unit: 'kg', thicknesses: [] });
  });
});

describe('slips (SIS / SRS)', () => {
  it('moves stock MINUS from and PLUS to, numbered per calendar year', async () => {
    const { call, bal } = await admin();
    expect(await bal('OC-61112')).toBe(60);
    const res = await call('POST', '/slips', { type: 'SIS', from: side('OC-611', '12'), to: side('OC-I01', '12'), qty: 25, refNo: 'OSB-PR/2026/007', shift: 'Night' });
    expect(res.status).toBe(201);
    const s = await res.json();
    expect(s).toMatchObject({ slipNo: 'ISS/2026/002', date: '2026-10-01', from: { sku: 'OC-61112' }, to: { sku: 'OC-I0112' }, fromInfo: { dept: 'Stock (GRA)' }, toInfo: { dept: 'Cutting Dept (WIP)' } });
    expect(s.batch).toMatch(/^B-\d{5}$/);
    expect(await bal('OC-61112')).toBe(35);
    expect(await bal('OC-I0112')).toBe(55);
    const srs = await (await call('POST', '/slips', { type: 'SRS', from: side('OC-I01', '12'), to: side('OC-J12', '12'), qty: 5, batch: 'B-77' })).json();
    expect(srs).toMatchObject({ slipNo: 'MRS/2026/001', batch: 'B-77' });
  });

  it('refuses to issue more than is in stock, the same SKU on both sides, a bad thickness or a future date', async () => {
    const { call } = await admin();
    const short = await call('POST', '/slips', { type: 'SIS', from: side('OC-611', '12'), to: side('OC-I01', '12'), qty: 61 });
    expect(short.status).toBe(409);
    expect((await short.json()).error.message).toContain('Only 60 available in OC-61112');
    expect(await paths(await call('POST', '/slips', { type: 'SIS', from: side('OC-611', '12'), to: side('OC-611', '12'), qty: 1 }))).toEqual(['to']);
    expect(await paths(await call('POST', '/slips', { type: 'SIS', from: side('OC-611', '13'), to: side('OC-I01', '12'), qty: 1 }))).toEqual(['from.thick']);
    expect(await paths(await call('POST', '/slips', { type: 'SIS', from: side('OC-611'), to: side('OC-I01', '12'), qty: 1 }))).toEqual(['from.thick']);
    expect(await paths(await call('POST', '/slips', { type: 'SIS', from: side('OC-611', '12'), to: side('OC-I01', '12'), qty: 1, date: '2026-10-02' }))).toEqual(['date']);
    expect((await call('POST', '/slips', { type: 'SIS', from: side('OC-611', '12'), to: side('OC-I01', '12'), qty: 0 })).status).toBe(422);
  });

  it('reversal is allowed while the TO stock is still there', async () => {
    const { call, bal } = await admin();
    // Move 25 of the 30 on OC-I0112 onwards; the remaining 5 can't cover reversing sl-1.
    await call('POST', '/slips', { type: 'SRS', from: side('OC-I01', '12'), to: side('OC-J12', '12'), qty: 25 });
    const blocked = await call('DELETE', '/slips/sl-1');
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error.code).toBe('stock_consumed');
    const { t } = await admin();
    const cookie = await t.login('admin');
    expect((await t.request('DELETE', `${SK}/slips/sl-1`, { cookie })).status).toBe(204);
    expect(await bal('OC-61112')).toBe(60);
  });

  it('register searches both SKU codes and filters by type and dates', async () => {
    const { call } = await admin();
    const ids = async (qs: string) => ((await (await call('GET', `/slips?${qs}`)).json()) as { rows: { id: string }[] }).rows.map((r) => r.id);
    expect(await ids('q=oc-i0112')).toEqual(['sl-1']);
    expect(await ids('type=SRS')).toEqual([]);
    expect(await ids('from=2026-09-11')).toEqual([]);
    expect(await ids('sku=OC-61112')).toEqual(['sl-1']);
  });
});

describe('opening stock and reclassification', () => {
  it('opening adds stock; reversal needs the stock to still be there', async () => {
    const { call, bal } = await admin();
    const o = await (await call('POST', '/opening', { item: side('RM-11000'), qty: 250.5, note: 'Count' })).json();
    expect(o).toMatchObject({ item: { sku: 'RM-11000', thick: null }, info: { unit: 'kg' } });
    expect(await bal('RM-11000')).toBe(250.5);
    // op-1 added 100 to OC-61112, which now holds 60.
    expect((await call('DELETE', '/opening/op-1')).status).toBe(409);
    expect((await call('DELETE', `/opening/${o.id}`)).status).toBe(204);
    expect(await bal('RM-11000')).toBe(0);
  });

  it('reclass needs a reason, distinct SKUs and enough stock; reversal is checked (legacy wasn’t)', async () => {
    const { call, bal } = await admin();
    expect(await paths(await call('POST', '/reclass', { from: side('OC-611', '12'), to: side('OC-771', '12'), qty: 2, reason: ' ' }))).toEqual(['reason']);
    expect((await call('POST', '/reclass', { from: side('OC-611', '12'), to: side('OC-771', '12'), qty: 61, reason: 'x' })).status).toBe(409);
    const r = await (await call('POST', '/reclass', { scenario: 'Stock → Reject', from: side('OC-611', '12'), to: side('OC-771', '12'), qty: 2, reason: 'Broken corner', ref: 'STJ/2026/004' })).json();
    expect(r).toMatchObject({ strNo: 'STR/2026/002', scenario: 'Stock → Reject' });
    expect(await bal('OC-77112')).toBe(2);
    // Move rc-1's 10 on, then its reversal would make OC-62112 negative.
    await call('POST', '/reclass', { from: side('OC-621', '12'), to: side('OC-631', '12'), qty: 8, reason: 'Re-graded' });
    expect((await call('DELETE', '/reclass/rc-1')).status).toBe(409);
  });
});

describe('ledgers, live stock and dashboard', () => {
  it('the SKU ledger includes opening and reclass legs, with a running balance and brought-forward', async () => {
    const { call } = await admin();
    const l = await (await call('GET', '/ledger/sku?sku=OC-61112')).json();
    expect(l.legs.map((x: { docNo: string; qty: number; balance: number }) => [x.docNo, x.qty, x.balance])).toEqual([
      ['Opening', 100, 100],
      ['ISS/2026/001', -30, 70],
      ['STR/2026/001', -10, 60],
    ]);
    expect(l).toMatchObject({ openingQty: 0, totals: { out: 40, in: 100, net: 60 }, closingQty: 60 });
    const later = await (await call('GET', '/ledger/sku?sku=OC-61112&from=2026-09-11')).json();
    expect(later).toMatchObject({ openingQty: 70, closingQty: 60 });
    expect(later.legs).toHaveLength(1);
  });

  it('dept ledger totals IN / OUT per department; daily movement lists slips and reclasses', async () => {
    const { call } = await admin();
    const d = await (await call('GET', '/ledger/dept')).json();
    const gra = d.depts.find((x: { dept: string }) => x.dept === 'Stock (GRA)');
    expect(gra).toMatchObject({ in: 110, out: 40, net: 70 });
    const m = await (await call('GET', '/movements?from=2026-09-01&to=2026-09-30')).json();
    expect(m.rows.map((r: { kind: string; docNo: string }) => `${r.kind} ${r.docNo}`)).toEqual(['SIS ISS/2026/001', 'STR STR/2026/001']);
    expect(m.totalQty).toBe(40);
  });

  it('live stock lists non-zero SKUs by department, filtered by family', async () => {
    const { call } = await admin();
    const live = await (await call('GET', '/live')).json();
    expect(live.rows.map((r: { sku: string; qty: number }) => `${r.sku}=${r.qty}`)).toEqual(['RM-05000=5000', 'OC-61112=60', 'OC-62112=10', 'OC-I0112=30']);
    expect(live.total).toBe(5100);
    expect((await (await call('GET', '/live?family=OC')).json()).total).toBe(100);
  });

  it('dashboard stages use the real balance (opening and reclass included)', async () => {
    const { call } = await admin();
    await call('POST', '/reclass', { from: side('OC-611', '12'), to: side('OC-771', '12'), qty: 3, reason: 'Broken' });
    const d = await (await call('GET', '/dashboard')).json();
    const stage = (label: string) => d.stages.find((s: { label: string }) => s.label === label).qty;
    expect(stage('Graded stock')).toBe(67);
    expect(stage('Raw material')).toBe(5000);
    expect(stage('Rejected')).toBe(3);
    expect(d).toMatchObject({ totalQty: 5100, alertQty: 3, slips: { total: 1, sis: 1, srs: 0 }, reclasses: 2 });
    expect((await (await call('GET', '/dashboard?from=2026-10-01')).json()).slips.total).toBe(0);
  });
});

describe('dev snapshot upgrade (0008)', () => {
  it('grants the Stock keys and fills the item master once', () => {
    const seed = buildSeed({ devUsers: false, at: T0.toISOString() });
    const old = structuredClone(seed) as Partial<typeof seed>;
    old.upgrades = old.upgrades!.filter((u) => u.name !== '0008_stock');
    delete old.skGroups;
    for (const r of old.rolePermissions!) r.permissions.pages = r.permissions.pages.filter((p) => !p.startsWith('stock_'));
    const up = upgradeSnapshot(old, seed, T0.toISOString());
    expect(up.skGroups).toHaveLength(103);
    expect(up.rolePermissions!.find((r) => r.role === 'management')!.permissions.pages.filter((p) => p.startsWith('stock_'))).toEqual(['stock_dashboard', 'stock_ledger']);
    expect(up.rolePermissions!.find((r) => r.role === 'admin')!.permissions.pages).toContain('stock_masters');
  });
});
