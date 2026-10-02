import type { Clock } from './clock';

/** Business dates (request date, dispatch date) are calendar dates in India. */
export const BUSINESS_TZ = 'Asia/Kolkata';

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Today's date in India as YYYY-MM-DD. At 01:00 IST that is already the new day, even though UTC is still on yesterday. */
export function businessToday(clock: Clock): string {
  return ymd.format(clock());
}

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** The India calendar date (YYYY-MM-DD) of a UTC timestamp. */
export function businessDateOf(isoTimestamp: string): string {
  return ymd.format(new Date(isoTimestamp));
}
