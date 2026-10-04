import { z } from 'zod';
import { MT_CATEGORIES, MT_PRIORITIES, MT_STATUSES } from '../../contracts/maintenance';
import { isIsoDate } from '../../lib/dates';
import { optionalText } from '../../lib/validate';

const date = z.string().trim().refine(isIsoDate, 'Use a date like 2026-04-01');
const required = (label: string, max: number) => z.string().trim().min(1, `${label} is required`).max(max);

export const areaCreateBody = z.object({ name: required('Area', 80), active: z.boolean().default(true) });
export const areaUpdateBody = z.object({ name: required('Area', 80), active: z.boolean() }).partial();

// The legacy form required title, assignee and due date.
const workOrderFields = {
  title: required('Title', 160),
  category: z.enum(MT_CATEGORIES),
  area: required('Plant area', 80),
  priority: z.enum(MT_PRIORITIES),
  status: z.enum(MT_STATUSES),
  assignee: required('Assigned to', 80),
  description: optionalText(2000),
  notes: optionalText(2000),
  dueDate: date,
};
export const workOrderCreateBody = z.object({ ...workOrderFields, category: workOrderFields.category.default('Mechanical'), priority: workOrderFields.priority.default('High'), status: workOrderFields.status.default('Open') });
export const workOrderUpdateBody = z.object(workOrderFields).partial();

export const statusBody = z.object({ status: z.enum(MT_STATUSES), note: optionalText(500) });
export const noteBody = z.object({ text: required('Note', 2000) });
