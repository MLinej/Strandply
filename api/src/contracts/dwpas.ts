// DWPAS contracts (legacy Daily Work Plan & Achievement System: legacy/dwpas/index.html). Shared by the API and the web app.
// One plan per day: department lines with work, target, manpower, machine, priority and operator; Draft → Submitted →
// Approved; then the achievement against each line, with % and a traffic light; variance and manpower views.

export const PLAN_TYPES = ['Regular Day', 'Extra Shift', 'Overtime', 'Holiday Planning'] as const;
export type PlanType = (typeof PLAN_TYPES)[number];
export const PLAN_STATUSES = ['Draft', 'Submitted', 'Approved'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const LINE_PRIORITIES = ['High', 'Medium', 'Low'] as const;
export type LinePriority = (typeof LINE_PRIORITIES)[number];
export const UNITS = ['Sheets', 'Boards', 'Kg', 'MT', 'Liters', 'Nos', 'Hours', 'Trips'] as const;
export const EMPLOYEE_TYPES = ['Skilled', 'Unskilled', 'Supervisor', 'Manager'] as const;

/** Achievement % of target, rounded (legacy). Null until an actual is recorded or with no target. */
export const achievementPct = (qty: number, actual: number | null) => (actual === null || !qty ? null : Math.round((actual / qty) * 100));
/** Legacy traffic light: 95% and up green, 80% and up amber, below red. */
export type Light = 'green' | 'amber' | 'red';
export const lightOf = (pct: number): Light => (pct >= 95 ? 'green' : pct >= 80 ? 'amber' : 'red');

interface Audit {
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DwDepartment extends Audit {
  id: string;
  name: string;
  code: string | null;
  head: string;
  description: string | null;
  active: boolean;
}

export interface DwEmployee extends Audit {
  id: string;
  code: string | null;
  name: string;
  /** Department name, as typed or picked (legacy also had Management and Production). */
  department: string | null;
  designation: string | null;
  type: (typeof EMPLOYEE_TYPES)[number];
  active: boolean;
}

export interface PlanLine {
  department: string;
  /** Department head when the line was saved. */
  head: string;
  work: string;
  qty: number;
  unit: string;
  skilled: number;
  unskilled: number;
  machine: string | null;
  priority: LinePriority;
  operator: string | null;
  /** Achievement (null until recorded). */
  actualQty: number | null;
  actualSkilled: number | null;
  actualUnskilled: number | null;
  reason: string | null;
  headRemarks: string | null;
}

export interface PlanStep {
  action: 'submitted' | 'approved' | 'reopened' | 'achievement';
  by: string | null;
  byName: string;
  at: string;
  note: string | null;
}

export interface DwPlan extends Audit {
  id: string;
  date: string;
  type: PlanType;
  preparedBy: string | null;
  remarks: string | null;
  status: PlanStatus;
  lines: PlanLine[];
  trail: PlanStep[];
}

export interface PlanTotals {
  lines: number;
  skilled: number;
  unskilled: number;
  actualSkilled: number | null;
  actualUnskilled: number | null;
  /** Lines with an actual quantity. */
  recorded: number;
  green: number;
  amber: number;
  red: number;
  highPriority: number;
}
export interface PlanView extends DwPlan {
  totals: PlanTotals;
}

export interface DwpasMeta {
  departments: Pick<DwDepartment, 'name' | 'code' | 'head'>[];
  employees: Pick<DwEmployee, 'name' | 'code' | 'department' | 'type'>[];
  today: string;
}

export interface VarianceRow {
  date: string;
  department: string;
  work: string;
  unit: string;
  planned: number;
  actual: number;
  diff: number;
  pct: number | null;
  light: Light | null;
  reason: string | null;
  headRemarks: string | null;
}
export interface DeptVariance {
  department: string;
  lines: number;
  avgPct: number | null;
  green: number;
  amber: number;
  red: number;
}
export interface VarianceReport {
  rows: VarianceRow[];
  byDepartment: DeptVariance[];
  /** Lines planned in the range that have no achievement yet. */
  pending: number;
}

export interface ManpowerRow {
  department: string;
  head: string;
  work: string;
  priority: LinePriority;
  skilled: number;
  unskilled: number;
  actualSkilled: number | null;
  actualUnskilled: number | null;
}
