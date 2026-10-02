import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, apiUrl, isApiError } from '@/api/client';
import {
  BADGE_POLL_MS,
  duplicateOf,
  fetchCourierLabel,
  fetchQrPayload,
  fetchRequestSlip,
  inUseOf,
  lineFromProduct,
  shareDispatchOnWhatsApp,
  stateForCity,
  trackingUrl,
  useCourierOptions,
  useCreateParty,
  useApproveRequest,
  useBadges,
  useClearNotifications,
  useDashboard,
  useDispatches,
  useParties,
  usePendingRequestCount,
  usePreviewProductImport,
  useMarkAllNotificationsRead,
  useReport,
  useRequests,
  useTrackingDetail,
  useUpdateDispatchStatus,
} from '@/modules/samples/api';

const json = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function mockFetch(...responses: Response[]) {
  const fn = vi.fn<typeof fetch>();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('flattens filters into the query string and drops empty values', () => {
    expect(apiUrl('/sampletrack/parties', { q: 'raj', page: 2, filters: { type: 'New Lead', city: '' } })).toBe(
      '/api/sampletrack/parties?q=raj&page=2&type=New+Lead',
    );
    expect(apiUrl('/x')).toBe('/api/x');
  });

  it('sends the CSRF header and cookie, and maps error bodies to ApiError', async () => {
    const fetchFn = mockFetch(json(409, { error: { code: 'in_use', message: 'Used', details: { requests: 2, dispatches: 0 } } }));
    const err = await api('/sampletrack/parties/p1', { method: 'DELETE' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(isApiError(err, 'in_use')).toBe(true);
    expect(inUseOf(err)).toEqual({ requests: 2, dispatches: 0 });
    const init = fetchFn.mock.calls[0]![1]!;
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>)['X-Requested-With']).toBe('fetch');
  });

  it('returns undefined for 204', async () => {
    mockFetch(json(204, null));
    await expect(api('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});

describe('helpers', () => {
  const options = [
    { city: 'Rajkot', state: 'Gujarat', source: 'builtin' as const },
    { city: 'Aurangabad', state: 'Maharashtra', source: 'builtin' as const },
    { city: 'Aurangabad', state: 'Bihar', source: 'custom' as const },
    { city: 'Nowhere', state: null, source: 'party' as const },
  ];

  it('stateForCity fills the state only when it is unambiguous', () => {
    expect(stateForCity(options, ' rajkot ')).toBe('Gujarat');
    expect(stateForCity(options, 'Aurangabad')).toBeNull();
    expect(stateForCity(options, 'Nowhere')).toBeNull();
    expect(stateForCity(undefined, 'Rajkot')).toBeNull();
  });

  it('trackingUrl substitutes {tracking}', () => {
    expect(trackingUrl('https://t.example/?n={tracking}', 'AB 12')).toBe('https://t.example/?n=AB%2012');
    expect(trackingUrl('https://t.example/track', 'X')).toBe('https://t.example/track');
    expect(trackingUrl(null, 'X')).toBeNull();
  });
});

describe('hooks', () => {
  it('useParties requests the list with server-side query params', async () => {
    const fetchFn = mockFetch(json(200, { rows: [], total: 0 }));
    const { result } = renderHook(() => useParties({ q: 'raj', sort: '-name', filters: { type: 'New Lead' } }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchFn.mock.calls[0]![0]).toBe('/api/sampletrack/parties?q=raj&sort=-name&type=New+Lead');
  });

  it('useCreateParty surfaces a duplicate, then retries with force=true', async () => {
    const similar = [{ id: 'p1', name: 'Free Party', city: null, state: null, mobile: null, gst: null }];
    const fetchFn = mockFetch(
      json(409, { error: { code: 'possible_duplicate', message: 'dup', details: { similar } } }),
      json(201, { id: 'p2', name: 'free party' }),
    );
    const { result } = renderHook(() => useCreateParty(), { wrapper: wrapper() });

    let error: unknown;
    await act(async () => {
      error = await result.current.mutateAsync({ input: { name: 'free party' } }).catch((e: unknown) => e);
    });
    expect(duplicateOf(error)).toEqual({ similar });

    await act(async () => {
      await result.current.mutateAsync({ input: { name: 'free party' }, force: true });
    });
    expect(fetchFn.mock.calls[1]![0]).toBe('/api/sampletrack/parties?force=true');
    expect(JSON.parse(String(fetchFn.mock.calls[1]![1]!.body))).toEqual({ name: 'free party' });
  });

  it('useCourierOptions waits for a mode, then asks for that mode', async () => {
    const fetchFn = mockFetch(json(200, [{ id: 'c1', name: 'DTDC', type: 'Courier', trackingUrlTemplate: null }]));
    const { result, rerender } = renderHook(({ mode }) => useCourierOptions(mode), {
      wrapper: wrapper(),
      initialProps: { mode: undefined as 'Hand Delivery' | undefined },
    });
    expect(fetchFn).not.toHaveBeenCalled();
    rerender({ mode: 'Hand Delivery' });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(fetchFn.mock.calls[0]![0]).toBe('/api/sampletrack/couriers/options?mode=Hand+Delivery');
  });

  it('usePreviewProductImport uploads the file as multipart without a JSON content type', async () => {
    const fetchFn = mockFetch(json(200, { mode: 'preview', rows: [], totals: { rows: 0, added: 0, skipped: 0, errors: 0 } }));
    const { result } = renderHook(() => usePreviewProductImport(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync(new File(['code,name'], 'p.csv'));
    });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/sampletrack/products/import');
    expect(init!.body).toBeInstanceOf(FormData);
    expect((init!.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });
});

describe('request hooks', () => {
  it('useRequests sends the tab as a status filter and returns counts', async () => {
    const counts = { all: 4, Pending: 3, Approved: 1, Dispatched: 0, Delivered: 0 };
    const fetchFn = mockFetch(json(200, { rows: [], total: 3, counts }));
    const { result } = renderHook(() => useRequests({ q: 'teak', filters: { status: 'Pending' } }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.counts).toEqual(counts));
    expect(fetchFn.mock.calls[0]![0]).toBe('/api/sampletrack/requests?q=teak&status=Pending');
  });

  it('usePendingRequestCount selects the number for the badge', async () => {
    mockFetch(json(200, { count: 7 }));
    const { result } = renderHook(() => usePendingRequestCount(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBe(7));
  });

  it('useApproveRequest posts to the approve endpoint', async () => {
    const fetchFn = mockFetch(json(200, { id: 'r1', status: 'Approved' }));
    const { result } = renderHook(() => useApproveRequest(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync('r1');
    });
    expect(fetchFn.mock.calls[0]![0]).toBe('/api/sampletrack/requests/r1/approve');
    expect(fetchFn.mock.calls[0]![1]!.method).toBe('POST');
  });

  it('lineFromProduct prefills name, board, thickness and size, and keeps the typed qty', () => {
    const product = {
      id: 'p1',
      code: 'OSB-18',
      name: 'OSB 18mm Premium',
      boardType: 'OSB' as const,
      thicknessMm: 18,
      size: '8x4 ft',
      category: null,
      unitPricePaise: 0,
      stockStatus: 'Available' as const,
      description: null,
      createdBy: null,
      createdAt: '',
      updatedAt: '',
      deletedAt: null,
    };
    expect(lineFromProduct(product, { qty: '5 sheets' })).toEqual({
      productId: 'p1',
      productName: 'OSB 18mm Premium',
      board: 'OSB',
      thickness: '18mm',
      size: '8x4 ft',
      qty: '5 sheets',
    });
  });
});

describe('dispatch hooks', () => {
  it('useDispatches passes mode, status and overdue filters', async () => {
    const fetchFn = mockFetch(json(200, { rows: [], total: 0 }));
    const { result } = renderHook(() => useDispatches({ q: 'BD', filters: { mode: 'Courier', status: 'In Transit', overdue: true } }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchFn.mock.calls[0]![0]).toBe('/api/sampletrack/dispatches?q=BD&mode=Courier&status=In+Transit&overdue=true');
  });

  it('useUpdateDispatchStatus posts status and note', async () => {
    const fetchFn = mockFetch(json(200, { id: 'd1', status: 'Delayed' }));
    const { result } = renderHook(() => useUpdateDispatchStatus(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ id: 'd1', status: 'Delayed', note: 'Stuck at hub' });
    });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('/api/sampletrack/dispatches/d1/status');
    expect(JSON.parse(String(init!.body))).toEqual({ status: 'Delayed', note: 'Stuck at hub' });
  });

  it('useTrackingDetail loads the timeline for one shipment', async () => {
    const fetchFn = mockFetch(json(200, { dispatch: { id: 'd1' }, timeline: [], offPath: [], history: [] }));
    const { result } = renderHook(() => useTrackingDetail('d1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchFn.mock.calls[0]![0]).toBe('/api/sampletrack/tracking/d1');
  });
});

describe('print fetchers', () => {
  it('fetch the label and slip payloads from their endpoints', async () => {
    const fetchFn = mockFetch(json(200, { page: { size: 'A5' } }), json(200, { page: { size: 'A4' } }), json(200, { payload: 'ID:X' }));
    await fetchCourierLabel('d1');
    await fetchRequestSlip('r1');
    expect(await fetchQrPayload('d1')).toBe('ID:X');
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      '/api/sampletrack/dispatches/d1/label',
      '/api/sampletrack/requests/r1/slip',
      '/api/sampletrack/dispatches/d1/qr',
    ]);
  });

  it('shareDispatchOnWhatsApp opens the tab inside the click, then points it at wa.me', async () => {
    mockFetch(json(200, { text: 'Hello *there*', phone: '919876543210' }));
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    vi.stubGlobal('open', vi.fn(() => tab));
    await shareDispatchOnWhatsApp('d1', { toParty: true });
    expect(tab.location.href).toBe('https://wa.me/919876543210?text=Hello%20*there*');
    expect(tab.opener).toBeNull();
  });
});

describe('dashboard and report hooks', () => {
  it('useDashboard loads the role-aware payload', async () => {
    const fetchFn = mockFetch(json(200, { asOf: '2026-10-01', full: false, widgets: { total: 1 }, visibleWidgets: ['total'] }));
    const { result } = renderHook(() => useDashboard(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.widgets).toEqual({ total: 1 }));
    expect(fetchFn.mock.calls[0]![0]).toBe('/api/sampletrack/dashboard');
  });

  it('useReport sends the filters; it waits for a key', async () => {
    const fetchFn = mockFetch(json(200, { key: 'cost-tracking', tables: [], summary: [] }));
    const { result, rerender } = renderHook(({ k }) => useReport(k, { dateFrom: '2026-09-01', partyId: 'p1' }), {
      wrapper: wrapper(),
      initialProps: { k: undefined as 'cost-tracking' | undefined },
    });
    expect(fetchFn).not.toHaveBeenCalled();
    rerender({ k: 'cost-tracking' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchFn.mock.calls[0]![0]).toBe('/api/sampletrack/reports/cost-tracking?dateFrom=2026-09-01&partyId=p1');
  });
});

describe('notification hooks', () => {
  it('useBadges polls the badges endpoint every 30 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fetchFn = mockFetch(json(200, { unreadNotifications: 2 }), json(200, { unreadNotifications: 3 }));
      const { result } = renderHook(() => useBadges(), { wrapper: wrapper() });
      await waitFor(() => expect(result.current.data).toEqual({ unreadNotifications: 2 }));
      expect(BADGE_POLL_MS).toBe(30_000);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      await waitFor(() => expect(result.current.data).toEqual({ unreadNotifications: 3 }));
      expect(fetchFn.mock.calls.map((c) => c[0])).toEqual(['/api/sampletrack/badges', '/api/sampletrack/badges']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('mark all read sends upTo; clear sends ids', async () => {
    const fetchFn = mockFetch(json(200, { updated: 2 }), json(200, { cleared: 1 }));
    const { result } = renderHook(() => ({ all: useMarkAllNotificationsRead(), clear: useClearNotifications() }), { wrapper: wrapper() });
    await act(async () => {
      await result.current.all.mutateAsync('2026-10-01T09:00:00.000Z');
      await result.current.clear.mutateAsync({ ids: ['n1'] });
    });
    expect(fetchFn.mock.calls.map((c) => [c[0], JSON.parse(String(c[1]!.body))])).toEqual([
      ['/api/sampletrack/notifications/read-all', { upTo: '2026-10-01T09:00:00.000Z' }],
      ['/api/sampletrack/notifications/clear', { ids: ['n1'] }],
    ]);
  });
});
