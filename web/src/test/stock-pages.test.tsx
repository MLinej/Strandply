import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEPARTMENTS, FAMILIES, GRADES, RECLASS_SCENARIOS, SHIFTS, SIZES, STAGES, type SkuGroup, type SlipView } from '@contracts/stock';
import { SessionProvider, type SessionUser } from '@/app/session';
import { ToastProvider } from '@/components/ui';
import { routes } from '@/router';

const admin: SessionUser = {
  id: 'u-a',
  code: 'admin',
  name: 'Rahul Admin',
  role: 'Admin',
  scopeNote: 'All modules',
  firms: ['llp'],
  permissions: ['*'],
  st: { pages: [], actions: ['edit', 'delete', 'print', 'export'], widgets: [] },
};
/** Can make slips but not reverse them. */
const storekeeper: SessionUser = { ...admin, id: 'u-k', permissions: ['stock.view', 'stock.slips'], st: { pages: [], actions: ['edit', 'print'], widgets: [] } };

const audit = { createdBy: null, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', deletedAt: null };
const group = (prefix: string, over: Partial<SkuGroup> = {}): SkuGroup => ({
  id: `skug-${prefix.toLowerCase()}`,
  prefix,
  label: `${prefix} board`,
  family: 'OC',
  dept: 'Stock (GRA)',
  size: '2590×1320',
  grade: 'A',
  unit: 'pcs',
  thicknesses: ['09', '12'],
  sortOrder: 1,
  ...audit,
  ...over,
});
const groups = [group('OC-611'), group('OC-I01', { dept: 'Cutting Dept (WIP)', grade: null }), group('RM-05000', { family: 'RM', dept: 'Raw Material Store', unit: 'kg', thicknesses: [] })];
const meta = { families: FAMILIES, departments: DEPARTMENTS, stages: STAGES, sizes: SIZES, grades: GRADES, shifts: SHIFTS, scenarios: RECLASS_SCENARIOS, groups, today: '2026-10-01', company: { name: 'Strandply LLP', llpin: null, city: null, phone: null, gst: null } };
const info = (g: SkuGroup, thick: string | null) => ({ sku: `${g.prefix}${thick ?? ''}`, groupId: g.id, prefix: g.prefix, thick, label: g.label, family: g.family, dept: g.dept, size: g.size, grade: g.grade, unit: g.unit });
const slip: SlipView = {
  id: 'sl-1',
  type: 'SIS',
  slipNo: 'ISS/2026/001',
  date: '2026-09-10',
  from: { groupId: 'skug-oc-611', thick: '12', sku: 'OC-61112' },
  to: { groupId: 'skug-oc-i01', thick: '12', sku: 'OC-I0112' },
  qty: 30,
  batch: 'B-00001',
  refNo: null,
  shift: null,
  remarks: null,
  ...audit,
  fromInfo: info(groups[0]!, '12'),
  toInfo: info(groups[1]!, '12'),
  createdByName: null,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function fakeApi() {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/stock/meta') return json(meta);
    if (url.startsWith('/api/stock/balance')) return json({ sku: new URL(url, 'http://x').searchParams.get('sku'), qty: url.includes('OC-61112') ? 60 : 0 });
    if (url === '/api/stock/slips' && method === 'POST') return json({ ...slip, id: 'sl-2', slipNo: 'ISS/2026/002' }, 201);
    if (url.startsWith('/api/stock/slips/sl-2')) return json({ ...slip, id: 'sl-2', slipNo: 'ISS/2026/002' });
    if (url.startsWith('/api/stock/slips')) return json({ rows: [slip], total: 1 });
    if (url.startsWith('/api/stock/ledger/sku'))
      return json({
        sku: 'OC-61112',
        openingQty: 0,
        legs: [
          { kind: 'opening', docId: 'op-1', docNo: 'Opening', date: '2026-09-01', createdAt: '', sku: 'OC-61112', groupId: 'skug-oc-611', thick: '12', dept: 'Stock (GRA)', qty: 100, balance: 100 },
          { kind: 'SIS', docId: 'sl-1', docNo: 'ISS/2026/001', date: '2026-09-10', createdAt: '', sku: 'OC-61112', groupId: 'skug-oc-611', thick: '12', dept: 'Stock (GRA)', qty: -30, balance: 70 },
        ],
        totals: { out: 30, in: 100, net: 70 },
        closingQty: 70,
      });
    if (url === '/api/stock/items/skug-oc-611' && method === 'PATCH') return json({ error: { code: 'in_use', message: 'OC-611 has stock movements, so its prefix can’t change' } }, 409);
    if (url.includes('/badges')) return json({});
    return json({ rows: [], total: 0 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const writes = (fn: ReturnType<typeof fakeApi>) =>
  fn.mock.calls
    .filter((c) => ((c as unknown[])[1] as RequestInit | undefined)?.method && ((c as unknown[])[1] as RequestInit).method !== 'GET')
    .map((c) => ({ url: String(c[0]), body: JSON.parse(String(((c as unknown[])[1] as RequestInit).body ?? 'null')) }));

function renderAt(path: string, user: SessionUser) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SessionProvider user={user}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  return router;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Stock slip form', () => {
  it('builds SKU codes from item + thickness, shows the balance, and saves MINUS / PLUS sides', async () => {
    const fetchFn = fakeApi();
    renderAt('/stock/slips?new=SIS', storekeeper);
    const dialog = await screen.findByRole('dialog', { name: 'New stock issue slip (SIS)' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save SIS' }));
    expect(await within(dialog).findByText('Pick the FROM item')).toBeTruthy();
    expect(within(dialog).getByText('Enter the quantity')).toBeTruthy();
    expect(writes(fetchFn)).toHaveLength(0);

    await waitFor(() => expect(dialog.querySelectorAll('#from-group option').length).toBeGreaterThan(1));
    fireEvent.change(dialog.querySelector('#from-group')!, { target: { value: 'skug-oc-611' } });
    const fromBox = dialog.querySelector('#from-group')!.closest('fieldset')!;
    fireEvent.click(within(fromBox as HTMLElement).getByRole('radio', { name: '12 mm' }));
    expect(await within(dialog).findByTestId('from-sku')).toHaveProperty('textContent', 'OC-61112');
    expect(await within(fromBox as HTMLElement).findByText('60 pcs')).toBeTruthy();

    fireEvent.change(dialog.querySelector('#to-group')!, { target: { value: 'skug-oc-i01' } });
    fireEvent.click(within(dialog.querySelector('#to-group')!.closest('fieldset')! as HTMLElement).getByRole('radio', { name: '12 mm' }));
    fireEvent.change(within(dialog).getByLabelText('Quantity'), { target: { value: '25' } });
    expect(within(dialog).getByLabelText('Miracle entry preview').textContent).toContain('OC-I0112');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save SIS' }));
    await waitFor(() => expect(writes(fetchFn)).toHaveLength(1));
    expect(writes(fetchFn)[0]).toMatchObject({
      url: '/api/stock/slips',
      body: { type: 'SIS', from: { groupId: 'skug-oc-611', thick: '12' }, to: { groupId: 'skug-oc-i01', thick: '12' }, qty: 25 },
    });
    expect(await screen.findByRole('dialog', { name: 'ISS/2026/002' })).toBeTruthy();
  });

  it('a fixed-code item needs no thickness', async () => {
    fakeApi();
    renderAt('/stock/slips?new=SRS', storekeeper);
    const dialog = await screen.findByRole('dialog', { name: 'New stock receipt slip (SRS)' });
    await waitFor(() => expect(dialog.querySelectorAll('#from-group option').length).toBeGreaterThan(1));
    fireEvent.change(dialog.querySelector('#from-group')!, { target: { value: 'skug-rm-05000' } });
    expect(within(dialog).getByText('Fixed code, no thickness.')).toBeTruthy();
    expect(within(dialog).getByTestId('from-sku').textContent).toBe('RM-05000');
  });
});

describe('Slips register', () => {
  it('reversing a slip needs the delete permission', async () => {
    fakeApi();
    renderAt('/stock/slips', storekeeper);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for ISS/2026/001' }));
    expect(screen.getByRole('menuitem', { name: 'Print slip' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Reverse' })).toBeNull();
    cleanup();
    renderAt('/stock/slips', admin);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for ISS/2026/001' }));
    expect(screen.getByRole('menuitem', { name: 'Reverse' })).toBeTruthy();
  });
});

describe('Ledger and item master', () => {
  it('the SKU ledger shows the running balance and totals', async () => {
    fakeApi();
    renderAt('/stock/ledger?sku=OC-61112', admin);
    const table = await screen.findByRole('table', { name: 'SKU ledger' });
    await within(table).findByText('ISS/2026/001');
    const rows = within(table).getAllByRole('row');
    expect(rows[2]!.textContent).toContain('70');
    expect(screen.getByText('Closing').parentElement!.textContent).toContain('70');
  });

  it('shows the server’s reason when a used prefix is changed', async () => {
    fakeApi();
    renderAt('/stock/items', admin);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for OC-611' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit OC-611' });
    expect((within(dialog).getByLabelText('Thicknesses (mm)') as HTMLInputElement).value).toBe('09, 12');
    fireEvent.change(within(dialog).getByLabelText('SKU prefix'), { target: { value: 'oc-6110' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('OC-611 has stock movements, so its prefix can’t change')).toBeTruthy();
  });
});
