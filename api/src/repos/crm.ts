// Repo interfaces for the CRM module. Every read ignores soft-deleted rows. Rows are returned as copies.
// One shape for every CRM table; list() filters are per table (see repos/memory/crm.ts and db/migrations/0011_crm.sql).
import type { Campaign, CrmCustomer, CrmCustomerFilters, CrmProduct, CrmTask, Followup, FollowupFilters, Lead, LeadFilters, Opportunity, OrderLost, OrderWon, Quotation, Salesperson } from '../contracts/crm';

import type { RecordTable } from './record-table';

/** CRM tables use the shared record-table shape. */
export type CrmTable<T, F extends object = Record<string, never>> = RecordTable<T, F>;

/** Searches company, contact, mobile, city. Filters: stage, salesperson, customerType, product, source, converted. Sortable: dateAdded (default -), companyName, nextFollowUpDate. */
export type LeadRepo = CrmTable<Lead, LeadFilters>;
/** Searches company, contact, mobile, city, GSTIN. Filters: customerType, priority, status, salesperson, city. Sortable: companyName (default), nextFollowUp, lastContactDate. */
export type CrmCustomerRepo = CrmTable<CrmCustomer, CrmCustomerFilters>;
/** Searches discussion, next action, contact. Filters: customerId, customerIds (any of), from / to (date), salesperson, type, status. Default -date. */
export type FollowupRepo = CrmTable<Followup, Omit<FollowupFilters, 'city'> & { customerIds: string[] }>;
/** Filters: stage, salesperson, customerId. Default -createdAt. */
export type OpportunityRepo = CrmTable<Opportunity, { stage: string; salesperson: string; customerId: string }>;
/** quoteNo unique. Filters: status, customerId. Default -date. */
export type QuotationRepo = CrmTable<Quotation, { status: string; customerId: string }>;
/** orderNo unique. Default -orderDate. */
export type OrderWonRepo = CrmTable<OrderWon, { customerId: string; salesperson: string }>;
export type OrderLostRepo = CrmTable<OrderLost, { customerId: string; salesperson: string; lostReason: string }>;
export type CrmTaskRepo = CrmTable<CrmTask, { status: string; assignedTo: string; customerId: string }>;
/** name unique. */
export type CampaignRepo = CrmTable<Campaign>;
export type CrmProductRepo = CrmTable<CrmProduct>;
export type SalespersonRepo = CrmTable<Salesperson>;
