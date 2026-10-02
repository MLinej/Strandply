import type { PermissionSet, Role } from '../domain/access';

/** Firms in the ERP. Per-user firm access isn't modelled yet, so everyone gets both. TODO: a user_firms table (PLAN.md §4). */
export const FIRMS = ['llp', 'osb'] as const;

/** Vendors page key → web permission suffix (`vendors.<suffix>`). */
const VENDOR_PAGES = {
  vendors: 'directory',
  vendor_reports: 'reports',
  vendor_masters: 'masters',
  vendor_settings: 'settings',
} as const;

/**
 * Turns a role's SampleTrack permissions into the ERP-wide strings the web shell checks
 * (`<module>.view`, `<module>.<page>`; `*` = everything). Each new module adds its mapping here,
 * so the server stays the single source of truth for what the sidebar shows.
 */
export function erpPermissions(role: Role, st: PermissionSet): string[] {
  if (role === 'superadmin' || role === 'admin') return ['*'];
  const out = new Set<string>();
  for (const page of st.pages) {
    if (page === 'users') {
      out.add('admin.view');
      out.add('admin.users');
    } else if (page === 'settings') {
      out.add('admin.view');
      out.add('admin.settings');
    } else if (page === 'notifications') {
      out.add('notifications.view');
    } else if (page.startsWith('purchase_')) {
      out.add('purchase.view');
      out.add(`purchase.${page.slice('purchase_'.length)}`);
    } else if (page in VENDOR_PAGES) {
      out.add('vendors.view');
      out.add(`vendors.${VENDOR_PAGES[page as keyof typeof VENDOR_PAGES]}`);
    } else {
      out.add('samples.view');
      out.add(`samples.${page}`);
    }
  }
  return [...out].sort();
}
