import { describe, expect, it } from 'vitest';
import { worstQuality } from '../src/contracts/stores';
import { buildSeed } from '../src/seed';
import { upgradeSnapshot } from '../src/seed/upgrades';
import { makeTestApp, T0 } from './helpers';

const STO = '/api/stores';
const gate = { vehicleNo: 'gj 03 ab 1234', securityName: 'Ramesh', vendorName: 'Typed Vendor', items: [{ material: 'kraft', approxQty: 3000, unit: 'Nos' }] };
const receiveOpen = (over: object = {}) => ({
  mrnId: 'mrn-open',
  invoiceNo: 'inv-pe-1',
  receivedByName: 'Keeper',
  items: [
    { mrnItemId: 'mrn-open-1', actualQty: 11950, unit: 'Kg', quality: 'short', qualityRemarks: '50 kg short' },
    { mrnItemId: 'mrn-open-2', actualQty: 500, unit: 'Kg', quality: 'ok' },
  ],
  ...over,
});

async function admin() {
  const t = await makeTestApp();
  const cookie = await t.login('admin');
  const call = (method: string, path: string, body?: unknown) => t.request(method, `${STO}${path}`, { cookie, body });
  const settings = (s: object) => call('PATCH', '/settings', s);
  return { t, call, settings };
}
const paths = async (res: Response) => ((await res.json()) as { error: { details: { path: string }[] } }).error.details.map((d) => d.path);

describe('MRN (gate entry)', () => {
  it('auto-punch stamps the server time (India) and numbers per FY; the vehicle number is normalised', async () => {
    const { call } = await admin();
    const res = await call('POST', '/mrns', { ...gate, date: '2020-01-01', time: '01:00' });
    expect(res.status).toBe(201);
    const m = await res.json();
    // T0 = 2026-10-01 09:00 UTC = 14:30 IST. Fixtures used MRN/26-27/0001..0005.
    expect(m).toMatchObject({ mrnNo: 'MRN/26-27/0006', fy: '2026-27', date: '2026-10-01', time: '14:30', vehicleNo: 'GJ03AB1234', status: 'pending_grn', daysPending: 0 });
    expect(m.items[0].id).toBeTruthy();
    const log = await (await call('GET', '/audit')).json();
    expect(log.rows[0].details).toContain('Gate entry MRN/26-27/0006');
  });

  it('without auto-punch the date and time are required, and the FY of the date picks the series', async () => {
    const { call, settings } = await admin();
    await settings({ autoPunchMrn: false });
    const bad = await call('POST', '/mrns', gate);
    expect(bad.status).toBe(422);
    expect((await paths(bad)).sort()).toEqual(['date', 'time']);
    const m = await (await call('POST', '/mrns', { ...gate, date: '2027-04-02', time: '08:05' })).json();
    expect(m).toMatchObject({ mrnNo: 'MRN/27-28/0001', fy: '2027-28', date: '2027-04-02', time: '08:05' });
  });

  it('a picked vendor takes its directory name; an unknown one is rejected; items are required', async () => {
    const { t, call } = await admin();
    const v = (await t.data.repos.vendors.listAll())[0]!;
    const m = await (await call('POST', '/mrns', { ...gate, vendorId: v.id, vendorName: 'whatever' })).json();
    expect(m).toMatchObject({ vendorId: v.id, vendorName: v.name });
    const unknown = await call('POST', '/mrns', { ...gate, vendorId: 'nope' });
    expect(await paths(unknown)).toEqual(['vendorId']);
    expect((await call('POST', '/mrns', { ...gate, items: [] })).status).toBe(422);
  });

  it('can be edited or deleted only while it waits for a GRN; edits keep line ids', async () => {
    const { call } = await admin();
    const edited = await (
      await call('PATCH', '/mrns/mrn-open', { remarks: 'Seal intact', items: [{ id: 'mrn-open-1', material: 'nilgiri', approxQty: 12500, unit: 'Kg' }] })
    ).json();
    expect(edited).toMatchObject({ remarks: 'Seal intact', date: '2026-09-28', items: [{ id: 'mrn-open-1', approxQty: 12500 }] });
    expect(edited.items).toHaveLength(1);
    expect((await call('PATCH', '/mrns/mrn-draft', { remarks: 'x' })).status).toBe(409);
    expect((await call('DELETE', '/mrns/mrn-draft')).status).toBe(409);
    expect((await call('DELETE', '/mrns/mrn-open')).status).toBe(204);
    expect((await call('GET', '/mrns/mrn-open')).status).toBe(404);
  });

  it('register filters by material, status and dates', async () => {
    const { call } = await admin();
    await call('POST', '/mrns', gate);
    const list = async (qs: string) => ((await (await call('GET', `/mrns?${qs}`)).json()) as { rows: { id: string }[] }).rows.length;
    expect(await list('material=kraft')).toBe(1);
    expect(await list('status=pending_grn')).toBe(2);
    expect(await list('from=2026-09-21&to=2026-09-30')).toBe(1);
    expect(await list('q=gj03ab')).toBe(1);
  });
});

describe('GRN (receiving)', () => {
  it('lines come from the MRN, the invoice links to the Purchase entry, and the MRN is marked GRN created', async () => {
    const { call } = await admin();
    const res = await call('POST', '/grns', receiveOpen());
    expect(res.status).toBe(201);
    const g = await res.json();
    expect(g).toMatchObject({
      grnNo: 'GRN/26-27/0005',
      mrnNo: 'MRN/26-27/0001',
      vehicleNo: 'GJ01HT0324',
      vendorName: 'TM Nilgiri Supplier',
      status: 'draft',
      worstQuality: 'short',
      purchaseEntryId: 'pe-1',
      purchaseEntry: { lotNo: 'N01' },
    });
    expect(g.items[0]).toMatchObject({ mrnItemId: 'mrn-open-1', material: 'nilgiri', approxQty: 12000, actualQty: 11950 });
    expect(await (await call('GET', '/mrns/mrn-open')).json()).toMatchObject({ status: 'grn_created', grnId: g.id, grnNo: 'GRN/26-27/0005' });
    expect((await call('POST', '/grns', receiveOpen())).status).toBe(409);
  });

  it('an unknown invoice is kept as a manual reference', async () => {
    const { call } = await admin();
    const g = await (await call('POST', '/grns', receiveOpen({ invoiceNo: 'XYZ/9' }))).json();
    expect(g).toMatchObject({ invoiceNo: 'XYZ/9', purchaseEntryId: null, purchaseEntry: null });
    expect(await (await call('GET', '/grns/invoice-link?invoiceNo=INV pe-1')).json()).toEqual({ match: null });
    expect(await (await call('GET', '/grns/invoice-link?invoiceNo=inv-pe-1')).json()).toMatchObject({ match: { entryId: 'pe-1', lotNo: 'N01' } });
  });

  it('checks the lines: unlisted items need a material; lines must belong to the MRN and appear once', async () => {
    const { call } = await admin();
    const extra = await call('POST', '/grns', receiveOpen({ items: [{ mrnItemId: null, actualQty: 10, unit: 'Nos', quality: 'excess' }] }));
    expect(await paths(extra)).toEqual(['items.0.material']);
    const foreign = await call('POST', '/grns', receiveOpen({ items: [{ mrnItemId: 'mrn-draft-1', actualQty: 10, unit: 'Kg', quality: 'ok' }] }));
    expect(await paths(foreign)).toEqual(['items.0.mrnItemId']);
    const twice = await call('POST', '/grns', receiveOpen({ items: [1, 2].map(() => ({ mrnItemId: 'mrn-open-1', actualQty: 10, unit: 'Kg', quality: 'ok' })) }));
    expect(await paths(twice)).toEqual(['items.1.mrnItemId']);
    const ok = await call('POST', '/grns', receiveOpen({ items: [{ material: 'other', actualQty: 4, unit: 'Nos', quality: 'excess' }] }));
    expect((await ok.json()).items[0]).toMatchObject({ mrnItemId: null, material: 'other', approxQty: 0 });
  });

  it('without auto-punch, receiving can’t be dated before the gate entry', async () => {
    const { call, settings } = await admin();
    await settings({ autoPunchGrn: false });
    const early = await call('POST', '/grns', receiveOpen({ date: '2026-09-27', time: '10:00' }));
    expect(await paths(early)).toEqual(['date']);
    expect((await call('POST', '/grns', receiveOpen({ date: '2026-09-29', time: '10:00' }))).status).toBe(201);
  });

  it('Draft → Reviewed → Approved, in order; editing a reviewed GRN sends it back to Draft; approved is locked', async () => {
    const { call } = await admin();
    expect((await call('POST', '/grns/grn-draft/approve')).status).toBe(409);
    const reviewed = await (await call('POST', '/grns/grn-draft/review')).json();
    expect(reviewed).toMatchObject({ status: 'reviewed', reviewedByName: 'Admin User' });
    expect((await call('POST', '/grns/grn-draft/review')).status).toBe(409);

    const back = await (await call('PATCH', '/grns/grn-draft', { remarks: 'Recounted' })).json();
    expect(back).toMatchObject({ status: 'draft', reviewedBy: null, remarks: 'Recounted' });

    await call('POST', '/grns/grn-draft/review');
    const approved = await (await call('POST', '/grns/grn-draft/approve')).json();
    expect(approved).toMatchObject({ status: 'approved', approvedByName: 'Admin User' });
    expect((await call('PATCH', '/grns/grn-draft', { remarks: 'x' })).status).toBe(409);
    expect((await call('DELETE', '/grns/grn-draft')).status).toBe(409);
  });

  it('deleting a GRN puts its MRN back to Pending GRN', async () => {
    const { call } = await admin();
    expect((await call('DELETE', '/grns/grn-rev')).status).toBe(204);
    expect(await (await call('GET', '/mrns/mrn-rev')).json()).toMatchObject({ status: 'pending_grn', grnId: null, grnNo: null });
  });
});

describe('accounting audit trail', () => {
  it('only approved GRNs can be accounted, once, with a voucher; undo clears it', async () => {
    const { call } = await admin();
    expect((await call('POST', '/grns/grn-rev/account', { voucherNo: 'PV/1' })).status).toBe(409);
    expect((await call('POST', '/grns/grn-appr/account', { voucherNo: ' ' })).status).toBe(422);
    const done = await (await call('POST', '/grns/grn-appr/account', { voucherNo: 'PV/010/26-27' })).json();
    expect(done).toMatchObject({ accounted: true, voucherNo: 'PV/010/26-27', accountedByName: 'Admin User' });
    expect((await call('POST', '/grns/grn-appr/account', { voucherNo: 'PV/011' })).status).toBe(409);
    const undone = await (await call('DELETE', '/grns/grn-appr/account')).json();
    expect(undone).toMatchObject({ accounted: false, voucherNo: null, accountedBy: null, accountedAt: null });
    expect((await call('DELETE', '/grns/grn-appr/account')).status).toBe(409);
  });

  it('report counts approved GRNs; filters narrow the rows only', async () => {
    const { call } = await admin();
    const all = await (await call('GET', '/accounting')).json();
    expect(all.kpis).toEqual({ accounted: 1, pending: 1, pct: 50, awaitingApproval: 2 });
    expect(all.rows.map((r: { id: string }) => r.id).sort()).toEqual(['grn-acct', 'grn-appr']);
    const pending = await (await call('GET', '/accounting?accounted=false')).json();
    expect(pending.rows.map((r: { id: string }) => r.id)).toEqual(['grn-appr']);
    expect(pending.kpis.accounted).toBe(1);
  });
});

describe('dashboard and pending report', () => {
  it('dashboard: today’s counts, what is waiting at each step, recent MRNs and ageing', async () => {
    const { call } = await admin();
    await call('POST', '/mrns', gate);
    const d = await (await call('GET', '/dashboard')).json();
    expect(d.kpis).toEqual({ mrnToday: 1, pendingGrn: 2, grnToday: 0, awaitingReview: 1, awaitingApproval: 1, pendingAccounting: 1 });
    expect(d.recentMrns[0].vendorName).toBe('Typed Vendor');
    expect(d.ageing.map((m: { mrnNo: string; daysPending: number }) => [m.mrnNo, m.daysPending])).toEqual([
      ['MRN/26-27/0001', 3],
      ['MRN/26-27/0006', 0],
    ]);
  });

  it('pending report: one row per MRN line, longest waiting first, with vendor / material / min-days filters', async () => {
    const { call } = await admin();
    await call('POST', '/mrns', gate);
    const all = await (await call('GET', '/reports/pending')).json();
    expect(all.kpis).toEqual({ items: 3, mrns: 2, oldestDays: 3, avgDays: 2 });
    expect(all.rows[0]).toMatchObject({ mrnNo: 'MRN/26-27/0001', daysPending: 3 });
    expect((await (await call('GET', '/reports/pending?minDays=1')).json()).kpis.items).toBe(2);
    expect((await (await call('GET', '/reports/pending?material=kraft')).json()).rows).toHaveLength(1);
    expect((await (await call('GET', '/reports/pending?vendor=nilgiri')).json()).kpis.mrns).toBe(1);
  });

  it('meta previews the next numbers without using them up', async () => {
    const { call } = await admin();
    const m1 = await (await call('GET', '/meta')).json();
    expect(m1).toMatchObject({ nextMrnNo: 'MRN/26-27/0006', nextGrnNo: 'GRN/26-27/0005', currentFy: '2026-27', today: '2026-10-01', settings: { autoPunchMrn: true, autoPunchGrn: true } });
    expect((await (await call('GET', '/meta')).json()).nextMrnNo).toBe('MRN/26-27/0006');
    expect(await (await call('PATCH', '/settings', { autoPunchMrn: false })).json()).toEqual({ autoPunchMrn: false, autoPunchGrn: true });
  });
});

describe('helpers', () => {
  it('worst quality follows the legacy priority', () => {
    expect(worstQuality([{ quality: 'ok' }, { quality: 'excess' }, { quality: 'partial' }])).toBe('partial');
    expect(worstQuality([{ quality: 'short' }, { quality: 'damaged' }])).toBe('damaged');
    expect(worstQuality([])).toBeNull();
  });
});

describe('dev snapshot upgrade (0007)', () => {
  it('grants the Stores keys and adds the auto-punch settings once', () => {
    const seed = buildSeed({ devUsers: false, at: T0.toISOString() });
    const old = structuredClone(seed) as Partial<typeof seed>;
    old.upgrades = old.upgrades!.filter((u) => u.name !== '0007_stores');
    old.settings = old.settings!.filter((s) => !s.key.startsWith('stores.'));
    for (const r of old.rolePermissions!) {
      r.permissions.pages = r.permissions.pages.filter((p) => !p.startsWith('stores_'));
      r.permissions.actions = r.permissions.actions.filter((a) => !a.startsWith('stores_'));
    }
    const up = upgradeSnapshot(old, seed, T0.toISOString());
    const perms = (role: string) => up.rolePermissions!.find((r) => r.role === role)!.permissions;
    expect(perms('admin').actions).toEqual(expect.arrayContaining(['stores_review', 'stores_approve', 'stores_account']));
    expect(perms('management').pages.filter((p) => p.startsWith('stores_'))).toEqual(['stores_dashboard', 'stores_reports']);
    expect(perms('dispatch').pages.some((p) => p.startsWith('stores_'))).toBe(false);
    expect(up.settings!.filter((s) => s.key.startsWith('stores.'))).toHaveLength(2);
    expect(upgradeSnapshot(up, seed, T0.toISOString()).settings).toHaveLength(up.settings!.length);
  });
});
