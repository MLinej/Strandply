// Repo interfaces for DWPAS (shared record-table shape). Plan lines and the trail live inside the plan here; in D1
// they are child tables (db/migrations/0016_dwpas.sql).
import type { DwDepartment, DwEmployee, DwPlan } from '../contracts/dwpas';
import type { RecordTable } from './record-table';

/** name unique. Default name. */
export type DwDepartmentRepo = RecordTable<DwDepartment>;
/** name unique. Searches name, code, department, designation. Default name. */
export type DwEmployeeRepo = RecordTable<DwEmployee>;
/** date unique (one plan per day). Searches prepared-by, type, remarks. Filters: status, from / to. Default -date. */
export type DwPlanRepo = RecordTable<DwPlan, { status: string; from: string; to: string }>;
