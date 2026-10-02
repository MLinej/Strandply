import { describe, expect, it } from 'vitest';
import type { DispatchView } from '../src/contracts/sampletrack';
import { qrPayload, whatsappText } from '../src/modules/sampletrack/print/share-text';
import { memoryDataLayerFrom } from '../src/repos/memory';
import { makeTestApp, party, seedUsers, testData } from './helpers';

const ST = '/api/sampletrack';
const company = { name: 'Strandply LLP', city: 'Wankaner, Morbi, Gujarat', phone: null, llpin: 'AAP-7300', gst: null };

/** A test app with a fully filled-in party and dispatch d2 (DSP-0002) for it. */
async function app() {
  const data = testData(await seedUsers());
  data.parties.push(
    party('p-full', {
      name: 'Gujarat Furniture Works',
      contact: 'Rajan Shah',
      mobile: '9876543210',
      email: 'rajan@gfw.com',
      gst: '24AAACG1234F1Z5',
      address: 'Plot 45, Gondal Rd, GIDC',
      city: 'Rajkot',
      state: 'Gujarat',
      pin: '360001',
    }),
  );
  const t = await makeTestApp({ data: memoryDataLayerFrom(data) });
  const admin = await t.login('admin');
  const dsp = await (
    await t.request('POST', `${ST}/dispatches`, {
      cookie: admin,
      body: {
        partyId: 'p-full',
        mode: 'Courier',
        courierId: null,
        courierNameManual: 'Blue Dart',
        trackingNo: 'BD123456789',
        vehicleNo: 'GJ-03-AB-1234',
        dimensions: '120x90x20 cm',
        productDescription: 'OSB 18mm 5 sheets',
        expectedDeliveryDate: '2026-10-04',
        weightKg: 25,
      },
    })
  ).json();
  return { t, admin, dsp };
}

describe('courier label', () => {
  it('returns FROM (settings), the dispatch fields, TO (party) and A5 landscape page info', async () => {
    const { t, admin, dsp } = await app();
    await t.data.repos.settings.set('company.phone', '+91 2828 123456', null, '2026-10-01T00:00:00Z');
    const label = await (await t.request('GET', `${ST}/dispatches/${dsp.id}/label`, { cookie: admin })).json();
    expect(label).toEqual({
      page: { size: 'A5', orientation: 'landscape', widthMm: 210, heightMm: 148 },
      from: { name: 'Strandply LLP', city: 'Wankaner, Morbi, Gujarat', phone: '+91 2828 123456', llpin: 'AAP-7300', gst: null },
      dispatch: {
        id: dsp.id,
        dspNo: 'DSP-0002',
        date: '2026-10-01',
        mode: 'Courier',
        trackingNo: 'BD123456789',
        courierName: 'Blue Dart',
        vehicleNo: 'GJ-03-AB-1234',
        dimensions: '120x90x20 cm',
        contents: 'OSB 18mm 5 sheets',
        expectedDeliveryDate: '2026-10-04',
        status: 'Pending',
      },
      to: {
        name: 'Gujarat Furniture Works',
        contact: 'Rajan Shah',
        mobile: '9876543210',
        address: 'Plot 45, Gondal Rd, GIDC',
        city: 'Rajkot',
        state: 'Gujarat',
        cityState: 'Rajkot, Gujarat',
        pin: '360001',
        email: 'rajan@gfw.com',
      },
      qrPayload: 'ID:DSP-0002|Party:Gujarat Furniture Works|Track:BD123456789|Status:Pending',
      printedAt: '2026-10-01T09:00:00.000Z',
    });
  });

  it('blank company phone becomes null', async () => {
    const { t, admin, dsp } = await app();
    const label = await (await t.request('GET', `${ST}/dispatches/${dsp.id}/label`, { cookie: admin })).json();
    expect(label.from.phone).toBeNull();
  });
});

describe('request slip', () => {
  it('has the company header, request, party, lines, approver and signature block (A4)', async () => {
    const { t, admin } = await app();
    const created = await (
      await t.request('POST', `${ST}/requests`, {
        cookie: await t.login('marketing'),
        body: {
          partyId: 'p-full',
          purpose: 'Client Exhibition',
          priority: 'Urgent',
          requiredDispatchDate: '2026-10-05',
          remarks: 'Trade fair',
          items: [{ productId: 'prod-osb-18-8x4', qty: '5 sheets' }, { productName: 'Teak offcut', qty: '2 pcs' }],
        },
      })
    ).json();
    await t.request('POST', `${ST}/requests/${created.id}/approve`, { cookie: admin });

    const slip = await (await t.request('GET', `${ST}/requests/${created.id}/slip`, { cookie: admin })).json();
    expect(slip.page).toEqual({ size: 'A4', orientation: 'portrait', widthMm: 210, heightMm: 297 });
    expect(slip.company.name).toBe('Strandply LLP');
    expect(slip.request).toMatchObject({
      reqNo: 'REQ-0003',
      status: 'Approved',
      priority: 'Urgent',
      highPriority: true,
      purpose: 'Client Exhibition',
      requiredDispatchDate: '2026-10-05',
      requestedByName: 'Marketing User',
      remarks: 'Trade fair',
    });
    expect(slip.party).toMatchObject({ name: 'Gujarat Furniture Works', gst: '24AAACG1234F1Z5', pin: '360001' });
    expect(slip.items).toEqual([
      { lineNo: 1, productName: 'OSB 18mm Premium', board: 'OSB', thickness: '18mm', size: '8x4 ft', qty: '5 sheets' },
      { lineNo: 2, productName: 'Teak offcut', board: null, thickness: null, size: null, qty: '2 pcs' },
    ]);
    expect(slip.approvedBy).toEqual({ name: 'Admin User', at: '2026-10-01T09:00:00.000Z' });
    expect(slip.signatures).toEqual([
      { label: 'Requested By', role: 'Marketing', name: 'Marketing User' },
      { label: 'Approved By', role: 'Manager', name: 'Admin User' },
      { label: 'Dispatched By', role: 'Dispatch Dept', name: null },
    ]);
    expect(slip.printedAt).toBe('2026-10-01T09:00:00.000Z');
  });

  it('an unapproved request has no approver', async () => {
    const { t, admin } = await app();
    const slip = await (await t.request('GET', `${ST}/requests/r2/slip`, { cookie: admin })).json();
    expect(slip.approvedBy).toBeNull();
    expect(slip.request.highPriority).toBe(true); // r2 is High
    expect(slip.signatures[1].name).toBeNull();
  });
});

describe('WhatsApp share', () => {
  it('builds the full message with link and the party’s wa.me phone', async () => {
    const { t, admin, dsp } = await app();
    const share = await (await t.request('GET', `${ST}/dispatches/${dsp.id}/whatsapp`, { cookie: admin })).json();
    expect(share.phone).toBe('919876543210');
    expect(share.text).toBe(
      [
        '🚚 *Dispatch Update — Strandply LLP*',
        '',
        '📦 *Dispatch ID:* DSP-0002',
        '📅 *Dispatch Date:* 01 Oct 2026',
        '🏭 *Party:* Gujarat Furniture Works, Rajkot',
        '',
        '📮 *Courier:* Blue Dart',
        '🔢 *Tracking No:* BD123456789',
        '🚗 *Mode:* Courier',
        '📅 *Expected Delivery:* 04 Oct 2026',
        '',
        '📦 *Contents:* OSB 18mm 5 sheets',
        '',
        '✅ *Current Status:* Pending',
        '',
        '🔍 Track your shipment:',
        'https://www.bluedart.com/tracking?trackfor=BD123456789',
        '',
        'For any queries, please contact us.',
        '— *Strandply LLP* Dispatch Team',
      ].join('\n'),
    );
  });

  const base: DispatchView = {
    id: 'd',
    dspNo: 'DSP-0009',
    date: '2026-10-01',
    partyId: 'p',
    partyName: 'Acme',
    partyCity: null,
    partyState: null,
    mode: 'Transport',
    courierId: null,
    courierNameManual: null,
    courierName: null,
    trackingNo: null,
    vehicleNo: null,
    driverDetails: null,
    expectedDeliveryDate: null,
    freightPaise: 0,
    weightKg: 1,
    dimensions: null,
    productDescription: null,
    linkedRequestId: null,
    linkedRequestNo: null,
    remarks: null,
    status: 'Pending',
    overdue: false,
    tracking: null,
    createdBy: null,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  };

  it('fills the blanks: courier falls back to mode, "Not assigned yet", "TBD", "As per order"; no city, link or apology', () => {
    const text = whatsappText(base, company);
    expect(text).toContain('🏭 *Party:* Acme\n');
    expect(text).toContain('📮 *Courier:* Transport');
    expect(text).toContain('🔢 *Tracking No:* Not assigned yet');
    expect(text).toContain('📅 *Expected Delivery:* TBD');
    expect(text).toContain('📦 *Contents:* As per order');
    expect(text).not.toContain('Track your shipment');
    expect(text).not.toContain('delayed');
  });

  it('adds the apology only when Delayed', () => {
    expect(whatsappText({ ...base, status: 'Delayed' }, company)).toContain(
      '✅ *Current Status:* Delayed\n⚠️ This shipment is currently delayed. We apologize for the inconvenience.',
    );
    expect(whatsappText({ ...base, status: 'In Transit' }, company)).not.toContain('apologize');
  });

  it('adds the tracking block only when there is both a courier and a tracking number', () => {
    const tracking = { kind: 'text' as const, text: 'Contact courier with tracking number: GT1' };
    expect(whatsappText({ ...base, trackingNo: 'GT1', tracking }, company)).not.toContain('Track your shipment');
    expect(whatsappText({ ...base, courierName: 'Gujarat Transport', tracking: null }, company)).not.toContain('Track your shipment');
    expect(whatsappText({ ...base, courierName: 'Gujarat Transport', trackingNo: 'GT1', tracking }, company)).toContain(
      '🔍 Track your shipment:\nContact courier with tracking number: GT1',
    );
  });
});

describe('QR payload', () => {
  it('is ID|Party|Track|Status, NA without tracking, and separators in values are neutralised', () => {
    expect(qrPayload({ dspNo: 'DSP-0001', partyName: 'Used Party', trackingNo: null, status: 'Pending' })).toBe(
      'ID:DSP-0001|Party:Used Party|Track:NA|Status:Pending',
    );
    expect(qrPayload({ dspNo: 'DSP-0002', partyName: 'A|B\nC', trackingNo: ' ', status: 'Delivered' })).toBe(
      'ID:DSP-0002|Party:A/B C|Track:NA|Status:Delivered',
    );
  });

  it('the endpoint returns only the text (no image, no external URL)', async () => {
    const { t, admin, dsp } = await app();
    const qr = await (await t.request('GET', `${ST}/dispatches/${dsp.id}/qr`, { cookie: admin })).json();
    expect(qr).toEqual({ payload: 'ID:DSP-0002|Party:Gujarat Furniture Works|Track:BD123456789|Status:Pending' });
    expect(JSON.stringify(qr)).not.toMatch(/https?:/);
  });
});

describe('print permission and logging', () => {
  it('every print/share is logged', async () => {
    const { t, admin, dsp } = await app();
    for (const p of ['label', 'whatsapp', 'qr']) await t.request('GET', `${ST}/dispatches/${dsp.id}/${p}`, { cookie: admin });
    await t.request('GET', `${ST}/requests/r2/slip`, { cookie: admin });
    const log = await t.data.repos.activity.list({ sort: 'createdAt' });
    expect(log.rows.filter((r) => r.action === 'Print' || r.action === 'Share').map((r) => [r.action, r.details])).toEqual([
      ['Print', 'Printed courier label DSP-0002'],
      ['Share', 'Prepared WhatsApp update for DSP-0002'],
      ['Print', 'Generated QR code for DSP-0002'],
      ['Print', 'Printed request slip REQ-0002'],
    ]);
  });

  it('removing print from a role closes all four endpoints for it', async () => {
    const t = await makeTestApp();
    await t.request('PUT', `${ST}/role-permissions/marketing`, {
      cookie: await t.login('superadmin'),
      body: { pages: ['requests', 'tracking'], actions: ['edit'], widgets: [] },
    });
    const mk = await t.login('marketing');
    for (const path of [`${ST}/dispatches/d1/label`, `${ST}/dispatches/d1/whatsapp`, `${ST}/dispatches/d1/qr`, `${ST}/requests/r2/slip`]) {
      const res = await t.request('GET', path, { cookie: mk });
      expect(res.status, path).toBe(403);
      expect((await res.json()).error.code).toBe('action_forbidden');
    }
    // A refused print is not logged as a print.
    expect((await t.data.repos.activity.list({ filters: { action: 'Print' } })).total).toBe(0);
  });

  it('404 for unknown or deleted records', async () => {
    const t = await makeTestApp();
    const admin = await t.login('admin');
    expect((await t.request('GET', `${ST}/dispatches/nope/label`, { cookie: admin })).status).toBe(404);
    expect((await t.request('GET', `${ST}/requests/nope/slip`, { cookie: admin })).status).toBe(404);
  });
});
