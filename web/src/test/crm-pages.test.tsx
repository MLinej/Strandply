import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOST_REASONS, DEFAULT_SOURCES, type Customer360, type FollowupView, type Lead, type OpportunityView } from '@contracts/crm';
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
const meta = {
  sources: DEFAULT_SOURCES,
  lostReasons: DEFAULT_LOST_REASONS,
  products: ['OSB', 'S-OSB'],
  salespersons: ['Suresh Kumar'],
  campaigns: [],
  customers: [{ id: 'crc-a', name: 'Alpha Ply', city: 'Ahmedabad', salesperson: 'Suresh Kumar', priority: 'Hot', contactPerson: 'Mehul' }],
  today: '2026-10-01',
};
const lead: Lead = { id: 'crl-a', dateAdded: '2026-09-01', companyName: 'Gamma Interiors', contactPerson: null, contactPerson2: null, mobile: '9825033333', mobile2: null, altMobile: null, whatsapp: null, email: null, city: 'Rajkot', state: null, pincode: null, address: null, customerType: 'Dealer', product: 'OSB', source: 'Exhibition', campaign: null, salesperson: 'Suresh Kumar', stage: 'New Lead', nextAction: null, nextFollowUpDate: null, remarks: null, dataQuality: 'Good', customerId: null, ...audit };
const fu: FollowupView = { id: 'fu-1', customerId: 'crc-a', date: '2026-09-25', time: '10:00', type: 'Call', contactPerson: 'Mehul', salesperson: 'Suresh Kumar', discussion: 'Rates shared', customerResponse: null, nextAction: 'Call back', nextFollowUpDate: '2026-09-28', status: 'Pending', priority: 'Hot', ...audit, customerName: 'Alpha Ply', city: 'Ahmedabad', mobile: '9825011111', whatsapp: '9825011111', due: '2026-09-28' };
const opp: OpportunityView = { id: 'op-1', customerId: 'crc-a', product: 'OSB', thickness: '12mm', size: null, quantity: '1 truck', estValuePaise: 30_000_000, expectedClosingDate: null, salesperson: 'Suresh Kumar', stage: 'Negotiation', probability: 50, competitor: null, currentSupplier: null, notes: null, reactivatedFrom: null, ...audit, customerName: 'Alpha Ply', city: 'Ahmedabad' };
const c360: Customer360 = {
  customer: { id: 'crc-a', companyName: 'Alpha Ply', contactPerson: 'Mehul', contactPerson2: null, designation: null, mobile: '9825011111', mobile2: null, whatsapp: '9825011111', email: null, website: null, city: 'Ahmedabad', state: 'Gujarat', pincode: null, address: null, gstin: null, pan: null, customerType: 'Dealer', estMonthlyReq: null, productsUsed: 'OSB', currentSupplier: null, approxPurchaseValue: null, preferredThickness: null, preferredSize: null, application: null, existingBrand: null, competitorBrand: null, paymentPreference: null, creditRequirement: null, territory: null, leadSource: 'IndiaMART', salesperson: 'Suresh Kumar', status: 'Active', priority: 'Hot', firstContactDate: '2026-09-01', lastContactDate: '2026-09-25', nextFollowUp: '2026-09-28', remarks: null, leadId: null, salesCustomerId: null, ...audit },
  salesParty: null,
  opportunities: [opp],
  followups: [fu],
  quotations: [],
  won: [],
  lost: [],
  tasks: [],
  sales: null,
  timeline: [{ date: '2026-09-25', kind: 'Call', text: 'Rates shared' }],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function fakeApi() {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/crm/meta') return json(meta);
    if (url.startsWith('/api/crm/leads/duplicates')) return json(url.includes('9825011111') ? ['Customer with the same mobile: Alpha Ply'] : []);
    if (url === '/api/crm/leads' && method === 'POST') return json({ ...lead, id: 'crl-n' }, 201);
    if (url.startsWith('/api/crm/leads')) return json({ rows: [lead], total: 1 });
    if (url.startsWith('/api/crm/followups/board')) return json({ overdue: [fu], today: [], tomorrow: [], upcoming: [] });
    if (url === '/api/crm/followups/fu-1' && method === 'PATCH') return json({ ...fu, status: 'Completed' });
    if (url === '/api/crm/opportunities/op-1/won') return json({ id: 'w-2' }, 201);
    if (url.startsWith('/api/crm/opportunities')) return json({ rows: [opp], total: 1 });
    if (url === '/api/crm/customers/crc-a/360') return json(c360);
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
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Leads', () => {
  it('warns about a duplicate mobile while typing, still saves, and sends blanks as null', async () => {
    const fetchFn = fakeApi();
    renderAt('/crm/leads?new=1');
    const dlg = await screen.findByRole('dialog', { name: 'Add lead' });
    fireEvent.change(within(dlg).getByLabelText('Company / party name *'), { target: { value: 'Alpha Copy' } });
    fireEvent.change(within(dlg).getByLabelText('Mobile *'), { target: { value: '9825011111' } });
    expect(await within(dlg).findByText(/Possible duplicate: Customer with the same mobile: Alpha Ply/, {}, { timeout: 2000 })).toBeTruthy();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(fetchFn)).toHaveLength(1));
    expect(writes(fetchFn)[0]).toMatchObject({ url: '/api/crm/leads', body: { companyName: 'Alpha Copy', mobile: '9825011111', stage: 'New Lead', city: null, source: null } });
  });
});

describe('Follow-up board', () => {
  it('lists overdue follow-ups with call and WhatsApp links; Done completes one', async () => {
    const fetchFn = fakeApi();
    renderAt('/crm/followups');
    expect(await screen.findByText('Overdue (1)')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'WhatsApp Alpha Ply' }).getAttribute('href')).toBe('https://wa.me/919825011111');
    expect(screen.getByRole('link', { name: 'Call Alpha Ply' }).getAttribute('href')).toBe('tel:9825011111');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(writes(fetchFn)).toEqual([{ url: '/api/crm/followups/fu-1', body: { status: 'Completed' } }]));
  });
});

describe('Opportunities', () => {
  it('Mark won posts the order value (prefilled from the estimate)', async () => {
    const fetchFn = fakeApi();
    renderAt('/crm/opportunities');
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Alpha Ply' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mark won' }));
    const dlg = await screen.findByRole('dialog', { name: /Order won · Alpha Ply/ });
    expect((within(dlg).getByLabelText('Order value * (₹)') as HTMLInputElement).value).toBe('300000');
    fireEvent.change(within(dlg).getByLabelText('Expected dispatch'), { target: { value: '2026-10-10' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Mark won' }));
    await waitFor(() => expect(writes(fetchFn)).toHaveLength(1));
    expect(writes(fetchFn)[0]).toMatchObject({ url: '/api/crm/opportunities/op-1/won', body: { orderValuePaise: 30_000_000, dispatchDate: '2026-10-10', ratePaise: null } });
  });
});

describe('Customer 360', () => {
  it('switches tabs and shows each section', async () => {
    fakeApi();
    renderAt('/crm/customers?open=crc-a');
    expect(await screen.findByRole('heading', { name: 'Alpha Ply' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Follow-ups \(1\)/ }));
    expect(screen.getByRole('tab', { name: /Follow-ups \(1\)/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Rates shared')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Opportunities \(1\)/ }));
    expect(screen.getByText('1 truck')).toBeTruthy();
  });
});
