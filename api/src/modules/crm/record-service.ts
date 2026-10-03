import { isOpenOpp, quoteTotals, type Campaign, type CrmCustomer, type CrmProduct, type CrmTask, type Followup, type Lead, type Opportunity, type OrderLost, type OrderWon, type Quotation, type Salesperson } from '../../contracts/crm';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { conflict, HttpError, notFound } from '../../lib/errors';
import { UniqueViolationError, type CrmTable, type DataLayer, type ListQuery, type Repos } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { badRef, followupViews, nextNo, quotationViews, taskViews, today, withCustomer } from './common';

/* eslint-disable @typescript-eslint/no-explicit-any -- each kind's input is validated by its own zod schema at the route */
type Input = Record<string, any>;
type Row = { id: string; createdAt: string };
interface Ctx {
  actor: Actor;
  today: string;
  at: string;
}

interface KindSpec<T extends Row> {
  repo: (r: Repos) => CrmTable<T, any>;
  label: string;
  /** Activity log entity type. */
  entity: string;
  /** False for records made only by a workflow step (orders won / lost). */
  creatable?: boolean;
  /** The stored fields: on create from the input, on update from the current row merged with the patch. */
  build(tx: Repos, input: Input, before: T | null, ctx: Ctx): Promise<Omit<T, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>>;
  views(repos: Repos, rows: T[], today: string): Promise<unknown[]>;
  describe(row: T): string;
  /** Why it can't be deleted, if it can't. */
  blocker?(tx: Repos, row: T): Promise<string | null>;
  after?(tx: Repos, row: T, before: T | null, ctx: Ctx): Promise<void>;
  onDelete?(tx: Repos, row: T, ctx: Ctx): Promise<void>;
  /** The unique field's message. */
  duplicate?: string;
}

const strip = <T extends object>(row: T): Input => {
  const { id: _i, createdBy: _c, createdAt: _a, updatedAt: _u, deletedAt: _d, ...rest } = row as Input;
  return rest;
};
const defined = (o: Input) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const pick = (i: Input, keys: string[]) => Object.fromEntries(keys.map((k) => [k, i[k] ?? null]));
const money = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const plainViews = async <T,>(_r: Repos, rows: T[]) => rows;

async function customerOf(tx: Repos, id: string | null | undefined, path = 'customerId') {
  if (!id) return null;
  const c = await tx.crmCustomers.getById(id);
  if (!c) throw badRef(path, 'Unknown customer');
  return c;
}
const nowTime = (at: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(at));

const LEAD_KEYS = ['companyName', 'contactPerson', 'contactPerson2', 'mobile', 'mobile2', 'altMobile', 'whatsapp', 'email', 'city', 'state', 'pincode', 'address', 'customerType', 'product', 'source', 'campaign', 'salesperson', 'nextAction', 'nextFollowUpDate', 'remarks'];
const lead: KindSpec<Lead> = {
  repo: (r) => r.crmLeads,
  label: 'Lead',
  entity: 'crm_lead',
  async build(_tx, i, before, ctx) {
    return { ...pick(i, LEAD_KEYS), companyName: i.companyName, mobile: i.mobile, dateAdded: i.dateAdded ?? before?.dateAdded ?? ctx.today, stage: i.stage, dataQuality: before?.dataQuality ?? i.dataQuality ?? 'Good', customerId: before?.customerId ?? null } as Omit<Lead, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
  },
  views: plainViews,
  describe: (l) => `${l.companyName} (${l.stage})`,
  async onDelete(tx, l, ctx) {
    if (!l.customerId) return;
    const c = await tx.crmCustomers.getById(l.customerId);
    if (c?.leadId === l.id) await tx.crmCustomers.update(c.id, { leadId: null, updatedAt: ctx.at });
  },
};

const CUSTOMER_KEYS = ['contactPerson', 'contactPerson2', 'designation', 'mobile2', 'whatsapp', 'email', 'website', 'city', 'state', 'pincode', 'address', 'gstin', 'pan', 'customerType', 'estMonthlyReq', 'productsUsed', 'currentSupplier', 'approxPurchaseValue', 'preferredThickness', 'preferredSize', 'application', 'existingBrand', 'competitorBrand', 'paymentPreference', 'creditRequirement', 'territory', 'leadSource', 'salesperson', 'nextFollowUp', 'remarks', 'salesCustomerId'];
const customer: KindSpec<CrmCustomer> = {
  repo: (r) => r.crmCustomers,
  label: 'Customer',
  entity: 'crm_customer',
  async build(tx, i, before, ctx) {
    if (i.salesCustomerId && !(await tx.salesCustomers.getById(i.salesCustomerId))) throw badRef('salesCustomerId', 'Unknown Sales party');
    return {
      ...pick(i, CUSTOMER_KEYS),
      companyName: i.companyName,
      mobile: i.mobile,
      status: i.status,
      priority: i.priority,
      firstContactDate: before ? before.firstContactDate : ctx.today,
      lastContactDate: before ? before.lastContactDate : ctx.today,
      leadId: before?.leadId ?? i.leadId ?? null,
    } as Omit<CrmCustomer, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
  },
  views: plainViews,
  describe: (c) => `${c.companyName}${c.city ? `, ${c.city}` : ''}`,
  async blocker(tx, c) {
    const [f, o, q, w, l, t] = await Promise.all([tx.crmFollowups.listAll(), tx.crmOpportunities.listAll(), tx.crmQuotations.listAll(), tx.crmWon.listAll(), tx.crmLost.listAll(), tx.crmTasks.listAll()]);
    const n = [...f, ...o, ...q, ...w, ...l, ...t].filter((r) => r.customerId === c.id).length;
    return n ? `${c.companyName} has ${n} follow-up(s), opportunities, quotations, orders or tasks. Archive it instead.` : null;
  },
  async onDelete(tx, c, ctx) {
    for (const l of (await tx.crmLeads.listAll()).filter((x) => x.customerId === c.id)) await tx.crmLeads.update(l.id, { customerId: null, updatedAt: ctx.at });
  },
};

const FOLLOWUP_KEYS = ['discussion', 'customerResponse', 'nextAction', 'nextFollowUpDate'];
const followup: KindSpec<Followup> = {
  repo: (r) => r.crmFollowups,
  label: 'Follow-up',
  entity: 'crm_followup',
  async build(tx, i, before, ctx) {
    const c = (await customerOf(tx, i.customerId))!;
    return {
      ...pick(i, FOLLOWUP_KEYS),
      customerId: c.id,
      date: i.date ?? ctx.today,
      time: i.time ?? before?.time ?? nowTime(ctx.at),
      type: i.type,
      contactPerson: i.contactPerson ?? c.contactPerson,
      salesperson: i.salesperson ?? c.salesperson ?? ctx.actor.name,
      status: i.status,
      priority: i.priority ?? c.priority,
    } as Omit<Followup, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
  },
  views: (r, rows) => followupViews(r, rows),
  describe: (f) => `${f.type} on ${f.date}: ${f.status}${f.nextFollowUpDate ? `, next ${f.nextFollowUpDate}` : ''}`,
  /** Logging or completing a follow-up is contact with the customer; its next date becomes the customer's (legacy quickFollowupModal / completeAction). */
  async after(tx, f, before, ctx) {
    const c = await tx.crmCustomers.getById(f.customerId);
    if (!c) return;
    const patch: Partial<CrmCustomer> = {};
    if (!before || (f.status === 'Completed' && before.status !== 'Completed')) patch.lastContactDate = [c.lastContactDate ?? '', f.status === 'Completed' ? ctx.today : f.date].sort().at(-1)!;
    if (f.nextFollowUpDate && (f.status === 'Pending' || f.status === 'Rescheduled') && f.nextFollowUpDate !== before?.nextFollowUpDate) patch.nextFollowUp = f.nextFollowUpDate;
    if (Object.keys(patch).length) await tx.crmCustomers.update(c.id, { ...patch, updatedAt: ctx.at });
  },
};

const OPP_KEYS = ['thickness', 'size', 'quantity', 'expectedClosingDate', 'salesperson', 'competitor', 'currentSupplier', 'notes'];
const opportunity: KindSpec<Opportunity> = {
  repo: (r) => r.crmOpportunities,
  label: 'Opportunity',
  entity: 'crm_opportunity',
  async build(tx, i, before) {
    const c = (await customerOf(tx, i.customerId))!;
    if (before && !isOpenOpp(before.stage) && i.stage !== before.stage) throw conflict('closed', `This opportunity is ${before.stage === 'Order Won' ? 'won' : 'lost'}; reactivate the lost order instead`);
    return { ...pick(i, OPP_KEYS), customerId: c.id, product: i.product, estValuePaise: i.estValuePaise, stage: i.stage, probability: i.probability, salesperson: i.salesperson ?? c.salesperson, reactivatedFrom: before?.reactivatedFrom ?? null } as Omit<Opportunity, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
  },
  views: (r, rows) => withCustomer(r, rows),
  describe: (o) => `${o.product}${o.quantity ? `, ${o.quantity}` : ''}: ${money(o.estValuePaise)} (${o.stage})`,
  async blocker(tx, o) {
    if (!isOpenOpp(o.stage)) return `It’s marked ${o.stage === 'Order Won' ? 'won' : 'lost'}; delete that record first`;
    const q = (await tx.crmQuotations.listAll()).filter((x) => x.opportunityId === o.id);
    return q.length ? `Quotation ${q.map((x) => x.quoteNo).join(', ')} is linked to it` : null;
  },
};

const quotation: KindSpec<Quotation> = {
  repo: (r) => r.crmQuotations,
  label: 'Quotation',
  entity: 'crm_quotation',
  async build(tx, i, before, ctx) {
    const c = (await customerOf(tx, i.customerId))!;
    if (i.opportunityId) {
      const o = await tx.crmOpportunities.getById(i.opportunityId);
      if (!o) throw badRef('opportunityId', 'Unknown opportunity');
      if (o.customerId !== c.id) throw badRef('opportunityId', 'That opportunity is another customer’s');
    }
    const date = i.date ?? ctx.today;
    return {
      quoteNo: before?.quoteNo ?? (await nextNo(tx, 'QT', date, ctx.at)),
      customerId: c.id,
      opportunityId: i.opportunityId ?? null,
      product: i.product,
      quantity: i.quantity,
      ratePaise: i.ratePaise,
      gstPct: i.gstPct,
      date,
      validUntil: i.validUntil ?? null,
      salesperson: i.salesperson ?? c.salesperson,
      status: i.status,
      remarks: i.remarks ?? null,
    };
  },
  views: (r, rows) => quotationViews(r, rows),
  describe: (q) => `${q.quoteNo} ${q.product} × ${q.quantity}: ${money(quoteTotals(q).finalPaise)} (${q.status})`,
};

/** Orders won / lost come from an opportunity; their details can be corrected, and deleting one reopens it. */
const reopen = async (tx: Repos, oppId: string | null, ctx: Ctx) => {
  if (!oppId) return;
  const o = await tx.crmOpportunities.getById(oppId);
  if (o && !isOpenOpp(o.stage)) await tx.crmOpportunities.update(o.id, { stage: 'Negotiation', updatedAt: ctx.at });
};
const won: KindSpec<OrderWon> = {
  repo: (r) => r.crmWon,
  label: 'Order won',
  entity: 'crm_won',
  creatable: false,
  async build(_tx, i) {
    return { ...strip(i), ratePaise: i.ratePaise ?? 0, orderValuePaise: i.orderValuePaise, dispatchDate: i.dispatchDate ?? null, reason: i.reason ?? null, remarks: i.remarks ?? null } as Omit<OrderWon, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
  },
  views: (r, rows) => withCustomer(r, rows),
  describe: (o) => `${o.orderNo} ${o.product}: ${money(o.orderValuePaise)}`,
  onDelete: (tx, o, ctx) => reopen(tx, o.opportunityId, ctx),
};
const lost: KindSpec<OrderLost> = {
  repo: (r) => r.crmLost,
  label: 'Order lost',
  entity: 'crm_lost',
  creatable: false,
  async build(_tx, i) {
    return { ...strip(i) } as Omit<OrderLost, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
  },
  views: (r, rows) => withCustomer(r, rows),
  describe: (o) => `${o.product}: ${o.lostReason}`,
  async blocker(_tx, o) {
    return o.reactivatedOppId ? 'It has been reactivated; the new opportunity points at it' : null;
  },
  onDelete: (tx, o, ctx) => reopen(tx, o.opportunityId, ctx),
};

const task: KindSpec<CrmTask> = {
  repo: (r) => r.crmTasks,
  label: 'Task',
  entity: 'crm_task',
  async build(tx, i) {
    await customerOf(tx, i.customerId);
    return { type: i.type, customerId: i.customerId ?? null, assignedTo: i.assignedTo ?? null, dueDate: i.dueDate, priority: i.priority, status: i.status, remarks: i.remarks ?? null };
  },
  views: (r, rows, now) => taskViews(r, rows, now),
  describe: (t) => `${t.type} due ${t.dueDate} (${t.status})`,
};

const campaign: KindSpec<Campaign> = {
  repo: (r) => r.crmCampaigns,
  label: 'Campaign',
  entity: 'crm_campaign',
  duplicate: 'Another campaign already has that name',
  async build(_tx, i) {
    return { name: i.name, platform: i.platform ?? null, startDate: i.startDate ?? null, endDate: i.endDate ?? null, budgetPaise: i.budgetPaise, targetAudience: i.targetAudience ?? null, product: i.product ?? null };
  },
  async views(repos, rows) {
    const leads = await repos.crmLeads.listAll();
    return rows.map((c) => {
      const n = leads.filter((l) => l.campaign === c.name).length;
      return { ...c, leads: n, costPerLeadPaise: n ? Math.round(c.budgetPaise / n) : null };
    });
  },
  describe: (c) => `${c.name}${c.budgetPaise ? `, budget ${money(c.budgetPaise)}` : ''}`,
};

const product: KindSpec<CrmProduct> = {
  repo: (r) => r.crmProducts,
  label: 'Product',
  entity: 'crm_product',
  duplicate: 'Another product already has that name',
  async build(_tx, i) {
    return { name: i.name, thickness: i.thickness ?? null, size: i.size ?? null, grade: i.grade ?? null, application: i.application ?? null, ratePaise: i.ratePaise, moq: i.moq ?? null, active: i.active };
  },
  views: plainViews,
  describe: (p) => p.name,
};

const salesperson: KindSpec<Salesperson> = {
  repo: (r) => r.crmSalespersons,
  label: 'Salesperson',
  entity: 'crm_salesperson',
  duplicate: 'Another salesperson already has that name',
  async build(_tx, i) {
    return { name: i.name, mobile: i.mobile ?? null, email: i.email ?? null, territory: i.territory ?? null, designation: i.designation ?? null, active: i.active };
  },
  views: plainViews,
  describe: (s) => `${s.name}${s.territory ? `, ${s.territory}` : ''}`,
};

export const CRM_KINDS = { leads: lead, customers: customer, followups: followup, opportunities: opportunity, quotations: quotation, won, lost, tasks: task, campaigns: campaign, products: product, salespersons: salesperson };
export type CrmKind = keyof typeof CRM_KINDS;

/** List / get / create / edit / delete for every CRM record kind, each with its own rules (legacy DB.add / DB.update / DB.remove). */
export class CrmRecordService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  private spec(kind: CrmKind) {
    return CRM_KINDS[kind] as unknown as KindSpec<Row & Input>;
  }
  private ctx(actor: Actor): Ctx {
    return { actor, today: today(this.clock), at: isoNow(this.clock) };
  }

  async list(kind: CrmKind, query: ListQuery<any>) {
    const s = this.spec(kind);
    // Follow-ups by the customer's city (legacy follow-up report filter).
    if (kind === 'followups' && query.filters?.city) {
      const { city, ...rest } = query.filters;
      const ids = (await this.data.repos.crmCustomers.listAll()).filter((c) => c.city?.toLowerCase() === String(city).toLowerCase()).map((c) => c.id);
      query = { ...query, filters: { ...rest, customerIds: ids } };
    }
    const res = await s.repo(this.data.repos).list(query);
    return { rows: await s.views(this.data.repos, res.rows, today(this.clock)), total: res.total };
  }

  async all(kind: CrmKind) {
    const s = this.spec(kind);
    return s.views(this.data.repos, await s.repo(this.data.repos).listAll(), today(this.clock));
  }

  async get(kind: CrmKind, id: string) {
    const s = this.spec(kind);
    const row = await s.repo(this.data.repos).getById(id);
    if (!row) throw notFound(s.label);
    return (await s.views(this.data.repos, [row], today(this.clock)))[0];
  }

  async view(kind: CrmKind, row: Row & Input) {
    return (await this.spec(kind).views(this.data.repos, [row], today(this.clock)))[0];
  }

  private unique<T>(s: KindSpec<Row & Input>, fn: () => Promise<T>) {
    return fn().catch((err) => {
      if (err instanceof UniqueViolationError) throw conflict('duplicate', s.duplicate ?? `That ${s.label.toLowerCase()} already exists`);
      throw err;
    });
  }

  async create(kind: CrmKind, actor: Actor, input: Input) {
    const s = this.spec(kind);
    if (s.creatable === false) throw new HttpError(409, 'not_allowed', `${s.label} records are made from an opportunity`);
    const row = await this.data.uow.run(async (tx) => {
      const ctx = this.ctx(actor);
      const fields = await s.build(tx, input, null, ctx);
      const r = await this.unique(s, () => s.repo(tx).create({ id: newId(), ...fields, createdBy: actor.id, createdAt: ctx.at, updatedAt: ctx.at }));
      await s.after?.(tx, r, null, ctx);
      await this.activity.record(tx, actor, { action: 'Create', entityType: s.entity, entityId: r.id, details: `${s.label}: ${s.describe(r)}` });
      return r;
    });
    return this.view(kind, row);
  }

  async update(kind: CrmKind, actor: Actor, id: string, patch: Input) {
    const s = this.spec(kind);
    const row = await this.data.uow.run(async (tx) => {
      const before = await s.repo(tx).getById(id);
      if (!before) throw notFound(s.label);
      const ctx = this.ctx(actor);
      const fields = await s.build(tx, { ...strip(before), ...defined(patch) }, before, ctx);
      const r = (await this.unique(s, () => s.repo(tx).update(id, { ...fields, updatedAt: ctx.at })))!;
      await s.after?.(tx, r, before, ctx);
      await this.activity.record(tx, actor, { action: 'Edit', entityType: s.entity, entityId: id, details: `${s.label}: ${s.describe(r)}` });
      return r;
    });
    return this.view(kind, row);
  }

  async remove(kind: CrmKind, actor: Actor, id: string) {
    const s = this.spec(kind);
    await this.data.uow.run(async (tx) => {
      const row = await s.repo(tx).getById(id);
      if (!row) throw notFound(s.label);
      const why = await s.blocker?.(tx, row);
      if (why) throw new HttpError(409, 'in_use', `Can’t delete: ${why}`);
      const ctx = this.ctx(actor);
      await s.repo(tx).softDelete(id, ctx.at);
      await s.onDelete?.(tx, row, ctx);
      await this.activity.record(tx, actor, { action: 'Delete', entityType: s.entity, entityId: id, details: `Deleted ${s.label.toLowerCase()}: ${s.describe(row)}` });
    });
  }
}
