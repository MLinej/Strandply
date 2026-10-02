import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VendorView } from '@contracts/vendors';
import { SessionProvider, type SessionUser } from '@/app/session';
import { ToastProvider } from '@/components/ui';
import { routes } from '@/router';

const buyer: SessionUser = {
  id: 'u-b',
  code: 'admin',
  name: 'Rahul Admin',
  role: 'Admin',
  scopeNote: 'All modules',
  firms: ['llp'],
  permissions: ['*'],
  st: { pages: [], actions: ['edit', 'delete', 'print', 'export', 'vendor_approve'], widgets: [] },
};
/** Can add and edit vendors but not approve them (no vendor_approve). */
const clerk: SessionUser = { ...buyer, id: 'u-c', permissions: ['vendors.view', 'vendors.directory'], st: { pages: ['vendors'], actions: ['edit'], widgets: [] } };
const viewer: SessionUser = { ...clerk, id: 'u-v', st: { pages: ['vendors'], actions: [], widgets: [] } };

const vendor = (over: Partial<VendorView> = {}): VendorView => ({
  id: 'v1',
  code: 'SPL-VEN-26-001',
  name: 'Sunrise Timber Traders',
  type: 'Trader',
  yearEstablished: null,
  categoryIds: ['c1'],
  productIds: [],
  contact: 'Anil Verma',
  designation: null,
  phone: '9765432100',
  email: null,
  address: null,
  pincode: null,
  city: 'Valsad',
  state: 'Gujarat',
  website: null,
  gst: null,
  pan: null,
  msme: null,
  paymentTerms: '30 Days',
  bank: null,
  accountNo: null,
  ifsc: null,
  rating: 3,
  notes: null,
  status: 'pending',
  submittedAt: '2026-10-01T09:00:00.000Z',
  approvedAt: null,
  approvedBy: null,
  activatedAt: null,
  activatedBy: null,
  blacklistReason: null,
  blacklistedAt: null,
  blacklistedBy: null,
  createdBy: null,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
  deletedAt: null,
  categories: [{ id: 'c1', name: 'Raw Material', icon: '🪵', color: 'yellow' }],
  products: [],
  createdByName: 'Rahul Admin',
  approvedByName: null,
  activatedByName: null,
  blacklistedByName: null,
  ...over,
});
const second = vendor({ id: 'v2', code: 'SPL-VEN-26-002', name: 'Hexion Resins', status: 'active', rating: 5 });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeApi() {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.startsWith('/api/vendors?') || url === '/api/vendors') return json({ rows: [vendor(), second], total: 2 });
    if (url === '/api/vendors/stats') return json({ total: 2, pending: 1, approved: 0, active: 1, inactive: 0, blacklisted: 0 });
    if (url === '/api/vendors/categories') return json([{ id: 'c1', name: 'Raw Material', icon: '🪵', color: 'yellow', status: 'active', productCount: 0, vendorCount: 1, sampleProducts: [] }]);
    if (url === '/api/vendors/products/all') return json([]);
    if (url.startsWith('/api/vendors/compare')) return json([vendor(), second]);
    if (url.startsWith('/api/vendors/options')) return json([]);
    if (url === '/api/vendors/v1/approve' && method === 'POST') return json(vendor({ status: 'approved' }));
    if (url === '/api/vendors/v1/blacklist' && method === 'POST') return json(vendor({ status: 'blacklisted', blacklistReason: 'Late' }));
    if (url === '/api/vendors/v1') return json(vendor());
    if (url === '/api/sampletrack/cities/pincode/363621') return json({ pincode: '363621', city: 'Wankaner', state: 'Gujarat' });
    if (url === '/api/sampletrack/states') return json([{ id: 'state-24', name: 'Gujarat', gstCode: '24', kind: 'State' }]);
    if (url === '/api/sampletrack/cities/options') return json([]);
    if (url.includes('/badges')) return json({});
    return json({ rows: [], total: 0 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const posts = (fn: ReturnType<typeof fakeApi>) =>
  fn.mock.calls.filter((c) => ['POST', 'PATCH'].includes(((c as unknown[])[1] as RequestInit | undefined)?.method ?? '')).map((c) => ({ url: String(c[0]), body: ((c as unknown[])[1] as RequestInit).body }));

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

describe('Vendors directory', () => {
  it('shows status tabs with counts, and a status tab filters through the URL', async () => {
    const fetchFn = fakeApi();
    const router = renderAt('/vendors/directory', buyer);
    const tabs = await screen.findByRole('tablist', { name: 'Vendor status' });
    await within(tabs).findByText('2');
    fireEvent.click(within(tabs).getByRole('tab', { name: /Pending/ }));
    await waitFor(() => expect(router.state.location.search).toContain('status=pending'));
    await waitFor(() => expect(fetchFn.mock.calls.some((c) => String(c[0]).includes('status=pending'))).toBe(true));
  });

  it('approval steps need vendor_approve; editing alone does not offer them', async () => {
    fakeApi();
    renderAt('/vendors/directory', clerk);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Sunrise Timber Traders' }));
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Blacklist' })).toBeNull();
  });

  it('a read-only role has no Add vendor button', async () => {
    fakeApi();
    renderAt('/vendors/directory', viewer);
    await screen.findByText('Sunrise Timber Traders');
    expect(screen.queryByRole('button', { name: 'Add vendor' })).toBeNull();
  });

  it('approve from the row menu calls the approve endpoint', async () => {
    const fetchFn = fakeApi();
    renderAt('/vendors/directory', buyer);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Sunrise Timber Traders' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Approve' }));
    await waitFor(() => expect(posts(fetchFn).map((p) => p.url)).toContain('/api/vendors/v1/approve'));
  });

  it('blacklisting asks for a reason before calling the API', async () => {
    const fetchFn = fakeApi();
    renderAt('/vendors/directory', buyer);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Sunrise Timber Traders' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Blacklist' }));
    const dialog = await screen.findByRole('dialog', { name: /Blacklist Sunrise/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Blacklist' }));
    expect(await within(dialog).findByText('Give a reason for blacklisting')).toBeTruthy();
    expect(posts(fetchFn)).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Late twice' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Blacklist' }));
    await waitFor(() => expect(posts(fetchFn)).toEqual([{ url: '/api/vendors/v1/blacklist', body: JSON.stringify({ reason: 'Late twice' }) }]));
  });

  it('ticking two vendors offers Compare, which opens the compare page with both ids', async () => {
    fakeApi();
    const router = renderAt('/vendors/directory', buyer);
    await screen.findByText('Sunrise Timber Traders');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select v1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select v2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/vendors/compare'));
    expect(router.state.location.search).toBe('?ids=v1,v2');
    expect(await screen.findByRole('rowheader', { name: 'Payment terms' })).toBeTruthy();
  });
});

describe('Vendor form', () => {
  it('needs a name and a category before calling the API; a pincode fills city and state', async () => {
    const fetchFn = fakeApi();
    renderAt('/vendors/directory', buyer);
    fireEvent.click(await screen.findByRole('button', { name: 'Add vendor' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add vendor' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit for review' }));
    expect(await within(dialog).findByText('Vendor name is required')).toBeTruthy();
    expect(within(dialog).getByText('Select at least one category')).toBeTruthy();
    expect(posts(fetchFn)).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText('Pincode'), { target: { value: '363621' } });
    await waitFor(() => expect((within(dialog).getByLabelText('City') as HTMLInputElement).value).toBe('Wankaner'));
    expect(within(dialog).getByText('✓ Wankaner, Gujarat')).toBeTruthy();
  });
});
