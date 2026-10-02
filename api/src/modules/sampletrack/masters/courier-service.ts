import type { Courier, CourierFilters, CourierOption, CourierType, DispatchMode } from '../../../contracts/sampletrack';
import { notFound } from '../../../lib/errors';
import { isoNow, type Clock } from '../../../lib/clock';
import { newId } from '../../../lib/crypto';
import type { CourierPatch, DataLayer, ListQuery } from '../../../repos';
import type { ActivityService } from '../activity-service';
import type { Actor } from '../actor';
import { assertNotInUse, changedKeys } from './common';
import type { CourierCreate, CourierUpdate } from './validation';

export class CourierService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  list(query: ListQuery<CourierFilters>) {
    return this.data.repos.couriers.list(query);
  }

  async get(id: string): Promise<Courier> {
    const c = await this.data.repos.couriers.getById(id);
    if (!c) throw notFound('Courier');
    return c;
  }

  /**
   * The dispatch form's courier dropdown: active couriers whose type equals the mode.
   * For Hand Delivery (no courier type) every active courier is listed, as in the legacy app.
   */
  async optionsForMode(mode: DispatchMode): Promise<CourierOption[]> {
    const type: CourierType | undefined = mode === 'Hand Delivery' ? undefined : mode;
    const rows = await this.data.repos.couriers.listActive(type);
    return rows.map(({ id, name, type, trackingUrlTemplate }) => ({ id, name, type, trackingUrlTemplate }));
  }

  async create(actor: Actor, input: CourierCreate): Promise<Courier> {
    const at = isoNow(this.clock);
    return this.data.uow.run(async (tx) => {
      const courier = await tx.couriers.create({
        id: newId(),
        name: input.name,
        type: input.type,
        contact: input.contact ?? null,
        mobile: input.mobile ?? null,
        email: input.email ?? null,
        coverage: input.coverage ?? null,
        trackingUrlTemplate: input.trackingUrlTemplate ?? null,
        rating: input.rating ?? null,
        status: input.status,
        remarks: input.remarks ?? null,
        createdBy: actor.id,
        createdAt: at,
        updatedAt: at,
      });
      await this.activity.record(tx, actor, {
        action: 'Create',
        entityType: 'courier',
        entityId: courier.id,
        details: `Created courier ${courier.name} (${courier.type})`,
      });
      return courier;
    });
  }

  async update(actor: Actor, id: string, input: CourierUpdate): Promise<Courier> {
    return this.data.uow.run(async (tx) => {
      const before = await tx.couriers.getById(id);
      if (!before) throw notFound('Courier');
      const changed = changedKeys(before, input as Partial<Courier>);
      if (!changed.length) return before;
      const patch = Object.fromEntries(changed.map((k) => [k, (input as Record<string, unknown>)[k]]));
      const updated = (await tx.couriers.update(id, { ...patch, updatedAt: isoNow(this.clock) } as CourierPatch))!;
      await this.activity.record(tx, actor, {
        action: 'Edit',
        entityType: 'courier',
        entityId: id,
        details: `Updated courier ${updated.name}: ${changed.join(', ')}`,
      });
      return updated;
    });
  }

  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const courier = await tx.couriers.getById(id);
      if (!courier) throw notFound('Courier');
      // TODO(d1): guarded soft delete (… WHERE NOT EXISTS live dispatch) in the same batch.
      assertNotInUse('Courier', courier.name, await tx.usage.courier(id));
      await tx.couriers.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, {
        action: 'Delete',
        entityType: 'courier',
        entityId: id,
        details: `Deleted courier ${courier.name}`,
      });
    });
  }
}
