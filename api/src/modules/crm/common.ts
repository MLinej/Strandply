import { DEFAULT_LOST_REASONS, DEFAULT_SOURCES, OPEN_FOLLOWUP, quoteTotals, type CrmCustomer, type CrmTask, type Followup, type FollowupView, type Opportunity, type OrderLost, type OrderWon, type Quotation, type TaskView, type WithCustomer } from '../../contracts/crm';
import { fyOf } from '../../contracts/purchase';
import type { Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { validationFailed } from '../../lib/errors';
import type { Repos } from '../../repos';

export const SETTING_KEYS = { sources: 'crm.sources', lostReasons: 'crm.lost_reasons' } as const;

export async function readSettings(repos: Repos) {
  const v = await repos.settings.getMany(Object.values(SETTING_KEYS));
  const arr = (x: unknown, d: string[]) => (Array.isArray(x) ? (x as unknown[]).map(String) : [...d]);
  return { sources: arr(v[SETTING_KEYS.sources], DEFAULT_SOURCES), lostReasons: arr(v[SETTING_KEYS.lostReasons], DEFAULT_LOST_REASONS) };
}

export const today = (clock: Clock) => businessToday(clock);
export const badRef = (path: string, message: string) => validationFailed('Invalid input', [{ path, message }]);

/** QT/26-27/0001 and ORD/26-27/0001 (legacy nextId), one counter per prefix and FY. */
export async function nextNo(tx: Repos, prefix: 'QT' | 'ORD', date: string, at: string) {
  const fy = fyOf(date);
  return `${prefix}/${fy.slice(2)}/${String(await tx.counters.next(`CRM-${prefix}-${fy}`, at)).padStart(4, '0')}`;
}

/** Customer name and city for records that point at a customer. */
export async function customerLookup(repos: Repos) {
  const byId = new Map((await repos.crmCustomers.listAll()).map((c) => [c.id, c]));
  const of = (id: string | null): WithCustomer => {
    const c = id ? byId.get(id) : null;
    return { customerName: c?.companyName ?? '—', city: c?.city ?? null };
  };
  return { byId, of };
}

export async function followupViews(repos: Repos, rows: Followup[]): Promise<FollowupView[]> {
  const { byId } = await customerLookup(repos);
  return rows.map((f) => {
    const c = byId.get(f.customerId);
    return { ...f, customerName: c?.companyName ?? '—', city: c?.city ?? null, mobile: c?.mobile ?? null, whatsapp: c?.whatsapp ?? c?.mobile ?? null, due: f.nextFollowUpDate ?? f.date };
  });
}

export const isOpenFollowup = (f: Followup) => OPEN_FOLLOWUP.includes(f.status);

export async function quotationViews(repos: Repos, rows: Quotation[]) {
  const [{ of }, opps] = await Promise.all([customerLookup(repos), repos.crmOpportunities.listAll()]);
  const opp = new Map(opps.map((o) => [o.id, o]));
  return rows.map((q) => {
    const o = q.opportunityId ? opp.get(q.opportunityId) : null;
    return { ...q, ...of(q.customerId), ...quoteTotals(q), opportunity: o ? `${o.product}${o.quantity ? ` · ${o.quantity}` : ''}` : null };
  });
}

export async function withCustomer<T extends Opportunity | OrderWon | OrderLost>(repos: Repos, rows: T[]): Promise<(T & WithCustomer)[]> {
  const { of } = await customerLookup(repos);
  return rows.map((r) => ({ ...r, ...of(r.customerId) }));
}

export async function taskViews(repos: Repos, rows: CrmTask[], now: string): Promise<TaskView[]> {
  const { byId } = await customerLookup(repos);
  return rows.map((t) => ({ ...t, customerName: t.customerId ? (byId.get(t.customerId)?.companyName ?? null) : null, overdue: t.status !== 'Completed' && t.dueDate < now }));
}

export type { CrmCustomer };
