import { rcCheck, routeOf, type Named, type TransportDashboard, type TransportMeta, type TransportReports } from '../../contracts/transport';
import { isoNow, type Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { writeXlsx, type SheetSpec } from '../../lib/spreadsheet';
import type { DataLayer } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import type { CompanyService } from '../sampletrack/settings/company-service';
import type { FreightService } from './freight-service';

export interface Range {
  from?: string;
  to?: string;
}
const inRange = (d: string, r: Range) => (!r.from || d >= r.from) && (!r.to || d <= r.to);
const rupees = (p: number) => Math.round(p) / 100;
const sheet = <T,>(spec: SheetSpec<T>): SheetSpec<any> => spec;

/** Meta, dashboard, freight reports, exports and the order-form print. */
export class TransportReportService {
  constructor(
    private readonly data: DataLayer,
    private readonly freight: FreightService,
    private readonly company: CompanyService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  async meta(): Promise<TransportMeta> {
    const r = this.data.repos;
    const [vehicles, cities, states, tps] = await Promise.all([r.trVehicles.listAll(), r.cities.listAll(), r.states.listAll(), r.trTransporters.listAll()]);
    const stateName = new Map(states.map((s) => [s.id, s.name]));
    return {
      vehicles: vehicles.filter((v) => v.active).map((v) => v.name),
      cities: cities.map((c) => ({ city: c.city, state: stateName.get(c.stateId) ?? null, pincode: c.pincodes[0] ?? null })).sort((a, b) => a.city.localeCompare(b.city)),
      transporters: tps
        .filter((t) => t.active)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => ({ id: t.id, name: t.name, phone: t.phone, rating: t.rating, vehicles: t.vehicles, cities: [t.city, ...t.operatingCities.map((c) => c.city)] })),
      today: businessToday(this.clock),
    };
  }

  async dashboard(): Promise<TransportDashboard> {
    const r = this.data.repos;
    const [inqs, rcs, orders] = await Promise.all([r.trInquiries.listAll(), r.trRateCmps.listAll(), r.trOrders.listAll()]);
    const month = businessToday(this.clock).slice(0, 7);
    const byInq = new Map(inqs.map((i) => [i.id, i]));
    const decided = rcs.filter((x) => x.status === 'approved');
    const lowest = decided.filter((x) => rcCheck(x.quotes, x.selected, byInq.get(x.inquiryId)?.budgetPaise ?? 0).isLowest).length;
    return {
      inquiries: inqs.length,
      open: inqs.filter((i) => i.status === 'open').length,
      drafts: rcs.filter((x) => x.status === 'draft').length,
      pendingApproval: rcs.filter((x) => x.status === 'pending').length,
      orders: orders.filter((o) => o.status !== 'cancelled').length,
      inTransit: orders.filter((o) => o.status === 'issued').length,
      monthFreightPaise: orders.filter((o) => o.status !== 'cancelled' && o.date.startsWith(month)).reduce((s, o) => s + o.ratePaise, 0),
      lowestShare: decided.length ? Math.round((lowest / decided.length) * 100) : null,
      recentInquiries: await this.freight.inquiryViews(inqs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5)),
      pending: await this.freight.rcViews(rcs.filter((x) => x.status === 'pending')),
    };
  }

  /** Freight spend and how rates were chosen (legacy Freight Reports was a placeholder). */
  async reports(range: Range): Promise<TransportReports> {
    const r = this.data.repos;
    const [inqs, rcs, all] = await Promise.all([r.trInquiries.listAll(), r.trRateCmps.listAll(), r.trOrders.listAll()]);
    const orders = all.filter((o) => o.status !== 'cancelled' && inRange(o.date, range));
    const byInq = new Map(inqs.map((i) => [i.id, i]));
    const approved = rcs.filter((x) => x.status === 'approved' && inRange(byInq.get(x.inquiryId)?.date ?? '', range));
    const checks = approved.map((x) => ({ x, c: rcCheck(x.quotes, x.selected, byInq.get(x.inquiryId)?.budgetPaise ?? 0) }));
    const group = <T,>(rows: T[], key: (r: T) => string) => {
      const m = new Map<string, T[]>();
      for (const row of rows) m.set(key(row), [...(m.get(key(row)) ?? []), row]);
      return [...m];
    };
    const sum = (os: typeof orders) => os.reduce((s, o) => s + o.ratePaise, 0);
    return {
      orders: orders.length,
      freightPaise: sum(orders),
      delivered: orders.filter((o) => o.status === 'delivered').length,
      lowestShare: checks.length ? Math.round((checks.filter(({ c }) => c.isLowest).length / checks.length) * 100) : null,
      savedVsHighestPaise: checks.reduce((s, { x, c }) => s + (Math.max(0, ...x.quotes.map((q) => q.ratePaise)) - (c.selectedPaise ?? 0)), 0),
      exceptions: checks.filter(({ c }) => c.needsJustification).length,
      byMonth: group(orders, (o) => o.date.slice(0, 7))
        .map(([name, os]) => ({ name, value: sum(os) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      byTransporter: group(orders, (o) => o.transporter.name)
        .map(([name, os]) => ({ name, orders: os.length, freightPaise: sum(os) }))
        .sort((a, b) => b.freightPaise - a.freightPaise),
      byRoute: group(orders, (o) => `${routeOf(o.from, o.to)} · ${o.vehicle}`)
        .map(([route, os]) => ({ route, orders: os.length, freightPaise: sum(os), avgPaise: Math.round(sum(os) / os.length) }))
        .sort((a, b) => b.freightPaise - a.freightPaise),
      byVehicle: group(orders, (o) => o.vehicle)
        .map(([name, os]): Named => ({ name, value: os.length }))
        .sort((a, b) => b.value - a.value),
    };
  }

  async exportXlsx(actor: Actor, kind: 'transporters' | 'inquiries' | 'orders', range: Range): Promise<Uint8Array> {
    const r = this.data.repos;
    let sheets: SheetSpec<any>[];
    if (kind === 'transporters')
      sheets = [
        sheet({
          name: 'Transporters',
          rows: (await r.trTransporters.listAll()).sort((a, b) => a.code.localeCompare(b.code)),
          columns: [
            { header: 'Code', value: (t) => t.code },
            { header: 'Name', value: (t) => t.name },
            { header: 'Contact', value: (t) => t.contactPerson },
            { header: 'Mobile', value: (t) => t.phone },
            { header: 'Mobile2', value: (t) => t.phone2 },
            { header: 'Email', value: (t) => t.email },
            { header: 'Address', value: (t) => t.address },
            { header: 'City', value: (t) => t.city },
            { header: 'State', value: (t) => t.state },
            { header: 'Pincode', value: (t) => t.pincode },
            { header: 'GST', value: (t) => t.gstin },
            { header: 'PAN', value: (t) => t.pan },
            { header: 'TDS', value: (t) => (t.tds ? 'Yes' : 'No') },
            { header: 'Credit', value: (t) => t.creditTerms },
            { header: 'IFSC', value: (t) => t.ifsc },
            { header: 'Bank', value: (t) => t.bankName },
            { header: 'Branch', value: (t) => t.bankBranch },
            { header: 'AccName', value: (t) => t.accountName },
            { header: 'AccNo', value: (t) => t.accountNo },
            { header: 'Vehicles', value: (t) => t.vehicles.join(', ') },
            { header: 'OpCities', value: (t) => t.operatingCities.map((c) => c.city).join(', ') },
            { header: 'Rating', value: (t) => t.rating },
            { header: 'Active', value: (t) => (t.active ? 'Yes' : 'No') },
          ],
        }),
      ];
    else if (kind === 'inquiries')
      sheets = [
        sheet({
          name: 'Inquiries',
          rows: await this.freight.inquiryViews((await r.trInquiries.listAll()).filter((i) => inRange(i.date, range))),
          columns: [
            { header: 'Inquiry', value: (i) => i.inqNo },
            { header: 'Date', value: (i) => i.date },
            { header: 'From', value: (i) => i.from.city },
            { header: 'From pincode', value: (i) => i.from.pincode },
            { header: 'To', value: (i) => i.to.city },
            { header: 'To pincode', value: (i) => i.to.pincode },
            { header: 'Material', value: (i) => i.material },
            { header: 'Weight (MT)', value: (i) => i.weightMt },
            { header: 'Vehicle', value: (i) => i.vehicle },
            { header: 'Pickup', value: (i) => i.pickupDate },
            { header: 'Delivery', value: (i) => i.deliveryType },
            { header: 'Freight paid by', value: (i) => i.freightPaidBy },
            { header: 'Budget (₹)', value: (i) => (i.budgetPaise ? rupees(i.budgetPaise) : null) },
            { header: 'Status', value: (i) => i.status },
            { header: 'Rate comparison', value: (i) => i.rcNo },
            { header: 'Order', value: (i) => i.orderNo },
          ],
        }),
      ];
    else
      sheets = [
        sheet({
          name: 'Order forms',
          rows: await this.freight.orderViews((await r.trOrders.listAll()).filter((o) => inRange(o.date, range))),
          columns: [
            { header: 'Order', value: (o) => o.orderNo },
            { header: 'Date', value: (o) => o.date },
            { header: 'Inquiry', value: (o) => o.inqNo },
            { header: 'Approval', value: (o) => o.approvalNo },
            { header: 'Transporter', value: (o) => o.transporter.name },
            { header: 'From', value: (o) => o.from.city },
            { header: 'To', value: (o) => o.to.city },
            { header: 'Vehicle', value: (o) => o.vehicle },
            { header: 'Material', value: (o) => o.material },
            { header: 'Weight (MT)', value: (o) => o.weightMt },
            { header: 'Rate (₹)', value: (o) => rupees(o.ratePaise) },
            { header: 'Transit', value: (o) => o.transit },
            { header: 'Status', value: (o) => o.status },
            { header: 'Delivered on', value: (o) => o.deliveredOn },
          ],
        }),
      ];
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'transport_export', details: `Exported ${kind} (${sheets[0]!.rows.length} rows)` }));
    return writeXlsx(sheets);
  }

  async orderPrint(actor: Actor, id: string) {
    const order = await this.freight.getOrder(id);
    const company = await this.company.block();
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Print', entityType: 'transport_order', entityId: id, details: `Printed ${order.orderNo}` }));
    return { company, order, generatedAt: isoNow(this.clock) };
  }
}
