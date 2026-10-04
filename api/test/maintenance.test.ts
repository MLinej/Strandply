import { describe, expect, it } from 'vitest';
import { isOverdue } from '../src/contracts/maintenance';
import { buildSeed } from '../src/seed';
import { upgradeSnapshot } from '../src/seed/upgrades';
import { makeTestApp, T0 } from './helpers';

const MT = '/api/maintenance';

async function as(role = 'admin') {
  const t = await makeTestApp();
  const cookie = await t.login(role);
  const call = (method: string, path: string, body?: unknown) => t.request(method, `${MT}${path}`, { cookie, body });
  const json = async (method: string, path: string, body?: unknown) => (await call(method, path, body)).json();
  return { t, cookie, call, json };
}
const paths = async (res: Response) => ((await res.json()) as { error: { details: { path: string }[] } }).error.details.map((d) => d.path);
const ids = (r: { rows: { id: string }[] }) => r.rows.map((x) => x.id);
const timeline = (w: { timeline: { type: string; text: string }[] }) => w.timeline.map((e) => `${e.type}: ${e.text}`);

describe('rules', () => {
  it('overdue: past the due date and not completed', () => {
    expect(isOverdue({ dueDate: '2026-09-30', status: 'Open' }, '2026-10-01')).toBe(true);
    expect(isOverdue({ dueDate: '2026-10-01', status: 'Open' }, '2026-10-01')).toBe(false);
    expect(isOverdue({ dueDate: '2026-09-30', status: 'Completed' }, '2026-10-01')).toBe(false);
  });
});

describe('work orders', () => {
  it('create: WO number per FY, title / assignee / due date required, an active area, and a timeline from the start', async () => {
    const { call, json } = await as();
    expect(await paths(await call('POST', '/work-orders', { title: '', area: 'Press Shop' }))).toEqual(['title', 'assignee', 'dueDate']);
    expect(await paths(await call('POST', '/work-orders', { title: 'X', area: 'Moon Base', assignee: 'Raj', dueDate: '2026-10-03' }))).toEqual(['area']);
    const w = await json('POST', '/work-orders', { title: 'Boiler feed pump seal', area: 'Boiler Room', assignee: 'Raj Kumar', dueDate: '2026-10-03', status: 'In Progress' });
    expect(w).toMatchObject({ woNo: 'WO-26-0005', category: 'Mechanical', priority: 'High', status: 'In Progress', completedOn: null, description: null });
    expect(timeline(w)).toEqual(['created: Work order created.', 'assigned: Assigned to Raj Kumar.', 'status: Status changed to In Progress.']);
    expect(w.timeline[0]).toMatchObject({ byName: 'Admin User' });
  });

  it('edits are logged by what changed; reassigning and status changes get their own entries; a no-op adds nothing', async () => {
    const { json } = await as();
    const w = await json('PATCH', '/work-orders/wo-b', { title: 'Conveyor bearing noise — station 4', priority: 'Critical', assignee: 'Raj Kumar', status: 'Completed' });
    expect(timeline(w).slice(1)).toEqual(['edited: Edited title, priority.', 'assigned: Reassigned from Priya Nair to Raj Kumar.', 'status: Status changed to Completed.']);
    expect(w.completedOn).toBe('2026-10-01');
    expect((await json('PATCH', '/work-orders/wo-b', { title: 'Conveyor bearing noise — station 4' })).timeline).toHaveLength(4);
    expect((await json('PATCH', '/work-orders/wo-b', { status: 'Open' })).completedOn).toBeNull();
  });

  it('status from the detail panel takes an optional note; completing stamps the date, reopening clears it', async () => {
    const { call, json } = await as();
    expect((await call('POST', '/work-orders/wo-a/status', { status: 'Open' })).status).toBe(409);
    const done = await json('POST', '/work-orders/wo-a/status', { status: 'Completed', note: 'Seal replaced' });
    expect(done).toMatchObject({ status: 'Completed', completedOn: '2026-10-01' });
    expect(timeline(done).at(-1)).toBe('status: Status changed to Completed — Seal replaced.');
    expect((await json('POST', '/work-orders/wo-a/status', { status: 'In Progress' })).completedOn).toBeNull();
    const noted = await json('POST', '/work-orders/wo-a/notes', { text: 'Checked again after a week' });
    expect(timeline(noted).at(-1)).toBe('note: Checked again after a week');
    expect(await paths(await call('POST', '/work-orders/wo-a/notes', { text: ' ' }))).toEqual(['text']);
  });

  it('lists filter by status, priority, area, assignee, overdue and raised date; search on number, title, technician', async () => {
    const { json } = await as();
    expect(ids(await json('GET', '/work-orders'))).toEqual(['wo-b', 'wo-a', 'wo-d', 'wo-c']);
    expect(ids(await json('GET', '/work-orders?overdue=true'))).toEqual(['wo-a']);
    expect(ids(await json('GET', '/work-orders?priority=Critical'))).toEqual(['wo-a']);
    expect(ids(await json('GET', '/work-orders?area=Warehouse'))).toEqual(['wo-c']);
    expect(ids(await json('GET', '/work-orders?assignee=Meena%20Das'))).toEqual(['wo-d']);
    expect(ids(await json('GET', '/work-orders?from=2026-09-22&to=2026-09-25'))).toEqual(['wo-a', 'wo-d']);
    expect(ids(await json('GET', '/work-orders?q=priya'))).toEqual(['wo-b']);
    expect(ids(await json('GET', '/work-orders?q=WO-26-0003'))).toEqual(['wo-c']);
  });

  it('delete hides the work order', async () => {
    const { call, json } = await as();
    expect((await call('DELETE', '/work-orders/wo-c')).status).toBe(204);
    expect((await call('GET', '/work-orders/wo-c')).status).toBe(404);
    expect((await json('GET', '/work-orders')).total).toBe(3);
  });
});

describe('areas', () => {
  it('unique names; a rename follows onto work orders; areas in use can only be deactivated; inactive ones are not offered', async () => {
    const { call, json } = await as();
    expect((await call('POST', '/areas', { name: ' press shop ' })).status).toBe(409);
    expect(await json('POST', '/areas', { name: 'CNC Machine Shop' })).toMatchObject({ name: 'CNC Machine Shop', active: true });
    await json('PATCH', '/areas/mta-8', { name: 'Press Shop 1' });
    expect((await json('GET', '/work-orders/wo-a')).area).toBe('Press Shop 1');
    expect((await call('DELETE', '/areas/mta-8')).status).toBe(409);
    await json('PATCH', '/areas/mta-8', { active: false });
    expect((await json('GET', '/meta')).areas).not.toContain('Press Shop 1');
    // existing work orders keep the inactive area; new ones can't use it
    expect((await call('PATCH', '/work-orders/wo-a', { notes: 'x' })).status).toBe(200);
    expect(await paths(await call('POST', '/work-orders', { title: 'X', area: 'Press Shop 1', assignee: 'Raj', dueDate: '2026-10-03' }))).toEqual(['area']);
    expect((await call('DELETE', '/areas/mta-4')).status).toBe(204);
  });
});

describe('dashboard, reports, print', () => {
  it('dashboard counts statuses, open critical and overdue; splits open work by area, category, priority', async () => {
    const { json } = await as();
    const d = await json('GET', '/dashboard');
    expect(d).toMatchObject({ total: 4, open: 1, inProgress: 1, onHold: 1, completed: 1, critical: 1, overdue: 1 });
    expect(d.overdueList.map((w: { id: string }) => w.id)).toEqual(['wo-a']);
    expect(d.byPriority).toEqual([{ name: 'Critical', value: 1 }, { name: 'High', value: 1 }, { name: 'Medium', value: 1 }, { name: 'Low', value: 0 }]);
    expect(d.byArea.map((x: { name: string }) => x.name)).toEqual(['Assembly Line A', 'Press Shop', 'Utility Block']);
    expect(d.recent[0]).toMatchObject({ woNo: 'WO-26-0002' });
  });

  it('reports: raised in the range, completed on time, average days, and splits', async () => {
    const { json } = await as();
    const r = await json('GET', '/reports?from=2026-09-01');
    expect(r).toMatchObject({ raised: 4, completed: 1, onTimeShare: 100, avgDays: 2, openNow: 3, overdueNow: 1 });
    expect(r.byAssignee.find((x: { name: string }) => x.name === 'Arjun Singh')).toEqual({ name: 'Arjun Singh', raised: 1, completed: 1, open: 0, overdue: 0, avgDays: 2 });
    expect(r.byMonth).toEqual([{ name: '2026-09', raised: 4, completed: 1 }]);
    expect((await json('GET', '/reports?from=2026-09-24')).raised).toBe(2);
  });

  it('print carries the company block and is logged', async () => {
    const { json } = await as();
    const p = await json('GET', '/work-orders/wo-a/print');
    expect(p.workOrder.woNo).toBe('WO-26-0001');
    expect(p.company.name).toBeTruthy();
    expect((await json('GET', '/audit')).rows[0]).toMatchObject({ action: 'Print', details: 'Printed WO-26-0001' });
  });
});

describe('seed and upgrade', () => {
  it('the legacy areas everywhere; the legacy demo work orders in dev only', () => {
    const prod = buildSeed({ devUsers: false, at: T0.toISOString() });
    expect(prod.mtAreas.map((a) => a.name)).toEqual(['Assembly Line A', 'Assembly Line B', 'Packaging Unit', 'Boiler Room', 'Warehouse', 'Quality Lab', 'Utility Block', 'Press Shop']);
    expect(prod.mtWorkOrders).toEqual([]);
    const dev = buildSeed({ devUsers: true, at: T0.toISOString() });
    expect(dev.mtWorkOrders).toHaveLength(5);
    expect(dev.mtWorkOrders.every((w) => dev.mtAreas.some((a) => a.name === w.area))).toBe(true);
    expect(dev.counters.find((c) => c.name === 'MT-WO-2026-27')?.lastValue).toBe(5);
  });

  it('0013 grants the maintenance pages and adds the areas once', () => {
    const seed = buildSeed({ devUsers: false, at: T0.toISOString() });
    const old = structuredClone(seed) as Partial<typeof seed>;
    old.upgrades = seed.upgrades.filter((u) => u.name !== '0013_maintenance');
    for (const r of old.rolePermissions!) r.permissions.pages = r.permissions.pages.filter((p) => !p.startsWith('maintenance_'));
    delete old.mtAreas;
    const up = upgradeSnapshot(old, seed, T0.toISOString());
    const pages = (role: string) => up.rolePermissions!.find((r) => r.role === role)!.permissions.pages.filter((p) => p.startsWith('maintenance_'));
    expect(pages('admin')).toEqual(['maintenance_dashboard', 'maintenance_orders', 'maintenance_masters', 'maintenance_reports']);
    expect(pages('management')).toEqual(['maintenance_dashboard', 'maintenance_reports']);
    expect(pages('dispatch')).toEqual([]);
    expect(up.mtAreas).toHaveLength(8);
    expect(upgradeSnapshot(up, seed, T0.toISOString()).mtAreas).toHaveLength(8);
  });
});
