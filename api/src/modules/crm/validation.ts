import { z } from 'zod';
import { CUSTOMER_STATUSES, CUSTOMER_TYPES, FOLLOWUP_STATUSES, FOLLOWUP_TYPES, LEAD_STAGES, OPP_STAGES, PRIORITIES, QUOTE_STATUSES, TASK_STATUSES, TASK_TYPES } from '../../contracts/crm';
import { isIsoDate } from '../../lib/dates';
import { optionalText } from '../../lib/validate';
import { nullableBlank } from '../sampletrack/masters/validation';

const date = z.string().trim().refine(isIsoDate, 'Use a date like 2026-04-01');
const optDate = nullableBlank(date);
const id = z.string().trim().min(1).max(64);
const t = (n = 120) => optionalText(n);
const name = (label: string, max = 160) => z.string().trim().min(1, `${label} is required`).max(max);
const mobile = z
  .string()
  .trim()
  .min(1, 'Mobile is required')
  .max(20)
  .regex(/^[+\d][\d\s-]{5,}$/, 'Enter a phone number');
const optMobile = nullableBlank(mobile);
const paise = (label: string) => z.coerce.number({ error: `${label} must be a number` }).int().min(0, `${label} can’t be negative`).max(1e13);
const optPaise = (label: string) => nullableBlank(paise(label));
const email = nullableBlank(z.string().trim().max(160).email('Enter a valid email address'));
const time = nullableBlank(
  z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30'),
);
const pick = <T extends readonly [string, ...string[]]>(xs: T, msg: string) => z.enum(xs, { error: msg });
const optPick = <T extends readonly [string, ...string[]]>(xs: T, msg: string) => nullableBlank(pick(xs, msg));

// Each record: a create schema with defaults and an update schema without them (a default survives
// .partial() and would reset fields on PATCH).

const leadFields = {
  dateAdded: date,
  companyName: name('Company name'),
  contactPerson: t(),
  contactPerson2: t(),
  mobile,
  mobile2: optMobile,
  altMobile: optMobile,
  whatsapp: optMobile,
  email,
  city: t(80),
  state: t(80),
  pincode: t(10),
  address: t(500),
  customerType: optPick(CUSTOMER_TYPES, 'Pick a customer type'),
  product: t(80),
  source: t(80),
  campaign: t(120),
  salesperson: t(80),
  stage: pick(LEAD_STAGES, 'Pick a stage'),
  nextAction: t(200),
  nextFollowUpDate: optDate,
  remarks: t(1000),
};
export const leadCreateBody = z.object({ ...leadFields, dateAdded: nullableBlank(date), stage: leadFields.stage.default('New Lead') });
export const leadUpdateBody = z.object(leadFields).partial();
export const duplicateQuery = z.object({ companyName: t(160), mobile: t(20), email: t(160), city: t(80), except: z.string().max(64).optional() });

const customerFields = {
  companyName: name('Company name'),
  contactPerson: t(),
  contactPerson2: t(),
  designation: t(80),
  mobile,
  mobile2: optMobile,
  whatsapp: optMobile,
  email,
  website: t(200),
  city: t(80),
  state: t(80),
  pincode: t(10),
  address: t(500),
  gstin: nullableBlank(
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^\d{2}[A-Z0-9]{13}$/, 'A GSTIN is 15 characters and starts with the 2-digit state code'),
  ),
  pan: t(10),
  customerType: optPick(CUSTOMER_TYPES, 'Pick a customer type'),
  estMonthlyReq: t(),
  productsUsed: t(),
  currentSupplier: t(),
  approxPurchaseValue: t(),
  preferredThickness: t(),
  preferredSize: t(),
  application: t(),
  existingBrand: t(),
  competitorBrand: t(),
  paymentPreference: t(),
  creditRequirement: t(),
  territory: t(),
  leadSource: t(80),
  salesperson: t(80),
  status: pick(CUSTOMER_STATUSES, 'Pick a status'),
  priority: pick(PRIORITIES, 'Pick a priority'),
  nextFollowUp: optDate,
  remarks: t(1000),
  salesCustomerId: nullableBlank(id),
};
export const customerCreateBody = z.object({ ...customerFields, status: customerFields.status.default('Active'), priority: customerFields.priority.default('Warm') });
export const customerUpdateBody = z.object(customerFields).partial();

const followupFields = {
  customerId: id,
  date,
  time,
  type: pick(FOLLOWUP_TYPES, 'Pick a follow-up type'),
  contactPerson: t(),
  salesperson: t(80),
  discussion: t(2000),
  customerResponse: t(2000),
  nextAction: t(200),
  nextFollowUpDate: optDate,
  status: pick(FOLLOWUP_STATUSES, 'Pick a status'),
  priority: pick(PRIORITIES, 'Pick a priority'),
};
export const followupCreateBody = z.object({ ...followupFields, date: nullableBlank(date), type: followupFields.type.default('Call'), status: followupFields.status.default('Pending'), priority: followupFields.priority.optional() });
export const followupUpdateBody = z.object(followupFields).omit({ customerId: true }).partial();

const oppFields = {
  customerId: id,
  product: name('Product', 80),
  thickness: t(40),
  size: t(40),
  quantity: t(80),
  estValuePaise: paise('Estimated value'),
  expectedClosingDate: optDate,
  salesperson: t(80),
  stage: pick(OPP_STAGES, 'Pick a stage').refine((s) => s !== 'Order Won' && s !== 'Order Lost', 'Use Won or Lost to close an opportunity'),
  probability: z.coerce.number().int().min(0).max(100),
  competitor: t(),
  currentSupplier: t(),
  notes: t(2000),
};
export const oppCreateBody = z.object({ ...oppFields, estValuePaise: oppFields.estValuePaise.default(0), stage: oppFields.stage.default('Qualification'), probability: oppFields.probability.default(25) });
export const oppUpdateBody = z.object(oppFields).partial();

export const wonBody = z.object({
  ratePaise: paise('Rate').default(0),
  orderValuePaise: paise('Order value'),
  dispatchDate: optDate,
  reason: t(1000),
  remarks: t(1000),
});
export const wonUpdateBody = wonBody.partial();
export const lostBody = z.object({
  competitor: t(),
  competitorPricePaise: optPaise('Competitor price'),
  ourPricePaise: optPaise('Our price'),
  expectedPricePaise: optPaise('Expected price'),
  lostReason: name('Lost reason', 80),
  remarks: t(1000),
  reactivationDate: optDate,
});
export const lostUpdateBody = lostBody.partial();

const quoteFields = {
  customerId: id,
  opportunityId: nullableBlank(id),
  product: name('Product', 80),
  quantity: z.coerce.number({ error: 'Quantity must be a number' }).positive('Quantity must be more than 0').max(1e9),
  ratePaise: paise('Rate'),
  gstPct: z.coerce.number().min(0).max(28),
  date,
  validUntil: optDate,
  salesperson: t(80),
  status: pick(QUOTE_STATUSES, 'Pick a status'),
  remarks: t(1000),
};
export const quoteCreateBody = z.object({ ...quoteFields, gstPct: quoteFields.gstPct.default(18), status: quoteFields.status.default('Draft'), date: nullableBlank(date) });
export const quoteUpdateBody = z.object(quoteFields).partial();

const taskFields = {
  type: pick(TASK_TYPES, 'Pick a task type'),
  customerId: nullableBlank(id),
  assignedTo: t(80),
  dueDate: date,
  priority: pick(PRIORITIES, 'Pick a priority'),
  status: pick(TASK_STATUSES, 'Pick a status'),
  remarks: t(1000),
};
export const taskCreateBody = z.object({ ...taskFields, priority: taskFields.priority.default('Warm'), status: taskFields.status.default('Pending') });
export const taskUpdateBody = z.object(taskFields).partial();

const campaignFields = { name: name('Campaign name', 120), platform: t(80), startDate: optDate, endDate: optDate, budgetPaise: paise('Budget'), targetAudience: t(200), product: t(80) };
export const campaignCreateBody = z.object({ ...campaignFields, budgetPaise: campaignFields.budgetPaise.default(0) });
export const campaignUpdateBody = z.object(campaignFields).partial();

const productFields = { name: name('Product name', 80), thickness: t(60), size: t(60), grade: t(60), application: t(120), ratePaise: paise('Rate'), moq: t(60), active: z.boolean() };
export const productCreateBody = z.object({ ...productFields, ratePaise: productFields.ratePaise.default(0), active: productFields.active.default(true) });
export const productUpdateBody = z.object(productFields).partial();

const spFields = { name: name('Name', 80), mobile: optMobile, email, territory: t(80), designation: t(80), active: z.boolean() };
export const salespersonCreateBody = z.object({ ...spFields, active: spFields.active.default(true) });
export const salespersonUpdateBody = z.object(spFields).partial();

const list = (label: string) =>
  z
    .array(z.string().trim().min(1).max(80))
    .max(200)
    .transform((xs) => [...new Set(xs)])
    .refine((xs) => xs.length > 0, `Keep at least one ${label}`);
export const settingsBody = z.object({ sources: list('source'), lostReasons: list('lost reason') }).partial();
