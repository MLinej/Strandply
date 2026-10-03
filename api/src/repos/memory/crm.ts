import type { Campaign, CrmCustomer, CrmCustomerFilters, FollowupFilters, LeadFilters, CrmProduct, CrmTask, Followup, Lead, Opportunity, OrderLost, OrderWon, Quotation, Salesperson } from '../../contracts/crm';
import { dateRange, MemoryRecordTable as MemoryCrmTable } from './record-table';
import type { MemoryStore } from './store';

const range = dateRange;

export function crmRepos(store: MemoryStore) {
  return {
    crmLeads: new MemoryCrmTable<Lead, LeadFilters>(store, 'crmLeads', 'crm_leads', [], {
      searchFields: ['companyName', 'contactPerson', 'mobile', 'city'],
      sortable: ['dateAdded', 'companyName', 'nextFollowUpDate', 'createdAt'],
      defaultSort: '-dateAdded',
      customFilters: { converted: (r, v) => !!r.customerId === v, product: (r, v) => r.product === v },
    }),
    crmCustomers: new MemoryCrmTable<CrmCustomer, CrmCustomerFilters>(store, 'crmCustomers', 'crm_customers', [], {
      searchFields: ['companyName', 'contactPerson', 'mobile', 'city', 'gstin'],
      sortable: ['companyName', 'nextFollowUp', 'lastContactDate', 'createdAt'],
      defaultSort: 'companyName',
    }),
    crmFollowups: new MemoryCrmTable<Followup, Omit<FollowupFilters, 'city'> & { customerIds: string[] }>(store, 'crmFollowups', 'crm_followups', [], {
      searchFields: ['discussion', 'nextAction', 'contactPerson'],
      sortable: ['date', 'nextFollowUpDate', 'createdAt'],
      defaultSort: '-date',
      customFilters: { ...range<Followup>('date'), customerIds: (r, v) => (v as string[]).includes(r.customerId) },
    }),
    crmOpportunities: new MemoryCrmTable<Opportunity, { stage: string; salesperson: string; customerId: string }>(store, 'crmOpportunities', 'crm_opportunities', [], {
      searchFields: ['product', 'competitor', 'notes'],
      sortable: ['createdAt', 'estValuePaise', 'expectedClosingDate'],
      defaultSort: '-createdAt',
    }),
    crmQuotations: new MemoryCrmTable<Quotation, { status: string; customerId: string }>(store, 'crmQuotations', 'crm_quotations', ['quoteNo'], {
      searchFields: ['quoteNo', 'product'],
      sortable: ['date', 'quoteNo', 'createdAt'],
      defaultSort: '-date',
    }),
    crmWon: new MemoryCrmTable<OrderWon, { customerId: string; salesperson: string }>(store, 'crmWon', 'crm_orders_won', ['orderNo'], {
      searchFields: ['orderNo', 'product'],
      sortable: ['orderDate', 'orderValuePaise', 'createdAt'],
      defaultSort: '-orderDate',
    }),
    crmLost: new MemoryCrmTable<OrderLost, { customerId: string; salesperson: string; lostReason: string }>(store, 'crmLost', 'crm_orders_lost', [], {
      searchFields: ['product', 'competitor', 'lostReason'],
      sortable: ['lostDate', 'estValuePaise', 'createdAt'],
      defaultSort: '-lostDate',
    }),
    crmTasks: new MemoryCrmTable<CrmTask, { status: string; assignedTo: string; customerId: string }>(store, 'crmTasks', 'crm_tasks', [], {
      searchFields: ['remarks', 'type'],
      sortable: ['dueDate', 'createdAt'],
      defaultSort: 'dueDate',
    }),
    crmCampaigns: new MemoryCrmTable<Campaign>(store, 'crmCampaigns', 'crm_campaigns', ['name'], { searchFields: ['name', 'platform'], sortable: ['name', 'startDate'], defaultSort: '-startDate' }),
    crmProducts: new MemoryCrmTable<CrmProduct>(store, 'crmProducts', 'crm_products', ['name'], { searchFields: ['name'], sortable: ['name'], defaultSort: 'name' }),
    crmSalespersons: new MemoryCrmTable<Salesperson>(store, 'crmSalespersons', 'crm_salespersons', ['name'], { searchFields: ['name', 'territory'], sortable: ['name'], defaultSort: 'name' }),
  };
}
