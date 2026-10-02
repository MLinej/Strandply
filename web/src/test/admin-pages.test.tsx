import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicUser, RolePermissionsView } from '@contracts/admin';
import { SessionProvider, type SessionUser } from '@/app/session';
import { ToastProvider } from '@/components/ui';
import { routes } from '@/router';

const ALL = { actions: ['edit', 'delete', 'approve', 'print', 'export', 'dashboard_full'], widgets: [] };
const admin: SessionUser = {
  id: 'u-admin',
  code: 'admin',
  name: 'Rahul Admin',
  role: 'Admin',
  scopeNote: 'All modules',
  firms: ['llp'],
  permissions: ['*'],
  st: { pages: [], ...ALL },
};
const superadmin: SessionUser = { ...admin, id: 'u-super', name: 'Super Admin', isSuperadmin: true };
const management: SessionUser = {
  ...admin,
  id: 'u-mgmt',
  role: 'Management',
  permissions: ['samples.view', 'samples.dashboard', 'samples.reports'],
  st: { pages: ['dashboard', 'reports'], actions: ['print', 'export'], widgets: ['total', 'pending'] },
};

const user = (over: Partial<PublicUser>): PublicUser => ({
  id: 'u1',
  username: 'marketing',
  name: 'Ankit Marketing',
  email: null,
  phone: null,
  department: null,
  role: 'marketing',
  roleLabel: 'Marketing',
  status: 'Active',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...over,
});
const perms = (role: RolePermissionsView['role'], pages: string[], locked = false): RolePermissionsView => ({
  role,
  label: role,
  locked,
  permissions: { pages, actions: [], widgets: [] },
  updatedAt: null,
  updatedBy: null,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeApi() {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.startsWith('/api/sampletrack/users/stats')) return json({ total: 1, active: 1, inactive: 0, byRole: { superadmin: 0, admin: 0, dispatch: 0, marketing: 1, management: 0 } });
    if (url.startsWith('/api/sampletrack/users?')) return json({ rows: [user({})], total: 1 });
    if (url === '/api/sampletrack/users/u1/toggle-status') return json(user({ status: 'Inactive' }));
    if (url === '/api/sampletrack/role-permissions' && method === 'GET')
      return json({ rows: [perms('superadmin', [], true), perms('marketing', ['dashboard'])] });
    if (url.startsWith('/api/sampletrack/role-permissions/')) return json(perms('marketing', JSON.parse(String(init!.body)).pages));
    if (url === '/api/sampletrack/dashboard')
      return json({
        asOf: '2026-10-02', full: false, widgets: {}, visibleWidgets: [],
        recentDispatches: [{ id: 'd1', dspNo: 'DSP-0001', partyName: 'Gujarat Furniture Works', partyCity: 'Rajkot', status: 'Delivered' }],
        pendingRequests: [{ id: 'r1', reqNo: 'REQ-0001', partyName: 'Pune Traders', date: '2026-10-01', priority: 'Normal' }],
      });
    if (url === '/api/sampletrack/badges') return json({});
    return json({ rows: [], total: 0 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const calls = (fn: ReturnType<typeof fakeApi>, method: string) =>
  fn.mock.calls.filter((c) => ((c as unknown[])[1] as RequestInit | undefined)?.method === method).map((c) => ({ url: String(c[0]), body: (c as unknown[])[1] as RequestInit }));

function renderAt(path: string, who: SessionUser) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SessionProvider user={who}>
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

describe('Users page', () => {
  it('checks the password before calling the API, and only a Super Admin can hand out Super Admin', async () => {
    const fetchFn = fakeApi();
    renderAt('/admin/users', admin);
    fireEvent.click(await screen.findByRole('button', { name: 'Add user' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add user' });
    fireEvent.change(within(dialog).getByLabelText('Full name'), { target: { value: 'New Person' } });
    fireEvent.change(within(dialog).getByLabelText('Username'), { target: { value: 'newp' } });
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add user' }));
    expect(await within(dialog).findByText('At least 8 characters')).toBeTruthy();
    expect(calls(fetchFn, 'POST')).toHaveLength(0);
    const roles = [...(within(dialog).getByLabelText('Role') as HTMLSelectElement).options].map((o) => o.value);
    expect(roles).not.toContain('superadmin');
  });

  it('a row-menu action doesn’t also open the row', async () => {
    const fetchFn = fakeApi();
    renderAt('/admin/users', admin);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Ankit Marketing' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Deactivate' }));
    await waitFor(() => expect(calls(fetchFn, 'POST').map((c) => c.url)).toContain('/api/sampletrack/users/u1/toggle-status'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Roles & permissions page', () => {
  it('is read-only for an Admin', async () => {
    fakeApi();
    renderAt('/admin/roles', admin);
    const box = await screen.findByRole('checkbox', { name: 'marketing: Reports' });
    expect((box as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
  });

  it('a Super Admin saves only the changed role; the Super Admin column stays locked', async () => {
    const fetchFn = fakeApi();
    renderAt('/admin/roles', superadmin);
    const locked = (await screen.findByRole('checkbox', { name: 'superadmin: Reports' })) as HTMLInputElement;
    expect(locked.checked && locked.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'marketing: Reports' }));
    const save = screen.getByRole('button', { name: 'Save (1)' });
    fireEvent.click(save);
    await waitFor(() => expect(calls(fetchFn, 'PUT')).toHaveLength(1));
    const put = calls(fetchFn, 'PUT')[0]!;
    expect(put.url).toBe('/api/sampletrack/role-permissions/marketing');
    expect(JSON.parse(String(put.body.body)).pages).toEqual(['dashboard', 'reports']);
  });
});

describe('Samples dashboard', () => {
  it('lists rows as plain text for a role that can’t open the target pages', async () => {
    fakeApi();
    renderAt('/samples/dashboard', management);
    const dsp = await screen.findByText('DSP-0001');
    expect(dsp.closest('a')).toBeNull();
    expect(screen.getByText('REQ-0001').closest('a')).toBeNull();
  });
});
