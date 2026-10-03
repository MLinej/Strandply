import { readFileSync } from 'node:fs';
import { DEFAULT_SETTINGS } from '../src/seed/settings';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, FULL_PERMISSIONS, LOCKED_ROLES, normalizePermissionSet, ROLES, type PermissionSet } from '../src/domain/access';
import { makeTestApp, testClock } from './helpers';

const RP = '/api/sampletrack/role-permissions';

describe('role permissions', () => {
  it('lists every role; superadmin is locked with full permissions', async () => {
    const t = await makeTestApp();
    const { rows } = await (await t.request('GET', RP, { cookie: await t.login('admin') })).json();
    expect(rows.map((r: { role: string }) => r.role)).toEqual(['superadmin', 'admin', 'dispatch', 'marketing', 'management']);
    expect(rows[0]).toMatchObject({ locked: true, permissions: FULL_PERMISSIONS });
    expect(rows[2].permissions).toEqual(DEFAULT_ROLE_PERMISSIONS.dispatch);
  });

  it('the superadmin row cannot be edited', async () => {
    const t = await makeTestApp();
    const res = await t.request('PUT', `${RP}/superadmin`, {
      cookie: await t.login('superadmin'),
      body: { pages: [], actions: [], widgets: [] },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('role_locked');
  });

  it('admin can view but not edit or reset', async () => {
    const t = await makeTestApp();
    const admin = await t.login('admin');
    expect((await t.request('PUT', `${RP}/dispatch`, { cookie: admin, body: { pages: [], actions: [], widgets: [] } })).status).toBe(403);
    expect((await t.request('POST', `${RP}/reset`, { cookie: admin })).status).toBe(403);
  });

  it('a change applies on the user’s very next request', async () => {
    const t = await makeTestApp();
    const su = await t.login('superadmin');
    const marketing = await t.login('marketing');
    expect((await t.request('GET', '/api/sampletrack/users', { cookie: marketing })).status).toBe(403);

    await t.request('PUT', `${RP}/marketing`, { cookie: su, body: { pages: ['users'], actions: [], widgets: [] } });
    expect((await t.request('GET', '/api/sampletrack/users', { cookie: marketing })).status).toBe(200);
    const me = await (await t.request('GET', '/api/me', { cookie: marketing })).json();
    expect(me.permissions).toEqual({ pages: ['users'], actions: [], widgets: [] });
  });

  it('other instances pick up a change once their short cache expires', async () => {
    const clock = testClock();
    const a = await makeTestApp({ clock, config: { permissionCacheMs: 5000 } });
    const b = await makeTestApp({ clock, data: a.data, config: { permissionCacheMs: 5000 } });
    const marketingOnB = await b.login('marketing');
    expect((await b.request('GET', '/api/sampletrack/users', { cookie: marketingOnB })).status).toBe(403); // B caches now

    await a.request('PUT', `${RP}/marketing`, { cookie: await a.login('superadmin'), body: { pages: ['users'], actions: [], widgets: [] } });
    expect((await b.request('GET', '/api/sampletrack/users', { cookie: marketingOnB })).status).toBe(403); // stale cache
    clock.advance(5000);
    expect((await b.request('GET', '/api/sampletrack/users', { cookie: marketingOnB })).status).toBe(200);
  });

  it('validates keys and normalises order and duplicates', async () => {
    const t = await makeTestApp();
    const su = await t.login('superadmin');
    const bad = await t.request('PUT', `${RP}/dispatch`, { cookie: su, body: { pages: ['nope'], actions: [], widgets: [] } });
    expect(bad.status).toBe(422);
    const unknownRole = await t.request('PUT', `${RP}/janitor`, { cookie: su, body: { pages: [], actions: [], widgets: [] } });
    expect(unknownRole.status).toBe(404);
    const ok = await (
      await t.request('PUT', `${RP}/dispatch`, {
        cookie: su,
        body: { pages: ['users', 'dashboard', 'users'], actions: ['print', 'edit'], widgets: [] },
      })
    ).json();
    expect(ok.permissions).toEqual({ pages: ['dashboard', 'users'], actions: ['edit', 'print'], widgets: [] });
  });

  it('reset restores the defaults', async () => {
    const t = await makeTestApp();
    const su = await t.login('superadmin');
    await t.request('PUT', `${RP}/dispatch`, { cookie: su, body: { pages: [], actions: [], widgets: [] } });
    const { rows } = await (await t.request('POST', `${RP}/reset`, { cookie: su })).json();
    expect(rows.find((r: { role: string }) => r.role === 'dispatch').permissions).toEqual(DEFAULT_ROLE_PERMISSIONS.dispatch);
  });

  it('every change and reset is logged with a readable diff', async () => {
    const t = await makeTestApp();
    const su = await t.login('superadmin');
    await t.request('PUT', `${RP}/dispatch`, {
      cookie: su,
      body: { pages: ['dashboard', 'dispatch', 'tracking', 'couriers', 'notifications', 'reports'], actions: ['edit'], widgets: ['total'] },
    });
    await t.request('POST', `${RP}/reset`, { cookie: su });
    const { rows } = await t.data.repos.activity.list({ filters: { action: 'PermissionChange' }, sort: 'createdAt' });
    expect(rows.map((r) => r.details)).toEqual([
      'Updated Dispatch Dept permissions: +pages: reports; -actions: print; -widgets: delivered, delayed',
      'Reset all role permissions to defaults',
    ]);
    expect(rows[0]).toMatchObject({ userName: 'Superadmin User', userRole: 'Super Admin', entityId: 'dispatch' });
  });
});

describe('SQL seed stays in sync with the code defaults', () => {
  it('0004 seed + the 0005–0010 appends give exactly DEFAULT_ROLE_PERMISSIONS (files are parsed, never executed)', () => {
    const read = (f: string) => readFileSync(new URL(`../../db/migrations/${f}`, import.meta.url), 'utf8');
    const rows = [...read('0004_access_control.sql').matchAll(/^\s+\('(\w+)', '(\{.*\})', ([01])\)/gm)].map(
      (m) => [m[1]!, JSON.parse(m[2]!) as PermissionSet, m[3] === '1'] as const,
    );
    // 0005: UPDATE … json_insert(permissions, '$.pages[#]', 'x', …) … WHERE role IN ('a', 'b');
    for (const stmt of ['0005_vendors.sql', '0006_purchase.sql', '0007_stores.sql', '0008_stock.sql', '0009_production.sql', '0010_sales.sql'].map(read).join('\n').matchAll(/UPDATE st_role_permissions\s+SET permissions = json_insert\(permissions,([\s\S]*?)\)[\s\S]*?WHERE role IN \(([^)]*)\);/g)) {
      const appends = [...stmt[1]!.matchAll(/'\$\.(pages|actions|widgets)\[#\]', '(\w+)'/g)];
      const roles = [...stmt[2]!.matchAll(/'(\w+)'/g)].map((m) => m[1]);
      for (const [role, perms] of rows) {
        if (!roles.includes(role)) continue;
        for (const [, list, key] of appends) (perms[list as keyof PermissionSet] as string[]).push(key!);
      }
    }
    expect(rows.map(([r, p, locked]) => [r, normalizePermissionSet(p), locked])).toEqual(
      ROLES.map((r) => [r, DEFAULT_ROLE_PERMISSIONS[r], LOCKED_ROLES.includes(r)]),
    );
  });
});

describe('settings seed stays in sync', () => {
  it('0003_sampletrack_seed.sql seeds exactly DEFAULT_SETTINGS', () => {
    const sql = readFileSync(new URL('../../db/migrations/0003_sampletrack_seed.sql', import.meta.url), 'utf8');
    const rows = Object.fromEntries([...sql.matchAll(/^\s+\('([a-z_.]+)',\s+'(.*)'\)[,;]$/gm)].map((m) => [m[1], JSON.parse(m[2]!)]));
    expect(rows).toEqual(DEFAULT_SETTINGS);
  });
});
