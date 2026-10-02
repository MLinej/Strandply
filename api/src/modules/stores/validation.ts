import { z } from 'zod';
import { QUALITY_IDS, STORE_MATERIAL_IDS, STORE_UNITS } from '../../contracts/stores';
import { isIsoDate } from '../../lib/dates';
import { optionalText } from '../../lib/validate';
import { nullableBlank } from '../sampletrack/masters/validation';

const date = z.string().trim().refine(isIsoDate, 'Use a date like 2026-04-01');
const time = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30');
const id = z.string().trim().min(1).max(64);
const qty = (label: string) => z.coerce.number({ error: `${label} must be a number` }).min(0, `${label} can’t be negative`).max(1e9);
const required = (label: string, max: number) => z.string().trim().min(1, `${label} is required`).max(max);

const mrnItem = z.object({
  /** Keep an existing line's id on edit; new lines get one from the server. */
  id: nullableBlank(id),
  material: z.enum(STORE_MATERIAL_IDS, { error: 'Pick a material' }),
  approxQty: qty('Approx quantity').refine((v) => v > 0, 'Approx quantity must be more than 0'),
  unit: z.enum(STORE_UNITS),
  packages: optionalText(40),
  remarks: optionalText(300),
});

const mrnFields = {
  /** Ignored while auto-punch is on (the server stamps the time). */
  date: date.optional(),
  time: time.optional(),
  vehicleNo: required('Vehicle number', 20).transform((v) => v.toUpperCase().replace(/\s+/g, '')),
  securityName: required('Security guard name', 80),
  driverName: optionalText(80),
  driverPhone: nullableBlank(z.string().trim().regex(/^[0-9+\-\s]{6,15}$/, 'Enter a valid phone number')),
  vendorId: nullableBlank(id),
  vendorName: required('Vendor', 200),
  invoiceNo: optionalText(60),
  remarks: optionalText(1000),
  items: z.array(mrnItem).min(1, 'Add at least one material').max(20),
};
export const mrnCreateBody = z.object(mrnFields);
export const mrnUpdateBody = z.object(mrnFields).partial();
export type MrnCreate = z.infer<typeof mrnCreateBody>;
export type MrnUpdate = z.infer<typeof mrnUpdateBody>;

const grnItem = z.object({
  id: nullableBlank(id),
  /** The MRN line received; null for an unlisted / extra item. */
  mrnItemId: nullableBlank(id),
  /** Required for unlisted items; taken from the MRN line otherwise. */
  material: z.enum(STORE_MATERIAL_IDS).nullish(),
  actualQty: qty('Actual quantity').refine((v) => v > 0, 'Actual quantity must be more than 0'),
  unit: z.enum(STORE_UNITS),
  quality: z.enum(QUALITY_IDS),
  qualityRemarks: optionalText(300),
});

const grnFields = {
  date: date.optional(),
  time: time.optional(),
  vendorName: required('Vendor', 200).optional(),
  invoiceNo: required('Invoice / bill number', 60),
  receivedByName: required('Received by', 80),
  remarks: optionalText(1000),
  items: z.array(grnItem).min(1, 'Enter the actual quantity for at least one item').max(30),
};
export const grnCreateBody = z.object({ mrnId: id, ...grnFields });
export const grnUpdateBody = z.object(grnFields).partial();
export type GrnCreate = z.infer<typeof grnCreateBody>;
export type GrnUpdate = z.infer<typeof grnUpdateBody>;

export const accountBody = z.object({ voucherNo: required('Voucher / entry number', 60) });

export const settingsBody = z.object({ autoPunchMrn: z.boolean().optional(), autoPunchGrn: z.boolean().optional() });
