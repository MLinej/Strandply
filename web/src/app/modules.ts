import {
  BookOpen,
  ChartColumn,
  ClipboardList,
  Factory,
  House,
  Layers,
  Package,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Single source of truth for navigation: sidebar, routes, breadcrumbs, the command palette and
 * permission checks all read from here. Adding a page = one line here + (optionally) a component in
 * src/modules/<key>/index.tsx. Until a component exists the route renders the "not built yet" page.
 *
 * Permissions: a module is visible with `<key>.view`. A page is visible with its own `perm`
 * (defaults to the module's). The API will return the same strings from /auth/me.
 */
export type ModuleKey =
  | 'home'
  | 'purchase'
  | 'vendors'
  | 'stores'
  | 'stock'
  | 'production'
  | 'sales'
  | 'samples'
  | 'transport'
  | 'maintenance'
  | 'electricity'
  | 'dwpas'
  | 'accounts'
  | 'reports';

export interface PageDef {
  slug: string;
  label: string;
  perm?: string;
}

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  /** Name in the app being replaced, so people can find their way. Searchable in Ctrl K. */
  legacyName?: string;
  icon: LucideIcon;
  /** Build phase from PLAN.md §5, shown on placeholder pages. */
  phase: number;
  /** Empty = a single-page module (no sub-menu). */
  pages: PageDef[];
}

export const MODULES: ModuleDef[] = [
  { key: 'home', label: 'Home', icon: House, phase: 0, pages: [] },
  {
    key: 'purchase',
    label: 'Purchase',
    legacyName: 'Purchase ERP',
    icon: ShoppingCart,
    phase: 2,
    pages: [
      { slug: 'dashboard', label: 'Purchase dashboard' },
      { slug: 'requisitions', label: 'Requisitions' },
      { slug: 'orders', label: 'Purchase orders' },
      { slug: 'debit-credit-notes', label: 'Debit / credit notes' },
    ],
  },
  {
    key: 'vendors',
    label: 'Vendors',
    legacyName: 'Vendor Portal',
    icon: Users,
    phase: 1,
    pages: [
      { slug: 'master', label: 'Vendor master' },
      { slug: 'portal-access', label: 'Portal access', perm: 'vendors.admin' },
    ],
  },
  {
    key: 'stores',
    label: 'Stores',
    legacyName: 'Stores (MRN & GRN)',
    icon: Warehouse,
    phase: 2,
    pages: [
      { slug: 'dashboard', label: 'Stores dashboard' },
      { slug: 'gate-entry', label: 'Gate entry (MRN)' },
      { slug: 'grn', label: 'Goods receipt (GRN)' },
      { slug: 'store-pos', label: 'Store POs' },
      { slug: 'issues', label: 'Item issues' },
      { slug: 'item-stock', label: 'Item stock' },
    ],
  },
  {
    key: 'stock',
    label: 'Stock (SKU)',
    legacyName: 'Stock Management',
    icon: Package,
    phase: 4,
    pages: [
      { slug: 'dashboard', label: 'Stock dashboard' },
      { slug: 'finished-stock', label: 'Finished stock' },
      { slug: 'slips', label: 'Stock slips' },
      { slug: 'skus', label: 'SKU master' },
    ],
  },
  {
    key: 'production',
    label: 'Production',
    legacyName: 'Production MIS',
    icon: Factory,
    phase: 4,
    pages: [
      { slug: 'dashboard', label: 'Production dashboard' },
      { slug: 'shifts', label: 'Shift register' },
      { slug: 'consumption', label: 'Material consumption' },
      { slug: 'work-orders', label: 'Work orders' },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    legacyName: 'Sales ERP',
    icon: TrendingUp,
    phase: 5,
    pages: [
      { slug: 'dashboard', label: 'Sales dashboard' },
      { slug: 'orders', label: 'Sales orders' },
      { slug: 'invoices', label: 'Invoices' },
      { slug: 'credit-notes', label: 'Credit notes' },
      { slug: 'customers', label: 'Customers' },
      { slug: 'outstanding', label: 'Outstanding & ageing' },
    ],
  },
  {
    key: 'samples',
    label: 'Samples',
    legacyName: 'SampleTrack Pro',
    icon: Layers,
    phase: 6,
    pages: [
      { slug: 'requests', label: 'Sample requests' },
      { slug: 'dispatch', label: 'Sample dispatch' },
    ],
  },
  {
    key: 'transport',
    label: 'Transport',
    legacyName: 'Transport Module',
    icon: Truck,
    phase: 6,
    pages: [
      { slug: 'trips', label: 'Trips' },
      { slug: 'vehicles', label: 'Vehicles' },
      { slug: 'transporters', label: 'Transporters' },
    ],
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    legacyName: 'Maintenance Tracker',
    icon: Wrench,
    phase: 9,
    pages: [
      { slug: 'dashboard', label: 'Maintenance dashboard' },
      { slug: 'breakdowns', label: 'Breakdowns' },
      { slug: 'schedule', label: 'Preventive schedule' },
    ],
  },
  {
    key: 'electricity',
    label: 'Electricity',
    legacyName: 'Electricity & Meter MIS',
    icon: Zap,
    phase: 4,
    pages: [
      { slug: 'readings', label: 'Meter readings' },
      { slug: 'pgvcl-bills', label: 'PGVCL bills' },
      { slug: 'tariffs', label: 'Tariffs' },
    ],
  },
  { key: 'dwpas', label: 'DWPAS', icon: ClipboardList, phase: 9, pages: [] },
  {
    key: 'accounts',
    label: 'Accounts',
    icon: BookOpen,
    phase: 3,
    pages: [
      { slug: 'dashboard', label: 'Accounts dashboard' },
      { slug: 'receipts', label: 'Receipts' },
      { slug: 'vendor-bills', label: 'Vendor bills' },
      { slug: 'payments', label: 'Payments' },
      { slug: 'payables-ageing', label: 'Payables ageing' },
      { slug: 'gst-returns', label: 'GST returns', perm: 'accounts.gst' },
      { slug: 'gstr-2b', label: 'GSTR-2B match', perm: 'accounts.gst' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: ChartColumn,
    phase: 8,
    pages: [
      { slug: 'hub', label: 'Reports hub' },
      { slug: 'daily', label: 'Daily report' },
      { slug: 'monthly', label: 'Monthly report' },
      { slug: 'cost-per-board', label: 'Cost per board' },
      { slug: 'purchase-analysis', label: 'Purchase analysis' },
      { slug: 'vendor-ranking', label: 'Vendor ranking' },
    ],
  },
];

export const MODULE_BY_KEY = Object.fromEntries(MODULES.map((m) => [m.key, m])) as Record<ModuleKey, ModuleDef>;

export function modulePerm(key: ModuleKey) {
  return `${key}.view`;
}

export function pagePerm(mod: ModuleDef, page: PageDef) {
  return page.perm ?? modulePerm(mod.key);
}

export function modulePath(key: ModuleKey) {
  return key === 'home' ? '/' : `/${key}`;
}

export function pagePath(key: ModuleKey, slug: string) {
  return `/${key}/${slug}`;
}
