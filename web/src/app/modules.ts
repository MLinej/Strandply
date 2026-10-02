import {
  BookOpen,
  MessageSquareWarning,
  SlidersHorizontal,
  Target,
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
  | 'reports'
  | 'complaints'
  | 'crm'
  | 'admin';

export interface PageDef {
  slug: string;
  label: string;
  perm?: string;
  /** Set once the page has a real screen. Built pages are offered in Home's "Go to". */
  built?: boolean;
}

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  /** Name in the app being replaced, so people can find their way. Searchable in Ctrl K. */
  legacyName?: string;
  icon: LucideIcon;
  /** Position in docs/MODULE-ROADMAP.md (build order), shown on placeholder pages. */
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
    phase: 3,
    pages: [
      { slug: 'dashboard', label: 'Purchase dashboard', perm: 'purchase.dashboard', built: true },
      { slug: 'register', label: 'Purchase register', perm: 'purchase.entries', built: true },
      { slug: 'trucks', label: 'Truck register', perm: 'purchase.entries', built: true },
      { slug: 'orders', label: 'Purchase orders', perm: 'purchase.orders', built: true },
      { slug: 'returns', label: 'Purchase returns', perm: 'purchase.entries', built: true },
      { slug: 'notes', label: 'Debit / credit notes', perm: 'purchase.notes', built: true },
      { slug: 'inventory', label: 'Raw material stock', perm: 'purchase.inventory', built: true },
      { slug: 'reports', label: 'Purchase reports', perm: 'purchase.dashboard', built: true },
      { slug: 'documents', label: 'Documents', perm: 'purchase.entries', built: true },
      { slug: 'audit', label: 'Audit trail', perm: 'purchase.dashboard', built: true },
    ],
  },
  {
    key: 'vendors',
    label: 'Vendors',
    legacyName: 'Vendor Portal',
    icon: Users,
    phase: 2,
    pages: [
      { slug: 'directory', label: 'Vendors', perm: 'vendors.directory', built: true },
      { slug: 'compare', label: 'Compare vendors', perm: 'vendors.directory', built: true },
      { slug: 'find', label: 'Find by product', perm: 'vendors.directory', built: true },
      { slug: 'reports', label: 'Vendor reports', perm: 'vendors.reports', built: true },
      { slug: 'products', label: 'Product master', perm: 'vendors.masters', built: true },
      { slug: 'categories', label: 'Categories', perm: 'vendors.masters', built: true },
      { slug: 'cities', label: 'City & pincodes', perm: 'vendors.masters', built: true },
      { slug: 'tnc', label: 'T&C master', perm: 'vendors.masters', built: true },
      { slug: 'settings', label: 'Vendor settings', perm: 'vendors.settings', built: true },
    ],
  },
  {
    key: 'stores',
    label: 'Stores',
    legacyName: 'Stores (MRN & GRN)',
    icon: Warehouse,
    phase: 4,
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
    phase: 5,
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
    phase: 6,
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
    phase: 7,
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
    phase: 1,
    pages: [
      { slug: 'dashboard', label: 'Samples dashboard', perm: 'samples.dashboard', built: true },
      { slug: 'requests', label: 'Sample requests', perm: 'samples.requests', built: true },
      { slug: 'dispatch', label: 'Sample dispatch', perm: 'samples.dispatch', built: true },
      { slug: 'tracking', label: 'Live tracking', perm: 'samples.tracking', built: true },
      { slug: 'parties', label: 'Parties', perm: 'samples.parties', built: true },
      { slug: 'couriers', label: 'Couriers', perm: 'samples.couriers', built: true },
      { slug: 'products', label: 'Sample products', perm: 'samples.products', built: true },
      { slug: 'reports', label: 'Sample reports', perm: 'samples.reports', built: true },
    ],
  },
  {
    key: 'crm',
    label: 'CRM',
    legacyName: 'Marketing & Sales CRM',
    icon: Target,
    phase: 8,
    pages: [
      { slug: 'leads', label: 'Leads' },
      { slug: 'pipeline', label: 'Pipeline' },
    ],
  },
  {
    key: 'transport',
    label: 'Transport',
    legacyName: 'Transport Module',
    icon: Truck,
    phase: 9,
    pages: [
      { slug: 'trips', label: 'Trips' },
      { slug: 'vehicles', label: 'Vehicles' },
      { slug: 'transporters', label: 'Transporters' },
    ],
  },
  {
    key: 'complaints',
    label: 'Complaints',
    legacyName: 'Complaint Registration',
    icon: MessageSquareWarning,
    phase: 10,
    pages: [
      { slug: 'register', label: 'Complaint register' },
      { slug: 'dashboard', label: 'Complaints dashboard' },
    ],
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    legacyName: 'Maintenance Tracker',
    icon: Wrench,
    phase: 12,
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
    phase: 11,
    pages: [
      { slug: 'readings', label: 'Meter readings' },
      { slug: 'pgvcl-bills', label: 'PGVCL bills' },
      { slug: 'tariffs', label: 'Tariffs' },
    ],
  },
  { key: 'dwpas', label: 'DWPAS', icon: ClipboardList, phase: 13, pages: [] },
  {
    key: 'accounts',
    label: 'Accounts',
    icon: BookOpen,
    phase: 7,
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
    phase: 14,
    pages: [
      { slug: 'hub', label: 'Reports hub' },
      { slug: 'daily', label: 'Daily report' },
      { slug: 'monthly', label: 'Monthly report' },
      { slug: 'cost-per-board', label: 'Cost per board' },
      { slug: 'purchase-analysis', label: 'Purchase analysis' },
      { slug: 'vendor-ranking', label: 'Vendor ranking' },
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    icon: SlidersHorizontal,
    phase: 0,
    pages: [
      { slug: 'users', label: 'Users', perm: 'admin.users', built: true },
      { slug: 'roles', label: 'Roles & permissions', perm: 'admin.users', built: true },
      { slug: 'activity', label: 'Activity log', perm: 'admin.users', built: true },
      { slug: 'settings', label: 'Company settings', perm: 'admin.settings', built: true },
      { slug: 'cities', label: 'City master', perm: 'admin.settings', built: true },
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
