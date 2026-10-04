import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_METER, type BillView, type ElectricityMeta, type ElRate } from '@contracts/electricity';
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
const meta: ElectricityMeta = {
  meter: DEFAULT_METER,
  rates: { mf: 30, fixedPaise: 63_867_500, energyPaise: 420, fuelPaise: 230 },
  status: { date: '2026-10-01', am: { time: '06:00', kwh: 1100 }, pm: null, diff: null, net: null, costPaise: null, pf: 0.97 },
  today: '2026-10-01',
};
const rates: ElRate[] = (['mf', 'fixed', 'energy', 'fuel'] as const).map((kind, i) => ({ id: `r-${kind}`, kind, value: [30, 63_867_500, 420, 230][i]!, effectiveFrom: '2025-04-01', ...audit }));
const prevBill: BillView = {
  id: 'elb-1', billDate: '2026-08-31', dueDate: null, paidDate: '2026-09-10', advancePaymentPaise: null, kwhReading: 900, kvarhReading: 300, pf: 0.96, nightUnits: null,
  charges: { demand: 100_000, energy: null, fuelSurcharge: null, pfRebate: null, nightRebate: null, ehvRebate: null, timeOfUse: null, gt: null, totalConsumption: null, electricityDuty: null, meterCharges: null, tcs: null },
  netPayablePaise: null, totalPayablePaise: 50_000_000, remarks: null, ...audit, mf: 30, kwhDiff: null, kwhNet: null, kvarhDiff: null, kvarhNet: null, periodFrom: null, estimatePaise: null, estimateNet: null, invoice: null,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function fakeApi() {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/electricity/meta') return json(meta);
    if (url === '/api/electricity/settings') return json({ meter: DEFAULT_METER, rates });
    if (url.startsWith('/api/electricity/readings/preview'))
      return json({ prev: { date: '2026-10-01', time: '06:00', kwh: 1100 }, diff: 20, mf: 30, net: 600, energyRatePaise: 420, fuelRatePaise: 230, energyPaise: 252_000, fuelPaise: 138_000, shiftFixedPaise: 1_064_458, totalPaise: 1_454_458 });
    if (url === '/api/electricity/readings' && method === 'POST') return json({ id: 'n', date: '2026-10-01', shift: 'PM', time: '18:00', kwh: 1120 }, 201);
    if (url.startsWith('/api/electricity/readings')) return json({ rows: [], total: 0 });
    if (url === '/api/electricity/rates') return json({ id: 'x' }, 201);
    if (url === '/api/electricity/bills' && method === 'POST') return json({ id: 'elb-2', billDate: '2026-09-30' }, 201);
    if (url.startsWith('/api/electricity/bills')) return json({ rows: [prevBill], summary: { count: 1, lastPaise: 1, avgPaise: 1, fyPaise: 1, avgPf: null } });
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

describe('Meter readings', () => {
  it('shows today’s status, previews the cost, picks the shift from the time, and saves blanks as null', async () => {
    const fetchFn = fakeApi();
    renderAt('/electricity/readings');
    expect(within(await screen.findByLabelText('Today')).getByText('1,100')).toBeTruthy();
    const form = screen.getByRole('form', { name: 'Punch a reading' });
    await waitFor(() => expect((within(form).getByLabelText('Date') as HTMLInputElement).value).toBe('2026-10-01'));
    fireEvent.change(within(form).getByLabelText('Punch time'), { target: { value: '18:00' } });
    fireEvent.change(within(form).getByLabelText('kWh reading'), { target: { value: '1120' } });
    const preview = await screen.findByRole('status', { name: 'Cost preview' });
    expect(within(preview).getByText('600 kWh')).toBeTruthy();
    expect(within(preview).getByText('₹14,545')).toBeTruthy();
    fireEvent.change(within(form).getByLabelText('Power factor'), { target: { value: '0.82' } });
    expect(screen.getByText('PF penalty (< 0.85)')).toBeTruthy();
    fireEvent.click(within(form).getByRole('button', { name: 'Save reading' }));
    await waitFor(() => expect(writes(fetchFn)).toHaveLength(1));
    expect(writes(fetchFn)[0]).toEqual({ url: '/api/electricity/readings', body: { date: '2026-10-01', time: '18:00', kwh: '1120', pf: '0.82', nightKwh: null, remarks: null, shift: 'PM' } });
  });
});

describe('Meter & tariff', () => {
  it('rates are typed in rupees and sent as paise; MF as typed', async () => {
    const fetchFn = fakeApi();
    renderAt('/electricity/meter');
    const energy = await screen.findByRole('form', { name: 'Add energy rate (per kwh)' });
    fireEvent.change(within(energy).getByLabelText('New energy rate (per kwh)'), { target: { value: '4.35' } });
    fireEvent.change(within(energy).getByLabelText('Effective from'), { target: { value: '2026-10-01' } });
    fireEvent.click(within(energy).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(writes(fetchFn)).toEqual([{ url: '/api/electricity/rates', body: { kind: 'energy', value: 435, effectiveFrom: '2026-10-01' } }]));
    expect(within(screen.getByRole('list', { name: 'Multiplying factor' })).getByText('×30')).toBeTruthy();
  });
});

describe('PGVCL bills', () => {
  it('works out the difference from the previous bill × MF while typing, and posts money in paise', async () => {
    const fetchFn = fakeApi();
    renderAt('/electricity/bills');
    fireEvent.click(await screen.findByRole('button', { name: 'Add bill' }));
    const dlg = await screen.findByRole('dialog', { name: 'PGVCL bill entry' });
    fireEvent.change(within(dlg).getByLabelText('Bill date'), { target: { value: '2026-09-30' } });
    fireEvent.change(within(dlg).getByLabelText('kWh reading'), { target: { value: '1080' } });
    expect(await within(dlg).findByText('Diff 180 × MF 30 = 5,400')).toBeTruthy();
    fireEvent.change(within(dlg).getByLabelText('Energy charge'), { target: { value: '22680.50' } });
    fireEvent.change(within(dlg).getByLabelText('Total payable'), { target: { value: '600000' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save bill' }));
    await waitFor(() => expect(writes(fetchFn)).toHaveLength(1));
    const body = writes(fetchFn)[0]!.body;
    expect(body).toMatchObject({ billDate: '2026-09-30', kwhReading: '1080', kvarhReading: null, totalPayablePaise: 60_000_000, netPayablePaise: null });
    expect(body.charges).toMatchObject({ energy: 2_268_050, demand: null });
  });
});
