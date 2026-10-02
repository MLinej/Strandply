import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { makeTestApp, type TestApp } from './helpers';

const REP = '/api/sampletrack/reports';

/** Adds dispatches for p-free on different dates and couriers. */
async function withData() {
  const t = await makeTestApp();
  const admin = await t.login('admin');
  const mk = (body: Record<string, unknown>) =>
    t.request('POST', '/api/sampletrack/dispatches', { cookie: admin, body: { partyId: 'p-free', weightKg: 2, ...body } });
  await mk({ date: '2026-09-01', mode: 'Courier', courierId: 'c-free', freightPaise: 50000, status: 'Delivered' });
  await mk({ date: '2026-09-15', mode: 'Courier', courierId: 'c-free', freightPaise: 25000 });
  await mk({ date: '2026-08-01', mode: 'Hand Delivery', freightPaise: 0 });
  return { t, admin, mgmt: await t.login('management') };
}

const get = async (t: TestApp, cookie: string, path: string) => (await t.request('GET', path, { cookie })).json();

describe('reports API', () => {
  it('builds each report from live data', async () => {
    const { t, mgmt } = await withData();
    const reg = await get(t, mgmt, `${REP}/dispatch-register`);
    expect(reg.title).toBe('Dispatch Register');
    expect(reg.summary).toEqual([
      { label: 'Total Records', value: 4, type: 'number' },
      { label: 'Total Freight', value: 75000, type: 'money' },
    ]);
    const courier = await get(t, mgmt, `${REP}/courier-performance`);
    expect(courier.tables[0].rows.map((r: { courier: string; total: number; rate: number }) => [r.courier, r.total, r.rate])).toEqual([
      ['Free Courier', 2, 50],
      ['Unknown', 1, 0],
      ['Used Transport', 1, 0],
    ]);
    const marketing = await get(t, mgmt, `${REP}/marketing-performance`);
    expect(marketing.tables[0].rows.map((r: { person: string }) => r.person)).toEqual(['Marketing User', 'Unassigned']);
    const products = await get(t, mgmt, `${REP}/product-analysis`);
    expect(products.tables.map((x: { name: string }) => x.name)).toEqual(['requested', 'master']);
  });

  it('date range and party/courier filters, echoed with names', async () => {
    const { t, mgmt } = await withData();
    const sept = await get(t, mgmt, `${REP}/cost-tracking?dateFrom=2026-09-01&dateTo=2026-09-30`);
    expect(sept.summary.map((s: { value: number }) => s.value)).toEqual([75000, 3, 25000]); // incl. DSP-0001 on 09-30
    const free = await get(t, mgmt, `${REP}/party-wise?partyId=p-free`);
    expect(free.tables[0].rows.map((r: { party: string; dispatches: number }) => [r.party, r.dispatches])).toEqual([['Free Party', 3]]);
    expect(free.filters).toMatchObject({ partyId: 'p-free', partyName: 'Free Party', courierName: null });
    const byCourier = await get(t, mgmt, `${REP}/dispatch-register?courierId=c-free`);
    expect(byCourier.summary[0].value).toBe(2);
    expect(byCourier.filters.courierName).toBe('Free Courier');
  });

  it('pending: a courier filter leaves requests out', async () => {
    const { t, mgmt } = await withData();
    const all = await get(t, mgmt, `${REP}/pending`);
    expect(all.summary.map((s: { value: number }) => s.value)).toEqual([3, 2, 5]);
    const courierOnly = await get(t, mgmt, `${REP}/pending?courierId=c-free`);
    expect(courierOnly.summary.map((s: { value: number }) => s.value)).toEqual([1, 0, 1]);
  });

  it('validates keys and filters', async () => {
    const { t, mgmt } = await withData();
    expect((await t.request('GET', `${REP}/nope`, { cookie: mgmt })).status).toBe(404);
    expect((await t.request('GET', `${REP}/pending?dateFrom=2026-10-01&dateTo=2026-09-01`, { cookie: mgmt })).status).toBe(422);
    expect((await t.request('GET', `${REP}/pending?dateFrom=2026-13-01`, { cookie: mgmt })).status).toBe(422);
    expect((await t.request('GET', `${REP}/pending?partyId=ghost`, { cookie: mgmt })).status).toBe(422);
    const courierOnRequests = await t.request('GET', `${REP}/marketing-performance?courierId=c-free`, { cookie: mgmt });
    expect((await courierOnRequests.json()).error.details[0].path).toBe('courierId');
  });

  it('xlsx export: a Summary sheet plus one per table, money in rupees, totals row; logged', async () => {
    const { t, mgmt } = await withData();
    const res = await t.request('GET', `${REP}/party-wise/export?dateFrom=2026-09-01`, { cookie: mgmt });
    expect(res.headers.get('content-disposition')).toMatch(/party-wise-2026-10-01\.xlsx/);
    const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' });
    expect(wb.SheetNames).toEqual(['Summary', 'By Party', 'Dispatches by Party']);
    const summary = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Summary']!, { header: 1 });
    expect(summary).toContainEqual(['From', '2026-09-01']);
    expect(summary).toContainEqual(['Total Freight', 750]);
    const byParty = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['By Party']!);
    expect(byParty.at(-1)).toMatchObject({ Party: 'Total', 'Freight (₹)': 750 });
    const log = await t.data.repos.activity.list({ filters: { action: 'Export', entityType: 'report' } });
    expect(log.rows[0]!.details).toBe('Exported Party-wise Sample Report (xlsx)');
  });

  it('csv export of one table (default: the first)', async () => {
    const { t, mgmt } = await withData();
    const res = await t.request('GET', `${REP}/product-analysis/export?format=csv&table=master`, { cookie: mgmt });
    expect(res.headers.get('content-type')).toMatch(/text\/csv/);
    expect(res.headers.get('content-disposition')).toMatch(/product-analysis-master-2026-10-01\.csv/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM, so Excel reads ₹ correctly
    const text = new TextDecoder().decode(bytes); // decoding drops the BOM
    expect(text.split('\r\n')[0]).toBe('Code,Product,Board,Price (₹),Stock');
    expect(text).toContain('MDO-12-8X4,MDO 12mm Board,MDO,950,Limited');
    expect((await t.request('GET', `${REP}/pending/export?format=csv&table=nope`, { cookie: mgmt })).status).toBe(422);
  });

  it('print payload: A4 landscape, company block, the report; logged as a print', async () => {
    const { t, mgmt } = await withData();
    const p = await get(t, mgmt, `${REP}/courier-performance/print?partyId=p-free`);
    expect(p.page).toEqual({ size: 'A4', orientation: 'landscape', widthMm: 297, heightMm: 210 });
    expect(p.company.name).toBe('Strandply LLP');
    expect(p.report.key).toBe('courier-performance');
    expect(p.report.filters.partyName).toBe('Free Party');
    const log = await t.data.repos.activity.list({ filters: { action: 'Print', entityType: 'report' } });
    expect(log.rows[0]!.details).toBe('Printed Courier Performance Report');
  });

  it('export and print need their own permissions', async () => {
    const t = await makeTestApp();
    await t.request('PUT', '/api/sampletrack/role-permissions/management', {
      cookie: await t.login('superadmin'),
      body: { pages: ['dashboard', 'reports'], actions: [], widgets: [] },
    });
    const mgmt = await t.login('management');
    expect((await t.request('GET', `${REP}/pending`, { cookie: mgmt })).status).toBe(200);
    expect((await t.request('GET', `${REP}/pending/export`, { cookie: mgmt })).status).toBe(403);
    expect((await t.request('GET', `${REP}/pending/print`, { cookie: mgmt })).status).toBe(403);
  });
});
