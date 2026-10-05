import { isOpenStatus, type Complaint, type ComplaintsDashboard, type ComplaintsMeta, type ComplaintsReports, type ComplaintView, type CpFile, type Named, type PartyRow } from '../../contracts/complaints';
import { fyOf } from '../../contracts/purchase';
import { isoNow, type Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { writeXlsx } from '../../lib/spreadsheet';
import type { DataLayer } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import type { CompanyService } from '../sampletrack/settings/company-service';
import type { ComplaintService } from './complaint-service';

export interface ReportQuery {
  from?: string;
  to?: string;
  /** "2026-27" */
  fy?: string;
}
const fileView = ({ blobKey: _k, ...f }: CpFile) => f;
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Views, meta, dashboard, reports, Excel export and the complaint report print. */
export class ComplaintReportService {
  constructor(
    private readonly data: DataLayer,
    private readonly complaints: ComplaintService,
    private readonly company: CompanyService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  view(c: Complaint): ComplaintView {
    return { ...c, photos: c.photos.map(fileView), timeline: c.timeline.map((e) => ({ ...e, files: e.files.map(fileView) })) };
  }

  async meta(): Promise<ComplaintsMeta> {
    const r = this.data.repos;
    const [parties, complaints, recipients, salespersons, crmSales] = await Promise.all([r.salesCustomers.listAll(), r.complaints.listAll(), this.complaints.recipients(), r.settings.getMany(['sales.sales_persons']), r.crmSalespersons.listAll()]);
    const known = new Set(parties.map((p) => p.name.trim().toLowerCase()));
    const typed = [...new Set(complaints.map((c) => c.customerName.trim()))].filter((n) => !known.has(n.toLowerCase()));
    const salesmen = new Set<string>([...((salespersons['sales.sales_persons'] as string[] | undefined) ?? []), ...crmSales.filter((s) => s.active).map((s) => s.name), ...complaints.map((c) => c.salesman)]);
    return {
      parties: [
        ...parties.sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ id: p.id, name: p.name, city: p.city, phone: p.mobile1 })),
        ...typed.sort((a, b) => a.localeCompare(b)).map((name) => ({ id: null, name, city: complaints.find((c) => c.customerName.trim() === name)?.customerLocation ?? null, phone: null })),
      ],
      salesmen: [...salesmen].filter(Boolean).sort((a, b) => a.localeCompare(b)),
      recipients: recipients.filter((x) => x.active),
      today: businessToday(this.clock),
    };
  }

  /** A Sales party's invoices, newest first, to pick the one a complaint is about. */
  async partyInvoices(customerId: string) {
    const invs = (await this.data.repos.salesInvoices.listAll()).filter((i) => i.billToId === customerId || i.shipToId === customerId);
    return invs.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100).map((i) => ({ id: i.id, invNo: i.invNo, date: i.date, totalPaise: i.totalPaise }));
  }

  async dashboard(): Promise<ComplaintsDashboard> {
    const all = (await this.data.repos.complaints.listAll()).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const count = (s: string) => all.filter((c) => c.status === s).length;
    const cats = new Map<string, number>();
    for (const c of all) cats.set(c.category, (cats.get(c.category) ?? 0) + 1);
    return {
      total: all.length,
      open: count('Open'),
      inProgress: count('In Progress'),
      resolved: count('Resolved'),
      closed: count('Closed'),
      critical: all.filter((c) => c.priority === 'Critical' && isOpenStatus(c.status)).length,
      recent: all.slice(0, 8).map((c) => this.view(c)),
      byCategory: [...cats].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    };
  }

  private async inScope(q: ReportQuery) {
    return (await this.data.repos.complaints.listAll()).filter((c) => (!q.fy || fyOf(c.date) === q.fy) && (!q.from || c.date >= q.from) && (!q.to || c.date <= q.to));
  }

  /** Legacy Reports (party-wise, issue-wise, month-wise) plus material, salesman and time to resolve. */
  async reports(q: ReportQuery): Promise<ComplaintsReports> {
    const all = await this.data.repos.complaints.listAll();
    const rows = await this.inScope(q);
    const split = (key: (c: Complaint) => string): PartyRow[] => {
      const m = new Map<string, Complaint[]>();
      for (const c of rows) m.set(key(c), [...(m.get(key(c)) ?? []), c]);
      return [...m].map(([name, cs]) => ({ name, total: cs.length, open: cs.filter((c) => isOpenStatus(c.status)).length, resolved: cs.filter((c) => !isOpenStatus(c.status)).length })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    };
    const count = (key: (c: Complaint) => string): Named[] => split(key).map((r) => ({ name: r.name, value: r.total }));
    const done = rows.filter((c) => c.resolvedOn);
    return {
      total: rows.length,
      open: rows.filter((c) => isOpenStatus(c.status)).length,
      resolved: rows.filter((c) => !isOpenStatus(c.status)).length,
      avgDaysToResolve: done.length ? Math.round((done.reduce((s, c) => s + days(c.date, c.resolvedOn!), 0) / done.length) * 10) / 10 : null,
      byParty: split((c) => c.customerName),
      byCategory: count((c) => c.category).map((x) => ({ ...x, share: Math.round((x.value / (rows.length || 1)) * 1000) / 10 })),
      byMaterial: count((c) => c.material),
      bySalesman: split((c) => c.salesman),
      byMonth: count((c) => c.date.slice(0, 7)).sort((a, b) => a.name.localeCompare(b.name)),
      years: [...new Set([fyOf(businessToday(this.clock)), ...all.map((c) => fyOf(c.date))])].sort().reverse(),
    };
  }

  async exportXlsx(actor: Actor, q: ReportQuery): Promise<Uint8Array> {
    const rows = (await this.inScope(q)).sort((a, b) => a.complaintNo.localeCompare(b.complaintNo));
    const bytes = writeXlsx([
      {
        name: 'Complaints',
        rows,
        columns: [
          { header: 'Complaint No', value: (c) => c.complaintNo },
          { header: 'Date', value: (c) => c.date },
          { header: 'Salesman', value: (c) => c.salesman },
          { header: 'Customer', value: (c) => c.customerName },
          { header: 'Phone', value: (c) => c.customerPhone },
          { header: 'Location', value: (c) => c.customerLocation },
          { header: 'Invoice', value: (c) => c.invoiceNo },
          { header: 'Material', value: (c) => c.material },
          { header: 'Category', value: (c) => c.category },
          { header: 'Priority', value: (c) => c.priority },
          { header: 'Status', value: (c) => c.status },
          { header: 'Resolved on', value: (c) => c.resolvedOn },
          { header: 'Description', value: (c) => c.description },
          { header: 'Recipient', value: (c) => [c.recipientName, c.recipientEmail].filter(Boolean).join(' ') },
          { header: 'Photos', value: (c) => c.photos.length },
        ],
      },
    ]);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'complaint_export', details: `Exported complaints (${rows.length} rows)` }));
    return bytes;
  }

  async print(actor: Actor, id: string) {
    const complaint = this.view(await this.complaints.get(id));
    const company = await this.company.block();
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Print', entityType: 'complaint', entityId: id, details: `Printed ${complaint.complaintNo}` }));
    return { company, complaint, generatedAt: isoNow(this.clock) };
  }
}
