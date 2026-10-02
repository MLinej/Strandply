import { z } from 'zod';
import { REQUEST_PRIORITIES, REQUEST_STATUSES } from '../../../contracts/sampletrack';
import { isIsoDate } from '../../../lib/dates';
import { optionalText, paging } from '../../../lib/validate';

export const isoDate = z.string().refine(isIsoDate, 'Use a valid date (YYYY-MM-DD)');

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const MAX_REQUEST_LINES = 50;

const line = z.object({
  productId: optionalText(64),
  productName: optionalText(200),
  board: optionalText(40),
  thickness: optionalText(20),
  size: optionalText(40),
  qty: optionalText(40),
});

const fields = {
  date: isoDate.optional(),
  partyId: z.string().trim().min(1, 'Select a party').max(64),
  purpose: optionalText(200),
  priority: z.enum(REQUEST_PRIORITIES),
  requiredDispatchDate: z.preprocess(blankToNull, isoDate.nullish()),
  requestedByUserId: optionalText(64),
  remarks: optionalText(1000),
  items: z.array(line).max(MAX_REQUEST_LINES, `At most ${MAX_REQUEST_LINES} product lines`),
};

/** No status field on purpose: a new request is always Pending, and an edit never changes status. */
export const requestCreateBody = z.object({ ...fields, priority: fields.priority.default('Normal') });
export const requestUpdateBody = z.object(fields).partial();

export const requestListQuery = z.object({
  ...paging,
  sort: z.string().max(30).optional(),
  status: z.enum(REQUEST_STATUSES).optional(),
  partyId: z.string().max(64).optional(),
  requestedByUserId: z.string().max(64).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

export type RequestCreate = z.output<typeof requestCreateBody>;
export type RequestUpdateInput = z.output<typeof requestUpdateBody>;
export type RequestLine = z.output<typeof line>;
