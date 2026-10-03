import { z } from 'zod';
import { DELIVERY_TYPES, FREIGHT_PAID_BY, ORDER_STATUSES } from '../../contracts/transport';
import { isIsoDate } from '../../lib/dates';
import { optionalText } from '../../lib/validate';
import { nullableBlank } from '../sampletrack/masters/validation';

const date = z.string().trim().refine(isIsoDate, 'Use a date like 2026-04-01');
const optDate = nullableBlank(date);
const id = z.string().trim().min(1).max(64);
const t = (n = 120) => optionalText(n);
const name = (label: string, max = 160) => z.string().trim().min(1, `${label} is required`).max(max);
const phone = z
  .string()
  .trim()
  .min(1, 'Mobile is required')
  .max(20)
  .regex(/^[+\d][\d\s-]{5,}$/, 'Enter a phone number');
const paise = (label: string) => z.coerce.number({ error: `${label} must be a number` }).int().min(0, `${label} can’t be negative`).max(1e13);
const pincode = nullableBlank(
  z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'A pincode is 6 digits'),
);
const place = z.object({ city: name('City', 80), state: t(80), pincode });

// Each record: a create schema with defaults and an update schema without them (a default survives
// .partial() and would reset fields on PATCH).

const vehicleFields = { name: name('Vehicle type', 60), description: t(120), capacity: t(40), active: z.boolean() };
export const vehicleCreateBody = z.object({ ...vehicleFields, active: vehicleFields.active.default(true) });
export const vehicleUpdateBody = z.object(vehicleFields).partial();

const transporterFields = {
  name: name('Name'),
  contactPerson: t(80),
  phone,
  phone2: nullableBlank(phone),
  email: nullableBlank(z.string().trim().max(160).email('Enter a valid email address')),
  address: t(300),
  city: name('City', 80),
  state: t(80),
  pincode,
  gstin: nullableBlank(
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^\d{2}[A-Z0-9]{13}$/, 'A GSTIN is 15 characters and starts with the 2-digit state code'),
  ),
  pan: nullableBlank(
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'A PAN looks like ABCDE1234F'),
  ),
  tds: z.boolean(),
  creditTerms: z.string().trim().min(1).max(40),
  ifsc: nullableBlank(
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'An IFSC looks like SBIN0001234'),
  ),
  bankName: t(80),
  bankBranch: t(80),
  accountName: t(120),
  accountNo: nullableBlank(
    z
      .string()
      .trim()
      .regex(/^\d{6,20}$/, 'Account numbers are 6–20 digits'),
  ),
  vehicles: z.array(z.string().trim().min(1).max(60)).max(30).min(1, 'Pick at least one vehicle type'),
  operatingCities: z.array(place).max(100),
  rating: z.coerce.number().int().min(1).max(5),
  active: z.boolean(),
};
export const transporterCreateBody = z.object({ ...transporterFields, tds: transporterFields.tds.default(false), creditTerms: transporterFields.creditTerms.default('Against Delivery'), operatingCities: transporterFields.operatingCities.default([]), rating: transporterFields.rating.default(3), active: transporterFields.active.default(true) });
export const transporterUpdateBody = z.object(transporterFields).partial();

const inquiryFields = {
  date,
  from: place,
  to: place,
  material: name('Material', 120),
  weightMt: nullableBlank(z.coerce.number().positive('Weight must be more than 0').max(1000)),
  vehicle: name('Vehicle type', 60),
  pickupDate: optDate,
  deliveryType: z.enum(DELIVERY_TYPES),
  freightPaidBy: z.enum(FREIGHT_PAID_BY),
  budgetPaise: paise('Budget'),
  remarks: t(1000),
};
export const inquiryCreateBody = z.object({ ...inquiryFields, date: nullableBlank(date), deliveryType: inquiryFields.deliveryType.default('Door Delivery'), freightPaidBy: inquiryFields.freightPaidBy.default('Strandply'), budgetPaise: inquiryFields.budgetPaise.default(0) });
export const inquiryUpdateBody = z.object(inquiryFields).partial();

const quote = z.object({
  transporterId: id,
  ratePaise: paise('Rate'),
  transit: z.string().trim().min(1).max(20).default('2 Days'),
  mgWeightMt: nullableBlank(z.coerce.number().min(0).max(1000)),
});
/** Save the comparison as a draft: quotes, and optionally the chosen one and a justification. */
export const rcSaveBody = z.object({
  quotes: z.array(quote).max(20),
  selected: z.number().int().min(0).nullable().default(null),
  justification: t(1000),
});
export const decisionBody = z.object({ decision: z.enum(['approve', 'reject']), note: optionalText(500) });

export const orderUpdateBody = z
  .object({ status: z.enum(ORDER_STATUSES), deliveredOn: optDate, remarks: t(1000), pickupDate: optDate })
  .partial();
