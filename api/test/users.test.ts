import { describe, expect, it } from 'vitest';
import { makeTestApp, type TestApp } from './helpers';

const U = '/api/sampletrack/users';

async function asSuper(t: TestApp) {
  return t.login('superadmin');
}

const newUser = (over: Record<string, unknown> = {}) => ({
  username: 'priya',
  name: 'Priya Mehta',
  email: 'Priya@Example.com',
  phone: '9867543210',
  department: 'Sales',
  role: 'marketing',
  password: 'priya-pass-1',
  ...over,
});

describe('user CRUD', () => {
  it('creates a user without exposing the password hash, and the new user can sign in', async () => {
    const t = await makeTestApp();
    const res = await t.request('POST', U, { cookie: await asSuper(t), body: newUser() });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ username: 'priya', email: 'priya@example.com', role: 'marketing', status: 'Active' });
    expect(JSON.stringify(body)).not.toMatch(/hash|argon/i);
    await expect(t.login('priya', 'priya-pass-1')).resolves.toMatch(/^sid=/);
  });

  it('rejects a duplicate username, case-insensitively', async () => {
    const t = await makeTestApp();
    const res = await t.request('POST', U, { cookie: await asSuper(t), body: newUser({ username: 'ADMIN' }) });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('username_taken');
  });

  it('rejects renaming to a taken username', async () => {
    const t = await makeTestApp();
    const res = await t.request('PATCH', `${U}/u-victim`, { cookie: await asSuper(t), body: { username: 'dispatch' } });
    expect(res.status).toBe(409);
  });

  it('requires a password of at least 8 characters on create', async () => {
    const t = await makeTestApp();
    const res = await t.request('POST', U, { cookie: await asSuper(t), body: newUser({ password: 'short7!' }) });
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).toMatch(/at least 8/);
    const missing = await t.request('POST', U, { cookie: await asSuper(t), body: newUser({ password: undefined }) });
    expect(missing.status).toBe(422);
  });

  it('keeps the password when it is blank on edit, and changes it when given', async () => {
    const t = await makeTestApp();
    const su = await asSuper(t);
    await t.request('PATCH', `${U}/u-victim`, { cookie: su, body: { name: 'Renamed', password: '' } });
    await expect(t.login('victim')).resolves.toBeTruthy();

    const short = await t.request('PATCH', `${U}/u-victim`, { cookie: su, body: { password: 'short' } });
    expect(short.status).toBe(422);

    await t.request('PATCH', `${U}/u-victim`, { cookie: su, body: { password: 'brand-new-pass' } });
    await expect(t.login('victim')).rejects.toThrow(/401/);
    await expect(t.login('victim', 'brand-new-pass')).resolves.toBeTruthy();
  });

  it('changing a password signs that user out everywhere', async () => {
    const t = await makeTestApp();
    const victim = await t.login('victim');
    await t.request('PATCH', `${U}/u-victim`, { cookie: await asSuper(t), body: { password: 'brand-new-pass' } });
    expect((await t.request('GET', '/api/me', { cookie: victim })).status).toBe(401);
  });

  it('soft-deletes, after which the user is gone and the username is free', async () => {
    const t = await makeTestApp();
    const su = await asSuper(t);
    expect((await t.request('DELETE', `${U}/u-victim`, { cookie: su })).status).toBe(204);
    expect((await t.request('GET', `${U}/u-victim`, { cookie: su })).status).toBe(404);
    expect((await t.request('POST', U, { cookie: su, body: newUser({ username: 'victim' }) })).status).toBe(201);
  });

  it('filters by role and status, searches, and paginates', async () => {
    const t = await makeTestApp();
    const su = await asSuper(t);
    await t.request('POST', `${U}/u-victim/toggle-status`, { cookie: su });

    const dispatchers = await (await t.request('GET', `${U}?role=dispatch`, { cookie: su })).json();
    expect(dispatchers.total).toBe(2);
    const inactive = await (await t.request('GET', `${U}?role=dispatch&status=Inactive`, { cookie: su })).json();
    expect(inactive.rows.map((u: { username: string }) => u.username)).toEqual(['victim']);
    const search = await (await t.request('GET', `${U}?q=market`, { cookie: su })).json();
    expect(search.rows.map((u: { username: string }) => u.username)).toEqual(['marketing']);
    const page2 = await (await t.request('GET', `${U}?pageSize=4&page=2&sort=username`, { cookie: su })).json();
    expect(page2.total).toBe(6);
    expect(page2.rows.map((u: { username: string }) => u.username)).toEqual(['superadmin', 'victim']);
    expect((await t.request('GET', `${U}?role=nope`, { cookie: su })).status).toBe(422);
  });

  it('stats: total, active and a count per role', async () => {
    const t = await makeTestApp();
    const su = await asSuper(t);
    await t.request('POST', `${U}/u-victim/toggle-status`, { cookie: su });
    const stats = await (await t.request('GET', `${U}/stats`, { cookie: su })).json();
    expect(stats).toEqual({
      total: 6,
      active: 5,
      inactive: 1,
      byRole: { superadmin: 1, admin: 1, dispatch: 2, marketing: 1, management: 1 },
    });
  });
});

describe('status and safety rules', () => {
  it('toggle-status flips Active ↔ Inactive', async () => {
    const t = await makeTestApp();
    const su = await asSuper(t);
    const off = await (await t.request('POST', `${U}/u-victim/toggle-status`, { cookie: su })).json();
    expect(off.status).toBe('Inactive');
    const on = await (await t.request('POST', `${U}/u-victim/toggle-status`, { cookie: su })).json();
    expect(on.status).toBe('Active');
  });

  it('an inactive user cannot sign in, and their open session ends at once', async () => {
    const t = await makeTestApp();
    const victim = await t.login('victim');
    await t.request('POST', `${U}/u-victim/toggle-status`, { cookie: await asSuper(t) });
    expect((await t.request('GET', '/api/me', { cookie: victim })).status).toBe(401);
    const res = await t.request('POST', '/api/auth/login', { body: { username: 'victim', password: 'pw-victim-123' } });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('account_inactive');
  });

  it('you cannot delete or deactivate yourself', async () => {
    const t = await makeTestApp();
    const admin = await t.login('admin');
    const del = await t.request('DELETE', `${U}/u-admin`, { cookie: admin });
    expect(del.status).toBe(409);
    expect((await del.json()).error.code).toBe('cannot_delete_self');
    const toggle = await t.request('POST', `${U}/u-admin/toggle-status`, { cookie: admin });
    expect((await toggle.json()).error.code).toBe('cannot_deactivate_self');
    const patch = await t.request('PATCH', `${U}/u-admin`, { cookie: admin, body: { status: 'Inactive' } });
    expect(patch.status).toBe(409);
  });

  it('the last active superadmin cannot demote themselves', async () => {
    const t = await makeTestApp();
    const su = await asSuper(t);
    const res = await t.request('PATCH', `${U}/u-superadmin`, { cookie: su, body: { role: 'admin' } });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('last_superadmin');
  });

  it('with two active superadmins, one may demote or deactivate the other, but not the last one left', async () => {
    const t = await makeTestApp();
    const su = await asSuper(t);
    const su2 = await (
      await t.request('POST', U, { cookie: su, body: newUser({ username: 'su2', role: 'superadmin' }) })
    ).json();
    expect((await t.request('POST', `${U}/${su2.id}/toggle-status`, { cookie: su })).status).toBe(200);
    // Now the original is the only active superadmin and can't demote itself.
    const res = await t.request('PATCH', `${U}/u-superadmin`, { cookie: su, body: { role: 'admin' } });
    expect((await res.json()).error.code).toBe('last_superadmin');
    // Deleting the inactive one is fine.
    expect((await t.request('DELETE', `${U}/${su2.id}`, { cookie: su })).status).toBe(204);
  });

  it('service guard: deleting or deactivating the last active superadmin is refused for any actor', async () => {
    const t = await makeTestApp();
    // Through HTTP this needs a second active superadmin, which would make the target not the last.
    // So drive the service directly with a stand-in superadmin actor that has no user row.
    const ghost = { id: 'ghost', name: 'Ghost', role: 'superadmin' as const };
    await expect(t.services.users.remove(ghost, 'u-superadmin')).rejects.toMatchObject({ code: 'last_superadmin' });
    await expect(t.services.users.toggleStatus(ghost, 'u-superadmin')).rejects.toMatchObject({ code: 'last_superadmin' });
    expect((await t.data.repos.users.getById('u-superadmin'))?.status).toBe('Active');
  });

  it('only a superadmin can create, promote to, or manage a superadmin', async () => {
    const t = await makeTestApp();
    const admin = await t.login('admin');
    const create = await t.request('POST', U, { cookie: admin, body: newUser({ role: 'superadmin' }) });
    expect(create.status).toBe(403);
    const promote = await t.request('PATCH', `${U}/u-victim`, { cookie: admin, body: { role: 'superadmin' } });
    expect(promote.status).toBe(403);
    const touch = await t.request('PATCH', `${U}/u-superadmin`, { cookie: admin, body: { name: 'Hacked' } });
    expect(touch.status).toBe(403);
    const del = await t.request('DELETE', `${U}/u-superadmin`, { cookie: admin });
    expect(del.status).toBe(403);
  });

  it('404s for unknown users', async () => {
    const t = await makeTestApp();
    const su = await asSuper(t);
    expect((await t.request('GET', `${U}/nope`, { cookie: su })).status).toBe(404);
    expect((await t.request('PATCH', `${U}/nope`, { cookie: su, body: { name: 'x' } })).status).toBe(404);
    expect((await t.request('DELETE', `${U}/nope`, { cookie: su })).status).toBe(404);
  });
});
