import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers';

const P = '/api/sampletrack/parties';

const valid = {
  name: 'Sharma Interiors',
  contact: 'Ravi Sharma',
  mobile: '+91 98765-43210',
  email: 'Ravi@Sharma.IN',
  gst: '24aaacs1234f1z5',
  address: '12 MG Road',
  city: 'Rajkot',
  state: 'gujarat',
  pin: '360002',
  industry: 'Furniture',
  type: 'New Lead',
};

describe('parties', () => {
  it('creates with normalised fields and logs it', async () => {
    const t = await makeTestApp();
    const res = await t.request('POST', P, { cookie: await t.login('marketing'), body: valid });
    expect(res.status).toBe(201);
    const p = await res.json();
    expect(p).toMatchObject({
      name: 'Sharma Interiors',
      mobile: '9876543210',
      email: 'ravi@sharma.in',
      gst: '24AAACS1234F1Z5',
      state: 'Gujarat',
      type: 'New Lead',
      assignedUserName: null,
      createdBy: 'u-marketing',
    });
    const log = await t.data.repos.activity.list({ filters: { entityType: 'party' } });
    expect(log.rows[0]).toMatchObject({ action: 'Create', details: 'Created party Sharma Interiors', userRole: 'Marketing' });
  });

  it('validates GST, mobile, pincode, email and the name', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const bad = await t.request('POST', P, {
      cookie,
      body: { name: '  ', gst: '24AAACS1234F1Z', mobile: '12345', pin: '06001', email: 'nope' },
    });
    expect(bad.status).toBe(422);
    const paths = (await bad.json()).error.details.map((d: { path: string }) => d.path).sort();
    expect(paths).toEqual(['email', 'gst', 'mobile', 'name', 'pin']);

    const badGstFormat = await t.request('POST', P, { cookie, body: { name: 'X', gst: '24AAACS1234F1X5' } });
    expect((await badGstFormat.json()).error.details[0].message).toMatch(/GSTIN/);
    const unknownState = await t.request('POST', P, { cookie, body: { name: 'X', state: 'Atlantis' } });
    expect(unknownState.status).toBe(422);
  });

  it('blank optional fields become null', async () => {
    const t = await makeTestApp();
    const p = await (
      await t.request('POST', P, { cookie: await t.login('admin'), body: { name: 'Bare', gst: '', mobile: '', pin: '', email: '' } })
    ).json();
    expect(p).toMatchObject({ gst: null, mobile: null, pin: null, email: null, type: 'Existing Customer' });
  });

  it('a similar name (case and spacing ignored) returns 409 with the match, and force=true saves anyway', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const dup = await t.request('POST', P, { cookie, body: { name: '  free   PARTY ' } });
    expect(dup.status).toBe(409);
    const err = (await dup.json()).error;
    expect(err.code).toBe('possible_duplicate');
    expect(err.details.similar).toEqual([{ id: 'p-free', name: 'Free Party', city: 'Rajkot', state: 'Gujarat', mobile: null, gst: null }]);

    const forced = await t.request('POST', `${P}?force=true`, { cookie, body: { name: 'free party' } });
    expect(forced.status).toBe(201);
    const log = await t.data.repos.activity.list({ filters: { entityType: 'party', action: 'Create' } });
    expect(log.rows[0]!.details).toMatch(/despite a similar name/);
  });

  it('renaming onto an existing name is also checked, but other edits are not', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    expect((await t.request('PATCH', `${P}/p-used`, { cookie, body: { name: 'FREE PARTY' } })).status).toBe(409);
    expect((await t.request('PATCH', `${P}/p-used`, { cookie, body: { name: 'FREE PARTY' } })).status).toBe(409);
    expect((await t.request('PATCH', `${P}/p-used?force=1`, { cookie, body: { name: 'FREE PARTY' } })).status).toBe(200);
    // Saving a party under its own name is not a duplicate of itself.
    expect((await t.request('PATCH', `${P}/p-free`, { cookie, body: { name: 'Free Party', remarks: 'ok' } })).status).toBe(200);
  });

  it('edits log only the changed fields', async () => {
    const t = await makeTestApp();
    await t.request('PATCH', `${P}/p-free`, {
      cookie: await t.login('admin'),
      body: { city: 'Rajkot', pin: '360001', remarks: 'VIP' },
    });
    const log = await t.data.repos.activity.list({ filters: { action: 'Edit', entityType: 'party' } });
    expect(log.rows[0]!.details).toBe('Updated party Free Party: pin, remarks');
  });

  it('assignee must be an active marketing/admin/superadmin user; the name is joined onto lists', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const options = await (await t.request('GET', `${P}/assignees`, { cookie })).json();
    expect(options.map((o: { id: string }) => o.id).sort()).toEqual(['u-admin', 'u-marketing', 'u-superadmin']);

    const wrongRole = await t.request('PATCH', `${P}/p-free`, { cookie, body: { assignedUserId: 'u-dispatch' } });
    expect(wrongRole.status).toBe(422);
    await t.request('PATCH', `${P}/p-free`, { cookie, body: { assignedUserId: 'u-marketing' } });
    const list = await (await t.request('GET', `${P}?assignedUserId=u-marketing`, { cookie })).json();
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]).toMatchObject({ id: 'p-free', assignedUserName: 'Marketing User' });
  });

  it('lists with search, type filter, sort and a default page size of 10', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    for (let i = 0; i < 12; i++) {
      await t.request('POST', P, { cookie, body: { name: `Lead ${String(i).padStart(2, '0')}`, type: 'New Lead', city: 'Surat' } });
    }
    const page1 = await (await t.request('GET', P, { cookie })).json();
    expect(page1.total).toBe(14);
    expect(page1.rows).toHaveLength(10);
    const leads = await (await t.request('GET', `${P}?type=New%20Lead&sort=-name&page=2`, { cookie })).json();
    expect(leads.total).toBe(12);
    expect(leads.rows.map((p: { name: string }) => p.name)).toEqual(['Lead 01', 'Lead 00']);
    const search = await (await t.request('GET', `${P}?q=rajkot`, { cookie })).json();
    expect(search.rows.map((p: { id: string }) => p.id)).toEqual(['p-free']);
    expect((await t.request('GET', `${P}?type=Partner`, { cookie })).status).toBe(422);
  });

  it('delete is blocked while requests or dispatches use the party; otherwise soft-deleted', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const blocked = await t.request('DELETE', `${P}/p-used`, { cookie });
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error).toMatchObject({ code: 'in_use', details: { requests: 2, dispatches: 1 } });
    expect(await t.data.repos.parties.getById('p-used')).not.toBeNull();

    expect((await t.request('DELETE', `${P}/p-free`, { cookie })).status).toBe(204);
    expect((await t.request('GET', `${P}/p-free`, { cookie })).status).toBe(404);
    const log = await t.data.repos.activity.list({ filters: { action: 'Delete', entityType: 'party' } });
    expect(log.total).toBe(1);
  });

  it('exports every matching party, all columns, to xlsx', async () => {
    const t = await makeTestApp();
    const res = await t.request('GET', `${P}/export?q=party`, { cookie: await t.login('admin') });
    expect(res.headers.get('content-type')).toMatch(/spreadsheetml/);
    expect(res.headers.get('content-disposition')).toMatch(/PartyDatabase-2026-10-01\.xlsx/);
    const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets['Parties']!, { defval: '' });
    expect(rows.map((r) => r['Party Name']).sort()).toEqual(['Free Party', 'Used Party']);
    expect(Object.keys(rows[0]!)).toEqual(expect.arrayContaining(['Mobile', 'GST Number', 'Full Address', 'Pincode', 'Assigned To', 'Remarks']));
    const log = await t.data.repos.activity.list({ filters: { action: 'Export' } });
    expect(log.rows[0]!.details).toBe('Exported 2 parties');
  });
});
