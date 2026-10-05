import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/lib/crypto';
import { makeTestApp, passwordFor, sessionCookieFrom, testClock } from './helpers';

const HOUR = 3_600_000;

describe('ERP sign-in and sessions', () => {
  it('signs in, sets an httpOnly SameSite=Lax cookie, and /me returns the effective permissions', async () => {
    const t = await makeTestApp();
    const res = await t.request('POST', '/api/auth/login', { body: { username: 'dispatch', password: passwordFor('dispatch') } });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const me = await (await t.request('GET', '/api/me', { cookie: sessionCookieFrom(res)! })).json();
    expect(me).toMatchObject({
      role: 'dispatch',
      roleLabel: 'Dispatch Dept',
      isSuperadmin: false,
      permissions: {
        pages: ['dashboard', 'dispatch', 'tracking', 'couriers', 'notifications', 'transport_dashboard', 'transport_freight'],
        actions: ['edit', 'print'],
        widgets: ['total', 'delivered', 'delayed'],
      },
      can: { edit: true, delete: false, print: true, export: false, dashboardFull: false },
    });
    expect(me.user.username).toBe('dispatch');
  });

  it('management gets all six widgets and no charts', async () => {
    const t = await makeTestApp();
    const me = await (await t.request('GET', '/api/me', { cookie: await t.login('management') })).json();
    expect(me.permissions.widgets).toEqual(['total', 'pending', 'delivered', 'delayed', 'parties', 'couriers']);
    expect(me.permissions.actions).toEqual(['print', 'export']);
    expect(me.can.dashboardFull).toBe(false);
  });

  it('gives the same 401 for an unknown user and a wrong password, and logs both', async () => {
    const t = await makeTestApp();
    const a = await t.request('POST', '/api/auth/login', { body: { username: 'ghost', password: 'whatever-123' } });
    const b = await t.request('POST', '/api/auth/login', { body: { username: 'admin', password: 'wrong-password' } });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect((await a.json()).error).toEqual((await b.json()).error);
    const log = await t.data.repos.activity.list({ filters: { action: 'LoginFailed' } });
    expect(log.total).toBe(2);
  });

  it('usernames are case-insensitive at sign-in', async () => {
    const t = await makeTestApp();
    await expect(t.login('ADMIN', passwordFor('admin'))).resolves.toBeTruthy();
  });

  it('logout ends the session', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    expect((await t.request('POST', '/api/auth/logout', { cookie })).status).toBe(204);
    expect((await t.request('GET', '/api/me', { cookie })).status).toBe(401);
  });

  it('a session expires after the idle window, and activity keeps it alive', async () => {
    const clock = testClock();
    const t = await makeTestApp({ clock });
    const cookie = await t.login('admin');
    clock.advance(11 * HOUR);
    expect((await t.request('GET', '/api/me', { cookie })).status).toBe(200); // refreshes lastSeenAt
    clock.advance(11 * HOUR);
    expect((await t.request('GET', '/api/me', { cookie })).status).toBe(200);
    clock.advance(12 * HOUR);
    expect((await t.request('GET', '/api/me', { cookie })).status).toBe(401);
  });

  it('a session dies at the absolute limit even if active', async () => {
    const clock = testClock();
    const t = await makeTestApp({ clock });
    const cookie = await t.login('admin');
    for (let i = 0; i < 16; i++) {
      clock.advance(11 * HOUR);
      await t.request('GET', '/api/me', { cookie });
    }
    // 176 h > 168 h (7 days)
    expect((await t.request('GET', '/api/me', { cookie })).status).toBe(401);
  });

  it('a forged or unknown cookie is anonymous', async () => {
    const t = await makeTestApp();
    expect((await t.request('GET', '/api/me', { cookie: 'sid=forged' })).status).toBe(401);
  });

  it('only the token hash is stored', async () => {
    const t = await makeTestApp();
    const token = (await t.login('admin')).slice('sid='.length);
    expect(await t.data.repos.sessions.getByTokenHash(token)).toBeNull();
    const session = await t.data.repos.sessions.getByTokenHash(await sha256Hex(token));
    expect(session).toMatchObject({ userId: 'u-admin' });
    expect(JSON.stringify(session)).not.toContain(token);
  });

  it('mutations need the X-Requested-With header (CSRF guard)', async () => {
    const t = await makeTestApp();
    const res = await t.request('POST', '/api/auth/login', {
      body: { username: 'admin', password: passwordFor('admin') },
      csrf: false,
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('csrf_header_missing');
  });

  it('unknown endpoints 404 as JSON', async () => {
    const t = await makeTestApp();
    const res = await t.request('GET', '/api/nope');
    expect(res.status).toBe(404);
  });
});

describe('/me ERP permissions for the web shell', () => {
  it('admins get *, others get module/page strings from their role', async () => {
    const t = await makeTestApp();
    const me = async (role: string) => (await (await t.request('GET', '/api/me', { cookie: await t.login(role) })).json()).erp;
    expect(await me('admin')).toEqual({ permissions: ['*'], firms: ['llp', 'osb'] });
    expect((await me('dispatch')).permissions).toEqual([
      'notifications.view',
      'samples.couriers',
      'samples.dashboard',
      'samples.dispatch',
      'samples.tracking',
      'samples.view',
      'transport.dashboard',
      'transport.freight',
      'transport.view',
    ]);
    expect((await me('management')).permissions).toEqual([
      'complaints.dashboard',
      'complaints.register',
      'complaints.reports',
      'complaints.view',
      'crm.dashboard',
      'crm.reports',
      'crm.view',
      'dwpas.dashboard',
      'dwpas.plans',
      'dwpas.reports',
      'dwpas.view',
      'electricity.bills',
      'electricity.dashboard',
      'electricity.reports',
      'electricity.view',
      'maintenance.dashboard',
      'maintenance.reports',
      'maintenance.view',
      'notifications.view',
      'production.dashboard',
      'production.view',
      'purchase.dashboard',
      'purchase.inventory',
      'purchase.view',
      'reports.dashboard',
      'reports.modules',
      'reports.periodic',
      'reports.view',
      'sales.dashboard',
      'sales.reports',
      'sales.view',
      'samples.dashboard',
      'samples.reports',
      'samples.view',
      'stock.dashboard',
      'stock.ledger',
      'stock.view',
      'stores.dashboard',
      'stores.reports',
      'stores.view',
      'transport.dashboard',
      'transport.reports',
      'transport.view',
      'vendors.directory',
      'vendors.reports',
      'vendors.view',
    ]);
  });
});
