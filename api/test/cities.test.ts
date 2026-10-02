import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers';

const ST = '/api/sampletrack';

describe('states and city master', () => {
  it('lists the 36 states/UTs', async () => {
    const t = await makeTestApp();
    const states = await (await t.request('GET', `${ST}/states`, { cookie: await t.login('marketing') })).json();
    expect(states).toHaveLength(36);
    expect(states.find((s: { name: string }) => s.name === 'Gujarat')).toEqual({ id: 'state-24', name: 'Gujarat', gstCode: '24', kind: 'State' });
  });

  it('master list: built-in + custom with state names, filterable', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const all = await (await t.request('GET', `${ST}/cities?pageSize=100`, { cookie })).json();
    expect(all.total).toBe(111); // 110 built-in + 1 custom fixture
    const custom = await (await t.request('GET', `${ST}/cities?isCustom=true`, { cookie })).json();
    expect(custom.rows).toEqual([{ id: 'city-custom', city: 'Halvad', stateId: 'state-24', stateName: 'Gujarat', isCustom: true, pincodes: ['363330'] }]);
    const gj = await (await t.request('GET', `${ST}/cities?stateId=state-24&q=mor`, { cookie })).json();
    expect(gj.rows.map((c: { city: string }) => c.city)).toEqual(['Morbi']);
  });

  it('add needs city and state; duplicates are case-insensitive per state', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    expect((await t.request('POST', `${ST}/cities`, { cookie, body: { city: 'Tankara' } })).status).toBe(422);
    expect((await t.request('POST', `${ST}/cities`, { cookie, body: { city: '', stateId: 'state-24' } })).status).toBe(422);
    expect((await t.request('POST', `${ST}/cities`, { cookie, body: { city: 'Tankara', stateId: 'state-99' } })).status).toBe(422);

    const added = await t.request('POST', `${ST}/cities`, { cookie, body: { city: 'Tankara', stateId: 'state-24' } });
    expect(await added.json()).toMatchObject({ city: 'Tankara', stateName: 'Gujarat', isCustom: true });
    for (const city of ['tankara', '  TANKARA ', 'rajkot']) {
      const dup = await t.request('POST', `${ST}/cities`, { cookie, body: { city, stateId: 'state-24' } });
      expect(dup.status, city).toBe(409);
      expect((await dup.json()).error.code).toBe('city_exists');
    }
    // Same name in a different state is a different city.
    expect((await t.request('POST', `${ST}/cities`, { cookie, body: { city: 'Rajkot', stateId: 'state-27' } })).status).toBe(201);
    const log = await t.data.repos.activity.list({ filters: { entityType: 'city', action: 'Create' } });
    expect(log.rows.map((r) => r.details)).toContain('Added city Tankara, Gujarat');
  });

  it('only custom cities can be removed', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const builtin = await t.request('DELETE', `${ST}/cities/city-rajkot`, { cookie });
    expect(builtin.status).toBe(409);
    expect((await builtin.json()).error.code).toBe('builtin_city');
    expect((await t.request('DELETE', `${ST}/cities/city-custom`, { cookie })).status).toBe(204);
    expect((await t.request('DELETE', `${ST}/cities/city-custom`, { cookie })).status).toBe(404);
  });

  it('party dropdown = built-in + custom + cities used on parties, each with its state', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    await t.request('POST', `${ST}/parties`, { cookie, body: { name: 'Far Away', city: 'Port Blair', state: 'Andaman & Nicobar Islands' } });
    await t.request('POST', `${ST}/parties`, { cookie, body: { name: 'No State', city: 'Rajkot' } });
    const options = await (await t.request('GET', `${ST}/cities/options`, { cookie: await t.login('marketing') })).json();
    const find = (city: string) => options.filter((o: { city: string }) => o.city === city);
    expect(find('Rajkot')).toEqual([{ city: 'Rajkot', state: 'Gujarat', source: 'builtin' }]); // the party copy adds nothing
    expect(find('Halvad')).toEqual([{ city: 'Halvad', state: 'Gujarat', source: 'custom' }]);
    expect(find('Port Blair')).toEqual([{ city: 'Port Blair', state: 'Andaman & Nicobar Islands', source: 'party' }]);
    expect(options.length).toBe(112);
    const names = options.map((o: { city: string }) => o.city);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
  });

  it('export lists built-in and custom cities', async () => {
    const t = await makeTestApp();
    const res = await t.request('GET', `${ST}/cities/export`, { cookie: await t.login('admin') });
    const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets['City Master']!);
    expect(rows).toHaveLength(111);
    expect(rows.find((r) => r.City === 'Halvad')).toEqual({ City: 'Halvad', State: 'Gujarat', Type: 'Custom', Pincodes: '363330' });
    expect(rows.find((r) => r.City === 'Wankaner')).toEqual({ City: 'Wankaner', State: 'Gujarat', Type: 'Built-in', Pincodes: '363621, 363622' });
  });
});

describe('city pincodes (Vendors module)', () => {
  it('a pincode looks up its city and state; unknown → 404; malformed → 422', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    expect(await (await t.request('GET', `${ST}/cities/pincode/363641`, { cookie })).json()).toEqual({ pincode: '363641', city: 'Morbi', state: 'Gujarat' });
    expect((await t.request('GET', `${ST}/cities/pincode/999999`, { cookie })).status).toBe(404);
    expect((await t.request('GET', `${ST}/cities/pincode/12ab`, { cookie })).status).toBe(422);
  });

  it('searching digits matches pincodes', async () => {
    const t = await makeTestApp();
    const res = await (await t.request('GET', `${ST}/cities?q=3636`, { cookie: await t.login('admin') })).json();
    expect(res.rows.map((c: { city: string }) => c.city)).toEqual(['Morbi', 'Wankaner']);
  });

  it('add with pincodes; edit pincodes of a built-in city; built-in name and state stay fixed', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const added = await t.request('POST', `${ST}/cities`, { cookie, body: { city: 'Tankara', stateId: 'state-24', pincodes: '363650x' } });
    expect(added.status).toBe(422);
    const ok = await t.request('POST', `${ST}/cities`, { cookie, body: { city: 'Tankara', stateId: 'state-24', pincodes: '363651, 363651 363652' } });
    expect(await ok.json()).toMatchObject({ city: 'Tankara', pincodes: ['363651', '363652'] });

    const edit = await t.request('PATCH', `${ST}/cities/city-morbi`, { cookie, body: { pincodes: ['363641', '363642'] } });
    expect(await edit.json()).toMatchObject({ city: 'Morbi', pincodes: ['363641', '363642'] });
    const rename = await t.request('PATCH', `${ST}/cities/city-morbi`, { cookie, body: { city: 'Morvi' } });
    expect(rename.status).toBe(409);
    expect((await rename.json()).error.code).toBe('builtin_city');
    // A custom city can be renamed.
    const custom = await t.request('PATCH', `${ST}/cities/city-custom`, { cookie, body: { city: 'Halvad Town' } });
    expect(await custom.json()).toMatchObject({ city: 'Halvad Town', isCustom: true });
  });

  it('a pincode belongs to one city', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const res = await t.request('PATCH', `${ST}/cities/city-custom`, { cookie, body: { pincodes: ['363641'] } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({ code: 'pincode_taken', message: 'Pincode 363641 already belongs to Morbi' });
    const add = await t.request('POST', `${ST}/cities`, { cookie, body: { city: 'Tankara', stateId: 'state-24', pincodes: ['363621'] } });
    expect(add.status).toBe(409);
  });
});
