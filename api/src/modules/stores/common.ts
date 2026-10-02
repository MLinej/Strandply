import { fyLabel, fyOf } from '../../contracts/purchase';
import type { InvoiceMatch, StoresSettings } from '../../contracts/stores';
import type { Clock } from '../../lib/clock';
import { BUSINESS_TZ, businessToday } from '../../lib/dates';
import type { Repos } from '../../repos';

export const SETTING_KEYS = { autoPunchMrn: 'stores.auto_punch_mrn', autoPunchGrn: 'stores.auto_punch_grn' } as const;

const hm = new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** The time in India as HH:MM. */
export const businessTime = (clock: Clock) => hm.format(clock());

/** "2026-27" → "26-27", as printed in MRN/26-27/0001. */
const shortFy = (fy: string) => fy.slice(2);
export const docNo = (prefix: 'MRN' | 'GRN', fy: string, n: number) => `${prefix}/${shortFy(fy)}/${String(n).padStart(4, '0')}`;
export const counterName = (prefix: 'MRN' | 'GRN', fy: string) => `${prefix}-${fy}`;

/** Next free MRN / GRN number for the FY of `date`. Must run in the unit of work that inserts the row. */
export async function nextDocNo(tx: Repos, prefix: 'MRN' | 'GRN', date: string, at: string, taken: (no: string) => Promise<boolean>) {
  const fy = fyOf(date);
  for (let i = 0; i < 1000; i++) {
    const no = docNo(prefix, fy, await tx.counters.next(counterName(prefix, fy), at));
    if (!(await taken(no))) return { no, fy };
  }
  throw new Error(`No free ${prefix} number`);
}

/** The number the next document would get, without using it up. */
export async function peekDocNo(repos: Repos, prefix: 'MRN' | 'GRN', date: string) {
  const fy = fyOf(date);
  return docNo(prefix, fy, (await repos.counters.current(counterName(prefix, fy))) + 1);
}

/** Whole days from `date` to today (India), never negative. */
export function daysSince(date: string, clock: Clock) {
  const ms = Date.parse(`${businessToday(clock)}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`);
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export async function readSettings(repos: Repos): Promise<StoresSettings> {
  const v = await repos.settings.getMany(Object.values(SETTING_KEYS));
  return { autoPunchMrn: v[SETTING_KEYS.autoPunchMrn] !== false, autoPunchGrn: v[SETTING_KEYS.autoPunchGrn] !== false };
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/**
 * The Purchase entry with this invoice number (legacy findInvoiceAcrossModules). Prefers one from
 * the same vendor when several vendors used the same number.
 */
export async function findInvoice(repos: Repos, invoiceNo: string, vendorName?: string | null): Promise<InvoiceMatch | null> {
  const needle = squash(invoiceNo);
  if (!needle) return null;
  const { rows } = await repos.purchaseEntries.list({ q: invoiceNo.trim(), pageSize: 100 });
  const hits = rows.filter((e) => squash(e.invoiceNo) === needle);
  const vn = vendorName ? squash(vendorName) : '';
  const e = hits.find((h) => vn && squash(h.vendorName) === vn) ?? hits[0];
  return e ? { entryId: e.id, lotNo: e.lotNo, material: e.material, vendorName: e.vendorName, date: e.date } : null;
}

/** FYs to offer: this FY back to 2024-25, newest first. */
export function fyOptions(clock: Clock): string[] {
  const cur = Number(fyOf(businessToday(clock)).slice(0, 4));
  const out: string[] = [];
  for (let y = cur; y >= Math.min(cur, 2024); y--) out.push(fyLabel(y));
  return out;
}
