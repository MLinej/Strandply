import { describe, expect, it } from 'vitest';
import { makeTestApp, testClock, type TestApp } from './helpers';

const N = '/api/sampletrack/notifications';
const ST = '/api/sampletrack';

const feed = async (t: TestApp, cookie: string, qs = '') => (await t.request('GET', `${N}${qs}`, { cookie })).json();
const unread = async (t: TestApp, cookie: string) => (await (await t.request('GET', `${N}/unread-count`, { cookie })).json()).count;

/** Raises a request (marketing) and approves it (admin): one info and one success notification. */
async function withEvents(t: TestApp) {
  const mk = await t.login('marketing');
  const admin = await t.login('admin');
  const r = await (
    await t.request('POST', `${ST}/requests`, { cookie: mk, body: { partyId: 'p-free', items: [{ productName: 'OSB', qty: '1' }] } })
  ).json();
  await t.request('POST', `${ST}/requests/${r.id}/approve`, { cookie: admin });
  return { mk, admin, requestId: r.id as string };
}

describe('system events → notifications', () => {
  it('request created/approved and dispatch created/delayed/delivered, with their types', async () => {
    const clock = testClock();
    const t = await makeTestApp({ clock });
    await withEvents(t);
    const dispatcher = await t.login('dispatch');
    for (const status of ['Delayed', 'Delivered']) {
      clock.advance(1000);
      await t.request('POST', `${ST}/dispatches/d1/status`, { cookie: dispatcher, body: { status } });
    }
    clock.advance(1000);
    await t.request('POST', `${ST}/dispatches`, { cookie: dispatcher, body: { partyId: 'p-free', mode: 'Hand Delivery', weightKg: 1 } });

    const all = await feed(t, await t.login('management'));
    expect(all.rows.map((n: { type: string; title: string }) => [n.type, n.title])).toEqual([
      ['info', 'Dispatch Created'],
      ['success', 'Delivered'],
      ['warning', 'Delay Alert'],
      ['success', 'Approved'],
      ['info', 'New Request'],
    ]);
  });
});

describe('per-user read state', () => {
  it('the user who caused a notification sees it as read; everyone else as unread', async () => {
    const t = await makeTestApp();
    const { mk, admin } = await withEvents(t);
    const mine = await feed(t, mk);
    expect(mine.rows.map((n: { title: string; read: boolean }) => [n.title, n.read])).toEqual([
      ['Approved', false],
      ['New Request', true], // marketing raised it
    ]);
    expect(await unread(t, mk)).toBe(1);
    expect(await unread(t, admin)).toBe(1); // admin approved, so only "New Request" is unread
    expect(await unread(t, await t.login('dispatch'))).toBe(2);
  });

  it('mark read affects only that user', async () => {
    const t = await makeTestApp();
    await withEvents(t);
    const d = await t.login('dispatch');
    const m = await t.login('management');
    const ids = (await feed(t, d)).rows.map((n: { id: string }) => n.id);
    const res = await (await t.request('POST', `${N}/read`, { cookie: d, body: { ids: [ids[0]] } })).json();
    expect(res).toEqual({ updated: 1 });
    expect(await unread(t, d)).toBe(1);
    expect(await unread(t, m)).toBe(2);
    // Marking again changes nothing; unknown ids are ignored.
    expect(await (await t.request('POST', `${N}/read`, { cookie: d, body: { ids: [ids[0], 'ghost'] } })).json()).toEqual({ updated: 0 });
    const read = (await feed(t, d)).rows.find((n: { id: string }) => n.id === ids[0]);
    expect(read).toMatchObject({ read: true, readAt: '2026-10-01T09:00:00.000Z' });
  });

  it('mark all read, up to what the user has seen', async () => {
    const clock = testClock();
    const t = await makeTestApp({ clock });
    await withEvents(t);
    const d = await t.login('dispatch');
    const seenUpTo = (await feed(t, d)).rows[0].createdAt;
    clock.advance(5000);
    await t.request('POST', `${ST}/dispatches`, { cookie: await t.login('admin'), body: { partyId: 'p-free', mode: 'Hand Delivery', weightKg: 1 } });

    expect(await (await t.request('POST', `${N}/read-all`, { cookie: d, body: { upTo: seenUpTo } })).json()).toEqual({ updated: 2 });
    expect(await unread(t, d)).toBe(1); // the dispatch created after `upTo`
    await t.request('POST', `${N}/read-all`, { cookie: d, body: {} });
    expect(await unread(t, d)).toBe(0);
  });

  it('unread and type filters', async () => {
    const t = await makeTestApp();
    const { mk } = await withEvents(t);
    expect((await feed(t, mk, '?unread=true')).rows.map((n: { title: string }) => n.title)).toEqual(['Approved']);
    expect((await feed(t, mk, '?type=info')).rows.map((n: { title: string }) => n.title)).toEqual(['New Request']);
    expect((await t.request('GET', `${N}?type=urgent`, { cookie: mk })).status).toBe(422);
  });
});

describe('clear', () => {
  it('hides notifications for that user only, all or by id', async () => {
    const t = await makeTestApp();
    await withEvents(t);
    const d = await t.login('dispatch');
    const m = await t.login('management');
    const [first] = (await feed(t, m)).rows;

    expect(await (await t.request('POST', `${N}/clear`, { cookie: m, body: { ids: [first.id] } })).json()).toEqual({ cleared: 1 });
    expect((await feed(t, m)).total).toBe(1);
    expect(await unread(t, m)).toBe(1); // a cleared notification no longer counts

    expect(await (await t.request('POST', `${N}/clear`, { cookie: d, body: {} })).json()).toEqual({ cleared: 2 });
    expect((await feed(t, d)).total).toBe(0);
    expect(await unread(t, d)).toBe(0);
    expect((await feed(t, m)).total).toBe(1); // untouched by dispatch's clear
    expect((await t.data.repos.notifications.list({})).total).toBe(2); // nothing deleted
  });
});

describe('who receives notifications', () => {
  it('a targeted notification is visible only to its target', async () => {
    const t = await makeTestApp();
    await t.data.uow.run((tx) =>
      t.services.notifications.notify(tx, null, { type: 'danger', title: 'For dispatch', message: 'x', targetUserId: 'u-dispatch' }),
    );
    expect((await feed(t, await t.login('dispatch'))).rows.map((n: { title: string }) => n.title)).toEqual(['For dispatch']);
    expect((await feed(t, await t.login('marketing'))).total).toBe(0);
    // Another user can't mark it read by guessing the id.
    const id = (await t.data.repos.notifications.list({})).rows[0]!.id;
    expect(await (await t.request('POST', `${N}/read`, { cookie: await t.login('marketing'), body: { ids: [id] } })).json()).toEqual({ updated: 0 });
  });

  it('without the Notifications page: no feed, and no notification badge', async () => {
    const t = await makeTestApp();
    await withEvents(t);
    await t.request('PUT', `${ST}/role-permissions/marketing`, {
      cookie: await t.login('superadmin'),
      body: { pages: ['dashboard', 'requests'], actions: ['edit'], widgets: [] },
    });
    const mk = await t.login('marketing');
    expect((await t.request('GET', N, { cookie: mk })).status).toBe(403);
    expect((await t.request('GET', `${N}/unread-count`, { cookie: mk })).status).toBe(403);
    expect(await (await t.request('GET', `${ST}/badges`, { cookie: mk })).json()).toEqual({ pendingRequests: 2 });
  });
});

describe('sidebar badges', () => {
  it('unread notifications, pending requests and pending vendors, each only with the matching page', async () => {
    const t = await makeTestApp();
    await withEvents(t);
    const badges = async (role: string) => (await t.request('GET', `${ST}/badges`, { cookie: await t.login(role) })).json();
    // r1, r2 Pending (the new one is Approved); one pending vendor fixture.
    expect(await badges('admin')).toEqual({ unreadNotifications: 1, pendingRequests: 2, pendingVendors: 1 });
    expect(await badges('marketing')).toEqual({ unreadNotifications: 1, pendingRequests: 2 });
    expect(await badges('dispatch')).toEqual({ unreadNotifications: 2 });
    expect(await badges('management')).toEqual({ unreadNotifications: 2, pendingVendors: 1 });
  });
});
