import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeNext } from '@/app/pages/SignInPage';
import { SessionProvider } from '@/app/session';
import { ToastProvider } from '@/components/ui';
import { routes } from '@/router';

const me = {
  user: { id: 'u1', username: 'marketing', name: 'Ankit Marketing', department: 'Sales' },
  role: 'marketing',
  roleLabel: 'Marketing',
  isSuperadmin: false,
  permissions: { pages: ['dashboard', 'requests'], actions: ['edit'], widgets: [] },
  erp: { permissions: ['samples.view', 'samples.requests', 'samples.dashboard'], firms: ['llp', 'osb'] },
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Fake API: /me is 401 until a login with the right password succeeds. Everything else returns empty data. */
function fakeApi() {
  let signedIn = false;
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/me') return signedIn ? json(200, me) : json(401, { error: { code: 'unauthenticated', message: '' } });
    if (url === '/api/auth/logout') {
      signedIn = false;
      return new Response(null, { status: 204 });
    }
    if (url === '/api/auth/login') {
      const body = JSON.parse(String(init?.body));
      if (body.password !== 'right-password') return json(401, { error: { code: 'invalid_credentials', message: 'x' } });
      signedIn = true;
      return json(200, me);
    }
    return json(200, { rows: [], total: 0, counts: {}, widgets: {} });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SessionProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('sign-in', () => {
  it('sends a signed-out visitor to /sign-in, remembering where they were going', async () => {
    fakeApi();
    const router = renderAt('/samples/requests');
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(router.state.location.search).toBe('?next=%2Fsamples%2Frequests');
  });

  it('shows a clear error for a wrong password and clears the password box', async () => {
    fakeApi();
    renderAt('/sign-in');
    fireEvent.change(await screen.findByLabelText('User code'), { target: { value: 'marketing' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope-nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toBe('That user code and password don’t match.');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
  });

  it('signs in, stores the chosen firm, and continues to the page asked for', async () => {
    const fetchFn = fakeApi();
    const router = renderAt('/sign-in?next=%2Fsamples%2Frequests');
    fireEvent.click(await screen.findByRole('radio', { name: 'OSB Unit' }));
    fireEvent.change(screen.getByLabelText('User code'), { target: { value: ' marketing ' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'right-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/samples/requests'));
    const login = fetchFn.mock.calls.find((c) => String(c[0]) === '/api/auth/login')!;
    expect(JSON.parse(String(login[1]!.body))).toEqual({ username: 'marketing', password: 'right-password' });
    expect(localStorage.getItem('strandply.firm.u1')).toBe('osb');
  });

  it('asks for both fields before calling the API', async () => {
    const fetchFn = fakeApi();
    renderAt('/sign-in');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Enter your user code and password.');
    expect(fetchFn.mock.calls.some((c) => String(c[0]) === '/api/auth/login')).toBe(false);
  });

  it('log out ends the session and returns to the sign-in page', async () => {
    const fetchFn = fakeApi();
    const router = renderAt('/sign-in');
    fireEvent.change(await screen.findByLabelText('User code'), { target: { value: 'marketing' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'right-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));

    fireEvent.click(await screen.findByRole('button', { name: /log out/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'));
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(fetchFn.mock.calls.some((c) => String(c[0]) === '/api/auth/logout')).toBe(true);
    // Going back into the app now needs signing in again.
    await router.navigate('/samples/requests');
    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'));
  });

  it('?next= only accepts same-site app paths', () => {
    expect(safeNext('/samples/requests?status=Pending')).toBe('/samples/requests?status=Pending');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('//evil.example/x')).toBe('/');
    expect(safeNext('/sign-in')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});
