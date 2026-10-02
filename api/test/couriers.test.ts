import { describe, expect, it } from 'vitest';
import { memoryDataLayerFrom } from '../src/repos/memory';
import { courier, makeTestApp, seedUsers, testData } from './helpers';

const C = '/api/sampletrack/couriers';

describe('couriers', () => {
  it('creates with defaults, validates name/rating/url, and logs', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('dispatch');
    const ok = await t.request('POST', C, {
      cookie,
      body: { name: 'Shree Maruti', rating: 4, trackingUrlTemplate: 'https://track.example/{tracking}', mobile: '1800-123-4567' },
    });
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({ type: 'Courier', status: 'Active', rating: 4 });

    for (const body of [{ name: '' }, { name: 'X', rating: 6 }, { name: 'X', rating: 0 }, { name: 'X', rating: 2.5 }, { name: 'X', trackingUrlTemplate: 'track.me' }, { name: 'X', type: 'Ship' }]) {
      expect((await t.request('POST', C, { cookie, body })).status, JSON.stringify(body)).toBe(422);
    }
    const log = await t.data.repos.activity.list({ filters: { entityType: 'courier' } });
    expect(log.rows[0]!.details).toBe('Created courier Shree Maruti (Courier)');
  });

  it('filters by type and status and searches', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const transport = await (await t.request('GET', `${C}?type=Transport`, { cookie })).json();
    expect(transport.rows.map((c: { id: string }) => c.id)).toEqual(['c-used']);
    const found = await (await t.request('GET', `${C}?q=free`, { cookie })).json();
    expect(found.total).toBe(1);
  });

  it('dispatch dropdown: active couriers of the chosen mode; Hand Delivery lists all active', async () => {
    const t = await makeTestApp();
    await t.data.repos.couriers.create(courier('c-bus', { name: 'Bus Line', type: 'Bus' }));
    await t.data.repos.couriers.create(courier('c-off', { name: 'Old Courier', status: 'Inactive' }));
    const cookie = await t.login('dispatch');
    const ids = async (mode: string) =>
      (await (await t.request('GET', `${C}/options?mode=${encodeURIComponent(mode)}`, { cookie })).json()).map((c: { id: string }) => c.id);
    expect(await ids('Courier')).toEqual(['c-free']);
    expect(await ids('Transport')).toEqual(['c-used']);
    expect(await ids('Bus')).toEqual(['c-bus']);
    expect(await ids('Hand Delivery')).toEqual(['c-bus', 'c-free', 'c-used']);
    expect((await t.request('GET', `${C}/options?mode=Ship`, { cookie })).status).toBe(422);
  });

  it('delete is blocked while a dispatch uses the courier', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const res = await t.request('DELETE', `${C}/c-used`, { cookie });
    expect(res.status).toBe(409);
    expect((await res.json()).error.details).toEqual({ requests: 0, dispatches: 1 });
    expect((await t.request('DELETE', `${C}/c-free`, { cookie })).status).toBe(204);
  });

  it('a soft-deleted dispatch no longer blocks the delete', async () => {
    const data = testData(await seedUsers());
    data.dispatches[0]!.deletedAt = '2026-09-30T12:00:00.000Z';
    const t = await makeTestApp({ data: memoryDataLayerFrom(data) });
    expect((await t.request('DELETE', `${C}/c-used`, { cookie: await t.login('admin') })).status).toBe(204);
  });
});
