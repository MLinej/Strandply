// One-time upgrades for memory-backend data saved before a feature existed (the dev.json snapshot).
// Each one mirrors what a numbered migration does to an existing D1 database, and runs once:
// its name is recorded in the `upgrades` table. A fresh seed lists every upgrade as applied.
import { ACTION_KEYS, PAGE_KEYS, type PermissionSet } from '../domain/access';
import type { MemoryData } from '../repos/memory';
import { REF_CITY_PINCODES } from './reference';

export interface Upgrade {
  name: string;
  /** Mutates `data` in place. `seed` supplies any rows the upgrade adds. */
  apply(data: Partial<MemoryData>, seed: MemoryData): void;
}

const VENDOR_PAGES = ['vendors', 'vendor_reports', 'vendor_masters', 'vendor_settings'] as const;

export const UPGRADES: Upgrade[] = [
  {
    // Same as db/migrations/0005_vendors.sql on an existing database.
    name: '0005_vendors',
    apply(data, seed) {
      // Admin gets the whole Vendors module; Management can view vendors and reports (the new defaults).
      for (const row of data.rolePermissions ?? []) {
        const p = row.permissions as PermissionSet;
        const add = (pages: readonly string[], actions: readonly string[] = []) => {
          p.pages = PAGE_KEYS.filter((k) => p.pages.includes(k) || pages.includes(k));
          p.actions = ACTION_KEYS.filter((k) => p.actions.includes(k) || actions.includes(k));
        };
        if (row.role === 'superadmin' || row.role === 'admin') add(VENDOR_PAGES, ['vendor_approve']);
        if (row.role === 'management') add(['vendors', 'vendor_reports']);
      }
      // Cities gain pincodes, and Valsad joins the built-in list.
      const cities = data.cities ?? [];
      for (const c of cities) c.pincodes ??= REF_CITY_PINCODES[c.id] ?? [];
      const valsad = seed.cities.find((c) => c.id === 'city-valsad');
      if (valsad && !cities.some((c) => c.id === valsad.id)) cities.push(structuredClone(valsad));
      data.cities = cities;
      // New settings keys and the product-code counter; the new tables come from the seed.
      const keys = new Set((data.settings ?? []).map((s) => s.key));
      data.settings = [...(data.settings ?? []), ...seed.settings.filter((s) => !keys.has(s.key))];
      const counters = new Set((data.counters ?? []).map((c) => c.name));
      data.counters = [...(data.counters ?? []), ...seed.counters.filter((c) => !counters.has(c.name))];
    },
  },
];

/** Appends page and action keys to roles' saved permissions (keeps any custom changes). */
function grant(data: Partial<MemoryData>, roles: string[], pages: readonly string[], actions: readonly string[] = []) {
  for (const row of data.rolePermissions ?? []) {
    if (!roles.includes(row.role)) continue;
    const p = row.permissions as PermissionSet;
    p.pages = PAGE_KEYS.filter((k) => p.pages.includes(k) || pages.includes(k));
    p.actions = ACTION_KEYS.filter((k) => p.actions.includes(k) || actions.includes(k));
  }
}

const PURCHASE_PAGES = ['purchase_dashboard', 'purchase_entries', 'purchase_orders', 'purchase_notes', 'purchase_inventory'] as const;

UPGRADES.push({
  // Same as db/migrations/0006_purchase.sql on an existing database. The new tables come from the seed.
  name: '0006_purchase',
  apply(data, seed) {
    grant(data, ['superadmin', 'admin'], PURCHASE_PAGES, ['purchase_approve']);
    grant(data, ['management'], ['purchase_dashboard', 'purchase_inventory']);
    // PO clauses join the shared T&C master.
    const have = new Set((data.vnTnc ?? []).map((t) => t.id));
    if (data.vnTnc) data.vnTnc.push(...seed.vnTnc.filter((t) => t.id.startsWith('tnc-po-') && !have.has(t.id)));
    // A snapshot written by a half-built version can hold these tables empty; nothing real lives in
    // them before this upgrade, so take the seed's (type masters, plus the demo register in dev).
    for (const t of ['puTypes', 'puEntries', 'puOrders'] as const) if (!data[t]?.length) (data as Record<string, unknown>)[t] = structuredClone(seed[t]);
  },
});

const STORES_PAGES = ['stores_dashboard', 'stores_gate', 'stores_grn', 'stores_accounting', 'stores_reports', 'stores_settings'] as const;

UPGRADES.push({
  // Same as db/migrations/0007_stores.sql on an existing database. The new tables come from the seed.
  name: '0007_stores',
  apply(data, seed) {
    grant(data, ['superadmin', 'admin'], STORES_PAGES, ['stores_review', 'stores_approve', 'stores_account']);
    grant(data, ['management'], ['stores_dashboard', 'stores_reports']);
    const keys = new Set((data.settings ?? []).map((s) => s.key));
    if (data.settings) data.settings.push(...seed.settings.filter((s) => s.key.startsWith('stores.') && !keys.has(s.key)));
  },
});

const STOCK_PAGES = ['stock_dashboard', 'stock_slips', 'stock_ledger', 'stock_reclass', 'stock_masters'] as const;

UPGRADES.push({
  // Same as db/migrations/0008_stock.sql on an existing database. The new tables come from the seed.
  name: '0008_stock',
  apply(data, seed) {
    grant(data, ['superadmin', 'admin'], STOCK_PAGES);
    grant(data, ['management'], ['stock_dashboard', 'stock_ledger']);
    // The item master is reference data: take the seed's if the snapshot has none.
    if (!data.skGroups?.length) data.skGroups = structuredClone(seed.skGroups);
  },
});

/** Applies the upgrades `data` hasn't had yet. An old snapshot has no `upgrades` table, so all of them run. */
export function upgradeSnapshot(data: Partial<MemoryData>, seed: MemoryData, at: string): Partial<MemoryData> {
  const done = new Set((data.upgrades ?? []).map((u) => u.name));
  const applied = [...(data.upgrades ?? [])];
  for (const u of UPGRADES) {
    if (done.has(u.name)) continue;
    u.apply(data, seed);
    applied.push({ name: u.name, appliedAt: at });
  }
  return { ...data, upgrades: applied };
}
