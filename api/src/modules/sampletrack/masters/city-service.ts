import type { City, CityFilters, CityOption, CityView, State } from '../../../contracts/sampletrack';
import { conflict, notFound, validationFailed } from '../../../lib/errors';
import { isoNow, type Clock } from '../../../lib/clock';
import { newId } from '../../../lib/crypto';
import { writeXlsx } from '../../../lib/spreadsheet';
import { UniqueViolationError, type DataLayer, type ListQuery } from '../../../repos';
import { normName } from '../../../lib/text';
import type { ActivityService } from '../activity-service';
import type { Actor } from '../actor';
import { collectAll } from './common';

export class CityService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  states(): Promise<State[]> {
    return this.data.repos.states.listAll();
  }

  private async stateNames() {
    return new Map((await this.data.repos.states.listAll()).map((s) => [s.id, s.name]));
  }

  private view(c: City, names: Map<string, string>): CityView {
    return { id: c.id, city: c.city, stateId: c.stateId, stateName: names.get(c.stateId) ?? '', isCustom: c.isCustom };
  }

  /** City master (Settings): built-in and custom cities. */
  async list(query: ListQuery<CityFilters>) {
    const [{ rows, total }, names] = await Promise.all([this.data.repos.cities.list(query), this.stateNames()]);
    return { rows: rows.map((c) => this.view(c, names)), total };
  }

  /**
   * Party form city dropdown: built-in + custom cities + cities already used on parties,
   * one entry per (city, state), sorted by city. Choosing an entry fills in its state.
   */
  async options(): Promise<CityOption[]> {
    const [cities, names, used] = await Promise.all([
      this.data.repos.cities.listAll(),
      this.stateNames(),
      this.data.repos.parties.usedCities(),
    ]);
    const out = new Map<string, CityOption>();
    const add = (o: CityOption) => {
      const key = `${normName(o.city)}|${o.state ? normName(o.state) : ''}`;
      if (!out.has(key)) out.set(key, o);
    };
    for (const c of cities) add({ city: c.city, state: names.get(c.stateId) ?? null, source: c.isCustom ? 'custom' : 'builtin' });
    // A party city without a state adds nothing new when the master already lists that city.
    const masterCities = new Set(cities.map((c) => normName(c.city)));
    for (const u of used) {
      if (!u.state && masterCities.has(normName(u.city))) continue;
      add({ city: u.city, state: u.state, source: 'party' });
    }
    return [...out.values()].sort(
      (a, b) => a.city.localeCompare(b.city, 'en', { sensitivity: 'base' }) || (a.state ?? '').localeCompare(b.state ?? ''),
    );
  }

  async add(actor: Actor, input: { city: string; stateId: string }): Promise<CityView> {
    const state = await this.data.repos.states.getById(input.stateId);
    if (!state) throw validationFailed('Invalid input', [{ path: 'stateId', message: 'Unknown state' }]);
    const at = isoNow(this.clock);
    try {
      return await this.data.uow.run(async (tx) => {
        const city = await tx.cities.create({
          id: newId(),
          city: input.city.replace(/\s+/g, ' '),
          stateId: state.id,
          isCustom: true,
          createdBy: actor.id,
          createdAt: at,
          updatedAt: at,
        });
        await this.activity.record(tx, actor, {
          action: 'Create',
          entityType: 'city',
          entityId: city.id,
          details: `Added city ${city.city}, ${state.name}`,
        });
        return this.view(city, new Map([[state.id, state.name]]));
      });
    } catch (err) {
      if (err instanceof UniqueViolationError) throw conflict('city_exists', `${input.city}, ${state.name} is already in the city master`);
      throw err;
    }
  }

  /** Only custom cities can be removed. Parties keep their city text, so nothing is left dangling. */
  async remove(actor: Actor, id: string): Promise<void> {
    await this.data.uow.run(async (tx) => {
      const city = await tx.cities.getById(id);
      if (!city) throw notFound('City');
      if (!city.isCustom) throw conflict('builtin_city', 'Built-in cities cannot be removed');
      await tx.cities.softDelete(id, isoNow(this.clock));
      const state = await tx.states.getById(city.stateId);
      await this.activity.record(tx, actor, {
        action: 'Delete',
        entityType: 'city',
        entityId: id,
        details: `Removed city ${city.city}${state ? `, ${state.name}` : ''}`,
      });
    });
  }

  async exportXlsx(actor: Actor): Promise<Uint8Array> {
    const names = await this.stateNames();
    const rows = (await collectAll((q) => this.data.repos.cities.list(q), {})).map((c) => this.view(c, names));
    const bytes = writeXlsx([
      {
        name: 'City Master',
        rows,
        columns: [
          { header: 'City', value: (c: CityView) => c.city },
          { header: 'State', value: (c: CityView) => c.stateName },
          { header: 'Type', value: (c: CityView) => (c.isCustom ? 'Custom' : 'Built-in') },
        ],
      },
    ]);
    await this.data.uow.run((tx) =>
      this.activity.record(tx, actor, { action: 'Export', entityType: 'city', details: `Exported ${rows.length} cities` }),
    );
    return bytes;
  }
}
