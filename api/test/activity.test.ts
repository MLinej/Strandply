import { describe, expect, it } from 'vitest';
import { makeTestApp, testClock } from './helpers';

const A = '/api/sampletrack/activity';
const DAY = 86_400_000;

describe('activity log', () => {
  it('records login, create, edit, delete and logout with user, role, action, details and time', async () => {
    const t = await makeTestApp();
    const su = await t.login('superadmin');
    const created = await (
      await t.request('POST', '/api/sampletrack/users', {
        cookie: su,
        body: { username: 'temp', name: 'Temp', role: 'marketing', password: 'temp-pass-1' },
      })
    ).json();
    await t.request('PATCH', `/api/sampletrack/users/${created.id}`, { cookie: su, body: { department: 'Sales' } });
    await t.request('DELETE', `/api/sampletrack/users/${created.id}`, { cookie: su });
    await t.request('POST', '/api/auth/logout', { cookie: su });

    const { rows } = await t.data.repos.activity.list({ sort: 'createdAt' });
    expect(rows.map((r) => [r.action, r.details])).toEqual([
      ['Login', 'Superadmin User signed in'],
      ['Create', 'Created user temp (Marketing, Active)'],
      ['Edit', 'Updated user temp: department'],
      ['Delete', 'Deleted user temp (Marketing)'],
      ['Logout', 'Superadmin User signed out'],
    ]);
    for (const r of rows) {
      expect(r).toMatchObject({ userId: 'u-superadmin', userName: 'Superadmin User', userRole: 'Super Admin' });
      expect(r.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('a password change is logged without the password', async () => {
    const t = await makeTestApp();
    await t.request('PATCH', '/api/sampletrack/users/u-victim', {
      cookie: await t.login('admin'),
      body: { password: 'secret-new-pass' },
    });
    const { rows } = await t.data.repos.activity.list({ filters: { action: 'Edit' } });
    expect(rows[0]!.details).toBe('Updated user victim: password');
    expect(JSON.stringify(rows)).not.toContain('secret-new-pass');
  });

  it('lists newest first, with filters for user, action, entity type, date range and text', async () => {
    const clock = testClock();
    const t = await makeTestApp({ clock, config: { sessionIdleHours: 100 } });
    const admin = await t.login('admin'); // 09:00 day 0
    clock.advance(DAY);
    await t.login('dispatch'); // day 1
    clock.advance(DAY);
    await t.request('PATCH', '/api/sampletrack/users/u-victim', { cookie: admin, body: { name: 'V' } }); // day 2

    const get = async (qs: string) => (await t.request('GET', `${A}?${qs}`, { cookie: admin })).json();
    const all = await get('');
    expect(all.rows.map((r: { action: string }) => r.action)).toEqual(['Edit', 'Login', 'Login']);
    expect((await get('action=Login')).total).toBe(2);
    expect((await get('userId=u-dispatch')).total).toBe(1);
    expect((await get('entityType=user&action=Edit')).total).toBe(1);
    expect((await get('from=2026-10-02&to=2026-10-03')).rows[0].userName).toBe('Dispatch User');
    expect((await get('q=signed')).total).toBe(2);
    expect((await get('pageSize=1&page=3')).rows[0].userName).toBe('Admin User');
    expect((await t.request('GET', `${A}?action=Hack`, { cookie: admin })).status).toBe(422);
  });

  it('purge: superadmin only, removes entries older than N days, and logs itself', async () => {
    const clock = testClock();
    const t = await makeTestApp({ clock });
    await t.login('dispatch'); // old
    clock.advance(40 * DAY);
    const su = await t.login('superadmin'); // recent

    const denied = await t.request('POST', `${A}/purge`, { cookie: await t.login('admin'), body: { olderThanDays: 30 } });
    expect(denied.status).toBe(403);

    const res = await t.request('POST', `${A}/purge`, { cookie: su, body: { olderThanDays: 30 } });
    expect(res.status).toBe(200);
    expect((await res.json()).purged).toBe(1);

    const { rows } = await t.data.repos.activity.list({ sort: 'createdAt' });
    expect(rows.map((r) => r.action)).toEqual(['Login', 'Login', 'Purge']);
    expect(rows.at(-1)!.details).toMatch(/^Purged 1 activity entry older than 30 day\(s\)/);
    expect(rows.at(-1)!.userName).toBe('Superadmin User');
  });

  it('purge validates olderThanDays', async () => {
    const t = await makeTestApp();
    const su = await t.login('superadmin');
    for (const olderThanDays of [0, -5, 1.5, '30']) {
      expect((await t.request('POST', `${A}/purge`, { cookie: su, body: { olderThanDays } })).status).toBe(422);
    }
  });
});
