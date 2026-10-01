import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MODULES } from '@/app/modules';
import { SessionProvider } from '@/app/session';
import { activeModuleKey } from '@/app/shell/Sidebar';
import { filterEntries } from '@/app/shell/CommandPalette';
import { ToastProvider } from '@/components/ui';
import { routes } from '@/router';

function renderApp(path: string, userId = 'admin') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <SessionProvider initialUserId={userId}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </SessionProvider>,
  );
  return router;
}

const sidebarLabels = () =>
  within(screen.getByRole('navigation', { name: 'Modules' }))
    .getAllByRole('link')
    .concat(within(screen.getByRole('navigation', { name: 'Modules' })).queryAllByRole('button'))
    .map((el) => el.textContent?.trim())
    .filter(Boolean);

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('app shell', () => {
  it('shows every module to the administrator', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1 });
    const labels = sidebarLabels();
    for (const m of MODULES) expect(labels.some((l) => l?.startsWith(m.label))).toBe(true);
  });

  it('builds the sidebar from permissions', async () => {
    renderApp('/', 'accounts');
    await screen.findByRole('heading', { level: 1 });
    const labels = sidebarLabels().join('|');
    for (const shown of ['Home', 'Vendors', 'Sales', 'Accounts', 'Reports']) expect(labels).toContain(shown);
    for (const hidden of ['Stores', 'Purchase', 'Production', 'Transport']) expect(labels).not.toContain(hidden);
  });

  it('hides pages that need an extra permission', async () => {
    renderApp('/vendors/master', 'stores');
    await screen.findByRole('heading', { name: 'Vendor master' });
    expect(screen.queryByRole('link', { name: 'Portal access' })).toBeNull();
  });

  it('blocks modules the user cannot open, even by URL', async () => {
    renderApp('/accounts/receipts', 'stores');
    expect(await screen.findByText('You don’t have access to Accounts')).toBeTruthy();
  });

  it('redirects a module to its first page and shows the breadcrumb', async () => {
    const router = renderApp('/stores');
    await screen.findByRole('heading', { name: 'Stores dashboard' });
    expect(router.state.location.pathname).toBe('/stores/dashboard');
    const crumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(crumb.textContent).toBe('StoresStores dashboard');
  });

  it('marks the active module and page in the sidebar', async () => {
    renderApp('/stores/grn');
    await screen.findByRole('heading', { name: 'Goods receipt (GRN)' });
    expect(screen.getByRole('button', { name: /Stores/ }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: 'Goods receipt (GRN)' }).getAttribute('aria-current')).toBe('page');
  });

  it('expands another module’s sub-menu on click', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: 'Purchase orders' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Purchase/ }));
    expect(screen.getByRole('link', { name: 'Purchase orders' })).toBeTruthy();
  });

  it('switches the firm globally', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText('Admin · Both firms')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'OSB Unit' }));
    expect(screen.getByText('Admin · OSB Unit')).toBeTruthy();
    expect(localStorage.getItem('strandply.firm.admin')).toBe('osb');
  });

  it('hides the firm switch for single-firm users', async () => {
    renderApp('/', 'accounts');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('radiogroup', { name: 'Firm' })).toBeNull();
    expect(screen.getByText('Accountant · Strandply LLP')).toBeTruthy();
  });

  it('shows the not-found page for unknown URLs', async () => {
    renderApp('/old-app/page');
    expect(await screen.findByText('This page doesn’t exist')).toBeTruthy();
  });
});

describe('helpers', () => {
  it('works out the active module from the URL', () => {
    expect(activeModuleKey('/', MODULES)).toBe('home');
    expect(activeModuleKey('/stores/grn/123', MODULES)).toBe('stores');
    expect(activeModuleKey('/nope', MODULES)).toBeUndefined();
  });

  it('finds pages by their old app names in the palette', () => {
    const entries = MODULES.flatMap((m) =>
      m.pages.map((p) => ({ id: p.slug, group: m.label, title: p.label, meta: '', href: '', haystack: `${p.label} ${m.label} ${m.legacyName ?? ''}`.toLowerCase() })),
    );
    expect(filterEntries(entries, 'sampletrack').map((e) => e.title)).toEqual(['Sample requests', 'Sample dispatch']);
    expect(filterEntries(entries, 'grn goods').map((e) => e.title)).toEqual(['Goods receipt (GRN)']);
  });
});
