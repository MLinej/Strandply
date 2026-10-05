import { describe, expect, it } from 'vitest';
import { achievementPct, lightOf } from '../src/contracts/dwpas';
import { buildSeed } from '../src/seed';
import { upgradeSnapshot } from '../src/seed/upgrades';
import { makeTestApp, T0 } from './helpers';

const DW = '/api/dwpas';

async function as(role = 'admin') {
  const t = await makeTestApp();
  const cookie = await t.login(role);
  const call = (method: string, path: string, body?: unknown) => t.request(method, `${DW}${path}`, { cookie, body });
  const json = async (method: string, path: string, body?: unknown) => (await call(method, path, body)).json();
  return { t, cookie, call, json };
}
const paths = async (res: Response) => ((await res.json()) as { error: { details: { path: string }[] } }).error.details.map((d) => d.path);
const line = (department: string, work: string, o: object = {}) => ({ department, work, qty: 100, ...o });

describe('rules', () => {
  it('achievement % rounds; 95+ green, 80+ amber, else red', () => {
    expect([achievementPct(1000, 960), achievementPct(3, 2), achievementPct(0, 5), achievementPct(10, null)]).toEqual([96, 67, null, null]);
    expect([lightOf(95), lightOf(94), lightOf(80), lightOf(79)]).toEqual(['green', 'amber', 'amber', 'red']);
  });
});

describe('plans', () => {
  it('one plan per date: saving creates or replaces it; departments from the master give the head; at least one line', async () => {
    const { call, json } = await as();
    expect(await paths(await call('PUT', '/plans', { date: '2026-10-03', lines: [] }))).toEqual(['lines']);
    expect(await paths(await call('PUT', '/plans', { date: '2026-10-03', lines: [line('Moon', 'x'), { department: 'Peeling', work: '' }] }))).toEqual(['lines.1.work']);
    expect(await paths(await call('PUT', '/plans', { date: '2026-10-03', lines: [line('Moon', 'x')] }))).toEqual(['lines.0.department']);
    const p = await json('PUT', '/plans', { date: '2026-10-03', type: 'Extra Shift', preparedBy: 'P K Sinha', lines: [line('Peeling', 'Peel logs', { skilled: 6, unskilled: 8 }), line('Hot Press', 'Press 18 mm', { unit: 'Boards', priority: 'Medium' })] });
    expect(p).toMatchObject({ date: '2026-10-03', type: 'Extra Shift', status: 'Draft', totals: { lines: 2, skilled: 6, unskilled: 8, recorded: 0, highPriority: 1 } });
    expect(p.lines[0]).toMatchObject({ head: 'Rajesh Patel', unit: 'Sheets', priority: 'High', actualQty: null });
    const again = await json('PUT', '/plans', { date: '2026-10-03', lines: [line('Dryer', 'Dry veneer')] });
    expect([again.id, again.lines.length]).toEqual([p.id, 1]);
    expect((await json('GET', '/plans/by-date/2026-10-03')).id).toBe(p.id);
    expect((await call('GET', '/plans/by-date/2026-12-25')).status).toBe(404);
  });

  it('Draft → Submitted → Approved; editing a submitted plan sends it back to draft; approved is fixed until reopened', async () => {
    const { call, json } = await as();
    expect((await call('POST', '/plans/dwp-c/approve', {})).status).toBe(409);
    expect((await json('POST', '/plans/dwp-c/submit')).status).toBe('Submitted');
    expect((await call('POST', '/plans/dwp-c/submit')).status).toBe(409);
    const ok = await json('POST', '/plans/dwp-c/approve', { note: 'Fine' });
    expect(ok.status).toBe('Approved');
    expect(ok.trail.map((s: { action: string }) => s.action)).toEqual(['submitted', 'approved']);
    expect((await call('PUT', '/plans', { date: '2026-10-02', lines: [line('Peeling', 'x')] })).status).toBe(409);
    expect((await call('DELETE', '/plans/dwp-c')).status).toBe(409);
    expect((await json('POST', '/plans/dwp-c/reopen', { note: 'Change of priority' })).status).toBe('Draft');
    const edited = await json('PUT', '/plans', { date: '2026-09-30', lines: [line('Peeling', 'Peel core veneer', { qty: 1300 })] });
    expect(edited.status).toBe('Draft');
    expect((await call('DELETE', '/plans/dwp-c')).status).toBe(204);
  });

  it('a submitted plan reverting to draft logs it; achievement already recorded stays with unchanged lines', async () => {
    const { json } = await as();
    await json('POST', '/plans/dwp-a/reopen', {});
    const p = await json('PUT', '/plans', { date: '2026-09-29', lines: [line('Peeling', 'Peel core veneer', { qty: 1000 }), line('Dryer', 'Dry core veneer, both lines')] });
    expect(p.lines.map((l: { actualQty: number | null }) => l.actualQty)).toEqual([960, null]);
    const b = await json('PUT', '/plans', { date: '2026-09-30', lines: [line('Peeling', 'Peel core veneer')] });
    expect(b.trail.at(-1)).toMatchObject({ action: 'reopened', note: 'Edited after submitting' });
  });

  it('achievement: per line, in order; from the plan’s day onwards; totals and lights follow', async () => {
    const { call, json } = await as();
    expect(await paths(await call('PUT', '/plans/dwp-c/achievement', { lines: [{ actualQty: 500 }] }))).toEqual(['date']);
    expect(await paths(await call('PUT', '/plans/dwp-b/achievement', { lines: [{ actualQty: 1 }] }))).toEqual(['lines']);
    const p = await json('PUT', '/plans/dwp-b/achievement', { lines: [{ actualQty: 1100, actualSkilled: 6, actualUnskilled: 7, reason: 'Two peelers down after lunch' }, { actualQty: '', headRemarks: '' }] });
    expect(p.lines.map((l: { actualQty: number | null; reason: string | null }) => [l.actualQty, l.reason])).toEqual([[1100, 'Two peelers down after lunch'], [null, null]]);
    expect(p.totals).toMatchObject({ recorded: 1, amber: 1, actualSkilled: 6, actualUnskilled: 7 });
    expect(p.trail.at(-1)).toMatchObject({ action: 'achievement', note: '1 of 2 line(s) recorded' });
    expect((await json('GET', '/plans?status=Approved')).rows[0].totals).toMatchObject({ lines: 3, skilled: 14, unskilled: 18, actualSkilled: 13, actualUnskilled: 17, recorded: 3, green: 1, amber: 1, red: 1, highPriority: 2 });
  });
});

describe('masters', () => {
  it('departments: unique, a rename follows onto employees, ones on plans can only be deactivated', async () => {
    const { call, json } = await as();
    expect((await call('POST', '/departments', { name: ' peeling ', head: 'X' })).status).toBe(409);
    expect(await paths(await call('POST', '/departments', { name: 'Packing' }))).toEqual(['head']);
    await json('PATCH', '/departments/dwd-11', { name: 'Stores' });
    expect((await json('GET', '/employees')).find((e: { name: string }) => e.name === 'Sanjay Rao').department).toBe('Stores');
    expect((await call('DELETE', '/departments/dwd-2')).status).toBe(409);
    await json('PATCH', '/departments/dwd-2', { active: false });
    expect((await json('GET', '/meta')).departments.map((d: { name: string }) => d.name)).not.toContain('Peeling');
    expect(await paths(await call('PUT', '/plans', { date: '2026-10-03', lines: [line('Peeling', 'x')] }))).toEqual(['lines.0.department']);
  });

  it('employees: unique names and codes', async () => {
    const { call, json } = await as();
    expect((await call('POST', '/employees', { name: 'rahul' })).status).toBe(409);
    expect((await call('POST', '/employees', { name: 'Asha', code: 'sup001' })).status).toBe(409);
    expect(await json('POST', '/employees', { name: 'Asha', code: 'OP001', department: 'Peeling', type: 'Unskilled' })).toMatchObject({ name: 'Asha', type: 'Unskilled', active: true });
  });
});

describe('dashboard and reports', () => {
  it('dashboard and manpower are for one day (today by default)', async () => {
    const { json } = await as('management');
    expect(await json('GET', '/dashboard')).toEqual({ date: '2026-10-01', plan: null });
    expect((await json('GET', '/dashboard?date=2026-09-29')).plan.totals).toMatchObject({ green: 1, amber: 1, red: 1 });
    const m = await json('GET', '/manpower?date=2026-09-29');
    expect(m.rows.map((r: { department: string; skilled: number; actualSkilled: number }) => [r.department, r.skilled, r.actualSkilled])).toEqual([['Peeling', 6, 6], ['Dryer', 3, 3], ['Hot Press', 5, 4]]);
  });

  it('variance: recorded lines with difference, % and light; departments worst first; lines still pending', async () => {
    const { json } = await as('management');
    const v = await json('GET', '/variance?from=2026-09-01');
    expect(v.rows.map((r: { department: string; diff: number; pct: number; light: string }) => [r.department, r.diff, r.pct, r.light])).toEqual([['Peeling', -40, 96, 'green'], ['Dryer', -150, 85, 'amber'], ['Hot Press', -100, 75, 'red']]);
    expect(v.byDepartment.map((d: { department: string; avgPct: number }) => [d.department, d.avgPct])).toEqual([['Hot Press', 75], ['Dryer', 85], ['Peeling', 96]]);
    expect(v.pending).toBe(2);
    expect((await json('GET', '/variance?department=Dryer')).rows).toHaveLength(1);
  });

  it('print data for the three sheets is logged', async () => {
    const { json } = await as('management');
    const p = await json('GET', '/plans/dwp-a/print?kind=manpower');
    expect(p.plan.date).toBe('2026-09-29');
    expect((await json('GET', '/audit')).rows[0]).toMatchObject({ action: 'Print', details: 'Printed manpower sheet for 2026-09-29' });
  });
});

describe('seed and upgrade', () => {
  it('the legacy departments and employees everywhere; demo plans in dev', () => {
    const prod = buildSeed({ devUsers: false, at: T0.toISOString() });
    expect([prod.dwDepartments.length, prod.dwEmployees.length, prod.dwPlans.length]).toEqual([12, 7, 0]);
    const dev = buildSeed({ devUsers: true, at: T0.toISOString() });
    expect(dev.dwPlans.map((p) => p.status)).toEqual(['Approved', 'Approved', 'Submitted']);
    expect(dev.dwPlans.every((p) => p.lines.every((l) => dev.dwDepartments.some((d) => d.name === l.department)))).toBe(true);
  });

  it('0016 grants the DWPAS pages and dwpas_approve, and adds the masters once', () => {
    const seed = buildSeed({ devUsers: false, at: T0.toISOString() });
    const old = structuredClone(seed) as Partial<typeof seed>;
    old.upgrades = seed.upgrades.filter((u) => u.name !== '0016_dwpas');
    for (const r of old.rolePermissions!) {
      r.permissions.pages = r.permissions.pages.filter((p) => !p.startsWith('dwpas_'));
      r.permissions.actions = r.permissions.actions.filter((a) => a !== 'dwpas_approve');
    }
    delete old.dwDepartments;
    const up = upgradeSnapshot(old, seed, T0.toISOString());
    const perms = (role: string) => up.rolePermissions!.find((r) => r.role === role)!.permissions;
    expect(perms('management').pages.filter((p) => p.startsWith('dwpas_'))).toEqual(['dwpas_dashboard', 'dwpas_plans', 'dwpas_reports']);
    expect(perms('admin').actions).toContain('dwpas_approve');
    expect(perms('management').actions).not.toContain('dwpas_approve');
    expect(up.dwDepartments).toHaveLength(12);
    expect(upgradeSnapshot(up, seed, T0.toISOString()).dwDepartments).toHaveLength(12);
  });
});
