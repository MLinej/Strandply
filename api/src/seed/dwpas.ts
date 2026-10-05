// DWPAS reference data: the legacy SEED_DEPARTMENTS and SEED_EMPLOYEES, and in dev a few days of plans.
import type { DwDepartment, DwEmployee, DwPlan, PlanLine } from '../contracts/dwpas';

type Ref<T> = Omit<T, 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export const REF_DW_DEPARTMENTS: Ref<DwDepartment>[] = (
  [
    ['Log Yard', 'LY', 'Yard Manager', 'Incoming log sorting & storage'],
    ['Peeling', 'PL', 'Rajesh Patel', 'Log peeling & core veneer production'],
    ['Dryer', 'DR', 'Mahesh Joshi', 'Veneer drying operations'],
    ['Core Composer', 'CC', 'Supervisor', 'Core layer composition'],
    ['Glue Kitchen', 'GK', 'Resin Manager', 'Glue/resin preparation'],
    ['Hot Press', 'HP', 'Vikram Sharma', 'Board pressing operations'],
    ['Trimming & Sanding', 'TS', 'Finishing Head', 'Panel finishing'],
    ['Lamination', 'LM', 'Lamination Head', 'Surface lamination'],
    ['Dispatch', 'DS', 'Dispatch Manager', 'Outward logistics'],
    ['Maintenance', 'MT', 'Maintenance Head', 'Equipment maintenance'],
    ['Store', 'ST', 'Sanjay Rao', 'Inventory & stores'],
    ['Quality', 'QC', 'QC Head', 'Quality control & inspection'],
  ] as const
).map(([name, code, head, description], i) => ({ id: `dwd-${i + 1}`, name, code, head, description, active: true }));

export const REF_DW_EMPLOYEES: Ref<DwEmployee>[] = (
  [
    ['MGR001', 'Jimit Mehta', 'Management', 'Plant Manager', 'Manager'],
    ['MGR002', 'P K Sinha', 'Production', 'Production Head', 'Manager'],
    ['MGR003', 'Sanjay Rao', 'Store', 'Store Manager', 'Manager'],
    ['SUP001', 'Rahul', 'Log Yard', 'Unloading Supervisor', 'Supervisor'],
    ['SUP002', 'Rajesh Patel', 'Peeling', 'Peeling Supervisor', 'Supervisor'],
    ['SUP003', 'Mahesh Joshi', 'Dryer', 'Dryer Incharge', 'Supervisor'],
    ['SUP004', 'Vikram Sharma', 'Hot Press', 'Press Supervisor', 'Supervisor'],
  ] as const
).map(([code, name, department, designation, type], i) => ({ id: `dwe-${i + 1}`, code, name, department, designation, type, active: true }));

const line = (department: string, head: string, work: string, qty: number, unit: string, skilled: number, unskilled: number, o: Partial<PlanLine> = {}): PlanLine => ({
  department, head, work, qty, unit, skilled, unskilled, machine: null, priority: 'High', operator: null, actualQty: null, actualSkilled: null, actualUnskilled: null, reason: null, headRemarks: null, ...o,
});
const day = (date: string, actual: boolean): Ref<DwPlan> => ({
  id: `dwp-${date}`,
  date,
  type: 'Regular Day',
  preparedBy: 'P K Sinha',
  remarks: null,
  status: actual ? 'Approved' : 'Submitted',
  trail: [{ action: 'submitted', by: null, byName: 'P K Sinha', at: `${date}T02:30:00.000Z`, note: null }, ...(actual ? [{ action: 'approved' as const, by: null, byName: 'Jimit Mehta', at: `${date}T03:00:00.000Z`, note: null }] : [])],
  lines: [
    line('Peeling', 'Rajesh Patel', 'Peel eucalyptus logs, 2.4 mm core', 1800, 'Sheets', 6, 8, { machine: 'Spindleless peeler 1', operator: 'Rajesh Patel', ...(actual ? { actualQty: 1740, actualSkilled: 6, actualUnskilled: 7 } : {}) }),
    line('Dryer', 'Mahesh Joshi', 'Dry core veneer to 8–10% moisture', 1700, 'Sheets', 3, 4, { machine: 'Roller dryer', priority: 'Medium', ...(actual ? { actualQty: 1350, actualSkilled: 3, actualUnskilled: 4, reason: 'Boiler pressure low for 2 hours' } : {}) }),
    line('Hot Press', 'Vikram Sharma', 'Press 18 mm OSB, 8x4', 420, 'Boards', 5, 6, { machine: 'Hot press 1', operator: 'Vikram Sharma', ...(actual ? { actualQty: 430, actualSkilled: 5, actualUnskilled: 6, headRemarks: 'Good run' } : {}) }),
    line('Dispatch', 'Dispatch Manager', 'Load 3 trucks for Rajkot and Surat', 3, 'Trips', 1, 6, { priority: 'Low', ...(actual ? { actualQty: 2, actualSkilled: 1, actualUnskilled: 5, reason: 'One truck reported late' } : {}) }),
  ],
});

/** 29 and 30 Sept approved with achievement; 1 Oct submitted. */
export const DEMO_PLANS: Ref<DwPlan>[] = [day('2026-09-29', true), day('2026-09-30', true), day('2026-10-01', false)];
