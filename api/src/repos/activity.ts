import type { ListQuery, ListResult } from './types';

export const ACTIVITY_ACTIONS = [
  'Login',
  'LoginFailed',
  'Logout',
  'Create',
  'Edit',
  'Delete',
  'PermissionChange',
  'Purge',
  'Import',
  'Export',
  'Approve',
  'StatusChange',
  'Print',
  'Share',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/** Table `st_activity_log`. Append-only. User name and role are copied in as they were at the time. */
export interface ActivityEntry {
  id: string;
  userId: string | null;
  userName: string | null;
  userRole: string | null;
  action: ActivityAction;
  entityType: string | null;
  entityId: string | null;
  details: string;
  createdAt: string;
}

export interface ActivityFilters {
  userId: string;
  action: ActivityAction;
  entityType: string;
  /** Entity types starting with this (e.g. "purchase_" for the Purchase audit trail). */
  entityPrefix: string;
  /** Inclusive lower bound on createdAt (ISO timestamp or YYYY-MM-DD). */
  from: string;
  /** Exclusive upper bound on createdAt (ISO timestamp or YYYY-MM-DD). */
  to: string;
}

export interface ActivityRepo {
  append(entry: ActivityEntry): Promise<ActivityEntry>;
  /** Searches details and userName. Default sort is -createdAt (newest first). */
  list(query: ListQuery<ActivityFilters>): Promise<ListResult<ActivityEntry>>;
  /** Hard-deletes entries with createdAt < cutoff and returns how many went. */
  purgeBefore(cutoffIso: string): Promise<number>;
}
