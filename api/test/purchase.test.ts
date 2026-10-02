import { describe, expect, it } from 'vitest';
import { calcEntry, fyOf, isFy, prevFy } from '../src/contracts/purchase';
import { buildSeed } from '../src/seed';
import { upgradeSnapshot } from '../src/seed/upgrades';
import { makeTestApp, T0 } from './helpers';

const PU = '/api/purchase';

async function admin() {
  const t = await makeTestApp();
  const cookie = await t.login('admin');
  const call = (method: string, path: string, body?: unknown) => t.request(method, `${PU}${path}`, { cookie, body });
  return { t, cookie, call };
}

describe('calcEntry (legacy calcEntry / renderSlip)', () => {
  it('reproduces the legacy GT/1/26-27 Nilgiri row: per ton, 9% + 9% GST, a quantity CN and a rate DN', () => {
    const c = calcEntry({ material: 'nilgiri', invQty: 12400, splQty: 12730, ratePaise: 770000, rateDiffPaise: 20000, otherChargesPaise: 0, taxType: 'SG+CG', gstPct: 18 });
    expect(c.invoice).toEqual({ basic: 9548000, cgst: 859320, sgst: 859320, igst: 0, total: 11266640 }); // ₹95,480 + ₹8,593.20 × 2
    expect(c.spl.basic).toBe(9802100); // ₹98,021
    expect(c.diffQty).toBe(330);
    expect(c.qtyNote).toMatchObject({ type: 'cn', qty: 330, basic: 254100 }); // ₹2,541, as the legacy dn_basic_stock
    expect(c.rateNote).toMatchObject({ type: 'dn', qty: 12730, basic: 254600 });
    // Payable is the SPL total less the rate DN — the quantity note only reconciles the invoice.
    expect(c.payable).toBe(c.spl.total - c.rateNote!.total);
    expect(c.invoice.total + c.qtyNote!.total).toBe(c.spl.total);
  });

  it('per-unit materials, IGST, URD and other charges', () => {
    const kraft = calcEntry({ material: 'kraft', invQty: 3000, splQty: 3000, ratePaise: 3200, rateDiffPaise: 0, otherChargesPaise: 200000, taxType: 'IGST', gstPct: 18 });
    expect(kraft.invoice).toEqual({ basic: 9600000, cgst: 0, sgst: 0, igst: 1728000, total: 11528000 }); // the legacy VK/6 row incl. ₹2,000 freight
    expect(kraft.qtyNote).toBeNull();
    expect(kraft.payable).toBe(11528000);
    const urd = calcEntry({ material: 'firewood', invQty: 10000, splQty: 9800, ratePaise: 500000, rateDiffPaise: -10000, otherChargesPaise: 0, taxType: 'URD', gstPct: 18 });
    expect(urd.spl).toEqual({ basic: 4900000, cgst: 0, sgst: 0, igst: 0, total: 4900000 });
    expect(urd.qtyNote).toMatchObject({ type: 'dn', qty: 200, total: 100000 });
    expect(urd.rateNote).toMatchObject({ type: 'cn', total: 98000 });
    expect(urd.payable).toBe(4900000 + 98000);
  });

  it('financial years run April to March', () => {
    expect(fyOf('2026-04-01')).toBe('2026-27');
    expect(fyOf('2027-03-31')).toBe('2026-27');
    expect(prevFy('2026-27')).toBe('2025-26');
    expect(isFy('2026-27')).toBe(true);
    expect(isFy('2026-28')).toBe(false);
  });
});

describe('purchase entries', () => {
  it('suggests the next lot per material and FY, and assigns it when left blank', async () => {
    const { call } = await admin();
    expect(await (await call('GET', '/entries/next-lot?material=nilgiri&date=2026-09-30')).json()).toEqual({ lotNo: 'N02' });
    expect(await (await call('GET', '/entries/next-lot?material=nilgiri&date=2027-04-02')).json()).toEqual({ lotNo: 'N01' }); // new FY
    const res = await call('POST', '/entries', { material: 'nilgiri', date: '2026-09-30', vendorName: 'New Wood Co', invoiceNo: 'NW/1', taxType: 'SG+CG', species: 'Subabul', invQty: 1000, splQty: 990, ratePaise: 700000 });
    expect(res.status).toBe(201);
    const e = await res.json();
    expect(e).toMatchObject({ lotNo: 'N02', status: 'pending', gstPct: 18, calc: { qtyNote: { type: 'dn', qty: 10 } } });
  });

  it('checks fields, the PO’s material and species only on Nilgiri', async () => {
    const { call } = await admin();
    const bad = await call('POST', '/entries', { material: 'resin', date: '2026-02-30', vendorName: '', invoiceNo: '', taxType: 'GST', invQty: 0, splQty: -1, ratePaise: 0 });
    expect(bad.status).toBe(422);
    const paths = (await bad.json()).error.details.map((d: { path: string }) => d.path).sort();
    expect(paths).toEqual(['date', 'invQty', 'invoiceNo', 'ratePaise', 'splQty', 'taxType', 'vendorName']);
    const wrongPo = await call('POST', '/entries', { material: 'resin', date: '2026-09-30', vendorName: 'X', invoiceNo: 'X/1', taxType: 'SG+CG', invQty: 1, splQty: 1, ratePaise: 100, poId: 'po-used', species: 'Eucalyptus' });
    expect((await wrongPo.json()).error.details).toEqual([
      { path: 'poId', message: 'PO PO-USED is for Nilgiri Wood' },
      { path: 'species', message: 'Only Nilgiri wood has a species' },
    ]);
  });

  it('warns about a repeated vendor invoice unless forced', async () => {
    const { call } = await admin();
    const body = { material: 'nilgiri', date: '2026-09-30', vendorName: 'tm nilgiri  supplier', invoiceNo: 'inv-pe-1', taxType: 'SG+CG', invQty: 1, splQty: 1, ratePaise: 100 };
    const dup = await call('POST', '/entries', body);
    expect(dup.status).toBe(409);
    expect((await dup.json()).error.code).toBe('possible_duplicate');
    expect((await call('POST', '/entries?force=true', body)).status).toBe(201);
  });

  it('draft → post → approve; editing an approved entry sends it back for approval', async () => {
    const { call } = await admin();
    expect((await (await call('POST', '/entries/pe-draft/approve')).json()).error.code).toBe('not_posted');
    expect(await (await call('PATCH', '/entries/pe-draft', { post: true })).json()).toMatchObject({ status: 'pending' });
    expect(await (await call('POST', '/entries/pe-1/approve')).json()).toMatchObject({ status: 'approved', approvedByName: 'Admin User' });
    const edited = await (await call('PATCH', '/entries/pe-1', { splQty: 12700 })).json();
    // Only splQty changed: the rate difference and GST rate are kept.
    expect(edited).toMatchObject({ status: 'pending', approvedBy: null, rateDiffPaise: 20000, gstPct: 18, calc: { diffQty: 300 } });
  });

  it('register lists and stats leave drafts out; filters by month', async () => {
    const { call } = await admin();
    const stats = await (await call('GET', '/entries/stats?fy=2026-27')).json();
    expect(stats).toMatchObject({ entries: 2, notes: 3 }); // pe-1 (qty CN + rate DN), pe-2 (qty DN)
    const sept = await (await call('GET', '/entries?month=2026-09&material=resin')).json();
    expect(sept.rows.map((r: { id: string }) => r.id)).toEqual(['pe-2']);
  });

  it('print payloads: slip for any entry, lot label for Nilgiri only', async () => {
    const { call } = await admin();
    const slip = await (await call('GET', '/entries/pe-2/print?kind=slip')).json();
    expect(slip.company.name).toBe('Strandply LLP');
    expect(slip.entry.calc.qtyNote.type).toBe('dn');
    expect((await call('GET', '/entries/pe-2/print?kind=label')).status).toBe(422);
  });
});

describe('debit / credit notes', () => {
  it('derives quantity and rate notes from posted entries, with totals', async () => {
    const { call } = await admin();
    const { rows, stats } = await (await call('GET', '/notes?fy=2026-27')).json();
    expect(rows.map((r: { id: string; type: string }) => `${r.id}:${r.type}`).sort()).toEqual(['pe-1:qty:cn', 'pe-1:rate:dn', 'pe-2:qty:dn']);
    expect(stats.debit.count).toBe(1);
    expect(stats.credit.count).toBe(1);
    expect(stats.rate.count).toBe(1);
    expect(stats.netPaise).toBe(stats.debit.paise - stats.credit.paise);
    const rd = await (await call('GET', '/notes?type=rd')).json();
    expect(rd.rows).toHaveLength(1);
  });

  it('status moves through the legacy flow and is logged', async () => {
    const { t, call } = await admin();
    expect((await call('PATCH', '/notes/pe-2/qty', { status: 'Issued' })).status).toBe(204);
    expect((await call('PATCH', '/notes/pe-2/rate', { status: 'Issued' })).status).toBe(404); // pe-2 has no rate note
    const { rows } = await (await call('GET', '/notes?status=Issued')).json();
    expect(rows.map((r: { id: string }) => r.id)).toEqual(['pe-2:qty']);
    const log = await t.services.activity.list({ filters: { entityPrefix: 'purchase_' } });
    expect(log.rows[0]!.details).toContain('Pending → Issued');
  });
});

describe('purchase orders', () => {
  it('received, balance and progress come from posted entries against the PO', async () => {
    const { call } = await admin();
    const po = await (await call('GET', '/pos/po-used')).json();
    expect(po).toMatchObject({ receivedQty: 12730, balanceQty: 287270, pctComplete: 4, progress: 'Partial', valuePaise: 231000000 });
    const { stats } = await (await call('GET', '/pos')).json();
    expect(stats).toMatchObject({ total: 2, open: 1, partial: 1, closed: 0 });
    const opts = await (await call('GET', '/pos/options?material=nilgiri')).json();
    expect(opts).toEqual([{ id: 'po-used', poNo: 'PO-USED', vendorId: null, vendorName: 'TM Nilgiri Supplier', ratePaise: 770000, balanceQty: 287270 }]);
  });

  it('numbers itself PO-YY-NNN when left blank; numbers are unique; approve; edits need re-approval', async () => {
    const { call } = await admin();
    const body = { date: '2026-09-30', material: 'kraft', vendorName: 'V.K.Industrioes', qty: 5000, ratePaise: 3200, tncIds: ['tnc-po-weight'] };
    const po = await (await call('POST', '/pos', body)).json();
    expect(po).toMatchObject({ poNo: 'PO-26-001', status: 'pending', valuePaise: 16000000 });
    expect((await call('POST', '/pos', { ...body, poNo: 'po-26-001' })).status).toBe(409);
    await call('POST', `/pos/${po.id}/approve`);
    expect(await (await call('PATCH', `/pos/${po.id}`, { qty: 6000 })).json()).toMatchObject({ status: 'pending', qty: 6000 });
    const print = await (await call('GET', `/pos/${po.id}/print`)).json();
    expect(print.tnc.map((t: { title: string }) => t.title)).toEqual(['Weight Variation']);
  });

  it('a PO with entries against it can’t be deleted or switch material', async () => {
    const { call } = await admin();
    expect((await call('DELETE', '/pos/po-used')).status).toBe(409);
    expect((await (await call('PATCH', '/pos/po-used', { material: 'resin' })).json()).error.code).toBe('po_in_use');
    expect((await call('DELETE', '/pos/po-free')).status).toBe(204);
  });
});

describe('returns', () => {
  it('RET-YY-NNN numbering, details from the original entry, amount with GST', async () => {
    const { call } = await admin();
    const r = await (await call('POST', '/returns', { date: '2026-09-28', material: 'resin', entryId: 'pe-2', qty: 100, ratePaise: 4000000 })).json();
    expect(r).toMatchObject({ returnNo: 'RET-26-001', vendorName: 'V.K.Industrioes', originalInvoiceNo: 'INV-pe-2', amount: { basic: 400000, total: 472000 } });
    expect((await call('POST', '/returns', { date: '2026-09-28', material: 'nilgiri', entryId: 'pe-2', qty: 1, ratePaise: 1 })).status).toBe(422);
  });
});

describe('inventory', () => {
  it('opening + purchases − returns − consumption = closing, valued at basic', async () => {
    const { call } = await admin();
    await call('PUT', '/opening-stock/2026-27', { asOnDate: '2026-03-31', mode: 'draft', items: [{ material: 'nilgiri', species: 'Eucalyptus', qty: 5000, ratePaise: 700000 }] });
    await call('PUT', '/consumption/2026-27', { key: 'nilgiri::Eucalyptus', qty: 4000 });
    const v = await (await call('GET', '/inventory?fy=2026-27')).json();
    const euc = v.rows.find((r: { key: string }) => r.key === 'nilgiri::Eucalyptus');
    // open 5 000 kg @ ₹7,000/t = ₹35,000; bought 12 730 kg = ₹98,021; returned 1 000 kg @ ₹7,700/t = ₹7,700
    expect(euc).toMatchObject({ openQty: 5000, openPaise: 3500000, purchQty: 12730, purchPaise: 9802100, returnQty: 1000, returnPaise: 770000, consumeQty: 4000, closingQty: 12730 });
    expect(euc.avgRatePaise).toBe(Math.round((3500000 + 9802100 - 770000) / 16.73));
    expect(euc.closingPaise).toBe(3500000 + 9802100 - 770000 - euc.consumePaise);
    expect(v.rows.map((r: { key: string }) => r.key)).toEqual([
      'nilgiri::Eucalyptus',
      'nilgiri::Subabul',
      'nilgiri::Other',
      'resin',
      'kraft',
      'firewood',
      'core',
      'face',
    ]);
    expect(v.rows.find((r: { key: string }) => r.key === 'kraft').purchQty).toBe(0); // the kraft entry is a draft
  });

  it('opening stock: submit, approve locks it, unlock reopens it', async () => {
    const { call } = await admin();
    const body = { asOnDate: '2026-03-31', mode: 'submit', items: [{ material: 'resin', qty: 500, ratePaise: 4000000 }] };
    expect(await (await call('PUT', '/opening-stock/2026-27', body)).json()).toMatchObject({ source: 'saved', status: 'pending', totalPaise: 2000000 });
    expect(await (await call('POST', '/opening-stock/2026-27/approve')).json()).toMatchObject({ status: 'approved', approvedByName: 'Admin User' });
    expect((await (await call('PUT', '/opening-stock/2026-27', body)).json()).error.code).toBe('opening_locked');
    expect(await (await call('POST', '/opening-stock/2026-27/unlock')).json()).toMatchObject({ status: 'draft' });
    expect((await call('PUT', '/opening-stock/2026-27', body)).status).toBe(200);
  });

  it('next FY opens with last FY’s closing until one is saved', async () => {
    const { call } = await admin();
    const v = await (await call('GET', '/inventory?fy=2027-28')).json();
    expect(v.opening.source).toBe('carried');
    expect(v.opening.items.find((i: { material: string }) => i.material === 'resin')).toMatchObject({ qty: 18250, remarks: 'Carried from FY 2026-27 closing' });
    expect(v.rows.find((r: { key: string }) => r.key === 'resin').openQty).toBe(18250);
  });

  it('ages closing stock FIFO: what’s left is the newest receipts', async () => {
    const { call } = await admin();
    const v = await (await call('GET', '/inventory?fy=2026-27')).json();
    const resin = v.ageing.find((a: { material: string }) => a.material === 'resin').buckets;
    expect(resin.find((b: { label: string }) => b.label === '0–30 days').qty).toBe(18250); // received 2026-09-15, clock 2026-10-01
  });
});

describe('dashboard and reports', () => {
  it('dashboard KPIs for the FY', async () => {
    const { call } = await admin();
    const d = await (await call('GET', '/dashboard?fy=2026-27')).json();
    expect(d.kpis).toMatchObject({ entries: 2, vendors: 2, pendingApproval: 2, pendingDebitNotes: { count: 1 }, pendingCreditNotes: { count: 1 } });
    expect(d.monthly).toEqual([{ label: '2026-09', value: d.kpis.totalSplPaise }]);
    expect(d.recent.map((r: { id: string }) => r.id)).toEqual(['pe-2', 'pe-1']);
  });

  it('reports: product × day, rate variance, vendor performance, real Nilgiri yield', async () => {
    const { call } = await admin();
    await call('PUT', '/consumption/2026-27', { key: 'nilgiri::Eucalyptus', qty: 6365 });
    const r = await (await call('GET', '/reports?fy=2026-27')).json();
    expect(r.productDay.map((d: { date: string; material: string }) => `${d.date} ${d.material}`)).toEqual(['2026-09-10 nilgiri', '2026-09-15 resin']);
    expect(r.rateVariance).toEqual([
      expect.objectContaining({ entryId: 'pe-1', invoiceRatePaise: 770000, agreedRatePaise: 750000, diffPaise: 20000, impactPaise: 254600 }),
    ]);
    expect(r.vendors[0]).toMatchObject({ vendorName: 'V.K.Industrioes', qtyVariancePct: 0.08 });
    expect(r.nilgiriYield).toMatchObject({ purchasedQty: 12730, consumedQty: 6365, consumedPct: 50 });
  });
});

describe('documents', () => {
  const upload = (name: string, bytes: number[], type = 'Invoice', entryId?: string) => {
    const f = new FormData();
    f.append('file', new File([new Uint8Array(bytes)], name));
    f.append('type', type);
    if (entryId) f.append('entryId', entryId);
    return f;
  };
  const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];

  it('uploads a PDF against an entry, lists it, serves it back, and deletes it', async () => {
    const { t, cookie } = await admin();
    const res = await t.request('POST', `${PU}/documents`, { cookie, form: upload('VK 66.pdf', PDF, 'Invoice', 'pe-2') });
    expect(res.status).toBe(201);
    const doc = await res.json();
    expect(doc).toMatchObject({ name: 'VK 66.pdf', mime: 'application/pdf', sizeBytes: 8, entryLabel: 'Resin R01 · INV-pe-2', uploadedByName: 'Admin User' });
    const list = await (await t.request('GET', `${PU}/documents?entryId=pe-2`, { cookie })).json();
    expect(list).toMatchObject({ total: 1, byType: { Invoice: 1 } });
    expect((await (await t.request('GET', `${PU}/entries/pe-2`, { cookie })).json()).documentCount).toBe(1);
    const file = await t.request('GET', `${PU}/documents/${doc.id}/file`, { cookie });
    expect(file.headers.get('content-type')).toBe('application/pdf');
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual(PDF);
    expect((await t.request('DELETE', `${PU}/documents/${doc.id}`, { cookie })).status).toBe(204);
    expect((await t.request('GET', `${PU}/documents/${doc.id}/file`, { cookie })).status).toBe(404);
  });

  it('rejects other file types and files whose contents don’t match the extension', async () => {
    const { t, cookie } = await admin();
    const exe = await t.request('POST', `${PU}/documents`, { cookie, form: upload('setup.exe', [0x4d, 0x5a]) });
    expect((await exe.json()).error.message).toBe('Upload a PDF, JPG or PNG file');
    const fake = await t.request('POST', `${PU}/documents`, { cookie, form: upload('invoice.pdf', [0x3c, 0x68, 0x74, 0x6d, 0x6c]) });
    expect((await fake.json()).error.message).toBe('The file’s contents don’t match .pdf');
  });
});

describe('masters, vendor picker, audit', () => {
  it('type masters: add, unique per kind, keep at least one', async () => {
    const { call } = await admin();
    expect((await call('POST', '/types', { kind: 'face_veneer', name: 'Mahogany' })).status).toBe(201);
    expect((await call('POST', '/types', { kind: 'face_veneer', name: 'teak' })).status).toBe(409);
    const meta = await (await call('GET', '/meta')).json();
    expect(meta.currentFy).toBe('2026-27');
    expect(meta.fys[0]).toBe('2027-28');
    const species = meta.types.filter((t: { kind: string }) => t.kind === 'nilgiri_species');
    for (const s of species.slice(1)) expect((await call('DELETE', `/types/${s.id}`)).status).toBe(204);
    expect((await (await call('DELETE', `/types/${species[0].id}`)).json()).error.code).toBe('last_type');
  });

  it('vendor picker: not blacklisted, items with HSN, IGST outside Gujarat', async () => {
    const { call } = await admin();
    const opts = await (await call('GET', '/vendor-options')).json();
    expect(opts.map((o: { name: string }) => o.name)).not.toContain('Blacklisted Film');
    const appr = opts.find((o: { name: string }) => o.name === 'Approved Resins');
    expect(appr).toMatchObject({ suggestedTaxType: 'IGST', items: [{ name: 'MDI Resin', hsn: '3909', categoryName: 'Resin & Chemicals' }] });
    expect(opts.find((o: { name: string }) => o.name === 'Active Strands').suggestedTaxType).toBe('SG+CG');
  });

  it('audit trail shows only purchase activity', async () => {
    const { call } = await admin();
    await call('POST', '/entries/pe-1/approve');
    const audit = await (await call('GET', '/audit')).json();
    expect(audit.rows.every((r: { entityType: string }) => r.entityType.startsWith('purchase_'))).toBe(true);
    expect(audit.rows[0].action).toBe('Approve');
  });
});

describe('dev snapshot upgrade (0006)', () => {
  it('grants the Purchase keys and adds the PO clauses once', () => {
    const seed = buildSeed({ devUsers: false, at: T0.toISOString() });
    const old = structuredClone(seed) as Partial<typeof seed>;
    old.upgrades = [{ name: '0005_vendors', appliedAt: T0.toISOString() }];
    old.vnTnc = old.vnTnc!.filter((t) => !t.id.startsWith('tnc-po-'));
    for (const r of old.rolePermissions!) r.permissions.pages = r.permissions.pages.filter((p) => !p.startsWith('purchase_'));
    const up = upgradeSnapshot(old, seed, T0.toISOString());
    expect(up.rolePermissions!.find((r) => r.role === 'management')!.permissions.pages).toContain('purchase_inventory');
    expect(up.rolePermissions!.find((r) => r.role === 'dispatch')!.permissions.pages.some((p) => p.startsWith('purchase_'))).toBe(false);
    expect(up.vnTnc!.filter((t) => t.id.startsWith('tnc-po-'))).toHaveLength(4);
    expect(upgradeSnapshot(up, seed, T0.toISOString()).vnTnc).toHaveLength(up.vnTnc!.length);
  });

  it('fills Purchase tables that an earlier build saved empty', () => {
    const seed = buildSeed({ devUsers: true, at: T0.toISOString() });
    const old = { ...structuredClone(seed), upgrades: [{ name: '0005_vendors', appliedAt: T0.toISOString() }], puTypes: [], puEntries: [] };
    const up = upgradeSnapshot(old, seed, T0.toISOString());
    expect(up.puTypes).toHaveLength(7);
    expect(up.puEntries!.length).toBe(seed.puEntries.length);
  });
});
