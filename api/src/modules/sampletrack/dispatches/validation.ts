import { z } from 'zod';
import { DISPATCH_MODES, DISPATCH_STATUSES } from '../../../contracts/sampletrack';
import { optionalText, paging } from '../../../lib/validate';
import { isoDate } from '../requests/validation';

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const fields = {
  date: isoDate.optional(),
  partyId: z.string().trim().min(1, 'Select a party').max(64),
  mode: z.enum(DISPATCH_MODES, 'Select a mode'),
  courierId: optionalText(64),
  courierNameManual: optionalText(120),
  trackingNo: optionalText(60),
  vehicleNo: optionalText(30),
  driverDetails: optionalText(200),
  expectedDeliveryDate: z.preprocess(blankToNull, isoDate.nullish()),
  freightPaise: z.number().int('Freight is in whole paise').min(0).max(1_000_000_000),
  weightKg: z.number('Weight is required').gt(0, 'Weight must be more than 0 kg').max(100_000),
  dimensions: optionalText(60),
  productDescription: optionalText(500),
  linkedRequestId: optionalText(64),
  remarks: optionalText(1000),
  status: z.enum(DISPATCH_STATUSES),
};

export const dispatchCreateBody = z.object({
  ...fields,
  freightPaise: fields.freightPaise.default(0),
  status: fields.status.default('Pending'),
});

export const dispatchUpdateBody = z.object({ ...fields, statusNote: optionalText(500) }).partial();

export const statusChangeBody = z.object({
  status: z.enum(DISPATCH_STATUSES, `Status must be one of: ${DISPATCH_STATUSES.join(', ')}`),
  note: optionalText(500),
});

const flag = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');

export const dispatchListQuery = z.object({
  ...paging,
  sort: z.string().max(30).optional(),
  mode: z.enum(DISPATCH_MODES).optional(),
  status: z.enum(DISPATCH_STATUSES).optional(),
  partyId: z.string().max(64).optional(),
  courierId: z.string().max(64).optional(),
  linkedRequestId: z.string().max(64).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  overdue: flag,
});

export type DispatchCreate = z.output<typeof dispatchCreateBody>;
export type DispatchUpdateInput = z.output<typeof dispatchUpdateBody>;
