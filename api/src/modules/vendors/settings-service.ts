import type { CompanyBlock } from '../../contracts/sampletrack';
import type { VendorEmailSettings, VendorFilters, VendorView } from '../../contracts/vendors';
import { isoNow, type Clock } from '../../lib/clock';
import type { DataLayer, ListQuery } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import type { CompanyService } from '../sampletrack/settings/company-service';
import { collectAll } from '../sampletrack/masters/common';
import type { VendorService } from './vendor-service';

const KEYS = { fromName: 'vendors.email.from_name', replyTo: 'vendors.email.reply_to' } as const;

export interface VendorPrintPayload {
  company: CompanyBlock;
  generatedAt: string;
  vendors: VendorView[];
}

/** Vendor e-mail sender settings and the vendor directory print (legacy downloadVendorPDF). */
export class VendorSettingsService {
  constructor(
    private readonly data: DataLayer,
    private readonly vendors: VendorService,
    private readonly company: CompanyService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  async email(): Promise<VendorEmailSettings> {
    const v = await this.data.repos.settings.getMany(Object.values(KEYS));
    const str = (x: unknown) => (typeof x === 'string' ? x : '');
    return { fromName: str(v[KEYS.fromName]) || 'Strandply LLP', replyTo: str(v[KEYS.replyTo]) || null };
  }

  async updateEmail(actor: Actor, input: Partial<VendorEmailSettings>): Promise<VendorEmailSettings> {
    const before = await this.email();
    const changes = (Object.keys(KEYS) as (keyof VendorEmailSettings)[]).filter((k) => input[k] !== undefined && (input[k] ?? null) !== before[k]);
    if (!changes.length) return before;
    await this.data.uow.run(async (tx) => {
      const at = isoNow(this.clock);
      for (const k of changes) await tx.settings.set(KEYS[k], input[k] ?? '', actor.id, at);
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'settings', details: `Updated vendor e-mail settings: ${changes.join(', ')}` });
    });
    return this.email();
  }

  /** One vendor (`id`) or every vendor matching the list filters, with the company header. Logs a Print entry. */
  async print(actor: Actor, opts: { id?: string; query?: ListQuery<VendorFilters> }): Promise<VendorPrintPayload> {
    const rows = opts.id
      ? [await this.vendors.get(opts.id)]
      : await this.vendors.getMany((await collectAll((q) => this.data.repos.vendors.list(q), opts.query ?? {})).map((v) => v.id));
    const company = await this.company.block();
    await this.data.uow.run((tx) =>
      this.activity.record(tx, actor, {
        action: 'Print',
        entityType: 'vendor',
        entityId: opts.id,
        details: opts.id ? `Printed vendor card ${rows[0]!.code} ${rows[0]!.name}` : `Printed vendor directory (${rows.length} vendors)`,
      }),
    );
    return { company, generatedAt: isoNow(this.clock), vendors: rows };
  }
}
