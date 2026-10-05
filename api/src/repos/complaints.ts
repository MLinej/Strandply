// Repo interfaces for the Complaints module (shared record-table shape). Photos and the timeline live inside the
// complaint here; in D1 they are child tables (db/migrations/0015_complaints.sql).
import type { Complaint, ComplaintFilters, CpRecipient } from '../contracts/complaints';
import type { RecordTable } from './record-table';

/** complaintNo unique. Searches number, customer, salesman, description. Filters: status, priority, category, material, customerName, salesman, open, from / to (date). Default -date. */
export type ComplaintRepo = RecordTable<Complaint, ComplaintFilters>;
/** name unique. Default name. */
export type CpRecipientRepo = RecordTable<CpRecipient>;
