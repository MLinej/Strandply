import { describe, expect, it } from 'vitest';
import { docNumber, docTotals, effectiveEntry, rateSqftOf, sqmFactorOf, taxTypeFor } from '../src/contracts/sales';
import { buildSeed } from '../src/seed';
import { upgradeSnapshot } from '../src/seed/upgrades';
import { makeTestApp, T0 } from './helpers';

const SL = '/api/sales';

async function admin() {
  const t = await makeTestApp();
  const cookie = await t.login('admin');
  const call = (method: string, path: string, body?: unknown) => t.request(method, `${SL}${path}`, { cookie, body });
  const json = async (method: string, path: string, body?: unknown) => (await call(method, path, body)).json();
  return { t, call, json };
}
const paths = async (res: Response) => ((await res.json()) as { error: { details: { path: string }[] } }).error.details.map((d) => d.path);
const line = (pcs: number, qtySqm: number, ratePaise = 44000) => ({ itemId: 'sli-1', pcs, qtySqm, ratePaise });

describe('calculations', () => {
  it('GST on items + freight: SG+CG halves, IGST whole; rate per sq ft is reference only', () => {
    const lines = [{ amountPaise: 13097920 }, { amountPaise: 600000 }];
    expect(docTotals(lines, 80000, 'SG+CG', 18)).toMatchObject({ itemsPaise: 13697920, taxablePaise: 13777920, cgst: 1240013, sgst: 1240013, igst: 0, gstPaise: 2480026, total: 16257946 });
    expect(docTotals(lines, 80000, 'IGST', 18)).toMatchObject({ cgst: 0, igst: 2480026, total: 16257946 });
    // ₹440.74 / sq m ≈ ₹41 / sq ft (legacy: × 2.9768 / 32).
    expect(rateSqftOf(44074)).toBe(4100);
    expect(sqmFactorOf(1220, 2440)).toBe(2.9768);
  });

  it('tax type from the GSTIN state code against the firm’s state; no GSTIN uses the fallback', () => {
    expect(taxTypeFor('24AAAAA0000A1Z5', '24')).toBe('SG+CG');
    expect(taxTypeFor('27BBBBB1111B1Z5', '24')).toBe('IGST');
    expect(taxTypeFor('27BBBBB1111B1Z5', '27')).toBe('SG+CG');
    expect(taxTypeFor(null, '24', 'IGST')).toBe('IGST');
  });

  it('numbers per firm and FY, and the latest price on or before a date', () => {
    expect(docNumber('order', 'llp', 12, '2026-27')).toBe('SO/12/26-27');
    expect(docNumber('proforma', 'llp', 4, '2026-27')).toBe('PI/004/26-27');
    expect(docNumber('invoice', 'llp', 7, '2026-27')).toBe('SPL/07/26-27');
    expect(docNumber('invoice', 'osb', 7, '2026-27')).toBe('OSB/07/26-27');
    expect(docNumber('order', 'osb', 1, '2026-27')).toBe('OSB-SO/1/26-27');
    const rows = [
      { itemId: 'a', effectiveDate: '2026-04-01', r: 1 },
      { itemId: 'a', effectiveDate: '2026-09-01', r: 2 },
      { itemId: 'b', effectiveDate: '2026-05-01', r: 3 },
    ];
    expect(effectiveEntry(rows, 'a', '2026-08-31')?.r).toBe(1);
    expect(effectiveEntry(rows, 'a', '2026-09-01')?.r).toBe(2);
    expect(effectiveEntry(rows, 'a', '2026-03-31')).toBeNull();
  });
});

describe('party and item masters', () => {
  it('a GSTIN sets both firms’ tax types; without one the entered type is kept; names are unique', async () => {
    const { call, json } = await admin();
    const guj = await json('POST', '/customers', { name: 'RAJKOT PLY', gstin: '24ccccc2222c1z5', taxTypes: { llp: 'IGST' } });
    expect(guj).toMatchObject({ gstin: '24CCCCC2222C1Z5', taxTypes: { llp: 'SG+CG', osb: 'IGST' }, group: 'SUNDRY DEBTORS', dealerType: 'Dealer', active: true });
    const none = await json('POST', '/customers', { name: 'CASH PARTY', taxTypes: { osb: 'IGST' } });
    expect(none.taxTypes).toEqual({ llp: 'SG+CG', osb: 'IGST' });
    expect((await json('PATCH', `/customers/${none.id}`, { gstin: '27DDDDD3333D1Z5' })).taxTypes).toEqual({ llp: 'IGST', osb: 'SG+CG' });
    expect((await call('POST', '/customers', { name: 'rajkot  ply' })).status).toBe(409);
    expect(await paths(await call('POST', '/customers', { name: 'X', gstin: '24ABC' }))).toEqual(['gstin']);
    // On documents: can't be deleted.
    expect((await call('DELETE', '/customers/slc-g')).status).toBe(409);
    expect((await call('DELETE', '/customers/slc-x')).status).toBe(204);
  });

  it('items: sq m factor from width × length unless given, recalculated when the size changes; brand from settings', async () => {
    const { call, json } = await admin();
    const it1 = await json('POST', '/items', { name: 'OSB PLAIN 1220mm X 1220mm X 9mm', brand: 'Strandply', grade: 'OSB', thic: 9, width: 1220, length: 1220, defaultRatePaise: 30000 });
    expect(it1.sqmFactor).toBe(1.4884);
    expect((await json('PATCH', `/items/${it1.id}`, { length: 2440 })).sqmFactor).toBe(2.9768);
    expect((await json('PATCH', `/items/${it1.id}`, { sqmFactor: 3 })).sqmFactor).toBe(3);
    expect(await paths(await call('POST', '/items', { name: 'Y', brand: 'Nobody', grade: 'OSB', thic: 9, width: 1, length: 1 }))).toEqual(['brand']);
    expect((await call('DELETE', '/items/sli-1')).status).toBe(409);
  });

  it('price list and weight chart: one entry per item and date', async () => {
    const { call, json } = await admin();
    expect((await call('POST', '/prices', { itemId: 'sli-1', effectiveDate: '2026-04-01', ratePaise: 1 })).status).toBe(409);
    const p = await json('POST', '/prices', { itemId: 'sli-1', effectiveDate: '2026-10-01', ratePaise: 46000 });
    expect(p.itemName).toContain('PRELAM');
    expect((await json('GET', '/prices?itemId=sli-1')).map((x: { effectiveDate: string }) => x.effectiveDate)).toEqual(['2026-10-01', '2026-04-01']);
    expect((await call('POST', '/weights', { itemId: 'nope', effectiveDate: '2026-10-01', weightKg: 20 })).status).toBe(422);
    const opts = await json('GET', '/options');
    expect(opts.prices).toHaveLength(2);
    expect(opts.customers.map((c: { id: string }) => c.id)).toEqual(['slc-g', 'slc-m', 'slc-x']);
  });
});

describe('sales orders', () => {
  it('copies item details onto lines, takes the tax type from the bill-to party, snapshots ship-to state and city', async () => {
    const { call, json } = await admin();
    const o = await json('POST', '/orders', { firm: 'llp', date: '2026-10-01', billToId: 'slc-m', lines: [line(10, 29.768), { itemName: 'Off-cut boards', pcs: 0, qtySqm: 5, ratePaise: 20000 }] });
    expect(o).toMatchObject({ soNo: 'SO/3/26-27', status: 'draft', taxType: 'IGST', shipToId: 'slc-m', shipTo: 'MAHARASHTRA BOARDS', state: 'MAHARASHTRA', city: 'PUNE' });
    expect(o.lines[0]).toMatchObject({ itemName: 'S-OSB PRELAM + MDO 1220mm X 2440mm X 12mm', grade: 'S-OSB', thic: 12, sqmFactor: 2.9768, amountPaise: 1309792 });
    expect(o.lines[1]).toMatchObject({ itemId: null, grade: null, amountPaise: 100000 });
    expect(o.totals).toMatchObject({ itemsPaise: 1409792, igst: 253763, total: 1663555 });
    expect(o.totalPaise).toBe(1663555);
    // OSB is in Maharashtra: the same party is intra-state there, and OSB numbers its own orders.
    const osb = await json('POST', '/orders', { firm: 'osb', date: '2026-10-01', billToId: 'slc-m', lines: [line(1, 2.9768)] });
    expect(osb).toMatchObject({ soNo: 'OSB-SO/1/26-27', taxType: 'SG+CG' });
    expect(await paths(await call('POST', '/orders', { firm: 'llp', date: '2026-10-01', billToId: 'slc-m', lines: [{ pcs: 1, qtySqm: 0, ratePaise: 1 }] }))).toEqual(['lines.0.itemId', 'lines.0.qtySqm']);
    await json('PATCH', '/customers/slc-x', { active: false });
    expect(await paths(await call('POST', '/orders', { firm: 'llp', date: '2026-10-01', billToId: 'slc-x', lines: [line(1, 1)] }))).toEqual(['billToId']);
  });

  it('shows invoiced and balance per line; an invoiced order keeps its parties and items but other fields change', async () => {
    const { call, json } = await admin();
    const so = await json('GET', '/orders/so-1');
    expect(so.invoiceNos).toEqual(['SPL/01/26-27', 'SPL/02/26-27']);
    expect(so.progress).toEqual([
      { invoicedPcs: 40, invoicedSqm: 119.072, balancePcs: 60, balanceSqm: 178.608, balancePaise: 7858752 },
      { invoicedPcs: 10, invoicedSqm: 20, balancePcs: 0, balanceSqm: 0, balancePaise: 0 },
    ]);
    expect(so.totals.total).toBe(16257946);
    expect((await call('PATCH', '/orders/so-1', { lines: [line(100, 297.68, 45000)] })).status).toBe(409);
    expect((await call('PATCH', '/orders/so-1', { billToId: 'slc-m' })).status).toBe(409);
    const edited = await json('PATCH', '/orders/so-1', { edd: '2026-09-15', status: 'partial' });
    expect(edited).toMatchObject({ edd: '2026-09-15', status: 'partial' });
    expect((await call('DELETE', '/orders/so-1')).status).toBe(409);
    expect((await call('DELETE', '/orders/so-2')).status).toBe(204);
  });

  it('records dispatch details and status changes in the audit trail', async () => {
    const { call, json } = await admin();
    const d = await json('POST', '/orders/so-2/dispatch', { date: '2026-09-26', vehicleNo: 'MH12XY9999', transporter: 'VRL', transporterGstin: '27aaaca1111a1z5' });
    expect(d.dispatch).toMatchObject({ date: '2026-09-26', vehicleNo: 'MH12XY9999', transporterGstin: '27AAACA1111A1Z5', lrNo: null });
    expect((await json('POST', '/orders/so-2/status', { status: 'ready' })).status).toBe('ready');
    expect((await call('POST', '/orders/so-2/status', { status: 'shipped' })).status).toBe(422);
    const reg = await json('GET', '/dispatch?firm=llp');
    expect(reg.rows.map((r: { soNo: string }) => r.soNo)).toEqual(['SO/2/26-27', 'SO/1/26-27']);
    expect(reg.kpis).toEqual({ dispatches: 2, freightPaise: 80000, vehicles: 2, transporters: 2 });
    const audit = await json('GET', '/audit');
    expect(audit.rows.map((r: { details: string }) => r.details)).toContain('SO/2/26-27: Draft → Ready for dispatch');
  });
});

describe('proforma invoices', () => {
  it('confirming makes a Confirmed order with the same lines and total and locks the proforma; deleting that order reopens it', async () => {
    const { call, json } = await admin();
    const pi = await json('POST', '/proformas', { firm: 'llp', date: '2026-09-28', validUntil: '2026-10-28', poRef: 'WA 28/9', billToId: 'slc-g', shipToId: 'slc-m', lines: [line(5, 14.884)], freightPaise: 50000 });
    expect(pi).toMatchObject({ piNo: 'PI/002/26-27', status: 'draft', shipTo: 'MAHARASHTRA BOARDS', taxType: 'SG+CG' });
    expect((await json('POST', `/proformas/${pi.id}/status`, { status: 'sent' })).status).toBe('sent');
    expect((await call('POST', `/proformas/${pi.id}/status`, { status: 'confirmed' })).status).toBe(422);
    const { proforma, order } = await json('POST', `/proformas/${pi.id}/confirm`);
    expect(order).toMatchObject({ soNo: 'SO/3/26-27', status: 'confirmed', date: '2026-10-01', poNo: 'WA 28/9', poDate: '2026-09-28', piNo: 'PI/002/26-27', totalPaise: pi.totalPaise, shipTo: 'MAHARASHTRA BOARDS' });
    expect(order.lines).toEqual(pi.lines);
    expect(proforma).toMatchObject({ status: 'confirmed', soNo: 'SO/3/26-27' });
    expect((await call('PATCH', `/proformas/${pi.id}`, { remarks: 'x' })).status).toBe(409);
    expect((await call('POST', `/proformas/${pi.id}/confirm`)).status).toBe(409);
    expect((await call('DELETE', `/proformas/${pi.id}`)).status).toBe(409);
    expect((await call('DELETE', `/orders/${order.id}`)).status).toBe(204);
    expect(await json('GET', `/proformas/${pi.id}`)).toMatchObject({ status: 'sent', soId: null, soNo: null });
  });

  it('a cancelled proforma is locked until reopened', async () => {
    const { call, json } = await admin();
    await json('POST', '/proformas/pi-1/status', { status: 'cancelled' });
    expect((await call('PATCH', '/proformas/pi-1', { remarks: 'x' })).status).toBe(409);
    expect((await call('POST', '/proformas/pi-1/confirm')).status).toBe(409);
    await json('POST', '/proformas/pi-1/status', { status: 'draft' });
    expect((await call('PATCH', '/proformas/pi-1', { remarks: 'x' })).status).toBe(200);
  });
});

describe('sales invoices', () => {
  it('lines come from the order: item and order quantity copied, dispatched quantity and rate entered', async () => {
    const { call, json } = await admin();
    const inv = await json('POST', '/invoices', { soId: 'so-1', date: '2026-10-01', lines: [{ soLine: 0, pcs: 60, qtySqm: 178.608, ratePaise: 44000 }, { soLine: 1, pcs: 0, qtySqm: 0, ratePaise: 30000 }], freightPaise: 10000, irn: 'IRN-1' });
    expect(inv).toMatchObject({ invNo: 'SPL/03/26-27', billTo: 'GUJARAT TRADERS', soNo: 'SO/1/26-27', poNo: 'PO-77', taxType: 'SG+CG', approval: 'pending' });
    // The zero-quantity line is dropped.
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0]).toMatchObject({ soLine: 0, itemName: 'S-OSB PRELAM + MDO 1220mm X 2440mm X 12mm', soPcs: 100, soQtySqm: 297.68, pcs: 60, amountPaise: 7858752 });
    expect(inv.totals).toMatchObject({ taxablePaise: 7868752, cgst: 708188, sgst: 708188, total: 9285128 });
    // 12 mm × 1.22 m × 2.44 m × 60 × 0.65 t/m³
    expect(inv.tons).toBeCloseTo(1.3929, 3);
    expect((await json('GET', '/orders/so-1')).progress[0]).toMatchObject({ balancePcs: 0, balanceSqm: 0 });
    expect(await paths(await call('POST', '/invoices', { soId: 'so-1', date: '2026-10-01', lines: [{ soLine: 5, pcs: 1, qtySqm: 1, ratePaise: 1 }] }))).toEqual(['lines.0.soLine']);
    expect(await paths(await call('POST', '/invoices', { soId: 'so-1', date: '2026-10-01', lines: [{ soLine: 0, pcs: 0, qtySqm: 0, ratePaise: 1 }] }))).toEqual(['lines']);
    await json('POST', '/orders/so-2/status', { status: 'cancelled' });
    expect((await call('POST', '/invoices', { soId: 'so-2', date: '2026-10-01', lines: [{ soLine: 0, pcs: 1, qtySqm: 1, ratePaise: 1 }] })).status).toBe(409);
  });

  it('approval: reject needs a reason; editing a rejected invoice sends it back; approved ones are locked until reopened', async () => {
    const { call, json } = await admin();
    expect(await paths(await call('POST', '/invoices/inv-1/approve', { decision: 'reject' }))).toEqual(['note']);
    expect((await json('POST', '/invoices/inv-1/approve', { decision: 'reject', note: 'Wrong rate' })).approval).toBe('rejected');
    const edited = await json('PATCH', '/invoices/inv-1', { lines: [{ soLine: 0, pcs: 40, qtySqm: 119.072, ratePaise: 43000 }] });
    expect(edited).toMatchObject({ approval: 'pending', approvalNote: null });
    expect(edited.lines[0].amountPaise).toBe(5120096);
    const ok = await json('POST', '/invoices/inv-1/approve', { decision: 'approve' });
    expect(ok).toMatchObject({ approval: 'approved', approvedByName: 'Admin User', approvedAt: T0.toISOString() });
    expect((await call('PATCH', '/invoices/inv-1', { ewayBill: 'x' })).status).toBe(409);
    expect((await call('DELETE', '/invoices/inv-1')).status).toBe(409);
    expect((await call('POST', '/invoices/inv-1/approve', { decision: 'approve' })).status).toBe(409);
    expect((await json('POST', '/invoices/inv-1/approve', { decision: 'reopen' })).approval).toBe('pending');
    expect((await call('DELETE', '/invoices/inv-1')).status).toBe(204);
  });

  it('a user without sales_approve can raise invoices but not approve them', async () => {
    const t = await makeTestApp();
    const su = await t.login('superadmin');
    const put = await t.request('PUT', '/api/sampletrack/role-permissions/marketing', { cookie: su, body: { pages: ['sales_invoices'], actions: ['edit'], widgets: [] } });
    expect(put.status).toBe(200);
    const mk = await t.login('marketing');
    expect((await t.request('PATCH', `${SL}/invoices/inv-1`, { cookie: mk, body: { ewayBill: 'EWB-9' } })).status).toBe(200);
    expect((await t.request('POST', `${SL}/invoices/inv-1/approve`, { cookie: mk, body: { decision: 'approve' } })).status).toBe(403);
  });

  it('OSB invoices are numbered OSB/nn/yy-yy', async () => {
    const { json } = await admin();
    const o = await json('POST', '/orders', { firm: 'osb', date: '2026-10-01', billToId: 'slc-g', lines: [line(2, 5.9536)] });
    const inv = await json('POST', '/invoices', { soId: o.id, date: '2026-10-01', lines: [{ soLine: 0, pcs: 2, qtySqm: 5.9536, ratePaise: 44000 }] });
    expect(inv).toMatchObject({ firm: 'osb', invNo: 'OSB/01/26-27', taxType: 'IGST' });
  });
});

describe('FG stock and inter-company', () => {
  it('reserves pending orders’ sq m of the same firm and spec; low when available is under the reorder level', async () => {
    const { call, json } = await admin();
    const [fg] = await json('GET', '/fg?firm=llp');
    // so-1 (297.68) + so-2 (148.84) are open and both are S-OSB 12 mm 1220 × 2440.
    expect(fg).toMatchObject({ reservedSqm: 446.52, availableSqm: 553.48, low: true });
    await json('POST', '/orders/so-2/status', { status: 'cancelled' });
    expect((await json('GET', '/fg'))[0]).toMatchObject({ reservedSqm: 297.68, availableSqm: 702.32, low: true });
    expect((await call('POST', '/fg', { firm: 'llp', grade: 'S-OSB', thic: 12, width: 1220, length: 2440, qtyOnHandSqm: 5 })).status).toBe(409);
  });

  it('matches billing documents to LLP invoices and computes value and total', async () => {
    const { json } = await admin();
    const ic = await json('POST', '/intercompany', { billingDoc: 'SPL/99/26-27', billingDate: '2026-09-10', materialDesc: 'OSB 9mm', pcs: 5, qtySqm: 14.884, ratePaise: 33099, igstPaise: 88673 });
    expect(ic).toMatchObject({ materialPaise: 492646, totalPaise: 581319, taxPaise: 88673, matched: false });
    const list = await json('GET', '/intercompany');
    expect(list.kpis).toMatchObject({ count: 2, matched: 1 });
  });
});

describe('dashboard, reports, exports, email, settings', () => {
  it('dashboard: invoice totals, tons, pending orders and approvals, top customer and grade', async () => {
    const { json } = await admin();
    const d = await json('GET', '/dashboard?firm=llp');
    expect(d).toMatchObject({ invoiceCount: 2, orderCount: 2, pendingOrders: 2, pendingApproval: 1, dispatchPending: 1, topCustomer: 'GUJARAT TRADERS', topProduct: 'S-OSB' });
    expect(d.basicPaise).toBe(5239168 + 600000);
    expect(d.grades.map((g: { grade: string }) => g.grade)).toEqual(['Custom board', 'S-OSB']);
    expect(d.months).toEqual([{ name: '2026-09', value: d.totalPaise }]);
    expect((await json('GET', '/dashboard?firm=osb')).invoiceCount).toBe(0);
  });

  it('pending order report works on balances, by EDD, with a product summary', async () => {
    const { json } = await admin();
    const r = await json('GET', '/reports/pending_orders?firm=llp');
    expect(r.pivot.orders.map((o: { soNo: string; pcs: number; amountPaise: number }) => [o.soNo, o.pcs, o.amountPaise])).toEqual([
      ['SO/1/26-27', 60, 7858752],
      ['SO/2/26-27', 50, 6697800],
    ]);
    expect(r.pivot).toMatchObject({ pcs: 110, amountPaise: 14556552, products: [{ itemName: 'S-OSB PRELAM + MDO 1220mm X 2440mm X 12mm', pcs: 110 }] });
  });

  it('every report answers, with date range and firm filters', async () => {
    const { call, json } = await admin();
    const ids = ['sales_register', 'pending_orders', 'thickness_wise', 'dealer_wise', 'top_customers', 'state_wise', 'product_wise', 'monthly_trend', 'intercompany', 'dispatch_vs_sales', 'credit_days', 'customer_outstanding', 'order_ageing', 'customer_credit'];
    for (const id of ids) expect((await call('GET', `/reports/${id}?from=2026-04-01&to=2026-09-30&firm=llp`)).status, id).toBe(200);
    expect((await call('GET', '/reports/nope')).status).toBe(404);
    const reg = await json('GET', '/reports/sales_register');
    expect(reg.table.rows.map((r: { invNo: string }) => r.invNo)).toEqual(['SPL/02/26-27', 'SPL/01/26-27']);
    const ageing = await json('GET', '/reports/order_ageing');
    expect(ageing.table.rows.map((r: { soNo: string; age: number }) => [r.soNo, r.age])).toEqual([
      ['SO/1/26-27', 30],
      ['SO/2/26-27', 16],
    ]);
    const dvs = await json('GET', '/reports/dispatch_vs_sales');
    expect(dvs.kpis.map((k: { value: number }) => k.value)).toEqual([1, 2, 0]);
    const credit = await json('GET', '/reports/customer_credit');
    expect(credit.table.rows[0]).toMatchObject({ name: 'GUJARAT TRADERS', count: 2, limit: 50000000 });
    expect((await json('GET', '/reports/state_wise')).table.rows.map((r: { name: string }) => r.name)).toEqual(['GUJARAT']);
  });

  it('party ledger lists invoices shipped to the party', async () => {
    const { json } = await admin();
    const l = await json('GET', '/customers/slc-g/ledger');
    expect(l).toMatchObject({ count: 2, customer: { name: 'GUJARAT TRADERS' } });
    expect(l.invoices.map((i: { invNo: string }) => i.invNo)).toEqual(['SPL/01/26-27', 'SPL/02/26-27']);
  });

  it('exports are spreadsheets and are logged', async () => {
    const { call, json } = await admin();
    for (const k of ['customers', 'items', 'prices', 'weights', 'proformas', 'orders', 'invoices', 'dispatch', 'fg', 'intercompany']) {
      const res = await call('GET', `/export/${k}`);
      expect(res.status, k).toBe(200);
      expect(res.headers.get('content-type')).toContain('spreadsheetml');
    }
    expect((await call('GET', '/reports/pending_orders/export')).status).toBe(200);
    expect((await json('GET', '/audit')).rows.filter((r: { action: string }) => r.action === 'Export')).toHaveLength(11);
  });

  it('email drafts fill the template; prints carry the letterhead and parties and are logged', async () => {
    const { json } = await admin();
    const e = await json('GET', '/invoices/inv-1/email');
    expect(e.to).toEqual(['accounts@strandply.com']);
    expect(e.subject).toBe('Tax Invoice SPL/01/26-27 — Strandply LLP');
    expect(e.body).toContain('Invoice Date: 06/09/2026');
    await json('PATCH', '/settings', { emailTemplates: { order: { subject: 'SO {{soNo}} for {{billTo}}', body: 'Value {{orderValue}} {{unknown}}.' } } });
    const o = await json('GET', '/orders/so-1/email');
    expect(o).toMatchObject({ subject: 'SO SO/1/26-27 for GUJARAT TRADERS', body: 'Value ₹1,62,579.46 .' });
    const p = await json('GET', '/orders/so-1/print');
    expect(p.billParty.gstin).toBe('24AAAAA0000A1Z5');
    expect(p.doc.soNo).toBe('SO/1/26-27');
    expect(p.company.name).toBeTruthy();
    expect((await json('GET', '/audit')).rows[0]).toMatchObject({ action: 'Print', details: 'Printed SO/1/26-27' });
  });

  it('settings: lists can’t be emptied, state codes are two digits, and changing them changes tax types', async () => {
    const { call, json } = await admin();
    expect(await paths(await call('PATCH', '/settings', { paymentTerms: [] }))).toEqual(['paymentTerms']);
    expect(await paths(await call('PATCH', '/settings', { firmStateCodes: { llp: '4', osb: '27' } }))).toEqual(['firmStateCodes.llp']);
    const s = await json('PATCH', '/settings', { salesPersons: ['VIPUL PANCHAL', 'VIPUL PANCHAL', 'ASHOK JAIN'], firmStateCodes: { llp: '27', osb: '24' } });
    expect(s.salesPersons).toEqual(['VIPUL PANCHAL', 'ASHOK JAIN']);
    const o = await json('POST', '/orders', { firm: 'llp', date: '2026-10-01', billToId: 'slc-m', lines: [line(1, 2.9768)] });
    expect(o.taxType).toBe('SG+CG');
  });
});

describe('seed and dev snapshot upgrade (0010)', () => {
  it('dev seed: the legacy party master, orders and invoices, linked and with stored totals; production gets only items', () => {
    const dev = buildSeed({ devUsers: true, at: T0.toISOString() });
    expect(dev.slCustomers).toHaveLength(674);
    expect(dev.slItems).toHaveLength(62);
    expect(dev.slOrders).toHaveLength(65);
    expect(dev.slInvoices).toHaveLength(57);
    expect(dev.slIntercompany).toHaveLength(111);
    for (const o of dev.slOrders) expect(o.totalPaise).toBe(docTotals(o.lines, o.freightPaise, o.taxType, o.gstPct).total);
    expect(dev.slInvoices.every((i) => dev.slOrders.some((o) => o.id === i.soId))).toBe(true);
    expect(dev.slOrders[0]).toMatchObject({ soNo: 'SO/1/26-27', billTo: 'AARADHYA ENTERPRISES', status: 'completed', dispatch: { vehicleNo: 'GJ 13 AX 5390' } });
    expect(dev.counters.find((c) => c.name === 'SL-SO-llp-2026-27')?.lastValue).toBe(66);
    const prod = buildSeed({ devUsers: false, at: T0.toISOString() });
    expect([prod.slCustomers.length, prod.slOrders.length, prod.slItems.length]).toEqual([0, 0, 62]);
    expect(prod.settings.find((s) => s.key === 'sales.sales_persons')?.value).toEqual([]);
  });

  it('0010 adds the Sales keys and settings to an old snapshot once, and the reference items', () => {
    const seed = buildSeed({ devUsers: false, at: T0.toISOString() });
    const old = structuredClone(seed) as Partial<typeof seed>;
    old.upgrades = seed.upgrades.filter((u) => u.name !== '0010_sales');
    for (const r of old.rolePermissions!) {
      r.permissions.pages = r.permissions.pages.filter((p) => !p.startsWith('sales_'));
      r.permissions.actions = r.permissions.actions.filter((a) => a !== 'sales_approve');
    }
    old.settings = old.settings!.filter((s) => !s.key.startsWith('sales.'));
    delete old.slItems;
    const up = upgradeSnapshot(old, seed, T0.toISOString());
    const mgmt = up.rolePermissions!.find((r) => r.role === 'management')!.permissions;
    expect(mgmt.pages.filter((p) => p.startsWith('sales_'))).toEqual(['sales_dashboard', 'sales_reports']);
    expect(up.rolePermissions!.find((r) => r.role === 'admin')!.permissions.actions).toContain('sales_approve');
    expect(up.settings!.filter((s) => s.key.startsWith('sales.'))).toHaveLength(8);
    expect(up.slItems).toHaveLength(62);
    const again = upgradeSnapshot(up, seed, T0.toISOString());
    expect(again.settings!.filter((s) => s.key.startsWith('sales.'))).toHaveLength(8);
  });
});

describe('register summaries', () => {
  it('lists carry KPI figures for the firm; orders filter by open', async () => {
    const { json } = await admin();
    const inv = await json('GET', '/invoices?firm=llp&status=approved');
    expect(inv.total).toBe(1);
    expect(inv.summary).toMatchObject({ count: 2, byStatus: { pending: 1, approved: 1 } });
    expect(inv.summary.gstPaise).toBe(inv.summary.totalPaise - (5239168 + 600000));
    const open = await json('GET', '/orders?status=open');
    expect(open.rows.map((o: { soNo: string }) => o.soNo).sort()).toEqual(['SO/1/26-27', 'SO/2/26-27']);
    expect(open.summary.byStatus).toEqual({ confirmed: 1, draft: 1 });
    expect((await json('GET', '/orders?firm=osb')).summary.count).toBe(0);
  });
});
