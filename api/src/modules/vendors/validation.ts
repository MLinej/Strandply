import { z } from 'zod';
import {
  CATEGORY_COLORS,
  GST_RATES,
  MASTER_STATUSES,
  PAYMENT_TERMS,
  PRODUCT_UNITS,
  TNC_APPLIES,
  TNC_CATEGORIES,
  VENDOR_ACTIONS,
  VENDOR_TYPES,
} from '../../contracts/vendors';
import { optionalText } from '../../lib/validate';
import { email, gst, nullableBlank, phone, pin } from '../sampletrack/masters/validation';

// Field rules shared by routes and the imports.

export const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const upperCode = (re: RegExp, message: string) =>
  nullableBlank(
    z
      .string()
      .trim()
      .transform((v, ctx) => {
        const up = v.toUpperCase().replace(/\s+/g, '');
        if (!re.test(up)) ctx.addIssue({ code: 'custom', message });
        return up;
      }),
  );

const id = z.string().trim().min(1).max(64);
const count = (max: number) => nullableBlank(z.coerce.number().min(0, 'Must be 0 or more').max(max));
const website = nullableBlank(
  z
    .string()
    .trim()
    .max(300)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.url('Enter a valid website address')),
);

// ── Categories ───────────────────────────────────────────────────────

const categoryFields = {
  name: z.string().trim().min(1, 'Category name is required').max(80),
  icon: nullableBlank(z.string().trim().max(16)),
  color: z.enum(CATEGORY_COLORS).optional(),
  description: optionalText(300),
  sortOrder: z.coerce.number().int().min(1, 'Sort order starts at 1').max(9999).optional(),
  status: z.enum(MASTER_STATUSES).optional(),
  notes: optionalText(1000),
};
export const categoryCreateBody = z.object(categoryFields);
export const categoryUpdateBody = z.object(categoryFields).partial();
export type CategoryCreate = z.output<typeof categoryCreateBody>;
export type CategoryUpdate = z.output<typeof categoryUpdateBody>;

// ── Products ─────────────────────────────────────────────────────────

const productFields = {
  name: z.string().trim().min(1, 'Product name is required').max(200),
  categoryId: z.string().trim().min(1, 'Pick a category').max(64),
  unit: z.enum(PRODUCT_UNITS, 'Pick a unit'),
  altUnit: optionalText(20),
  convFactor: nullableBlank(z.coerce.number().positive('Must be more than 0').max(1_000_000)),
  hsn: nullableBlank(z.string().trim().regex(/^[0-9]{2,8}$/, 'HSN/SAC is 2 to 8 digits')),
  gstRate: nullableBlank(
    z.coerce
      .number()
      .refine((v): v is (typeof GST_RATES)[number] => (GST_RATES as readonly number[]).includes(v), `GST rate must be one of ${GST_RATES.join(', ')}`),
  ),
  moq: count(10_000_000),
  leadTimeDays: nullableBlank(z.coerce.number().int('Whole days only').min(0).max(3650)),
  description: optionalText(2000),
  notes: optionalText(1000),
};
export const productCreateBody = z.object(productFields);
export const productUpdateBody = z.object(productFields).partial();
export type ProductCreate = z.output<typeof productCreateBody>;
export type ProductUpdate = z.output<typeof productUpdateBody>;

// ── Vendors ──────────────────────────────────────────────────────────

const vendorFields = {
  name: z.string().trim().min(1, 'Vendor name is required').max(200),
  code: nullableBlank(z.string().trim().toUpperCase().max(40).regex(/^[A-Z0-9][A-Z0-9\-/]*$/, 'Letters, digits, - and / only')),
  type: nullableBlank(z.enum(VENDOR_TYPES)),
  yearEstablished: nullableBlank(z.coerce.number().int().min(1800, 'Too early').max(2100, 'Too late')),
  categoryIds: z.array(id).min(1, 'Select at least one category').max(30),
  productIds: z.array(id).max(500).optional(),
  contact: optionalText(120),
  designation: optionalText(80),
  phone,
  email,
  address: optionalText(500),
  pincode: pin,
  city: optionalText(100),
  state: optionalText(100),
  website,
  gst,
  pan: upperCode(PAN, 'PAN is 5 letters, 4 digits, 1 letter'),
  msme: optionalText(40),
  paymentTerms: nullableBlank(z.enum(PAYMENT_TERMS)),
  bank: optionalText(120),
  accountNo: nullableBlank(z.string().trim().regex(/^[0-9]{6,20}$/, 'Account number is 6 to 20 digits')),
  ifsc: upperCode(IFSC, 'IFSC is 4 letters, 0, then 6 letters or digits'),
  rating: nullableBlank(z.coerce.number().int().min(1, 'Rating is 1 to 5').max(5, 'Rating is 1 to 5')),
  notes: optionalText(2000),
};
export const vendorCreateBody = z.object({ ...vendorFields, status: z.enum(['pending', 'inactive']).optional() });
export const vendorUpdateBody = z.object(vendorFields).partial();
export type VendorCreate = z.output<typeof vendorCreateBody>;
export type VendorUpdate = z.output<typeof vendorUpdateBody>;

export const vendorActionBody = z
  .object({ action: z.enum(VENDOR_ACTIONS), reason: z.string().trim().max(500).optional() })
  .refine((v) => v.action !== 'blacklist' || !!v.reason, { message: 'Give a reason for blacklisting', path: ['reason'] });

// ── T&C ──────────────────────────────────────────────────────────────

const tncFields = {
  title: z.string().trim().min(1, 'Title is required').max(200),
  category: nullableBlank(z.enum(TNC_CATEGORIES)),
  version: z.string().trim().min(1).max(20).optional(),
  body: z.string().trim().min(1, 'Clause text is required').max(10_000),
  summary: optionalText(300),
  status: z.enum(MASTER_STATUSES).optional(),
  appliesTo: z.enum(TNC_APPLIES).optional(),
  notes: optionalText(1000),
};
export const tncCreateBody = z.object(tncFields);
export const tncUpdateBody = z.object(tncFields).partial();
export type TncCreate = z.output<typeof tncCreateBody>;
export type TncUpdate = z.output<typeof tncUpdateBody>;

// ── Settings ─────────────────────────────────────────────────────────

export const emailSettingsBody = z.object({
  fromName: z.string().trim().min(1, 'Sender name is required').max(120).optional(),
  replyTo: email,
});
