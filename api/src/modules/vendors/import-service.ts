// Bulk import for the Vendors module (legacy openImport / confirmImportData), from .xlsx/.xls/.csv.
// Like the legacy importer, rows whose name already exists are skipped, never overwritten.
// A preview writes nothing; a commit re-plans inside one unit of work and adds every valid row together.
import type { z } from 'zod';
import {
  CATEGORY_COLORS,
  PRODUCT_UNITS,
  VENDOR_STATUSES,
  type VendorImportKind,
  type VendorImportReport,
  type VendorImportRow,
  type VendorStatus,
} from '../../contracts/vendors';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { readFirstSheet, writeXlsx, type ParsedSheet } from '../../lib/spreadsheet';
import { normName } from '../../lib/text';
import type { DataLayer, Repos } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { normHeader } from '../sampletrack/masters/product-import';
import { pincodeList } from '../sampletrack/masters/validation';
import { nextCode, productCode, vendorCode } from './masters';
import { categoryCreateBody, productCreateBody, vendorCreateBody } from './validation';

type Fields = Record<string, string[]>;

/** Header aliases per kind, matched after normHeader ("GST %" → "gst"). Earlier aliases win. */
export const IMPORT_FIELDS: Record<VendorImportKind, Fields> = {
  vendors: {
    name: ['name', 'vendor name', 'vendor', 'supplier', 'supplier name'],
    code: ['code', 'vendor code'],
    type: ['type', 'vendor type'],
    categories: ['categories', 'category'],
    contact: ['contact', 'contact person'],
    phone: ['phone', 'mobile', 'contact no'],
    email: ['email', 'e mail'],
    city: ['city'],
    state: ['state'],
    pincode: ['pincode', 'pin', 'pin code'],
    gst: ['gstin', 'gst', 'gst no'],
    pan: ['pan'],
    paymentTerms: ['payment terms', 'terms'],
    status: ['status'],
    rating: ['rating'],
    products: ['products', 'products supplied'],
    notes: ['notes', 'remarks'],
  },
  products: {
    name: ['name', 'product name', 'product', 'item', 'item name'],
    category: ['category'],
    unit: ['unit', 'uom'],
    altUnit: ['alt unit'],
    convFactor: ['conv factor', 'conversion factor'],
    hsn: ['hsn', 'hsn code', 'sac'],
    gstRate: ['gst', 'gst rate', 'gst%'],
    moq: ['moq', 'min order qty'],
    leadTimeDays: ['lead days', 'lead time', 'lead time days'],
    description: ['description', 'specs'],
  },
  categories: {
    name: ['name', 'category', 'category name'],
    icon: ['icon'],
    color: ['color', 'colour'],
    description: ['description'],
    sortOrder: ['sort order', 'order'],
    status: ['status'],
  },
  cities: {
    city: ['city', 'city name'],
    state: ['state'],
    pincodes: ['pincodes', 'pincode', 'pin codes'],
  },
};

function mapColumns(headers: string[], fields: Fields): Record<string, string | null> {
  const byNorm = new Map<string, string>();
  for (const h of headers) if (h && !byNorm.has(normHeader(h))) byNorm.set(normHeader(h), h);
  const used = new Set<string>();
  const out: Record<string, string | null> = {};
  for (const [f, aliases] of Object.entries(fields)) {
    out[f] = null;
    for (const a of aliases) {
      const h = byNorm.get(normHeader(a));
      if (h && !used.has(h)) {
        out[f] = h;
        used.add(h);
        break;
      }
    }
  }
  return out;
}

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const list = (s: string) => s.split(/[|;,]/).map((x) => x.trim()).filter(Boolean);
const firstIssue = (e: z.ZodError) => {
  const i = e.issues[0]!;
  return `${i.path.length ? `${i.path.join('.')}: ` : ''}${i.message}`;
};

/** Legacy colour classes c1…c12 → names, so an export from the old portal imports cleanly. */
const legacyColor = (raw: string) => {
  const m = /^c(\d{1,2})$/i.exec(raw);
  return m ? (CATEGORY_COLORS[Number(m[1]) - 1] ?? 'grey') : raw.toLowerCase();
};

/** Header row + one example row for each kind's blank import file. */
const TEMPLATES: Record<VendorImportKind, Record<string, string>> = {
  vendors: {
    Name: 'Shree Ram Timber', Code: '', Type: 'Trader', Categories: 'Raw Material', Contact: 'Ramesh Patel', Phone: '9876543210',
    Email: 'ramesh@example.com', City: 'Morbi', State: 'Gujarat', Pincode: '363641', GSTIN: '', PAN: '',
    'Payment Terms': '30 Days', Status: 'pending', Rating: '4', Products: 'Dry Strands | Core Veneer', Notes: '',
  },
  products: {
    Name: 'Phenolic Film', Category: 'Packaging', Unit: 'Roll', 'Alt Unit': '', 'Conv Factor': '', HSN: '3920',
    'GST%': '18', MOQ: '10', 'Lead Days': '7', Description: '',
  },
  categories: { Name: 'Electrical', Icon: '⚡', Color: 'amber', Description: 'Motors, cables, panels', 'Sort Order': '', Status: 'active' },
  cities: { City: 'Tankara', State: 'Gujarat', Pincodes: '363650 | 363651' },
};

export function importTemplate(kind: VendorImportKind): Uint8Array {
  const example = TEMPLATES[kind];
  return writeXlsx([
    { name: kind[0]!.toUpperCase() + kind.slice(1), rows: [example], columns: Object.keys(example).map((h) => ({ header: h, value: (r: Record<string, string>) => r[h] })) },
  ]);
}

type Planned = VendorImportRow & { apply?: (tx: Repos, at: string, actor: Actor) => Promise<void> };

export class VendorImportService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  async run(actor: Actor, kind: VendorImportKind, bytes: Uint8Array, opts: { commit: boolean; fileName: string }): Promise<VendorImportReport> {
    const sheet = readFirstSheet(bytes);
    const columns = mapColumns(sheet.headers, IMPORT_FIELDS[kind]);
    const report = (rows: VendorImportRow[], mode: VendorImportReport['mode']): VendorImportReport => {
      const n = (s: VendorImportRow['status']) => rows.filter((r) => r.status === s).length;
      return {
        kind,
        mode,
        columns,
        totals: { rows: rows.length, added: n(mode === 'commit' ? 'added' : 'would_add'), skipped: n('skipped'), errors: n('error') },
        rows: rows.map(({ row, status, label, reason }) => ({ row, status, label, ...(reason ? { reason } : {}) })),
      };
    };

    if (!opts.commit) return report(await this.plan(this.data.repos, kind, sheet, columns), 'preview');

    return this.data.uow.run(async (tx) => {
      const rows = await this.plan(tx, kind, sheet, columns);
      const at = isoNow(this.clock);
      for (const r of rows) {
        if (r.status !== 'would_add' || !r.apply) continue;
        await r.apply(tx, at, actor);
        r.status = 'added';
      }
      const result = report(rows, 'commit');
      await this.activity.record(tx, actor, {
        action: 'Import',
        entityType: `vendor_${kind}`,
        details: `Imported ${result.totals.added} ${kind} from ${opts.fileName} (${result.totals.skipped} skipped, ${result.totals.errors} errors)`,
      });
      return result;
    });
  }

  private async plan(tx: Repos, kind: VendorImportKind, sheet: ParsedSheet, columns: Record<string, string | null>): Promise<Planned[]> {
    const get = (cells: Record<string, unknown>) => (f: string) => (columns[f] ? text(cells[columns[f]!]) : '');
    const blankRow = (cells: Record<string, unknown>) => Object.values(cells).every((v) => text(v) === '');
    const out: Planned[] = [];
    const seen = new Set<string>();
    const planRow = kind === 'vendors' ? await this.vendorPlanner(tx) : kind === 'products' ? await this.productPlanner(tx) : kind === 'categories' ? await this.categoryPlanner(tx) : await this.cityPlanner(tx);
    for (const { row, cells } of sheet.rows) {
      if (blankRow(cells)) continue;
      const p = planRow(get(cells));
      // Two rows with the same name in one file: only the first is added.
      if (p.status === 'would_add' && p.key) {
        if (seen.has(p.key)) {
          out.push({ row, status: 'skipped', label: p.label, reason: 'Repeated earlier in this file' });
          continue;
        }
        seen.add(p.key);
      }
      out.push({ row, status: p.status, label: p.label, reason: p.reason, apply: p.apply });
    }
    return out;
  }

  private async vendorPlanner(tx: Repos) {
    const [existing, cats, products] = await Promise.all([tx.vendors.listAll(), tx.vendorCategories.listAll(), tx.vendorProducts.listAll()]);
    const names = new Set(existing.map((v) => normName(v.name)));
    const codes = new Set(existing.map((v) => v.code.toUpperCase()));
    const catByName = new Map(cats.map((c) => [normName(c.name), c.id]));
    const productByName = new Map(products.map((p) => [normName(p.name), p.id]));
    return (get: (f: string) => string): PlannedRow => {
      const name = get('name');
      if (!name) return { status: 'error', label: '(no name)', reason: 'Vendor name is required' };
      if (names.has(normName(name))) return { status: 'skipped', label: name, reason: 'A vendor with this name already exists' };
      const catNames = list(get('categories'));
      const unknownCats = catNames.filter((c) => !catByName.has(normName(c)));
      if (unknownCats.length) return { status: 'error', label: name, reason: `Unknown categor${unknownCats.length === 1 ? 'y' : 'ies'}: ${unknownCats.join(', ')}` };
      const prodNames = list(get('products'));
      const unknownProducts = prodNames.filter((p) => !productByName.has(normName(p)));
      if (unknownProducts.length) return { status: 'error', label: name, reason: `Unknown product${unknownProducts.length === 1 ? '' : 's'}: ${unknownProducts.join(', ')}` };
      const statusRaw = get('status').toLowerCase();
      const status: VendorStatus = (VENDOR_STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as VendorStatus) : 'pending';
      const code = get('code').toUpperCase();
      if (code && codes.has(code)) return { status: 'error', label: name, reason: `Code ${code} is already used` };
      const parsed = vendorCreateBody.safeParse({
        name,
        code: code || null,
        type: get('type') || null,
        categoryIds: catNames.map((c) => catByName.get(normName(c))!),
        productIds: prodNames.map((p) => productByName.get(normName(p))!),
        contact: get('contact'),
        phone: get('phone'),
        email: get('email'),
        city: get('city'),
        state: get('state'),
        pincode: get('pincode'),
        gst: get('gst'),
        pan: get('pan'),
        paymentTerms: get('paymentTerms') || null,
        rating: get('rating') || null,
        notes: get('notes'),
      });
      if (!parsed.success) return { status: 'error', label: name, reason: firstIssue(parsed.error) };
      const v = parsed.data;
      if (code) codes.add(code);
      return {
        status: 'would_add',
        label: name,
        key: normName(name),
        apply: async (t, at, actor) => {
          const finalCode = v.code ?? (await nextCode(t, this.clock, 'VEN', vendorCode, async (c) => (await t.vendors.listAll()).some((x) => x.code === c)));
          await t.vendors.create({
            id: newId(),
            code: finalCode,
            name: v.name,
            type: v.type ?? null,
            yearEstablished: null,
            categoryIds: [...new Set(v.categoryIds)],
            productIds: [...new Set(v.productIds ?? [])],
            contact: v.contact ?? null,
            designation: null,
            phone: v.phone ?? null,
            email: v.email ?? null,
            address: null,
            pincode: v.pincode ?? null,
            city: v.city ?? null,
            state: v.state ?? null,
            website: null,
            gst: v.gst ?? null,
            pan: v.pan ?? null,
            msme: null,
            paymentTerms: v.paymentTerms ?? null,
            bank: null,
            accountNo: null,
            ifsc: null,
            rating: v.rating ?? null,
            notes: v.notes ?? null,
            status,
            submittedAt: status === 'pending' ? at : null,
            approvedAt: null,
            approvedBy: null,
            activatedAt: null,
            activatedBy: null,
            blacklistReason: status === 'blacklisted' ? 'Imported as blacklisted' : null,
            blacklistedAt: status === 'blacklisted' ? at : null,
            blacklistedBy: null,
            createdBy: actor.id,
            createdAt: at,
            updatedAt: at,
          });
        },
      };
    };
  }

  private async productPlanner(tx: Repos) {
    const [existing, cats] = await Promise.all([tx.vendorProducts.listAll(), tx.vendorCategories.listAll()]);
    const names = new Set(existing.map((p) => normName(p.name)));
    const catByName = new Map(cats.map((c) => [normName(c.name), c.id]));
    const unitByKey = new Map(PRODUCT_UNITS.map((u) => [u.toLowerCase(), u]));
    return (get: (f: string) => string): PlannedRow => {
      const name = get('name');
      if (!name) return { status: 'error', label: '(no name)', reason: 'Product name is required' };
      if (names.has(normName(name))) return { status: 'skipped', label: name, reason: 'A product with this name already exists' };
      const cat = get('category');
      if (!cat) return { status: 'error', label: name, reason: 'Category is required' };
      const categoryId = catByName.get(normName(cat));
      if (!categoryId) return { status: 'error', label: name, reason: `Unknown category "${cat}"` };
      const unitRaw = get('unit');
      const unit = unitByKey.get(unitRaw.toLowerCase());
      if (!unit) return { status: 'error', label: name, reason: unitRaw ? `Unknown unit "${unitRaw}"` : 'Unit is required' };
      const parsed = productCreateBody.safeParse({
        name,
        categoryId,
        unit,
        altUnit: get('altUnit'),
        convFactor: get('convFactor') || null,
        hsn: get('hsn') || null,
        gstRate: get('gstRate').replace('%', '') || null,
        moq: get('moq') || null,
        leadTimeDays: get('leadTimeDays') || null,
        description: get('description'),
      });
      if (!parsed.success) return { status: 'error', label: name, reason: firstIssue(parsed.error) };
      const p = parsed.data;
      return {
        status: 'would_add',
        label: name,
        key: normName(name),
        apply: async (t, at, actor) => {
          const code = await nextCode(t, this.clock, 'VP', productCode, async (c) => (await t.vendorProducts.listAll()).some((x) => x.code === c));
          await t.vendorProducts.create({
            id: newId(),
            code,
            name: p.name,
            categoryId: p.categoryId,
            unit: p.unit,
            altUnit: p.altUnit ?? null,
            convFactor: p.convFactor ?? null,
            hsn: p.hsn ?? null,
            gstRate: p.gstRate ?? null,
            moq: p.moq ?? null,
            leadTimeDays: p.leadTimeDays ?? null,
            description: p.description ?? null,
            notes: null,
            createdBy: actor.id,
            createdAt: at,
            updatedAt: at,
          });
        },
      };
    };
  }

  private async categoryPlanner(tx: Repos) {
    const existing = await tx.vendorCategories.listAll();
    const names = new Set(existing.map((c) => normName(c.name)));
    let nextOrder = existing.reduce((m, c) => Math.max(m, c.sortOrder), 0);
    return (get: (f: string) => string): PlannedRow => {
      const name = get('name');
      if (!name) return { status: 'error', label: '(no name)', reason: 'Category name is required' };
      if (names.has(normName(name))) return { status: 'skipped', label: name, reason: 'A category with this name already exists' };
      const parsed = categoryCreateBody.safeParse({
        name,
        icon: get('icon') || null,
        color: get('color') ? legacyColor(get('color')) : undefined,
        description: get('description'),
        sortOrder: get('sortOrder') || undefined,
        status: get('status') ? get('status').toLowerCase() : undefined,
      });
      if (!parsed.success) return { status: 'error', label: name, reason: firstIssue(parsed.error) };
      const c = parsed.data;
      const sortOrder = c.sortOrder ?? ++nextOrder;
      return {
        status: 'would_add',
        label: name,
        key: normName(name),
        apply: async (t, at, actor) => {
          await t.vendorCategories.create({
            id: newId(),
            name: c.name,
            icon: c.icon ?? null,
            color: c.color ?? 'grey',
            description: c.description ?? null,
            sortOrder,
            status: c.status ?? 'active',
            notes: null,
            createdBy: actor.id,
            createdAt: at,
            updatedAt: at,
          });
        },
      };
    };
  }

  private async cityPlanner(tx: Repos) {
    const [cities, states] = await Promise.all([tx.cities.listAll(), tx.states.listAll()]);
    const stateByName = new Map(states.map((s) => [normName(s.name), s]));
    const existing = new Set(cities.map((c) => `${normName(c.city)}|${c.stateId}`));
    const pinOwner = new Map(cities.flatMap((c) => c.pincodes.map((p) => [p, c.city] as const)));
    return (get: (f: string) => string): PlannedRow => {
      const city = get('city');
      const stateRaw = get('state');
      const label = [city, stateRaw].filter(Boolean).join(', ') || '(blank)';
      if (!city || !stateRaw) return { status: 'error', label, reason: 'City and state are both required' };
      const state = stateByName.get(normName(stateRaw));
      if (!state) return { status: 'error', label, reason: `Unknown state "${stateRaw}"` };
      const key = `${normName(city)}|${state.id}`;
      if (existing.has(key)) return { status: 'skipped', label, reason: 'Already in the city master' };
      const pins = pincodeList.safeParse(get('pincodes'));
      if (!pins.success) return { status: 'error', label, reason: firstIssue(pins.error) };
      const taken = pins.data.find((p) => pinOwner.has(p));
      if (taken) return { status: 'error', label, reason: `Pincode ${taken} already belongs to ${pinOwner.get(taken)}` };
      for (const p of pins.data) pinOwner.set(p, city);
      return {
        status: 'would_add',
        label,
        key,
        apply: async (t, at, actor) => {
          await t.cities.create({
            id: newId(),
            city: city.replace(/\s+/g, ' '),
            stateId: state.id,
            isCustom: true,
            pincodes: pins.data,
            createdBy: actor.id,
            createdAt: at,
            updatedAt: at,
          });
        },
      };
    };
  }
}

interface PlannedRow {
  status: VendorImportRow['status'];
  label: string;
  reason?: string;
  /** Duplicate-in-file key. */
  key?: string;
  apply?: (tx: Repos, at: string, actor: Actor) => Promise<void>;
}
