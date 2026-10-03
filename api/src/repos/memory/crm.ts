import type { Campaign, CrmCustomer, CrmCustomerFilters, FollowupFilters, LeadFilters, CrmProduct, CrmTask, Followup, Lead, Opportunity, OrderLost, OrderWon, Quotation, Salesperson } from '../../contracts/crm';
import type { CrmTable } from '../crm';
import type { ListQuery } from '../types';
import { SoftTable } from './crud';
import { listRows, type ListSpec } from './list';
import type { MemoryStore, TableName } from './store';

type Row = { id: string; createdAt: string; updatedAt: string; deletedAt: string | null };

/** One memory table for every CRM record kind; `spec` is how list() searches, filters and sorts. */
export class MemoryCrmTable<T extends Row, F extends object = Record<string, never>> extends SoftTable<T> implements CrmTable<T, F> {
  constructor(
    store: MemoryStore,
    table: TableName,
    entity: string,
    unique: (keyof T & string)[],
    private readonly spec: ListSpec<T>,
  ) {
    super(store, table, entity, unique);
  }

  async listAll() {
    return structuredClone(this.live().sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }

  async list(query: ListQuery<F>) {
    return listRows(this.live(), query, this.spec);
  }
}

const range = <T>(field: keyof T) => ({
  from: (r: T, v: unknown) => String(r[field] ?? '') >= String(v),
  to: (r: T, v: unknown) => String(r[field] ?? '') <= String(v),
});

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
