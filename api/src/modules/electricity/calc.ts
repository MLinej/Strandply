// The legacy costing, as pure functions over readings and rate histories (getMFForDate, prevSameShift, render12hr…).
import { RATE_DEFAULTS, type CurrentRates, type DayRow, type DayTotals, type ElRate, type ElReading, type RateKind, type ReadingView } from '../../contracts/electricity';

const stamp = (r: Pick<ElReading, 'date' | 'time'>) => `${r.date}T${r.time}`; // same as ElReading.at
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The rates in force on a date: the latest entry from on or before it, else the earliest entry, else the default (legacy). */
export class RateBook {
  private readonly byKind: Record<RateKind, ElRate[]>;
  constructor(rates: ElRate[]) {
    const sorted = [...rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    this.byKind = { mf: [], fixed: [], energy: [], fuel: [] };
    for (const r of sorted) this.byKind[r.kind].push(r);
  }
  value(kind: RateKind, date: string): number {
    const list = this.byKind[kind];
    if (!list.length) return RATE_DEFAULTS[kind];
    return [...list].reverse().find((r) => r.effectiveFrom <= date)?.value ?? list[0]!.value;
  }
  on(date: string): CurrentRates {
    return { mf: this.value('mf', date), fixedPaise: this.value('fixed', date), energyPaise: this.value('energy', date), fuelPaise: this.value('fuel', date) };
  }
  dailyFixed = (date: string) => this.value('fixed', date) / 30;
}

export function cost(book: RateBook, date: string, net: number) {
  const r = book.on(date);
  const energyPaise = Math.round(net * r.energyPaise);
  const fuelPaise = Math.round(net * r.fuelPaise);
  return { energyPaise, fuelPaise };
}

/** Readings in time order with a lookup for the reading just before a moment. */
export class ReadingBook {
  readonly sorted: ElReading[];
  constructor(readings: ElReading[]) {
    this.sorted = [...readings].sort((a, b) => stamp(a).localeCompare(stamp(b)));
  }
  /** The reading immediately before (any shift): a cumulative meter's previous value (legacy prevSameShift). */
  before(at: Pick<ElReading, 'date' | 'time'>): ElReading | null {
    const s = stamp(at);
    let found: ElReading | null = null;
    for (const r of this.sorted) {
      if (stamp(r) >= s) break;
      found = r;
    }
    return found;
  }
  after(at: Pick<ElReading, 'date' | 'time'>): ElReading | null {
    const s = stamp(at);
    return this.sorted.find((r) => stamp(r) > s) ?? null;
  }
  shift(date: string, shift: 'AM' | 'PM') {
    return this.sorted.filter((r) => r.date === date && r.shift === shift);
  }
}

export function readingView(r: ElReading, readings: ReadingBook, book: RateBook): ReadingView {
  const prev = readings.before(r);
  const mf = book.value('mf', r.date);
  const diff = prev ? round2(r.kwh - prev.kwh) : null;
  const net = diff === null ? null : round2(diff * mf);
  const shiftFixedPaise = Math.round(book.dailyFixed(r.date) / 2);
  const c = net === null ? null : cost(book, r.date, net);
  return {
    ...r,
    prevKwh: prev?.kwh ?? null,
    diff,
    mf,
    net,
    energyPaise: c?.energyPaise ?? null,
    fuelPaise: c?.fuelPaise ?? null,
    shiftFixedPaise,
    totalPaise: c ? c.energyPaise + c.fuelPaise + shiftFixedPaise : null,
  };
}

/**
 * One row per date that has readings. A shift's use is its last reading minus the last reading before the shift
 * started (so several readings in one shift still add up; legacy took the last minus the one just before it).
 */
export function dayRows(readings: ReadingBook, book: RateBook, from: string, to: string): DayRow[] {
  const dates = [...new Set(readings.sorted.filter((r) => r.date >= from && r.date <= to).map((r) => r.date))];
  return dates.map((date) => {
    const mf = book.value('mf', date);
    const part = (shift: 'AM' | 'PM') => {
      const rs = readings.shift(date, shift);
      if (!rs.length) return { at: null, diff: null };
      const last = rs.at(-1)!;
      const prev = readings.before(rs[0]!);
      return { at: { time: last.time, kwh: last.kwh }, diff: prev ? round2(last.kwh - prev.kwh) : null, pf: [...rs].reverse().find((x) => x.pf !== null)?.pf ?? null };
    };
    const am = part('AM');
    const pm = part('PM');
    const raw = round2((am.diff ?? 0) + (pm.diff ?? 0));
    const net = round2(raw * mf);
    const { energyPaise, fuelPaise } = cost(book, date, net);
    const fixedPaise = Math.round(book.dailyFixed(date));
    return {
      date,
      am: am.at,
      pm: pm.at,
      amDiff: am.diff,
      pmDiff: pm.diff,
      amNet: am.diff === null ? null : round2(am.diff * mf),
      pmNet: pm.diff === null ? null : round2(pm.diff * mf),
      raw,
      net,
      mf,
      pf: ('pf' in pm ? pm.pf : null) ?? ('pf' in am ? am.pf : null) ?? null,
      energyPaise,
      fuelPaise,
      fixedPaise,
      totalPaise: energyPaise + fuelPaise + fixedPaise,
    };
  });
}

export function totals(rows: DayRow[]): DayTotals {
  const sum = (f: (r: DayRow) => number | null) => round2(rows.reduce((s, r) => s + (f(r) ?? 0), 0));
  const pfs = rows.map((r) => r.pf).filter((x): x is number => x !== null);
  const used = rows.filter((r) => r.raw > 0);
  const net = sum((r) => r.net);
  const t = {
    days: rows.length,
    amReadings: rows.filter((r) => r.am).length,
    pmReadings: rows.filter((r) => r.pm).length,
    amDiff: sum((r) => r.amDiff),
    pmDiff: sum((r) => r.pmDiff),
    raw: sum((r) => r.raw),
    amNet: sum((r) => r.amNet),
    pmNet: sum((r) => r.pmNet),
    net,
    avgPf: pfs.length ? Math.round((pfs.reduce((s, x) => s + x, 0) / pfs.length) * 1000) / 1000 : null,
    energyPaise: sum((r) => r.energyPaise),
    fuelPaise: sum((r) => r.fuelPaise),
    fixedPaise: sum((r) => r.fixedPaise),
    totalPaise: 0,
    avgDailyNet: used.length ? Math.round(sum((r) => (r.raw > 0 ? r.net : 0)) / used.length) : null,
  };
  t.totalPaise = t.energyPaise + t.fuelPaise + t.fixedPaise;
  return t;
}
