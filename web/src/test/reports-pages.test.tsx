import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider, type SessionUser } from '@/app/session';
import { ToastProvider } from '@/components/ui';
import { routes } from '@/router';
import { hub } from './fixtures/hub';

const admin: SessionUser = { id: 'u-a', code: 'admin', name: 'Rahul Admin', role: 'Admin', scopeNote: 'All modules', firms: ['llp'], permissions: ['*'], st: { pages: [], actions: ['edit', 'delete', 'print', 'export'], widgets: [] } };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function fakeApi() {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://x');
    const m = url.pathname.match(/^\/api\/hub\/(\w+)$/);
    if (m && m[1] in hub) return json(hub[m[1] as keyof typeof hub]);
    if (url.pathname.includes('/badges')) return json({});
    return json({ rows: [], total: 0 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const hubCalls = (fn: ReturnType<typeof fakeApi>) => fn.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith('/api/hub/'));

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

describe('Reports hub dashboard', () => {
  it('shows the headline KPIs and a chart that switches to a table, with no month left out', async () => {
    fakeApi();
    renderAt('/reports/dashboard');
    expect((await screen.findAllByText('Sales revenue')).length).toBe(2);
    expect(screen.getAllByText(`${hub.overview.invoices} invoices`).length).toBeGreaterThan(0);
    const toggles = screen.getAllByRole('button', { name: 'Show table' });
    fireEvent.click(toggles[0]!);
    const table = await screen.findByRole('table', { name: 'Purchase value' });
    // Apr–Oct with no data in Jul: the quiet month is still a row.
    expect(within(table).getAllByRole('row').length).toBe(7 + 1);
    expect(within(table).getByText('Jul 26')).toBeTruthy();
  });

  it('a from/to range is sent to the API; from after to is caught by the API', async () => {
    const fetchFn = fakeApi();
    renderAt('/reports/dashboard');
    await screen.findByLabelText('From date');
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-09-30' } });
    await waitFor(() => expect(hubCalls(fetchFn).some((u) => u.includes('overview') && u.includes('from=2026-09-01') && u.includes('to=2026-09-30'))).toBe(true));
  });
});

describe('Module reports', () => {
  it('purchase: material filter goes to the API and the material table lists each material', async () => {
    const fetchFn = fakeApi();
    renderAt('/reports/purchase');
    const table = await screen.findByRole('table', { name: 'By material' });
    for (const m of hub.purchase.byMaterial) expect(within(table).getByText(m.label)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'resin' } });
    await waitFor(() => expect(hubCalls(fetchFn).some((u) => u.includes('purchase') && u.includes('material=resin'))).toBe(true));
  });

  it('production: boards by product with a total row', async () => {
    fakeApi();
    renderAt('/reports/production');
    const table = await screen.findByRole('table', { name: 'By product' });
    expect(within(table).getByText('18 mm OSB')).toBeTruthy();
    expect(within(table).getByText('1,260')).toBeTruthy();
  });

  it('sales: pending orders list every open order', async () => {
    fakeApi();
    renderAt('/reports/sales');
    const table = await screen.findByRole('table', { name: 'Pending sales orders' });
    for (const o of hub.sales.pendingOrders) expect(within(table).getByText(o.soNo)).toBeTruthy();
  });

  it('maintenance: overdue count and the open work orders', async () => {
    fakeApi();
    renderAt('/reports/maintenance');
    const table = await screen.findByRole('table', { name: 'Open work orders' });
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(hub.maintenance.openList.length);
    expect(screen.getByText('Needs attention')).toBeTruthy();
  });

  it('data sources: one row per module with its record count', async () => {
    fakeApi();
    renderAt('/reports/sources');
    for (const s of hub.sources.slice(0, 3)) expect((await screen.findAllByText(s.module)).length).toBeGreaterThan(0);
  });
});

describe('Period reports', () => {
  it('monthly: asks for the whole month and shows sections and other modules', async () => {
    const fetchFn = fakeApi();
    renderAt('/reports/monthly?month=2026-09');
    await waitFor(() => expect(hubCalls(fetchFn).some((u) => u.includes('period') && u.includes('from=2026-09-01') && u.includes('to=2026-09-30'))).toBe(true));
    expect(await screen.findByRole('table', { name: 'Pending sales orders (now)' })).toBeTruthy();
    expect(screen.getByText(`Plan achievement ${hub.period.others.plansAchievedPct}%`)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Print' })).toBeTruthy();
  });

  it('daily: one day, from = to', async () => {
    const fetchFn = fakeApi();
    renderAt('/reports/daily?date=2026-09-15');
    await waitFor(() => expect(hubCalls(fetchFn).some((u) => u.includes('period') && u.includes('from=2026-09-15') && u.includes('to=2026-09-15'))).toBe(true));
  });

  it('FY: defaults to the latest year', async () => {
    const fetchFn = fakeApi();
    renderAt('/reports/fy');
    await waitFor(() => expect(hubCalls(fetchFn).some((u) => u.includes('period') && u.includes('fy=2026-27'))).toBe(true));
  });
});
