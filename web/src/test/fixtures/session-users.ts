import type { FirmCode, SessionUser } from '@/app/session';

/** Session users for component tests (the app itself signs in through /api/auth/login). */
export const TEST_USERS = [] = [
  {
    id: 'admin',
    code: 'ADMIN',
    name: 'Administrator',
    role: 'Admin',
    scopeNote: 'All modules',
    firms: ['llp', 'osb'] as FirmCode[],
    permissions: ['*'],
    st: { pages: [], actions: [], widgets: [] },
  },
  {
    id: 'stores',
    code: 'STR01',
    name: 'Hitesh Patel',
    role: 'Store keeper',
    scopeNote: 'Stores, purchase, stock',
    firms: ['llp', 'osb'] as FirmCode[],
    permissions: ['purchase.view', 'vendors.view', 'vendors.directory', 'stores.view', 'stock.view'],
    st: { pages: [], actions: [], widgets: [] },
  },
  {
    id: 'accounts',
    code: 'ACC01',
    name: 'Nirali Shah',
    role: 'Accountant',
    scopeNote: 'Accounts, sales, reports',
    firms: ['llp'] as FirmCode[],
    permissions: ['accounts.view', 'accounts.gst', 'sales.view', 'sales.invoices', 'sales.reports', 'vendors.view', 'vendors.directory', 'reports.view'],
    st: { pages: [], actions: [], widgets: [] },
  },
] satisfies SessionUser[];

export const testUser = (id: string): SessionUser => TEST_USERS.find((u) => u.id === id) ?? TEST_USERS[0]!;
