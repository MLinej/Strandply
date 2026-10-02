import { describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers';

const ST = '/api/sampletrack';
const C = `${ST}/settings/company`;

describe('company settings', () => {
  it('returns the seeded defaults', async () => {
    const t = await makeTestApp();
    expect(await (await t.request('GET', C, { cookie: await t.login('admin') })).json()).toEqual({
      name: 'Strandply LLP',
      llpin: 'AAP-7300',
      city: 'Wankaner, Morbi, Gujarat',
      phone: null,
      gst: null,
    });
  });

  it('saves only changed fields, normalises, logs the change; blank clears a field', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const saved = await (
      await t.request('PUT', C, {
        cookie,
        body: { name: 'Strandply LLP', phone: ' +91 2828 223344 ', gst: '24aaafs1234a1z5', llpin: 'aap-7300' },
      })
    ).json();
    expect(saved).toEqual({ name: 'Strandply LLP', llpin: 'AAP-7300', city: 'Wankaner, Morbi, Gujarat', phone: '+91 2828 223344', gst: '24AAAFS1234A1Z5' });
    const log = await t.data.repos.activity.list({ filters: { entityType: 'settings' } });
    expect(log.rows.map((r) => r.details)).toEqual(['Updated company settings: phone, GST']);

    const cleared = await (await t.request('PUT', C, { cookie, body: { llpin: '' } })).json();
    expect(cleared.llpin).toBeNull();
    // Nothing changed → nothing logged.
    await t.request('PUT', C, { cookie, body: { name: 'Strandply LLP' } });
    expect((await t.data.repos.activity.list({ filters: { entityType: 'settings' } })).total).toBe(2);
  });

  it('validates name, LLPIN, GST and phone', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('superadmin');
    for (const body of [{ name: '' }, { llpin: 'AAP7300' }, { gst: '24AAAFS1234A1Z' }, { phone: 'call me' }]) {
      expect((await t.request('PUT', C, { cookie, body })).status, JSON.stringify(body)).toBe(422);
    }
  });

  it('is used by the courier label, request slip, report print and WhatsApp message', async () => {
    const t = await makeTestApp();
    const admin = await t.login('admin');
    await t.request('PUT', C, {
      cookie: admin,
      body: { name: 'Strandply Industries LLP', city: 'Morbi, Gujarat', phone: '02822 111222', gst: '24AAAFS1234A1Z5' },
    });
    const expected = { name: 'Strandply Industries LLP', city: 'Morbi, Gujarat', phone: '02822 111222', llpin: 'AAP-7300', gst: '24AAAFS1234A1Z5' };
    expect((await (await t.request('GET', `${ST}/dispatches/d1/label`, { cookie: admin })).json()).from).toEqual(expected);
    expect((await (await t.request('GET', `${ST}/requests/r2/slip`, { cookie: admin })).json()).company).toEqual(expected);
    expect((await (await t.request('GET', `${ST}/reports/pending/print`, { cookie: admin })).json()).company).toEqual(expected);
    const share = await (await t.request('GET', `${ST}/dispatches/d1/whatsapp`, { cookie: admin })).json();
    expect(share.text.split('\n')[0]).toBe('🚚 *Dispatch Update — Strandply Industries LLP*');
    expect(share.text).toContain('— *Strandply Industries LLP* Dispatch Team');
  });

  it('needs the Settings page to read and edit to change', async () => {
    const t = await makeTestApp();
    await t.request('PUT', `${ST}/role-permissions/admin`, {
      cookie: await t.login('superadmin'),
      body: { pages: ['settings'], actions: [], widgets: [] },
    });
    const admin = await t.login('admin');
    expect((await t.request('GET', C, { cookie: admin })).status).toBe(200);
    expect((await t.request('PUT', C, { cookie: admin, body: { phone: '02822 111222' } })).status).toBe(403);
  });
});
