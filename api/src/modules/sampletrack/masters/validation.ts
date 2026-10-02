import { z } from 'zod';
import {
  BOARD_TYPES,
  COURIER_STATUSES,
  COURIER_TYPES,
  PARTY_TYPES,
  STOCK_STATUSES,
} from '../../../contracts/sampletrack';
import { optionalText } from '../../../lib/validate';

// Field rules shared by routes and the product import.

/** GSTIN: 2-digit state code, PAN (5 letters, 4 digits, 1 letter), entity no., 'Z', checksum. */
export const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PINCODE = /^[1-9][0-9]{5}$/;

/** Accepts "98765 43210", "+91-9876543210", "09876543210" … and stores the 10 digits. */
export function normalizeIndianMobile(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/** Optional field where '' or null means "no value" (stored as null). Otherwise `schema` applies, with its own messages. */
export const nullableBlank = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), schema.nullable().optional());

export const email = nullableBlank(z.email('Enter a valid email').max(200).transform((v) => v.trim().toLowerCase()));

export const gst = nullableBlank(
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      const up = v.toUpperCase();
      if (up.length !== 15) ctx.addIssue({ code: 'custom', message: 'GST number must be 15 characters' });
      else if (!GSTIN.test(up)) ctx.addIssue({ code: 'custom', message: 'Not a valid GSTIN format' });
      return up;
    }),
);

const mobile = nullableBlank(
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      const m = normalizeIndianMobile(v);
      if (!m) {
        ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit Indian mobile number' });
        return z.NEVER;
      }
      return m;
    }),
);

export const pin = nullableBlank(z.string().trim().regex(PINCODE, 'Pincode must be 6 digits'));

/** Contact numbers for couriers: toll-free and landline numbers are allowed, so only basic characters are checked. */
export const phone = nullableBlank(
  z
    .string()
    .trim()
    .max(30)
    .regex(/^[+0-9][0-9\s\-()]{5,}$/, 'Enter a valid phone number'),
);

const partyFields = {
  name: z.string().trim().min(1, 'Party name is required').max(200),
  contact: optionalText(120),
  mobile,
  email,
  gst,
  address: optionalText(500),
  city: optionalText(100),
  state: optionalText(100),
  pin,
  industry: optionalText(60),
  type: z.enum(PARTY_TYPES),
  assignedUserId: optionalText(64),
  remarks: optionalText(1000),
};

export const partyCreateBody = z.object({ ...partyFields, type: partyFields.type.default('Existing Customer') });
export const partyUpdateBody = z
  .object({ ...partyFields, name: partyFields.name.optional(), type: partyFields.type.optional() })
  .partial();

const trackingTemplate = nullableBlank(
  z
    .string()
    .trim()
    .max(500)
    .regex(/^https?:\/\/\S+$/i, 'Tracking URL must start with http:// or https://'),
);

const courierFields = {
  name: z.string().trim().min(1, 'Name is required').max(200),
  type: z.enum(COURIER_TYPES),
  contact: optionalText(120),
  mobile: phone,
  email,
  coverage: optionalText(200),
  trackingUrlTemplate: trackingTemplate,
  rating: z.number().int('Rating must be a whole number').min(1, 'Rating is 1–5').max(5, 'Rating is 1–5').nullish(),
  status: z.enum(COURIER_STATUSES),
  remarks: optionalText(1000),
};

export const courierCreateBody = z.object({
  ...courierFields,
  type: courierFields.type.default('Courier'),
  status: courierFields.status.default('Active'),
});
export const courierUpdateBody = z.object(courierFields).partial();

const productFields = {
  code: z.string().trim().min(1, 'Product code is required').max(40),
  name: z.string().trim().min(1, 'Product name is required').max(200),
  boardType: z.enum(BOARD_TYPES),
  thicknessMm: z.number().positive('Thickness must be positive').max(1000).nullish(),
  size: optionalText(40),
  category: optionalText(60),
  unitPricePaise: z.number().int('Price is in whole paise').min(0),
  stockStatus: z.enum(STOCK_STATUSES),
  description: optionalText(2000),
};

export const productCreateBody = z.object({
  ...productFields,
  boardType: productFields.boardType.default('OSB'),
  unitPricePaise: productFields.unitPricePaise.default(0),
  stockStatus: productFields.stockStatus.default('Available'),
});
export const productUpdateBody = z.object(productFields).partial();

/** Pincodes as an array or "363621, 363622": trimmed, de-duplicated, each 6 digits. */
export const pincodeList = z
  .union([z.array(z.string()), z.string()])
  .transform((v, ctx) => {
    const list = (Array.isArray(v) ? v : v.split(/[\s,;|]+/)).map((p) => p.trim()).filter(Boolean);
    const bad = list.filter((p) => !PINCODE.test(p));
    if (bad.length) ctx.addIssue({ code: 'custom', message: `Not a 6-digit pincode: ${bad.join(', ')}` });
    if (list.length > 200) ctx.addIssue({ code: 'custom', message: 'At most 200 pincodes per city' });
    return [...new Set(list)];
  });

export const cityCreateBody = z.object({
  city: z.string().trim().min(1, 'City is required').max(100),
  stateId: z.string().trim().min(1, 'State is required').max(40),
  pincodes: pincodeList.optional(),
});

/** Built-in cities: only pincodes can change. Custom cities: name and state too. */
export const cityUpdateBody = z
  .object({
    city: z.string().trim().min(1, 'City is required').max(100).optional(),
    stateId: z.string().trim().min(1, 'State is required').max(40).optional(),
    pincodes: pincodeList.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Nothing to update');

export type CityCreate = z.output<typeof cityCreateBody>;
export type CityUpdate = z.output<typeof cityUpdateBody>;

export type PartyCreate = z.output<typeof partyCreateBody>;
export type PartyUpdate = z.output<typeof partyUpdateBody>;
export type CourierCreate = z.output<typeof courierCreateBody>;
export type CourierUpdate = z.output<typeof courierUpdateBody>;
export type ProductCreate = z.output<typeof productCreateBody>;
export type ProductUpdate = z.output<typeof productUpdateBody>;
