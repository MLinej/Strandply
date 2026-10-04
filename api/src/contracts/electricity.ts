// Electricity module contracts (legacy Electricity & Meter MIS: legacy/electricity/index.html). Shared by the API and the web app.
// One HT meter (PGVCL). Twice-daily cumulative kWh readings → per-shift and per-day consumption × the MF in force,
// costed with the energy and fuel rates and the fixed charge in force on that date; plus the PGVCL bill register.
// Money is integer paise; energy and fuel rates are paise per kWh; the fixed charge is paise per 30-day month.

export const SHIFTS = ['AM', 'PM'] as const;
export type Shift = (typeof SHIFTS)[number];
/** AM 00:00–11:59, PM 12:00–23:59 (legacy). */
export const shiftOfTime = (time: string): Shift => (Number(time.slice(0, 2)) < 12 ? 'AM' : 'PM');

export const RATE_KINDS = ['mf', 'fixed', 'energy', 'fuel'] as const;
export type RateKind = (typeof RATE_KINDS)[number];
export const RATE_LABEL: Record<RateKind, string> = { mf: 'Multiplying factor', fixed: 'Fixed charge (per month)', energy: 'Energy rate (per kWh)', fuel: 'Fuel surcharge (per kWh)' };
/** Used when a kind has no entry at all (legacy defaults): MF 30, ₹6,38,675 / month, ₹4.20 and ₹2.30 per kWh. */
export const RATE_DEFAULTS: Record<RateKind, number> = { mf: 30, fixed: 63_867_500, energy: 420, fuel: 230 };

/** PF bands (legacy): ≥ 0.95 earns the incentive, below 0.85 is penalised. */
export type PfBand = 'incentive' | 'normal' | 'penalty';
export const pfBand = (pf: number): PfBand => (pf >= 0.95 ? 'incentive' : pf >= 0.85 ? 'normal' : 'penalty');

interface Audit {
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MeterConfig {
  meterNo: string | null;
  consumerNo: string | null;
  category: string | null;
  sanctionedLoadKva: number | null;
  ctRatio: string | null;
  ptRatio: string | null;
  tariff: string | null;
  billingCycle: 'Monthly' | 'Bi-monthly';
}
export const DEFAULT_METER: MeterConfig = { meterNo: null, consumerNo: null, category: null, sanctionedLoadKva: null, ctRatio: null, ptRatio: null, tariff: null, billingCycle: 'Monthly' };
export const DEFAULT_ELECTRICITY_SETTINGS = { 'electricity.meter': DEFAULT_METER };

/** One entry in a dated history (legacy MF / FC / ER / FR history). */
export interface ElRate extends Audit {
  id: string;
  kind: RateKind;
  /** mf: the factor; fixed: paise per month; energy / fuel: paise per kWh. */
  value: number;
  effectiveFrom: string;
}

export interface ElReading extends Audit {
  id: string;
  date: string;
  shift: Shift;
  /** HH:MM */
  time: string;
  /** `${date}T${time}`: the sort key (unique). */
  at: string;
  /** Cumulative meter reading. */
  kwh: number;
  pf: number | null;
  nightKwh: number | null;
  remarks: string | null;
}

/** A reading with what it adds since the previous reading (any shift), costed at that date's rates. */
export interface ReadingView extends ElReading {
  prevKwh: number | null;
  diff: number | null;
  mf: number;
  net: number | null;
  energyPaise: number | null;
  fuelPaise: number | null;
  /** Half a day's fixed charge. */
  shiftFixedPaise: number;
  totalPaise: number | null;
}

/** One date (legacy 12-hr / 24-hr / monthly rows): the last AM and PM readings and what each shift used. */
export interface DayRow {
  date: string;
  am: { time: string; kwh: number } | null;
  pm: { time: string; kwh: number } | null;
  amDiff: number | null;
  pmDiff: number | null;
  amNet: number | null;
  pmNet: number | null;
  /** amDiff + pmDiff (meter units). */
  raw: number;
  /** raw × MF. */
  net: number;
  mf: number;
  pf: number | null;
  energyPaise: number;
  fuelPaise: number;
  /** A day's fixed charge (month ÷ 30). */
  fixedPaise: number;
  totalPaise: number;
}

export interface DayTotals {
  days: number;
  amReadings: number;
  pmReadings: number;
  amDiff: number;
  pmDiff: number;
  raw: number;
  amNet: number;
  pmNet: number;
  net: number;
  avgPf: number | null;
  energyPaise: number;
  fuelPaise: number;
  fixedPaise: number;
  totalPaise: number;
  /** Net kWh per day that used power. */
  avgDailyNet: number | null;
}

export interface DailyReport {
  rows: DayRow[];
  totals: DayTotals;
}

export interface MonthRow extends DayTotals {
  month: string;
}
export interface ElectricityDashboard {
  totals: DayTotals;
  months: MonthRow[];
}

/** The status strip (legacy top bar): today's latest AM and PM readings and what the day has cost so far. */
export interface TodayStatus {
  date: string;
  am: { time: string; kwh: number } | null;
  pm: { time: string; kwh: number } | null;
  /** PM − AM, once both are in. */
  diff: number | null;
  net: number | null;
  /** Energy + fuel + the day's fixed charge. */
  costPaise: number | null;
  pf: number | null;
}

export interface CurrentRates {
  mf: number;
  fixedPaise: number;
  energyPaise: number;
  fuelPaise: number;
}

export interface ElectricityMeta {
  meter: MeterConfig;
  rates: CurrentRates;
  status: TodayStatus;
  today: string;
}

export interface ReadingPreview {
  prev: { date: string; time: string; kwh: number } | null;
  diff: number | null;
  mf: number;
  net: number | null;
  energyRatePaise: number;
  fuelRatePaise: number;
  energyPaise: number | null;
  fuelPaise: number | null;
  shiftFixedPaise: number;
  totalPaise: number | null;
}

export const BILL_CHARGES = ['demand', 'energy', 'fuelSurcharge', 'pfRebate', 'nightRebate', 'ehvRebate', 'timeOfUse', 'gt', 'totalConsumption', 'electricityDuty', 'meterCharges', 'tcs'] as const;
export type BillCharge = (typeof BILL_CHARGES)[number];
export const BILL_CHARGE_LABEL: Record<BillCharge, string> = {
  demand: 'Demand charge',
  energy: 'Energy charge',
  fuelSurcharge: 'Fuel surcharge',
  pfRebate: 'PF rebate (−)',
  nightRebate: 'Night rebate (−)',
  ehvRebate: 'EHV rebate (−)',
  timeOfUse: 'Time of use charge',
  gt: 'GT charge',
  totalConsumption: 'Total consumption charge',
  electricityDuty: 'Electricity duty',
  meterCharges: 'Meter charges',
  tcs: 'TCS',
};

export interface StoredFile {
  name: string;
  mime: string;
  sizeBytes: number;
  blobKey: string;
}

/** A PGVCL bill (legacy bill register, every field). */
export interface ElBill extends Audit {
  id: string;
  billDate: string;
  dueDate: string | null;
  paidDate: string | null;
  advancePaymentPaise: number | null;
  kwhReading: number;
  kvarhReading: number | null;
  pf: number | null;
  nightUnits: number | null;
  /** Paise per charge; absent charges are null. */
  charges: Record<BillCharge, number | null>;
  netPayablePaise: number | null;
  totalPayablePaise: number;
  remarks: string | null;
  invoice: StoredFile | null;
}

/** With the differences from the previous bill × the MF on the bill date, and the readings' estimate for the period. */
export interface BillView extends Omit<ElBill, 'invoice'> {
  mf: number;
  kwhDiff: number | null;
  kwhNet: number | null;
  kvarhDiff: number | null;
  kvarhNet: number | null;
  /** Day after the previous bill's date (null for the first bill). */
  periodFrom: string | null;
  /** Estimate from the meter readings for periodFrom … billDate. */
  estimatePaise: number | null;
  estimateNet: number | null;
  invoice: { name: string; sizeBytes: number } | null;
}

export interface BillSummary {
  count: number;
  lastPaise: number | null;
  avgPaise: number | null;
  /** Total of bills dated in the current financial year. */
  fyPaise: number;
  avgPf: number | null;
}
