import { Navigate, Outlet, useMatches } from 'react-router';
import { MODULE_BY_KEY, pagePath, type ModuleKey } from '../modules';
import type { RouteHandle } from '../route-handle';
import { useSession } from '../session';
import { Forbidden } from './StatusPages';

/**
 * Layout route for a module. Blocks the whole module or a single page when the user lacks the permission,
 * so typing a URL can't reach what the sidebar hides. (The API enforces the same rules server-side.)
 */
export function ModuleRoute({ moduleKey }: { moduleKey: ModuleKey }) {
  const { canSeeModule, canSeePage } = useSession();
  const mod = MODULE_BY_KEY[moduleKey];
  const leaf = useMatches().at(-1)?.handle as RouteHandle | undefined;

  if (!canSeeModule(mod)) return <Forbidden what={mod.label} />;
  const page = leaf?.pageSlug ? mod.pages.find((p) => p.slug === leaf.pageSlug) : undefined;
  if (page && !canSeePage(mod, page)) return <Forbidden what={page.label} />;
  return <Outlet />;
}

/** /stores → the first page of Stores this user may open. */
export function ModuleIndex({ moduleKey }: { moduleKey: ModuleKey }) {
  const { visibleModules } = useSession();
  const first = visibleModules.find((m) => m.key === moduleKey)?.pages[0];
  return first ? <Navigate to={pagePath(moduleKey, first.slug)} replace /> : <Forbidden what={MODULE_BY_KEY[moduleKey].label} />;
}
