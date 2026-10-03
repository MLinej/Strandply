import { describe, expect, it } from 'vitest';
import { rcCheck } from '../src/contracts/transport';
import { buildSeed } from '../src/seed';
import { upgradeSnapshot } from '../src/seed/upgrades';
import { makeTestApp, T0 } from './helpers';

const TR = '/api/transport';

async function as(role = 'admin') {
  const t = await makeTestApp();
  const cookie = await t.login(role);
  const call = (method: string, path: string, body?: unknown) => t.request(method, `${TR}${path}`, { cookie, body });
  const json = async (method: string, path: string, body?: unknown) => (await call(method, path, body)).json();
  return { t, cookie, call, json };
}
const paths = async (res: Response) => ((await res.json()) as { error: { details: { path: string }[] } }).error.details.map((d) => d.path);
const sheet = (text: string) => {
  const f = new FormData();
  f.append('file', new File([text], 'transporters.csv', { type: 'text/csv' }));
  return f;
};
const quotes = [
  { transporterId: 'trt-a', ratePaise: 2_100_000, transit: '2 Days' },
  { transporterId: 'trt-b', ratePaise: 1_950_000, transit: '1 Day', mgWeightMt: 9 },
  { transporterId: 'trt-c', ratePaise: 0 },
];

describe('rules', () => {
  it('rcCheck: the lowest non-zero rate; a reason is needed for anything else, or over budget', () => {
    const q = [{ ratePaise: 0 }, { ratePaise: 1_900_000 }, { ratePaise: 1_800_000 }];
    expect(rcCheck(q, 2, 2_000_000)).toEqual({ lowestPaise: 1_800_000, selectedPaise: 1_800_000, isLowest: true, exceedsBudget: false, needsJustification: false });
    expect(rcCheck(q, 1, 2_000_000)).toMatchObject({ isLowest: false, needsJustification: true });
    expect(rcCheck(q, 2, 1_500_000)).toMatchObject({ isLowest: true, exceedsBudget: true, needsJustification: true });
    expect(rcCheck(q, 2, 0)).toMatchObject({ exceedsBudget: false, needsJustification: false });
    expect(rcCheck(q, null, 0)).toMatchObject({ selectedPaise: null, needsJustification: false });
    expect(rcCheck([], null, 0).lowestPaise).toBeNull();
  });
});

describe('freight flow', () => {
  it('inquiry → rate comparison → approval (rejected, reworked, exception-approved) → order form → delivered', async () => {
    const { call, json } = await as();
    expect(await paths(await call('POST', '/inquiries', { from: { city: '' } }))).toEqual(['from.city', 'to', 'material', 'vehicle']);
    const inq = await json('POST', '/inquiries', { from: { city: 'Halvad', state: 'Gujarat', pincode: '363330' }, to: { city: 'Pune' }, material: 'OSB 12mm', weightMt: 8, vehicle: '32FT (10T)', budgetPaise: 2_000_000 });
    expect(inq).toMatchObject({ inqNo: 'INQ-26-007', date: '2026-10-01', status: 'open', deliveryType: 'Door Delivery', freightPaidBy: 'Strandply', rcId: null });

    // Zero rates are kept as "no quote"; the selected one must have a rate.
    expect((await call('PUT', `/inquiries/${inq.id}/rates`, { quotes, selected: 2 })).status).toBe(422);
    const draft = await json('PUT', `/inquiries/${inq.id}/rates`, { quotes, selected: 0 });
    expect(draft).toMatchObject({ rcNo: 'RC-26-005', status: 'draft', selected: 0, approvalNo: null });
    expect(draft.quotes.map((q: { transporterName: string; rating: number }) => [q.transporterName, q.rating])).toEqual([['Alpha Roadways', 4], ['Bharat Carriers', 3], ['Chetak Logistics', 4]]);
    expect(await json('GET', `/rates/${draft.id}`)).toMatchObject({ lowestPaise: 1_950_000, isLowest: false, exceedsBudget: true, needsJustification: true, inqNo: 'INQ-26-007' });

    // Not the lowest and over budget: submitting asks for a reason.
    expect(await paths(await call('POST', `/rates/${draft.id}/submit`))).toEqual(['justification']);
    await json('PUT', `/inquiries/${inq.id}/rates`, { quotes, selected: 0, justification: 'Bharat has no truck till Monday' });
    const sent = await json('POST', `/rates/${draft.id}/submit`);
    expect(sent).toMatchObject({ status: 'pending', approvalNo: 'FRA-26-004' });
    expect((await json('GET', `/inquiries/${inq.id}`)).status).toBe('rate_compared');
    expect((await call('PATCH', `/inquiries/${inq.id}`, { material: 'OSB 18mm' })).status).toBe(409);
    expect((await call('PUT', `/inquiries/${inq.id}/rates`, { quotes, selected: 1 })).status).toBe(409);
    expect((await call('POST', `/rates/${draft.id}/order`)).status).toBe(409);

    // Rejecting needs a reason; the comparison can then be reworked, which reopens it.
    expect(await paths(await call('POST', `/rates/${draft.id}/decision`, { decision: 'reject' }))).toEqual(['note']);
    expect(await json('POST', `/rates/${draft.id}/decision`, { decision: 'reject', note: 'Ask Bharat again' })).toMatchObject({ status: 'rejected' });
    expect((await json('GET', `/inquiries/${inq.id}`)).status).toBe('rejected');
    expect((await call('PATCH', `/inquiries/${inq.id}`, { remarks: 'Covered truck' })).status).toBe(200);
    const reworked = await json('PUT', `/inquiries/${inq.id}/rates`, { quotes, selected: 0, justification: 'Bharat still has no truck' });
    expect(reworked).toMatchObject({ status: 'draft', approvalNo: 'FRA-26-004' });
    expect(reworked.trail.map((s: { action: string }) => s.action)).toEqual(['submitted', 'rejected', 'reopened']);
    expect((await json('GET', `/inquiries/${inq.id}`)).status).toBe('open');

    await json('POST', `/rates/${draft.id}/submit`);
    const ok = await json('POST', `/rates/${draft.id}/decision`, { decision: 'approve' });
    expect(ok.status).toBe('approved');
    expect(ok.trail.at(-1)).toMatchObject({ action: 'exception_approved', byName: 'Admin User' });

    const order = await json('POST', `/rates/${draft.id}/order`);
    expect(order).toMatchObject({ orderNo: 'SFO-26-002', date: '2026-10-01', transporterId: 'trt-a', ratePaise: 2_100_000, transit: '2 Days', status: 'issued', inqNo: 'INQ-26-007', approvalNo: 'FRA-26-004' });
    expect(order.transporter).toMatchObject({ name: 'Alpha Roadways', phone: '9825000001', creditTerms: 'Against Delivery' });
    expect(order.to).toEqual({ city: 'Pune', state: null, pincode: null });
    expect((await call('POST', `/rates/${draft.id}/order`)).status).toBe(409);
    expect(await json('GET', `/inquiries/${inq.id}`)).toMatchObject({ status: 'ordered', orderNo: 'SFO-26-002', rcStatus: 'approved' });
    expect(await json('PATCH', `/orders/${order.id}`, { status: 'delivered' })).toMatchObject({ status: 'delivered', deliveredOn: '2026-10-01' });
  });

  it('cancelling an order frees the comparison for a new one; a cancelled order is closed', async () => {
    const { call, json } = await as('dispatch');
    expect(await json('PATCH', '/orders/sfo-1', { status: 'cancelled', remarks: 'Truck broke down' })).toMatchObject({ status: 'cancelled', deliveredOn: null });
    expect((await json('GET', '/inquiries/inq-4')).status).toBe('approved');
    expect((await call('PATCH', '/orders/sfo-1', { status: 'issued' })).status).toBe(409);
    expect(await json('POST', '/rates/rc-4/order')).toMatchObject({ orderNo: 'SFO-26-002', status: 'issued' });
    expect((await json('GET', '/orders?transporterId=trt-a')).total).toBe(2);
  });

  it('cancel and reopen an inquiry; not while waiting for approval or ordered', async () => {
    const { call, json } = await as('dispatch');
    expect((await call('POST', '/inquiries/inq-2/cancel')).status).toBe(409);
    expect((await call('POST', '/inquiries/inq-4/cancel')).status).toBe(409);
    expect((await json('POST', '/inquiries/inq-5/cancel')).status).toBe('cancelled');
    expect((await call('POST', '/inquiries/inq-5/cancel')).status).toBe(409);
    expect((await call('PUT', '/inquiries/inq-5/rates', { quotes: [] })).status).toBe(409);
    expect((await call('PATCH', '/inquiries/inq-5', { remarks: 'x' })).status).toBe(409);
    expect((await json('POST', '/inquiries/inq-5/reopen')).status).toBe('open');
    expect((await call('POST', '/inquiries/inq-1/reopen')).status).toBe(409);
    // Reopening an inquiry whose comparison is approved puts it back at approved.
    expect((await json('POST', '/inquiries/inq-3/cancel')).status).toBe('cancelled');
    expect((await json('POST', '/inquiries/inq-3/reopen')).status).toBe('approved');
  });

  it('past quotes: earlier rates on the same route and vehicle, newest per transporter, cheapest first', async () => {
    const { json } = await as();
    expect(await json('GET', '/inquiries/inq-1/past-quotes')).toEqual([
      { transporterId: 'trt-a', transporterName: 'Alpha Roadways', ratePaise: 1_800_000, transit: '2 Days', rcNo: 'RC-26-002', date: '2026-09-22' },
      { transporterId: 'trt-b', transporterName: 'Bharat Carriers', ratePaise: 1_900_000, transit: '1 Day', rcNo: 'RC-26-002', date: '2026-09-22' },
    ]);
    expect(await json('GET', '/inquiries/inq-5/past-quotes')).toEqual([]);
  });

  it('lists filter by status, vehicle and date; views link inquiry, comparison and order', async () => {
    const { json } = await as();
    expect((await json('GET', '/inquiries?status=open')).rows.map((r: { id: string }) => r.id)).toEqual(['inq-5', 'inq-1']);
    expect((await json('GET', '/inquiries?vehicle=Open%20Body')).rows.map((r: { id: string }) => r.id)).toEqual(['inq-5']);
    expect((await json('GET', '/inquiries?from=2026-09-24')).total).toBe(3);
    expect((await json('GET', '/inquiries/inq-4'))).toMatchObject({ rcNo: 'RC-26-004', rcStatus: 'approved', orderNo: 'SFO-26-001' });
    expect((await json('GET', '/rates?status=pending')).rows.map((r: { rcNo: string; inqNo: string }) => [r.rcNo, r.inqNo])).toEqual([['RC-26-002', 'INQ-26-002']]);
    expect(await json('GET', '/rates/rc-4')).toMatchObject({ orderNo: 'SFO-26-001', isLowest: true });
  });
});

describe('masters', () => {
  it('transporters: TRP codes, unique names, filters; quoted ones can only be deactivated', async () => {
    const { call, json } = await as();
    const t = await json('POST', '/transporters', { name: 'Delta Roadlines', phone: '9825099999', city: 'Baroda', vehicles: ['Open Body', 'Open Body'], operatingCities: [{ city: 'Pune' }], gstin: '24abcde1234f1z5' });
    expect(t).toMatchObject({ code: 'TRP-26-004', vehicles: ['Open Body'], rating: 3, tds: false, creditTerms: 'Against Delivery', gstin: '24ABCDE1234F1Z5', active: true });
    expect((await call('POST', '/transporters', { name: ' delta roadlines', phone: '9825099998', city: 'Baroda', vehicles: ['LCV (1-2T)'] })).status).toBe(409);
    expect(await paths(await call('POST', '/transporters', { name: 'X', phone: '12', city: 'Y', vehicles: [], pan: 'bad' }))).toEqual(['phone', 'pan', 'vehicles']);
    expect((await json('GET', '/transporters?vehicle=Open%20Body')).rows.map((r: { id: string }) => r.id)).toEqual(['trt-c', t.id]);
    expect((await json('GET', '/transporters?operatesIn=pune')).rows.map((r: { id: string }) => r.id)).toEqual([t.id]);
    expect((await call('DELETE', '/transporters/trt-a')).status).toBe(409);
    expect(await json('PATCH', '/transporters/trt-a', { active: false })).toMatchObject({ active: false, name: 'Alpha Roadways' });
    expect((await json('GET', '/meta')).transporters.map((x: { id: string }) => x.id)).toEqual(['trt-b', 'trt-c', t.id]);
    expect((await call('DELETE', `/transporters/${t.id}`)).status).toBe(204);
  });

  it('vehicle types: a rename follows onto transporters; types on inquiries can only be deactivated', async () => {
    const { call, json } = await as();
    expect((await call('POST', '/vehicles', { name: ' open body ' })).status).toBe(409);
    await json('PATCH', '/vehicles/trv-open', { name: 'Open Body (Flatbed)' });
    expect((await json('GET', '/transporters/trt-c')).vehicles).toEqual(['Open Body (Flatbed)']);
    expect((await call('DELETE', '/vehicles/trv-32ft')).status).toBe(409);
    expect(await json('PATCH', '/vehicles/trv-32ft', { active: false })).toMatchObject({ active: false });
    expect((await json('GET', '/meta')).vehicles).not.toContain('32FT (10T)');
    expect((await call('DELETE', '/vehicles/trv-lcv')).status).toBe(204);
  });

  it('import: a dry run flags missing fields and names already in the directory or the sheet; commit adds the rest', async () => {
    const { t, cookie, json } = await as();
    const csv = 'Name,Mobile,City,State,Vehicles,OpCities,TDS,GST\nDelta Roadlines,9825099999,Baroda,Gujarat,"Open Body, LCV (1-2T)","Pune, Mumbai",Yes,24abcde1234f1z5\nAlpha Roadways,9825000009,Ahmedabad,,,,,\n,9825077777,Pune,,,,,\nEcho Freight,,Surat,,,,,\ndelta roadlines,9825099998,Baroda,,,,,\n';
    const post = async (commit: boolean) => (await t.request('POST', `${TR}/transporters/import${commit ? '?commit=true' : ''}`, { cookie, form: sheet(csv) })).json();
    const dry = await post(false);
    expect(dry).toMatchObject({ total: 5, valid: 1, imported: 0 });
    expect(dry.rows.map((r: { name: string; error: string | null }) => [r.name, r.error])).toEqual([
      ['Delta Roadlines', null],
      ['Alpha Roadways', 'Already in the directory'],
      ['', 'Name is missing'],
      ['Echo Freight', 'Mobile is missing'],
      ['delta roadlines', 'Already in the directory'],
    ]);
    expect((await post(true)).imported).toBe(1);
    const [d] = (await json('GET', '/transporters?q=delta')).rows;
    expect(d).toMatchObject({ code: 'TRP-26-004', tds: true, gstin: '24ABCDE1234F1Z5', vehicles: ['Open Body', 'LCV (1-2T)'] });
    expect(d.operatingCities.map((c: { city: string }) => c.city)).toEqual(['Pune', 'Mumbai']);
  });
});

describe('dashboard, reports and print', () => {
  it('dashboard counts the flow; reports show spend and how rates were chosen', async () => {
    const { json } = await as();
    expect(await json('GET', '/dashboard')).toMatchObject({ inquiries: 6, open: 2, drafts: 1, pendingApproval: 1, orders: 1, inTransit: 1, monthFreightPaise: 0, lowestShare: 100 });
    const rep = await json('GET', '/reports?from=2026-09-01');
    expect(rep).toMatchObject({ orders: 1, freightPaise: 1_800_000, delivered: 0, lowestShare: 100, savedVsHighestPaise: 200_000, exceptions: 0 });
    expect(rep.byRoute).toEqual([{ route: 'Halvad → Ahmedabad · 32FT (10T)', orders: 1, freightPaise: 1_800_000, avgPaise: 1_800_000 }]);
    expect(rep.byMonth).toEqual([{ name: '2026-09', value: 1_800_000 }]);
    expect((await json('GET', '/reports?from=2026-10-01')).orders).toBe(0);
  });

  it('order print carries the company block and is logged', async () => {
    const { json } = await as('dispatch');
    const p = await json('GET', '/orders/sfo-1/print');
    expect(p.order).toMatchObject({ orderNo: 'SFO-26-001', approvalNo: 'FRA-26-003' });
    expect(p.company.name).toBeTruthy();
    expect((await json('GET', '/audit')).rows[0]).toMatchObject({ action: 'Print', details: 'Printed SFO-26-001' });
  });
});

describe('seed and upgrade', () => {
  it('production seeds the six vehicle types and no transporters; dev adds the sample directory', () => {
    const prod = buildSeed({ devUsers: false, at: T0.toISOString() });
    expect(prod.trVehicles.map((v) => v.name)).toEqual(['LCV (1-2T)', '20FT (5T)', '32FT (10T)', 'Container (22T)', 'Trailer (25T)', 'Open Body']);
    expect(prod.trTransporters).toEqual([]);
    const dev = buildSeed({ devUsers: true, at: T0.toISOString() });
    expect(dev.trTransporters.length).toBe(4);
    expect(dev.trTransporters.every((t) => t.vehicles.every((v) => dev.trVehicles.some((x) => x.name === v)))).toBe(true);
  });

  it('0012 grants the transport pages and adds the vehicle types once', () => {
    const seed = buildSeed({ devUsers: false, at: T0.toISOString() });
    const old = structuredClone(seed) as Partial<typeof seed>;
    old.upgrades = seed.upgrades.filter((u) => u.name !== '0012_transport');
    for (const r of old.rolePermissions!) {
      r.permissions.pages = r.permissions.pages.filter((p) => !p.startsWith('transport_'));
      r.permissions.actions = r.permissions.actions.filter((a) => a !== 'transport_approve');
    }
    delete old.trVehicles;
    const up = upgradeSnapshot(old, seed, T0.toISOString());
    const perms = (role: string) => up.rolePermissions!.find((r) => r.role === role)!.permissions;
    expect(perms('dispatch').pages.filter((p) => p.startsWith('transport_'))).toEqual(['transport_dashboard', 'transport_freight']);
    expect(perms('management').pages.filter((p) => p.startsWith('transport_'))).toEqual(['transport_dashboard', 'transport_reports']);
    expect(perms('admin').actions).toContain('transport_approve');
    expect(up.trVehicles).toHaveLength(6);
    expect(upgradeSnapshot(up, seed, T0.toISOString()).trVehicles).toHaveLength(6);
  });
});
