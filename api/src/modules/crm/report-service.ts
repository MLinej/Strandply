import {
  AGEING_BUCKETS,
  daysBetween,
  DORMANT_DAYS,
  HIGH_VALUE_PAISE,
  isOpenOpp,
  LEAD_STAGES,
  QUALIFIED_STAGES,
  QUIET_DAYS,
  quoteTotals,
  STALE_QUOTE_DAYS,
  type CrmAlert,
  type CrmDashboard,
  type CrmMeta,
  type CrmReports,
  type Named,
  type SalespersonView,
  type SourceRow,
} from '../../contracts/crm';
import type { CompanyBlock } from '../../contracts/sampletrack';
import { isoNow, type Clock } from '../../lib/clock';
import { writeXlsx, type SheetSpec } from '../../lib/spreadsheet';
import type { DataLayer } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import type { CompanyService } from '../sampletrack/settings/company-service';
import { followupViews, isOpenFollowup, quotationViews, readSettings, SETTING_KEYS, today, withCustomer } from './common';
import type { CrmRecordService } from './record-service';

export interface Range {
  from?: string;
  to?: string;
  salesperson?: string;
}
const inRange = (d: string | null, r: Range) => !!d && (!r.from || d >= r.from) && (!r.to || d <= r.to);
const rupees = (p: number | null) => (p === null ? null : Math.round(p) / 100);
function count<T>(rows: T[], key: (r: T) => string): Named[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
/** Types each sheet's column callbacks from its rows. */
const sheet = <T,>(spec: SheetSpec<T>): SheetSpec<any> => spec;

/** Meta, settings, dashboard, analytics, salesperson and source figures, exports, quotation print. */
export class CrmReportService {
  constructor(
    private readonly data: DataLayer,
    private readonly records: CrmRecordService,
    private readonly company: CompanyService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  async meta(): Promise<CrmMeta> {
    const r = this.data.repos;
    const [s, products, people, campaigns, customers] = await Promise.all([readSettings(r), r.crmProducts.listAll(), r.crmSalespersons.listAll(), r.crmCampaigns.listAll(), r.crmCustomers.listAll()]);
    return {
      ...s,
      products: products.filter((p) => p.active).map((p) => p.name).sort(),
      salespersons: people.filter((p) => p.active).map((p) => p.name).sort(),
      campaigns: campaigns.map((c) => c.name).sort(),
      customers: customers
        .filter((c) => c.status !== 'Archived')
        .sort((a, b) => a.companyName.localeCompare(b.companyName))
        .map((c) => ({ id: c.id, name: c.companyName, city: c.city, salesperson: c.salesperson, priority: c.priority, contactPerson: c.contactPerson })),
      today: today(this.clock),
    };
  }

  async updateSettings(actor: Actor, patch: { sources?: string[]; lostReasons?: string[] }) {
    return this.data.uow.run(async (tx) => {
      const at = isoNow(this.clock);
      const changed = Object.entries(patch).filter(([, v]) => v !== undefined) as ['sources' | 'lostReasons', string[]][];
      for (const [k, v] of changed) await tx.settings.set(SETTING_KEYS[k], v, actor.id, at);
      if (changed.length) await this.activity.record(tx, actor, { action: 'Edit', entityType: 'crm_settings', details: `Changed CRM ${changed.map(([k]) => (k === 'sources' ? 'marketing sources' : 'lost reasons')).join(' and ')}` });
      return readSettings(tx);
    });
  }

  private async load() {
    const r = this.data.repos;
    const [leads, customers, followups, opps, quotes, won, lost] = await Promise.all([r.crmLeads.listAll(), r.crmCustomers.listAll(), r.crmFollowups.listAll(), r.crmOpportunities.listAll(), r.crmQuotations.listAll(), r.crmWon.listAll(), r.crmLost.listAll()]);
    return { leads, customers, followups, opps, quotes, won, lost };
  }

  /** Management overview with alerts (legacy dashboard). */
  async dashboard(): Promise<CrmDashboard> {
    const now = today(this.clock);
    const { leads, customers, followups, opps, quotes, won, lost } = await this.load();
    const open = opps.filter((o) => isOpenOpp(o.stage));
    const due = followups.filter(isOpenFollowup).map((f) => ({ f, due: f.nextFollowUpDate ?? f.date }));
    const overdue = due.filter((x) => x.due < now);
    const lastFollowup = (customerId: string) =>
      followups
        .filter((f) => f.customerId === customerId)
        .map((f) => f.date)
        .sort()
        .at(-1);
    const quiet = open.filter((o) => {
      const last = lastFollowup(o.customerId);
      return o.estValuePaise > HIGH_VALUE_PAISE && (!last || daysBetween(last, now) > QUIET_DAYS);
    });
    const staleQuotes = quotes.filter((q) => q.status === 'Sent' && daysBetween(q.date, now) > STALE_QUOTE_DAYS);
    const byId = new Map(customers.map((c) => [c.id, c]));
    const noNext = open.filter((o) => !byId.get(o.customerId)?.nextFollowUp);
    const dormant = customers.filter((c) => c.status === 'Active' && c.lastContactDate && daysBetween(c.lastContactDate, now) >= DORMANT_DAYS);
    const reactivate = lost.filter((l) => l.reactivationDate && l.reactivationDate <= now && !l.reactivatedOppId);
    const alerts: CrmAlert[] = [];
    const add = (n: number, tone: CrmAlert['tone'], text: string, page: string) => n && alerts.push({ tone, text: `${n} ${text}`, page });
    add(overdue.length, 'red', `follow-up${overdue.length === 1 ? '' : 's'} overdue`, 'followups');
    add(quiet.length, 'red', `high-value opportunit${quiet.length === 1 ? 'y' : 'ies'} with no follow-up in ${QUIET_DAYS} days`, 'opportunities');
    add(staleQuotes.length, 'red', `quotation${staleQuotes.length === 1 ? '' : 's'} sent ${STALE_QUOTE_DAYS}+ days ago with no answer`, 'quotations');
    add(noNext.length, 'red', `open opportunit${noNext.length === 1 ? 'y' : 'ies'} whose customer has no next follow-up date`, 'opportunities');
    add(dormant.length, 'amber', `dormant customer${dormant.length === 1 ? '' : 's'}: no contact for ${DORMANT_DAYS}+ days`, 'customers');
    add(reactivate.length, 'green', `lost order${reactivate.length === 1 ? '' : 's'} due for reactivation`, 'lost');
    const funnelStages = ['New Lead', 'Contacted', 'Qualified', 'Sample Sent', 'Quotation', 'Negotiation', 'Order Won'];
    return {
      leads: leads.length,
      qualified: leads.filter((l) => QUALIFIED_STAGES.includes(l.stage)).length,
      openOpps: open.length,
      pipelinePaise: open.reduce((s, o) => s + o.estValuePaise, 0),
      dueToday: due.filter((x) => x.due === now).length,
      overdue: overdue.length,
      won: won.length,
      wonPaise: won.reduce((s, o) => s + o.orderValuePaise, 0),
      lost: lost.length,
      lostPaise: lost.reduce((s, o) => s + o.estValuePaise, 0),
      customers: customers.filter((c) => c.status === 'Active').length,
      quotesSent: quotes.filter((q) => q.status !== 'Draft').length,
      quotes: quotes.length,
      alerts,
      // Leads and opportunities at each stage (legacy counted both under the lead stage names).
      funnel: funnelStages.map((s) => ({ name: s, value: leads.filter((l) => l.stage === s).length + opps.filter((o) => o.stage === s || (s === 'Sample Sent' && o.stage === 'Sample')).length })),
      sources: count(leads, (l) => l.source ?? 'Other'),
      lostReasons: count(lost, (l) => l.lostReason),
      overdueList: (await followupViews(this.data.repos, overdue.map((x) => x.f))).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 8),
    };
  }

  /** Leads at each stage (legacy Lead Management stage summary). */
  async leadStages(): Promise<Named[]> {
    const leads = await this.data.repos.crmLeads.listAll();
    return LEAD_STAGES.map((name) => ({ name, value: leads.filter((l) => l.stage === name).length }));
  }

  /** Source → leads → qualified → quotations → won → lost → revenue (legacy campaigns page). */
  async sources(): Promise<SourceRow[]> {
    const { leads, customers, quotes, won, lost } = await this.load();
    const names = (await readSettings(this.data.repos)).sources;
    const extra = [...new Set([...leads.map((l) => l.source), ...customers.map((c) => c.leadSource)].filter((s): s is string => !!s && !names.includes(s)))];
    return [...names, ...extra]
      .map((source) => {
        const ids = new Set(customers.filter((c) => c.leadSource === source).map((c) => c.id));
        const w = won.filter((o) => ids.has(o.customerId));
        const sl = leads.filter((l) => l.source === source);
        return {
          source,
          leads: sl.length,
          qualified: sl.filter((l) => QUALIFIED_STAGES.includes(l.stage)).length,
          quotations: quotes.filter((q) => ids.has(q.customerId)).length,
          won: w.length,
          lost: lost.filter((o) => ids.has(o.customerId)).length,
          revenuePaise: w.reduce((s, o) => s + o.orderValuePaise, 0),
        };
      })
      .filter((r) => r.leads || r.won || r.quotations);
  }

  /** Each salesperson with their leads, overdue follow-ups, pipeline and won value (legacy salesperson page). */
  async salespersons(): Promise<SalespersonView[]> {
    const now = today(this.clock);
    const [people, { leads, followups, opps, won, lost }] = await Promise.all([this.data.repos.crmSalespersons.listAll(), this.load()]);
    return people
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        ...p,
        leads: leads.filter((l) => l.salesperson === p.name).length,
        overdue: followups.filter((f) => f.salesperson === p.name && isOpenFollowup(f) && (f.nextFollowUpDate ?? f.date) < now).length,
        pipelinePaise: opps.filter((o) => o.salesperson === p.name && isOpenOpp(o.stage)).reduce((s, o) => s + o.estValuePaise, 0),
        wonPaise: won.filter((o) => o.salesperson === p.name).reduce((s, o) => s + o.orderValuePaise, 0),
        won: won.filter((o) => o.salesperson === p.name).length,
        lost: lost.filter((o) => o.salesperson === p.name).length,
      }));
  }

  /** Reports & Analytics, narrowed by date (lead added / follow-up / order date) and salesperson. */
  async reports(r: Range): Promise<CrmReports> {
    const now = today(this.clock);
    const { leads, customers, followups, won, lost } = await this.load();
    const sp = <T extends { salesperson: string | null }>(xs: T[]) => (r.salesperson ? xs.filter((x) => x.salesperson === r.salesperson) : xs);
    const L = sp(leads).filter((l) => (!r.from && !r.to) || inRange(l.dateAdded, r));
    const F = sp(followups).filter((f) => (!r.from && !r.to) || inRange(f.date, r));
    const W = sp(won).filter((o) => (!r.from && !r.to) || inRange(o.orderDate, r));
    const X = sp(lost).filter((o) => (!r.from && !r.to) || inRange(o.lostDate, r));
    const openLeads = L.filter((l) => l.stage !== 'Order Won' && l.stage !== 'Order Lost');
    const people = [...new Set([...(await this.data.repos.crmSalespersons.listAll()).map((p) => p.name), ...W.map((o) => o.salesperson), ...X.map((o) => o.salesperson)].filter((s): s is string => !!s))];
    return {
      products: count(L, (l) => l.product ?? 'Other'),
      cities: count(L, (l) => l.city ?? 'Unknown').slice(0, 10),
      salespeople: people
        .filter((n) => !r.salesperson || n === r.salesperson)
        .map((name) => ({ name, won: W.filter((o) => o.salesperson === name).length, lost: X.filter((o) => o.salesperson === name).length, wonPaise: W.filter((o) => o.salesperson === name).reduce((s, o) => s + o.orderValuePaise, 0) })),
      ageing: AGEING_BUCKETS.map(([name, max], i) => {
        const min = i ? AGEING_BUCKETS[i - 1]![1] : -1;
        return { name, value: openLeads.filter((l) => daysBetween(l.dateAdded, now) > min && daysBetween(l.dateAdded, now) <= max).length };
      }),
      competitors: count(X, (l) => l.competitor ?? 'Unknown'),
      dormant: sp(customers)
        .filter((c) => c.status === 'Active' && c.lastContactDate && daysBetween(c.lastContactDate, now) >= DORMANT_DAYS)
        .map((c) => ({ id: c.id, name: c.companyName, salesperson: c.salesperson, days: daysBetween(c.lastContactDate!, now) }))
        .sort((a, b) => b.days - a.days),
      followupTypes: count(F, (f) => f.type),
      followupTrend: count(F, (f) => f.date).sort((a, b) => a.name.localeCompare(b.name)),
      sources: await this.sources(),
    };
  }

  // ── Exports and print ─────────────────────────────────────────────

  async exportXlsx(actor: Actor, kind: string, r: Range & { city?: string; status?: string; type?: string }): Promise<Uint8Array> {
    const repos = this.data.repos;
    let sheets: SheetSpec<any>[];
    switch (kind) {
      case 'leads':
        sheets = [
          sheet({
            name: 'Leads',
            rows: (await repos.crmLeads.listAll()).sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)),
            columns: [
              { header: 'Date added', value: (l) => l.dateAdded },
              { header: 'Company', value: (l) => l.companyName },
              { header: 'Contact', value: (l) => l.contactPerson },
              { header: 'Mobile', value: (l) => l.mobile },
              { header: 'WhatsApp', value: (l) => l.whatsapp },
              { header: 'Email', value: (l) => l.email },
              { header: 'City', value: (l) => l.city },
              { header: 'State', value: (l) => l.state },
              { header: 'Customer type', value: (l) => l.customerType },
              { header: 'Product', value: (l) => l.product },
              { header: 'Source', value: (l) => l.source },
              { header: 'Campaign', value: (l) => l.campaign },
              { header: 'Salesperson', value: (l) => l.salesperson },
              { header: 'Stage', value: (l) => l.stage },
              { header: 'Next follow-up', value: (l) => l.nextFollowUpDate },
              { header: 'Converted', value: (l) => (l.customerId ? 'Yes' : 'No') },
              { header: 'Remarks', value: (l) => l.remarks },
            ],
          }),
        ];
        break;
      case 'customers':
        sheets = [
          sheet({
            name: 'Customers',
            rows: (await repos.crmCustomers.listAll()).sort((a, b) => a.companyName.localeCompare(b.companyName)),
            columns: [
              { header: 'Company', value: (c) => c.companyName },
              { header: 'Contact', value: (c) => c.contactPerson },
              { header: 'Mobile', value: (c) => c.mobile },
              { header: 'Email', value: (c) => c.email },
              { header: 'City', value: (c) => c.city },
              { header: 'State', value: (c) => c.state },
              { header: 'GSTIN', value: (c) => c.gstin },
              { header: 'Type', value: (c) => c.customerType },
              { header: 'Products used', value: (c) => c.productsUsed },
              { header: 'Monthly requirement', value: (c) => c.estMonthlyReq },
              { header: 'Current supplier', value: (c) => c.currentSupplier },
              { header: 'Competitor brand', value: (c) => c.competitorBrand },
              { header: 'Lead source', value: (c) => c.leadSource },
              { header: 'Salesperson', value: (c) => c.salesperson },
              { header: 'Status', value: (c) => c.status },
              { header: 'Priority', value: (c) => c.priority },
              { header: 'Last contact', value: (c) => c.lastContactDate },
              { header: 'Next follow-up', value: (c) => c.nextFollowUp },
            ],
          }),
        ];
        break;
      case 'followups': {
        const rows = (await followupViews(repos, await repos.crmFollowups.listAll()))
          .filter((f) => inRange(f.date, { from: r.from ?? '0000', to: r.to ?? '9999' }) && (!r.salesperson || f.salesperson === r.salesperson) && (!r.city || f.city === r.city) && (!r.status || f.status === r.status) && (!r.type || f.type === r.type))
          .sort((a, b) => b.date.localeCompare(a.date));
        sheets = [
          sheet({
            name: 'Follow-ups',
            rows,
            columns: [
              { header: 'Date', value: (f) => f.date },
              { header: 'Party', value: (f) => f.customerName },
              { header: 'City', value: (f) => f.city },
              { header: 'Salesperson', value: (f) => f.salesperson },
              { header: 'Type', value: (f) => f.type },
              { header: 'Discussion', value: (f) => f.discussion },
              { header: 'Customer response', value: (f) => f.customerResponse },
              { header: 'Next action', value: (f) => f.nextAction },
              { header: 'Next follow-up', value: (f) => f.nextFollowUpDate },
              { header: 'Status', value: (f) => f.status },
            ],
          }),
        ];
        break;
      }
      case 'opportunities':
        sheets = [
          sheet({
            name: 'Opportunities',
            rows: await withCustomer(repos, await repos.crmOpportunities.listAll()),
            columns: [
              { header: 'Customer', value: (o) => o.customerName },
              { header: 'Product', value: (o) => o.product },
              { header: 'Thickness', value: (o) => o.thickness },
              { header: 'Size', value: (o) => o.size },
              { header: 'Quantity', value: (o) => o.quantity },
              { header: 'Est. value (₹)', value: (o) => rupees(o.estValuePaise) },
              { header: 'Stage', value: (o) => o.stage },
              { header: 'Probability %', value: (o) => o.probability },
              { header: 'Expected close', value: (o) => o.expectedClosingDate },
              { header: 'Salesperson', value: (o) => o.salesperson },
              { header: 'Competitor', value: (o) => o.competitor },
            ],
          }),
        ];
        break;
      case 'quotations':
        sheets = [
          sheet({
            name: 'Quotations',
            rows: await quotationViews(repos, await repos.crmQuotations.listAll()),
            columns: [
              { header: 'Quote no', value: (q) => q.quoteNo },
              { header: 'Date', value: (q) => q.date },
              { header: 'Customer', value: (q) => q.customerName },
              { header: 'Product', value: (q) => q.product },
              { header: 'Quantity', value: (q) => q.quantity },
              { header: 'Rate (₹)', value: (q) => rupees(q.ratePaise) },
              { header: 'Value (₹)', value: (q) => rupees(q.totalPaise) },
              { header: 'GST %', value: (q) => q.gstPct },
              { header: 'Final value (₹)', value: (q) => rupees(q.finalPaise) },
              { header: 'Valid until', value: (q) => q.validUntil },
              { header: 'Status', value: (q) => q.status },
            ],
          }),
        ];
        break;
      case 'won':
        sheets = [
          sheet({
            name: 'Orders won',
            rows: await withCustomer(repos, await repos.crmWon.listAll()),
            columns: [
              { header: 'Order no', value: (o) => o.orderNo },
              { header: 'Order date', value: (o) => o.orderDate },
              { header: 'Customer', value: (o) => o.customerName },
              { header: 'Product', value: (o) => o.product },
              { header: 'Quantity', value: (o) => o.quantity },
              { header: 'Value (₹)', value: (o) => rupees(o.orderValuePaise) },
              { header: 'Salesperson', value: (o) => o.salesperson },
              { header: 'Source', value: (o) => o.source },
              { header: 'Lead → order days', value: (o) => o.leadToOrderDays },
              { header: 'Dispatch', value: (o) => o.dispatchDate },
              { header: 'Reason', value: (o) => o.reason },
            ],
          }),
        ];
        break;
      case 'lost':
        sheets = [
          sheet({
            name: 'Orders lost',
            rows: await withCustomer(repos, await repos.crmLost.listAll()),
            columns: [
              { header: 'Lost date', value: (o) => o.lostDate },
              { header: 'Customer', value: (o) => o.customerName },
              { header: 'Product', value: (o) => o.product },
              { header: 'Est. value (₹)', value: (o) => rupees(o.estValuePaise) },
              { header: 'Competitor', value: (o) => o.competitor },
              { header: 'Competitor price (₹)', value: (o) => rupees(o.competitorPricePaise) },
              { header: 'Our price (₹)', value: (o) => rupees(o.ourPricePaise) },
              { header: 'Expected price (₹)', value: (o) => rupees(o.expectedPricePaise) },
              { header: 'Reason', value: (o) => o.lostReason },
              { header: 'Salesperson', value: (o) => o.salesperson },
              { header: 'Reactivation', value: (o) => o.reactivationDate },
            ],
          }),
        ];
        break;
      default:
        sheets = [];
    }
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'crm_export', details: `Exported CRM ${kind} (${sheets.reduce((s, x) => s + x.rows.length, 0)} rows)` }));
    return writeXlsx(sheets);
  }

  /** A quotation with letterhead and the customer's details (legacy printQuotation). */
  async quotationPrint(actor: Actor, id: string) {
    const q = (await this.records.get('quotations', id)) as Awaited<ReturnType<typeof quotationViews>>[number];
    const [company, customer] = await Promise.all([this.company.block() as Promise<CompanyBlock>, this.data.repos.crmCustomers.getById(q.customerId)]);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Print', entityType: 'crm_quotation', entityId: id, details: `Printed ${q.quoteNo}` }));
    return { company, quotation: { ...q, ...quoteTotals(q) }, customer, generatedAt: isoNow(this.clock) };
  }
}
