import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { DISPATCH_STATUSES, type DispatchStatus } from '../src/contracts/sampletrack';
import { buildTimeline, resolveTracking } from '../src/modules/sampletrack/dispatches/tracking';
import { memoryDataLayerFrom } from '../src/repos/memory';
import { courier, makeTestApp, seedUsers, testClock, testData, type TestApp } from './helpers';

const D = '/api/sampletrack/dispatches';
const base = { partyId: 'p-free', mode: 'Courier', courierId: 'c-free', weightKg: 3 };

async function create(t: TestApp, cookie: string, body: Record<string, unknown>) {
  const res = await t.request('POST', D, { cookie, body });
  return { status: res.status, body: await res.json() };
}

/** Creates REQ for p-free (Pending) and returns its id. */
async function newRequest(t: TestApp, cookie: string, partyId = 'p-free') {
  const res = await t.request('POST', '/api/sampletrack/requests', {
    cookie,
    body: { partyId, items: [{ productName: 'OSB sample', qty: '2 sheets' }] },
  });
  return (await res.json()).id as string;
}

const requestStatus = async (t: TestApp, id: string) => (await t.data.repos.requests.getById(id))!.status;
const historyOf = async (t: TestApp, id: string) =>
  (await t.data.repos.dispatches.history(id)).map((h) => [h.status, h.changedBy, h.note]);

describe('create', () => {
  it('assigns the next DSP number, records the first history row and an info notification', async () => {
    const t = await makeTestApp();
    const { status, body } = await create(t, await t.login('dispatch'), { ...base, trackingNo: 'X1', freightPaise: 45000 });
    expect(status).toBe(201);
    expect(body).toMatchObject({
      dspNo: 'DSP-0002',
      date: '2026-10-01',
      status: 'Pending',
      partyName: 'Free Party',
      partyCity: 'Rajkot',
      courierName: 'Free Courier',
      freightPaise: 45000,
      overdue: false,
      tracking: { kind: 'text', text: 'Contact courier with tracking number: X1' },
      createdBy: 'u-dispatch',
    });
    expect(await historyOf(t, body.id)).toEqual([['Pending', 'u-dispatch', 'Created']]);
    const notes = await t.data.repos.notifications.list({ filters: { entityId: body.id } });
    expect(notes.rows.map((n) => [n.type, n.title, n.message])).toEqual([['info', 'Dispatch Created', 'DSP-0002 for Free Party']]);
  });

  it('numbers stay unique under concurrency, and a failed create uses none', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    await create(t, cookie, { ...base, partyId: 'ghost' });
    const made = await Promise.all(Array.from({ length: 4 }, () => create(t, cookie, base)));
    expect(made.map((m) => m.body.dspNo).sort()).toEqual(['DSP-0002', 'DSP-0003', 'DSP-0004', 'DSP-0005']);
  });

  it('requires party, mode and a weight above 0', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const paths = async (body: Record<string, unknown>) => {
      const r = await create(t, cookie, body);
      expect(r.status, JSON.stringify(body)).toBe(422);
      return r.body.error.details.map((d: { path: string }) => d.path).sort();
    };
    expect(await paths({ mode: 'Courier', weightKg: 1 })).toEqual(['partyId']);
    expect(await paths({ partyId: 'p-free', weightKg: 1 })).toEqual(['mode']);
    expect(await paths({ partyId: 'p-free', mode: 'Courier', courierId: 'c-free' })).toEqual(['weightKg']);
    expect(await paths({ ...base, weightKg: 0 })).toEqual(['weightKg']);
    expect(await paths({ ...base, weightKg: -2 })).toEqual(['weightKg']);
    expect(await paths({ ...base, mode: 'Ship' })).toEqual(['mode']);
    expect(await paths({ ...base, status: 'Lost' })).toEqual(['status']);
    expect(await paths({ ...base, date: '2026-10-05', expectedDeliveryDate: '2026-10-04' })).toEqual(['expectedDeliveryDate']);
  });

  it('courier: from the master (matching the mode, active) or a manual name, not both', async () => {
    const data = testData(await seedUsers());
    data.couriers.push(courier('c-old', { name: 'Old Courier', status: 'Inactive' }));
    const t = await makeTestApp({ data: memoryDataLayerFrom(data) });
    const cookie = await t.login('admin');
    const err = async (body: Record<string, unknown>) => (await create(t, cookie, body)).body.error?.details?.[0];

    expect(await err({ ...base, courierNameManual: 'Shree' })).toMatchObject({ path: 'courierNameManual' });
    expect(await err({ ...base, courierId: undefined })).toMatchObject({ path: 'courierId', message: 'Select a courier or enter its name' });
    expect(await err({ ...base, courierId: 'c-used' })).toMatchObject({ message: 'Used Transport is a Transport, not a Courier' });
    expect(await err({ ...base, courierId: 'c-old' })).toMatchObject({ message: 'Old Courier is inactive' });
    expect(await err({ ...base, courierId: 'ghost' })).toMatchObject({ message: 'Courier not found' });

    const manual = await create(t, cookie, { ...base, courierId: null, courierNameManual: 'Shree Maruti' });
    expect(manual.body).toMatchObject({ courierId: null, courierName: 'Shree Maruti' });
    const hand = await create(t, cookie, { partyId: 'p-free', mode: 'Hand Delivery', weightKg: 1 });
    expect(hand.status).toBe(201);
    const handWithAny = await create(t, cookie, { partyId: 'p-free', mode: 'Hand Delivery', courierId: 'c-used', weightKg: 1 });
    expect(handWithAny.status).toBe(201);
  });

  it('a linked request must exist and be for the same party', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    expect((await create(t, cookie, { ...base, linkedRequestId: 'r2' })).body.error.details[0]).toMatchObject({
      path: 'linkedRequestId',
      message: 'REQ-0002 is for a different party',
    });
    expect((await create(t, cookie, { ...base, linkedRequestId: 'ghost' })).status).toBe(422);
  });
});

describe('status transitions and history', () => {
  it('accepts each of the 8 statuses and appends a history row with user and time for every change', async () => {
    const clock = testClock();
    const t = await makeTestApp({ clock });
    const cookie = await t.login('dispatch');
    const sequence: DispatchStatus[] = ['Approved', 'Packed', 'Dispatched', 'In Transit', 'Delayed', 'In Transit', 'Returned', 'Delivered'];
    for (const status of sequence) {
      clock.advance(60_000);
      const res = await t.request('POST', `${D}/d1/status`, { cookie, body: { status, note: `to ${status}` } });
      expect(res.status, status).toBe(200);
      expect((await res.json()).status).toBe(status);
    }
    expect(new Set(['Pending', ...sequence])).toEqual(new Set(DISPATCH_STATUSES));
    const history = await t.data.repos.dispatches.history('d1');
    expect(history.map((h) => h.status)).toEqual(['Pending', ...sequence]);
    expect(history.slice(1).every((h) => h.changedBy === 'u-dispatch' && h.changedByName === 'Dispatch User')).toBe(true);
    expect(history.at(-1)).toMatchObject({ note: 'to Delivered', changedAt: '2026-10-01T09:08:00.000Z' });
  });

  it('rejects anything that is not one of the 8 statuses, on both paths', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('dispatch');
    for (const status of ['Lost', 'delivered', '', null]) {
      expect((await t.request('POST', `${D}/d1/status`, { cookie, body: { status } })).status).toBe(422);
      expect((await t.request('PATCH', `${D}/d1`, { cookie, body: { status } })).status).toBe(422);
    }
    expect(await historyOf(t, 'd1')).toHaveLength(1);
  });

  it('the edit form path behaves exactly like the quick update (history + note), alongside field edits', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('dispatch');
    const res = await t.request('PATCH', `${D}/d1`, {
      cookie,
      body: { trackingNo: 'GT-1', weightKg: 12, status: 'Packed', statusNote: 'Boxed' },
    });
    expect(await res.json()).toMatchObject({ status: 'Packed', trackingNo: 'GT-1', weightKg: 12 });
    expect(await historyOf(t, 'd1')).toEqual([
      ['Pending', null, 'Created'],
      ['Packed', 'u-dispatch', 'Boxed'],
    ]);
    const log = await t.data.repos.activity.list({ filters: { entityType: 'dispatch' }, sort: 'createdAt' });
    expect(log.rows.map((r) => [r.action, r.details])).toEqual([
      ['Edit', 'Dispatch DSP-0001 for Used Party: trackingNo, weightKg'],
      ['StatusChange', 'Dispatch DSP-0001: Pending → Packed (Boxed)'],
    ]);
  });

  it('the same status again is a no-op: no history row', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('dispatch');
    await t.request('POST', `${D}/d1/status`, { cookie, body: { status: 'Pending' } });
    await t.request('PATCH', `${D}/d1`, { cookie, body: { status: 'Pending' } });
    expect(await historyOf(t, 'd1')).toHaveLength(1);
  });

  it('weight can be edited but never to 0 or empty', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('dispatch');
    expect((await t.request('PATCH', `${D}/d1`, { cookie, body: { weightKg: 0 } })).status).toBe(422);
    expect((await t.request('PATCH', `${D}/d1`, { cookie, body: { weightKg: null } })).status).toBe(422);
  });

  it('Delayed and Delivered notify (warning / success)', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('dispatch');
    await t.request('POST', `${D}/d1/status`, { cookie, body: { status: 'Delayed' } });
    await t.request('POST', `${D}/d1/status`, { cookie, body: { status: 'Delivered' } });
    const notes = await t.data.repos.notifications.list({ filters: { entityId: 'd1' }, sort: 'createdAt' });
    expect(notes.rows.map((n) => [n.type, n.title, n.message])).toEqual([
      ['warning', 'Delay Alert', 'DSP-0001 to Used Party is delayed'],
      ['success', 'Delivered', 'DSP-0001 delivered to Used Party'],
    ]);
  });

  it('creating straight into Delivered also notifies and syncs', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const req = await newRequest(t, cookie);
    const { body } = await create(t, cookie, { ...base, status: 'Delivered', linkedRequestId: req });
    expect((await t.data.repos.notifications.list({ filters: { entityId: body.id } })).rows.map((n) => n.title).sort()).toEqual([
      'Delivered',
      'Dispatch Created',
    ]);
    expect(await requestStatus(t, req)).toBe('Delivered');
  });
});

describe('request sync', () => {
  it.each<[DispatchStatus, string]>([
    ['Pending', 'Pending'],
    ['Approved', 'Pending'],
    ['Packed', 'Pending'],
    ['Dispatched', 'Dispatched'],
    ['In Transit', 'Dispatched'],
    ['Delayed', 'Pending'],
    ['Returned', 'Pending'],
    ['Delivered', 'Delivered'],
  ])('dispatch → %s sets a Pending request to %s', async (to, expected) => {
    const t = await makeTestApp();
    await t.request('POST', `${D}/d1/status`, { cookie: await t.login('dispatch'), body: { status: to } });
    expect(await requestStatus(t, 'r1')).toBe(expected);
  });

  it('works from an Approved request too, and logs the request change', async () => {
    const t = await makeTestApp();
    await t.request('POST', '/api/sampletrack/requests/r1/approve', { cookie: await t.login('admin') });
    await t.request('PATCH', `${D}/d1`, { cookie: await t.login('dispatch'), body: { status: 'In Transit' } });
    expect(await requestStatus(t, 'r1')).toBe('Dispatched');
    const log = await t.data.repos.activity.list({ filters: { entityType: 'request', action: 'StatusChange' } });
    expect(log.rows[0]!.details).toBe('Sample request REQ-0001: Approved → Dispatched (dispatch DSP-0001 is In Transit)');
  });

  it('never moves a request backwards', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('dispatch');
    await t.request('POST', `${D}/d1/status`, { cookie, body: { status: 'Delivered' } });
    for (const status of ['In Transit', 'Dispatched', 'Returned', 'Pending'] as const) {
      await t.request('POST', `${D}/d1/status`, { cookie, body: { status } });
      expect(await requestStatus(t, 'r1')).toBe('Delivered');
    }
  });

  it('linking a request on edit brings it up to the dispatch’s current status', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const req = await newRequest(t, cookie);
    const { body } = await create(t, cookie, { ...base, status: 'Dispatched' });
    expect(await requestStatus(t, req)).toBe('Pending');
    await t.request('PATCH', `${D}/${body.id}`, { cookie, body: { linkedRequestId: req } });
    expect(await requestStatus(t, req)).toBe('Dispatched');
  });

  it('unlinked dispatches touch no request', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const { body } = await create(t, cookie, base);
    await t.request('POST', `${D}/${body.id}/status`, { cookie, body: { status: 'Delivered' } });
    expect((await t.data.repos.requests.countByStatus({})).Delivered).toBe(0);
  });

  it('is one transaction: if any later step fails, status, history, request and log all roll back', async () => {
    const t = await makeTestApp();
    const dispatcher = { id: 'u-dispatch', name: 'Dispatch User', role: 'dispatch' as const };
    const before = (await t.data.repos.activity.list({})).total;
    // Break the step that runs last (the Delivered notification is written after status + history, before the request sync).
    t.data.repos.notifications.create = async () => {
      throw new Error('notification store down');
    };
    await expect(t.services.dispatches.changeStatus(dispatcher, 'd1', 'Delivered', null)).rejects.toThrow('notification store down');
    expect((await t.data.repos.dispatches.getById('d1'))!.status).toBe('Pending');
    expect(await historyOf(t, 'd1')).toHaveLength(1);
    expect(await requestStatus(t, 'r1')).toBe('Pending');
    expect((await t.data.repos.activity.list({})).total).toBe(before);
  });
});

describe('overdue, list and export', () => {
  async function withDispatches() {
    const clock = testClock(new Date('2026-10-10T06:00:00Z'));
    const t = await makeTestApp({ clock, config: { sessionIdleHours: 1000 } });
    const cookie = await t.login('admin');
    const mk = async (over: Record<string, unknown>) => (await create(t, cookie, { ...base, date: '2026-10-01', ...over })).body;
    const late = await mk({ expectedDeliveryDate: '2026-10-05', trackingNo: 'BD555' });
    const onTime = await mk({ expectedDeliveryDate: '2026-10-12' });
    const lateDelivered = await mk({ expectedDeliveryDate: '2026-10-03', status: 'Delivered' });
    const dueToday = await mk({ expectedDeliveryDate: '2026-10-10', status: 'In Transit' });
    return { t, cookie, late, onTime, lateDelivered, dueToday };
  }

  it('overdue = expected date before today (India) and not Delivered/Returned; status is never changed', async () => {
    const { t, cookie, late, onTime, lateDelivered, dueToday } = await withDispatches();
    const get = async (id: string) => (await t.request('GET', `${D}/${id}`, { cookie })).json();
    expect((await get(late.id)).overdue).toBe(true);
    expect((await get(late.id)).status).toBe('Pending');
    expect((await get(onTime.id)).overdue).toBe(false);
    expect((await get(lateDelivered.id)).overdue).toBe(false);
    expect((await get(dueToday.id)).overdue).toBe(false);
    const list = await (await t.request('GET', `${D}?overdue=true`, { cookie })).json();
    expect(list.rows.map((d: { id: string }) => d.id)).toEqual([late.id]);
  });

  it('filters by mode and by every one of the 8 statuses; searches dsp no, tracking no and party', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    for (const status of DISPATCH_STATUSES) {
      if (status !== 'Pending') await create(t, cookie, { ...base, status, trackingNo: `TRK-${status}` });
    }
    await create(t, cookie, { partyId: 'p-free', mode: 'Hand Delivery', weightKg: 1 });
    for (const status of DISPATCH_STATUSES) {
      const res = await (await t.request('GET', `${D}?status=${encodeURIComponent(status)}`, { cookie })).json();
      expect(res.total, status).toBe(status === 'Pending' ? 2 : 1);
    }
    expect((await (await t.request('GET', `${D}?mode=Hand%20Delivery`, { cookie })).json()).total).toBe(1);
    const q = async (s: string) => (await (await t.request('GET', `${D}?q=${encodeURIComponent(s)}`, { cookie })).json()).total;
    expect(await q('dsp-0001')).toBe(1);
    expect(await q('trk-in transit')).toBe(1);
    expect(await q('used party')).toBe(1);
    expect(await q('free party')).toBe(8);
  });

  it('exports the dispatch register', async () => {
    const { t, cookie } = await withDispatches();
    const res = await t.request('GET', `${D}/export?overdue=true`, { cookie });
    expect(res.headers.get('content-disposition')).toMatch(/DispatchRegister-2026-10-10\.xlsx/);
    const ws = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' }).Sheets['DispatchRegister']!;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    expect(rows).toEqual([
      expect.objectContaining({
        'Dispatch ID': 'DSP-0002',
        Party: 'Free Party',
        City: 'Rajkot',
        Courier: 'Free Courier',
        'Tracking No': 'BD555',
        Mode: 'Courier',
        'Weight (KG)': 3,
        'Expected Delivery': '2026-10-05',
        Status: 'Pending',
        Overdue: 'Yes',
      }),
    ]);
  });
});

describe('delete', () => {
  it('soft-deletes and leaves the linked request as it was', async () => {
    const t = await makeTestApp();
    await t.request('POST', `${D}/d1/status`, { cookie: await t.login('dispatch'), body: { status: 'Dispatched' } });
    const admin = await t.login('admin');
    expect((await t.request('DELETE', `${D}/d1`, { cookie: admin })).status).toBe(204);
    expect((await t.request('GET', `${D}/d1`, { cookie: admin })).status).toBe(404);
    expect(await requestStatus(t, 'r1')).toBe('Dispatched');
    // The request can be deleted now that no live dispatch is linked.
    expect((await t.request('DELETE', '/api/sampletrack/requests/r1', { cookie: admin })).status).toBe(204);
  });
});

describe('form pickers', () => {
  it('party options and linkable requests (not Delivered) for the dispatch role', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('dispatch');
    expect(await (await t.request('GET', `${D}/party-options?q=free`, { cookie })).json()).toEqual([{ id: 'p-free', name: 'Free Party', city: 'Rajkot' }]);
    const reqs = await (await t.request('GET', `${D}/request-options?partyId=p-used`, { cookie })).json();
    expect(reqs.map((r: { reqNo: string; productSummary: string }) => [r.reqNo, r.productSummary])).toEqual([
      ['REQ-0002', 'Custom Laminate 3 sheets'],
      ['REQ-0001', 'Used Product 1 sheets'],
    ]);
  });
});

describe('live tracking', () => {
  it('lists shipments with search by id/party', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('marketing');
    const res = await (await t.request('GET', '/api/sampletrack/tracking?q=used', { cookie })).json();
    expect(res.rows.map((d: { dspNo: string }) => d.dspNo)).toEqual(['DSP-0001']);
  });

  it('detail: timeline with times from history; skipped steps done without a time; Delayed off-path', async () => {
    const clock = testClock();
    const t = await makeTestApp({ clock });
    const cookie = await t.login('dispatch');
    for (const status of ['Dispatched', 'In Transit', 'Delayed'] as const) {
      clock.advance(3_600_000);
      await t.request('POST', `${D}/d1/status`, { cookie, body: { status, note: status === 'Delayed' ? 'Stuck at hub' : null } });
    }
    const detail = await (await t.request('GET', '/api/sampletrack/tracking/d1', { cookie: await t.login('marketing') })).json();
    expect(detail.timeline.map((s: { status: string; state: string; at: string | null }) => [s.status, s.state, s.at])).toEqual([
      ['Pending', 'done', '2026-10-01T09:00:00.000Z'],
      ['Approved', 'done', null],
      ['Packed', 'done', null],
      ['Dispatched', 'done', '2026-10-01T10:00:00.000Z'],
      ['In Transit', 'done', '2026-10-01T11:00:00.000Z'],
      ['Delivered', 'pending', null],
    ]);
    expect(detail.offPath).toEqual([{ status: 'Delayed', at: '2026-10-01T12:00:00.000Z', by: 'Dispatch User', note: 'Stuck at hub', current: true }]);
    expect(detail.history).toHaveLength(4);
    expect(detail.dispatch.status).toBe('Delayed');

    // Back on the path: the Delayed event stays in the list but is no longer current.
    await t.request('POST', `${D}/d1/status`, { cookie, body: { status: 'Delivered' } });
    const after = await (await t.request('GET', '/api/sampletrack/tracking/d1', { cookie })).json();
    expect(after.timeline.at(-1)).toMatchObject({ status: 'Delivered', state: 'done', by: 'Dispatch User' });
    expect(after.offPath[0].current).toBe(false);
  });

  it('timeline marks the current on-path step', () => {
    const h = (status: DispatchStatus, at: string) => ({
      id: at,
      dispatchId: 'd',
      status,
      changedBy: null,
      changedByName: null,
      changedAt: at,
      note: null,
      createdBy: null,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    });
    const { timeline, offPath } = buildTimeline('Packed', [h('Pending', 't1'), h('Packed', 't2')]);
    expect(timeline.map((s) => s.state)).toEqual(['done', 'done', 'current', 'pending', 'pending', 'pending']);
    expect(offPath).toEqual([]);
    const returned = buildTimeline('Returned', [h('Pending', 't1'), h('Dispatched', 't2'), h('Returned', 't3')]);
    expect(returned.timeline.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done', 'pending', 'pending']);
    expect(returned.offPath).toEqual([expect.objectContaining({ status: 'Returned', current: true })]);
  });
});

describe('tracking URL resolver', () => {
  it('uses the courier template, else built-ins by name, else a text hint', () => {
    expect(resolveTracking('AB 1', 'Anything', 'https://t.example/?n={tracking}')).toEqual({ kind: 'url', url: 'https://t.example/?n=AB%201' });
    expect(resolveTracking('X', 'Anything', 'https://t.example/static')).toEqual({ kind: 'url', url: 'https://t.example/static' });
    expect(resolveTracking('BD1', 'Blue Dart', null)).toEqual({ kind: 'url', url: 'https://www.bluedart.com/tracking?trackfor=BD1' });
    expect(resolveTracking('D1', '  dtdc ', null)).toEqual({ kind: 'url', url: 'https://www.dtdc.in/tracking.asp?REF_NO=D1' });
    expect(resolveTracking('DL1', 'DELHIVERY', '')).toEqual({ kind: 'url', url: 'https://www.delhivery.com/track/package/DL1' });
    expect(resolveTracking('GT9', 'Gujarat Transport', null)).toEqual({ kind: 'text', text: 'Contact courier with tracking number: GT9' });
    expect(resolveTracking('  ', 'Blue Dart', null)).toBeNull();
  });

  it('is applied on dispatch views, including for manual courier names', async () => {
    const t = await makeTestApp();
    const { body } = await create(t, await t.login('admin'), { ...base, courierId: null, courierNameManual: 'Blue Dart', trackingNo: 'BD9' });
    expect(body.tracking).toEqual({ kind: 'url', url: 'https://www.bluedart.com/tracking?trackfor=BD9' });
  });
});
