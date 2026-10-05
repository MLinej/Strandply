import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DwpasMeta, PlanView } from '@contracts/dwpas';
import { SessionProvider, type SessionUser } from '@/app/session';
import { ToastProvider } from '@/components/ui';
import { routes } from '@/router';

const admin: SessionUser = { id: 'u-a', code: 'admin', name: 'Rahul Admin', role: 'Admin', scopeNote: 'All modules', firms: ['llp'], permissions: ['*'], st: { pages: [], actions: ['edit', 'delete', 'print', 'export'], widgets: [] } };
const audit = { createdBy: null, createdAt: '2026-09-29T03:00:00.000Z', updatedAt: '2026-09-29T03:00:00.000Z', deletedAt: null };
const meta: DwpasMeta = {
  departments: [
    { name: 'Peeling', code: 'PL', head: 'Rajesh Patel' },
    { name: 'Hot Press', code: 'HP', head: 'Vikram Sharma' },
  ],
  employees: [{ name: 'P K Sinha', code: 'MGR002', department: 'Production', type: 'Manager' }],
  today: '2026-10-01',
};
const plan: PlanView = {
  id: 'dwp-b', date: '2026-09-30', type: 'Regular Day', preparedBy: 'P K Sinha', remarks: null, status: 'Submitted', trail: [], ...audit,
  lines: [{ department: 'Peeling', head: 'Rajesh Patel', work: 'Peel core veneer', qty: 1000, unit: 'Sheets', skilled: 6, unskilled: 8, machine: null, priority: 'High', operator: null, actualQty: null, actualSkilled: null, actualUnskilled: null, reason: null, headRemarks: null }],
  totals: { lines: 1, skilled: 6, unskilled: 8, actualSkilled: null, actualUnskilled: null, recorded: 0, green: 0, amber: 0, red: 0, highPriority: 1 },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function fakeApi() {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/dwpas/meta') return json(meta);
    if (url === '/api/dwpas/plans/by-date/2026-10-01') return json({ error: { code: 'not_found', message: 'Plan not found' } }, 404);
    if (url === '/api/dwpas/plans/by-date/2026-09-30') return json(plan);
    if (url === '/api/dwpas/plans' && method === 'PUT') return json({ ...plan, id: 'dwp-n', date: '2026-10-01', status: 'Draft' });
    if (url.startsWith('/api/dwpas/plans/') && method !== 'GET') return json({ ...plan, status: 'Approved' });
    if (url.startsWith('/api/dwpas/plans')) return json({ rows: [plan], total: 1 });
    if (url.includes('/badges')) return json({});
    return json({ rows: [], total: 0 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const writes = (fn: ReturnType<typeof fakeApi>) =>
  fn.mock.calls.filter((c) => ((c as unknown[])[1] as RequestInit | undefined)?.method && ((c as unknown[])[1] as RequestInit).method !== 'GET').map((c) => ({ url: String(c[0]), method: ((c as unknown[])[1] as RequestInit).method, body: JSON.parse(String(((c as unknown[])[1] as RequestInit).body ?? 'null')) }));

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
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Daily plan entry', () => {
  it('a day without a plan starts blank; the head follows the department; save then submit', async () => {
    const fetchFn = fakeApi();
    renderAt('/dwpas/plan');
    expect(await screen.findByText(/No plan for 01 Oct 2026 yet/)).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Plan lines' });
    fireEvent.change(within(table).getByLabelText('Department 1'), { target: { value: 'Hot Press' } });
    expect(within(table).getByText('Vikram Sharma')).toBeTruthy();
    fireEvent.change(within(table).getByLabelText('Work 1'), { target: { value: 'Press 18 mm OSB' } });
    fireEvent.change(within(table).getByLabelText('Target 1'), { target: { value: '420' } });
    fireEvent.change(within(table).getByLabelText('Unit 1'), { target: { value: 'Boards' } });
    fireEvent.change(within(table).getByLabelText('Skilled 1'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Prepared by'), { target: { value: 'P K Sinha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(writes(fetchFn)).toHaveLength(2));
    expect(writes(fetchFn)[0]).toEqual({
      url: '/api/dwpas/plans',
      method: 'PUT',
      body: { date: '2026-10-01', type: 'Regular Day', preparedBy: 'P K Sinha', remarks: null, lines: [{ department: 'Hot Press', work: 'Press 18 mm OSB', qty: '420', unit: 'Boards', skilled: '5', unskilled: '0', machine: null, priority: 'High', operator: null }] },
    });
    expect(writes(fetchFn)[1]).toMatchObject({ url: '/api/dwpas/plans/dwp-n/submit', method: 'POST' });
  });
});

describe('Achievement entry', () => {
  it('shows the live % and saves each line', async () => {
    const fetchFn = fakeApi();
    renderAt('/dwpas/achievement?date=2026-09-30');
    const table = await screen.findByRole('table', { name: 'Achievement' });
    fireEvent.change(within(table).getByLabelText('Actual 1'), { target: { value: '850' } });
    expect(within(table).getByText('85%')).toBeTruthy();
    fireEvent.change(within(table).getByLabelText('Reason 1'), { target: { value: 'Boiler pressure low' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save achievement' }));
    await waitFor(() => expect(writes(fetchFn)).toHaveLength(1));
    expect(writes(fetchFn)[0]).toEqual({ url: '/api/dwpas/plans/dwp-b/achievement', method: 'PUT', body: { lines: [{ actualQty: '850', actualSkilled: '', actualUnskilled: '', reason: 'Boiler pressure low', headRemarks: null }] } });
  });
});

describe('Plan register', () => {
  it('an approver approves a submitted plan with a note', async () => {
    const fetchFn = fakeApi();
    renderAt('/dwpas/register?open=dwp-b');
    const panel = await screen.findByLabelText('Plan 2026-09-30');
    fireEvent.change(within(panel).getByLabelText('Note (optional)'), { target: { value: 'OK for today' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(writes(fetchFn)).toEqual([{ url: '/api/dwpas/plans/dwp-b/approve', method: 'POST', body: { note: 'OK for today' } }]));
  });
});
