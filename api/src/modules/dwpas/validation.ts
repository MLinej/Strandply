import { z } from 'zod';
import { EMPLOYEE_TYPES, LINE_PRIORITIES, PLAN_TYPES, UNITS } from '../../contracts/dwpas';
import { isIsoDate } from '../../lib/dates';
import { optionalText } from '../../lib/validate';
import { nullableBlank } from '../sampletrack/masters/validation';

const date = z.string().trim().refine(isIsoDate, 'Use a date like 2026-04-01');
const required = (label: string, max: number) => z.string().trim().min(1, `${label} is required`).max(max);
const count = (label: string) => z.coerce.number({ error: `${label} must be a number` }).int(`${label} is a whole number`).min(0, `${label} can’t be negative`).max(10_000);
const qty = (label: string) => z.coerce.number({ error: `${label} must be a number` }).min(0, `${label} can’t be negative`).max(1e9);

export const departmentCreateBody = z.object({ name: required('Department', 80), code: optionalText(10), head: required('Department head', 80), description: optionalText(200), active: z.boolean().default(true) });
export const departmentUpdateBody = z.object({ name: required('Department', 80), code: optionalText(10), head: required('Department head', 80), description: optionalText(200), active: z.boolean() }).partial();

export const employeeCreateBody = z.object({ code: optionalText(20), name: required('Name', 80), department: optionalText(80), designation: optionalText(80), type: z.enum(EMPLOYEE_TYPES).default('Skilled'), active: z.boolean().default(true) });
export const employeeUpdateBody = z.object({ code: optionalText(20), name: required('Name', 80), department: optionalText(80), designation: optionalText(80), type: z.enum(EMPLOYEE_TYPES), active: z.boolean() }).partial();

// The legacy plan line: department and work required; the rest optional.
const planLine = z.object({
  department: required('Department', 80),
  work: required('Work planned', 300),
  qty: qty('Target').default(0),
  unit: z.enum(UNITS).default('Sheets'),
  skilled: count('Skilled').default(0),
  unskilled: count('Unskilled').default(0),
  machine: optionalText(120),
  priority: z.enum(LINE_PRIORITIES).default('High'),
  operator: optionalText(80),
});
/** Save the day's plan (create or replace its lines). Submitting is a separate step. */
export const planBody = z.object({
  date,
  type: z.enum(PLAN_TYPES).default('Regular Day'),
  preparedBy: optionalText(80),
  remarks: optionalText(1000),
  lines: z.array(planLine).min(1, 'Add at least one department line').max(60),
});

const actual = (label: string) => nullableBlank(qty(label));
export const achievementBody = z.object({
  lines: z
    .array(
      z.object({
        actualQty: actual('Actual'),
        actualSkilled: nullableBlank(count('Skilled')),
        actualUnskilled: nullableBlank(count('Unskilled')),
        reason: optionalText(300),
        headRemarks: optionalText(300),
      }),
    )
    .max(60),
});

export const decisionBody = z.object({ note: optionalText(500) });
