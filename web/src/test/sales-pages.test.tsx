import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BRANDS,
  DEFAULT_DELIVERY_TERMS,
  DEFAULT_EMAIL_RECIPIENTS,
  DEFAULT_EMAIL_TEMPLATES,
  DEFAULT_FIRM_STATE_CODES,
  DEFAULT_GRADES,
  DEFAULT_PAYMENT_TERMS,
  docTotals,
  lineAmount,
  type OrderLine,
  type SalesInvoiceView,
  type SalesOrderView,
} from '@contracts/sales';
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
  st: { pages: [], actions: ['edit', 'delete', 'print', 'export', 'sales_approve'], widgets: [] },
};
/** Raises invoices but can't approve them. */
const clerk: SessionUser = { ...admin, id: 'u-c', permissions: ['sales.view', 'sales.invoices', 'sales.orders'], st: { pages: [], actions: ['edit'], widgets: [] } };

const audit = { createdBy: null, createdAt: '2026-09-20T03:00:00.000Z', updatedAt: '2026-09-20T03:00:00.000Z', deletedAt: null };
const item = { id: 'sli-1', name: 'S-OSB MDO 1220mm X 2440mm X 12mm', brand: 'Strandply', grade: 'S-OSB', subType: 'MDO', thic: 12, width: 1220, length: 2440, sqmFactor: 2.9768, defaultRatePaise: 40000, hsn: '441012', active: true, ...audit };
const options = {
  customers: [
    { id: 'slc-g', name: 'GUJARAT TRADERS', city: 'RAJKOT', state: 'GUJARAT', gstin: '24AAAAA0000A1Z5', taxTypes: { llp: 'SG+CG', osb: 'IGST' }, paymentTerms: '30 Days', dealerType: 'Dealer' },
    { id: 'slc-m', name: 'MAHARASHTRA BOARDS', city: 'PUNE', state: 'MAHARASHTRA', gstin: '27BBBBB1111B1Z5', taxTypes: { llp: 'IGST', osb: 'SG+CG' }, paymentTerms: null, dealerType: 'Dealer' },
  ],
  items: [item],
  // A newer price from October: a September document still gets the April one.
  prices: [
    { itemId: 'sli-1', effectiveDate: '2026-04-01', ratePaise: 44000 },
    { itemId: 'sli-1', effectiveDate: '2026-10-15', ratePaise: 46000 },
  ],
  weights: [{ itemId: 'sli-1', effectiveDate: '2026-04-01', weightKg: 25 }],
};
const meta = {
  settings: {
    paymentTerms: DEFAULT_PAYMENT_TERMS,
    deliveryTerms: DEFAULT_DELIVERY_TERMS,
    salesPersons: ['VIPUL PANCHAL'],
    brands: DEFAULT_BRANDS,
    grades: DEFAULT_GRADES,
    firmStateCodes: DEFAULT_FIRM_STATE_CODES,
    emailRecipients: DEFAULT_EMAIL_RECIPIENTS,
    emailTemplates: DEFAULT_EMAIL_TEMPLATES,
  },
  firms: [],
  dealerTypes: [],
  soStatuses: [],
  piStatuses: [],
  currentFy: '2026-27',
  fys: ['2026-27'],
  today: '2026-10-01',
};
const soLine: OrderLine = { itemId: 'sli-1', itemName: item.name, brand: 'Strandply', grade: 'S-OSB', subType: 'MDO', thic: 12, width: 1220, length: 2440, hsn: '441012', sqmFactor: 2.9768, pcs: 100, qtySqm: 297.68, ratePaise: 44000, weightKg: 25, amountPaise: lineAmount(297.68, 44000) };
const order: SalesOrderView = {
  id: 'so-1',
  firm: 'llp',
  soNo: 'SO/1/26-27',
  date: '2026-09-01',
  poNo: 'PO-77',
  poDate: null,
  edd: null,
  billToId: 'slc-g',
  billTo: 'GUJARAT TRADERS',
  shipToId: 'slc-g',
  shipTo: 'GUJARAT TRADERS',
  state: 'GUJARAT',
  city: 'RAJKOT',
  salesPerson: null,
  paymentTerms: null,
  deliveryTerms: null,
  taxType: 'SG+CG',
  lines: [soLine],
  freightPaise: 0,
  gstPct: 18,
  totalPaise: 0,
  status: 'confirmed',
  remarks: null,
  piId: null,
  piNo: null,
  dispatch: { date: null, vehicleNo: null, transporter: null, transporterGstin: null, lrNo: null, driverName: null, driverMobile: null },
  ...audit,
  totals: docTotals([soLine], 0, 'SG+CG', 18),
  totalWeightKg: 2500,
  progress: [{ invoicedPcs: 40, invoicedSqm: 119.072, balancePcs: 60, balanceSqm: 178.608, balancePaise: 7858752 }],
  invoiceNos: ['SPL/01/26-27'],
  createdByName: null,
};
const invLine = { ...soLine, soLine: 0, soPcs: 100, soQtySqm: 297.68, pcs: 40, qtySqm: 119.072, amountPaise: lineAmount(119.072, 44000) };
const invoice: SalesInvoiceView = {
  id: 'inv-1',
  firm: 'llp',
  invNo: 'SPL/01/26-27',
  date: '2026-09-06',
  soId: 'so-1',
  soNo: 'SO/1/26-27',
  poNo: 'PO-77',
  billToId: 'slc-g',
  billTo: 'GUJARAT TRADERS',
  shipToId: 'slc-g',
  shipTo: 'GUJARAT TRADERS',
  state: 'GUJARAT',
  city: 'RAJKOT',
  taxType: 'SG+CG',
  lines: [invLine],
  freightPaise: 0,
  gstPct: 18,
  totalPaise: 0,
  irn: null,
  ewayBill: null,
  weightTons: null,
  approval: 'pending',
  approvalNote: null,
  approvedBy: null,
  approvedByName: null,
  approvedAt: null,
  remarks: null,
  ...audit,
  totals: docTotals([invLine], 0, 'SG+CG', 18),
  tons: 0.93,
  createdByName: null,
};
const summary = { count: 1, totalPaise: 0, gstPaise: 0, byStatus: {} };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function fakeApi() {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/sales/meta') return json(meta);
    if (url === '/api/sales/options') return json(options);
    if (url === '/api/sales/orders' && method === 'POST') return json({ ...order, id: 'so-2', soNo: 'SO/2/26-27' }, 201);
    if (url.startsWith('/api/sales/orders/so-1')) return json(order);
    if (url.startsWith('/api/sales/orders')) return json({ rows: [order], total: 1, summary });
    if (url === '/api/sales/invoices' && method === 'POST') return json({ ...invoice, id: 'inv-2', invNo: 'SPL/02/26-27' }, 201);
    if (url === '/api/sales/invoices/inv-1/approve') return json({ ...invoice, approval: 'approved' });
    if (url.startsWith('/api/sales/invoices/inv-')) return json(invoice);
    if (url.startsWith('/api/sales/invoices')) return json({ rows: [invoice], total: 1, summary });
    if (url === '/api/sales/proformas/pi-1/confirm') return json({ proforma: { id: 'pi-1' }, order: { ...order, soNo: 'SO/9/26-27' } });
    if (url.includes('/badges')) return json({});
    return json({ rows: [], total: 0, summary });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const writes = (fn: ReturnType<typeof fakeApi>) =>
  fn.mock.calls
    .filter((c) => ((c as unknown[])[1] as RequestInit | undefined)?.method && ((c as unknown[])[1] as RequestInit).method !== 'GET')
    .map((c) => ({ url: String(c[0]), body: JSON.parse(String(((c as unknown[])[1] as RequestInit).body ?? 'null')) }));

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
const pick = async (box: HTMLElement, text: string) => {
  fireEvent.change(box, { target: { value: text } });
  fireEvent.click(await within(await screen.findByRole('listbox')).findByRole('option', { name: new RegExp(text, 'i') }));
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Sales order form', () => {
  it('fills sq m from pcs and the rate and weight from the price list as of the SO date; tax from the bill-to GSTIN', async () => {
    const fetchFn = fakeApi();
    renderAt('/sales/orders?new=1', admin);
    const dlg = await screen.findByRole('dialog', { name: 'New sales order' });
    fireEvent.change(within(dlg).getByLabelText('SO date'), { target: { value: '2026-09-20' } });
    await pick(within(dlg).getByLabelText('Bill to'), 'MAHARASHTRA');
    expect((within(dlg).getByLabelText('Tax type (from bill-to GSTIN)') as HTMLInputElement).value).toBe('IGST (inter-state)');
    await pick(within(dlg).getByLabelText('Item, line 1'), 'S-OSB MDO');
    fireEvent.change(within(dlg).getByLabelText('Pcs, line 1'), { target: { value: '10' } });
    expect((within(dlg).getByLabelText('Sq m, line 1') as HTMLInputElement).value).toBe('29.768');
    expect((within(dlg).getByLabelText('Rate, line 1') as HTMLInputElement).value).toBe('440');
    expect((within(dlg).getByLabelText('Weight per board, line 1') as HTMLInputElement).value).toBe('25');
    // A later SO date picks up the October price.
    fireEvent.change(within(dlg).getByLabelText('SO date'), { target: { value: '2026-10-20' } });
    expect((within(dlg).getByLabelText('Rate, line 1') as HTMLInputElement).value).toBe('460');
    expect(within(dlg).getByLabelText('Totals').textContent).toContain('IGST 18%');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save order' }));
    await waitFor(() => expect(writes(fetchFn)).toHaveLength(1));
    expect(writes(fetchFn)[0]).toMatchObject({
      url: '/api/sales/orders',
      body: { firm: 'llp', date: '2026-10-20', billToId: 'slc-m', shipToId: null, status: 'draft', gstPct: 18, lines: [{ itemId: 'sli-1', brand: 'Strandply', pcs: 10, qtySqm: 29.768, ratePaise: 46000, weightKg: 25 }] },
    });
  });

  it('an invoiced order’s parties and items are fixed', async () => {
    fakeApi();
    renderAt('/sales/orders?open=so-1', admin);
    const detail = await screen.findByRole('dialog', { name: 'Sales order SO/1/26-27' });
    expect(within(detail).getByText('60 pcs')).toBeTruthy();
    fireEvent.click(within(detail).getByRole('button', { name: 'Edit' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit SO/1/26-27' });
    expect(within(dlg).getByText(/parties and items are fixed/)).toBeTruthy();
    expect(within(dlg).queryByRole('button', { name: 'Add item' })).toBeNull();
  });
});

describe('Invoices', () => {
  it('a new invoice from an order starts at the balance', async () => {
    const fetchFn = fakeApi();
    renderAt('/sales/invoices?new=1&so=so-1', admin);
    const dlg = await screen.findByRole('dialog', { name: 'New sales invoice' });
    const pcs = (await within(dlg).findByLabelText(/Dispatched pcs/)) as HTMLInputElement;
    expect(pcs.value).toBe('60');
    expect((within(dlg).getByLabelText(/Dispatched sq m/) as HTMLInputElement).value).toBe('178.608');
    fireEvent.change(pcs, { target: { value: '10' } });
    expect((within(dlg).getByLabelText(/Dispatched sq m/) as HTMLInputElement).value).toBe('29.768');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save invoice' }));
    await waitFor(() => expect(writes(fetchFn)).toHaveLength(1));
    expect(writes(fetchFn)[0]).toMatchObject({ url: '/api/sales/invoices', body: { soId: 'so-1', lines: [{ soLine: 0, pcs: 10, qtySqm: 29.768, ratePaise: 44000 }], taxType: null } });
  });

  it('only sales_approve sees Approve; approving posts the decision', async () => {
    fakeApi();
    renderAt('/sales/invoices?open=inv-1', clerk);
    let dlg = await screen.findByRole('dialog', { name: 'Sales invoice SPL/01/26-27' });
    expect(within(dlg).queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(within(dlg).getByRole('button', { name: 'Edit' })).toBeTruthy();
    cleanup();
    vi.unstubAllGlobals();
    const fetchFn = fakeApi();
    renderAt('/sales/invoices?open=inv-1', admin);
    dlg = await screen.findByRole('dialog', { name: 'Sales invoice SPL/01/26-27' });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Approve' }));
    const confirm = await screen.findByRole('dialog', { name: 'Approve SPL/01/26-27?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(writes(fetchFn)).toEqual([{ url: '/api/sales/invoices/inv-1/approve', body: { decision: 'approve', note: null } }]));
  });
});
