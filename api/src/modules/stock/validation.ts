import { z } from 'zod';
import { DEPARTMENTS, FAMILY_IDS, RECLASS_SCENARIO_LABELS, SHIFTS, SLIP_TYPES } from '../../contracts/stock';
import { isIsoDate } from '../../lib/dates';
import { optionalText } from '../../lib/validate';
import { nullableBlank } from '../sampletrack/masters/validation';

const date = z.string().trim().refine(isIsoDate, 'Use a date like 2026-04-01');
const id = z.string().trim().min(1).max(64);
const thick = nullableBlank(z.string().trim().regex(/^\d{2}$/, 'Thickness is two digits, like 09'));
const qty = z.coerce
  .number({ error: 'Quantity must be a number' })
  .positive('Quantity must be more than 0')
  .max(1e9)
  .refine((v) => Math.round(v * 1000) === v * 1000, 'Up to 3 decimals');
const side = z.object({ groupId: id, thick });

const groupFields = {
  prefix: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Prefix is required')
    .max(20)
    .regex(/^[A-Z0-9][A-Z0-9-]*$/, 'Letters, digits and dashes only'),
  label: z.string().trim().min(1, 'Description is required').max(120),
  family: z.enum(FAMILY_IDS),
  dept: z.enum(DEPARTMENTS, { error: 'Pick a department' }),
  size: optionalText(30),
  grade: optionalText(10),
  unit: z.string().trim().min(1).max(10),
  thicknesses: z
    .array(z.string().trim().regex(/^\d{2}$/, 'Thicknesses are two digits, like 09'))
    .max(30)
    .transform((t) => [...new Set(t)].sort()),
};
// Defaults on the create schema only (a default survives .partial() and would reset fields on PATCH).
export const groupCreateBody = z.object({ ...groupFields, unit: groupFields.unit.default('pcs'), thicknesses: groupFields.thicknesses.default([]) });
export const groupUpdateBody = z.object(groupFields).partial();
export type GroupCreate = z.infer<typeof groupCreateBody>;
export type GroupUpdate = z.infer<typeof groupUpdateBody>;

export const slipCreateBody = z.object({
  type: z.enum(SLIP_TYPES),
  date: date.optional(),
  from: side,
  to: side,
  qty,
  batch: optionalText(40),
  refNo: optionalText(60),
  shift: nullableBlank(z.enum(SHIFTS)),
  remarks: optionalText(500),
});
export type SlipCreate = z.infer<typeof slipCreateBody>;

export const openingCreateBody = z.object({ date: date.optional(), item: side, qty, note: optionalText(300) });
export type OpeningCreate = z.infer<typeof openingCreateBody>;

export const reclassCreateBody = z.object({
  date: date.optional(),
  scenario: z.enum(RECLASS_SCENARIO_LABELS).default('Custom'),
  from: side,
  to: side,
  qty,
  reason: z.string().trim().min(1, 'Reason is required').max(500),
  ref: optionalText(60),
});
export type ReclassCreate = z.infer<typeof reclassCreateBody>;
