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
