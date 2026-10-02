import { z } from 'zod';
import { DOCUMENT_TYPES, MATERIAL_IDS, NOTE_STATUSES, PURCHASE_GST_RATES, TAX_TYPES, TYPE_KINDS } from '../../contracts/purchase';
import { isIsoDate } from '../../lib/dates';
import { optionalText } from '../../lib/validate';
import { nullableBlank } from '../sampletrack/masters/validation';

const date = z.string().trim().refine(isIsoDate, 'Use a date like 2026-04-01');
const optionalDate = nullableBlank(date);
const qty = (label: string) => z.coerce.number({ error: `${label} must be a number` }).min(0, `${label} can’t be negative`).max(1e9);
/** Whole rupees or paise come in as paise (integers). */
const paise = (label: string, { allowNegative = false } = {}) =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .int(`${label} must be whole paise`)
    .min(allowNegative ? -1e12 : 0, `${label} can’t be negative`)
    .max(1e12);
const gstPct = z.coerce
  .number()
  .refine((v) => (PURCHASE_GST_RATES as readonly number[]).includes(v), `GST rate must be one of ${PURCHASE_GST_RATES.join(', ')}`);
const id = z.string().trim().min(1).max(64);

export const typeCreateBody = z.object({
  kind: z.enum(TYPE_KINDS),
  name: z.string().trim().min(1, 'Name is required').max(60),
});

const entryFields = {
  material: z.enum(MATERIAL_IDS),
  date,
  lotNo: optionalText(30),
  poId: nullableBlank(id),
  vendorId: nullableBlank(id),
  vendorName: z.string().trim().min(1, 'Vendor is required').max(200),
  vendorCode: optionalText(40),
  gstin: optionalText(20),
  pan: optionalText(12),
  city: optionalText(100),
  state: optionalText(100),
  mobile: optionalText(30),
  invoiceNo: z.string().trim().min(1, 'Invoice number is required').max(60),
  invoiceDate: optionalDate,
  taxType: z.enum(TAX_TYPES),
  gstPct,
  vehicleNo: nullableBlank(z.string().trim().toUpperCase().max(20)),
  driver: optionalText(80),
  transporter: optionalText(120),
  rstNo: optionalText(30),
  mrnNo: optionalText(30),
  grnNo: optionalText(30),
  remarks: optionalText(1000),
  itemId: nullableBlank(id),
  itemName: optionalText(200),
  hsn: optionalText(10),
  species: optionalText(60),
  veneerType: optionalText(60),
  altQtyPcs: nullableBlank(qty('Alternate quantity')),
  invQty: qty('Invoice quantity').refine((v) => v > 0, 'Invoice quantity must be more than 0'),
  splQty: qty('Strandply quantity'),
  ratePaise: paise('Rate').refine((v) => v > 0, 'Rate must be more than 0'),
  rateDiffPaise: paise('Rate difference', { allowNegative: true }),
  otherChargesPaise: paise('Other charges'),
};

/**
 * `post: false` saves a draft (legacy "Save Draft"); `post: true` (default) posts it for approval.
 * Defaults live on the create schema only: zod still applies a `.default()` after `.partial()`, which
 * would make a PATCH reset fields it never mentioned.
 */
export const entryCreateBody = z.object({
  ...entryFields,
  gstPct: gstPct.default(18),
  rateDiffPaise: entryFields.rateDiffPaise.default(0),
  otherChargesPaise: entryFields.otherChargesPaise.default(0),
  post: z.boolean().default(true),
});
export const entryUpdateBody = z.object(entryFields).partial().extend({ post: z.boolean().optional() });
export type EntryCreate = z.output<typeof entryCreateBody>;
export type EntryUpdate = z.output<typeof entryUpdateBody>;

export const noteStatusBody = z.object({ status: z.enum(NOTE_STATUSES) });

const poFields = {
  poNo: nullableBlank(z.string().trim().toUpperCase().max(40)),
  date,
  material: z.enum(MATERIAL_IDS),
  vendorId: nullableBlank(id),
  vendorName: z.string().trim().min(1, 'Vendor is required').max(200),
  qty: qty('PO quantity').refine((v) => v > 0, 'PO quantity must be more than 0'),
  ratePaise: paise('Rate'),
  remarks: optionalText(1000),
  tncIds: z.array(id).max(50),
};
export const poCreateBody = z.object({ ...poFields, tncIds: poFields.tncIds.default([]) });
export const poUpdateBody = z.object(poFields).partial();
export type PoCreate = z.output<typeof poCreateBody>;
export type PoUpdate = z.output<typeof poUpdateBody>;

export const returnCreateBody = z.object({
  date,
  material: z.enum(MATERIAL_IDS),
  species: optionalText(60),
  entryId: nullableBlank(id),
  vendorName: optionalText(200),
  originalInvoiceNo: optionalText(60),
  qty: qty('Return quantity').refine((v) => v > 0, 'Return quantity must be more than 0'),
  ratePaise: paise('Rate'),
  taxType: z.enum(TAX_TYPES).optional(),
  gstPct: gstPct.optional(),
  reason: optionalText(500),
});
export type ReturnCreate = z.output<typeof returnCreateBody>;

export const openingStockBody = z.object({
  asOnDate: date,
  mode: z.enum(['draft', 'submit']),
  items: z
    .array(
      z.object({
        material: z.enum(MATERIAL_IDS),
        species: optionalText(60),
        qty: qty('Opening quantity'),
        ratePaise: paise('Rate'),
        remarks: optionalText(300),
      }),
    )
    .max(100),
});
export type OpeningStockBody = z.output<typeof openingStockBody>;

export const consumptionBody = z.object({
  key: z.string().trim().min(1).max(100),
  qty: qty('Consumption'),
});

export const documentMeta = z.object({
  type: z.enum(DOCUMENT_TYPES).default('Other'),
  entryId: nullableBlank(id),
});
