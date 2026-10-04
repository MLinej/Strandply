// Repo interfaces for the Electricity module (shared record-table shape). The meter details are a setting
// (`electricity.meter`); bill charges are columns in D1 (db/migrations/0014_electricity.sql).
import type { ElBill, ElRate, ElReading } from '../contracts/electricity';
import type { RecordTable } from './record-table';

/** (kind, effectiveFrom) unique (checked by the service; a unique index in D1). Filter: kind. */
export type ElRateRepo = RecordTable<ElRate, { kind: string }>;
/** at (date + time) unique. Filters: shift, from / to (date). Default -at. */
export type ElReadingRepo = RecordTable<ElReading, { shift: string; from: string; to: string }>;
/** billDate unique. Filters: from / to (bill date). Default -billDate. */
export type ElBillRepo = RecordTable<ElBill, { from: string; to: string }>;
