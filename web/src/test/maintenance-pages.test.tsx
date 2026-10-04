import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MaintenanceDashboard, WorkOrder } from '@contracts/maintenance';
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
const audit = { createdBy: null, createdAt: '2026-09-25T04:00:00.000Z', updatedAt: '2026-09-25T04:00:00.000Z', deletedAt: null };
const wo: WorkOrder = {
  id: 'wo-a', woNo: 'WO-26-0001', title: 'Hydraulic press oil leak', category: 'Hydraulic', area: 'Press Shop', priority: 'Critical', status: 'Open', assignee: 'Raj Kumar',
  description: 'Seal dripping', notes: null, dueDate: '2026-09-28', completedOn: null, ...audit,
  timeline: [{ id: 't1', type: 'created', text: 'Work order created.', by: null, byName: 'Admin User', at: '2026-09-25T04:00:00.000Z' }],
};
const wo2: WorkOrder = { ...wo, id: 'wo-b', woNo: 'WO-26-0002', title: 'Conveyor bearing noise', priority: 'High', status: 'In Progress', area: 'Assembly Line A', dueDate: '2026-10-05' };
const dash: MaintenanceDashboard = { total: 2, open: 1, inProgress: 1, onHold: 0, completed: 0, critical: 1, overdue: 1, byArea: [], byCategory: [], byPriority: [], overdueList: [wo], recent: [] };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function fakeApi() {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/maintenance/meta') return json({ areas: ['Assembly Line A', 'Press Shop'], assignees: ['Raj Kumar'], today: '2026-10-01' });
    if (url === '/api/maintenance/dashboard') return json(dash);
    if (url === '/api/maintenance/work-orders' && method === 'POST') return json({ ...wo, id: 'wo-n', woNo: 'WO-26-0003' }, 201);
    if (url === '/api/maintenance/work-orders/wo-a/status') return json({ ...wo, status: 'In Progress' });
    if (url === '/api/maintenance/work-orders/wo-a/notes') return json(wo);
    if (url === '/api/maintenance/work-orders/wo-a') return json(wo);
    if (url.startsWith('/api/maintenance/work-orders')) return json({ rows: [wo, wo2], total: 2 });
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

describe('Work orders', () => {
  it('lists work orders with overdue due dates; the board groups them by status', async () => {
    fakeApi();
    renderAt('/maintenance/work-orders');
    const table = await screen.findByRole('table', { name: 'Work orders' });
    expect(await within(table).findByText(/^Overdue ·/)).toBeTruthy(); // wo-a was due 28 Sept
    fireEvent.click(screen.getByRole('radio', { name: 'Board' }));
    const board = await screen.findByLabelText('Work order board');
    expect(within(within(board).getByRole('region', { name: 'Open' })).getByText('Hydraulic press oil leak')).toBeTruthy();
    expect(within(within(board).getByRole('region', { name: 'In Progress' })).getByText('Conveyor bearing noise')).toBeTruthy();
  });

  it('a new work order sends the form with blanks as null', async () => {
    const fetchFn = fakeApi();
    renderAt('/maintenance/work-orders?new=1');
    const dlg = await screen.findByRole('dialog', { name: 'New work order' });
    fireEvent.change(within(dlg).getByLabelText('Title'), { target: { value: 'Boiler feed pump seal' } });
    fireEvent.change(within(dlg).getByLabelText('Assigned to'), { target: { value: 'Raj Kumar' } });
    fireEvent.change(within(dlg).getByLabelText('Due date'), { target: { value: '2026-10-03' } });
    await waitFor(() => expect((within(dlg).getByLabelText('Plant area') as HTMLSelectElement).value).toBe('Assembly Line A'));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Create work order' }));
    await waitFor(() => expect(writes(fetchFn)).toHaveLength(1));
    expect(writes(fetchFn)[0]).toEqual({
      url: '/api/maintenance/work-orders',
      body: { title: 'Boiler feed pump seal', category: 'Mechanical', area: 'Assembly Line A', assignee: 'Raj Kumar', dueDate: '2026-10-03', priority: 'High', status: 'Open', description: null, notes: null },
    });
  });

  it('the detail panel changes status and posts notes', async () => {
    const fetchFn = fakeApi();
    renderAt('/maintenance/work-orders?open=wo-a');
    const panel = await screen.findByLabelText('Work order WO-26-0001');
    fireEvent.click(within(within(panel).getByRole('group', { name: 'Update status' })).getByRole('button', { name: 'In Progress' }));
    await waitFor(() => expect(writes(fetchFn)).toEqual([{ url: '/api/maintenance/work-orders/wo-a/status', body: { status: 'In Progress' } }]));
    fireEvent.click(within(panel).getByRole('tab', { name: /Timeline/ }));
    expect(within(panel).getByText('Work order created.')).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText('Add a note'), { target: { value: 'Seal ordered' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Post note' }));
    await waitFor(() => expect(writes(fetchFn).at(-1)).toEqual({ url: '/api/maintenance/work-orders/wo-a/notes', body: { text: 'Seal ordered' } }));
  });
});

describe('Dashboard', () => {
  it('shows status tiles that open the filtered list, and the overdue list', async () => {
    fakeApi();
    renderAt('/maintenance/dashboard');
    expect(await screen.findByRole('heading', { name: 'Maintenance dashboard' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Overdue 1/ }).getAttribute('href')).toBe('/maintenance/work-orders?overdue=true');
    expect(within(screen.getByRole('list', { name: 'Overdue work orders' })).getByText('Hydraulic press oil leak')).toBeTruthy();
  });
});
