import { z } from 'zod';
import { MDO_TYPES, PLAN_SECTIONS, PRIORITIES, PRODUCTS, SHIFTS, WF_ACTIONS } from '../../contracts/production';
import { isIsoDate } from '../../lib/dates';
import { optionalText } from '../../lib/validate';
import { nullableBlank } from '../sampletrack/masters/validation';

const date = z.string().trim().refine(isIsoDate, 'Use a date like 2026-04-01');
const time = nullableBlank(
  z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30'),
);
const id = z.string().trim().min(1).max(64);
const num = (label: string) => z.coerce.number({ error: `${label} must be a number` }).min(0, `${label} can’t be negative`).max(1e9);
const pos = (label: string) => num(label).refine((v) => v > 0, `${label} must be more than 0`);
const int = (label: string) => z.coerce.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(0, `${label} can’t be negative`).max(1e7);
const optNum = (label: string) => nullableBlank(num(label));
const shift = z.enum(SHIFTS, { error: 'Pick a shift' });
const product = z.enum(PRODUCTS, { error: 'Pick a product' });
const size = z.string().trim().min(1, 'Pick a size').max(20);
const thickness = optionalText(10);
const base = { date, remarks: optionalText(1000) };

// Each kind: a create schema with defaults, and an update schema without them (a default survives
// .partial() and would reset fields on PATCH).

const processKeys = PLAN_SECTIONS.flatMap((s) => s.fields.map((f) => f.key)) as string[];
const planFields = {
  ...base,
  shift,
  planOp: optionalText(80),
  products: z
    .array(z.object({ product, size, thickness: z.string().trim().min(1, 'Pick a thickness').max(10), priority: z.enum(PRIORITIES), targetBoards: int('Target boards').refine((v) => v > 0, 'Target boards must be more than 0') }))
    .min(1, 'Add at least one product line')
    .max(20),
  mattWtKg: optNum('Matt weight'),
  matts: nullableBlank(int('Matts')),
  resinPerMattKg: optNum('Resin per matt'),
  wetWoodAvailKg: optNum('Wet wood available'),
  process: z
    .record(z.string(), z.string().trim().max(60))
    .refine((r) => Object.keys(r).every((k) => processKeys.includes(k)), 'Unknown process field')
    .transform((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== ''))),
  hotpressId: nullableBlank(id),
  mattBatchId: nullableBlank(id),
  cuttingId: nullableBlank(id),
};
export const planCreateBody = z.object({ ...planFields, process: planFields.process.default({}) });
export const planUpdateBody = z.object(planFields).partial();

const charge = z.object({ label: z.string().trim().max(40).default('Charge'), pcs: int('Pcs').refine((v) => v > 0, 'Pcs must be more than 0'), load: time, unload: time, remarks: optionalText(200) });
const hotpressFields = { ...base, shift, product, size, thickness, operator: optionalText(80), charges: z.array(charge).min(1, 'Add at least one charge with pcs').max(100) };
export const hotpressCreateBody = z.object(hotpressFields);
export const hotpressUpdateBody = z.object(hotpressFields).partial();

const lot = z.object({ purchaseEntryId: id, qty: pos('Quantity') });
const chippingFields = { ...base, shift, operator: optionalText(80), machine: optionalText(60), lots: z.array(lot).min(1, 'Add at least one lot').max(50) };
export const chippingCreateBody = z.object(chippingFields);
export const chippingUpdateBody = z.object(chippingFields).partial();

const resinFields = { ...base, shift, lot, product: nullableBlank(product), operator: optionalText(80) };
export const resinCreateBody = z.object(resinFields);
export const resinUpdateBody = z.object(resinFields).partial();

const cuttingFields = { ...base, shift, hotpressId: id, operator: optionalText(80), cutPcs: int('Cut pcs').refine((v) => v > 0, 'Cut pcs must be more than 0') };
export const cuttingCreateBody = z.object(cuttingFields);
export const cuttingUpdateBody = z.object(cuttingFields).partial();

const summaryFields = {
  ...base,
  product,
  size,
  thickness,
  batch: optionalText(40),
  hotpressId: nullableBlank(id),
  mattBatchId: nullableBlank(id),
  resinIds: z.array(id).max(20),
  cuttingId: nullableBlank(id),
  planId: nullableBlank(id),
  pressPcs: int('Press pcs'),
  boards: int('Boards'),
  boardRej: int('Board rejects'),
  mattPcs: int('Matt pcs'),
  mattWtKg: num('Matt weight'),
  mattRej: int('Matt rejects'),
  resinKg: num('Resin'),
  resinPaise: z.coerce.number().int().min(0).max(1e12),
  dryWoodKg: num('Dry wood'),
  wip: z.array(z.object({ wipId: id, qty: pos('WIP quantity') })).max(20),
};
export const summaryCreateBody = z.object({
  ...summaryFields,
  pressPcs: summaryFields.pressPcs.default(0),
  boards: summaryFields.boards.default(0),
  boardRej: summaryFields.boardRej.default(0),
  mattPcs: summaryFields.mattPcs.default(0),
  mattWtKg: summaryFields.mattWtKg.default(0),
  mattRej: summaryFields.mattRej.default(0),
  resinKg: summaryFields.resinKg.default(0),
  resinPaise: summaryFields.resinPaise.default(0),
  dryWoodKg: summaryFields.dryWoodKg.default(0),
  resinIds: summaryFields.resinIds.default([]),
  wip: summaryFields.wip.default([]),
});
export const summaryUpdateBody = z.object(summaryFields).partial();

const mdoItem = z.object({
  boardType: z.string().trim().min(1, 'Board type is required').max(60),
  thickness,
  paper: optionalText(60),
  type: nullableBlank(z.enum(MDO_TYPES)),
  finish: optionalText(60),
  pcs: int('Pcs'),
  cycleTime: optionalText(20),
});
const mdoFields = { ...base, shift, operator: optionalText(80), pressStart: time, pressEnd: time, items: z.array(mdoItem).min(1, 'Add at least one item').max(50), paperUsed: optNum('Paper used'), paperWastage: optNum('Paper wastage') };
export const mdoCreateBody = z.object(mdoFields);
export const mdoUpdateBody = z.object(mdoFields).partial();

export const wfBody = z.object({ action: z.enum(WF_ACTIONS), note: optionalText(500) });

const mattFields = {
  date,
  shift,
  product,
  size,
  thickness,
  operator: optionalText(80),
  setpoint: pos('Setpoint (target weight)'),
  band: pos('Pass band'),
  targetQty: nullableBlank(int('Target quantity')),
  remarks: optionalText(500),
};
export const mattCreateBody = z.object({ ...mattFields, band: mattFields.band.default(0.5) });
export const mattUpdateBody = z.object(mattFields).partial();
export const weightBody = z.object({ weight: pos('Weight').refine((v) => v < 10000, 'Weight looks wrong') });

export const wipAdjustBody = z.object({
  qty: z.coerce
    .number({ error: 'Adjustment must be a number' })
    .refine((v) => v !== 0, 'Enter a + or − adjustment')
    .refine((v) => Math.abs(v) < 1e8, 'Too large'),
  reason: z.string().trim().min(1, 'Reason is required').max(300),
  date: date.optional(),
});

export const settingsBody = z.object({
  thicknesses: z
    .array(z.string().trim().regex(/^\d+(\.\d+)?$/, 'Thickness is a number in mm'))
    .min(1)
    .max(60)
    .transform((t) => [...new Set(t.map((x) => String(Number(x))))].sort((a, b) => Number(a) - Number(b)))
    .optional(),
  sizes: z
    .array(z.string().trim().min(1).max(20))
    .min(1)
    .max(30)
    .transform((s) => [...new Set(s)])
    .optional(),
  boardsPerCharge: z.coerce.number().int().min(1).max(10000).optional(),
  wetWoodFactor: z.coerce.number().min(1).max(10).optional(),
});
