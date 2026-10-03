import { fyLabel, fyOf } from '../../contracts/purchase';
import {
  counterName,
  DEFAULT_BRANDS,
  DEFAULT_DELIVERY_TERMS,
  DEFAULT_EMAIL_RECIPIENTS,
  DEFAULT_EMAIL_TEMPLATES,
  DEFAULT_FIRM_STATE_CODES,
  DEFAULT_GRADES,
  DEFAULT_PAYMENT_TERMS,
  docNumber,
  EMAIL_DOCS,
  lineAmount,
  round4,
  taxTypeFor,
  type Customer,
  type EmailDoc,
  type EmailTemplate,
  type Firm,
  type OrderLine,
  type SalesSettings,
  type SalesTaxType,
} from '../../contracts/sales';
import type { Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { validationFailed } from '../../lib/errors';
import type { Repos } from '../../repos';

export const SETTING_KEYS = {
  paymentTerms: 'sales.payment_terms',
  deliveryTerms: 'sales.delivery_terms',
  salesPersons: 'sales.sales_persons',
  brands: 'sales.brands',
  grades: 'sales.grades',
  firmStateCodes: 'sales.firm_state_codes',
  emailRecipients: 'sales.email_recipients',
  emailTemplates: 'sales.email_templates',
} as const satisfies Record<keyof SalesSettings, string>;

export async function readSettings(repos: Repos): Promise<SalesSettings> {
  const v = await repos.settings.getMany(Object.values(SETTING_KEYS));
  const arr = (x: unknown, d: string[]) => (Array.isArray(x) ? (x as unknown[]).map(String) : [...d]);
  const obj = <T extends object>(x: unknown, d: T): T => (x && typeof x === 'object' && !Array.isArray(x) ? { ...d, ...(x as T) } : structuredClone(d));
  const recipients = obj<Record<EmailDoc, string[]>>(v[SETTING_KEYS.emailRecipients], DEFAULT_EMAIL_RECIPIENTS);
  const templates = obj<Record<EmailDoc, EmailTemplate>>(v[SETTING_KEYS.emailTemplates], DEFAULT_EMAIL_TEMPLATES);
  return {
    paymentTerms: arr(v[SETTING_KEYS.paymentTerms], DEFAULT_PAYMENT_TERMS),
    deliveryTerms: arr(v[SETTING_KEYS.deliveryTerms], DEFAULT_DELIVERY_TERMS),
    salesPersons: arr(v[SETTING_KEYS.salesPersons], []),
    brands: arr(v[SETTING_KEYS.brands], DEFAULT_BRANDS),
    grades: arr(v[SETTING_KEYS.grades], DEFAULT_GRADES),
    firmStateCodes: obj(v[SETTING_KEYS.firmStateCodes], DEFAULT_FIRM_STATE_CODES),
    emailRecipients: Object.fromEntries(EMAIL_DOCS.map((d) => [d, arr(recipients[d], DEFAULT_EMAIL_RECIPIENTS[d])])) as Record<EmailDoc, string[]>,
    emailTemplates: Object.fromEntries(EMAIL_DOCS.map((d) => [d, { ...DEFAULT_EMAIL_TEMPLATES[d], ...templates[d] }])) as Record<EmailDoc, EmailTemplate>,
  };
}

export const today = (clock: Clock) => businessToday(clock);
export const currentFy = (clock: Clock) => fyOf(businessToday(clock));

/** This FY back to 2024-25, newest first. */
export function fyOptions(clock: Clock): string[] {
  const cur = Number(currentFy(clock).slice(0, 4));
  const out: string[] = [];
  for (let y = cur; y >= Math.min(cur, 2024); y--) out.push(fyLabel(y));
  return out;
}

/** The next number for a document dated `date`: one counter per kind, firm and FY, taken in the insert's unit of work. */
export async function nextNo(tx: Repos, kind: 'order' | 'proforma' | 'invoice', firm: Firm, date: string, at: string) {
  const fy = fyOf(date);
  return docNumber(kind, firm, await tx.counters.next(counterName(kind, firm, fy), at), fy);
}

/** Names of the given users. */
export async function nameMap(repos: Repos, ids: (string | null)[]) {
  const users = await repos.users.getByIds([...new Set(ids.filter((x): x is string => !!x))]);
  return (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? null) : null);
}

export const badRef = (path: string, message: string) => validationFailed('Invalid input', [{ path, message }]);

/** A party's tax type for a firm: from its GSTIN's state code, or what's set on the party when it has none. */
export const partyTaxType = (c: Pick<Customer, 'gstin' | 'taxTypes'>, firm: Firm, s: SalesSettings): SalesTaxType =>
  c.gstin ? taxTypeFor(c.gstin, s.firmStateCodes[firm]) : (c.taxTypes[firm] ?? 'SG+CG');

/** Bill-to and ship-to (blank ship-to = bill-to). New documents need active parties. */
export async function resolveParties(tx: Repos, billToId: string, shipToId: string | null | undefined, opts: { requireActive: boolean }) {
  const bill = await tx.salesCustomers.getById(billToId);
  if (!bill) throw badRef('billToId', 'Unknown party');
  const ship = shipToId && shipToId !== billToId ? await tx.salesCustomers.getById(shipToId) : bill;
  if (!ship) throw badRef('shipToId', 'Unknown party');
  if (opts.requireActive) {
    if (!bill.active) throw badRef('billToId', `${bill.name} is inactive`);
    if (!ship.active) throw badRef('shipToId', `${ship.name} is inactive`);
  }
  return { bill, ship, refs: { billToId: bill.id, billTo: bill.name, shipToId: ship.id, shipTo: ship.name, state: ship.state, city: ship.city } };
}

type LineInput = { itemId?: string | null; itemName?: string | null; brand?: string | null; pcs: number; qtySqm: number; ratePaise: number; weightKg?: number };

/** Order / proforma lines: master items are copied in so the document keeps them as they were. */
export async function buildOrderLines(tx: Repos, lines: LineInput[]): Promise<OrderLine[]> {
  const items = new Map((await tx.salesItems.listAll()).map((i) => [i.id, i]));
  return lines.map((l, n) => {
    const qtySqm = round4(l.qtySqm);
    const common = { pcs: l.pcs, qtySqm, ratePaise: l.ratePaise, weightKg: l.weightKg ?? 0, amountPaise: lineAmount(qtySqm, l.ratePaise) };
    if (l.itemId) {
      const it = items.get(l.itemId);
      if (!it) throw badRef(`lines.${n}.itemId`, 'Unknown item');
      return { itemId: it.id, itemName: it.name, brand: l.brand ?? it.brand, grade: it.grade, subType: it.subType, thic: it.thic, width: it.width, length: it.length, hsn: it.hsn, sqmFactor: it.sqmFactor, ...common };
    }
    return { itemId: null, itemName: l.itemName!, brand: l.brand ?? null, grade: null, subType: null, thic: null, width: null, length: null, hsn: null, sqmFactor: l.pcs ? round4(qtySqm / l.pcs) : 0, ...common };
  });
}
