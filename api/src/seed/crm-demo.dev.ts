// DEV ONLY demo data for the CRM. The legacy CRM kept its records on the old server, so there was nothing to
// convert; these few made-up records exercise every screen (overdue and today's follow-ups, a won and a lost order).
import type { CrmCustomer, CrmTask, Followup, Lead, Opportunity, OrderLost, OrderWon, Quotation, Campaign } from '../contracts/crm';

type Bare<T> = Omit<T, 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

const lead = (id: string, dateAdded: string, companyName: string, mobile: string, city: string, state: string, o: Partial<Lead> = {}): Bare<Lead> => ({
  id, dateAdded, companyName, contactPerson: null, contactPerson2: null, mobile, mobile2: null, altMobile: null, whatsapp: null, email: null, city, state, pincode: null, address: null,
  customerType: 'Dealer', product: 'OSB', source: 'IndiaMART', campaign: null, salesperson: 'Suresh Kumar', stage: 'New Lead', nextAction: null, nextFollowUpDate: null, remarks: null, dataQuality: 'Good', customerId: null, ...o,
});
export const DEMO_LEADS: Bare<Lead>[] = [
  lead('crl-1', '2026-09-02', 'Shree Ram Plywood', '9825000101', 'Rajkot', 'Gujarat', { contactPerson: 'Ramesh Patel', stage: 'Qualified', customerId: 'crc-1', product: 'S-OSB', source: 'Dealer Reference' }),
  lead('crl-2', '2026-09-05', 'Urban Interiors', '9825000102', 'Ahmedabad', 'Gujarat', { customerType: 'Architect', stage: 'Quotation', customerId: 'crc-2', product: 'Hybrid Board', source: 'Website', campaign: 'Interior Expo 2026' }),
  lead('crl-3', '2026-09-10', 'BuildRight Contractors', '9822000103', 'Pune', 'Maharashtra', { customerType: 'Contractor', stage: 'Order Won', customerId: 'crc-3', product: 'MDO Board', salesperson: 'Kaushik Kothari' }),
  lead('crl-4', '2026-09-12', 'Packwell Industries', '9825000104', 'Morbi', 'Gujarat', { stage: 'Order Lost', customerId: 'crc-4', source: 'Outbound Calling' }),
  lead('crl-5', '2026-09-25', 'Krishna Furniture', '9825000105', 'Surat', 'Gujarat', { customerType: 'Furniture Manufacturer', product: 'Firnopan', source: 'Instagram', campaign: 'Interior Expo 2026', nextFollowUpDate: '2026-10-05' }),
  lead('crl-6', '2026-09-28', 'Jaipur Board House', '9829000106', 'Jaipur', 'Rajasthan', { stage: 'Contacted', source: 'TradeIndia', salesperson: 'Kaushik Kothari' }),
  lead('crl-7', '2026-10-01', 'Coastal Packaging', '9825000107', 'Vapi', 'Gujarat', { source: 'Google', dataQuality: 'Imported' }),
];

const cust = (id: string, companyName: string, mobile: string, city: string, state: string, o: Partial<CrmCustomer> = {}): Bare<CrmCustomer> => ({
  id, companyName, contactPerson: null, contactPerson2: null, designation: null, mobile, mobile2: null, whatsapp: mobile, email: null, website: null, city, state, pincode: null, address: null, gstin: null, pan: null,
  customerType: 'Dealer', estMonthlyReq: null, productsUsed: null, currentSupplier: null, approxPurchaseValue: null, preferredThickness: null, preferredSize: null, application: null, existingBrand: null, competitorBrand: null,
  paymentPreference: null, creditRequirement: null, territory: state, leadSource: 'IndiaMART', salesperson: 'Suresh Kumar', status: 'Active', priority: 'Warm', firstContactDate: null, lastContactDate: null, nextFollowUp: null, remarks: null,
  leadId: null, salesCustomerId: null, ...o,
});
export const DEMO_CRM_CUSTOMERS: Bare<CrmCustomer>[] = [
  cust('crc-1', 'Shree Ram Plywood', '9825000101', 'Rajkot', 'Gujarat', { contactPerson: 'Ramesh Patel', productsUsed: 'S-OSB', estMonthlyReq: '2 trucks', competitorBrand: 'Greenply', leadSource: 'Dealer Reference', priority: 'Hot', firstContactDate: '2026-09-02', lastContactDate: '2026-09-28', nextFollowUp: '2026-09-30', leadId: 'crl-1' }),
  cust('crc-2', 'Urban Interiors', '9825000102', 'Ahmedabad', 'Gujarat', { customerType: 'Architect', productsUsed: 'Hybrid Board', leadSource: 'Website', firstContactDate: '2026-09-05', lastContactDate: '2026-09-20', nextFollowUp: '2026-10-03', leadId: 'crl-2' }),
  cust('crc-3', 'BuildRight Contractors', '9822000103', 'Pune', 'Maharashtra', { customerType: 'Contractor', productsUsed: 'MDO Board', salesperson: 'Kaushik Kothari', firstContactDate: '2026-09-10', lastContactDate: '2026-09-24', leadId: 'crl-3' }),
  cust('crc-4', 'Packwell Industries', '9825000104', 'Morbi', 'Gujarat', { leadSource: 'Outbound Calling', priority: 'Cold', firstContactDate: '2026-09-12', lastContactDate: '2026-08-25', leadId: 'crl-4' }),
];

const fu = (id: string, customerId: string, date: string, o: Partial<Followup> = {}): Bare<Followup> => ({
  id, customerId, date, time: '11:00', type: 'Call', contactPerson: null, salesperson: 'Suresh Kumar', discussion: null, customerResponse: null, nextAction: null, nextFollowUpDate: null, status: 'Pending', priority: 'Warm', ...o,
});
export const DEMO_FOLLOWUPS: Bare<Followup>[] = [
  fu('crf-1', 'crc-1', '2026-09-28', { discussion: 'Wants 18 mm S-OSB rates for two trucks a month', nextAction: 'Send revised rates', nextFollowUpDate: '2026-09-30', priority: 'Hot' }),
  fu('crf-2', 'crc-2', '2026-09-20', { type: 'Meeting', discussion: 'Showed Hybrid Board samples', nextAction: 'Follow up on quotation', nextFollowUpDate: '2026-10-03' }),
  fu('crf-3', 'crc-3', '2026-09-24', { type: 'Site Visit', salesperson: 'Kaushik Kothari', discussion: 'Order confirmed on site', status: 'Completed' }),
  fu('crf-4', 'crc-2', '2026-09-08', { type: 'WhatsApp', discussion: 'Catalogue shared', status: 'Completed' }),
];

export const DEMO_OPPORTUNITIES: Bare<Opportunity>[] = [
  { id: 'cro-1', customerId: 'crc-1', product: 'S-OSB', thickness: '18mm', size: '8x4 ft', quantity: '2 trucks / month', estValuePaise: 45_000_000, expectedClosingDate: '2026-10-20', salesperson: 'Suresh Kumar', stage: 'Negotiation', probability: 60, competitor: 'Greenply', currentSupplier: 'Greenply', notes: null, reactivatedFrom: null },
  { id: 'cro-2', customerId: 'crc-2', product: 'Hybrid Board', thickness: '12mm', size: '8x4 ft', quantity: '300 sheets', estValuePaise: 6_500_000, expectedClosingDate: '2026-10-15', salesperson: 'Suresh Kumar', stage: 'Quotation', probability: 40, competitor: null, currentSupplier: null, notes: null, reactivatedFrom: null },
  { id: 'cro-3', customerId: 'crc-3', product: 'MDO Board', thickness: '12mm', size: '8x4 ft', quantity: '500 sheets', estValuePaise: 12_000_000, expectedClosingDate: '2026-09-24', salesperson: 'Kaushik Kothari', stage: 'Order Won', probability: 100, competitor: null, currentSupplier: null, notes: null, reactivatedFrom: null },
  { id: 'cro-4', customerId: 'crc-4', product: 'OSB', thickness: '9mm', size: '8x4 ft', quantity: '1 truck', estValuePaise: 4_000_000, expectedClosingDate: '2026-09-20', salesperson: 'Suresh Kumar', stage: 'Order Lost', probability: 0, competitor: 'Local OSB', currentSupplier: null, notes: null, reactivatedFrom: null },
];

export const DEMO_QUOTATIONS: Bare<Quotation>[] = [
  { id: 'crq-1', quoteNo: 'QT/26-27/0001', customerId: 'crc-2', opportunityId: 'cro-2', product: 'Hybrid Board', quantity: 300, ratePaise: 210_000, gstPct: 18, date: '2026-09-15', validUntil: '2026-10-15', salesperson: 'Suresh Kumar', status: 'Sent', remarks: null },
];

export const DEMO_WON: Bare<OrderWon>[] = [
  { id: 'crw-1', orderNo: 'ORD/26-27/0001', opportunityId: 'cro-3', customerId: 'crc-3', orderDate: '2026-09-24', product: 'MDO Board', quantity: '500 sheets', ratePaise: 240_000, orderValuePaise: 12_000_000, dispatchDate: '2026-10-05', reason: 'Better finish than competitor', remarks: null, salesperson: 'Kaushik Kothari', source: 'IndiaMART', leadToOrderDays: 14 },
];

export const DEMO_LOST: Bare<OrderLost>[] = [
  { id: 'crx-1', opportunityId: 'cro-4', customerId: 'crc-4', lostDate: '2026-09-20', product: 'OSB', quantity: '1 truck', estValuePaise: 4_000_000, competitor: 'Local OSB', competitorPricePaise: 120_000, ourPricePaise: 135_000, expectedPricePaise: 120_000, lostReason: 'Competitor Lower Price', remarks: null, reactivationDate: '2026-11-01', salesperson: 'Suresh Kumar', reactivatedOppId: null },
];

export const DEMO_TASKS: Bare<CrmTask>[] = [
  { id: 'crt-1', type: 'Send Quotation', customerId: 'crc-1', assignedTo: 'Suresh Kumar', dueDate: '2026-10-02', priority: 'Hot', status: 'Pending', remarks: 'Revised 18 mm rates' },
  { id: 'crt-2', type: 'Send Sample', customerId: 'crc-2', assignedTo: 'Suresh Kumar', dueDate: '2026-10-06', priority: 'Warm', status: 'In Progress', remarks: null },
];

export const DEMO_CAMPAIGNS: Bare<Campaign>[] = [
  { id: 'crm-cp-1', name: 'Interior Expo 2026', platform: 'Exhibition', startDate: '2026-09-01', endDate: '2026-09-30', budgetPaise: 15_000_000, targetAudience: 'Architects and furniture makers', product: 'Hybrid Board' },
];

/** QT and ORD numbers the demo used. */
export const DEMO_CRM_COUNTERS = [
  { name: 'CRM-QT-2026-27', lastValue: 1 },
  { name: 'CRM-ORD-2026-27', lastValue: 1 },
];
