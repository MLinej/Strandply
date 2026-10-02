import type { MemoryData } from '../repos/memory';
import { DEMO_COURIERS, DEMO_DISPATCH_HISTORY, DEMO_DISPATCHES, DEMO_PARTIES, DEMO_REQUEST_ITEMS, DEMO_REQUESTS } from './demo.dev';
import { REF_CITIES, REF_CITY_PINCODES, REF_PRODUCTS, REF_STATES } from './reference';
import { defaultRolePermissionRows } from './role-permissions';
import { DEFAULT_SETTINGS } from './settings';
import { UPGRADES } from './upgrades';
import { DEV_USERS } from './users.dev';
import {
  DEFAULT_VENDOR_SETTINGS,
  DEMO_VENDORS,
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
    ],
    notifications: [],
    dispatchHistory: dev(DEMO_DISPATCH_HISTORY),
    settings: Object.entries({ ...DEFAULT_SETTINGS, ...DEFAULT_VENDOR_SETTINGS }).map(([key, value]) => ({ key, value, ...audit })),
    notificationReads: [],
    vnCategories: REF_VENDOR_CATEGORIES.map((c) => ({ ...c, ...audit })),
    vnProducts: REF_VENDOR_PRODUCTS.map((p) => ({ ...p, ...audit })),
    vendors: dev(DEMO_VENDORS),
    vnTnc: REF_TNC.map((t) => ({ ...t, ...audit })),
    // A fresh seed already has everything the upgrades add.
    upgrades: UPGRADES.map((u) => ({ name: u.name, appliedAt: at })),
  };
}
