// Stock module (legacy "Stock Management", SKU Master v8): the item (SKU group) master, opening stock,
// stock issue / receipt slips (SIS / SRS), reclassification (STR), ledgers and live stock.
// Every movement is a MINUS leg on one SKU and/or a PLUS leg on another; stock is the sum of the legs.
// See docs/stock-spec.md.
import type { CompanyBlock } from './sampletrack';

/** Product families. Raw material is RM. */
export const FAMILIES = [
  { id: 'OB', label: 'OSB' },
  { id: 'OC', label: 'OSB-CAL' },
  { id: 'SO', label: 'S-OSB' },
  { id: 'SC', label: 'S-OSB-CAL' },
  { id: 'MD', label: 'MDO' },
  { id: 'HY', label: 'HYB' },
  { id: 'RC', label: 'RCOSB' },
  { id: 'RM', label: 'Raw Material' },
] as const;
export type Family = (typeof FAMILIES)[number]['id'];
export const FAMILY_IDS = FAMILIES.map((f) => f.id) as [Family, ...Family[]];
export const familyLabel = (id: string) => FAMILIES.find((f) => f.id === id)?.label ?? id;

/** Departments / stock locations, in process order (legacy MASTER_DEPTS). */
export const DEPARTMENTS = [
  'Raw Material Store',
  'WIP Consumables – Hot Press',
  'WIP Consumables – MDO Press',
  'Hot Press Dept (WIP)',
  'Stock (PLAIN)',
  'Stock (PLAIN-UNG)',
  'Stock (PLAIN-FG)',
  'Calibration Dept (WIP)',
  'Stock (CALIB)',
  'Grading Dept (WIP)',
  'Stock (GRA)',
  'MDO Press Dept (WIP)',
  'Stock (MDO)',
  'MDO Grading Dept (WIP)',
  'Stock (MDO-GRA)',
  'RC Coating Dept (WIP)',
  'Stock (RCOSB)',
  'Hybrid Press Dept (WIP)',
  'Stock (HYB)',
  'Stock (HYB-GRA)',
  'Cutting Dept (WIP)',
  'Stock (CUT)',
  'Finishing Dept (WIP)',
  'Stock (FG)',
  'Stock (REJ)',
  'Scrap Yard',
] as const;
export type Department = (typeof DEPARTMENTS)[number];

/** Dashboard stages (legacy SUMMARY_GROUPS). `alert` stages are flagged when they hold stock. */
export const STAGES: { label: string; depts: Department[]; alert?: boolean }[] = [
  { label: 'Raw material', depts: ['Raw Material Store', 'WIP Consumables – Hot Press', 'WIP Consumables – MDO Press'] },
  { label: 'Hot press WIP', depts: ['Hot Press Dept (WIP)'] },
  { label: 'Plain stock', depts: ['Stock (PLAIN)'] },
  { label: 'Calibration WIP', depts: ['Calibration Dept (WIP)'] },
  { label: 'Calibrated stock', depts: ['Stock (CALIB)'] },
  { label: 'Grading WIP', depts: ['Grading Dept (WIP)'] },
  { label: 'Graded stock', depts: ['Stock (GRA)'] },
  {
    label: 'MDO / HYB / RC',
    depts: ['MDO Press Dept (WIP)', 'Stock (MDO)', 'MDO Grading Dept (WIP)', 'Stock (MDO-GRA)', 'RC Coating Dept (WIP)', 'Stock (RCOSB)', 'Hybrid Press Dept (WIP)', 'Stock (HYB)', 'Stock (HYB-GRA)'],
  },
  { label: 'Cutting / finishing WIP', depts: ['Cutting Dept (WIP)', 'Finishing Dept (WIP)'] },
  { label: 'Cut stock', depts: ['Stock (CUT)'] },
  { label: 'Finished goods', depts: ['Stock (FG)', 'Stock (PLAIN-FG)', 'Stock (PLAIN-UNG)'] },
  { label: 'Rejected', depts: ['Stock (REJ)'], alert: true },
  { label: 'Scrap', depts: ['Scrap Yard'], alert: true },
];
/** Rejected and scrap locations: flagged in the header and in stock lists. */
export const ALERT_DEPTS: readonly Department[] = ['Stock (REJ)', 'Scrap Yard'];

export const SIZES = ['2590×1320', '1220×2440', '610×1220', 'Roll', 'Kg', 'Sheets', 'Offcut'] as const;
export const GRADES = ['A', 'B', 'C', 'REJ', 'SCRAP', 'UNG'] as const;
export const SHIFTS = ['Day', 'Night', 'General'] as const;
export type Shift = (typeof SHIFTS)[number];

/** Reclassification scenarios (legacy RECLASS_SCENARIOS). Only a label and a hint; any two SKUs are allowed. */
export const RECLASS_SCENARIOS = [
  { label: 'Grade A → Grade B', hint: 'Downgrade: same product, A to B', from: 'Grade A SKU', to: 'Grade B SKU' },
  { label: 'Grade B → Grade A', hint: 'Upgrade: same product, B to A', from: 'Grade B SKU', to: 'Grade A SKU' },
  { label: 'Stock → Reject', hint: 'Move to the reject bay', from: 'Any stock SKU', to: 'REJ SKU' },
  { label: 'Reject → Stock', hint: 'Rescued from reject, back to graded stock', from: 'REJ SKU', to: 'Grade A / B SKU' },
  { label: 'Full size → Cut size', hint: 'Reclassify 2590×1320 quantity as 1220×2440', from: 'Full size SKU', to: 'Cut size SKU' },
  { label: 'WIP → Stock', hint: 'Close WIP, move to stock', from: 'WIP SKU', to: 'Stock SKU' },
  { label: 'Custom', hint: 'Any reclassification', from: 'Any SKU', to: 'Any SKU' },
] as const;
export type ReclassScenario = (typeof RECLASS_SCENARIOS)[number]['label'];
export const RECLASS_SCENARIO_LABELS = RECLASS_SCENARIOS.map((s) => s.label) as [ReclassScenario, ...ReclassScenario[]];

/** An item group: one row of the SKU master. With thicknesses, each thickness is its own SKU. */
export interface SkuGroup {
  id: string;
  /** OC-611. Unique. */
  prefix: string;
  label: string;
  family: Family;
  dept: Department;
  size: string | null;
  grade: string | null;
  /** pcs, kg, sh, roll… */
  unit: string;
  /** Two-digit thicknesses in mm; empty = a fixed code (the prefix is the SKU). */
  thicknesses: string[];
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** The full code: prefix, plus the thickness for variable groups. */
export const skuCode = (g: Pick<SkuGroup, 'prefix' | 'thicknesses'>, thick: string | null | undefined) => (g.thicknesses.length ? `${g.prefix}${thick ?? ''}` : g.prefix);
export const isFixed = (g: Pick<SkuGroup, 'thicknesses'>) => g.thicknesses.length === 0;

/** One side of a movement: which group and thickness, and the resulting code. */
export interface SkuRef {
  groupId: string;
  thick: string | null;
  sku: string;
}

export const SLIP_TYPES = ['SIS', 'SRS'] as const;
export type SlipType = (typeof SLIP_TYPES)[number];

/**
 * SIS (stock issue, ISS/2026/001): out of a stock location into a department.
 * SRS (stock receipt, MRS/2026/001): out of a department into a stock location.
 * Either way: MINUS `from`, PLUS `to`, same quantity.
 */
export interface StockSlip {
  id: string;
  type: SlipType;
  slipNo: string;
  date: string;
  from: SkuRef;
  to: SkuRef;
  qty: number;
  batch: string;
  /** Against PR / SO number. */
  refNo: string | null;
  shift: Shift | null;
  remarks: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Opening stock: a PLUS on one SKU. */
export interface OpeningEntry {
  id: string;
  date: string;
  item: SkuRef;
  qty: number;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Stock transfer / reclassification (STR/2026/001): MINUS one SKU, PLUS another. */
export interface Reclass {
  id: string;
  strNo: string;
  date: string;
  scenario: ReclassScenario;
  from: SkuRef;
  to: SkuRef;
  qty: number;
  reason: string;
  /** STJ / Miracle reference. */
  ref: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type MoveKind = 'opening' | 'SIS' | 'SRS' | 'STR';

/** One leg of a movement, as the ledgers show it. `qty` is signed (− out, + in). */
export interface LedgerLeg {
  kind: MoveKind;
  docId: string;
  docNo: string;
  date: string;
  createdAt: string;
  sku: string;
  groupId: string;
  thick: string | null;
  dept: Department | null;
  qty: number;
  /** Running balance of `sku` after this leg (SKU ledger only). */
  balance?: number;
}

/** What a picker needs about a SKU: its group details and current balance. */
export interface SkuInfo {
  sku: string;
  groupId: string;
  prefix: string;
  thick: string | null;
  label: string;
  family: Family;
  dept: Department;
  size: string | null;
  grade: string | null;
  unit: string;
  qty: number;
}

export interface SlipView extends StockSlip {
  fromInfo: Omit<SkuInfo, 'qty'> | null;
  toInfo: Omit<SkuInfo, 'qty'> | null;
  createdByName: string | null;
}
export interface ReclassView extends Reclass {
  fromInfo: Omit<SkuInfo, 'qty'> | null;
  toInfo: Omit<SkuInfo, 'qty'> | null;
  createdByName: string | null;
}
export interface OpeningView extends OpeningEntry {
  info: Omit<SkuInfo, 'qty'> | null;
  createdByName: string | null;
}

export interface SlipFilters {
  type: SlipType;
  from: string;
  to: string;
  /** Either leg on this SKU. */
  sku: string;
}

export interface StockMeta {
  families: typeof FAMILIES;
  departments: typeof DEPARTMENTS;
  stages: typeof STAGES;
  sizes: typeof SIZES;
  grades: typeof GRADES;
  shifts: typeof SHIFTS;
  scenarios: typeof RECLASS_SCENARIOS;
  groups: SkuGroup[];
  today: string;
  /** For report prints. */
  company: CompanyBlock;
}

export interface StockDashboard {
  totalQty: number;
  /** Rejected + scrap quantity (the legacy "REJ" alert). */
  alertQty: number;
  slips: { total: number; sis: number; srs: number };
  reclasses: number;
  stages: { label: string; qty: number; alert: boolean }[];
  recent: SlipView[];
}

/** Live stock: every SKU with a balance (or, with `all`, every SKU in the master). */
export interface LiveStock {
  rows: SkuInfo[];
  total: number;
  byDept: { dept: Department; qty: number; skus: number }[];
}
