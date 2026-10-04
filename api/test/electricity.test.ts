import { describe, expect, it } from 'vitest';
import { pfBand, shiftOfTime } from '../src/contracts/electricity';
import { buildSeed } from '../src/seed';
import { upgradeSnapshot } from '../src/seed/upgrades';
import { makeTestApp, T0 } from './helpers';

const EL = '/api/electricity';
// Fixed charge ₹6,38,675 a month: a day is 21,28,916.67 paise, half a day 10,64,458.
const DAY_FIXED = 2_128_917;
const SHIFT_FIXED = 1_064_458;

async function as(role = 'admin') {
  const t = await makeTestApp();
  const cookie = await t.login(role);
  const call = (method: string, path: string, body?: unknown) => t.request(method, `${EL}${path}`, { cookie, body });
  const json = async (method: string, path: string, body?: unknown) => (await call(method, path, body)).json();
  return { t, cookie, call, json };
}
const paths = async (res: Response) => ((await res.json()) as { error: { details: { path: string }[] } }).error.details.map((d) => d.path);
const file = (bytes: number[], name: string) => {
  const f = new FormData();
  f.append('file', new File([new Uint8Array(bytes)], name, { type: 'application/pdf' }));
  return f;
};

describe('rules', () => {
  it('shifts split at noon; PF bands at 0.95 and 0.85', () => {
    expect([shiftOfTime('00:00'), shiftOfTime('11:59'), shiftOfTime('12:00')]).toEqual(['AM', 'AM', 'PM']);
    expect([pfBand(0.95), pfBand(0.9), pfBand(0.849)]).toEqual(['incentive', 'normal', 'penalty']);
  });
});

describe('readings', () => {
  it('each reading shows what it added since the previous one (any shift), × the MF and rates on its date', async () => {
    const { json } = await as();
    const { rows, total } = await json('GET', '/readings');
    expect(total).toBe(7);
    expect(rows[0]).toMatchObject({ id: 'elm-7', prevKwh: 1062, diff: 18, mf: 40, net: 720, energyPaise: 302_400, fuelPaise: 165_600, shiftFixedPaise: SHIFT_FIXED, totalPaise: 302_400 + 165_600 + SHIFT_FIXED });
    expect(rows.at(-1)).toMatchObject({ id: 'elm-1', prevKwh: null, diff: null, net: null, totalPaise: null });
    expect((await json('GET', '/readings?shift=PM&from=2026-09-29')).rows.map((r: { id: string }) => r.id)).toEqual(['elm-7', 'elm-4']);
  });

  it('preview before saving; a reading must fit between its neighbours, match its shift, not be in the future, and be one per time', async () => {
    const { call, json } = await as();
    expect(await json('GET', '/readings/preview?date=2026-10-01&time=06:00&kwh=1100')).toMatchObject({ prev: { date: '2026-09-30', time: '18:00', kwh: 1080 }, diff: 20, mf: 40, net: 800, energyPaise: 336_000, fuelPaise: 184_000, shiftFixedPaise: SHIFT_FIXED, totalPaise: 336_000 + 184_000 + SHIFT_FIXED });
    expect(await paths(await call('POST', '/readings', { date: '2026-10-01', shift: 'AM', time: '06:00', kwh: 1070 }))).toEqual(['kwh']);
    expect(await paths(await call('POST', '/readings', { date: '2026-09-29', shift: 'PM', time: '12:00', kwh: 1050 }))).toEqual(['kwh']);
    expect(await paths(await call('POST', '/readings', { date: '2026-10-01', shift: 'AM', time: '13:00', kwh: 1100 }))).toEqual(['time']);
    expect(await paths(await call('POST', '/readings', { date: '2026-10-02', shift: 'AM', time: '06:00', kwh: 1100 }))).toEqual(['date']);
    expect(await paths(await call('POST', '/readings', { date: '2026-10-01', shift: 'AM', time: '06:00', kwh: 1100, pf: 1.2 }))).toEqual(['pf']);
    expect((await call('POST', '/readings', { date: '2026-09-28', shift: 'AM', time: '06:00', kwh: 1000 })).status).toBe(409);
    const r = await json('POST', '/readings', { date: '2026-09-29', shift: 'PM', time: '12:00', kwh: 1040, pf: '', remarks: '' });
    expect(r).toMatchObject({ at: '2026-09-29T12:00', pf: null, remarks: null });
  });
});

describe('views', () => {
  it('daily rows: last AM and PM readings, each shift from the reading before it started; totals as the legacy views', async () => {
    const { json } = await as('management');
    const { rows, totals } = await json('GET', '/daily?from=2026-09-01&to=2026-09-30');
    expect(rows.map((r: { date: string; amDiff: number | null; pmDiff: number | null; net: number; mf: number; pf: number | null }) => [r.date, r.amDiff, r.pmDiff, r.net, r.mf, r.pf])).toEqual([
      ['2026-09-28', null, 10, 300, 30, null],
      ['2026-09-29', 20, 15, 1050, 30, 0.96],
      // two AM readings: 1062 − 1045 (the reading before the shift), not 1062 − 1060
      ['2026-09-30', 17, 18, 1400, 40, 0.84],
    ]);
    expect(rows[2]).toMatchObject({ am: { time: '10:00', kwh: 1062 }, energyPaise: 588_000, fuelPaise: 322_000, fixedPaise: DAY_FIXED, totalPaise: 588_000 + 322_000 + DAY_FIXED });
    expect(totals).toEqual({
      days: 3, amReadings: 3, pmReadings: 3, amDiff: 37, pmDiff: 43, raw: 80, amNet: 1280, pmNet: 1470, net: 2750, avgPf: 0.9,
      energyPaise: 1_155_000, fuelPaise: 632_500, fixedPaise: 3 * DAY_FIXED, totalPaise: 1_155_000 + 632_500 + 3 * DAY_FIXED, avgDailyNet: 917,
    });
    expect((await json('GET', '/dashboard?from=2026-09-01')).months).toEqual([expect.objectContaining({ month: '2026-09', net: 2750, days: 3 })]);
  });

  it('meta: meter, rates in force today, and the status strip once readings come in', async () => {
    const { json } = await as();
    const m = await json('GET', '/meta');
    expect(m).toMatchObject({ today: '2026-10-01', rates: { mf: 40, fixedPaise: 63_867_500, energyPaise: 420, fuelPaise: 230 }, meter: { billingCycle: 'Monthly' }, status: { am: null, pm: null, diff: null, costPaise: null } });
    await json('POST', '/readings', { date: '2026-10-01', shift: 'AM', time: '06:00', kwh: 1100 });
    await json('POST', '/readings', { date: '2026-10-01', shift: 'PM', time: '13:00', kwh: 1110, pf: 0.97 });
    expect((await json('GET', '/meta')).status).toEqual({ date: '2026-10-01', am: { time: '06:00', kwh: 1100 }, pm: { time: '13:00', kwh: 1110 }, diff: 10, net: 400, costPaise: 168_000 + 92_000 + DAY_FIXED, pf: 0.97 });
  });
});

describe('rates and meter', () => {
  it('one entry per kind and date; each history keeps one; removing an MF re-costs past days', async () => {
    const { call, json } = await as();
    expect((await call('POST', '/rates', { kind: 'mf', value: 35, effectiveFrom: '2026-09-30' })).status).toBe(409);
    expect(await paths(await call('POST', '/rates', { kind: 'energy', value: 4.2, effectiveFrom: '2026-10-01' }))).toEqual(['value']);
    expect(await paths(await call('POST', '/rates', { kind: 'mf', value: 0, effectiveFrom: '2026-10-01' }))).toEqual(['value']);
    expect((await call('POST', '/rates', { kind: 'fuel', value: 0, effectiveFrom: '2026-10-01' })).status).toBe(201);
    expect((await call('DELETE', '/rates/elr-energy')).status).toBe(409);
    expect((await call('DELETE', '/rates/elr-mf2')).status).toBe(204);
    expect((await json('GET', '/daily?from=2026-09-30')).rows[0]).toMatchObject({ mf: 30, net: 1050 });
    expect((await json('GET', '/settings')).rates.filter((r: { kind: string }) => r.kind === 'fuel').map((r: { value: number }) => r.value)).toEqual([0, 230]);
  });

  it('meter details are a setting; changes are logged', async () => {
    const { json } = await as();
    expect(await json('PATCH', '/settings/meter', { meterNo: 'HT-1001', sanctionedLoadKva: '2500', tariff: 'HTP-I' })).toMatchObject({ meterNo: 'HT-1001', sanctionedLoadKva: 2500, billingCycle: 'Monthly' });
    expect((await json('GET', '/meta')).meter.tariff).toBe('HTP-I');
    expect((await json('GET', '/audit')).rows[0]).toMatchObject({ details: 'Meter details: meterNo, sanctionedLoadKva, tariff' });
  });
});

describe('bills', () => {
  it('views: differences from the previous bill × the MF on the bill date, and the readings estimate for the period', async () => {
    const { json } = await as('management');
    const { rows, summary } = await json('GET', '/bills');
    expect(rows.map((b: { id: string }) => b.id)).toEqual(['elb-2', 'elb-1']);
    expect(rows[0]).toMatchObject({ mf: 40, kwhDiff: 180, kwhNet: 7200, kvarhDiff: 50, kvarhNet: 2000, periodFrom: '2026-09-01', estimateNet: 2750, estimatePaise: 1_155_000 + 632_500 + 3 * DAY_FIXED, invoice: null });
    expect(rows[1]).toMatchObject({ mf: 30, kwhDiff: null, periodFrom: null, estimatePaise: null });
    expect(summary).toEqual({ count: 2, lastPaise: 60_000_000, avgPaise: 55_000_000, fyPaise: 110_000_000, avgPf: 0.95 });
  });

  it('bill date, kWh reading and total are required; one bill per date; a charges patch keeps the others', async () => {
    const { call, json } = await as();
    expect(await paths(await call('POST', '/bills', { billDate: '', totalPayablePaise: 0 }))).toEqual(['billDate', 'kwhReading', 'totalPayablePaise']);
    expect((await call('POST', '/bills', { billDate: '2026-09-30', kwhReading: 1100, totalPayablePaise: 1 })).status).toBe(409);
    const b = await json('PATCH', '/bills/elb-2', { charges: { energy: 500_000 }, paidDate: '2026-10-01' });
    expect(b.charges).toMatchObject({ demand: 100_000, energy: 500_000, tcs: null });
    expect((await json('GET', '/audit')).rows[0].details).toBe('PGVCL bill 2026-09-30 paid on 2026-10-01');
  });

  it('invoice PDF: attach (PDFs only), download, remove', async () => {
    const { t, cookie, call, json } = await as();
    const up = (f: FormData) => t.request('POST', `${EL}/bills/elb-2/invoice`, { cookie, form: f });
    expect((await up(file([0x89, 0x50, 0x4e, 0x47], 'invoice.pdf'))).status).toBe(422);
    expect((await up(file([0x25, 0x50, 0x44, 0x46], 'invoice.png'))).status).toBe(422);
    expect((await (await up(file([0x25, 0x50, 0x44, 0x46, 0x2d], 'PGVCL Sept.pdf'))).json()).invoice).toMatchObject({ name: 'PGVCL Sept.pdf', sizeBytes: 5 });
    expect((await json('GET', '/bills/elb-2')).invoice).toEqual({ name: 'PGVCL Sept.pdf', sizeBytes: 5 });
    const got = await call('GET', '/bills/elb-2/invoice');
    expect([got.status, got.headers.get('content-type')]).toEqual([200, 'application/pdf']);
    expect((await json('DELETE', '/bills/elb-2/invoice')).invoice).toBeNull();
    expect((await call('GET', '/bills/elb-2/invoice')).status).toBe(404);
  });
});

describe('seed and upgrade', () => {
  it('the legacy default rates and the meter setting everywhere; demo readings and bills in dev', () => {
    const prod = buildSeed({ devUsers: false, at: T0.toISOString() });
    expect(prod.elRates.map((r) => [r.kind, r.value])).toEqual([['mf', 30], ['fixed', 63_867_500], ['energy', 420], ['fuel', 230]]);
    expect([prod.elReadings.length, prod.elBills.length]).toEqual([0, 0]);
    expect(prod.settings.some((s) => s.key === 'electricity.meter')).toBe(true);
    const dev = buildSeed({ devUsers: true, at: T0.toISOString() });
    expect(dev.elReadings).toHaveLength(28);
    expect(dev.elReadings.every((r, i) => i === 0 || r.kwh > dev.elReadings[i - 1]!.kwh)).toBe(true);
    expect(dev.elBills).toHaveLength(2);
  });

  it('0014 grants the electricity pages and adds the rates and the meter setting once', () => {
    const seed = buildSeed({ devUsers: false, at: T0.toISOString() });
    const old = structuredClone(seed) as Partial<typeof seed>;
    old.upgrades = seed.upgrades.filter((u) => u.name !== '0014_electricity');
    for (const r of old.rolePermissions!) r.permissions.pages = r.permissions.pages.filter((p) => !p.startsWith('electricity_'));
    old.settings = old.settings!.filter((s) => !s.key.startsWith('electricity.'));
    delete old.elRates;
    const up = upgradeSnapshot(old, seed, T0.toISOString());
    const pages = (role: string) => up.rolePermissions!.find((r) => r.role === role)!.permissions.pages.filter((p) => p.startsWith('electricity_'));
    expect(pages('admin')).toHaveLength(5);
    expect(pages('management')).toEqual(['electricity_dashboard', 'electricity_reports', 'electricity_bills']);
    expect(up.elRates).toHaveLength(4);
    const again = upgradeSnapshot(up, seed, T0.toISOString());
    expect(again.settings!.filter((s) => s.key === 'electricity.meter')).toHaveLength(1);
  });
});
