import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUALITY_STATUSES, STORE_MATERIALS, STORE_UNITS, type GrnView, type MrnView } from '@contracts/stores';
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
  st: { pages: [], actions: ['edit', 'delete', 'print', 'export', 'stores_review', 'stores_approve', 'stores_account'], widgets: [] },
};
/** Security at the gate: gate entry only, no GRN page. */
const security: SessionUser = { ...admin, id: 'u-s', permissions: ['stores.view', 'stores.gate'], st: { pages: [], actions: ['edit'], widgets: [] } };
/** Stores clerk: can make GRNs and review them, not approve. */
const clerk: SessionUser = { ...admin, id: 'u-c', permissions: ['stores.view', 'stores.gate', 'stores.grn'], st: { pages: [], actions: ['edit', 'stores_review'], widgets: [] } };

const audit = { createdBy: null, createdAt: '2026-09-28T04:45:00.000Z', updatedAt: '2026-09-28T04:45:00.000Z', deletedAt: null };
const mrn: MrnView = {
  id: 'm1',
  mrnNo: 'MRN/26-27/0001',
  fy: '2026-27',
  date: '2026-09-28',
  time: '10:15',
  vehicleNo: 'GJ01HT0324',
  securityName: 'Ramesh',
  driverName: null,
  driverPhone: null,
  vendorId: null,
  vendorName: 'TM Nilgiri Supplier',
  invoiceNo: 'GT/1/26-27',
  remarks: null,
  items: [
    { id: 'i1', material: 'nilgiri', approxQty: 12000, unit: 'Kg', packages: null, remarks: null },
    { id: 'i2', material: 'resin', approxQty: 500, unit: 'Kg', packages: '2 drums', remarks: null },
  ],
  status: 'pending_grn',
  grnId: null,
  grnNo: null,
  ...audit,
  createdByName: null,
  daysPending: 3,
};
const grn = (over: Partial<GrnView> = {}): GrnView => ({
  id: 'g1',
  grnNo: 'GRN/26-27/0001',
  fy: '2026-27',
  date: '2026-09-28',
  time: '11:00',
  mrnId: 'm0',
  mrnNo: 'MRN/26-27/0000',
  vehicleNo: 'GJ01HT0324',
  vendorName: 'V.K.Industrioes',
  invoiceNo: 'VK/9',
  purchaseEntryId: null,
  items: [{ id: 'gi', mrnItemId: 'x', material: 'resin', approxQty: 500, actualQty: 480, unit: 'Kg', quality: 'short', qualityRemarks: null }],
  receivedByName: 'Keeper',
  remarks: null,
  status: 'draft',
  reviewedBy: null,
  reviewedAt: null,
  approvedBy: null,
  approvedAt: null,
  accounted: false,
  voucherNo: null,
  accountedBy: null,
  accountedAt: null,
  ...audit,
  worstQuality: 'short',
  reviewedByName: null,
  approvedByName: null,
  accountedByName: null,
  createdByName: null,
  purchaseEntry: null,
  ...over,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const meta = {
  materials: STORE_MATERIALS,
  units: STORE_UNITS,
  qualities: QUALITY_STATUSES,
  currentFy: '2026-27',
  fys: ['2026-27'],
  settings: { autoPunchMrn: true, autoPunchGrn: true },
  nextMrnNo: 'MRN/26-27/0002',
  nextGrnNo: 'GRN/26-27/0002',
  today: '2026-10-01',
  now: '14:30',
};

function fakeApi(grns: GrnView[] = [grn()]) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/stores/meta') return json(meta);
    if (url.startsWith('/api/stores/mrns/m1') && method === 'GET') return json(mrn);
    if (url.startsWith('/api/stores/mrns')) return json({ rows: [mrn], total: 1 });
    if (url.startsWith('/api/stores/vendor-options')) return json([]);
    if (url.startsWith('/api/stores/grns/invoice-link')) return json({ match: null });
    if (/\/api\/stores\/grns\/g1\/(review|approve)$/.test(url)) return json(grn({ status: url.endsWith('review') ? 'reviewed' : 'approved' }));
    if (url === '/api/stores/grns/g1/account' && method === 'POST') return json(grn({ status: 'approved', accounted: true, voucherNo: 'PV/1' }));
    if (url.startsWith('/api/stores/grns')) return json({ rows: grns, total: grns.length });
    if (url.startsWith('/api/stores/accounting')) return json({ rows: grns, kpis: { accounted: 0, pending: grns.length, pct: 0, awaitingApproval: 0 } });
    if (url.includes('/badges')) return json({});
    return json({ rows: [], total: 0 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const writes = (fn: ReturnType<typeof fakeApi>) =>
  fn.mock.calls
    .filter((c) => ((c as unknown[])[1] as RequestInit | undefined)?.method && ((c as unknown[])[1] as RequestInit).method !== 'GET')
    .map((c) => ({ url: String(c[0]), body: ((c as unknown[])[1] as RequestInit).body }));

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

describe('Gate entry register', () => {
  it('lists MRNs with their status and how long they have waited', async () => {
    fakeApi();
    renderAt('/stores/gate-entry', security);
    const table = await screen.findByRole('table', { name: 'Gate entries' });
    await within(table).findByText('MRN/26-27/0001');
    expect(within(table).getByText('Pending GRN')).toBeTruthy();
    expect(within(table).getByText('3 days')).toBeTruthy();
    expect(within(table).getByText('Nilgiri Wood, Resin')).toBeTruthy();
  });

  it('"Make GRN" is offered only to people with the GRN page, and opens the GRN form for that MRN', async () => {
    fakeApi();
    renderAt('/stores/gate-entry', security);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for MRN/26-27/0001' }));
    expect(screen.queryByRole('menuitem', { name: 'Make GRN' })).toBeNull();
    cleanup();
    const router = renderAt('/stores/gate-entry', clerk);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for MRN/26-27/0001' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Make GRN' }));
    const dialog = await screen.findByRole('dialog', { name: 'New goods receipt (GRN)' });
    expect(router.state.location.pathname).toBe('/stores/grn');
    // Lines, vendor and invoice come from the MRN.
    await waitFor(() => expect(within(dialog).getByLabelText('Actual quantity, item 2')).toBeTruthy());
    expect((within(dialog).getByLabelText('Invoice / bill no.') as HTMLInputElement).value).toBe('GT/1/26-27');
    expect((within(dialog).getByLabelText('Vendor') as HTMLInputElement).value).toBe('TM Nilgiri Supplier');
  });

  it('the gate entry form checks required fields before saving', async () => {
    const fetchFn = fakeApi();
    renderAt('/stores/gate-entry', security);
    fireEvent.click(await screen.findByRole('button', { name: 'New gate entry' }));
    const dialog = await screen.findByRole('dialog', { name: 'New gate entry (MRN)' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save gate entry' }));
    expect(await within(dialog).findByText('Vehicle number is required')).toBeTruthy();
    expect(within(dialog).getByText('Add at least one material')).toBeTruthy();
    expect(writes(fetchFn)).toHaveLength(0);
    // Fixing a field clears its message.
    fireEvent.change(within(dialog).getByLabelText('Vehicle no.'), { target: { value: 'gj01' } });
    expect(within(dialog).queryByText('Vehicle number is required')).toBeNull();
    expect((within(dialog).getByLabelText('Vehicle no.') as HTMLInputElement).value).toBe('GJ01');
  });
});

describe('GRN register', () => {
  it('review needs stores_review, approve needs stores_approve', async () => {
    const fetchFn = fakeApi([grn(), grn({ id: 'g2', grnNo: 'GRN/26-27/0002', status: 'reviewed' })]);
    renderAt('/stores/grn', clerk);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for GRN/26-27/0002' }));
    expect(screen.queryByRole('menuitem', { name: 'Approve' })).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    cleanup();
    renderAt('/stores/grn', clerk);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for GRN/26-27/0001' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark reviewed' }));
    await waitFor(() => expect(writes(fetchFn).map((w) => w.url)).toContain('/api/stores/grns/g1/review'));
  });
});

describe('Accounting', () => {
  it('a voucher number is required to mark a GRN accounted', async () => {
    const fetchFn = fakeApi([grn({ status: 'approved' })]);
    renderAt('/stores/accounting', admin);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark GRN/26-27/0001 accounted' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mark GRN/26-27/0001 accounted' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark accounted' }));
    expect(await within(dialog).findByText('Voucher / entry number is required')).toBeTruthy();
    expect(writes(fetchFn)).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText('Voucher / entry no.'), { target: { value: 'PV/001/26-27' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark accounted' }));
    await waitFor(() => expect(writes(fetchFn)).toEqual([{ url: '/api/stores/grns/g1/account', body: JSON.stringify({ voucherNo: 'PV/001/26-27' }) }]));
    // The row button doesn't also open the GRN behind it.
    expect(screen.queryByRole('dialog', { name: /^GRN / })).toBeNull();
  });

  it('without stores_account there are no accounting buttons', async () => {
    fakeApi([grn({ status: 'approved' })]);
    renderAt('/stores/accounting', { ...admin, permissions: ['stores.view', 'stores.accounting'], st: { ...admin.st, actions: ['export'] } });
    await screen.findByRole('table', { name: 'Approved GRNs' });
    await screen.findByText('GRN/26-27/0001');
    expect(screen.queryByRole('button', { name: /accounted/ })).toBeNull();
  });
});
