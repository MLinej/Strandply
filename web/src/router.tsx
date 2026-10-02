import { createBrowserRouter, type RouteObject } from 'react-router';
import { MODULES, type ModuleDef, type ModuleKey } from './app/modules';
import { ModuleIndex, ModuleRoute } from './app/pages/ModuleRoute';
import { PlaceholderPage } from './app/pages/PlaceholderPage';
import { NotFound } from './app/pages/StatusPages';
import type { RouteHandle } from './app/route-handle';
import { RequireSession } from './app/RequireSession';
import { AppShell } from './app/shell/AppShell';
import type { ModulePages } from './modules/types';

// One lazy chunk per module (Vite splits each glob entry into its own file).
const moduleLoaders = import.meta.glob<{ pages: ModulePages }>('./modules/*/index.tsx');

function lazyPage(key: ModuleKey, slug: string) {
  return async () => {
    const load = moduleLoaders[`./modules/${key}/index.tsx`];
    const mod = load ? await load() : { pages: {} as ModulePages };
    return { Component: mod.pages[slug] ?? PlaceholderPage };
  };
}

function moduleRoute(m: ModuleDef): RouteObject {
  if (m.key === 'home') {
    const handle: RouteHandle = { moduleKey: 'home', crumb: { module: 'Home', page: 'My work list' } };
    return { index: true, handle, lazy: lazyPage('home', 'index') };
  }
  if (m.pages.length === 0) {
    const handle: RouteHandle = { moduleKey: m.key, crumb: { module: m.label, page: m.label } };
    return {
      path: m.key,
      element: <ModuleRoute moduleKey={m.key} />,
      children: [{ index: true, handle, lazy: lazyPage(m.key, 'index') }],
    };
  }
  return {
    path: m.key,
    element: <ModuleRoute moduleKey={m.key} />,
    children: [
      { index: true, element: <ModuleIndex moduleKey={m.key} /> },
      ...m.pages.map<RouteObject>((p) => {
        const handle: RouteHandle = { moduleKey: m.key, pageSlug: p.slug, crumb: { module: m.label, page: p.label } };
        // `/*` so a page can own nested routes later (e.g. /stores/grn/GRN-26-27-0043).
        return { path: `${p.slug}/*`, handle, lazy: lazyPage(m.key, p.slug) };
      }),
    ],
  };
}

export const routes: RouteObject[] = [
  // Outside the shell, and the only page reachable without a session.
  { path: '/sign-in', lazy: () => import('./app/pages/SignInPage').then((m) => ({ Component: m.SignInPage })) },
  {
    path: '/',
    element: (
      <RequireSession>
        <AppShell />
      </RequireSession>
    ),
    children: [...MODULES.map(moduleRoute), { path: '*', element: <NotFound /> }],
  },
  // Component gallery, outside the shell.
  { path: '/design-system', lazy: () => import('./routes/design-system/DesignSystemPage').then((m) => ({ Component: m.default })) },
];

export const router = createBrowserRouter(routes);
