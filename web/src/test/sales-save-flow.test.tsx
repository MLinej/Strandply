import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BRANDS, DEFAULT_DELIVERY_TERMS, DEFAULT_FIRM_STATE_CODES, DEFAULT_GRADES, DEFAULT_PAYMENT_TERMS, docTotals } from '@contracts/sales';
import { SessionProvider, type SessionUser } from '@/app/session';
import { ToastProvider } from '@/components/ui';
import { routes } from '@/router';

const admin: SessionUser = { id: 'u-a', code: 'admin', name: 'Rahul Admin', role: 'Admin', scopeNote: 'All', firms: ['llp'], permissions: ['*'], st: { pages: [], actions: ['edit', 'delete', 'print', 'export', 'sales_approve'], widgets: [] } };
const item = { id: 'sli-1', name: 'S-OSB MDO', brand: 'Strandply', grade: 'S-OSB', subType: 'MDO', thic: 12, width: 1220, length: 2440, sqmFactor: 2.9768, defaultRatePaise: 40000, hsn: '441012', active: true };
const options = { customers: [{ id: 'slc-g', name: 'GUJARAT TRADERS', city: 'RAJKOT', state: 'GUJARAT', gstin: '24AAAAA0000A1Z5', taxTypes: { llp: 'SG+CG', osb: 'IGST' }, paymentTerms: null, dealerType: 'Dealer' }], items: [item], prices: [], weights: [] };
const meta = { settings: { paymentTerms: DEFAULT_PAYMENT_TERMS, deliveryTerms: DEFAULT_DELIVERY_TERMS, salesPersons: [], brands: DEFAULT_BRANDS, grades: DEFAULT_GRADES, firmStateCodes: DEFAULT_FIRM_STATE_CODES, emailRecipients: [], emailTemplates: {} }, firms: [], dealerTypes: [], soStatuses: [], piStatuses: [], currentFy: '2026-27', fys: ['2026-27'], today: '2026-10-01' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

describe('Proforma save flow', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it('a saved proforma opens in its detail and appears in the register', async () => {
    const saved: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method ?? 'GET';
      if (url === '/api/sales/meta') return json(meta);
      if (url === '/api/sales/options') return json(options);
      if (url === '/api/sales/proformas' && method === 'POST') {
        const b = JSON.parse(String(init!.body));
        const line = { ...item, itemId: 'sli-1', itemName: item.name, pcs: b.lines[0].pcs, qtySqm: b.lines[0].qtySqm, ratePaise: b.lines[0].ratePaise, weightKg: 0, amountPaise: 1000 };
        const pi = { id: 'pi-9', piNo: 'PI/009/26-27', firm: 'llp', date: b.date, billToId: 'slc-g', billTo: 'GUJARAT TRADERS', shipToId: 'slc-g', shipTo: 'GUJARAT TRADERS', state: 'GUJARAT', city: 'RAJKOT', status: 'draft', lines: [line], gstPct: 18, freightPaise: 0, taxType: 'SG+CG', totals: docTotals([line], 0, 'SG+CG', 18), validUntil: null, poRef: null, soId: null, soNo: null, remarks: null, createdByName: null, salesPerson: null, paymentTerms: null, deliveryTerms: null, totalWeightKg: 0 };
        saved.push(pi);
        return json(pi, 201);
      }
      if (url.startsWith('/api/sales/proformas/pi-9')) return json(saved[0]);
      if (url.startsWith('/api/sales/proformas')) return json({ rows: saved, total: saved.length, summary: { count: saved.length, totalPaise: 0, gstPaise: 0, byStatus: {} } });
      return json({ rows: [], total: 0, summary: { count: 0, totalPaise: 0, gstPaise: 0, byStatus: {} } });
    }));
    const router = createMemoryRouter(routes, { initialEntries: ['/sales/proforma'] });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SessionProvider user={admin}><ToastProvider><RouterProvider router={router} /></ToastProvider></SessionProvider></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'New proforma' }));
    const dlg = await screen.findByRole('dialog', { name: 'New proforma invoice' });
    const pick = async (box: HTMLElement, text: string) => { fireEvent.change(box, { target: { value: text } }); fireEvent.click(await within(await screen.findByRole('listbox')).findByRole('option', { name: new RegExp(text, 'i') })); };
    await pick(within(dlg).getByLabelText('Bill to'), 'GUJARAT');
    await pick(within(dlg).getByLabelText('Item, line 1'), 'S-OSB');
    fireEvent.change(within(dlg).getByLabelText('Pcs, line 1'), { target: { value: '2' } });
    fireEvent.change(within(dlg).getByLabelText('Rate, line 1'), { target: { value: '500' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save proforma' }));
    await screen.findByRole('dialog', { name: 'Proforma invoice PI/009/26-27' });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Proforma invoice PI/009/26-27' })).getByRole('button', { name: 'Close' }));
    const table = await screen.findByRole('table', { name: 'Proforma invoices' });
    await waitFor(() => expect(within(table).getByText('PI/009/26-27')).toBeTruthy());
  });
});
