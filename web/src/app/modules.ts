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
      { slug: 'dashboard', label: 'Stores dashboard', perm: 'stores.dashboard', built: true },
      { slug: 'gate-entry', label: 'Gate entry (MRN)', perm: 'stores.gate', built: true },
      { slug: 'grn', label: 'Goods receipt (GRN)', perm: 'stores.grn', built: true },
      { slug: 'accounting', label: 'Accounting', perm: 'stores.accounting', built: true },
      { slug: 'reports', label: 'Stores reports', perm: 'stores.reports', built: true },
      { slug: 'settings', label: 'Stores settings', perm: 'stores.settings', built: true },
      { slug: 'audit', label: 'Audit trail', perm: 'stores.dashboard', built: true },
    ],
  },
  {
    key: 'stock',
    label: 'Stock (SKU)',
    legacyName: 'Stock Management',
    icon: Package,
    phase: 5,
    pages: [
      { slug: 'dashboard', label: 'Stock dashboard', perm: 'stock.dashboard', built: true },
      { slug: 'slips', label: 'Stock slips (SIS / SRS)', perm: 'stock.slips', built: true },
      { slug: 'live', label: 'Live stock', perm: 'stock.ledger', built: true },
      { slug: 'ledger', label: 'Stock ledger', perm: 'stock.ledger', built: true },
      { slug: 'reclass', label: 'Reclassification', perm: 'stock.reclass', built: true },
      { slug: 'items', label: 'Item master', perm: 'stock.masters', built: true },
      { slug: 'opening', label: 'Opening stock', perm: 'stock.masters', built: true },
      { slug: 'audit', label: 'Audit trail', perm: 'stock.dashboard', built: true },
    ],
  },
  {
    key: 'production',
    label: 'Production',
    legacyName: 'Production MIS',
    icon: Factory,
    phase: 6,
    pages: [
      { slug: 'dashboard', label: 'Production dashboard', perm: 'production.dashboard', built: true },
      { slug: 'planning', label: 'Production planning', perm: 'production.planning', built: true },
      { slug: 'hot-press', label: 'Hot press', perm: 'production.press', built: true },
      { slug: 'matt', label: 'Matt weight', perm: 'production.matt', built: true },
      { slug: 'chipping', label: 'Chipping', perm: 'production.materials', built: true },
      { slug: 'wip', label: 'WIP Nilgiri', perm: 'production.materials', built: true },
      { slug: 'resin', label: 'Resin consumption', perm: 'production.materials', built: true },
      { slug: 'board-cutting', label: 'Board cutting', perm: 'production.press', built: true },
      { slug: 'summary', label: 'Production summary', perm: 'production.planning', built: true },
      { slug: 'mdo', label: 'MDO press', perm: 'production.press', built: true },
      { slug: 'reports', label: 'Production reports', perm: 'production.dashboard', built: true },
      { slug: 'settings', label: 'Production settings', perm: 'production.settings', built: true },
      { slug: 'audit', label: 'Audit trail', perm: 'production.dashboard', built: true },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    legacyName: 'Sales ERP',
    icon: TrendingUp,
    phase: 7,
    pages: [
      { slug: 'dashboard', label: 'Sales dashboard', perm: 'sales.dashboard', built: true },
      { slug: 'proforma', label: 'Proforma invoices', perm: 'sales.proforma', built: true },
      { slug: 'orders', label: 'Sales orders', perm: 'sales.orders', built: true },
      { slug: 'invoices', label: 'Sales invoices', perm: 'sales.invoices', built: true },
      { slug: 'dispatch', label: 'Dispatch register', perm: 'sales.dispatch', built: true },
      { slug: 'fg-stock', label: 'FG inventory', perm: 'sales.dispatch', built: true },
      { slug: 'intercompany', label: 'Inter-company', perm: 'sales.invoices', built: true },
      { slug: 'customers', label: 'Party master', perm: 'sales.masters', built: true },
      { slug: 'items', label: 'Item master', perm: 'sales.masters', built: true },
      { slug: 'price-list', label: 'Price list', perm: 'sales.masters', built: true },
      { slug: 'weight-chart', label: 'Weight chart', perm: 'sales.masters', built: true },
      { slug: 'reports', label: 'Sales reports', perm: 'sales.reports', built: true },
      { slug: 'settings', label: 'Sales settings', perm: 'sales.settings', built: true },
      { slug: 'audit', label: 'Audit trail', perm: 'sales.dashboard', built: true },
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
      { slug: 'dashboard', label: 'CRM dashboard', perm: 'crm.dashboard', built: true },
      { slug: 'followups', label: 'Follow-ups', perm: 'crm.followups', built: true },
      { slug: 'leads', label: 'Raw lead data', perm: 'crm.leads', built: true },
      { slug: 'pipeline', label: 'Lead management', perm: 'crm.leads', built: true },
      { slug: 'customers', label: 'Customers', perm: 'crm.customers', built: true },
      { slug: 'opportunities', label: 'Opportunities', perm: 'crm.pipeline', built: true },
      { slug: 'quotations', label: 'Quotations', perm: 'crm.pipeline', built: true },
      { slug: 'won', label: 'Orders won', perm: 'crm.pipeline', built: true },
      { slug: 'lost', label: 'Orders lost', perm: 'crm.pipeline', built: true },
      { slug: 'tasks', label: 'Tasks & reminders', perm: 'crm.followups', built: true },
      { slug: 'campaigns', label: 'Sources & campaigns', perm: 'crm.masters', built: true },
      { slug: 'products', label: 'Product master', perm: 'crm.masters', built: true },
      { slug: 'salespersons', label: 'Salespersons', perm: 'crm.masters', built: true },
      { slug: 'reports', label: 'CRM reports', perm: 'crm.reports', built: true },
      { slug: 'settings', label: 'CRM settings', perm: 'crm.masters', built: true },
      { slug: 'audit', label: 'Audit trail', perm: 'crm.dashboard', built: true },
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
