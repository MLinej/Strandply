import { z } from 'zod';
import { DEALER_TYPES, EMAIL_DOCS, FIRM_IDS, PI_STATUSES, SALES_TAX_TYPES, SO_STATUSES } from '../../contracts/sales';
import { isIsoDate } from '../../lib/dates';
import { optionalText } from '../../lib/validate';
import { nullableBlank } from '../sampletrack/masters/validation';

const date = z.string().trim().refine(isIsoDate, 'Use a date like 2026-04-01');
const optDate = nullableBlank(date);
const id = z.string().trim().min(1).max(64);
const num = (label: string, max = 1e9) => z.coerce.number({ error: `${label} must be a number` }).min(0, `${label} can’t be negative`).max(max);
const pos = (label: string, max = 1e9) => num(label, max).refine((v) => v > 0, `${label} must be more than 0`);
const int = (label: string, max = 1e7) => z.coerce.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(0, `${label} can’t be negative`).max(max);
const paise = (label: string) => int(label, 1e13);
const firm = z.enum(FIRM_IDS, { error: 'Pick LLP or OSB' });
const taxType = z.enum(SALES_TAX_TYPES, { error: 'Pick SG+CG or IGST' });
const gstPct = num('GST %', 28);
const name = (label: string, max = 160) => z.string().trim().min(1, `${label} is required`).max(max);
const gstin = nullableBlank(
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\d{2}[A-Z0-9]{13}$/, 'A GSTIN is 15 characters and starts with the 2-digit state code'),
);
const email = nullableBlank(z.string().trim().max(160).email('Enter a valid email address'));

// Each record: a create schema with defaults and an update schema without them (a default survives
// .partial() and would reset fields on PATCH).

// ── Masters ─────────────────────────────────────────────────────────

const customerFields = {
  name: name('Customer name'),
  code: optionalText(40),
  dealerType: z.enum(DEALER_TYPES, { error: 'Pick a type' }),
  gstin,
  pan: nullableBlank(
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'A PAN looks like ABCDE1234F'),
  ),
  group: z.string().trim().min(1).max(80),
  address: optionalText(500),
  city: optionalText(80),
  state: optionalText(80),
  country: z.string().trim().min(1).max(60),
  pincode: nullableBlank(
    z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'A pincode is 6 digits'),
  ),
  contactPerson: optionalText(80),
  mobile1: optionalText(40),
  mobile2: optionalText(40),
  email,
  creditDays: int('Credit days', 3650),
  creditLimitPaise: paise('Credit limit'),
  transportPref: optionalText(120),
  paymentTerms: optionalText(60),
  /** Only used when there's no GSTIN; with one, the tax type follows its state code. */
  taxTypes: z.object({ llp: taxType, osb: taxType }).partial(),
  active: z.boolean(),
};
export const customerCreateBody = z.object({
  ...customerFields,
  dealerType: customerFields.dealerType.default('Dealer'),
  group: customerFields.group.default('SUNDRY DEBTORS'),
  country: customerFields.country.default('India'),
  creditDays: customerFields.creditDays.default(0),
  creditLimitPaise: customerFields.creditLimitPaise.default(0),
  taxTypes: customerFields.taxTypes.default({}),
  active: customerFields.active.default(true),
});
export const customerUpdateBody = z.object(customerFields).partial();

const itemFields = {
  name: name('Item name'),
  brand: z.string().trim().min(1, 'Pick a brand').max(60),
  grade: z.string().trim().min(1, 'Pick a grade').max(40),
  subType: optionalText(80),
  thic: pos('Thickness', 100),
  width: pos('Width', 10000),
  length: pos('Length', 10000),
  /** Blank = width × length. */
  sqmFactor: nullableBlank(pos('Sq m factor', 100)),
  defaultRatePaise: paise('Default rate'),
  hsn: optionalText(12),
  active: z.boolean(),
};
export const itemCreateBody = z.object({ ...itemFields, defaultRatePaise: itemFields.defaultRatePaise.default(0), active: itemFields.active.default(true) });
export const itemUpdateBody = z.object(itemFields).partial();

export const priceCreateBody = z.object({ itemId: id, effectiveDate: date, ratePaise: paise('Rate').refine((v) => v > 0, 'Rate must be more than 0') });
export const priceUpdateBody = priceCreateBody.partial();
export const weightCreateBody = z.object({ itemId: id, effectiveDate: date, weightKg: pos('Weight per board', 10000) });
export const weightUpdateBody = weightCreateBody.partial();

// ── Proformas and orders ────────────────────────────────────────────

/** A line picks an item from the master (its details are copied in) or names a free item. */
const orderLine = z
  .object({
    itemId: nullableBlank(id),
    itemName: optionalText(200),
    brand: optionalText(60),
    pcs: int('Pcs'),
    qtySqm: num('Sq m', 1e7),
    ratePaise: paise('Rate'),
    weightKg: num('Weight per board', 10000).default(0),
  })
  .refine((l) => l.itemId || l.itemName, { message: 'Pick an item', path: ['itemId'] })
  .refine((l) => l.qtySqm > 0, { message: 'Enter the quantity', path: ['qtySqm'] });
const lines = z.array(orderLine).min(1, 'Add at least one item with quantity').max(100);

const orderCommon = {
  date,
  billToId: id,
  /** Blank = the bill-to party. */
  shipToId: nullableBlank(id),
  salesPerson: optionalText(80),
  paymentTerms: optionalText(60),
  deliveryTerms: optionalText(60),
  lines,
  freightPaise: paise('Freight'),
  gstPct,
  remarks: optionalText(1000),
};

const proformaFields = { ...orderCommon, validUntil: optDate, poRef: optionalText(80), status: z.enum(PI_STATUSES).exclude(['confirmed']) };
export const proformaCreateBody = z.object({
  ...proformaFields,
  firm,
  freightPaise: proformaFields.freightPaise.default(0),
  gstPct: proformaFields.gstPct.default(18),
  status: proformaFields.status.default('draft'),
});
export const proformaUpdateBody = z.object(proformaFields).partial();

const orderFields = { ...orderCommon, poNo: optionalText(80), poDate: optDate, edd: optDate, status: z.enum(SO_STATUSES) };
export const orderCreateBody = z.object({
  ...orderFields,
  firm,
  freightPaise: orderFields.freightPaise.default(0),
  gstPct: orderFields.gstPct.default(18),
  status: orderFields.status.default('draft'),
});
export const orderUpdateBody = z.object(orderFields).partial();

export const statusBody = z.object({ status: z.string().trim().min(1).max(20) });

export const dispatchBody = z.object({
  date: optDate,
  vehicleNo: optionalText(30),
  transporter: optionalText(160),
  transporterGstin: gstin,
  lrNo: optionalText(40),
  driverName: optionalText(80),
  driverMobile: optionalText(40),
});

// ── Invoices ────────────────────────────────────────────────────────

/** Invoice lines come from the sales order's lines; only the dispatched quantity and rate are entered. */
const invoiceLine = z.object({
  soLine: int('Order line', 1000),
  pcs: int('Pcs'),
  qtySqm: num('Sq m', 1e7),
  ratePaise: paise('Rate'),
});
const invoiceFields = {
  date,
  soId: id,
  lines: z
    .array(invoiceLine)
    .max(100)
    .transform((ls) => ls.filter((l) => l.qtySqm > 0))
    .refine((ls) => ls.length > 0, 'Enter the dispatched quantity on at least one line'),
  /** Blank = from the bill-to party’s GSTIN. */
  taxType: taxType.nullish(),
  freightPaise: paise('Freight'),
  gstPct,
  irn: optionalText(80),
  ewayBill: optionalText(40),
  weightTons: nullableBlank(num('Weight', 1e5)),
  remarks: optionalText(1000),
};
export const invoiceCreateBody = z.object({ ...invoiceFields, freightPaise: invoiceFields.freightPaise.default(0), gstPct: invoiceFields.gstPct.default(18) });
export const invoiceUpdateBody = z.object(invoiceFields).omit({ soId: true }).partial();

// ── FG stock, inter-company, settings ───────────────────────────────

const fgFields = {
  firm,
  grade: z.string().trim().min(1, 'Pick a grade').max(40),
  thic: pos('Thickness', 100),
  width: pos('Width', 10000),
  length: pos('Length', 10000),
  qtyOnHandSqm: num('Quantity on hand', 1e8),
  reorderSqm: num('Reorder level', 1e8),
};
export const fgCreateBody = z.object({ ...fgFields, reorderSqm: fgFields.reorderSqm.default(0) });
export const fgUpdateBody = z.object(fgFields).partial();

const icFields = {
  billingDoc: name('Billing document', 40),
  billingDate: date,
  materialDesc: name('Material', 200),
  grade: optionalText(40),
  thic: nullableBlank(pos('Thickness', 100)),
  width: nullableBlank(pos('Width', 10000)),
  length: nullableBlank(pos('Length', 10000)),
  pcs: int('Pcs'),
  qtySqm: num('Quantity', 1e7),
  ratePaise: paise('Rate'),
  cgstPaise: paise('CGST'),
  sgstPaise: paise('SGST'),
  igstPaise: paise('IGST'),
  freightPaise: paise('Freight'),
  vehicleNo: optionalText(30),
};
export const icCreateBody = z.object({ ...icFields, cgstPaise: icFields.cgstPaise.default(0), sgstPaise: icFields.sgstPaise.default(0), igstPaise: icFields.igstPaise.default(0), freightPaise: icFields.freightPaise.default(0) });
export const icUpdateBody = z.object(icFields).partial();

const list = (label: string) =>
  z
    .array(z.string().trim().min(1).max(80))
    .max(200)
    .transform((xs) => [...new Set(xs)])
    .refine((xs) => xs.length > 0, `Keep at least one ${label}`);
const emailList = z.array(z.string().trim().email('Enter valid email addresses')).max(20);
const template = z.object({ subject: z.string().trim().min(1, 'Subject is required').max(200), body: z.string().trim().min(1, 'Body is required').max(5000) });
const stateCode = z
  .string()
  .trim()
  .regex(/^\d{2}$/, 'A state code is 2 digits');
export const settingsBody = z
  .object({
    paymentTerms: list('payment term'),
    deliveryTerms: list('delivery term'),
    salesPersons: z
      .array(z.string().trim().min(1).max(80))
      .max(200)
      .transform((xs) => [...new Set(xs)]),
    brands: list('brand'),
    grades: list('grade'),
    firmStateCodes: z.object({ llp: stateCode, osb: stateCode }),
    /** Per document; the ones left out keep their current value. */
    emailRecipients: z.object(Object.fromEntries(EMAIL_DOCS.map((d) => [d, emailList])) as Record<(typeof EMAIL_DOCS)[number], typeof emailList>).partial(),
    emailTemplates: z.object(Object.fromEntries(EMAIL_DOCS.map((d) => [d, template])) as Record<(typeof EMAIL_DOCS)[number], typeof template>).partial(),
  })
  .partial();
