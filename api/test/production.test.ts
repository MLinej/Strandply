import { describe, expect, it } from 'vitest';
import { calcCutting, calcHotPress, calcPlan, mattStats, mattStatus, planStatus, sqftOf } from '../src/contracts/production';
import { buildSeed } from '../src/seed';
import { upgradeSnapshot } from '../src/seed/upgrades';
import { makeTestApp, T0 } from './helpers';

const PR = '/api/production';

async function admin() {
  const t = await makeTestApp();
  const cookie = await t.login('admin');
  const call = (method: string, path: string, body?: unknown) => t.request(method, `${PR}${path}`, { cookie, body });
  const json = async (method: string, path: string, body?: unknown) => (await call(method, path, body)).json();
  return { t, call, json };
}
const paths = async (res: Response) => ((await res.json()) as { error: { details: { path: string }[] } }).error.details.map((d) => d.path);
const charge = (pcs: number, load: string | null, unload: string | null) => ({ label: 'Charge', pcs, load, unload, remarks: null });

describe('calculations', () => {
  it('hot press: boards, press time, clock time first load → last unload, spare time; midnight wraps', () => {
    expect(calcHotPress([charge(30, '08:00', '08:40'), charge(30, '08:50', '09:30')])).toMatchObject({ totalBoards: 60, pressMins: 80, totalMins: 90, spareMins: 10, avgPressMins: 40, perCharge: [40, 40] });
    expect(calcHotPress([charge(25, '22:30', '23:10'), charge(25, '23:20', '00:10')])).toMatchObject({ totalBoards: 50, pressMins: 90, totalMins: 100, spareMins: 10 });
    expect(calcHotPress([charge(10, null, null)])).toMatchObject({ totalBoards: 10, pressMins: 0, totalMins: 0 });
  });

  it('plan: sqft from the size, charges at 30 boards each, resin / dry / wet wood requirement', () => {
    expect(sqftOf('8x4')).toBe(32);
    expect(sqftOf('7 × 4')).toBe(28);
    const c = calcPlan([{ product: 'OSB', size: '8x4', thickness: '12', priority: 'High', targetBoards: 61 }], { mattWtKg: 42, matts: null, resinPerMattKg: 4 });
    // Matts default to boards: resin 4 × 61, dry 42 × 61 − 244, wet × 2.5.
    expect(c).toMatchObject({ totalBoards: 61, totalSqft: 1952, totalCharges: 3, resinReqKg: 244, dryWoodReqKg: 2318, wetWoodReqKg: 5795 });
    expect(planStatus(100, 99)).toBe('On plan');
    expect(planStatus(100, 80)).toBe('20% short');
    expect(planStatus(100, null)).toBe('Not linked');
  });

  it('matt weight: pass within the band, warn within twice it, reject beyond; sample std dev', () => {
    expect([42.5, 42.51, 43, 43.01, 40.9].map((w) => mattStatus(w, 42, 0.5))).toEqual(['pass', 'warn', 'warn', 'fail', 'fail']);
    expect(mattStats([42, 44], 42, 0.5)).toMatchObject({ count: 2, avg: 43, min: 42, max: 44, stdDev: 1.414, pass: 1, fail: 1, passRate: 50 });
    expect(calcCutting(60, 57)).toEqual({ rejectPcs: 3, rejectPct: 5 });
  });
});

describe('documents', () => {
  it('hot press: numbered, totals worked out on the server, charges need pcs', async () => {
    const { call, json } = await admin();
    const res = await call('POST', '/hotpress', { date: '2026-09-25', shift: 'Night', product: 'S-OSB', size: '8x4', thickness: '9', charges: [{ pcs: 28, load: '22:30', unload: '23:10' }, { pcs: 28, load: '23:20', unload: '00:10' }] });
    expect(res.status).toBe(201);
    const hp = await res.json();
    expect(hp).toMatchObject({ docNo: 'HP-0002', wfState: 'draft', calc: { totalBoards: 56, totalMins: 100, spareMins: 10 }, charges: [{ label: 'Charge 1' }, { label: 'Charge 2' }] });
    expect(await paths(await call('POST', '/hotpress', { date: '2026-09-25', shift: 'Day', product: 'OSB', size: '8x4', charges: [] }))).toEqual(['charges']);
    expect((await json('GET', '/hotpress/hp-1')).cuttingNo).toBe('BC-0001');
  });

  it('chipping takes the net rate from Purchase (rate − debit-note difference) and can’t over-draw a lot', async () => {
    const { call, json } = await admin();
    const lots = await json('GET', '/lots?material=nilgiri');
    expect(lots[0]).toMatchObject({ lotNo: 'N01', receivedKg: 12730, usedKg: 5000, availKg: 7730, netRatePaise: 750000 });
    const c = await (await call('POST', '/chipping', { date: '2026-09-25', shift: 'Day', lots: [{ purchaseEntryId: 'pe-1', qty: 1000 }] })).json();
    expect(c).toMatchObject({ docNo: 'CHR-0002', totalKg: 1000, totalPaise: 750000, avgRatePaise: 750000, lots: [{ ratePaise: 750000, amountPaise: 750000 }] });
    const over = await call('POST', '/chipping', { date: '2026-09-25', shift: 'Day', lots: [{ purchaseEntryId: 'pe-1', qty: 6731 }] });
    expect(over.status).toBe(409);
    expect((await over.json()).error.message).toContain('Only 6,730 kg left in lot N01');
    expect(await paths(await call('POST', '/chipping', { date: '2026-09-25', shift: 'Day', lots: [{ purchaseEntryId: 'pe-2', qty: 1 }] }))).toEqual(['lots.0.purchaseEntryId']);
    expect(await paths(await call('POST', '/chipping', { date: '2026-09-25', shift: 'Day', lots: [{ purchaseEntryId: 'pe-draft', qty: 1 }] }))).toEqual(['lots.0.purchaseEntryId']);
    // Editing counts the report's own use as free: ch-1 can grow to everything not used by CHR-0002.
    expect((await call('PATCH', '/chipping/ch-1', { lots: [{ purchaseEntryId: 'pe-1', qty: 11730 }] })).status).toBe(200);
    expect((await call('PATCH', '/chipping/ch-1', { lots: [{ purchaseEntryId: 'pe-1', qty: 11731 }] })).status).toBe(409);
  });

  it('resin consumption draws on resin lots at their rate', async () => {
    const { call, json } = await admin();
    const r = await (await call('POST', '/resin', { date: '2026-09-25', shift: 'Day', lot: { purchaseEntryId: 'pe-2', qty: 250.5 } })).json();
    expect(r).toMatchObject({ docNo: 'RC-0002', lot: { lotNo: 'R01', ratePaise: 4000000, amountPaise: 1002000 }, vendorName: 'V.K.Industrioes' });
    expect((await json('GET', '/lots?material=resin'))[0]).toMatchObject({ usedKg: 750.5, availKg: 17499.5 });
  });

  it('board cutting reads the hot press boards live; one cutting report per hot press', async () => {
    const { call, json } = await admin();
    expect(await json('GET', '/cutting/bc-1')).toMatchObject({ hotpressNo: 'HP-0001', product: 'OSB', hpPcs: 60, rejectPcs: 3, rejectPct: 5 });
    const dup = await call('POST', '/cutting', { date: '2026-09-25', shift: 'Day', hotpressId: 'hp-1', cutPcs: 50 });
    expect((await dup.json()).error.message).toContain('BC-0001');
    await call('PATCH', '/hotpress/hp-1', { charges: [{ pcs: 30, load: '08:00', unload: '08:40' }, { pcs: 40, load: '08:50', unload: '09:30' }] });
    expect(await json('GET', '/cutting/bc-1')).toMatchObject({ hpPcs: 70, rejectPcs: 13 });
  });

  it('summary: resin from linked entries, wet wood from WIP at the batch rate, link numbers', async () => {
    const { call, json } = await admin();
    const s = await json('GET', '/summaries/ps-1');
    expect(s).toMatchObject({ boardRejPct: 5, resinKg: 500, resinPaise: 2000000, wetWoodKg: 2000, wetWoodPaise: 1500000, wetWoodRatePaise: 750000 });
    expect(s.links).toEqual({ hotpressNo: 'HP-0001', mattNo: 'MWB-0001', resinNos: ['RC-0001'], cuttingNo: 'BC-0001', planNo: 'PPR-0001', wipNos: ['WIP-0001'] });
    const typed = await (await call('POST', '/summaries', { date: '2026-09-25', product: 'OSB', size: '8x4', resinKg: 12, resinPaise: 48000 })).json();
    expect(typed).toMatchObject({ docNo: 'PS-0002', resinKg: 12, resinPaise: 48000, wetWoodKg: 0 });
    const linked = await (await call('PATCH', `/summaries/${typed.id}`, { resinIds: ['rc-1'], resinKg: 1 })).json();
    expect(linked).toMatchObject({ resinKg: 500, resinPaise: 2000000 });
    expect(await paths(await call('POST', '/summaries', { date: '2026-09-25', product: 'OSB', size: '8x4', wip: [{ wipId: 'wip-1', qty: 1 }, { wipId: 'wip-1', qty: 2 }] }))).toEqual(['wip.1.wipId']);
  });

  it('plan vs actual against the linked hot press, cutting and matt batch', async () => {
    const { json } = await admin();
    const p = await json('GET', '/plans/pp-1');
    expect(p.calc).toMatchObject({ totalBoards: 60, totalCharges: 2, resinReqKg: 240, dryWoodReqKg: 2280, wetWoodReqKg: 5700 });
    const rows = await json('GET', '/plans/pp-1/compare');
    expect(rows.map((r: { metric: string; actual: number | null; status: string }) => [r.metric, r.actual, r.status])).toEqual([
      ['Boards pressed', 60, 'On plan'],
      ['Press charges', 2, 'On plan'],
      ['Boards cut', 57, '5% short'],
      ['Board rejects', 3, 'OK'],
      ['Matts', 3, '95% short'],
      ['Average matt weight (kg)', 42.267, 'On plan'],
    ]);
    const s = await json('GET', '/summaries/ps-1/compare');
    expect(s[0]).toMatchObject({ metric: 'Boards produced', plan: 60, actual: 57, status: '5% short' });
  });
});

describe('review and approval', () => {
  it('draft → sent → reviewed → approved, in order; return and reject go back to draft with the note', async () => {
    const { call, json } = await admin();
    expect((await call('POST', '/hotpress/hp-1/approve', { decision: 'approve' })).status).toBe(409);
    expect((await json('POST', '/hotpress/hp-1/send', { note: 'Shift A' })).wfState).toBe('review');
    const back = await json('POST', '/hotpress/hp-1/review', { decision: 'return', note: 'Charge 2 time wrong' });
    expect(back).toMatchObject({ wfState: 'draft', wfTrail: [{ action: 'send', note: 'Shift A' }, { action: 'return', note: 'Charge 2 time wrong', byName: 'Admin User' }] });
    await call('POST', '/hotpress/hp-1/send');
    await call('POST', '/hotpress/hp-1/review', { decision: 'review' });
    // Editing a reviewed document sends it back to draft.
    const edited = await json('PATCH', '/hotpress/hp-1', { remarks: 'Corrected' });
    expect(edited.wfState).toBe('draft');
    expect(edited.wfTrail.at(-1)).toMatchObject({ action: 'edit' });
    await call('POST', '/hotpress/hp-1/send');
    await call('POST', '/hotpress/hp-1/review', { decision: 'review' });
    expect((await json('POST', '/hotpress/hp-1/approve', { decision: 'approve' })).wfState).toBe('approved');
    expect((await call('PATCH', '/hotpress/hp-1', { remarks: 'x' })).status).toBe(409);
  });

  it('approved documents are locked; referenced documents can’t be deleted', async () => {
    const { call } = await admin();
    expect((await call('DELETE', '/mdo/mdo-1')).status).toBe(409);
    const used = await call('DELETE', '/hotpress/hp-1');
    expect((await used.json()).error.message).toBe('HP-0001 is used by BC-0001, PS-0001, PPR-0001 and can’t be deleted');
    expect((await call('DELETE', '/summaries/ps-1')).status).toBe(204);
    expect((await call('DELETE', '/resin/rc-1')).status).toBe(204);
  });

  it('a closed financial year is read-only until reopened', async () => {
    const { call } = await admin();
    expect((await call('POST', '/fy/2026-27/close')).status).toBe(200);
    const blocked = await call('POST', '/hotpress', { date: '2026-09-25', shift: 'Day', product: 'OSB', size: '8x4', charges: [{ pcs: 1 }] });
    expect((await blocked.json()).error.code).toBe('fy_closed');
    expect((await call('PATCH', '/plans/pp-1', { remarks: 'x' })).status).toBe(409);
    expect((await call('POST', '/matt/mb-1/weights', { weight: 42 })).status).toBe(409);
    expect((await call('POST', '/fy/2026-27/reopen')).status).toBe(200);
    expect((await call('PATCH', '/plans/pp-1', { remarks: 'x' })).status).toBe(200);
  });
});

describe('matt weight', () => {
  it('punching adds numbered matts and live stats; corrections keep numbers; closed batches take no more', async () => {
    const { call, json } = await admin();
    const p = await json('POST', '/matt/mb-1/weights', { weight: 42.3 });
    expect(p.weights.at(-1)).toMatchObject({ n: 4, weight: 42.3 });
    expect(p.stats).toMatchObject({ count: 4, pass: 2, warn: 1, fail: 1, passRate: 50 });
    const del = await json('DELETE', '/matt/mb-1/weights/3');
    expect(del.weights.map((w: { n: number }) => w.n)).toEqual([1, 2, 4]);
    expect((await json('POST', '/matt/mb-1/weights', { weight: 42 })).weights.at(-1).n).toBe(5);
    expect((await json('PATCH', '/matt/mb-1/weights/2', { weight: 42 })).stats.warn).toBe(0);
    // A wider band re-grades every weight.
    expect((await json('PATCH', '/matt/mb-1', { band: 2 })).stats.passRate).toBe(100);
    await call('POST', '/matt/mb-1/close');
    expect((await call('POST', '/matt/mb-1/weights', { weight: 42 })).status).toBe(409);
  });
});

describe('WIP Nilgiri', () => {
  it('balance = chipped − used in summaries ± adjustments; the ledger runs per batch and may go negative', async () => {
    const { call, json } = await admin();
    expect((await json('GET', '/wip'))[0]).toMatchObject({ docNo: 'WIP-0001', chippingNo: 'CHR-0001', totalKg: 5000, usedKg: 2000, availKg: 3000, avgRatePaise: 750000, status: 'partly used' });
    await call('POST', '/wip/wip-1/adjust', { qty: -50, reason: 'Moisture loss' });
    const ledger = await json('GET', '/wip/ledger?wipId=wip-1');
    expect(ledger.map((r: { type: string; qty: number; refType: string; balance: number }) => [r.type, r.qty, r.refType, r.balance])).toEqual([
      ['IN', 5000, 'Chipping', 5000],
      ['OUT', 2000, 'Production summary', 3000],
      ['OUT', 50, 'Adjustment', 2950],
    ]);
    await call('POST', '/summaries', { date: '2026-10-01', product: 'OSB', size: '8x4', wip: [{ wipId: 'wip-1', qty: 4000 }] });
    expect((await json('GET', '/wip'))[0]).toMatchObject({ availKg: -1050, status: 'negative' });
    expect((await call('POST', '/wip', { chippingId: 'ch-1' })).status).toBe(409);
    const chip = await json('POST', '/chipping', { date: '2026-09-25', shift: 'Day', lots: [{ purchaseEntryId: 'pe-1', qty: 100 }] });
    const w = await (await call('POST', '/wip', { chippingId: chip.id })).json();
    expect(w).toMatchObject({ docNo: 'WIP-0002', totalKg: 100, status: 'available' });
    expect((await call('DELETE', `/wip/${w.id}`)).status).toBe(204);
  });
});

describe('dashboard and settings', () => {
  it('dashboard counts, reject rate, boards by product, documents waiting', async () => {
    const { json, call } = await admin();
    await call('POST', '/hotpress/hp-1/send');
    const d = await json('GET', '/dashboard?fy=2026-27');
    expect(d.kpis).toEqual({ hotpress: 1, boardsPressed: 60, summaries: 1, chipping: 1, rejectPcs: 3, cutPcs: 57, rejectPct: 5 });
    expect(d.byProduct).toEqual([{ label: 'OSB', value: 60 }]);
    expect(d.awaiting).toEqual({ review: 1, approval: 0 });
    expect(d.nilgiriLots[0]).toMatchObject({ lotNo: 'N01', availKg: 7730 });
  });

  it('settings: thickness and size masters, sorted and de-duplicated', async () => {
    const { json } = await admin();
    const s = await json('PATCH', '/settings', { thicknesses: ['12', '9', '12.0', '26'], boardsPerCharge: 32 });
    expect(s).toMatchObject({ thicknesses: ['9', '12', '26'], boardsPerCharge: 32, sizes: ['8x4', '4x4', '6x4'] });
    expect((await json('GET', '/plans/pp-1')).calc.totalCharges).toBe(2);
  });
});

describe('dev snapshot upgrade (0009)', () => {
  it('grants the Production keys and adds the settings once', () => {
    const seed = buildSeed({ devUsers: false, at: T0.toISOString() });
    const old = structuredClone(seed) as Partial<typeof seed>;
    old.upgrades = old.upgrades!.filter((u) => u.name !== '0009_production');
    old.settings = old.settings!.filter((s) => !s.key.startsWith('production.'));
    for (const r of old.rolePermissions!) {
      r.permissions.pages = r.permissions.pages.filter((p) => !p.startsWith('production_'));
      r.permissions.actions = r.permissions.actions.filter((a) => !a.startsWith('production_'));
    }
    const up = upgradeSnapshot(old, seed, T0.toISOString());
    expect(up.rolePermissions!.find((r) => r.role === 'admin')!.permissions.actions).toEqual(expect.arrayContaining(['production_review', 'production_approve']));
    expect(up.rolePermissions!.find((r) => r.role === 'management')!.permissions.pages.filter((p) => p.startsWith('production_'))).toEqual(['production_dashboard']);
    expect(up.settings!.filter((s) => s.key.startsWith('production.'))).toHaveLength(5);
    expect(upgradeSnapshot(up, seed, T0.toISOString()).settings).toHaveLength(up.settings!.length);
  });
});
