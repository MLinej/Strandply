import {
  BOARD_TYPES,
  STOCK_STATUSES,
  type BoardType,
  type ImportField,
  type ImportRowResult,
  type ProductInput,
  type StockStatus,
} from '../../../contracts/sampletrack';
import type { ParsedSheet } from '../../../lib/spreadsheet';
import type { ProductKey } from '../../../repos';
import { normName } from '../../../lib/text';

/**
 * Header aliases, matched case-insensitively after removing punctuation
 * ("Unit Price (₹)" → "unit price", "Thickness (mm)" → "thickness mm").
 * Within a field, earlier aliases win. Each header feeds at most one field.
 */
export const HEADER_ALIASES: Record<ImportField, string[]> = {
  code: ['code', 'product code', 'prod code', 'item code', 'sku'],
  name: ['name', 'product name', 'prod name', 'item name', 'product'],
  boardType: ['board type', 'board', 'type', 'category type'],
  thicknessMm: ['thickness mm', 'thickness', 'thick', 'mm'],
  size: ['size', 'dimensions', 'dimension'],
  category: ['category', 'cat'],
  unitPricePaise: ['unit price', 'price', 'rate', 'mrp', 'unit price rs', 'price rs', 'rate rs'],
  stockStatus: ['stock status', 'stock', 'availability'],
};

const FIELDS = Object.keys(HEADER_ALIASES) as ImportField[];

export const normHeader = (h: string) =>
  h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function mapColumns(headers: string[]): Record<ImportField, string | null> {
  const byNorm = new Map<string, string>();
  for (const h of headers) if (h && !byNorm.has(normHeader(h))) byNorm.set(normHeader(h), h);
  const used = new Set<string>();
  const out = {} as Record<ImportField, string | null>;
  for (const f of FIELDS) {
    out[f] = null;
    for (const alias of HEADER_ALIASES[f]) {
      const h = byNorm.get(alias);
      if (h && !used.has(h)) {
        out[f] = h;
        used.add(h);
        break;
      }
    }
  }
  return out;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const BOARD_BY_KEY = new Map<string, BoardType>(BOARD_TYPES.map((b) => [squash(b), b]));
const STOCK_BY_KEY = new Map<string, StockStatus>(STOCK_STATUSES.map((s) => [squash(s), s]));

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

type Parsed = { ok: true; product: ProductInput } | { ok: false; reason: string };

function parseRow(get: (f: ImportField) => string): Parsed {
  const name = get('name');
  const code = get('code');
  if (!code) return { ok: false, reason: 'Product code is required' };
  if (code.length > 40) return { ok: false, reason: 'Product code is longer than 40 characters' };
  if (name.length > 200) return { ok: false, reason: 'Product name is longer than 200 characters' };

  const boardRaw = get('boardType');
  const boardType = boardRaw ? BOARD_BY_KEY.get(squash(boardRaw)) : 'OSB';
  if (!boardType) return { ok: false, reason: `Unknown board type "${boardRaw}" (use ${BOARD_TYPES.join(', ')})` };

  const thickRaw = get('thicknessMm');
  let thicknessMm: number | null = null;
  if (thickRaw) {
    const m = /^(\d+(?:\.\d+)?)\s*(?:mm)?$/i.exec(thickRaw);
    if (!m || Number(m[1]) <= 0) return { ok: false, reason: `Thickness "${thickRaw}" is not a positive number of mm` };
    thicknessMm = Number(m[1]);
  }

  const priceRaw = get('unitPricePaise');
  let unitPricePaise = 0;
  if (priceRaw) {
    const cleaned = priceRaw.replace(/₹|rs\.?|inr|,|\s/gi, '');
    const n = Number(cleaned);
    if (!cleaned || !Number.isFinite(n) || n < 0) return { ok: false, reason: `Price "${priceRaw}" is not a valid amount` };
    unitPricePaise = Math.round(n * 100);
  }

  const stockRaw = get('stockStatus');
  const stockStatus = stockRaw ? STOCK_BY_KEY.get(squash(stockRaw)) : 'Available';
  if (!stockStatus) return { ok: false, reason: `Unknown stock status "${stockRaw}" (use ${STOCK_STATUSES.join(', ')})` };

  return {
    ok: true,
    product: {
      code,
      name,
      boardType,
      thicknessMm,
      size: get('size') || null,
      category: get('category') || 'Standard',
      unitPricePaise,
      stockStatus,
    },
  };
}

export interface ImportPlan {
  columns: Record<ImportField, string | null>;
  rows: ImportRowResult[];
}

/**
 * Decides what each row would do, without writing anything.
 * - empty name → skipped
 * - same name (case-insensitive) as an existing product or an earlier row → skipped
 * - invalid values, or a code already in use → error
 * - otherwise → would_add
 */
export function planImport(sheet: ParsedSheet, existing: ProductKey[]): ImportPlan {
  const columns = mapColumns(sheet.headers);
  const names = new Map(existing.map((p) => [normName(p.name), `existing product ${p.code}`]));
  const codes = new Map(existing.map((p) => [normName(p.code), `existing product "${p.name}"`]));

  const rows: ImportRowResult[] = sheet.rows.map(({ row, cells }) => {
    const get = (f: ImportField) => (columns[f] ? text(cells[columns[f]!]) : '');
    if (Object.values(cells).every((v) => text(v) === '')) return { row, status: 'skipped', reason: 'Empty row' };
    const name = get('name');
    if (!name) return { row, status: 'skipped', reason: 'Empty product name' };
    const dupName = names.get(normName(name));
    if (dupName) return { row, status: 'skipped', reason: `Duplicate name (same as ${dupName})` };

    const parsed = parseRow(get);
    if (!parsed.ok) return { row, status: 'error', reason: parsed.reason };
    const dupCode = codes.get(normName(parsed.product.code));
    if (dupCode) return { row, status: 'error', reason: `Code ${parsed.product.code} is already used by ${dupCode}`, product: parsed.product };

    names.set(normName(name), `row ${row}`);
    codes.set(normName(parsed.product.code), `row ${row}`);
    return { row, status: 'would_add', product: parsed.product };
  });
  return { columns, rows };
}
