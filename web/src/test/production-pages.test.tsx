import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calcHotPress, DEFAULT_SIZES, DEFAULT_THICKNESSES, mattStats, MDO_TYPES, PLAN_SECTIONS, PRIORITIES, PRODUCTS, SHIFTS, type HotPressView, type MattBatchView, type WfState } from '@contracts/production';
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
  st: { pages: [], actions: ['edit', 'delete', 'print', 'export', 'production_review', 'production_approve'], widgets: [] },
};
const pages = ['production.view', 'production.press', 'production.matt', 'production.materials'];
/** Operator: enters and sends for review, nothing more. */
const operator: SessionUser = { ...admin, id: 'u-o', permissions: pages, st: { pages: [], actions: ['edit'], widgets: [] } };
/** Reviewer: reviews but can't approve. */
const reviewer: SessionUser = { ...admin, id: 'u-r', permissions: pages, st: { pages: [], actions: ['production_review'], widgets: [] } };

const audit = { createdBy: null, createdAt: '2026-09-20T03:00:00.000Z', updatedAt: '2026-09-20T03:00:00.000Z', deletedAt: null };
const charges = [
  { label: 'Charge 1', pcs: 30, load: '08:00', unload: '08:40', remarks: null },
  { label: 'Charge 2', pcs: 30, load: '08:50', unload: '09:30', remarks: null },
];
const hp = (state: WfState): HotPressView => ({
  id: 'hp-1',
  docNo: 'HP-0001',
  date: '2026-09-20',
  wfState: state,
  wfTrail: [],
  remarks: null,
  ...audit,
  shift: 'Day',
  product: 'OSB',
  size: '8x4',
  thickness: '12',
  operator: 'Ramesh',
  charges,
  createdByName: null,
  calc: calcHotPress(charges),
  cuttingNo: null,
});
const weights = [42.1, 41.2, 43.5].map((weight, i) => ({ n: i + 1, weight, at: audit.createdAt }));
const batch: MattBatchView = {
  id: 'mb-1',
  docNo: 'MWB-0001',
  date: '2026-09-20',
  shift: 'Day',
  product: 'OSB',
  size: '8x4',
  thickness: '12',
  operator: null,
  setpoint: 42,
  band: 0.5,
  targetQty: 60,
  remarks: null,
  status: 'open',
  weights,
  closedAt: null,
  ...audit,
  createdByName: null,
  stats: mattStats(weights.map((w) => w.weight), 42, 0.5),
};
const meta = {
  products: PRODUCTS,
  shifts: SHIFTS,
  priorities: PRIORITIES,
  mdoTypes: MDO_TYPES,
  planSections: PLAN_SECTIONS,
  settings: { thicknesses: DEFAULT_THICKNESSES, sizes: DEFAULT_SIZES, boardsPerCharge: 30, wetWoodFactor: 2.5, closedFys: [] },
  currentFy: '2026-27',
  fys: ['2026-27'],
  today: '2026-10-01',
};
const lot = { purchaseEntryId: 'pe-1', lotNo: 'N01', date: '2026-09-10', vendorName: 'TM Nilgiri Supplier', invoiceNo: 'GT/1', receivedKg: 12730, usedKg: 5000, availKg: 7730, netRatePaise: 750000, invoiceRatePaise: 770000, rateDiffPaise: 20000 };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function fakeApi(state: WfState = 'draft') {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/production/meta') return json(meta);
    if (url === '/api/production/hotpress' && method === 'POST') return json({ ...hp('draft'), id: 'hp-2', docNo: 'HP-0002' }, 201);
    if (url.startsWith('/api/production/hotpress/hp-1/')) return json({ ...hp(state), docNo: 'HP-0001' });
    if (url.startsWith('/api/production/hotpress/hp-')) return json(hp(state));
    if (url.startsWith('/api/production/hotpress')) return json({ rows: [hp(state)], total: 1 });
    if (url.startsWith('/api/production/lots')) return json([lot]);
    if (url === '/api/production/matt/mb-1/weights' && method === 'POST') return json({ ...batch, weights: [...weights, { n: 4, weight: 42.3, at: audit.createdAt }] }, 201);
    if (url.startsWith('/api/production/matt/mb-1')) return json(batch);
    if (url.startsWith('/api/production/matt')) return json({ rows: [batch], total: 1 });
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

describe('Hot press form', () => {
  it('previews boards and press / total / spare time, then saves the charges', async () => {
    const fetchFn = fakeApi();
    renderAt('/production/hot-press', operator);
    fireEvent.click(await screen.findByRole('button', { name: 'New report' }));
    const dlg = await screen.findByRole('dialog', { name: 'New hot press report' });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save report' }));
    expect(await within(dlg).findByText('Pick a product')).toBeTruthy();
    expect(within(dlg).getByText('Add at least one charge with pcs')).toBeTruthy();
    fireEvent.change(within(dlg).getByLabelText('Product'), { target: { value: 'OSB' } });
    fireEvent.change(within(dlg).getByLabelText('Pcs, charge 1'), { target: { value: '30' } });
    fireEvent.change(within(dlg).getByLabelText('Load time, charge 1'), { target: { value: '22:30' } });
    fireEvent.change(within(dlg).getByLabelText('Unload time, charge 1'), { target: { value: '23:10' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Add charge' }));
    fireEvent.change(within(dlg).getByLabelText('Pcs, charge 2'), { target: { value: '25' } });
    fireEvent.change(within(dlg).getByLabelText('Load time, charge 2'), { target: { value: '23:20' } });
    fireEvent.change(within(dlg).getByLabelText('Unload time, charge 2'), { target: { value: '00:10' } });
    expect(within(dlg).getByLabelText('Totals').textContent).toBe('55 boards · press 1h 30m · total 1h 40m · spare 0h 10m');
    expect(writes(fetchFn)).toHaveLength(0);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save report' }));
    await waitFor(() => expect(writes(fetchFn)).toHaveLength(1));
    expect(writes(fetchFn)[0]!.body).toMatchObject({ product: 'OSB', charges: [{ pcs: 30, load: '22:30', unload: '23:10' }, { pcs: 25, load: '23:20', unload: '00:10' }] });
  });
});

describe('Review and approval buttons', () => {
  it('an operator can only send a draft; a reviewer reviews or returns but never approves', async () => {
    fakeApi('draft');
    renderAt('/production/hot-press?open=hp-1', operator);
    let dlg = await screen.findByRole('dialog', { name: 'Hot press report HP-0001' });
    expect(await within(dlg).findByRole('button', { name: 'Send for review' })).toBeTruthy();
    expect(within(dlg).queryByRole('button', { name: 'Mark reviewed' })).toBeNull();
    cleanup();
    vi.unstubAllGlobals();
    const fetchFn = fakeApi('review');
    renderAt('/production/hot-press?open=hp-1', reviewer);
    dlg = await screen.findByRole('dialog', { name: 'Hot press report HP-0001' });
    expect(await within(dlg).findByRole('button', { name: 'Return' })).toBeTruthy();
    expect(within(dlg).queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(within(dlg).queryByRole('button', { name: 'Edit' })).toBeNull();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Return' }));
    const note = await screen.findByRole('dialog', { name: 'Return HP-0001 to draft' });
    fireEvent.change(within(note).getByLabelText('Reason'), { target: { value: 'Charge 2 time wrong' } });
    fireEvent.click(within(note).getByRole('button', { name: 'Return' }));
    await waitFor(() => expect(writes(fetchFn)).toEqual([{ url: '/api/production/hotpress/hp-1/review', body: { decision: 'return', note: 'Charge 2 time wrong' } }]));
  });
});

describe('Matt weight punch screen', () => {
  it('typed digits and Enter punch a weight; corrections need production_approve', async () => {
    const fetchFn = fakeApi();
    renderAt('/production/matt?batch=mb-1', operator);
    await screen.findByText('Matt batch MWB-0001');
    expect(screen.queryByRole('button', { name: 'Correct matt 2' })).toBeNull();
    for (const k of ['4', '2', '.', '3']) fireEvent.keyDown(window, { key: k });
    expect(screen.getByTestId('matt-display').textContent).toBe('42.3');
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => expect(writes(fetchFn)).toEqual([{ url: '/api/production/matt/mb-1/weights', body: { weight: 42.3 } }]));
    cleanup();
    vi.unstubAllGlobals();
    fakeApi();
    renderAt('/production/matt?batch=mb-1', admin);
    expect(await screen.findByRole('button', { name: 'Correct matt 2' })).toBeTruthy();
  });
});

describe('Chipping form', () => {
  it('shows the lot’s net rate and stops a quantity beyond what is left', async () => {
    const fetchFn = fakeApi();
    renderAt('/production/chipping?new=1', operator);
    const dlg = await screen.findByRole('dialog', { name: 'New chipping report' });
    await waitFor(() => expect(within(dlg).getByLabelText('Lot 1').querySelectorAll('option').length).toBe(2));
    fireEvent.change(within(dlg).getByLabelText('Lot 1'), { target: { value: 'pe-1' } });
    expect(within(dlg).getByText(/= net/).textContent).toContain('₹7.50/kg');
    fireEvent.change(within(dlg).getByLabelText('Quantity, lot 1'), { target: { value: '8000' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save report' }));
    expect(await within(dlg).findByText('Only 7,730 kg left')).toBeTruthy();
    expect(writes(fetchFn)).toHaveLength(0);
    fireEvent.change(within(dlg).getByLabelText('Quantity, lot 1'), { target: { value: '1000' } });
    expect(within(dlg).getByLabelText('Totals').textContent).toContain('1,000 kg · ₹7,500.00');
  });
});
