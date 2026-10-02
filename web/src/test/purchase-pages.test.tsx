import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calcEntry, MATERIALS, type PurchaseEntryView } from '@contracts/purchase';
import { SessionProvider, type SessionUser } from '@/app/session';
import { ToastProvider } from '@/components/ui';
import { routes } from '@/router';

const buyer: SessionUser = {
  id: 'u-a',
  code: 'admin',
  name: 'Rahul Admin',
  role: 'Admin',
  scopeNote: 'All modules',
  firms: ['llp'],
  permissions: ['*'],
  st: { pages: [], actions: ['edit', 'delete', 'print', 'export', 'purchase_approve'], widgets: [] },
};
/** Can enter purchases but not approve them. */
const clerk: SessionUser = { ...buyer, id: 'u-c', permissions: ['purchase.view', 'purchase.entries', 'purchase.inventory'], st: { pages: [], actions: ['edit', 'print'], widgets: [] } };
const viewer: SessionUser = { ...clerk, id: 'u-v', st: { pages: [], actions: [], widgets: [] } };

const base = { material: 'nilgiri' as const, invQty: 12400, splQty: 12730, ratePaise: 770000, rateDiffPaise: 20000, otherChargesPaise: 0, taxType: 'SG+CG' as const, gstPct: 18 };
const entry = (over: Partial<PurchaseEntryView> = {}): PurchaseEntryView => ({
  id: 'pe-1',
  ...base,
  date: '2026-09-10',
  lotNo: 'N01',
  poId: null,
  vendorId: null,
  vendorName: 'TM Nilgiri Supplier',
  vendorCode: null,
  gstin: null,
  pan: null,
  city: null,
  state: null,
  mobile: null,
  invoiceNo: 'GT/1/26-27',
  invoiceDate: null,
  vehicleNo: 'GJ01HT0324',
  driver: null,
  transporter: null,
  rstNo: null,
  mrnNo: null,
  grnNo: null,
  remarks: null,
  itemId: null,
  itemName: null,
  hsn: null,
  species: 'Eucalyptus',
  veneerType: null,
  altQtyPcs: null,
  status: 'pending',
  approvedBy: null,
  approvedAt: null,
  qtyNoteStatus: 'Pending',
  rateNoteStatus: 'Pending',
  createdBy: null,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  calc: calcEntry(base),
  poNo: null,
  approvedByName: null,
  createdByName: null,
  documentCount: 0,
  ...over,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const meta = { materials: MATERIALS, currentFy: '2026-27', fys: ['2027-28', '2026-27'], types: [{ id: 't1', kind: 'nilgiri_species', name: 'Eucalyptus', sortOrder: 1 }] };
const ledgerRow = { key: 'resin', material: 'resin', species: null, openQty: 0, openPaise: 0, purchQty: 1000, purchPaise: 4000000, returnQty: 0, returnPaise: 0, consumeQty: 0, consumePaise: 0, closingQty: 1000, closingPaise: 4000000, avgRatePaise: 4000000, entries: 1 };

function fakeApi() {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/purchase/meta') return json(meta);
    if (url.startsWith('/api/purchase/entries/stats')) return json({ entries: 1, splQty: 12730, splTotalPaise: 11566478, payablePaise: 11266000, avgRatePaise: 770000, notes: 2, notesPaise: 600000 });
    if (url.startsWith('/api/purchase/entries/next-lot')) return json({ lotNo: 'N02' });
    if (url.startsWith('/api/purchase/entries?')) return json({ rows: [entry()], total: 1 });
    if (url === '/api/purchase/entries/pe-1/approve' && method === 'POST') return json(entry({ status: 'approved' }));
    if (url.startsWith('/api/purchase/pos/options')) return json([]);
    if (url.startsWith('/api/purchase/vendor-options')) return json([]);
    if (url.startsWith('/api/purchase/inventory'))
      return json({ fy: '2026-27', opening: { fy: '2026-27', asOnDate: '2026-03-31', source: 'blank', status: null, approvedByName: null, approvedAt: null, items: [], totalPaise: 0 }, rows: [ledgerRow], ageing: [] });
    if (url.includes('/badges')) return json({});
    return json({ rows: [], total: 0 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const writes = (fn: ReturnType<typeof fakeApi>) => fn.mock.calls.filter((c) => ((c as unknown[])[1] as RequestInit | undefined)?.method && ((c as unknown[])[1] as RequestInit).method !== 'GET').map((c) => String(c[0]));

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

describe('Purchase register', () => {
  it('lists entries for the material tab with their notes and status', async () => {
    fakeApi();
    renderAt('/purchase/register?material=nilgiri', buyer);
    const table = await screen.findByRole('table', { name: 'Nilgiri Wood entries' });
    await within(table).findByText('TM Nilgiri Supplier');
    expect(within(table).getByText('Credit note')).toBeTruthy(); // SPL 12 730 > invoice 12 400
    expect(within(table).getByText('Rate DN')).toBeTruthy();
    expect(within(table).getByText('Awaiting approval')).toBeTruthy();
  });

  it('approve is offered only with purchase_approve', async () => {
    const fetchFn = fakeApi();
    renderAt('/purchase/register', clerk);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for N01' }));
    expect(screen.queryByRole('menuitem', { name: 'Approve' })).toBeNull();
    cleanup();
    renderAt('/purchase/register', buyer);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for N01' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Approve' }));
    await waitFor(() => expect(writes(fetchFn)).toContain('/api/purchase/entries/pe-1/approve'));
  });
});

describe('Entry form', () => {
  it('checks required fields first, then previews the amounts the server will store', async () => {
    const fetchFn = fakeApi();
    renderAt('/purchase/register?material=nilgiri', buyer);
    fireEvent.click(await screen.findByRole('button', { name: 'Add entry' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add Nilgiri Wood entry' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save entry' }));
    expect(await within(dialog).findByText('Vendor is required')).toBeTruthy();
    expect(within(dialog).getByText('Invoice number is required')).toBeTruthy();
    expect(writes(fetchFn)).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText('Invoice qty'), { target: { value: '12400' } });
    fireEvent.change(within(dialog).getByLabelText('Strandply qty'), { target: { value: '12730' } });
    fireEvent.change(within(dialog).getByLabelText('Rate per Ton'), { target: { value: '7700' } });
    const breakup = within(dialog).getByRole('table', { name: 'Amount breakup' });
    expect(within(breakup).getByText('₹95,480.00')).toBeTruthy(); // invoice basic, per ton
    expect(within(breakup).getByText('Excess received (Strandply > invoice)')).toBeTruthy();
    expect(within(dialog).getByPlaceholderText('N02 (next)')).toBeTruthy();
  });
});

describe('Raw material stock', () => {
  it('consumption is editable with edit rights, read-only without', async () => {
    fakeApi();
    renderAt('/purchase/inventory', clerk);
    expect(await screen.findByLabelText('Consumption, Resin')).toBeTruthy();
    cleanup();
    renderAt('/purchase/inventory', viewer);
    await screen.findByRole('table', { name: 'Stock ledger' });
    expect(screen.queryByLabelText('Consumption, Resin')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enter opening stock' })).toBeNull();
  });
});
