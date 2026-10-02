// Roles and permission keys. One matrix per role covers every rebuilt module.
// SampleTrack defaults follow the legacy ROLE_PERMS (docs/sampletrack-spec.md §2);
// the vendor_* keys come from the Vendor Portal (docs/vendors-spec.md §2), purchase_* from the
// Purchase ERP (docs/purchase-spec.md §2).

export const ROLES = ['superadmin', 'admin', 'dispatch', 'marketing', 'management'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  dispatch: 'Dispatch Dept',
  marketing: 'Marketing',
  management: 'Management',
};

export const PAGE_KEYS = [
  'dashboard',
  'requests',
  'dispatch',
  'tracking',
  'parties',
  'couriers',
  'products',
  'reports',
  'notifications',
  'users',
  'settings',
  // Vendors module
  'vendors',
  'vendor_reports',
  'vendor_masters',
  'vendor_settings',
  // Purchase module
  'purchase_dashboard',
  'purchase_entries',
  'purchase_orders',
  'purchase_notes',
  'purchase_inventory',
] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

/**
 * `approve` = approve sample requests (separate from edit, so it can be granted on its own).
 * `vendor_approve` = approve, activate, blacklist and reinstate vendors (the legacy "Director" check).
 * `purchase_approve` = approve purchase entries, POs, returns and opening stock (the legacy PIN approval).
 */
export const ACTION_KEYS = ['edit', 'delete', 'approve', 'print', 'export', 'dashboard_full', 'vendor_approve', 'purchase_approve'] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

export const WIDGET_KEYS = ['total', 'pending', 'delivered', 'delayed', 'parties', 'couriers'] as const;
export type WidgetKey = (typeof WIDGET_KEYS)[number];

export interface PermissionSet {
  pages: PageKey[];
  actions: ActionKey[];
  widgets: WidgetKey[];
}

export const FULL_PERMISSIONS: PermissionSet = {
  pages: [...PAGE_KEYS],
  actions: [...ACTION_KEYS],
  widgets: [...WIDGET_KEYS],
};

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, PermissionSet> = {
  superadmin: FULL_PERMISSIONS,
  admin: FULL_PERMISSIONS,
  dispatch: {
    pages: ['dashboard', 'dispatch', 'tracking', 'couriers', 'notifications'],
    actions: ['edit', 'print'],
    widgets: ['total', 'delivered', 'delayed'],
  },
  marketing: {
    pages: ['dashboard', 'requests', 'tracking', 'parties', 'products', 'notifications'],
    actions: ['edit', 'print'],
    widgets: ['pending', 'parties'],
  },
  management: {
    pages: ['dashboard', 'reports', 'notifications', 'vendors', 'vendor_reports', 'purchase_dashboard', 'purchase_inventory'],
    actions: ['print', 'export'],
    widgets: [...WIDGET_KEYS],
  },
};

/** The superadmin row can't be edited, and superadmin always gets FULL_PERMISSIONS. */
export const LOCKED_ROLES: readonly Role[] = ['superadmin'];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Removes duplicates and sorts keys into canonical order, so stored sets compare equal. */
export function normalizePermissionSet(set: PermissionSet): PermissionSet {
  return {
    pages: PAGE_KEYS.filter((k) => set.pages.includes(k)),
    actions: ACTION_KEYS.filter((k) => set.actions.includes(k)),
    widgets: WIDGET_KEYS.filter((k) => set.widgets.includes(k)),
  };
}

export function clonePermissionSet(set: PermissionSet): PermissionSet {
  return { pages: [...set.pages], actions: [...set.actions], widgets: [...set.widgets] };
}
