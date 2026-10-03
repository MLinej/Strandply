import {
  CUSTOMER_TYPES,
  duplicateHits,
  isOpenOpp,
  daysBetween,
  type Customer360,
  type CustomerType,
  type FollowupBoard,
  type LeadImportResult,
  type LeadImportRow,
} from '../../contracts/crm';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { conflict, notFound } from '../../lib/errors';
import { readFirstSheet } from '../../lib/spreadsheet';
import type { DataLayer } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { followupViews, isOpenFollowup, nextNo, quotationViews, taskViews, today, withCustomer } from './common';
import type { CrmRecordService } from './record-service';

/* eslint-disable @typescript-eslint/no-explicit-any -- inputs are validated by zod at the route */
type Input = Record<string, any>;
const money = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

/** Header aliases for the lead import sheet (legacy showImportPreview), compared lower-case with non-letters removed. */
const COLUMNS: Record<string, string[]> = {
  companyName: ['companyname', 'company', 'partyname', 'name'],
  contactPerson: ['contactperson', 'contact'],
  mobile: ['mobilenumber', 'mobile', 'phone'],
  email: ['email'],
  city: ['city'],
  state: ['state'],
  customerType: ['customertype', 'type'],
  product: ['productinterestedin', 'product'],
  source: ['source'],
  salesperson: ['salesperson'],
  remarks: ['remarks'],
};

/** Steps that move records between stages: convert, import, won / lost, reactivate; and the 360 view and follow-up board. */
export class CrmWorkflowService {
  constructor(
    private readonly data: DataLayer,
    private readonly records: CrmRecordService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  /** Possible duplicates of a lead being entered (legacy findDuplicateLeadOrCustomer). */
  async duplicates(rec: { companyName?: string | null; mobile?: string | null; email?: string | null; city?: string | null; except?: string }) {
    const [leads, customers] = await Promise.all([this.data.repos.crmLeads.listAll(), this.data.repos.crmCustomers.listAll()]);
    return duplicateHits(rec, leads, customers, rec.except);
  }

  /** Lead → customer profile; the lead keeps a link and moves on from "New Lead" (legacy convertToCustomer). */
  async convert(actor: Actor, leadId: string) {
    const c = await this.data.uow.run(async (tx) => {
      const l = await tx.crmLeads.getById(leadId);
      if (!l) throw notFound('Lead');
      if (l.customerId) throw conflict('converted', `${l.companyName} is already a customer`);
      const at = isoNow(this.clock);
      const now = today(this.clock);
      const cust = await tx.crmCustomers.create({
        id: newId(),
        companyName: l.companyName,
        contactPerson: l.contactPerson,
        contactPerson2: l.contactPerson2,
        designation: null,
        mobile: l.mobile,
        mobile2: l.mobile2,
        whatsapp: l.whatsapp,
        email: l.email,
        website: null,
        city: l.city,
        state: l.state,
        pincode: l.pincode,
        address: l.address,
        gstin: null,
        pan: null,
        customerType: l.customerType,
        estMonthlyReq: null,
        productsUsed: l.product,
        currentSupplier: null,
        approxPurchaseValue: null,
        preferredThickness: null,
        preferredSize: null,
        application: null,
        existingBrand: null,
        competitorBrand: null,
        paymentPreference: null,
        creditRequirement: null,
        territory: l.state,
        leadSource: l.source,
        salesperson: l.salesperson,
        status: 'Active',
        priority: 'Warm',
        firstContactDate: l.dateAdded,
        lastContactDate: now,
        nextFollowUp: l.nextFollowUpDate,
        remarks: l.remarks,
        leadId: l.id,
        salesCustomerId: null,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await tx.crmLeads.update(l.id, { customerId: cust.id, stage: l.stage === 'New Lead' ? 'Contacted' : l.stage, updatedAt: at });
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'crm_customer', entityId: cust.id, details: `Converted lead ${l.companyName} to a customer` });
      return cust;
    });
    return this.records.view('customers', c);
  }

  /** Lead sheet import: a dry run shows each row with what it may duplicate; commit adds the valid rows as "Imported" leads. */
  async importLeads(actor: Actor, bytes: Uint8Array, commit: boolean): Promise<LeadImportResult> {
    const sheet = readFirstSheet(bytes);
    const key = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '');
    const headerFor = Object.fromEntries(Object.entries(COLUMNS).map(([f, aliases]) => [f, sheet.headers.find((h) => aliases.includes(key(h))) ?? null]));
    const [leads, customers] = await Promise.all([this.data.repos.crmLeads.listAll(), this.data.repos.crmCustomers.listAll()]);
    const seen: { id: string; companyName: string; mobile: string; email: string | null; city: string | null }[] = [];
    const text = (r: Record<string, unknown>, f: string) => {
      const h = headerFor[f];
      const v = h ? String(r[h] ?? '').trim() : '';
      return v || null;
    };
    const rows: LeadImportRow[] = sheet.rows
      .map(({ row, cells }) => {
        const companyName = text(cells, 'companyName') ?? '';
        const mobile = (text(cells, 'mobile') ?? '').replace(/\.0$/, '');
        const type = text(cells, 'customerType');
        const rec = {
          row,
          companyName,
          contactPerson: text(cells, 'contactPerson'),
          mobile,
          email: text(cells, 'email'),
          city: text(cells, 'city'),
          state: text(cells, 'state'),
          customerType: (CUSTOMER_TYPES.find((t) => t.toLowerCase() === type?.toLowerCase()) ?? (type ? 'Other' : null)) as CustomerType | null,
          product: text(cells, 'product'),
          source: text(cells, 'source') ?? 'Other',
          salesperson: text(cells, 'salesperson'),
          remarks: text(cells, 'remarks'),
          duplicates: [] as string[],
          error: !companyName ? 'Company name is missing' : !mobile ? 'Mobile is missing' : null,
        };
        // Duplicates against what's saved and against earlier rows of the same sheet.
        rec.duplicates = rec.error ? [] : [...duplicateHits(rec, leads, customers), ...duplicateHits(rec, seen, []).map((s) => s.replace('Lead', 'Earlier row'))];
        if (!rec.error) seen.push({ id: `row-${row}`, companyName, mobile, email: rec.email, city: rec.city });
        return rec;
      })
      .filter((r) => r.companyName || r.mobile);
    const valid = rows.filter((r) => !r.error);
    let imported = 0;
    if (commit && valid.length)
      await this.data.uow.run(async (tx) => {
        const at = isoNow(this.clock);
        const now = today(this.clock);
        for (const r of valid) {
          await tx.crmLeads.create({
            id: newId(),
            dateAdded: now,
            companyName: r.companyName,
            contactPerson: r.contactPerson,
            contactPerson2: null,
            mobile: r.mobile,
            mobile2: null,
            altMobile: null,
            whatsapp: null,
            email: r.email,
            city: r.city,
            state: r.state,
            pincode: null,
            address: null,
            customerType: r.customerType,
            product: r.product,
            source: r.source,
            campaign: null,
            salesperson: r.salesperson,
            stage: 'New Lead',
            nextAction: null,
            nextFollowUpDate: null,
            remarks: r.remarks,
            dataQuality: 'Imported',
            customerId: null,
            createdBy: actor.id,
            createdAt: at,
            updatedAt: at,
          });
          imported++;
        }
        await this.activity.record(tx, actor, { action: 'Import', entityType: 'crm_lead', details: `Imported ${imported} lead(s)${rows.some((x) => x.duplicates.length) ? `, ${rows.filter((x) => x.duplicates.length).length} flagged as possible duplicates` : ''}` });
      });
    return { total: sheet.rows.length, valid: valid.length, duplicates: rows.filter((r) => r.duplicates.length).length, rows: rows.slice(0, 500), imported };
  }

  /** Opportunity → order won (ORD/26-27/0001), with days from first contact (legacy markOpportunityWon). */
  async markWon(actor: Actor, oppId: string, input: Input) {
    const row = await this.data.uow.run(async (tx) => {
      const o = await tx.crmOpportunities.getById(oppId);
      if (!o) throw notFound('Opportunity');
      if (!isOpenOpp(o.stage)) throw conflict('closed', `This opportunity is already ${o.stage === 'Order Won' ? 'won' : 'lost'}`);
      const c = await tx.crmCustomers.getById(o.customerId);
      const at = isoNow(this.clock);
      const now = today(this.clock);
      const w = await tx.crmWon.create({
        id: newId(),
        orderNo: await nextNo(tx, 'ORD', now, at),
        opportunityId: o.id,
        customerId: o.customerId,
        orderDate: now,
        product: o.product,
        quantity: o.quantity,
        ratePaise: input.ratePaise ?? 0,
        orderValuePaise: input.orderValuePaise,
        dispatchDate: input.dispatchDate ?? null,
        reason: input.reason ?? null,
        remarks: input.remarks ?? null,
        salesperson: o.salesperson,
        source: c?.leadSource ?? null,
        leadToOrderDays: c?.firstContactDate ? daysBetween(c.firstContactDate, now) : null,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await tx.crmOpportunities.update(o.id, { stage: 'Order Won', probability: 100, updatedAt: at });
      await this.activity.record(tx, actor, { action: 'StatusChange', entityType: 'crm_opportunity', entityId: o.id, details: `Order won ${w.orderNo}: ${o.product}, ${money(w.orderValuePaise)}` });
      return w;
    });
    return this.records.view('won', row);
  }

  /** Opportunity → order lost, with the reason, prices and a reactivation date (legacy markOpportunityLost). */
  async markLost(actor: Actor, oppId: string, input: Input) {
    const row = await this.data.uow.run(async (tx) => {
      const o = await tx.crmOpportunities.getById(oppId);
      if (!o) throw notFound('Opportunity');
      if (!isOpenOpp(o.stage)) throw conflict('closed', `This opportunity is already ${o.stage === 'Order Won' ? 'won' : 'lost'}`);
      const at = isoNow(this.clock);
      const l = await tx.crmLost.create({
        id: newId(),
        opportunityId: o.id,
        customerId: o.customerId,
        lostDate: today(this.clock),
        product: o.product,
        quantity: o.quantity,
        estValuePaise: o.estValuePaise,
        competitor: input.competitor ?? o.competitor,
        competitorPricePaise: input.competitorPricePaise ?? null,
        ourPricePaise: input.ourPricePaise ?? null,
        expectedPricePaise: input.expectedPricePaise ?? null,
        lostReason: input.lostReason,
        remarks: input.remarks ?? null,
        reactivationDate: input.reactivationDate ?? null,
        salesperson: o.salesperson,
        reactivatedOppId: null,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await tx.crmOpportunities.update(o.id, { stage: 'Order Lost', probability: 0, updatedAt: at });
      await this.activity.record(tx, actor, { action: 'StatusChange', entityType: 'crm_opportunity', entityId: o.id, details: `Order lost: ${o.product}, ${input.lostReason}` });
      return l;
    });
    return this.records.view('lost', row);
  }

  /** A lost order back into the pipeline as a new opportunity at 20% (legacy reactivateLost). Once per lost order. */
  async reactivate(actor: Actor, lostId: string) {
    const opp = await this.data.uow.run(async (tx) => {
      const l = await tx.crmLost.getById(lostId);
      if (!l) throw notFound('Lost order');
      if (l.reactivatedOppId) throw conflict('reactivated', 'This lost order has already been reactivated');
      const at = isoNow(this.clock);
      const o = await tx.crmOpportunities.create({
        id: newId(),
        customerId: l.customerId,
        product: l.product,
        thickness: null,
        size: null,
        quantity: l.quantity,
        estValuePaise: l.estValuePaise,
        expectedClosingDate: null,
        salesperson: l.salesperson,
        stage: 'Qualification',
        probability: 20,
        competitor: l.competitor,
        currentSupplier: null,
        notes: `Reactivated after a lost order (${l.lostReason})`,
        reactivatedFrom: l.id,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await tx.crmLost.update(l.id, { reactivatedOppId: o.id, updatedAt: at });
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'crm_opportunity', entityId: o.id, details: `Reactivated lost order: ${l.product}` });
      return o;
    });
    return this.records.view('opportunities', opp);
  }

  /** Open follow-ups by when they're due: overdue, today, tomorrow, later (legacy followupBuckets). */
  async board(salesperson?: string): Promise<FollowupBoard> {
    const now = today(this.clock);
    const tomorrow = addDays(now, 1);
    const open = (await this.data.repos.crmFollowups.listAll()).filter((f) => isOpenFollowup(f) && (!salesperson || f.salesperson === salesperson));
    const views = (await followupViews(this.data.repos, open)).sort((a, b) => a.due.localeCompare(b.due) || a.customerName.localeCompare(b.customerName));
    return {
      overdue: views.filter((f) => f.due < now),
      today: views.filter((f) => f.due === now),
      tomorrow: views.filter((f) => f.due === tomorrow),
      upcoming: views.filter((f) => f.due > tomorrow),
    };
  }

  /** Everything about one customer (legacy renderCustomer360), plus Sales orders and invoices when linked to a Sales party. */
  async customer360(id: string): Promise<Customer360> {
    const r = this.data.repos;
    const customer = await r.crmCustomers.getById(id);
    if (!customer) throw notFound('Customer');
    const now = today(this.clock);
    const mine = <T extends { customerId: string | null }>(xs: T[]) => xs.filter((x) => x.customerId === id);
    const [f, o, q, w, l, t] = await Promise.all([r.crmFollowups.listAll(), r.crmOpportunities.listAll(), r.crmQuotations.listAll(), r.crmWon.listAll(), r.crmLost.listAll(), r.crmTasks.listAll()]);
    const [followups, opportunities, quotations, won, lost, tasks] = await Promise.all([
      followupViews(r, mine(f).sort((a, b) => b.date.localeCompare(a.date))),
      withCustomer(r, mine(o)),
      quotationViews(r, mine(q).sort((a, b) => b.date.localeCompare(a.date))),
      withCustomer(r, mine(w)),
      withCustomer(r, mine(l)),
      taskViews(r, mine(t), now),
    ]);
    let sales: Customer360['sales'] = null;
    let salesParty: Customer360['salesParty'] = null;
    if (customer.salesCustomerId) {
      const party = await r.salesCustomers.getById(customer.salesCustomerId);
      if (party) {
        salesParty = { id: party.id, name: party.name };
        const [orders, invoices] = await Promise.all([r.salesOrders.listAll(), r.salesInvoices.listAll()]);
        const inv = invoices.filter((i) => i.billToId === party.id || i.shipToId === party.id);
        sales = {
          orders: orders.filter((x) => x.billToId === party.id || x.shipToId === party.id).length,
          invoices: inv.length,
          invoicedPaise: inv.reduce((s, i) => s + i.totalPaise, 0),
          lastInvoice: inv.map((i) => i.date).sort().at(-1) ?? null,
        };
      }
    }
    const timeline = [
      ...followups.map((x) => ({ date: x.date, kind: x.type, text: x.discussion ?? x.nextAction ?? 'Follow-up logged' })),
      ...quotations.map((x) => ({ date: x.date, kind: 'Quotation', text: `${x.quoteNo} ${x.product}: ${money(x.finalPaise)} (${x.status})` })),
      ...won.map((x) => ({ date: x.orderDate, kind: 'Order won', text: `${x.orderNo} ${x.quantity ?? ''} ${x.product}: ${money(x.orderValuePaise)}`.replace(/\s+/g, ' ') })),
      ...lost.map((x) => ({ date: x.lostDate, kind: 'Order lost', text: `${x.product}: ${x.lostReason}` })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    return { customer, salesParty, opportunities, followups, quotations, won, lost, tasks, sales, timeline };
  }
}
