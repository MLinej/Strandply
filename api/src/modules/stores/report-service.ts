import { fyOf } from '../../contracts/purchase';
import {
  QUALITY_STATUSES,
  STORE_MATERIALS,
  STORE_UNITS,
  storeMaterialLabel,
  type AccountingReport,
  type GrnFilters,
  type PendingReport,
  type PendingReportRow,
  type StoreMaterial,
  type StoresDashboard,
  type StoresMeta,
  type StoresSettings,
} from '../../contracts/stores';
import { isoNow, type Clock } from '../../lib/clock';
import { businessToday } from '../../lib/dates';
import { writeXlsx } from '../../lib/spreadsheet';
import { normName } from '../../lib/text';
import type { DataLayer, ListQuery } from '../../repos';
import type { ActivityService } from '../sampletrack/activity-service';
import type { Actor } from '../sampletrack/actor';
import { collectAll } from '../sampletrack/masters/common';
import { businessTime, daysSince, fyOptions, peekDocNo, readSettings, SETTING_KEYS } from './common';
import type { GrnService } from './grn-service';
import type { MrnService } from './mrn-service';

export interface PendingFilters {
  vendor?: string;
  material?: StoreMaterial;
  minDays?: number;
}

/** Stores dashboard, the two reports, settings and form meta. */
export class StoresReportService {
  constructor(
    private readonly data: DataLayer,
    private readonly mrns: MrnService,
    private readonly grns: GrnService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  async meta(): Promise<StoresMeta> {
    const today = businessToday(this.clock);
    const { repos } = this.data;
    return {
      materials: STORE_MATERIALS,
      units: STORE_UNITS,
      qualities: QUALITY_STATUSES,
      currentFy: fyOf(today),
      fys: fyOptions(this.clock),
      settings: await readSettings(repos),
      nextMrnNo: await peekDocNo(repos, 'MRN', today),
      nextGrnNo: await peekDocNo(repos, 'GRN', today),
      today,
      now: businessTime(this.clock),
    };
  }

  async updateSettings(actor: Actor, input: Partial<StoresSettings>): Promise<StoresSettings> {
    const before = await readSettings(this.data.repos);
    const changes = (Object.keys(SETTING_KEYS) as (keyof StoresSettings)[]).filter((k) => input[k] !== undefined && input[k] !== before[k]);
    if (!changes.length) return before;
    await this.data.uow.run(async (tx) => {
      const at = isoNow(this.clock);
      for (const k of changes) await tx.settings.set(SETTING_KEYS[k], input[k], actor.id, at);
      const label = { autoPunchMrn: 'MRN auto-punch', autoPunchGrn: 'GRN auto-punch' };
      await this.activity.record(tx, actor, { action: 'Edit', entityType: 'settings', details: `Stores settings: ${changes.map((k) => `${label[k]} ${input[k] ? 'on' : 'off'}`).join(', ')}` });
    });
    return readSettings(this.data.repos);
  }

  /** Legacy renderDashboard: today's gate and receiving counts, what is waiting, recent MRNs, ageing. */
  async dashboard(): Promise<StoresDashboard> {
    const today = businessToday(this.clock);
    const { mrns, grns } = this.data.repos;
    const [mrnToday, grnToday, pending, counts, recent] = await Promise.all([
      mrns.countByDate(today),
      grns.countByDate(today),
      mrns.listPending(),
      grns.countByStatus(),
      mrns.list({ sort: '-createdAt', pageSize: 8 }),
    ]);
    return {
      kpis: {
        mrnToday,
        pendingGrn: pending.length,
        grnToday,
        awaitingReview: counts.draft,
        awaitingApproval: counts.reviewed,
        pendingAccounting: counts.unaccounted,
      },
      recentMrns: await this.mrns.views(recent.rows),
      ageing: await this.mrns.views(pending.slice(0, 10)),
    };
  }

  /** MRN prepared but GRN pending, one row per MRN item, longest waiting first (legacy getReportPendingData). */
  async pending(f: PendingFilters = {}): Promise<PendingReport> {
    const vendor = f.vendor ? normName(f.vendor) : '';
    const rows: PendingReportRow[] = (await this.data.repos.mrns.listPending())
      .filter((m) => !vendor || normName(m.vendorName).includes(vendor))
      .flatMap((m) => {
        const daysPending = daysSince(m.date, this.clock);
        return m.items.map((it) => ({
          mrnId: m.id,
          mrnNo: m.mrnNo,
          date: m.date,
          time: m.time,
          vendorName: m.vendorName,
          vehicleNo: m.vehicleNo,
          securityName: m.securityName,
          material: it.material,
          approxQty: it.approxQty,
          unit: it.unit,
          daysPending,
        }));
      })
      .filter((r) => !f.material || r.material === f.material)
      .filter((r) => !f.minDays || r.daysPending >= f.minDays)
      .sort((a, b) => b.daysPending - a.daysPending || a.mrnNo.localeCompare(b.mrnNo));
    const total = rows.reduce((s, r) => s + r.daysPending, 0);
    return {
      rows,
      kpis: {
        items: rows.length,
        mrns: new Set(rows.map((r) => r.mrnId)).size,
        oldestDays: rows.length ? Math.max(...rows.map((r) => r.daysPending)) : 0,
        avgDays: rows.length ? Math.round((total / rows.length) * 10) / 10 : 0,
      },
    };
  }

  async exportPendingXlsx(actor: Actor, f: PendingFilters): Promise<Uint8Array> {
    const { rows } = await this.pending(f);
    const bytes = writeXlsx([
      {
        name: 'MRN Pending GRN',
        rows,
        columns: [
          { header: 'MRN No', value: (r: PendingReportRow) => r.mrnNo },
          { header: 'Gate Entry Date', value: (r: PendingReportRow) => r.date },
          { header: 'Time', value: (r: PendingReportRow) => r.time },
          { header: 'Vendor', value: (r: PendingReportRow) => r.vendorName },
          { header: 'Vehicle No', value: (r: PendingReportRow) => r.vehicleNo },
          { header: 'Material', value: (r: PendingReportRow) => storeMaterialLabel(r.material) },
          { header: 'Approx Qty', value: (r: PendingReportRow) => r.approxQty },
          { header: 'Unit', value: (r: PendingReportRow) => r.unit },
          { header: 'Security Guard', value: (r: PendingReportRow) => r.securityName },
          { header: 'Days Pending', value: (r: PendingReportRow) => r.daysPending },
        ],
      },
    ]);
    await this.data.uow.run((tx) => this.activity.record(tx, actor, { action: 'Export', entityType: 'stores_mrn', details: `Exported pending-GRN report (${rows.length} items)` }));
    return bytes;
  }

  /** Approved GRNs vs accounted (legacy renderReportAccounting). Filters narrow the rows, not the KPIs. */
  async accounting(query: ListQuery<GrnFilters> = {}): Promise<AccountingReport> {
    const { grns } = this.data.repos;
    const approved = await collectAll((q) => grns.list(q), { filters: { status: 'approved' as const, fy: query.filters?.fy } });
    const rows = await collectAll((q) => grns.list(q), { q: query.q, sort: '-approvedAt', filters: { ...query.filters, status: 'approved' as const } });
    const accounted = approved.filter((g) => g.accounted).length;
    const counts = await grns.countByStatus();
    return {
      rows: await this.grns.views(rows),
      kpis: {
        accounted,
        pending: approved.length - accounted,
        pct: approved.length ? Math.round((accounted / approved.length) * 100) : 0,
        awaitingApproval: counts.draft + counts.reviewed,
      },
    };
  }
}
