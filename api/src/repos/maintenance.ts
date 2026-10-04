// Repo interfaces for the Maintenance module (shared record-table shape). The timeline lives inside the work order
// here; in D1 it is a child table (db/migrations/0013_maintenance.sql).
import type { MtArea, WorkOrder, WorkOrderFilters } from '../contracts/maintenance';
import type { RecordTable } from './record-table';

/** name unique. */
export type MtAreaRepo = RecordTable<MtArea>;
/** woNo unique. Searches woNo, title, assignee. Filters: status, priority, area, category, assignee, overdueAsOf (date), from / to (created date). Default -createdAt. */
export type WorkOrderRepo = RecordTable<WorkOrder, WorkOrderFilters>;
