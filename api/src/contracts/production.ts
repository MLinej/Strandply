// Production module (legacy "Production MIS" + "Matt Weight System"): production plans, hot press,
// matt weight, chipping → WIP Nilgiri, resin consumption, board cutting, production summary, MDO press.
// Calculations here are shared by the server and the form previews. See docs/production-spec.md.

export const PRODUCTS = ['OSB', 'S-OSB', 'Semi OSB'] as const;
export type Product = (typeof PRODUCTS)[number];
export const SHIFTS = ['Day', 'Afternoon', 'Night'] as const;
export type Shift = (typeof SHIFTS)[number];
export const PRIORITIES = ['High', 'Medium', 'Low'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const MDO_TYPES = ['BSL', 'OSL', 'Both'] as const;

/** Legacy master defaults (Security & Settings). Both lists are editable. */
export const DEFAULT_THICKNESSES = ['6', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '27', '28'];
export const DEFAULT_SIZES = ['8x4', '4x4', '6x4'];

/** Document kinds that go through review and approval, with their number prefix. */
export const DOC_KINDS = {
  plan: { prefix: 'PPR', label: 'Production plan' },
  hotpress: { prefix: 'HP', label: 'Hot press report' },
  chipping: { prefix: 'CHR', label: 'Chipping report' },
  resin: { prefix: 'RC', label: 'Resin consumption' },
  cutting: { prefix: 'BC', label: 'Board cutting report' },
  summary: { prefix: 'PS', label: 'Production summary' },
  mdo: { prefix: 'MDO', label: 'MDO press report' },
} as const;
export type DocKind = keyof typeof DOC_KINDS;
export const DOC_KIND_IDS = Object.keys(DOC_KINDS) as [DocKind, ...DocKind[]];

/** draft → review (sent) → reviewed → approved. Return / reject go back to draft. */
export const WF_STATES = ['draft', 'review', 'reviewed', 'approved'] as const;
export type WfState = (typeof WF_STATES)[number];
export const WF_ACTIONS = ['send', 'review', 'return', 'approve', 'reject'] as const;
export type WfAction = (typeof WF_ACTIONS)[number];
export interface WfStep {
  action: WfAction | 'edit';
  by: string | null;
  byName: string | null;
  note: string | null;
  at: string;
}

/** Fields every workflow document has. */
export interface DocBase {
  id: string;
  /** HP-0001, PS-0001… */
  docNo: string;
  date: string;
  wfState: WfState;
  wfTrail: WfStep[];
  remarks: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ── Shared calculations ─────────────────────────────────────────────

/** Minutes from HH:MM a to b; past midnight wraps (22:00 → 02:00 = 240). */
export function minutesBetween(a: string, b: string): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let d = m(b) - m(a);
  if (d < 0) d += 1440;
  return d;
}
export const minsToStr = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

/** Square feet of one board: "8x4" → 32. Unknown formats → 0. */
export function sqftOf(size: string): number {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/i.exec(size);
  return m ? Number(m[1]) * Number(m[2]) : 0;
}

export const round3 = (n: number) => Math.round(n * 1000) / 1000;
export const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Hot press ───────────────────────────────────────────────────────

export interface HpCharge {
  label: string;
  pcs: number;
  /** HH:MM */
  load: string | null;
  unload: string | null;
  remarks: string | null;
}
export interface HpCalc {
  totalBoards: number;
  charges: number;
  /** Sum of each charge's load → unload. */
  pressMins: number;
  /** Clock time from the first load to the last unload. */
  totalMins: number;
  /** Total − press: idle time between charges. */
  spareMins: number;
  avgPressMins: number;
  perCharge: number[];
}

/**
 * Legacy saveHPReport. The legacy edit path computed total time as the sum of charges and spare
 * as (charge − 90 min); creating and editing now use this one calculation.
 */
export function calcHotPress(charges: HpCharge[]): HpCalc {
  const perCharge = charges.map((c) => (c.load && c.unload ? minutesBetween(c.load, c.unload) : 0));
  const pressMins = perCharge.reduce((s, m) => s + m, 0);
  const timed = charges.filter((c) => c.load && c.unload);
  let totalMins = 0;
  if (timed.length) {
    // The day starts at the first load; later times before it are after midnight.
    const first = timed[0]!.load!;
    const offsets = timed.map((c) => ({ load: minutesBetween(first, c.load!), unload: minutesBetween(first, c.load!) + minutesBetween(c.load!, c.unload!) }));
    totalMins = Math.max(...offsets.map((o) => o.unload)) - Math.min(...offsets.map((o) => o.load));
  }
  return {
    totalBoards: charges.reduce((s, c) => s + c.pcs, 0),
    charges: charges.length,
    pressMins,
    totalMins,
    spareMins: Math.max(0, totalMins - pressMins),
    avgPressMins: charges.length ? Math.round(pressMins / charges.length) : 0,
    perCharge,
  };
}

// ── Board cutting ───────────────────────────────────────────────────

export function calcCutting(hpPcs: number, cutPcs: number) {
  const rejectPcs = Math.max(0, hpPcs - cutPcs);
  return { rejectPcs, rejectPct: hpPcs > 0 ? round2((rejectPcs / hpPcs) * 100) : 0 };
}

// ── Matt weight ─────────────────────────────────────────────────────

export type MattStatus = 'pass' | 'warn' | 'fail';
/** Within ±band of the setpoint: pass; within ±2×band: warn; else reject (legacy mattGetStatus). */
export function mattStatus(weight: number, setpoint: number, band: number): MattStatus {
  const dev = Math.abs(weight - setpoint);
  if (dev <= band + 1e-9) return 'pass';
  if (dev <= band * 2 + 1e-9) return 'warn';
  return 'fail';
}
export interface MattStats {
  count: number;
  avg: number;
  min: number;
  max: number;
  /** Sample standard deviation (weight-system report). */
  stdDev: number;
  total: number;
  pass: number;
  warn: number;
  fail: number;
  passRate: number;
}
export function mattStats(weights: number[], setpoint: number, band: number): MattStats {
  const n = weights.length;
  const total = weights.reduce((s, w) => s + w, 0);
  const avg = n ? total / n : 0;
  const statuses = weights.map((w) => mattStatus(w, setpoint, band));
  const pass = statuses.filter((s) => s === 'pass').length;
  return {
    count: n,
    avg: round3(avg),
    min: n ? Math.min(...weights) : 0,
    max: n ? Math.max(...weights) : 0,
    stdDev: n > 1 ? round3(Math.sqrt(weights.reduce((s, w) => s + (w - avg) ** 2, 0) / (n - 1))) : 0,
    total: round3(total),
    pass,
    warn: statuses.filter((s) => s === 'warn').length,
    fail: statuses.filter((s) => s === 'fail').length,
    passRate: n ? Math.round((pass / n) * 1000) / 10 : 0,
  };
}

// ── Production plan ─────────────────────────────────────────────────

export interface PlanProduct {
  product: Product;
  size: string;
  thickness: string;
  priority: Priority;
  targetBoards: number;
}
export interface PlanSettings {
  /** Boards in one press charge (estimated charges = ceil(boards ÷ this)). */
  boardsPerCharge: number;
  /** Wet wood needed per kg of dry wood (moisture). */
  wetWoodFactor: number;
}
export const DEFAULT_PLAN_SETTINGS: PlanSettings = { boardsPerCharge: 30, wetWoodFactor: 2.5 };

export interface PlanCalc {
  lines: { sqft: number; charges: number }[];
  totalBoards: number;
  totalSqft: number;
  totalCharges: number;
  /** resin per matt × matts */
  resinReqKg: number;
  /** matt weight × matts − resin */
  dryWoodReqKg: number;
  /** dry wood × wet-wood factor */
  wetWoodReqKg: number;
}

/**
 * Legacy ppCalcAuto / savePPReport. Legacy estimated charges as ÷30 on screen but ÷450 when saved,
 * and the wet-wood requirement differed between the form and the PDF; both use this one rule now.
 * Matts default to the planned boards when not entered.
 */
export function calcPlan(products: PlanProduct[], p: { mattWtKg: number | null; matts: number | null; resinPerMattKg: number | null }, s: PlanSettings = DEFAULT_PLAN_SETTINGS): PlanCalc {
  const lines = products.map((x) => ({ sqft: x.targetBoards * sqftOf(x.size), charges: Math.ceil(x.targetBoards / s.boardsPerCharge) }));
  const totalBoards = products.reduce((t, x) => t + x.targetBoards, 0);
  const matts = p.matts ?? totalBoards;
  const resinReqKg = round3((p.resinPerMattKg ?? 0) * matts);
  const dryWoodReqKg = round3(Math.max(0, (p.mattWtKg ?? 0) * matts - resinReqKg));
  return {
    lines,
    totalBoards,
    totalSqft: lines.reduce((t, l) => t + l.sqft, 0),
    totalCharges: lines.reduce((t, l) => t + l.charges, 0),
    resinReqKg,
    dryWoodReqKg,
    wetWoodReqKg: round3(dryWoodReqKg * s.wetWoodFactor),
  };
}

/** "ON PLAN" at ≥ 98% of plan, otherwise how far short (legacy PP PDF comparison). */
export function planStatus(plan: number, actual: number | null): string {
  if (actual === null) return 'Not linked';
  if (plan <= 0) return '—';
  const pct = Math.round((actual / plan) * 100);
  if (pct >= 98) return 'On plan';
  return `${100 - pct}% short`;
}

/** Process parameters recorded on a plan, by department (legacy PP form sections). */
export const PLAN_SECTIONS = [
  {
    title: 'Boiler',
    fields: [
      { key: 'hagAStart', label: 'HAG-A start', type: 'time' },
      { key: 'hagBStart', label: 'HAG-B start', type: 'time' },
      { key: 'thermStart', label: 'Thermic boiler start', type: 'time' },
      { key: 'hagTemp', label: 'HAG temperature (°C)', type: 'number' },
      { key: 'thermTemp', label: 'Thermic boiler temp (°C)', type: 'number' },
      { key: 'hagOp', label: 'HAG operator', type: 'text' },
      { key: 'thermOp', label: 'Thermic boiler operator', type: 'text' },
    ],
  },
  {
    title: 'Dryer',
    fields: [
      { key: 'dryerAIn', label: 'Dryer A input temp (°C)', type: 'number' },
      { key: 'dryerAOut', label: 'Dryer A output temp (°C)', type: 'number' },
      { key: 'dryerAOp', label: 'Dryer A operator', type: 'text' },
      { key: 'dryerBIn', label: 'Dryer B input temp (°C)', type: 'number' },
      { key: 'dryerBOut', label: 'Dryer B output temp (°C)', type: 'number' },
      { key: 'dryerBOp', label: 'Dryer B operator', type: 'text' },
    ],
  },
  {
    title: 'Blender',
    fields: [
      { key: 'chipsBlendStart', label: 'Chips blender start', type: 'time' },
      { key: 'dustBlendStart', label: 'Dust blender start', type: 'time' },
      { key: 'chipsBlendOp', label: 'Chips blender operator', type: 'text' },
      { key: 'dustBlendOp', label: 'Dust blender operator', type: 'text' },
      { key: 'trillSpeed', label: 'Trillium speed', type: 'text' },
    ],
  },
  {
    title: 'Forming line',
    fields: [
      { key: 'formingOp', label: 'Forming line operator', type: 'text' },
      { key: 'formingStart', label: 'Forming line start', type: 'time' },
      { key: 'chipStart', label: 'Chipping start', type: 'time' },
    ],
  },
  {
    title: 'Pre-press',
    fields: [
      { key: 'prepressOp', label: 'Pre-press operator', type: 'text' },
      { key: 'prepressStart', label: 'Pre-press start', type: 'time' },
    ],
  },
  {
    title: 'Hot press',
    fields: [
      { key: 'pressOp', label: 'Hot press operator', type: 'text' },
      { key: 'pressLineStart', label: 'Hot press start', type: 'time' },
      { key: 'cycleTime', label: 'Cycle time', type: 'text' },
      { key: 'pressTemp', label: 'Hot press temperature (°C)', type: 'number' },
      { key: 'thickBar', label: 'Thickness bar', type: 'text' },
    ],
  },
  {
    title: 'Cutting',
    fields: [
      { key: 'totalBoardCut', label: 'Total boards cutting', type: 'number' },
      { key: 'cutSize', label: 'Cutting size', type: 'text' },
      { key: 'cutOp', label: 'Cutting operator', type: 'text' },
    ],
  },
] as const;
export type PlanProcessKey = (typeof PLAN_SECTIONS)[number]['fields'][number]['key'];

// ── Documents ───────────────────────────────────────────────────────

export interface Plan extends DocBase {
  shift: Shift;
  planOp: string | null;
  products: PlanProduct[];
  /** Target matt weight (kg). */
  mattWtKg: number | null;
  matts: number | null;
  resinPerMattKg: number | null;
  /** Wet wood on the floor (kg), typed in. */
  wetWoodAvailKg: number | null;
  process: Partial<Record<PlanProcessKey, string>>;
  hotpressId: string | null;
  mattBatchId: string | null;
  cuttingId: string | null;
}

export interface HotPress extends DocBase {
  shift: Shift;
  product: Product;
  size: string;
  thickness: string | null;
  operator: string | null;
  charges: HpCharge[];
}

/** One Purchase lot consumed. The rate is fixed when the report is saved. */
export interface LotLine {
  purchaseEntryId: string;
  lotNo: string;
  qty: number;
  /** Net rate, paise per ton. */
  ratePaise: number;
  amountPaise: number;
}

export interface Chipping extends DocBase {
  shift: Shift;
  operator: string | null;
  machine: string | null;
  lots: LotLine[];
}

export interface ResinUse extends DocBase {
  shift: Shift;
  lot: LotLine;
  product: Product | null;
  operator: string | null;
}

export interface Cutting extends DocBase {
  shift: Shift;
  hotpressId: string;
  operator: string | null;
  cutPcs: number;
}

export interface WipUse {
  wipId: string;
  qty: number;
}

export interface Summary extends DocBase {
  product: Product;
  size: string;
  thickness: string | null;
  batch: string | null;
  hotpressId: string | null;
  mattBatchId: string | null;
  resinIds: string[];
  cuttingId: string | null;
  planId: string | null;
  pressPcs: number;
  boards: number;
  boardRej: number;
  mattPcs: number;
  mattWtKg: number;
  mattRej: number;
  resinKg: number;
  resinPaise: number;
  dryWoodKg: number;
  /** WIP Nilgiri consumed; wet wood kg / amount come from these. */
  wip: WipUse[];
}

export interface MdoItem {
  boardType: string;
  thickness: string | null;
  paper: string | null;
  type: (typeof MDO_TYPES)[number] | null;
  finish: string | null;
  pcs: number;
  cycleTime: string | null;
}
export interface Mdo extends DocBase {
  shift: Shift;
  operator: string | null;
  pressStart: string | null;
  pressEnd: string | null;
  items: MdoItem[];
  paperUsed: number | null;
  paperWastage: number | null;
}

/** Matt weight batch (not a workflow document: open → closed). */
export interface MattWeight {
  n: number;
  weight: number;
  at: string;
}
export interface MattBatch {
  id: string;
  docNo: string;
  date: string;
  shift: Shift;
  product: Product;
  size: string;
  thickness: string | null;
  operator: string | null;
  /** Target weight per matt (kg). */
  setpoint: number;
  /** Pass band ± kg; warn up to twice this. */
  band: number;
  targetQty: number | null;
  remarks: string | null;
  status: 'open' | 'closed';
  weights: MattWeight[];
  closedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** WIP Nilgiri batch: the chipped wood of one chipping report, available to production summaries. */
export interface WipBatch {
  id: string;
  docNo: string;
  chippingId: string;
  date: string;
  remarks: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
/** Manual correction of a WIP batch (chipped weight is theoretical). Signed kg. */
export interface WipAdjustment {
  id: string;
  wipId: string;
  date: string;
  qty: number;
  reason: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ── Views ───────────────────────────────────────────────────────────

export interface Who {
  createdByName: string | null;
}
export type PlanView = Plan & Who & { calc: PlanCalc };
export type HotPressView = HotPress & Who & { calc: HpCalc; cuttingNo: string | null };
export type ChippingView = Chipping & Who & { totalKg: number; totalPaise: number; avgRatePaise: number; wipId: string | null; wipNo: string | null };
export type ResinUseView = ResinUse & Who & { vendorName: string | null; invoiceNo: string | null };
export type CuttingView = Cutting & Who & { hotpressNo: string | null; product: Product | null; size: string | null; hpPcs: number; rejectPcs: number; rejectPct: number };
export type SummaryView = Summary &
  Who & {
    boardRejPct: number;
    wetWoodKg: number;
    wetWoodPaise: number;
    /** Paise per ton. */
    wetWoodRatePaise: number;
    links: { hotpressNo: string | null; mattNo: string | null; resinNos: string[]; cuttingNo: string | null; planNo: string | null; wipNos: string[] };
  };
export type MdoView = Mdo & Who & { totalPcs: number; workingMins: number | null };
export type MattBatchView = MattBatch & Who & { stats: MattStats };

export interface WipBatchView extends WipBatch {
  chippingNo: string;
  totalKg: number;
  totalPaise: number;
  /** Paise per ton. */
  avgRatePaise: number;
  usedKg: number;
  adjustKg: number;
  availKg: number;
  status: 'available' | 'partly used' | 'consumed' | 'negative';
}
export interface WipLedgerRow {
  wipId: string;
  wipNo: string;
  date: string;
  at: string;
  type: 'IN' | 'OUT';
  qty: number;
  ratePaise: number;
  amountPaise: number;
  refType: 'Chipping' | 'Production summary' | 'Adjustment';
  refId: string | null;
  refNo: string | null;
  balance: number;
  remarks: string | null;
}

/** A Purchase lot that production can draw from. */
export interface LotOption {
  purchaseEntryId: string;
  lotNo: string;
  date: string;
  vendorName: string;
  invoiceNo: string;
  /** SPL qty received (kg). */
  receivedKg: number;
  usedKg: number;
  availKg: number;
  /** Net rate, paise per ton (invoice rate ± rate-difference note). */
  netRatePaise: number;
  invoiceRatePaise: number;
  rateDiffPaise: number;
}

export interface ProductionSettings extends PlanSettings {
  thicknesses: string[];
  sizes: string[];
  /** Financial years closed for editing. */
  closedFys: string[];
}

export interface ProductionMeta {
  products: typeof PRODUCTS;
  shifts: typeof SHIFTS;
  priorities: typeof PRIORITIES;
  mdoTypes: typeof MDO_TYPES;
  planSections: typeof PLAN_SECTIONS;
  settings: ProductionSettings;
  currentFy: string;
  fys: string[];
  today: string;
}

export interface DocFilters {
  fy: string;
  from: string;
  to: string;
  wfState: WfState;
}

export interface ProductionDashboard {
  kpis: { hotpress: number; boardsPressed: number; summaries: number; chipping: number; rejectPcs: number; cutPcs: number; rejectPct: number };
  modules: { key: string; label: string; count: number; metric: string }[];
  byProduct: { label: string; value: number }[];
  recent: { kind: DocKind; id: string; docNo: string; date: string; detail: string; wfState: WfState }[];
  nilgiriLots: LotOption[];
  awaiting: { review: number; approval: number };
}
