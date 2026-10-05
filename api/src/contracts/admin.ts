// Admin wire types (users, roles, activity), shared with the web app. Import type only.
import type { PermissionSetView } from './session';

export const ROLE_KEYS = ['superadmin', 'admin', 'dispatch', 'marketing', 'management'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

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
  'vendors',
  'vendor_reports',
  'vendor_masters',
  'vendor_settings',
  'purchase_dashboard',
  'purchase_entries',
  'purchase_orders',
  'purchase_notes',
  'purchase_inventory',
  'stores_dashboard',
  'stores_gate',
  'stores_grn',
  'stores_accounting',
  'stores_reports',
  'stores_settings',
  'stock_dashboard',
  'stock_slips',
  'stock_ledger',
  'stock_reclass',
  'stock_masters',
  'production_dashboard',
  'production_planning',
  'production_press',
  'production_matt',
  'production_materials',
  'production_settings',
  'sales_dashboard',
  'sales_masters',
  'sales_proforma',
  'sales_orders',
  'sales_invoices',
  'sales_dispatch',
  'sales_reports',
  'sales_settings',
  'crm_dashboard',
  'crm_leads',
  'crm_followups',
  'crm_customers',
  'crm_pipeline',
  'crm_masters',
  'crm_reports',
  'transport_dashboard',
  'transport_freight',
  'transport_masters',
  'transport_reports',
  'maintenance_dashboard',
  'maintenance_orders',
  'maintenance_masters',
  'maintenance_reports',
  'electricity_dashboard',
  'electricity_readings',
  'electricity_reports',
  'electricity_bills',
  'electricity_settings',
  'complaints_dashboard',
  'complaints_register',
  'complaints_reports',
  'complaints_masters',
  'dwpas_dashboard',
  'dwpas_plans',
  'dwpas_reports',
  'dwpas_masters',
] as const;
export const ACTION_KEYS = ['edit', 'delete', 'approve', 'print', 'export', 'dashboard_full', 'vendor_approve', 'purchase_approve', 'stores_review', 'stores_approve', 'stores_account', 'production_review', 'production_approve', 'sales_approve', 'transport_approve', 'dwpas_approve'] as const;
export const WIDGET_KEYS = ['total', 'pending', 'delivered', 'delayed', 'parties', 'couriers'] as const;

export interface PublicUser {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  role: RoleKey;
  roleLabel: string;
  status: 'Active' | 'Inactive';
  createdAt: string;
  updatedAt: string;
}

export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  byRole: Record<RoleKey, number>;
}

export interface UserInput {
  username: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  role: RoleKey;
  status?: 'Active' | 'Inactive';
  /** Required on create (min 8). On edit, blank keeps the current password. */
  password?: string;
}

export interface UserFilters {
  role: RoleKey;
  status: 'Active' | 'Inactive';
}

export interface RolePermissionsView {
  role: RoleKey;
  label: string;
  locked: boolean;
  permissions: PermissionSetView;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const ACTIVITY_ACTION_KEYS = [
  'Login',
  'LoginFailed',
  'Logout',
  'Create',
  'Edit',
  'Delete',
  'PermissionChange',
  'Purge',
  'Import',
  'Export',
  'Approve',
  'StatusChange',
  'Print',
  'Share',
] as const;

export interface ActivityEntryView {
  id: string;
  userId: string | null;
  userName: string | null;
  userRole: string | null;
  action: (typeof ACTIVITY_ACTION_KEYS)[number];
  entityType: string | null;
  entityId: string | null;
  details: string;
  createdAt: string;
}

export interface ActivityFeedFilters {
  userId: string;
  action: (typeof ACTIVITY_ACTION_KEYS)[number];
  entityType: string;
  from: string;
  to: string;
}
