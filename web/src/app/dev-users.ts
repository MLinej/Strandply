import type { FirmCode } from './session';

export interface SessionUser {
  id: string;
  code: string;
  name: string;
  role: string;
  /** Shown under the name in the sidebar footer. */
  scopeNote: string;
  firms: FirmCode[];
  /** `*` = everything. Otherwise `<module>.view` and page-level extras such as `accounts.gst`. */
  permissions: string[];
}

/**
 * Stand-ins until /auth/me exists (Phase 0). Switch between them from the user menu
 * ("Preview as") to check that the sidebar, routes and firm switcher follow permissions.
 */
export const DEV_USERS: SessionUser[] = [
  {
    id: 'admin',
    code: 'ADMIN',
    name: 'Administrator',
    role: 'Admin',
    scopeNote: 'All modules',
    firms: ['llp', 'osb'],
    permissions: ['*'],
  },
  {
    id: 'stores',
    code: 'STR01',
    name: 'Hitesh Patel',
    role: 'Store keeper',
    scopeNote: 'Stores, purchase, stock',
    firms: ['llp', 'osb'],
    permissions: ['purchase.view', 'vendors.view', 'stores.view', 'stock.view'],
  },
  {
    id: 'accounts',
    code: 'ACC01',
    name: 'Nirali Shah',
    role: 'Accountant',
    scopeNote: 'Accounts, sales, reports',
    firms: ['llp'],
    permissions: ['accounts.view', 'accounts.gst', 'sales.view', 'vendors.view', 'reports.view'],
  },
];
