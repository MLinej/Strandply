// Repo interfaces for the Transport module (shared record-table shape). Quotes and the approval trail live inside
// the rate comparison here; in D1 they are child tables (db/migrations/0012_transport.sql).
import type { FreightOrder, Inquiry, RateComparison, Transporter, TransporterFilters, VehicleType } from '../contracts/transport';
import type { RecordTable } from './record-table';

/** name unique. */
export type VehicleTypeRepo = RecordTable<VehicleType>;
/** code and name unique. Searches name, code, contact, phone, city, GSTIN. Filters: state, vehicle (runs it), operatesIn (city), active. Default name. */
export type TransporterRepo = RecordTable<Transporter, TransporterFilters>;
/** inqNo unique. Searches inqNo, material, from / to city. Filters: status, vehicle, from / to (date). Default -date. */
export type InquiryRepo = RecordTable<Inquiry, { status: string; vehicle: string; from: string; to: string }>;
/** rcNo unique; one live comparison per inquiry. Filters: status, inquiryId. Default -createdAt. */
export type RateComparisonRepo = RecordTable<RateComparison, { status: string; inquiryId: string }>;
/** orderNo unique; one live order per comparison. Searches orderNo, transporter name, material. Filters: status, transporterId, from / to (date). Default -date. */
export type FreightOrderRepo = RecordTable<FreightOrder, { status: string; transporterId: string; from: string; to: string }>;
