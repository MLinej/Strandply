import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rcCheck, type InquiryView, type RateComparisonView, type TransportMeta } from '@contracts/transport';
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

const audit = { createdBy: null, createdAt: '2026-09-20T03:00:00.000Z', updatedAt: '2026-09-20T03:00:00.000Z', deletedAt: null };
const meta: TransportMeta = {
  vehicles: ['32FT (10T)', 'Open Body'],
  cities: [
    { city: 'Halvad', state: 'Gujarat', pincode: '363330' },
    { city: 'Pune', state: 'Maharashtra', pincode: '411001' },
  ],
  transporters: [
    { id: 'trt-a', name: 'Alpha Roadways', phone: '9825000001', rating: 4, vehicles: ['32FT (10T)'], cities: ['Ahmedabad'] },
    { id: 'trt-b', name: 'Bharat Carriers', phone: '9825000002', rating: 3, vehicles: ['32FT (10T)'], cities: ['Pune'] },
    { id: 'trt-c', name: 'Chetak Logistics', phone: '9825000003', rating: 5, vehicles: ['Open Body'], cities: ['Rajkot'] },
  ],
  today: '2026-10-01',
};
const place = (city: string) => ({ city, state: null, pincode: null });
const inquiry: InquiryView = {
  id: 'inq-1', inqNo: 'INQ-26-001', date: '2026-09-21', from: place('Halvad'), to: place('Pune'), material: 'OSB 18mm', weightMt: 9, vehicle: '32FT (10T)', pickupDate: '2026-10-05',
  deliveryType: 'Door Delivery', freightPaidBy: 'Strandply', budgetPaise: 2_000_000, remarks: null, status: 'open', ...audit, rcId: null, rcNo: null, rcStatus: null, orderId: null, orderNo: null,
};
const quotes = [
  { transporterId: 'trt-b', transporterName: 'Bharat Carriers', ratePaise: 1_900_000, transit: '1 Day', mgWeightMt: null, rating: 3, phone: '9825000002' },
  { transporterId: 'trt-a', transporterName: 'Alpha Roadways', ratePaise: 1_800_000, transit: '2 Days', mgWeightMt: 9, rating: 4, phone: '9825000001' },
];
const pending: RateComparisonView = {
  id: 'rc-2', rcNo: 'RC-26-002', inquiryId: 'inq-1', quotes, selected: 0, justification: 'Bharat is a day faster', status: 'pending', approvalNo: 'FRA-26-001',
  trail: [{ action: 'submitted', by: 'u-d', byName: 'Dispatch User', note: null, at: '2026-09-22T05:00:00.000Z' }], ...audit,
  ...rcCheck(quotes, 0, 2_000_000), inqNo: 'INQ-26-001', inquiry, orderId: null, orderNo: null,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function fakeApi() {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/transport/meta') return json(meta);
    if (url === '/api/transport/inquiries' && method === 'POST') return json({ ...inquiry, id: 'inq-9', inqNo: 'INQ-26-009' }, 201);
    if (url === '/api/transport/inquiries/inq-1') return json(inquiry);
    if (url === '/api/transport/inquiries/inq-1/past-quotes') return json([{ transporterId: 'trt-a', transporterName: 'Alpha Roadways', ratePaise: 1_750_000, transit: '2 Days', rcNo: 'RC-26-000', date: '2026-08-01' }]);
    if (url === '/api/transport/inquiries/inq-1/rates' && method === 'PUT') return json({ ...pending, id: 'rc-9', status: 'draft', approvalNo: null, trail: [] });
    if (url === '/api/transport/rates/rc-9/submit') return json({ ...pending, id: 'rc-9' });
    if (url === '/api/transport/rates/rc-2/decision') return json({ ...pending, status: 'approved' });
    if (url === '/api/transport/rates/rc-2') return json(pending);
    if (url.startsWith('/api/transport/rates')) return json({ rows: [pending], total: 1 });
    if (url.includes('/badges')) return json({});
    return json({ rows: [], total: 0 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const writes = (fn: ReturnType<typeof fakeApi>) =>
  fn.mock.calls
    .filter((c) => ((c as unknown[])[1] as RequestInit | undefined)?.method && ((c as unknown[])[1] as RequestInit).method !== 'GET')
    .map((c) => ({ url: String(c[0]), method: ((c as unknown[])[1] as RequestInit).method, body: JSON.parse(String(((c as unknown[])[1] as RequestInit).body ?? 'null')) }));

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SessionProvider user={admin}>
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

describe('Rate comparison', () => {
  it('suggests transporters running the vehicle (route first), marks the lowest, asks for a reason, then saves and submits', async () => {
    const fetchFn = fakeApi();
    renderAt('/transport/rates?inquiry=inq-1');
    expect(await screen.findByRole('heading', { name: 'Compare rates · Halvad → Pune' })).toBeTruthy();
    const table = await screen.findByRole('table', { name: 'Transporter quotes' });
    // Bharat serves Pune, so it comes first; Chetak runs another vehicle and is left out.
    await waitFor(() => expect(within(table).getAllByText(/Roadways|Carriers|Logistics/).map((n) => n.textContent)).toEqual(['Bharat Carriers', 'Alpha Roadways']));
    expect(screen.getByText('Alpha Roadways', { selector: '.block' })).toBeTruthy(); // past rates panel
    fireEvent.change(screen.getByLabelText('Rate 1'), { target: { value: '19000' } });
    fireEvent.change(screen.getByLabelText('Rate 2'), { target: { value: '18000' } });
    expect(within(table).getByText('Lowest')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Pick Bharat Carriers'));
    expect(screen.getByRole('status').textContent).toMatch(/not the lowest/);
    fireEvent.change(screen.getByLabelText('Justification'), { target: { value: 'Bharat is a day faster' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(writes(fetchFn)).toHaveLength(2));
    expect(writes(fetchFn)).toEqual([
      {
        url: '/api/transport/inquiries/inq-1/rates',
        method: 'PUT',
        body: {
          quotes: [
            { transporterId: 'trt-b', ratePaise: 1_900_000, transit: '2 Days', mgWeightMt: null },
            { transporterId: 'trt-a', ratePaise: 1_800_000, transit: '2 Days', mgWeightMt: null },
          ],
          selected: 0,
          justification: 'Bharat is a day faster',
        },
      },
      { url: '/api/transport/rates/rc-9/submit', method: 'POST', body: null },
    ]);
  });

  it('an approver sees the pending pick read-only with its trail, and approves it', async () => {
    const fetchFn = fakeApi();
    renderAt('/transport/rates?open=rc-2');
    expect(await screen.findByRole('heading', { name: 'RC-26-002 · Halvad → Pune' })).toBeTruthy();
    expect(screen.queryByLabelText('Rate 1')).toBeNull();
    expect(within(screen.getByRole('list', { name: 'Approval trail' })).getByText('Submitted for approval')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const dlg = await screen.findByRole('dialog', { name: 'Approve FRA-26-001?' });
    expect(within(dlg).getByText(/exception/)).toBeTruthy();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(writes(fetchFn)).toEqual([{ url: '/api/transport/rates/rc-2/decision', method: 'POST', body: { decision: 'approve', note: null } }]));
  });
});

describe('Freight approvals', () => {
  it('lists comparisons waiting for approval with their exception flag', async () => {
    fakeApi();
    renderAt('/transport/approvals');
    expect(await screen.findByText('RC-26-002')).toBeTruthy();
    expect(screen.getByText('Not lowest')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Pending approval' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('Inquiries', () => {
  it('a new inquiry picks cities from the master (state and pincode filled) and sends blanks as null', async () => {
    const fetchFn = fakeApi();
    const router = renderAt('/transport/inquiries?new=1');
    const dlg = await screen.findByRole('dialog', { name: 'New freight inquiry' });
    const combos = within(dlg).getAllByRole('combobox', { name: /From|To/ }).filter((n) => n.tagName === 'INPUT');
    fireEvent.focus(combos[0]!);
    fireEvent.change(combos[0]!, { target: { value: 'halv' } });
    fireEvent.click(await within(screen.getAllByRole('listbox')[0]!).findByRole('option', { name: /Halvad/ }));
    fireEvent.focus(combos[1]!);
    fireEvent.change(combos[1]!, { target: { value: 'pune' } });
    fireEvent.click(await within(screen.getAllByRole('listbox')[0]!).findByRole('option', { name: /Pune/ }));
    fireEvent.change(within(dlg).getByLabelText('Material'), { target: { value: 'OSB 18mm' } });
    fireEvent.change(within(dlg).getByLabelText('Vehicle type'), { target: { value: '32FT (10T)' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Create inquiry' }));
    await waitFor(() => expect(writes(fetchFn)).toHaveLength(1));
    expect(writes(fetchFn)[0]).toMatchObject({
      url: '/api/transport/inquiries',
      body: { date: '2026-10-01', from: { city: 'Halvad', state: 'Gujarat', pincode: '363330' }, to: { city: 'Pune', state: 'Maharashtra', pincode: '411001' }, material: 'OSB 18mm', vehicle: '32FT (10T)', weightMt: null, pickupDate: null, budgetPaise: 0, remarks: null },
    });
    // Saving a new inquiry goes straight to comparing rates for it.
    await waitFor(() => expect(router.state.location.search).toBe('?inquiry=inq-9'));
  });
});
