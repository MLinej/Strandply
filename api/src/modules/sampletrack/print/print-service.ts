import type {
  CompanyBlock,
  CourierLabel,
  PageSpec,
  QrPayload,
  RequestSlip,
  WhatsAppShare,
} from '../../../contracts/sampletrack';
import { isoNow, type Clock } from '../../../lib/clock';
import { notFound } from '../../../lib/errors';
import type { DataLayer } from '../../../repos';
import type { ActivityService, ActivityInput } from '../activity-service';
import type { Actor } from '../actor';
import type { DispatchService } from '../dispatches/dispatch-service';
import { normalizeIndianMobile } from '../masters/validation';
import type { RequestService } from '../requests/request-service';
import type { CompanyService } from '../settings/company-service';
import { qrPayload, whatsappText } from './share-text';

export const A5_LANDSCAPE: PageSpec = { size: 'A5', orientation: 'landscape', widthMm: 210, heightMm: 148 };
export const A4_PORTRAIT: PageSpec = { size: 'A4', orientation: 'portrait', widthMm: 210, heightMm: 297 };

/** Print and share payloads. Each call is logged; access needs the print permission (see the routes). */
export class PrintService {
  constructor(
    private readonly data: DataLayer,
    private readonly dispatches: DispatchService,
    private readonly requests: RequestService,
    private readonly activity: ActivityService,
    private readonly companySettings: CompanyService,
    private readonly clock: Clock,
  ) {}

  /** Company block for prints, from Settings. */
  company(): Promise<CompanyBlock> {
    return this.companySettings.block();
  }

  /** Courier label, A5 landscape. */
  async courierLabel(actor: Actor, dispatchId: string): Promise<CourierLabel> {
    const d = await this.dispatches.get(dispatchId);
    const party = await this.data.repos.parties.getById(d.partyId);
    if (!party) throw notFound('Party');
    const label: CourierLabel = {
      page: A5_LANDSCAPE,
      from: await this.company(),
      dispatch: {
        id: d.id,
        dspNo: d.dspNo,
        date: d.date,
        mode: d.mode,
        trackingNo: d.trackingNo,
        courierName: d.courierName,
        vehicleNo: d.vehicleNo,
        dimensions: d.dimensions,
        contents: d.productDescription,
        expectedDeliveryDate: d.expectedDeliveryDate,
        status: d.status,
      },
      to: {
        name: party.name,
        contact: party.contact,
        mobile: party.mobile,
        address: party.address,
        city: party.city,
        state: party.state,
        cityState: [party.city, party.state].filter(Boolean).join(', ') || null,
        pin: party.pin,
        email: party.email,
      },
      qrPayload: qrPayload(d),
      printedAt: isoNow(this.clock),
    };
    await this.log(actor, { action: 'Print', entityType: 'dispatch', entityId: d.id, details: `Printed courier label ${d.dspNo}` });
    return label;
  }

  /** Sample request slip, A4 portrait. */
  async requestSlip(actor: Actor, requestId: string): Promise<RequestSlip> {
    const r = await this.requests.get(requestId);
    const party = await this.data.repos.parties.getById(r.partyId);
    if (!party) throw notFound('Party');
    const slip: RequestSlip = {
      page: A4_PORTRAIT,
      company: await this.company(),
      request: {
        id: r.id,
        reqNo: r.reqNo,
        status: r.status,
        date: r.date,
        createdAt: r.createdAt,
        requiredDispatchDate: r.requiredDispatchDate,
        priority: r.priority,
        highPriority: r.priority === 'High' || r.priority === 'Urgent',
        purpose: r.purpose,
        requestedByName: r.requestedByName,
        remarks: r.remarks,
      },
      party: {
        name: party.name,
        contact: party.contact,
        mobile: party.mobile,
        email: party.email,
        address: party.address,
        city: party.city,
        state: party.state,
        pin: party.pin,
        gst: party.gst,
      },
      items: r.items.map((i) => ({
        lineNo: i.lineNo,
        productName: i.productName,
        board: i.board,
        thickness: i.thickness,
        size: i.size,
        qty: i.qtyRaw,
      })),
      approvedBy: r.approvedAt ? { name: r.approvedByName, at: r.approvedAt } : null,
      signatures: [
        { label: 'Requested By', role: 'Marketing', name: r.requestedByName },
        { label: 'Approved By', role: 'Manager', name: r.approvedByName },
        { label: 'Dispatched By', role: 'Dispatch Dept', name: null },
      ],
      printedAt: isoNow(this.clock),
    };
    await this.log(actor, { action: 'Print', entityType: 'request', entityId: r.id, details: `Printed request slip ${r.reqNo}` });
    return slip;
  }

  /** WhatsApp message text. The client opens https://wa.me/[phone]?text=<encoded text>. */
  async whatsapp(actor: Actor, dispatchId: string): Promise<WhatsAppShare> {
    const d = await this.dispatches.get(dispatchId);
    const party = await this.data.repos.parties.getById(d.partyId);
    const mobile = party?.mobile ? normalizeIndianMobile(party.mobile) : null;
    const share = { text: whatsappText(d, await this.company()), phone: mobile ? `91${mobile}` : null };
    await this.log(actor, { action: 'Share', entityType: 'dispatch', entityId: d.id, details: `Prepared WhatsApp update for ${d.dspNo}` });
    return share;
  }

  /** The QR text only. The image is drawn in the browser, so no shipment data goes to an outside QR service. */
  async qr(actor: Actor, dispatchId: string): Promise<QrPayload> {
    const d = await this.dispatches.get(dispatchId);
    await this.log(actor, { action: 'Print', entityType: 'dispatch', entityId: d.id, details: `Generated QR code for ${d.dspNo}` });
    return { payload: qrPayload(d) };
  }

  private log(actor: Actor, input: ActivityInput) {
    return this.data.uow.run((tx) => this.activity.record(tx, actor, input));
  }
}
