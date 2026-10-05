import type { MemoryData } from '../repos/memory';
import { DEMO_COURIERS, DEMO_DISPATCH_HISTORY, DEMO_DISPATCHES, DEMO_PARTIES, DEMO_REQUEST_ITEMS, DEMO_REQUESTS } from './demo.dev';
import { REF_CITIES, REF_CITY_PINCODES, REF_PRODUCTS, REF_STATES } from './reference';
import { defaultRolePermissionRows } from './role-permissions';
import { DEFAULT_SETTINGS } from './settings';
import { DEMO_PURCHASE_ENTRIES, DEMO_PURCHASE_ORDERS } from './purchase-demo.dev';
import { REF_PURCHASE_TYPES } from './purchase';
import { DEFAULT_STORES_SETTINGS } from './stores';
import { REF_SKU_GROUPS } from './stock';
import { DEFAULT_PRODUCTION_SETTINGS } from './production';
import { DEFAULT_SALES_SETTINGS } from './sales';
import { REF_SALES_ITEMS } from './sales-items';
import { DEMO_CUSTOMERS, DEMO_INTERCOMPANY, DEMO_SALES_COUNTERS, DEMO_SALES_INVOICES, DEMO_SALES_ORDERS, DEMO_SALES_PERSONS } from './sales-demo.dev';
import { DEFAULT_CRM_SETTINGS, REF_CRM_PRODUCTS, REF_SALESPERSONS } from './crm';
import { DEMO_CAMPAIGNS, DEMO_CRM_COUNTERS, DEMO_CRM_CUSTOMERS, DEMO_FOLLOWUPS, DEMO_LEADS, DEMO_LOST, DEMO_OPPORTUNITIES, DEMO_QUOTATIONS, DEMO_TASKS, DEMO_WON } from './crm-demo.dev';
import { DEMO_TRANSPORTERS, REF_VEHICLE_TYPES } from './transport';
import { DEMO_WORK_ORDERS, REF_MT_AREAS } from './maintenance';
import { DEMO_BILLS, DEMO_READINGS, REF_EL_RATES } from './electricity';
import { DEMO_COMPLAINTS, REF_CP_RECIPIENTS } from './complaints';
import { DEMO_PLANS, REF_DW_DEPARTMENTS, REF_DW_EMPLOYEES } from './dwpas';
import { DEFAULT_ELECTRICITY_SETTINGS } from '../contracts/electricity';
import { UPGRADES } from './upgrades';
import { DEV_USERS } from './users.dev';
import {
  DEFAULT_VENDOR_SETTINGS,
  DEMO_VENDORS,
  REF_PO_TNC,
  REF_TNC,
  REF_VENDOR_CATEGORIES,
  REF_VENDOR_PRODUCTS,
  VENDOR_PRODUCT_COUNTER,
} from './vendors';

export interface SeedOptions {
  /** Adds the DEV ONLY logins (users.dev.ts) and demo data (demo.dev.ts). Must be false in production. */
  devUsers: boolean;
  at?: string;
}

/** Initial data for the memory backend. Same reference data as migrations 0003/0004, plus dev data when asked. */
export function buildSeed({ devUsers, at = new Date().toISOString() }: SeedOptions): MemoryData {
  const audit = { createdBy: null, createdAt: at, updatedAt: at, deletedAt: null };
  const dev = <T>(rows: T[]) => (devUsers ? structuredClone(rows) : []);
  /** Dev rows stored without audit columns. */
  const devAudit = <T>(rows: T[]) => (devUsers ? rows.map((r) => ({ ...structuredClone(r), ...audit })) : []);
  return {
    users: dev(DEV_USERS),
    sessions: [],
    rolePermissions: defaultRolePermissionRows(at),
    activity: [],
    states: structuredClone(REF_STATES),
    cities: REF_CITIES.map((c) => ({ ...c, pincodes: REF_CITY_PINCODES[c.id] ?? [], ...audit })),
    products: REF_PRODUCTS.map((p) => ({ ...p, ...audit })),
    parties: dev(DEMO_PARTIES),
    couriers: dev(DEMO_COURIERS),
    requests: dev(DEMO_REQUESTS),
    requestItems: dev(DEMO_REQUEST_ITEMS),
    dispatches: dev(DEMO_DISPATCHES),
    // Same as the st_counters seed (0003). The dev demo data already uses REQ-0001..5 and DSP-0001..3.
    counters: [
      { name: 'REQ', lastValue: devUsers ? DEMO_REQUESTS.length : 0, ...audit },
      { name: 'DSP', lastValue: devUsers ? DEMO_DISPATCHES.length : 0, ...audit },
      { ...VENDOR_PRODUCT_COUNTER, ...audit },
      ...devAudit(DEMO_SALES_COUNTERS),
      ...devAudit(DEMO_CRM_COUNTERS),
      ...devAudit([{ name: 'TR-TRP', lastValue: DEMO_TRANSPORTERS.length }]),
      ...devAudit([{ name: 'MT-WO-2026-27', lastValue: DEMO_WORK_ORDERS.length }]),
      ...devAudit([{ name: 'CP-2026-27', lastValue: DEMO_COMPLAINTS.length }]),
    ],
    notifications: [],
    dispatchHistory: dev(DEMO_DISPATCH_HISTORY),
    settings: Object.entries({ ...DEFAULT_SETTINGS, ...DEFAULT_VENDOR_SETTINGS, ...DEFAULT_STORES_SETTINGS, ...DEFAULT_PRODUCTION_SETTINGS, ...DEFAULT_SALES_SETTINGS, ...DEFAULT_CRM_SETTINGS, ...DEFAULT_ELECTRICITY_SETTINGS, ...(devUsers ? { 'sales.sales_persons': DEMO_SALES_PERSONS } : {}) }).map(([key, value]) => ({ key, value, ...audit })),
    notificationReads: [],
    vnCategories: REF_VENDOR_CATEGORIES.map((c) => ({ ...c, ...audit })),
    vnProducts: REF_VENDOR_PRODUCTS.map((p) => ({ ...p, ...audit })),
    vendors: dev(DEMO_VENDORS),
    vnTnc: [...REF_TNC, ...REF_PO_TNC].map((t) => ({ ...t, ...audit })),
    puTypes: REF_PURCHASE_TYPES.map((t) => ({ ...t, ...audit })),
    puEntries: dev(DEMO_PURCHASE_ENTRIES),
    puOrders: dev(DEMO_PURCHASE_ORDERS),
    puReturns: [],
    puOpening: [],
    puConsumption: [],
    puDocuments: [],
    stoMrns: [],
    stoGrns: [],
    skGroups: REF_SKU_GROUPS.map((g) => ({ ...structuredClone(g), ...audit })),
    skSlips: [],
    skOpening: [],
    skReclass: [],
    prPlans: [],
    prHotpress: [],
    prChipping: [],
    prResin: [],
    prCutting: [],
    prSummary: [],
    prMdo: [],
    prMatt: [],
    prWip: [],
    prWipAdj: [],
    slCustomers: devAudit(DEMO_CUSTOMERS),
    slItems: REF_SALES_ITEMS.map((i) => ({ ...i, ...audit })),
    slPrices: [],
    slWeights: [],
    slProformas: [],
    slOrders: devAudit(DEMO_SALES_ORDERS),
    slInvoices: devAudit(DEMO_SALES_INVOICES),
    slFgStock: [],
    slIntercompany: devAudit(DEMO_INTERCOMPANY),
    crmLeads: devAudit(DEMO_LEADS),
    crmCustomers: devAudit(DEMO_CRM_CUSTOMERS),
    crmFollowups: devAudit(DEMO_FOLLOWUPS),
    crmOpportunities: devAudit(DEMO_OPPORTUNITIES),
    crmQuotations: devAudit(DEMO_QUOTATIONS),
    crmWon: devAudit(DEMO_WON),
    crmLost: devAudit(DEMO_LOST),
    crmTasks: devAudit(DEMO_TASKS),
    crmCampaigns: devAudit(DEMO_CAMPAIGNS),
    crmProducts: REF_CRM_PRODUCTS.map((p) => ({ ...p, ...audit })),
    crmSalespersons: REF_SALESPERSONS.map((p) => ({ ...p, ...audit })),
    trVehicles: REF_VEHICLE_TYPES.map((v) => ({ ...v, ...audit })),
    trTransporters: devAudit(DEMO_TRANSPORTERS),
    trInquiries: [],
    trRateCmps: [],
    trOrders: [],
    mtAreas: REF_MT_AREAS.map((a) => ({ ...a, ...audit })),
    // Demo work orders keep their own raised times (the timeline and reports depend on them).
    mtWorkOrders: devUsers ? DEMO_WORK_ORDERS.map((w) => ({ ...audit, ...structuredClone(w), updatedAt: w.createdAt })) : [],
    elRates: REF_EL_RATES.map((r) => ({ ...r, ...audit })),
    elReadings: devAudit(DEMO_READINGS),
    elBills: devAudit(DEMO_BILLS),
    cpRecipients: REF_CP_RECIPIENTS.map((r) => ({ ...r, ...audit })),
    complaints: devUsers ? DEMO_COMPLAINTS.map((c) => ({ ...audit, ...structuredClone(c), updatedAt: c.createdAt })) : [],
    dwDepartments: REF_DW_DEPARTMENTS.map((d) => ({ ...d, ...audit })),
    dwEmployees: REF_DW_EMPLOYEES.map((e) => ({ ...e, ...audit })),
    dwPlans: devAudit(DEMO_PLANS),
    // A fresh seed already has everything the upgrades add.
    upgrades: UPGRADES.map((u) => ({ name: u.name, appliedAt: at })),
  };
}
