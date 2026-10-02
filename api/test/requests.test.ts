import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { businessToday } from '../src/lib/dates';
import { parseQty } from '../src/modules/sampletrack/requests/qty';
import { makeTestApp, testClock, type TestApp } from './helpers';

const R = '/api/sampletrack/requests';
const osbLine = { productId: 'prod-osb-18-8x4', qty: '5 sheets' };

async function create(t: TestApp, cookie: string, body: Record<string, unknown>) {
  const res = await t.request('POST', R, { cookie, body });
  return { status: res.status, body: await res.json() };
}

describe('qty parsing', () => {
  it.each([
    ['5 sheets', 5, 'sheets'],
    ['5 Sheets', 5, 'sheets'],
    ['5', 5, 'sheets'],
    ['2.5kg', 2.5, 'kg'],
    ['2,5 kg', 2.5, 'kg'],
    ['10 Nos.', 10, 'pcs'],
    ['3 pieces', 3, 'pcs'],
    ['4 crates', 4, 'crates'],
  ])('%s → %s %s', (raw, value, unit) => {
    expect(parseQty(raw)).toEqual({ qtyValue: value, qtyUnit: unit, qtyRaw: raw });
  });

  it('keeps unparseable text as raw only', () => {
    expect(parseQty('5-6 sheets')).toEqual({ qtyValue: null, qtyUnit: null, qtyRaw: '5-6 sheets' });
    expect(parseQty('  ')).toEqual({ qtyValue: null, qtyUnit: null, qtyRaw: null });
  });
});

describe('business date', () => {
  it('uses India time: 20:00 UTC is already the next day', () => {
    expect(businessToday(() => new Date('2026-10-01T20:00:00Z'))).toBe('2026-10-02');
    expect(businessToday(() => new Date('2026-10-01T18:00:00Z'))).toBe('2026-10-01');
  });
});

describe('create', () => {
  it('Pending, next REQ number, date = today in India, requester = creator; master product prefills the line', async () => {
    const clock = testClock(new Date('2026-10-01T20:00:00Z'));
    const t = await makeTestApp({ clock });
    const { status, body } = await create(t, await t.login('marketing'), {
      partyId: 'p-free',
      status: 'Delivered', // ignored
      items: [osbLine, { productName: 'Custom Laminate', qty: '2 pcs' }],
    });
    expect(status).toBe(201);
    expect(body).toMatchObject({
      reqNo: 'REQ-0003',
      date: '2026-10-02',
      status: 'Pending',
      priority: 'Normal',
      partyName: 'Free Party',
      requestedByUserId: 'u-marketing',
      requestedByName: 'Marketing User',
      createdBy: 'u-marketing',
    });
    expect(body.items).toEqual([
      expect.objectContaining({
        lineNo: 1,
        productId: 'prod-osb-18-8x4',
        productName: 'OSB 18mm Premium',
        board: 'OSB',
        thickness: '18mm',
        size: '8x4 ft',
        qtyValue: 5,
        qtyUnit: 'sheets',
        qtyRaw: '5 sheets',
      }),
      expect.objectContaining({ lineNo: 2, productId: null, productName: 'Custom Laminate', board: null, qtyValue: 2, qtyUnit: 'pcs' }),
    ]);
  });

  it('values typed on a master-product line win over the prefill', async () => {
    const t = await makeTestApp();
    const { body } = await create(t, await t.login('admin'), {
      partyId: 'p-free',
      items: [{ productId: 'prod-osb-18-8x4', size: '6x4 ft', thickness: '18 mm' }],
    });
    expect(body.items[0]).toMatchObject({ productName: 'OSB 18mm Premium', size: '6x4 ft', thickness: '18 mm', qtyRaw: null });
  });

  it('validates party, lines, product ids, requester and dates', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const issues = async (body: Record<string, unknown>) => {
      const res = await create(t, cookie, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      return res.body.error.details.map((d: { path: string }) => d.path);
    };
    expect(await issues({ items: [osbLine] })).toEqual(['partyId']);
    expect(await issues({ partyId: 'nope', items: [osbLine] })).toEqual(['partyId']);
    expect(await issues({ partyId: 'p-free', items: [] })).toEqual(['items']);
    expect(await issues({ partyId: 'p-free', items: [{}, { productName: '  ' }] })).toEqual(['items']); // blank lines dropped
    expect(await issues({ partyId: 'p-free', items: [{ qty: '5 sheets' }] })).toEqual(['items.0.productName']);
    expect(await issues({ partyId: 'p-free', items: [{ productId: 'ghost' }] })).toEqual(['items.0.productId']);
    expect(await issues({ partyId: 'p-free', items: [osbLine], requestedByUserId: 'u-dispatch' })).toEqual(['requestedByUserId']);
    expect(await issues({ partyId: 'p-free', items: [osbLine], date: '2026-02-30' })).toEqual(['date']);
    expect(await issues({ partyId: 'p-free', items: [osbLine], date: '2026-10-05', requiredDispatchDate: '2026-10-04' })).toEqual([
      'requiredDispatchDate',
    ]);
    expect(await issues({ partyId: 'p-free', items: [osbLine], priority: 'Asap' })).toEqual(['priority']);
  });

  it('a failed create does not use up a number; numbers are unique under concurrency and never reused', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    await create(t, cookie, { partyId: 'nope', items: [osbLine] }); // fails inside the unit of work
    expect(await t.data.repos.counters.current('REQ')).toBe(2);

    const made = await Promise.all(Array.from({ length: 5 }, () => create(t, cookie, { partyId: 'p-free', items: [osbLine] })));
    expect(made.map((m) => m.body.reqNo).sort()).toEqual(['REQ-0003', 'REQ-0004', 'REQ-0005', 'REQ-0006', 'REQ-0007']);

    await t.request('DELETE', `${R}/${made[4]!.body.id}`, { cookie });
    expect((await create(t, cookie, { partyId: 'p-free', items: [osbLine] })).body.reqNo).toBe('REQ-0008');
  });

  it('sends a "New Request" notification and logs the create', async () => {
    const t = await makeTestApp();
    const { body } = await create(t, await t.login('marketing'), { partyId: 'p-free', items: [osbLine] });
    const notes = await t.data.repos.notifications.list({ filters: { entityId: body.id } });
    expect(notes.rows).toEqual([
      expect.objectContaining({
        type: 'info',
        title: 'New Request',
        message: 'REQ-0003 raised for Free Party by Marketing User',
        entityType: 'request',
        targetUserId: null,
      }),
    ]);
    const log = await t.data.repos.activity.list({ filters: { entityType: 'request', action: 'Create' } });
    expect(log.rows[0]).toMatchObject({ entityId: body.id, details: 'Sample request REQ-0003 for Free Party (1 product line)' });
  });
});

describe('edit', () => {
  it('keeps status, createdBy and createdAt; logs only real changes', async () => {
    const clock = testClock();
    const t = await makeTestApp({ clock });
    const su = await t.login('superadmin');
    await t.request('POST', `${R}/r2/approve`, { cookie: su });
    clock.advance(60_000);

    const res = await t.request('PATCH', `${R}/r2`, {
      cookie: await t.login('marketing'),
      body: { purpose: 'Exhibition', status: 'Pending', createdBy: 'hacker', items: [{ productName: 'Custom Laminate', qty: '3 sheets' }] },
    });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r).toMatchObject({ purpose: 'Exhibition', status: 'Approved', createdBy: null, createdAt: '2026-10-01T09:00:00.000Z' });
    expect(r.updatedAt).toBe('2026-10-01T09:01:00.000Z');
    const log = await t.data.repos.activity.list({ filters: { action: 'Edit', entityType: 'request' } });
    expect(log.rows[0]!.details).toBe('Sample request REQ-0002 for Used Party: purpose'); // same line → no "items"
  });

  it('replaces product lines', async () => {
    const t = await makeTestApp();
    const r = await (
      await t.request('PATCH', `${R}/r2`, { cookie: await t.login('admin'), body: { items: [osbLine, { productName: 'Extra', qty: '1' }] } })
    ).json();
    expect(r.items.map((i: { lineNo: number; productName: string }) => [i.lineNo, i.productName])).toEqual([
      [1, 'OSB 18mm Premium'],
      [2, 'Extra'],
    ]);
    const log = await t.data.repos.activity.list({ filters: { action: 'Edit' } });
    expect(log.rows[0]!.details).toMatch(/: items$/);
    // A request can't be left with no lines.
    expect((await t.request('PATCH', `${R}/r2`, { cookie: await t.login('admin'), body: { items: [] } })).status).toBe(422);
  });

  it('the party cannot change once a dispatch is linked', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const res = await t.request('PATCH', `${R}/r1`, { cookie, body: { partyId: 'p-free' } });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('party_locked');
    expect((await t.request('PATCH', `${R}/r2`, { cookie, body: { partyId: 'p-free' } })).status).toBe(200);
  });
});

describe('approve', () => {
  it('Pending → Approved, with a notification and log entry; approving again is a 409', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const res = await t.request('POST', `${R}/r2/approve`, { cookie });
    expect((await res.json()).status).toBe('Approved');
    const again = await t.request('POST', `${R}/r2/approve`, { cookie });
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe('invalid_status');

    const notes = await t.data.repos.notifications.list({ filters: { entityId: 'r2' } });
    expect(notes.rows.map((n) => [n.type, n.title, n.message])).toEqual([['success', 'Approved', 'REQ-0002 for Used Party approved by Admin User']]);
    const log = await t.data.repos.activity.list({ filters: { action: 'Approve' } });
    expect(log.rows[0]).toMatchObject({ entityId: 'r2', details: 'Approved sample request REQ-0002 for Used Party' });
  });

  it('two approvals at once: exactly one succeeds', async () => {
    const t = await makeTestApp();
    const [a, b] = await Promise.all([t.login('admin'), t.login('superadmin')]);
    const results = await Promise.all([t.request('POST', `${R}/r2/approve`, { cookie: a }), t.request('POST', `${R}/r2/approve`, { cookie: b })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await t.data.repos.notifications.list({ filters: { entityId: 'r2' } })).total).toBe(1);
  });

  it('is its own permission: granting approve to marketing lets them approve', async () => {
    const t = await makeTestApp();
    const mk = await t.login('marketing');
    expect((await t.request('POST', `${R}/r2/approve`, { cookie: mk })).status).toBe(403);
    await t.request('PUT', '/api/sampletrack/role-permissions/marketing', {
      cookie: await t.login('superadmin'),
      body: { pages: ['requests'], actions: ['edit', 'approve'], widgets: [] },
    });
    expect((await t.request('POST', `${R}/r2/approve`, { cookie: mk })).status).toBe(200);
  });
});

describe('delete', () => {
  it('is blocked while a dispatch is linked; otherwise soft-deletes and logs', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const blocked = await t.request('DELETE', `${R}/r1`, { cookie });
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error).toMatchObject({ code: 'has_dispatch', message: 'REQ-0001 has 1 linked dispatch and cannot be deleted' });

    expect((await t.request('DELETE', `${R}/r2`, { cookie })).status).toBe(204);
    expect((await t.request('GET', `${R}/r2`, { cookie })).status).toBe(404);
    const log = await t.data.repos.activity.list({ filters: { action: 'Delete', entityType: 'request' } });
    expect(log.rows[0]!.details).toBe('Deleted sample request REQ-0002 for Used Party');
  });
});

describe('list', () => {
  async function seeded() {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    await create(t, cookie, { partyId: 'p-free', items: [{ productName: 'Teak Veneer', qty: '1' }], requestedByUserId: 'u-admin' });
    const third = await create(t, cookie, { partyId: 'p-free', items: [osbLine] });
    await t.request('POST', `${R}/${third.body.id}/approve`, { cookie });
    return { t, cookie };
  }

  it('returns rows with tab counts that follow the search but not the status tab', async () => {
    const { t, cookie } = await seeded();
    const pending = await (await t.request('GET', `${R}?status=Pending`, { cookie })).json();
    expect(pending.total).toBe(3);
    expect(pending.counts).toEqual({ all: 4, Pending: 3, Approved: 1, Dispatched: 0, Delivered: 0 });

    const free = await (await t.request('GET', `${R}?q=free%20party&status=Approved`, { cookie })).json();
    expect(free.rows.map((r: { reqNo: string }) => r.reqNo)).toEqual(['REQ-0004']);
    expect(free.counts).toEqual({ all: 2, Pending: 1, Approved: 1, Dispatched: 0, Delivered: 0 });
  });

  it('searches request no., party, product names and requester', async () => {
    const { t, cookie } = await seeded();
    const nos = async (q: string) =>
      (await (await t.request('GET', `${R}?q=${encodeURIComponent(q)}&sort=reqNo`, { cookie })).json()).rows.map((r: { reqNo: string }) => r.reqNo);
    expect(await nos('req-0002')).toEqual(['REQ-0002']);
    expect(await nos('used party')).toEqual(['REQ-0001', 'REQ-0002']);
    expect(await nos('teak')).toEqual(['REQ-0003']);
    expect(await nos('custom laminate')).toEqual(['REQ-0002']);
    expect(await nos('marketing user')).toEqual(['REQ-0002']);
    expect(await nos('admin user')).toEqual(['REQ-0003', 'REQ-0004']); // REQ-0004 defaulted to its creator
  });

  it('filters, sorts and pages (default 10)', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    for (let i = 0; i < 11; i++) await create(t, cookie, { partyId: 'p-free', items: [osbLine] });
    const first = await (await t.request('GET', R, { cookie })).json();
    expect(first.rows).toHaveLength(10);
    expect(first.total).toBe(13);
    const byNo = await (await t.request('GET', `${R}?sort=-reqNo&pageSize=2`, { cookie })).json();
    expect(byNo.rows.map((r: { reqNo: string }) => r.reqNo)).toEqual(['REQ-0013', 'REQ-0012']);
    const party = await (await t.request('GET', `${R}?partyId=p-used`, { cookie })).json();
    expect(party.total).toBe(2);
    expect((await t.request('GET', `${R}?status=Cancelled`, { cookie })).status).toBe(422);
  });

  it('pending-count counts every Pending request', async () => {
    const { t, cookie } = await seeded();
    expect(await (await t.request('GET', `${R}/pending-count`, { cookie })).json()).toEqual({ count: 3 });
  });
});

describe('create dispatch from request', () => {
  it('returns party, "name qty, name qty" and the link, and writes nothing', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const { body } = await create(t, cookie, {
      partyId: 'p-free',
      items: [osbLine, { productName: 'Custom Laminate', qty: '2 sheets' }, { productName: 'No Qty' }],
    });
    const before = (await t.data.repos.activity.list({})).total;
    const draft = await (await t.request('GET', `${R}/${body.id}/dispatch-draft`, { cookie: await t.login('dispatch') })).json();
    expect(draft).toEqual({
      partyId: 'p-free',
      partyName: 'Free Party',
      productDescription: 'OSB 18mm Premium 5 sheets, Custom Laminate 2 sheets, No Qty',
      linkedRequestId: body.id,
      linkedRequestNo: 'REQ-0003',
      requestStatus: 'Pending',
    });
    expect((await t.data.repos.activity.list({})).total).toBe(before + 1); // only the dispatch user's login
  });
});

describe('export', () => {
  it('writes the agreed columns for the matching requests', async () => {
    const t = await makeTestApp();
    const res = await t.request('GET', `${R}/export?status=Pending&sort=reqNo`, { cookie: await t.login('admin') });
    expect(res.headers.get('content-disposition')).toMatch(/SampleRequests-2026-10-01\.xlsx/);
    const ws = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' }).Sheets['SampleRequests']!;
    const [header, ...rows] = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
    expect(header).toEqual(['Request ID', 'Date', 'Party', 'Products', 'Purpose', 'Priority', 'Required Date', 'Requested By', 'Status', 'Remarks']);
    expect(rows).toEqual([
      ['REQ-0001', '2026-09-30', 'Used Party', 'Used Product 1 sheets', '', 'Normal', '', '', 'Pending', ''],
      ['REQ-0002', '2026-09-30', 'Used Party', 'Custom Laminate 3 sheets', 'Testing', 'High', '', 'Marketing User', 'Pending', ''],
    ]);
  });
});
