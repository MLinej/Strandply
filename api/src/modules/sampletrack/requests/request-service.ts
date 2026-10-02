import type {
  DispatchDraft,
  RequestCounts,
  RequestFilters,
  RequestListResult,
  RequestView,
  SampleRequest,
  SampleRequestItem,
} from '../../../contracts/sampletrack';
import { conflict, notFound, validationFailed } from '../../../lib/errors';
import { isoNow, type Clock } from '../../../lib/clock';
import { newId } from '../../../lib/crypto';
import { businessToday } from '../../../lib/dates';
import { writeXlsx, type Column } from '../../../lib/spreadsheet';
import type { DataLayer, ListQuery, NewRow, Repos, RequestPatch } from '../../../repos';
import type { ActivityService } from '../activity-service';
import type { Actor } from '../actor';
import { changedKeys, collectAll } from '../masters/common';
import { ASSIGNEE_ROLES } from '../masters/party-service';
import type { NotificationService } from '../notification-service';
import { parseQty } from './qty';
import type { RequestCreate, RequestLine, RequestUpdateInput } from './validation';

export const REQ_COUNTER = 'REQ';
export const formatReqNo = (n: number) => `REQ-${String(n).padStart(4, '0')}`;

/** "OSB 18mm Premium 5 sheets, S-OSB 15mm 2 sheets", the legacy reqToDispatch format. */
export const productSummary = (items: SampleRequestItem[], sep = ', ') =>
  items.map((i) => [i.productName, i.qtyRaw].filter(Boolean).join(' ')).join(sep);

const EXPORT_COLUMNS: Column<RequestView>[] = [
  { header: 'Request ID', value: (r) => r.reqNo },
  { header: 'Date', value: (r) => r.date },
  { header: 'Party', value: (r) => r.partyName },
  { header: 'Products', value: (r) => productSummary(r.items, '; ') },
  { header: 'Purpose', value: (r) => r.purpose },
  { header: 'Priority', value: (r) => r.priority },
  { header: 'Required Date', value: (r) => r.requiredDispatchDate },
  { header: 'Requested By', value: (r) => r.requestedByName },
  { header: 'Status', value: (r) => r.status },
  { header: 'Remarks', value: (r) => r.remarks },
];

export class RequestService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationService,
    private readonly clock: Clock,
  ) {}

  async list(query: ListQuery<RequestFilters>): Promise<RequestListResult> {
    const { status: _tab, ...filters } = query.filters ?? {};
    const [page, byStatus] = await Promise.all([
      this.data.repos.requests.list(query),
      this.data.repos.requests.countByStatus({ q: query.q, filters }),
    ]);
    const counts: RequestCounts = { all: Object.values(byStatus).reduce((a, b) => a + b, 0), ...byStatus };
    return { ...page, counts };
  }

  /** For the sidebar badge: every Pending request, ignoring any filter. */
  async pendingCount(): Promise<{ count: number }> {
    return { count: (await this.data.repos.requests.countByStatus({})).Pending };
  }

  async get(id: string): Promise<RequestView> {
    const r = await this.data.repos.requests.getView(id);
    if (!r) throw notFound('Request');
    return r;
  }

  async create(actor: Actor, input: RequestCreate): Promise<RequestView> {
    const date = input.date ?? businessToday(this.clock);
    assertDateOrder(date, input.requiredDispatchDate ?? null);

    return this.data.uow.run(async (tx) => {
      const party = await this.requireParty(tx, input.partyId);
      // Defaults to whoever raises the request. A named requester must be marketing/admin/superadmin.
      if (input.requestedByUserId) await this.requireRequester(tx, input.requestedByUserId);
      const requestedByUserId = input.requestedByUserId ?? actor.id;
      const at = isoNow(this.clock);
      const id = newId();
      const items = await this.buildItems(tx, id, input.items, actor, at);

      // The number comes from the same unit of work as the insert. A failed insert rolls the counter back too.
      const reqNo = formatReqNo(await tx.counters.next(REQ_COUNTER, at));
      const view = await tx.requests.create(
        {
          id,
          reqNo,
          date,
          partyId: party.id,
          purpose: input.purpose ?? null,
          priority: input.priority,
          requiredDispatchDate: input.requiredDispatchDate ?? null,
          requestedByUserId,
          remarks: input.remarks ?? null,
          status: 'Pending',
          approvedBy: null,
          approvedAt: null,
          createdBy: actor.id,
          createdAt: at,
          updatedAt: at,
        },
        items,
      );
      await this.notifications.notify(tx, actor, {
        type: 'info',
        title: 'New Request',
        message: `${reqNo} raised for ${party.name}${view.requestedByName ? ` by ${view.requestedByName}` : ''}`,
        entityType: 'request',
        entityId: id,
      });
      await this.activity.record(tx, actor, {
        action: 'Create',
        entityType: 'request',
        entityId: id,
        details: `Sample request ${reqNo} for ${party.name} (${items.length} product line${items.length === 1 ? '' : 's'})`,
      });
      return view;
    });
  }

  /** Changes fields and/or replaces the lines. Status, createdBy and createdAt never change here. */
  async update(actor: Actor, id: string, input: RequestUpdateInput): Promise<RequestView> {
    return this.data.uow.run(async (tx) => {
      const before = await tx.requests.getById(id);
      if (!before) throw notFound('Request');

      const { items: lineInput, ...fields } = input;
      const changed = changedKeys(before, fields as Partial<SampleRequest>);
      if (changed.includes('partyId')) {
        await this.requireParty(tx, fields.partyId!);
        if ((await tx.usage.requestDispatches(id)) > 0) {
          throw conflict('party_locked', 'The party cannot change: a dispatch is already linked to this request');
        }
      }
      if (changed.includes('requestedByUserId') && fields.requestedByUserId) {
        await this.requireRequester(tx, fields.requestedByUserId);
      }
      assertDateOrder(fields.date ?? before.date, fields.requiredDispatchDate !== undefined ? fields.requiredDispatchDate : before.requiredDispatchDate);

      const at = isoNow(this.clock);
      const logged: string[] = [...changed];
      if (lineInput !== undefined) {
        const items = await this.buildItems(tx, id, lineInput, actor, at);
        const current = (await tx.requests.getView(id))!.items;
        if (lineKey(items) !== lineKey(current)) {
          await tx.requests.replaceItems(id, items, at);
          logged.push('items');
        }
      }
      if (!logged.length) return (await tx.requests.getView(id))!;
      const patch = Object.fromEntries(changed.map((k) => [k, (fields as Record<string, unknown>)[k]]));
      await tx.requests.update(id, { ...patch, updatedAt: at } as RequestPatch);

      const view = (await tx.requests.getView(id))!;
      await this.activity.record(tx, actor, {
        action: 'Edit',
        entityType: 'request',
        entityId: id,
        details: `Sample request ${view.reqNo} for ${view.partyName}: ${logged.join(', ')}`,
      });
      return view;
    });
  }

  /** Pending → Approved only. A guarded transition, so a double click or a race can't approve twice. */
  async approve(actor: Actor, id: string): Promise<RequestView> {
    return this.data.uow.run(async (tx) => {
      const before = await tx.requests.getView(id);
      if (!before) throw notFound('Request');
      const at = isoNow(this.clock);
      if (!(await tx.requests.approve(id, actor.id, at))) {
        throw conflict('invalid_status', `${before.reqNo} is ${before.status}; only Pending requests can be approved`);
      }
      await this.notifications.notify(tx, actor, {
        type: 'success',
        title: 'Approved',
        message: `${before.reqNo} for ${before.partyName} approved by ${actor.name}`,
        entityType: 'request',
        entityId: id,
      });
      await this.activity.record(tx, actor, {
        action: 'Approve',
        entityType: 'request',
        entityId: id,
        details: `Approved sample request ${before.reqNo} for ${before.partyName}`,
      });
      return (await tx.requests.getView(id))!;
    });
  }

  /** Soft delete. Blocked while a live dispatch is linked. The REQ number is never reused. */
  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const r = await tx.requests.getView(id);
      if (!r) throw notFound('Request');
      const linked = await tx.usage.requestDispatches(id);
      if (linked > 0) {
        throw conflict('has_dispatch', `${r.reqNo} has ${linked} linked dispatch${linked === 1 ? '' : 'es'} and cannot be deleted`);
      }
      await tx.requests.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, {
        action: 'Delete',
        entityType: 'request',
        entityId: id,
        details: `Deleted sample request ${r.reqNo} for ${r.partyName}`,
      });
    });
  }

  /** "Create dispatch from request": a prefilled dispatch form payload. Writes nothing. */
  async dispatchDraft(id: string): Promise<DispatchDraft> {
    const r = await this.get(id);
    return {
      partyId: r.partyId,
      partyName: r.partyName,
      productDescription: productSummary(r.items),
      linkedRequestId: r.id,
      linkedRequestNo: r.reqNo,
      requestStatus: r.status,
    };
  }

  async exportXlsx(actor: Actor, query: ListQuery<RequestFilters>): Promise<Uint8Array> {
    const rows = await collectAll((q) => this.data.repos.requests.list(q), query);
    const bytes = writeXlsx([{ name: 'SampleRequests', columns: EXPORT_COLUMNS, rows }]);
    await this.data.uow.run((tx) =>
      this.activity.record(tx, actor, { action: 'Export', entityType: 'request', details: `Exported ${rows.length} sample requests` }),
    );
    return bytes;
  }

  private async requireParty(tx: Repos, partyId: string) {
    const party = await tx.parties.getById(partyId);
    if (!party) throw validationFailed('Invalid input', [{ path: 'partyId', message: 'Select an existing party' }]);
    return party;
  }

  /** A named requester must be an active marketing/admin/superadmin user (the "marketing person" picker). */
  private async requireRequester(tx: Repos, userId: string) {
    const u = await tx.users.getById(userId);
    if (!u || u.status !== 'Active' || !ASSIGNEE_ROLES.includes(u.role)) {
      throw validationFailed('Invalid input', [
        { path: 'requestedByUserId', message: 'Requested by must be an active marketing, admin or super admin user' },
      ]);
    }
  }

  /**
   * Turns form lines into rows. Entirely blank lines are dropped. With a productId, blank
   * name/board/thickness/size come from the product master. Every remaining line needs a name,
   * and at least one line must remain.
   */
  private async buildItems(
    tx: Repos,
    requestId: string,
    lines: RequestLine[],
    actor: Actor,
    at: string,
  ): Promise<NewRow<SampleRequestItem>[]> {
    const issues: { path: string; message: string }[] = [];
    const out: NewRow<SampleRequestItem>[] = [];

    for (const [i, l] of lines.entries()) {
      if (!l.productId && !l.productName && !l.board && !l.thickness && !l.size && !l.qty) continue;
      let { productName, board, thickness, size } = l;
      if (l.productId) {
        const p = await tx.products.getById(l.productId);
        if (!p) {
          issues.push({ path: `items.${i}.productId`, message: 'Product not found in the master' });
          continue;
        }
        productName ??= p.name;
        board ??= p.boardType;
        thickness ??= p.thicknessMm !== null ? `${p.thicknessMm}mm` : null;
        size ??= p.size;
      }
      if (!productName) {
        issues.push({ path: `items.${i}.productName`, message: 'Pick a product or type its name' });
        continue;
      }
      out.push({
        id: newId(),
        requestId,
        lineNo: out.length + 1,
        productId: l.productId ?? null,
        productName,
        board: board ?? null,
        thickness: thickness ?? null,
        size: size ?? null,
        ...parseQty(l.qty),
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
    }
    if (!issues.length && !out.length) issues.push({ path: 'items', message: 'Add at least one product' });
    if (issues.length) throw validationFailed('Invalid input', issues);
    return out;
  }
}

/** What makes two sets of lines "the same" for change detection. */
const lineKey = (items: Pick<SampleRequestItem, 'productId' | 'productName' | 'board' | 'thickness' | 'size' | 'qtyRaw'>[]) =>
  JSON.stringify(items.map((i) => [i.productId, i.productName, i.board, i.thickness, i.size, i.qtyRaw]));

function assertDateOrder(date: string, required: string | null) {
  if (required && required < date) {
    throw validationFailed('Invalid input', [
      { path: 'requiredDispatchDate', message: 'Required dispatch date cannot be before the request date' },
    ]);
  }
}
