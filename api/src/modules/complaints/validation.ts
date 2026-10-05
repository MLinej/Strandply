import { z } from 'zod';
import { CP_CATEGORIES, CP_MATERIALS, CP_PRIORITIES, CP_STATUSES } from '../../contracts/complaints';
import { isIsoDate } from '../../lib/dates';
import { optionalText } from '../../lib/validate';
import { nullableBlank } from '../sampletrack/masters/validation';

const date = z.string().trim().refine(isIsoDate, 'Use a date like 2026-04-01');
const required = (label: string, max: number) => z.string().trim().min(1, `${label} is required`).max(max);
const email = nullableBlank(z.string().trim().max(160).email('Enter a valid email address'));
const id = nullableBlank(z.string().trim().max(64));

export const recipientCreateBody = z.object({ name: required('Name', 80), role: optionalText(80), email, active: z.boolean().default(true) });
export const recipientUpdateBody = z.object({ name: required('Name', 80), role: optionalText(80), email, active: z.boolean() }).partial();

// The legacy form required date, salesman, customer, material, category, description and a recipient.
const complaintFields = {
  date,
  salesman: required('Salesman', 80),
  customerId: id,
  customerName: required('Customer', 160),
  customerPhone: nullableBlank(z.string().trim().max(20).regex(/^[+\d][\d\s-]{5,}$/, 'Enter a phone number')),
  customerLocation: optionalText(80),
  invoiceId: id,
  material: z.enum(CP_MATERIALS, { error: 'Pick the material' }),
  category: z.enum(CP_CATEGORIES, { error: 'Pick the category' }),
  priority: z.enum(CP_PRIORITIES),
  description: required('Description', 4000),
  /** A recipient from the list, or a typed email ("Other"). */
  recipientId: id,
  recipientEmail: email,
};
export const complaintCreateBody = z
  .object({ ...complaintFields, date: nullableBlank(date), priority: complaintFields.priority.default('Medium') })
  .refine((c) => c.recipientId || c.recipientEmail, { path: ['recipientId'], message: 'Pick who to notify' });
export const complaintUpdateBody = z.object(complaintFields).partial();

export const statusBody = z.object({ status: z.enum(CP_STATUSES), note: optionalText(500) });
