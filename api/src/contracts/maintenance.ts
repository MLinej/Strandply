// Maintenance module contracts (legacy Maintenance Work Tracker: legacy/maintenance/index.html). Shared by the API and the web app.
// Work orders against plant areas, with an activity timeline. Areas are stored on work orders by name, as legacy did.

export const MT_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export type MtPriority = (typeof MT_PRIORITIES)[number];
export const MT_STATUSES = ['Open', 'In Progress', 'On Hold', 'Completed'] as const;
export type MtStatus = (typeof MT_STATUSES)[number];
export const MT_CATEGORIES = ['Mechanical', 'Electrical', 'Hydraulic', 'Pneumatic', 'Civil', 'Instrumentation', 'HVAC', 'Safety'] as const;
export type MtCategory = (typeof MT_CATEGORIES)[number];

interface Audit {
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MtArea extends Audit {
  id: string;
  name: string;
  active: boolean;
}

export const TIMELINE_TYPES = ['created', 'assigned', 'status', 'edited', 'note'] as const;
export type TimelineType = (typeof TIMELINE_TYPES)[number];
export interface TimelineEntry {
  id: string;
  type: TimelineType;
  text: string;
  by: string | null;
  byName: string;
  at: string;
}

export interface WorkOrder extends Audit {
  id: string;
  /** WO-26-0001 */
  woNo: string;
  title: string;
  category: MtCategory;
  /** Area name. */
  area: string;
  priority: MtPriority;
  status: MtStatus;
  /** Technician, as typed. */
  assignee: string;
  description: string | null;
  notes: string | null;
  dueDate: string;
  /** Business date it was last marked Completed; cleared when reopened. */
  completedOn: string | null;
  /** Oldest first. */
  timeline: TimelineEntry[];
}

export interface WorkOrderFilters {
  status: string;
  priority: string;
  area: string;
  category: string;
  assignee: string;
  /** Past due as of this date and not completed. */
  overdueAsOf: string;
  /** Raised (created) date range. */
  from: string;
  to: string;
}

/** Past its due date and not completed (legacy). */
export const isOverdue = (w: Pick<WorkOrder, 'dueDate' | 'status'>, today: string) => w.status !== 'Completed' && w.dueDate < today;

export interface Named {
  name: string;
  value: number;
}

export interface MaintenanceMeta {
  areas: string[];
  assignees: string[];
  today: string;
}

export interface MaintenanceDashboard {
  total: number;
  open: number;
  inProgress: number;
  onHold: number;
  completed: number;
  /** Critical and not completed. */
  critical: number;
  overdue: number;
  byArea: Named[];
  byCategory: Named[];
  byPriority: Named[];
  overdueList: WorkOrder[];
  recent: (TimelineEntry & { workOrderId: string; woNo: string; title: string })[];
}

export interface MaintenanceReportRow {
  name: string;
  raised: number;
  completed: number;
  open: number;
  overdue: number;
  /** Average days from raised to completed, one decimal. */
  avgDays: number | null;
}

export interface MaintenanceReports {
  raised: number;
  completed: number;
  /** Completed by the due date, % of completed. */
  onTimeShare: number | null;
  avgDays: number | null;
  openNow: number;
  overdueNow: number;
  byMonth: { name: string; raised: number; completed: number }[];
  byArea: MaintenanceReportRow[];
  byCategory: MaintenanceReportRow[];
  byAssignee: MaintenanceReportRow[];
  byPriority: MaintenanceReportRow[];
}
