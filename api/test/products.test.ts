import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { mapColumns } from '../src/modules/sampletrack/masters/product-import';
import { makeTestApp, type TestApp } from './helpers';

const PR = '/api/sampletrack/products';

function upload(content: string | Uint8Array, name: string) {
  const f = new FormData();
  f.append('file', new File([content as string], name));
  return f;
}

function xlsxOf(rows: unknown[][], bookType: 'xlsx' | 'xls' = 'xlsx') {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer);
}

async function importFile(t: TestApp, cookie: string, content: string | Uint8Array, name: string, commit = false) {
  const res = await t.request('POST', `${PR}/import${commit ? '?commit=true' : ''}`, { cookie, form: upload(content, name) });
  return { status: res.status, body: await res.json() };
}

describe('products', () => {
  it('requires name and a unique (case-insensitive) code', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    expect((await t.request('POST', PR, { cookie, body: { code: 'X-1' } })).status).toBe(422);
    expect((await t.request('POST', PR, { cookie, body: { name: 'No code' } })).status).toBe(422);
    const dup = await t.request('POST', PR, { cookie, body: { code: 'osb-12-8x4', name: 'Another' } });
    expect(dup.status).toBe(409);
    expect((await dup.json()).error.code).toBe('code_taken');
    const ok = await (await t.request('POST', PR, { cookie, body: { code: 'FV-04', name: 'Face Veneer 4mm', boardType: 'Face Veneer', thicknessMm: 4, unitPricePaise: 42050 } })).json();
    expect(ok).toMatchObject({ stockStatus: 'Available', unitPricePaise: 42050 });
    const renameClash = await t.request('PATCH', `${PR}/${ok.id}`, { cookie, body: { code: 'MDO-12-8X4' } });
    expect(renameClash.status).toBe(409);
  });

  it('filters by board type and returns summary counts', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('marketing');
    const osb = await (await t.request('GET', `${PR}?boardType=OSB&sort=code`, { cookie })).json();
    expect(osb.rows.map((p: { code: string }) => p.code)).toEqual(['OSB-12-8X4', 'OSB-18-8X4', 'USED-1']);
    expect(await (await t.request('GET', `${PR}/summary`, { cookie })).json()).toEqual({ total: 7, osb: 3, sosb: 1, mdo: 1, others: 2 });
  });

  it('delete is blocked while a request line uses the product', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const res = await t.request('DELETE', `${PR}/prod-used`, { cookie });
    expect(res.status).toBe(409);
    expect((await res.json()).error.details).toEqual({ requests: 1, dispatches: 0 });
    expect((await t.request('DELETE', `${PR}/prod-osb-12-8x4`, { cookie })).status).toBe(204);
    // Its code is free again.
    expect((await t.request('POST', PR, { cookie, body: { code: 'OSB-12-8X4', name: 'OSB 12 v2' } })).status).toBe(201);
  });

  it('exports all columns with prices in rupees; the export can be imported back', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const res = await t.request('GET', `${PR}/export?boardType=MDO`, { cookie });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(XLSX.read(bytes, { type: 'array' }).Sheets['Products']!);
    expect(rows).toEqual([
      expect.objectContaining({ 'Product Code': 'MDO-12-8X4', 'Board Type': 'MDO', 'Thickness (mm)': 12, 'Unit Price (₹)': 950, 'Stock Status': 'Limited' }),
    ]);
    const again = await importFile(t, cookie, bytes, 'export.xlsx');
    expect(again.body.rows[0]).toMatchObject({ status: 'skipped', reason: 'Duplicate name (same as existing product MDO-12-8X4)' });
  });

  it('template download has the import headers and parses back with every column mapped', async () => {
    const t = await makeTestApp();
    const res = await t.request('GET', `${PR}/import-template`, { cookie: await t.login('marketing') });
    const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' });
    expect(wb.SheetNames).toEqual(['Products', 'Allowed values']);
    const headers = (XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Products']!, { header: 1 })[0] ?? []) as string[];
    expect(Object.values(mapColumns(headers)).every(Boolean)).toBe(true);
  });
});

describe('product import', () => {
  const sheet = [
    ['Item Code', 'PRODUCT NAME', 'Board', 'Thick', 'Dimensions', 'Cat', 'MRP', 'Availability'],
    ['HYB-12', 'Hybrid 12mm', 'hybrid', '12 mm', '8x4 ft', 'Premium', '₹1,250.50', 'limited'],
    ['', '', '', '', '', '', '', ''],
    ['X-1', '   ', 'OSB', '', '', '', '', ''],
    ['X-2', 'osb 12MM standard', 'OSB', '12', '', '', '', ''],
    ['X-3', 'Hybrid 12MM', 'Hybrid', '12', '', '', '', ''],
    ['', 'No Code Board', 'OSB', '', '', '', '', ''],
    ['BAD-1', 'Bad Board', 'Plywood', '', '', '', '', ''],
    ['BAD-2', 'Bad Price', 'OSB', '', '', '', 'twelve', ''],
    ['osb-18-8x4', 'Code Clash', 'OSB', '', '', '', '', ''],
    ['SOSB-9', 'S OSB 9', 's osb', '9', '', '', '700', 'OUT OF STOCK'],
  ];

  it('preview maps headers flexibly, reports each row, and writes nothing', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const before = (await t.data.repos.products.listKeys()).length;
    const { status, body } = await importFile(t, cookie, xlsxOf(sheet), 'products.xlsx');
    expect(status).toBe(200);
    expect(body.mode).toBe('preview');
    expect(body.columns).toEqual({
      code: 'Item Code',
      name: 'PRODUCT NAME',
      boardType: 'Board',
      thicknessMm: 'Thick',
      size: 'Dimensions',
      category: 'Cat',
      unitPricePaise: 'MRP',
      stockStatus: 'Availability',
    });
    expect(body.rows.map((r: { row: number; status: string; reason?: string }) => [r.row, r.status, r.reason ?? ''])).toEqual([
      [2, 'would_add', ''],
      [3, 'skipped', 'Empty row'],
      [4, 'skipped', 'Empty product name'],
      [5, 'skipped', 'Duplicate name (same as existing product OSB-12-8X4)'],
      [6, 'skipped', 'Duplicate name (same as row 2)'],
      [7, 'error', 'Product code is required'],
      [8, 'error', 'Unknown board type "Plywood" (use OSB, S-OSB, Hybrid, MDO, Core Veneer, Face Veneer)'],
      [9, 'error', 'Price "twelve" is not a valid amount'],
      [10, 'error', 'Code osb-18-8x4 is already used by existing product "OSB 18mm Premium"'],
      [11, 'would_add', ''],
    ]);
    expect(body.rows[0].product).toEqual({
      code: 'HYB-12',
      name: 'Hybrid 12mm',
      boardType: 'Hybrid',
      thicknessMm: 12,
      size: '8x4 ft',
      category: 'Premium',
      unitPricePaise: 125050,
      stockStatus: 'Limited',
    });
    expect(body.rows[9].product).toMatchObject({ boardType: 'S-OSB', stockStatus: 'Out of Stock', unitPricePaise: 70000, category: 'Standard' });
    expect(body.totals).toEqual({ rows: 10, added: 2, skipped: 4, errors: 4 });
    expect((await t.data.repos.products.listKeys()).length).toBe(before);
  });

  it('commit adds the valid rows in one go and logs one Import entry', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('marketing');
    const { body } = await importFile(t, cookie, xlsxOf(sheet), 'products.xlsx', true);
    expect(body.mode).toBe('commit');
    expect(body.totals).toEqual({ rows: 10, added: 2, skipped: 4, errors: 4 });
    expect(body.rows.filter((r: { status: string }) => r.status === 'added').map((r: { row: number }) => r.row)).toEqual([2, 11]);
    expect(await t.data.repos.products.getByCode('hyb-12')).toMatchObject({ unitPricePaise: 125050, createdBy: 'u-marketing' });
    const log = await t.data.repos.activity.list({ filters: { action: 'Import' } });
    expect(log.rows[0]!.details).toBe('Imported 2 products from products.xlsx (4 skipped, 4 errors)');

    // Importing the same file again adds nothing: every name is now a duplicate.
    const again = await importFile(t, cookie, xlsxOf(sheet), 'products.xlsx', true);
    expect(again.body.totals.added).toBe(0);
  });

  it('reads csv and legacy xls', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    const csv = await importFile(t, cookie, 'code,name,price,stock\nC-1,"CSV Board, thin",99.5,Available\n\n', 'p.csv');
    expect(csv.body.rows).toEqual([expect.objectContaining({ row: 2, status: 'would_add', product: expect.objectContaining({ name: 'CSV Board, thin', unitPricePaise: 9950 }) })]);
    const xls = await importFile(t, cookie, xlsxOf([['Code', 'Name'], ['X-9', 'XLS Board']], 'xls'), 'p.xls');
    expect(xls.body.rows[0]).toMatchObject({ status: 'would_add', product: { code: 'X-9', boardType: 'OSB' } });
  });

  it('rejects missing, empty, oversized, wrong-type and header-less files', async () => {
    const t = await makeTestApp();
    const cookie = await t.login('admin');
    expect((await t.request('POST', `${PR}/import`, { cookie, form: new FormData() })).status).toBe(422);
    expect((await importFile(t, cookie, '', 'p.csv')).status).toBe(422);
    expect((await importFile(t, cookie, 'a,b\n1,2', 'p.txt')).status).toBe(422);
    expect((await importFile(t, cookie, new Uint8Array(2 * 1024 * 1024 + 1), 'big.xlsx')).status).toBe(422);
    expect((await importFile(t, cookie, xlsxOf([['', ''], ['A', 'B']]), 'p.xlsx')).body.error.message).toMatch(/headers/);
  });

  it('caps the row count', async () => {
    const t = await makeTestApp();
    const lines = ['code,name', ...Array.from({ length: 5001 }, (_, i) => `C${i},Board ${i}`)].join('\n');
    const res = await importFile(t, await t.login('admin'), lines, 'many.csv');
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/5000/);
  });
});
