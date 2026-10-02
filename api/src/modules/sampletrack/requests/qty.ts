export interface ParsedQty {
  qtyValue: number | null;
  qtyUnit: string | null;
  qtyRaw: string | null;
}

const UNIT_ALIASES: Record<string, string> = {
  sheet: 'sheets',
  sheets: 'sheets',
  sht: 'sheets',
  shts: 'sheets',
  pc: 'pcs',
  pcs: 'pcs',
  piece: 'pcs',
  pieces: 'pcs',
  no: 'pcs',
  nos: 'pcs',
  kg: 'kg',
  kgs: 'kg',
  box: 'boxes',
  boxes: 'boxes',
  bundle: 'bundles',
  bundles: 'bundles',
};

/** Unit used when only a number is typed: samples are counted in sheets. */
export const DEFAULT_QTY_UNIT = 'sheets';

/**
 * "5 sheets" → 5 / sheets, "2.5kg" → 2.5 / kg, "10" → 10 / sheets, "10 Nos." → 10 / pcs.
 * Anything else ("a few", "5-6 sheets") keeps only the raw text. The raw text is always kept as typed (trimmed).
 */
export function parseQty(input: string | null | undefined): ParsedQty {
  const raw = input?.trim() || null;
  if (!raw) return { qtyValue: null, qtyUnit: null, qtyRaw: null };
  const m = /^(\d+(?:[.,]\d+)?)\s*([A-Za-z][A-Za-z .]*)?$/.exec(raw);
  if (!m) return { qtyValue: null, qtyUnit: null, qtyRaw: raw };
  const value = Number(m[1]!.replace(',', '.'));
  const unitText = m[2]?.trim().replace(/\.+$/, '').toLowerCase();
  const unit = unitText ? (UNIT_ALIASES[unitText] ?? unitText) : DEFAULT_QTY_UNIT;
  return { qtyValue: value, qtyUnit: unit, qtyRaw: raw };
}
