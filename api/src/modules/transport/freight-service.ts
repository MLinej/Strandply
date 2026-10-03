import {
  rcCheck,
  routeOf,
  type FreightOrder,
  type FreightOrderView,
  type Inquiry,
  type InquiryView,
  type PastQuote,
  type Quote,
  type RateComparison,
  type RateComparisonView,
} from '../../contracts/transport';
import { fyOf } from '../../contracts/purchase';
import { isoNow, type Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { newId } from '../../lib/crypto';
import { conflict, HttpError, notFound, validationFailed } from '../../lib/errors';
import type { DataLayer, ListQuery, Repos } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';

/* eslint-disable @typescript-eslint/no-explicit-any -- inputs are validated by zod at the route */
type Input = Record<string, any>;
const money = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const badRef = (path: string, message: string) => validationFailed('Invalid input', [{ path, message }]);
const defined = (o: Input) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** INQ-26-001, RC-26-001, FRA-26-001, SFO-26-001: one counter per prefix and FY. */
async function nextNo(tx: Repos, prefix: 'INQ' | 'RC' | 'FRA' | 'SFO', date: string, at: string) {
  const fy = fyOf(date);
  return `${prefix}-${fy.slice(2, 4)}-${String(await tx.counters.next(`TR-${prefix}-${fy}`, at)).padStart(3, '0')}`;
}

/** The freight flow (legacy Inquiry → Rate Comparison → Approval → Order Form). */
export class FreightService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  private today = () => businessToday(this.clock);

  // ── Views ─────────────────────────────────────────────────────────

  private async links(repos: Repos) {
    const [rcs, orders] = await Promise.all([repos.trRateCmps.listAll(), repos.trOrders.listAll()]);
    const rcByInq = new Map(rcs.map((r) => [r.inquiryId, r]));
    const liveOrder = (rcId: string) => orders.filter((o) => o.rcId === rcId && o.status !== 'cancelled').at(-1) ?? null;
    return { rcByInq, liveOrder };
  }

  async inquiryViews(rows: Inquiry[], repos: Repos = this.data.repos): Promise<InquiryView[]> {
    const { rcByInq, liveOrder } = await this.links(repos);
    return rows.map((i) => {
      const rc = rcByInq.get(i.id) ?? null;
      const o = rc ? liveOrder(rc.id) : null;
      return { ...i, rcId: rc?.id ?? null, rcNo: rc?.rcNo ?? null, rcStatus: rc?.status ?? null, orderId: o?.id ?? null, orderNo: o?.orderNo ?? null };
    });
  }

  async rcViews(rows: RateComparison[], repos: Repos = this.data.repos): Promise<RateComparisonView[]> {
    const [inqs, { liveOrder }] = await Promise.all([repos.trInquiries.listAll(), this.links(repos)]);
    const byId = new Map(inqs.map((i) => [i.id, i]));
    return rows.map((rc) => {
      const i = byId.get(rc.inquiryId)!;
      const o = liveOrder(rc.id);
      return {
        ...rc,
        ...rcCheck(rc.quotes, rc.selected, i?.budgetPaise ?? 0),
        inqNo: i?.inqNo ?? '—',
        inquiry: { from: i.from, to: i.to, material: i.material, weightMt: i.weightMt, vehicle: i.vehicle, budgetPaise: i.budgetPaise, pickupDate: i.pickupDate, deliveryType: i.deliveryType, freightPaidBy: i.freightPaidBy },
        orderId: o?.id ?? null,
        orderNo: o?.orderNo ?? null,
      };
    });
  }

  async orderViews(rows: FreightOrder[], repos: Repos = this.data.repos): Promise<FreightOrderView[]> {
    const [inqs, rcs] = await Promise.all([repos.trInquiries.listAll(), repos.trRateCmps.listAll()]);
    const inq = new Map(inqs.map((i) => [i.id, i]));
    const rc = new Map(rcs.map((r) => [r.id, r]));
    return rows.map((o) => ({ ...o, inqNo: inq.get(o.inquiryId)?.inqNo ?? '—', rcNo: rc.get(o.rcId)?.rcNo ?? '—', approvalNo: rc.get(o.rcId)?.approvalNo ?? null }));
  }

  // ── Inquiries ─────────────────────────────────────────────────────

  async listInquiries(query: ListQuery<{ status: string; vehicle: string; from: string; to: string }>) {
    const res = await this.data.repos.trInquiries.list(query);
    return { rows: await this.inquiryViews(res.rows), total: res.total };
  }

  async getInquiry(id: string) {
    const i = await this.data.repos.trInquiries.getById(id);
    if (!i) throw notFound('Inquiry');
    return (await this.inquiryViews([i]))[0]!;
  }

  private async vehicleExists(tx: Repos, name: string) {
    if (!(await tx.trVehicles.listAll()).some((v) => v.name === name)) throw badRef('vehicle', 'Unknown vehicle type');
  }
  private place = (p: Input) => ({ city: p.city, state: p.state ?? null, pincode: p.pincode ?? null });

  async createInquiry(actor: Actor, input: Input): Promise<InquiryView> {
    const row = await this.data.uow.run(async (tx) => {
      await this.vehicleExists(tx, input.vehicle);
      const at = isoNow(this.clock);
      const date = input.date ?? this.today();
      const inq = await tx.trInquiries.create({
        id: newId(),
        inqNo: await nextNo(tx, 'INQ', date, at),
        date,
        from: this.place(input.from),
        to: this.place(input.to),
        material: input.material,
        weightMt: input.weightMt ?? null,
        vehicle: input.vehicle,
        pickupDate: input.pickupDate ?? null,
        deliveryType: input.deliveryType,
        freightPaidBy: input.freightPaidBy,
        budgetPaise: input.budgetPaise,
        remarks: input.remarks ?? null,
        status: 'open',
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'transport_inquiry', entityId: inq.id, details: `${inq.inqNo} ${routeOf(inq.from, inq.to)}, ${inq.vehicle}, ${inq.material}` });
      return inq;
    });
    return (await this.inquiryViews([row]))[0]!;
  }

  /** Editable until its rate comparison is submitted (a rejected one reopens it). */
  async updateInquiry(actor: Actor, id: string, patch: Input): Promise<InquiryView> {
    const row = await this.data.uow.run(async (tx) => {
      const before = await tx.trInquiries.getById(id);
      if (!before) throw notFound('Inquiry');
      const rc = (await tx.trRateCmps.listAll()).find((r) => r.inquiryId === id);
      if (rc && rc.status !== 'draft' && rc.status !== 'rejected') throw conflict('locked', `${before.inqNo} is with ${rc.rcNo} (${rc.status}); its details are fixed`);
      if (before.status === 'cancelled') throw conflict('cancelled', `${before.inqNo} is cancelled`);
      const m = { ...before, ...defined(patch) };
      if (patch.vehicle) await this.vehicleExists(tx, patch.vehicle);
      const updated = (await tx.trInquiries.update(id, {
        date: m.date,
        from: this.place(m.from),
        to: this.place(m.to),
        material: m.material,
        weightMt: m.weightMt ?? null,
        vehicle: m.vehicle,
        pickupDate: m.pickupDate ?? null,
        deliveryType: m.deliveryType,
        freightPaidBy: m.freightPaidBy,
        budgetPaise: m.budgetPaise,
        remarks: m.remarks ?? null,
        updatedAt: isoNow(this.clock),
      }))!;
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'transport_inquiry', entityId: id, details: `Edited ${updated.inqNo}` });
      return updated;
    });
    return (await this.inquiryViews([row]))[0]!;
  }

  /** Cancel (or reopen) an inquiry that has no order. */
  async setInquiryCancelled(actor: Actor, id: string, cancelled: boolean): Promise<InquiryView> {
    const row = await this.data.uow.run(async (tx) => {
      const i = await tx.trInquiries.getById(id);
      if (!i) throw notFound('Inquiry');
      if (cancelled === (i.status === 'cancelled')) throw conflict('status', `${i.inqNo} is ${cancelled ? 'already cancelled' : 'not cancelled'}`);
      const { rcByInq, liveOrder } = await this.links(tx);
      const rc = rcByInq.get(id);
      if (cancelled && rc && liveOrder(rc.id)) throw conflict('ordered', `${i.inqNo} has an order; cancel the order first`);
      if (cancelled && rc?.status === 'pending') throw conflict('pending', `${rc.rcNo} is waiting for approval`);
      const status = cancelled ? 'cancelled' : rc?.status === 'approved' ? 'approved' : rc?.status === 'rejected' ? 'rejected' : 'open';
      const updated = (await tx.trInquiries.update(id, { status, updatedAt: isoNow(this.clock) }))!;
      await this.activity.record(tx, actor, { action: 'StatusChange', entityType: 'transport_inquiry', entityId: id, details: `${i.inqNo} ${cancelled ? 'cancelled' : 'reopened'}` });
      return updated;
    });
    return (await this.inquiryViews([row]))[0]!;
  }

  /** Quotes on earlier comparisons for the same route and vehicle, newest per transporter. */
  async pastQuotes(inquiryId: string): Promise<PastQuote[]> {
    const r = this.data.repos;
    const inq = await r.trInquiries.getById(inquiryId);
    if (!inq) throw notFound('Inquiry');
    const [inqs, rcs] = await Promise.all([r.trInquiries.listAll(), r.trRateCmps.listAll()]);
    const same = new Map(inqs.filter((i) => i.id !== inquiryId && i.vehicle === inq.vehicle && i.from.city.toLowerCase() === inq.from.city.toLowerCase() && i.to.city.toLowerCase() === inq.to.city.toLowerCase()).map((i) => [i.id, i]));
    const out = new Map<string, PastQuote>();
    for (const rc of rcs.filter((x) => same.has(x.inquiryId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      for (const q of rc.quotes)
        if (q.ratePaise > 0 && !out.has(q.transporterId)) out.set(q.transporterId, { transporterId: q.transporterId, transporterName: q.transporterName, ratePaise: q.ratePaise, transit: q.transit, rcNo: rc.rcNo, date: same.get(rc.inquiryId)!.date });
    return [...out.values()].sort((a, b) => a.ratePaise - b.ratePaise);
  }

  // ── Rate comparison and approval ──────────────────────────────────

  async listRcs(query: ListQuery<{ status: string; inquiryId: string }>) {
    const res = await this.data.repos.trRateCmps.list(query);
    return { rows: await this.rcViews(res.rows), total: res.total };
  }

  async getRc(id: string) {
    const rc = await this.data.repos.trRateCmps.getById(id);
    if (!rc) throw notFound('Rate comparison');
    return (await this.rcViews([rc]))[0]!;
  }

  /** Quotes with names, ratings and phones copied from the directory (legacy saveRcDraft). */
  private async quotes(tx: Repos, input: Input[]): Promise<Quote[]> {
    const tps = new Map((await tx.trTransporters.listAll()).map((t) => [t.id, t]));
    const seen = new Set<string>();
    return input.map((q, n) => {
      const t = tps.get(q.transporterId);
      if (!t) throw badRef(`quotes.${n}.transporterId`, 'Unknown transporter');
      if (seen.has(t.id)) throw badRef(`quotes.${n}.transporterId`, `${t.name} is already on the list`);
      seen.add(t.id);
      return { transporterId: t.id, transporterName: t.name, ratePaise: q.ratePaise, transit: q.transit ?? '2 Days', mgWeightMt: q.mgWeightMt ?? null, rating: t.rating, phone: t.phone };
    });
  }

  /**
   * Save the inquiry's comparison as a draft (one per inquiry; created on first save). A submitted one is fixed;
   * a rejected one goes back to draft when edited.
   */
  async saveRc(actor: Actor, inquiryId: string, input: Input): Promise<RateComparisonView> {
    const row = await this.data.uow.run(async (tx) => {
      const inq = await tx.trInquiries.getById(inquiryId);
      if (!inq) throw notFound('Inquiry');
      if (inq.status === 'cancelled') throw conflict('cancelled', `${inq.inqNo} is cancelled`);
      const before = (await tx.trRateCmps.listAll()).find((r) => r.inquiryId === inquiryId) ?? null;
      if (before && before.status !== 'draft' && before.status !== 'rejected') throw conflict('locked', `${before.rcNo} is ${before.status === 'pending' ? 'waiting for approval' : 'approved'}`);
      const quotes = await this.quotes(tx, input.quotes);
      if (input.selected !== null && input.selected !== undefined && !quotes[input.selected]?.ratePaise) throw badRef('selected', 'Pick a quote with a rate');
      const at = isoNow(this.clock);
      const fields = { quotes, selected: input.selected ?? null, justification: input.justification ?? null, status: 'draft' as const };
      let rc: RateComparison;
      if (before) {
        const reopened = before.status === 'rejected';
        rc = (await tx.trRateCmps.update(before.id, { ...fields, trail: reopened ? [...before.trail, { action: 'reopened', by: actor.id, byName: actor.name, note: 'Edited after rejection', at }] : before.trail, updatedAt: at }))!;
        if (reopened) await tx.trInquiries.update(inq.id, { status: 'open', updatedAt: at });
      } else {
        rc = await tx.trRateCmps.create({ id: newId(), rcNo: await nextNo(tx, 'RC', inq.date, at), inquiryId, ...fields, approvalNo: null, trail: [], createdBy: actor.id, createdAt: at, updatedAt: at });
      }
      await this.activity.record(tx, actor, { action: before ? 'Edit' : 'Create', entityType: 'transport_rate', entityId: rc.id, details: `${rc.rcNo} for ${inq.inqNo}: ${quotes.filter((q) => q.ratePaise > 0).length} rate(s)` });
      return rc;
    });
    return (await this.rcViews([row]))[0]!;
  }

  /** Send the chosen quote for approval; a justification is needed when it isn't the lowest or is over budget (legacy openJustModal). */
  async submitRc(actor: Actor, id: string): Promise<RateComparisonView> {
    const row = await this.data.uow.run(async (tx) => {
      const rc = await tx.trRateCmps.getById(id);
      if (!rc) throw notFound('Rate comparison');
      if (rc.status !== 'draft') throw conflict('wrong_state', `${rc.rcNo} is already ${rc.status === 'pending' ? 'waiting for approval' : rc.status}`);
      const inq = (await tx.trInquiries.getById(rc.inquiryId))!;
      const check = rcCheck(rc.quotes, rc.selected, inq.budgetPaise);
      if (check.selectedPaise === null) throw validationFailed('Pick the quote to go with', [{ path: 'selected', message: 'Pick a quote' }]);
      if (check.needsJustification && !rc.justification) throw validationFailed('Say why this quote', [{ path: 'justification', message: check.exceedsBudget ? 'Over budget: give a reason' : 'Not the lowest rate: give a reason' }]);
      const at = isoNow(this.clock);
      const q = rc.quotes[rc.selected!]!;
      const approvalNo = rc.approvalNo ?? (await nextNo(tx, 'FRA', this.today(), at));
      const updated = (await tx.trRateCmps.update(id, {
        status: 'pending',
        approvalNo,
        trail: [...rc.trail, { action: 'submitted', by: actor.id, byName: actor.name, note: `${q.transporterName} at ${money(q.ratePaise)}${rc.justification ? `. Justification: ${rc.justification}` : ''}`, at }],
        updatedAt: at,
      }))!;
      await tx.trInquiries.update(inq.id, { status: 'rate_compared', updatedAt: at });
      await this.activity.record(tx, actor, { action: 'StatusChange', entityType: 'transport_rate', entityId: id, details: `${approvalNo}: ${rc.rcNo} sent for approval, ${q.transporterName} ${money(q.ratePaise)}` });
      return updated;
    });
    return (await this.rcViews([row]))[0]!;
  }

  /** Approve (as an exception when the quote needed a justification) or reject with a reason (legacy doApprove / doApproveExc / doReject). */
  async decideRc(actor: Actor, id: string, decision: 'approve' | 'reject', note: string | null): Promise<RateComparisonView> {
    const row = await this.data.uow.run(async (tx) => {
      const rc = await tx.trRateCmps.getById(id);
      if (!rc) throw notFound('Rate comparison');
      if (rc.status !== 'pending') throw conflict('wrong_state', `${rc.rcNo} isn’t waiting for approval`);
      if (decision === 'reject' && !note) throw validationFailed('Give a reason for rejecting', [{ path: 'note', message: 'Give a reason' }]);
      const inq = (await tx.trInquiries.getById(rc.inquiryId))!;
      const exception = rcCheck(rc.quotes, rc.selected, inq.budgetPaise).needsJustification;
      const at = isoNow(this.clock);
      const action = decision === 'reject' ? 'rejected' : exception ? 'exception_approved' : 'approved';
      const updated = (await tx.trRateCmps.update(id, { status: decision === 'reject' ? 'rejected' : 'approved', trail: [...rc.trail, { action, by: actor.id, byName: actor.name, note, at }], updatedAt: at }))!;
      await tx.trInquiries.update(inq.id, { status: decision === 'reject' ? 'rejected' : 'approved', updatedAt: at });
      await this.activity.record(tx, actor, { action: decision === 'approve' ? 'Approve' : 'StatusChange', entityType: 'transport_rate', entityId: id, details: `${rc.approvalNo} ${action.replace('_', ' ')}${note ? `: ${note}` : ''}` });
      return updated;
    });
    return (await this.rcViews([row]))[0]!;
  }

  // ── Order forms ───────────────────────────────────────────────────

  async listOrders(query: ListQuery<{ status: string; transporterId: string; from: string; to: string }>) {
    const res = await this.data.repos.trOrders.list(query);
    return { rows: await this.orderViews(res.rows), total: res.total };
  }

  async getOrder(id: string) {
    const o = await this.data.repos.trOrders.getById(id);
    if (!o) throw notFound('Order form');
    return (await this.orderViews([o]))[0]!;
  }

  /** The order form for an approved comparison (legacy generateOrder): one live order each. */
  async createOrder(actor: Actor, rcId: string): Promise<FreightOrderView> {
    const row = await this.data.uow.run(async (tx) => {
      const rc = await tx.trRateCmps.getById(rcId);
      if (!rc) throw notFound('Rate comparison');
      if (rc.status !== 'approved') throw conflict('not_approved', `${rc.rcNo} must be approved first`);
      const { liveOrder } = await this.links(tx);
      const existing = liveOrder(rc.id);
      if (existing) throw conflict('exists', `${rc.rcNo} already has order ${existing.orderNo}`);
      const inq = (await tx.trInquiries.getById(rc.inquiryId))!;
      const q = rc.quotes[rc.selected!]!;
      const t = await tx.trTransporters.getById(q.transporterId);
      if (!t) throw new HttpError(409, 'missing', `${q.transporterName} is no longer in the directory`);
      const at = isoNow(this.clock);
      const date = this.today();
      const o = await tx.trOrders.create({
        id: newId(),
        orderNo: await nextNo(tx, 'SFO', date, at),
        rcId: rc.id,
        inquiryId: inq.id,
        date,
        transporterId: t.id,
        transporter: { name: t.name, contactPerson: t.contactPerson, phone: t.phone, gstin: t.gstin, address: t.address, city: t.city, state: t.state, creditTerms: t.creditTerms },
        from: inq.from,
        to: inq.to,
        vehicle: inq.vehicle,
        material: inq.material,
        weightMt: inq.weightMt,
        pickupDate: inq.pickupDate,
        deliveryType: inq.deliveryType,
        freightPaidBy: inq.freightPaidBy,
        ratePaise: q.ratePaise,
        transit: q.transit,
        status: 'issued',
        deliveredOn: null,
        remarks: null,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await tx.trRateCmps.update(rc.id, { trail: [...rc.trail, { action: 'ordered', by: actor.id, byName: actor.name, note: `Order ${o.orderNo} issued`, at }], updatedAt: at });
      await tx.trInquiries.update(inq.id, { status: 'ordered', updatedAt: at });
      await this.activity.record(tx, actor, { action: 'Create', entityType: 'transport_order', entityId: o.id, details: `${o.orderNo} to ${t.name}: ${routeOf(o.from, o.to)}, ${money(o.ratePaise)}` });
      return o;
    });
    return (await this.orderViews([row]))[0]!;
  }

  /** Mark delivered (with the date) or cancelled; a cancelled order frees the approved comparison for a new one. */
  async updateOrder(actor: Actor, id: string, patch: Input): Promise<FreightOrderView> {
    const row = await this.data.uow.run(async (tx) => {
      const before = await tx.trOrders.getById(id);
      if (!before) throw notFound('Order form');
      if (before.status === 'cancelled') throw conflict('cancelled', `${before.orderNo} is cancelled`);
      const status = patch.status ?? before.status;
      const at = isoNow(this.clock);
      const updated = (await tx.trOrders.update(id, {
        status,
        deliveredOn: status === 'delivered' ? (patch.deliveredOn ?? before.deliveredOn ?? this.today()) : null,
        remarks: patch.remarks === undefined ? before.remarks : patch.remarks,
        pickupDate: patch.pickupDate === undefined ? before.pickupDate : patch.pickupDate,
        updatedAt: at,
      }))!;
      if (status === 'cancelled') await tx.trInquiries.update(before.inquiryId, { status: 'approved', updatedAt: at });
      await this.activity.record(tx, actor, { action: status !== before.status ? 'StatusChange' : 'Edit', entityType: 'transport_order', entityId: id, details: `${before.orderNo}: ${status}${updated.deliveredOn ? ` on ${updated.deliveredOn}` : ''}` });
      return updated;
    });
    return (await this.orderViews([row]))[0]!;
  }
}
