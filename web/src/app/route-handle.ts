import type { ModuleKey } from './modules';

/** Attached to every module route; read by the topbar breadcrumb, document.title and the access guard. */
export interface RouteHandle {
  moduleKey: ModuleKey;
  /** Undefined for single-page modules. */
  pageSlug?: string;
  crumb: { module: string; page: string };
}
