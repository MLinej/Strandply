import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DispatchView } from '@contracts/sampletrack';
import { SessionProvider, type SessionUser } from '@/app/session';
import { ToastProvider } from '@/components/ui';
import { routes } from '@/router';

const dispatcher: SessionUser = {
  id: 'u-d',
  code: 'dispatch',
  name: 'Dispatch Mgr',
  role: 'Dispatch Dept',
  scopeNote: 'Dispatch',
  firms: ['llp'],
  permissions: ['samples.view', 'samples.dispatch', 'samples.tracking'],
  st: { pages: ['dispatch', 'tracking'], actions: ['edit', 'print'], widgets: [] },
};
const viewer: SessionUser = { ...dispatcher, id: 'u-v', st: { pages: ['dispatch'], actions: [], widgets: [] } };

const row = (over: Partial<DispatchView> = {}): DispatchView => ({
  id: 'd1',
  dspNo: 'DSP-0001',
  date: '2026-09-30',
  partyId: 'p1',
  partyName: 'Gujarat Furniture Works',
  partyCity: 'Rajkot',
  partyState: 'Gujarat',
  mode: 'Courier',
  courierId: 'c1',
  courierNameManual: null,
  courierName: 'Blue Dart',
  trackingNo: 'BD123',
  vehicleNo: null,
  driverDetails: null,
  expectedDeliveryDate: '2026-09-25',
  freightPaise: 45000,
  weightKg: 25,
  dimensions: null,
  productDescription: 'OSB 18mm 5 sheets',
  linkedRequestId: null,
  linkedRequestNo: null,
  remarks: null,
  status: 'In Transit',
  overdue: true,
  tracking: { kind: 'url', url: 'https://www.bluedart.com/tracking?trackfor=BD123' },
  createdBy: null,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  ...over,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeApi() {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/sampletrack/dispatches?')) return json({ rows: [row()], total: 1 });
    if (url === '/api/sampletrack/requests/r5/dispatch-draft')
      return json({ partyId: 'p5', partyName: 'Bengaluru Arch Studio', productDescription: 'Hybrid 18mm 2 sheets', linkedRequestId: 'r5', linkedRequestNo: 'REQ-0005', requestStatus: 'Approved' });
    if (url.startsWith('/api/sampletrack/couriers/options')) return json([{ id: 'c1', name: 'Blue Dart', type: 'Courier', trackingUrlTemplate: null }]);
    if (url.startsWith('/api/sampletrack/dispatches/request-options')) return json([]);
    if (url.startsWith('/api/sampletrack/dispatches/party-options')) return json([]);
    if (url === '/api/sampletrack/badges') return json({});
    return json({ rows: [], total: 0 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderAt(path: string, user = dispatcher) {
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

describe('Sample dispatch page', () => {
  it('lists dispatches with overdue flag and tracking link, using the URL filters', async () => {
    const fetchFn = fakeApi();
    renderAt('/samples/dispatch?overdue=true&status=In%20Transit');
    const table = await screen.findByRole('table', { name: 'Dispatches' });
    await within(table).findByText('DSP-0001');
    expect(within(table).getByText('Overdue')).toBeTruthy();
    expect(within(table).getByRole('link', { name: /BD123/ }).getAttribute('href')).toBe('https://www.bluedart.com/tracking?trackfor=BD123');
    const listCall = fetchFn.mock.calls.map((c) => String(c[0])).find((u) => u.startsWith('/api/sampletrack/dispatches?'))!;
    expect(listCall).toContain('status=In+Transit');
    expect(listCall).toContain('overdue=true');
    expect(screen.getByRole('button', { name: 'Overdue only' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('“Create dispatch from request” opens the form prefilled from the request', async () => {
    fakeApi();
    const router = renderAt('/samples/dispatch?fromRequest=r5');
    const dialog = await screen.findByRole('dialog', { name: 'New dispatch' });
    expect(within(dialog).getByText(/From REQ-0005 \(Approved\)/)).toBeTruthy();
    // The draft fills the form one render after the dialog opens, so wait for it.
    expect(await within(dialog).findByText('Bengaluru Arch Studio')).toBeTruthy();
    await waitFor(() => expect((within(dialog).getByLabelText('Contents') as HTMLInputElement).value).toBe('Hybrid 18mm 2 sheets'));
    await waitFor(() => expect(router.state.location.search).not.toContain('fromRequest'));
  });

  it('checks weight and courier before calling the API', async () => {
    const fetchFn = fakeApi();
    renderAt('/samples/dispatch?fromRequest=r5');
    const dialog = await screen.findByRole('dialog', { name: 'New dispatch' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create dispatch' }));
    expect(await within(dialog).findByText('Weight must be more than 0 kg')).toBeTruthy();
    expect(within(dialog).getByText(/Select a courier or choose “Other”/)).toBeTruthy();
    expect(fetchFn.mock.calls.some((c) => ((c as unknown[])[1] as RequestInit | undefined)?.method === 'POST')).toBe(false);
  });

  it('a role without edit sees no New dispatch button and no edit actions', async () => {
    fakeApi();
    renderAt('/samples/dispatch', viewer);
    await screen.findByText('DSP-0001');
    expect(screen.queryByRole('button', { name: 'New dispatch' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for DSP-0001' }));
    expect(screen.getByRole('menuitem', { name: 'View & track' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Update status' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Print label (A5)' })).toBeNull();
  });
});
