import { z } from 'zod';
import { BILL_CHARGES, RATE_KINDS, SHIFTS, shiftOfTime } from '../../contracts/electricity';
import { isIsoDate } from '../../lib/dates';
import { optionalText } from '../../lib/validate';
import { nullableBlank } from '../sampletrack/masters/validation';

const date = z.string().trim().refine(isIsoDate, 'Use a date like 2026-04-01');
const optDate = nullableBlank(date);
const num = (label: string, max: number) => z.coerce.number({ error: `${label} must be a number` }).min(0, `${label} can’t be negative`).max(max);
const paise = (label: string) => z.coerce.number({ error: `${label} must be a number` }).int().min(-1e13).max(1e13);
const pf = nullableBlank(z.coerce.number({ error: 'PF must be a number' }).min(0, 'PF is between 0 and 1').max(1, 'PF is between 0 and 1'));
const text = (max: number) => optionalText(max);

export const meterBody = z
  .object({
    meterNo: text(40),
    consumerNo: text(40),
    category: text(40),
    sanctionedLoadKva: nullableBlank(num('Sanctioned load', 1e6)),
    ctRatio: text(20),
    ptRatio: text(20),
    tariff: text(60),
    billingCycle: z.enum(['Monthly', 'Bi-monthly']),
  })
  .partial();

/** MF is a factor (above 0); fixed is paise per month; energy / fuel are paise per kWh. */
export const rateBody = z
  .object({ kind: z.enum(RATE_KINDS), value: z.coerce.number({ error: 'Enter a number' }).min(0, 'Can’t be negative').max(1e12), effectiveFrom: date })
  .refine((r) => r.kind === 'fuel' || r.value > 0, { path: ['value'], message: 'Must be more than 0' })
  .refine((r) => r.kind === 'mf' || Number.isInteger(r.value), { path: ['value'], message: 'Money is in whole paise' });

// Legacy punch: AM readings 00:00–11:59, PM 12:00–23:59.
export const readingBody = z
  .object({
    date,
    shift: z.enum(SHIFTS),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 06:00'),
    kwh: z.coerce.number({ error: 'Enter the kWh reading' }).positive('Enter the kWh reading').max(1e10),
    pf,
    nightKwh: nullableBlank(num('Night units', 1e9)),
    remarks: text(300),
  })
  .refine((r) => shiftOfTime(r.time) === r.shift, { path: ['time'], message: 'AM is 00:00–11:59, PM is 12:00–23:59' });

export const previewQuery = z.object({ date, time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), kwh: z.coerce.number().positive() });

const charge = () => nullableBlank(paise('Charge'));
const billFields = {
  billDate: date,
  dueDate: optDate,
  paidDate: optDate,
  advancePaymentPaise: nullableBlank(paise('Advance payment')),
  kwhReading: z.coerce.number({ error: 'Enter the kWh reading' }).min(0).max(1e10),
  kvarhReading: nullableBlank(num('kVArh reading', 1e10)),
  pf,
  nightUnits: nullableBlank(num('Night units', 1e10)),
  charges: z.object(Object.fromEntries(BILL_CHARGES.map((k) => [k, charge()])) as Record<(typeof BILL_CHARGES)[number], ReturnType<typeof charge>>).partial(),
  netPayablePaise: nullableBlank(paise('Net payable')),
  totalPayablePaise: paise('Total payable').refine((x) => x > 0, 'Enter the total payable'),
  remarks: text(500),
};
export const billCreateBody = z.object({ ...billFields, charges: billFields.charges.default({}) });
export const billUpdateBody = z.object(billFields).partial();
