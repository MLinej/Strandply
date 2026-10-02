import { describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers';

const DASH = '/api/sampletrack/dashboard';

// Fixtures: 1 dispatch (DSP-0001, Pending, dated 2026-09-30), 2 Pending requests, 2 parties, 2 couriers.

describe('dashboard', () => {
  it('superadmin/admin: all six widgets, both recent panels and the charts', async () => {
    const t = await makeTestApp();
    const d = await (await t.request('GET', DASH, { cookie: await t.login('admin') })).json();
    expect(d.full).toBe(true);
    expect(d.widgets).toEqual({ total: 1, pending: 2, delivered: 0, delayed: 0, parties: 2, couriers: 2 });
    expect(d.recentDispatches).toEqual([
      { id: 'd1', dspNo: 'DSP-0001', date: '2026-09-30', partyName: 'Used Party', partyCity: 'Halvad', status: 'Pending' },
    ]);
    expect(d.pendingRequests.map((r: { reqNo: string }) => r.reqNo)).toEqual(['REQ-0001', 'REQ-0002']);
    expect(d.charts.trend.map((p: { month: string; dispatched: number }) => [p.month, p.dispatched])).toEqual([
      ['2026-05', 0],
      ['2026-06', 0],
      ['2026-07', 0],
      ['2026-08', 0],
      ['2026-09', 1],
      ['2026-10', 0],
    ]);
    expect(d.charts.statusDistribution).toEqual([
      { status: 'Pending', count: 3 }, // 1 dispatch + 2 requests
      { status: 'Dispatched', count: 0 },
      { status: 'In Transit', count: 0 },
      { status: 'Delivered', count: 0 },
      { status: 'Delayed', count: 0 },
    ]);
    expect(d.charts.pendingBreakdown).toEqual({ dispatches: 1, requests: 2 });
  });

  it('dispatch role: total/delivered/delayed and recent dispatches only', async () => {
    const t = await makeTestApp();
    const d = await (await t.request('GET', DASH, { cookie: await t.login('dispatch') })).json();
    expect(d.widgets).toEqual({ total: 1, delivered: 0, delayed: 0 });
    expect(d.recentDispatches).toHaveLength(1);
    expect(d).not.toHaveProperty('pendingRequests');
    expect(d).not.toHaveProperty('charts');
  });

  it('marketing role: pending/parties and pending requests only', async () => {
    const t = await makeTestApp();
    const d = await (await t.request('GET', DASH, { cookie: await t.login('marketing') })).json();
    expect(d.widgets).toEqual({ pending: 2, parties: 2 });
    expect(d.pendingRequests).toHaveLength(2);
    expect(d).not.toHaveProperty('recentDispatches');
    expect(d).not.toHaveProperty('charts');
  });

  it('management: all six widgets and both panels, but no charts', async () => {
    const t = await makeTestApp();
    const d = await (await t.request('GET', DASH, { cookie: await t.login('management') })).json();
    expect(Object.keys(d.widgets).sort()).toEqual(['couriers', 'delayed', 'delivered', 'parties', 'pending', 'total']);
    expect(d.full).toBe(false);
    expect(d.recentDispatches).toBeDefined();
    expect(d.pendingRequests).toBeDefined();
    expect(d).not.toHaveProperty('charts');
  });

  it('follows the role matrix: granting dashboard_full adds charts and panels', async () => {
    const t = await makeTestApp();
    await t.request('PUT', '/api/sampletrack/role-permissions/dispatch', {
      cookie: await t.login('superadmin'),
      body: { pages: ['dashboard'], actions: ['dashboard_full'], widgets: [] },
    });
    const d = await (await t.request('GET', DASH, { cookie: await t.login('dispatch') })).json();
    expect(d.widgets).toEqual({});
    expect(d.charts).toBeDefined();
    expect(d.recentDispatches).toBeDefined();
    expect(d.pendingRequests).toBeDefined();
  });

  it('reflects status changes: delivered/delayed widgets and the delivered trend month', async () => {
    const t = await makeTestApp();
    const dispatcher = await t.login('dispatch');
    await t.request('POST', '/api/sampletrack/dispatches/d1/status', { cookie: dispatcher, body: { status: 'Delivered' } });
    const d = await (await t.request('GET', DASH, { cookie: await t.login('admin') })).json();
    expect(d.widgets.delivered).toBe(1);
    expect(d.widgets.pending).toBe(1); // r1 became Delivered via the request sync
    // Delivered at 2026-10-01T09:00Z = 1 Oct in India, though dispatched in September.
    expect(d.charts.trend.at(-1)).toMatchObject({ month: '2026-10', dispatched: 0, delivered: 1 });
  });
});
