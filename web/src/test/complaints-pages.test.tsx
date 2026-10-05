import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComplaintsMeta, ComplaintView } from '@contracts/complaints';
import { SessionProvider, type SessionUser } from '@/app/session';
import { ToastProvider } from '@/components/ui';
import { routes } from '@/router';

const salesman: SessionUser = {
  id: 'u-m',
  code: 'marketing',
  name: 'Suresh Kumar',
  role: 'Marketing',
  scopeNote: 'Marketing',
  firms: ['llp'],
  permissions: ['complaints.view', 'complaints.dashboard', 'complaints.register'],
  st: { pages: [], actions: ['edit', 'print'], widgets: [] },
};
const audit = { createdBy: null, createdAt: '2026-09-28T05:00:00.000Z', updatedAt: '2026-09-28T05:00:00.000Z', deletedAt: null };
const meta: ComplaintsMeta = {
  parties: [
    { id: 'slc-g', name: 'GUJARAT TRADERS', city: 'RAJKOT', phone: '9825000001' },
    { id: null, name: 'Patel Plywood', city: 'Surat', phone: null },
  ],
  salesmen: ['Suresh Kumar'],
  recipients: [{ id: 'cpr-jimit', name: 'Jimit Mehta', role: 'Plant Manager', email: 'jimit@strandply.in', active: true, ...audit }],
  today: '2026-10-01',
};
const complaint: ComplaintView = {
  id: 'cmp-c', complaintNo: 'CMP/26-27/0003', date: '2026-09-28', salesman: 'Suresh Kumar', customerId: 'slc-g', customerName: 'GUJARAT TRADERS', customerPhone: null, customerLocation: 'Rajkot', invoiceId: null, invoiceNo: null,
  material: 'OSB Board', category: 'Quantity Shortage', priority: 'Medium', description: '116 of 120 sheets', recipientName: 'Jimit Mehta', recipientEmail: 'jimit@strandply.in', status: 'Open', resolvedOn: null, photos: [],
  timeline: [{ id: 'e1', type: 'created', text: 'Complaint registered · notified Jimit Mehta (jimit@strandply.in)', by: null, byName: 'Suresh Kumar', at: '2026-09-28T05:00:00.000Z', files: [] }],
  ...audit,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function fakeApi() {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/complaints/meta') return json(meta);
    if (url.startsWith('/api/complaints/party-invoices')) return json([{ id: 'inv-1', invNo: 'SPL/01/26-27', date: '2026-09-20', totalPaise: 1 }]);
    if (url === '/api/complaints/complaints' && method === 'POST') return json({ ...complaint, id: 'cmp-n', complaintNo: 'CMP/26-27/0004' }, 201);
    if (url === '/api/complaints/complaints/cmp-n/photos') return json({ ...complaint, id: 'cmp-n', complaintNo: 'CMP/26-27/0004' });
    if (url === '/api/complaints/complaints/cmp-c/status') return json({ ...complaint, status: 'In Progress' });
    if (url === '/api/complaints/complaints/cmp-c/comments') return json(complaint);
    if (url === '/api/complaints/complaints/cmp-c') return json(complaint);
    if (url.startsWith('/api/complaints/complaints')) return json({ rows: [complaint], total: 1 });
    if (url.includes('/badges')) return json({});
    return json({ rows: [], total: 0 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const calls = (fn: ReturnType<typeof fakeApi>) =>
  fn.mock.calls.filter((c) => ((c as unknown[])[1] as RequestInit | undefined)?.method && ((c as unknown[])[1] as RequestInit).method !== 'GET').map((c) => ({ url: String(c[0]), init: (c as unknown[])[1] as RequestInit }));

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SessionProvider user={salesman}>
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

describe('New complaint', () => {
  it('picks a Sales party (fills contact and city, offers its invoices), uploads photos after saving, then offers email and print', async () => {
    const fetchFn = fakeApi();
    renderAt('/complaints/new');
    const form = await screen.findByRole('form', { name: 'Complaint' });
    fireEvent.change(within(form).getByLabelText('Salesman'), { target: { value: 'Suresh Kumar' } });
    const party = within(form).getAllByRole('combobox', { name: 'Customer' }).find((n) => n.tagName === 'INPUT')!;
    fireEvent.focus(party);
    fireEvent.change(party, { target: { value: 'guj' } });
    fireEvent.click(await within(screen.getAllByRole('listbox')[0]!).findByRole('option', { name: /GUJARAT TRADERS/ }));
    expect((within(form).getByLabelText('Contact no.') as HTMLInputElement).value).toBe('9825000001');
    expect((within(form).getByLabelText('Location / city') as HTMLInputElement).value).toBe('RAJKOT');
    await waitFor(() => expect(within(form).getByRole('option', { name: /SPL\/01\/26-27/ })).toBeTruthy());
    fireEvent.change(within(form).getByLabelText('Invoice (optional)'), { target: { value: 'inv-1' } });
    fireEvent.change(within(form).getByLabelText('Material / product'), { target: { value: 'OSB Board' } });
    fireEvent.change(within(form).getByLabelText('Category'), { target: { value: 'Damage in Transit' } });
    fireEvent.change(within(form).getByLabelText('Description'), { target: { value: 'Broken edges' } });
    fireEvent.change(within(form).getByLabelText('Recipient'), { target: { value: 'cpr-jimit' } });
    fireEvent.change(within(form).getByLabelText('Add photos'), { target: { files: [new File(['x'], 'edge.jpg', { type: 'image/jpeg' })] } });
    fireEvent.click(within(form).getByRole('button', { name: 'Register complaint' }));
    expect(await screen.findByText('CMP/26-27/0004 registered')).toBeTruthy();
    const [create, photos] = calls(fetchFn);
    expect(JSON.parse(String(create!.init.body))).toEqual({
      date: '2026-10-01', salesman: 'Suresh Kumar', customerId: 'slc-g', customerName: 'GUJARAT TRADERS', customerPhone: '9825000001', customerLocation: 'RAJKOT', invoiceId: 'inv-1',
      material: 'OSB Board', category: 'Damage in Transit', priority: 'Medium', description: 'Broken edges', recipientId: 'cpr-jimit', recipientEmail: null,
    });
    expect(photos!.url).toBe('/api/complaints/complaints/cmp-n/photos');
    expect((photos!.init.body as FormData).getAll('file')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Email Jimit Mehta/ }).getAttribute('href')).toMatch(/^mailto:jimit%40strandply\.in\?subject=Complaint%20Registered%20-%20CMP%2F26-27%2F0004/);
  });
});

describe('Register', () => {
  it('opens a complaint, changes its status with a note and posts a comment', async () => {
    const fetchFn = fakeApi();
    renderAt('/complaints/register?open=cmp-c');
    const panel = await screen.findByLabelText('Complaint CMP/26-27/0003');
    fireEvent.change(within(panel).getByLabelText('Change status'), { target: { value: 'In Progress' } });
    fireEvent.change(within(panel).getByLabelText('Note (optional)'), { target: { value: 'Checking the loading slip' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Update status' }));
    await waitFor(() => expect(calls(fetchFn)).toHaveLength(1));
    expect(JSON.parse(String(calls(fetchFn)[0]!.init.body))).toEqual({ status: 'In Progress', note: 'Checking the loading slip' });
    fireEvent.click(within(panel).getByRole('tab', { name: /Timeline/ }));
    fireEvent.change(within(panel).getByLabelText('Add a comment'), { target: { value: 'Four sheets sent' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(calls(fetchFn)).toHaveLength(2));
    expect((calls(fetchFn)[1]!.init.body as FormData).get('text')).toBe('Four sheets sent');
    expect(within(panel).queryByRole('button', { name: 'Delete' })).toBeNull(); // salesmen can't delete
  });
});
