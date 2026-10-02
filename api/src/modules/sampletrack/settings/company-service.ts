import type { CompanyBlock, CompanySettings } from '../../../contracts/sampletrack';
import { isoNow, type Clock } from '../../../lib/clock';
import type { DataLayer } from '../../../repos';
import { DEFAULT_SETTINGS } from '../../../seed/settings';
import type { ActivityService } from '../activity-service';
import type { Actor } from '../actor';

/** st_settings keys behind each company field. */
export const COMPANY_KEYS: Record<keyof CompanySettings, string> = {
  name: 'company.name',
  llpin: 'company.llpin',
  city: 'company.address_line',
  phone: 'company.phone',
  gst: 'company.gst',
};

const LABELS: Record<keyof CompanySettings, string> = { name: 'name', llpin: 'LLPIN', city: 'city', phone: 'phone', gst: 'GST' };

/** Company details in st_settings. The single source for labels, slips, report prints and WhatsApp messages. */
export class CompanyService {
  constructor(
    private readonly data: DataLayer,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  async get(): Promise<CompanySettings> {
    const stored = await this.data.repos.settings.getMany(Object.values(COMPANY_KEYS));
    const text = (field: keyof CompanySettings) => {
      const key = COMPANY_KEYS[field];
      const v = key in stored ? stored[key] : DEFAULT_SETTINGS[key];
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    };
    return {
      name: text('name') ?? String(DEFAULT_SETTINGS['company.name']),
      llpin: text('llpin'),
      city: text('city'),
      phone: text('phone'),
      gst: text('gst'),
    };
  }

  /** What prints use. */
  async block(): Promise<CompanyBlock> {
    const c = await this.get();
    return { name: c.name, city: c.city ?? '', phone: c.phone, llpin: c.llpin, gst: c.gst };
  }

  /** Saves the changed fields in one transaction and logs them. A blank value clears the field (except name). */
  async update(actor: Actor, input: Partial<CompanySettings>): Promise<CompanySettings> {
    const before = await this.get();
    const changed = (Object.keys(COMPANY_KEYS) as (keyof CompanySettings)[]).filter(
      (f) => input[f] !== undefined && (input[f] ?? null) !== before[f],
    );
    if (!changed.length) return before;
    const at = isoNow(this.clock);
    await this.data.uow.run(async (tx) => {
      for (const f of changed) await tx.settings.set(COMPANY_KEYS[f], input[f] ?? '', actor.id, at);
      await this.activity.record(tx, actor, {
        action: 'Edit',
        entityType: 'settings',
        entityId: 'company',
        details: `Updated company settings: ${changed.map((f) => LABELS[f]).join(', ')}`,
      });
    });
    return this.get();
  }
}
