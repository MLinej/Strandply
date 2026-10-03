import { DEPARTMENTS, FAMILIES, GRADES, RECLASS_SCENARIOS, SHIFTS, SIZES, STAGES, type SkuGroup, type StockMeta } from '../../contracts/stock';
import { isoNow, type Clock } from '../../lib/clock';
import { newId } from '../../lib/crypto';
import { businessToday } from '../../lib/dates';
import { conflict, HttpError, notFound } from '../../lib/errors';
import { UniqueViolationError, type DataLayer, type SkuGroupPatch } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { CompanyService } from '../sampletrack/settings/company-service';
import type { Actor } from '../sampletrack/actor';
import { changedKeys } from '../sampletrack/masters/common';
import { allLegs } from './common';
import type { GroupCreate, GroupUpdate } from './validation';

const prefixTaken = (prefix: string) => conflict('prefix_taken', `${prefix} is already in the item master`);

/** The item (SKU group) master and the lists the forms need (legacy renderItemMaster). */
export class StockMasterService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly company: CompanyService,
    private readonly clock: Clock,
  ) {}

  async meta(): Promise<StockMeta> {
    return {
      families: FAMILIES,
      departments: DEPARTMENTS,
      stages: STAGES,
      sizes: SIZES,
      grades: GRADES,
      shifts: SHIFTS,
      scenarios: RECLASS_SCENARIOS,
      groups: await this.data.repos.skuGroups.listAll(),
      today: businessToday(this.clock),
      company: await this.company.block(),
    };
  }

  async create(actor: Actor, input: GroupCreate): Promise<SkuGroup> {
    try {
      return await this.data.uow.run(async (tx) => {
        const all = await tx.skuGroups.listAll();
        const at = isoNow(this.clock);
        const g = await tx.skuGroups.create({
          id: newId(),
          ...input,
          size: input.size ?? null,
          grade: input.grade ?? null,
          sortOrder: Math.max(0, ...all.map((x) => x.sortOrder)) + 1,
          createdBy: actor.id,
          createdAt: at,
          updatedAt: at,
        });
        await this.activity.record(tx, actor, { action: 'Create', entityType: 'stock_item', entityId: g.id, details: `Added ${g.prefix} ${g.label} to the item master` });
        return g;
      });
    } catch (err) {
      if (err instanceof UniqueViolationError) throw prefixTaken(input.prefix);
      throw err;
    }
  }

  /**
   * The prefix can't change once stock has moved under it (the codes in the ledgers would no longer
   * match), and a thickness can't be dropped while it has movements.
   */
  async update(actor: Actor, id: string, input: GroupUpdate): Promise<SkuGroup> {
    try {
      return await this.data.uow.run(async (tx) => {
        const before = await tx.skuGroups.getById(id);
        if (!before) throw notFound('Item');
        const legs = (await allLegs(tx)).filter((l) => l.groupId === id);
        if (input.prefix && input.prefix !== before.prefix && legs.length) throw conflict('in_use', `${before.prefix} has stock movements, so its prefix can’t change`);
        if (input.thicknesses) {
          const dropped = before.thicknesses.filter((t) => !input.thicknesses!.includes(t) && legs.some((l) => l.thick === t));
          if (dropped.length) throw conflict('in_use', `${dropped.map((t) => `${t} mm`).join(', ')} of ${before.prefix} ${dropped.length === 1 ? 'has' : 'have'} stock movements and can’t be removed`);
          if ((before.thicknesses.length === 0) !== (input.thicknesses.length === 0) && legs.length) {
            throw conflict('in_use', `${before.prefix} has stock movements, so it can’t switch between a fixed code and thicknesses`);
          }
        }
        const changed = changedKeys(before, input).filter((k) => k !== 'thicknesses' || input.thicknesses!.join() !== before.thicknesses.join());
        if (!changed.length) return before;
        const patch: SkuGroupPatch = { ...Object.fromEntries(changed.map((k) => [k, (input as Record<string, unknown>)[k]])), updatedAt: isoNow(this.clock) };
        const updated = (await tx.skuGroups.update(id, patch))!;
        await this.activity.record(tx, actor, { action: 'Edit', entityType: 'stock_item', entityId: id, details: `Updated ${updated.prefix}: ${changed.join(', ')}` });
        return updated;
      });
    } catch (err) {
      if (err instanceof UniqueViolationError) throw prefixTaken(input.prefix ?? '');
      throw err;
    }
  }

  /** Blocked while any movement uses the item (legacy blocked only on a non-zero balance). */
  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const g = await tx.skuGroups.getById(id);
      if (!g) throw notFound('Item');
      const used = (await allLegs(tx)).filter((l) => l.groupId === id).length;
      if (used) throw new HttpError(409, 'in_use', `${g.prefix} has ${used} stock movement${used === 1 ? '' : 's'} and can’t be deleted`);
      await tx.skuGroups.softDelete(id, isoNow(this.clock));
      await this.activity.record(tx, actor, { action: 'Delete', entityType: 'stock_item', entityId: id, details: `Removed ${g.prefix} ${g.label} from the item master` });
    });
  }
}
