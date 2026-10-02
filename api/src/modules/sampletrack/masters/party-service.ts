import type {
  AssigneeOption,
  DuplicatePartyDetails,
  Party,
  PartyFilters,
  PartyView,
} from '../../../contracts/sampletrack';
import { ROLE_LABELS, type Role } from '../../../domain/access';
import { HttpError, notFound, validationFailed } from '../../../lib/errors';
import { isoNow, type Clock } from '../../../lib/clock';
import { newId } from '../../../lib/crypto';
import { writeXlsx } from '../../../lib/spreadsheet';
import type { DataLayer, ListQuery, PartyPatch, Repos } from '../../../repos';
import type { ActivityService } from '../activity-service';
import type { Actor } from '../actor';
import { assertNotInUse, changedKeys, collectAll } from './common';
import type { PartyCreate, PartyUpdate } from './validation';

/** Roles a party can be assigned to. */
export const ASSIGNEE_ROLES: Role[] = ['marketing', 'admin', 'superadmin'];

export class PartyService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  private async withAssigneeNames(rows: Party[]): Promise<PartyView[]> {
    const ids = [...new Set(rows.map((r) => r.assignedUserId).filter((x): x is string => !!x))];
    const users = ids.length ? await this.data.repos.users.getByIds(ids) : [];
    const names = new Map(users.map((u) => [u.id, u.name]));
    return rows.map((r) => ({ ...r, assignedUserName: r.assignedUserId ? (names.get(r.assignedUserId) ?? null) : null }));
  }

  async list(query: ListQuery<PartyFilters>) {
    const { rows, total } = await this.data.repos.parties.list(query);
    return { rows: await this.withAssigneeNames(rows), total };
  }

  async get(id: string): Promise<PartyView> {
    const p = await this.data.repos.parties.getById(id);
    if (!p) throw notFound('Party');
    return (await this.withAssigneeNames([p]))[0]!;
  }

  async assignees(): Promise<AssigneeOption[]> {
    const users = await this.data.repos.users.listActiveByRoles(ASSIGNEE_ROLES);
    return users.map((u) => ({ id: u.id, name: u.name, role: ROLE_LABELS[u.role] }));
  }

  async create(actor: Actor, input: PartyCreate, { force = false } = {}): Promise<PartyView> {
    return this.data.uow.run(async (tx) => {
      const fields = await this.checkRefs(tx, input);
      if (!force) await this.assertNoDuplicate(tx, input.name);
      const at = isoNow(this.clock);
      const party = await tx.parties.create({
        id: newId(),
        name: input.name,
        contact: input.contact ?? null,
        mobile: input.mobile ?? null,
        email: input.email ?? null,
        gst: input.gst ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        state: fields.state ?? null,
        pin: input.pin ?? null,
        industry: input.industry ?? null,
        type: input.type,
        assignedUserId: input.assignedUserId ?? null,
        remarks: input.remarks ?? null,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await this.activity.record(tx, actor, {
        action: 'Create',
        entityType: 'party',
        entityId: party.id,
        details: `Created party ${party.name}${force ? ' (saved despite a similar name)' : ''}`,
      });
      return (await this.withAssigneeNames([party]))[0]!;
    });
  }

  async update(actor: Actor, id: string, input: PartyUpdate, { force = false } = {}): Promise<PartyView> {
    return this.data.uow.run(async (tx) => {
      const before = await tx.parties.getById(id);
      if (!before) throw notFound('Party');
      const fields = await this.checkRefs(tx, input);
      const patch: Partial<Party> = { ...input, ...(input.state !== undefined ? { state: fields.state } : {}) };
      const changed = changedKeys(before, patch);
      if (!changed.length) return (await this.withAssigneeNames([before]))[0]!;
      if (changed.includes('name') && !force) await this.assertNoDuplicate(tx, patch.name!, id);

      const updated = (await tx.parties.update(id, { ...pick(patch, changed), updatedAt: isoNow(this.clock) } as PartyPatch))!;
      await this.activity.record(tx, actor, {
        action: 'Edit',
        entityType: 'party',
        entityId: id,
        details: `Updated party ${updated.name}: ${changed.join(', ')}`,
      });
      return (await this.withAssigneeNames([updated]))[0]!;
    });
  }

  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const party = await tx.parties.getById(id);
      if (!party) throw notFound('Party');
      // TODO(d1): make this a guarded UPDATE … WHERE NOT EXISTS (live request/dispatch) in the same batch.
      assertNotInUse('Party', party.name, await tx.usage.party(id));
      await tx.parties.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, {
        action: 'Delete',
        entityType: 'party',
        entityId: id,
        details: `Deleted party ${party.name}`,
      });
    });
  }

  async exportXlsx(actor: Actor, query: ListQuery<PartyFilters>): Promise<Uint8Array> {
    const rows = await this.withAssigneeNames(await collectAll((q) => this.data.repos.parties.list(q), query));
    const bytes = writeXlsx([
      {
        name: 'Parties',
        rows,
        columns: [
          { header: 'Party Name', value: (p: PartyView) => p.name },
          { header: 'Contact Person', value: (p: PartyView) => p.contact },
          { header: 'Mobile', value: (p: PartyView) => p.mobile },
          { header: 'Email', value: (p: PartyView) => p.email },
          { header: 'GST Number', value: (p: PartyView) => p.gst },
          { header: 'Full Address', value: (p: PartyView) => p.address },
          { header: 'City', value: (p: PartyView) => p.city },
          { header: 'State', value: (p: PartyView) => p.state },
          { header: 'Pincode', value: (p: PartyView) => p.pin },
          { header: 'Industry', value: (p: PartyView) => p.industry },
          { header: 'Type', value: (p: PartyView) => p.type },
          { header: 'Assigned To', value: (p: PartyView) => p.assignedUserName },
          { header: 'Remarks', value: (p: PartyView) => p.remarks },
          { header: 'Created At (UTC)', value: (p: PartyView) => p.createdAt },
          { header: 'Updated At (UTC)', value: (p: PartyView) => p.updatedAt },
        ],
      },
    ]);
    await this.data.uow.run((tx) =>
      this.activity.record(tx, actor, { action: 'Export', entityType: 'party', details: `Exported ${rows.length} parties` }),
    );
    return bytes;
  }

  /** The state must be a known state (stored under its canonical name). The assignee must be eligible. */
  private async checkRefs(tx: Repos, input: { state?: string | null; assignedUserId?: string | null }) {
    let state = input.state;
    if (state) {
      const s = await tx.states.getByName(state);
      if (!s) throw validationFailed('Invalid input', [{ path: 'state', message: `Unknown state "${state}"` }]);
      state = s.name;
    }
    if (input.assignedUserId) {
      const u = await tx.users.getById(input.assignedUserId);
      if (!u || u.status !== 'Active' || !ASSIGNEE_ROLES.includes(u.role)) {
        throw validationFailed('Invalid input', [
          { path: 'assignedUserId', message: 'Assign to an active marketing, admin or super admin user' },
        ]);
      }
    }
    return { state };
  }

  private async assertNoDuplicate(tx: Repos, name: string, excludeId?: string) {
    const similar = await tx.parties.findByName(name, excludeId);
    if (!similar.length) return;
    const details: DuplicatePartyDetails = {
      similar: similar.map(({ id, name, city, state, mobile, gst }) => ({ id, name, city, state, mobile, gst })),
    };
    throw new HttpError(409, 'possible_duplicate', `A party named "${similar[0]!.name}" already exists. Save anyway with force=true.`, details);
  }
}

function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((k) => [k, obj[k]])) as Pick<T, K>;
}
