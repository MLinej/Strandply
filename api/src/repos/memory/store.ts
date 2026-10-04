import type {
  City,
  Counter,
  Notification,
  NotificationRead,
  Courier,
  Dispatch,
  DispatchHistoryEntry,
  Party,
  Product,
  SampleRequest,
  SampleRequestItem,
  Setting,
  State,
} from '../../contracts/sampletrack';
import type { TncClause, Vendor, VendorCategory, VendorProduct } from '../../contracts/vendors';
import type { Grn, Mrn } from '../../contracts/stores';
import type { OpeningEntry, Reclass, SkuGroup, StockSlip } from '../../contracts/stock';
import type { Chipping, Cutting, HotPress, MattBatch, Mdo, Plan, ResinUse, Summary, WipAdjustment, WipBatch } from '../../contracts/production';
import type { Customer, FgStock, Intercompany, PriceEntry, Proforma, SalesInvoice, SalesItem, SalesOrder, WeightEntry } from '../../contracts/sales';
import type { Campaign, CrmCustomer, CrmProduct, CrmTask, Followup, Lead, Opportunity, OrderLost, OrderWon, Quotation, Salesperson } from '../../contracts/crm';
import type { FreightOrder, Inquiry, RateComparison, Transporter, VehicleType } from '../../contracts/transport';
import type { MtArea, WorkOrder } from '../../contracts/maintenance';
import type { OpeningStock, PurchaseDocument, PurchaseEntry, PurchaseOrder, PurchaseReturn, PurchaseType } from '../../contracts/purchase';
import type { ActivityEntry } from '../activity';
import type { RolePermissionsRow } from '../role-permissions';
import type { Session } from '../sessions';
import type { User } from '../users';

/** Plain-JSON form of the whole store. Seeds, dev.json snapshots and uow rollback all use it. */
export interface MemoryData {
  users: User[];
  sessions: Session[];
  rolePermissions: RolePermissionsRow[];
  activity: ActivityEntry[];
  states: State[];
  cities: City[];
  parties: Party[];
  couriers: Courier[];
  products: Product[];
  requests: SampleRequest[];
  requestItems: SampleRequestItem[];
  dispatches: Dispatch[];
  counters: Counter[];
  notifications: Notification[];
  dispatchHistory: DispatchHistoryEntry[];
  settings: Setting[];
  notificationReads: NotificationRead[];
  // Vendors module
  vnCategories: VendorCategory[];
  vnProducts: VendorProduct[];
  vendors: Vendor[];
  vnTnc: TncClause[];
  // Purchase module
  puTypes: PurchaseType[];
  puEntries: PurchaseEntry[];
  puOrders: PurchaseOrder[];
  puReturns: PurchaseReturn[];
  puOpening: OpeningStock[];
  puConsumption: { fy: string; key: string; qty: number; createdBy: string | null; createdAt: string; updatedAt: string; deletedAt: string | null }[];
  puDocuments: PurchaseDocument[];
  // Stores module
  stoMrns: Mrn[];
  stoGrns: Grn[];
  // Stock module
  skGroups: SkuGroup[];
  skSlips: StockSlip[];
  skOpening: OpeningEntry[];
  skReclass: Reclass[];
  // Production module
  prPlans: Plan[];
  prHotpress: HotPress[];
  prChipping: Chipping[];
  prResin: ResinUse[];
  prCutting: Cutting[];
  prSummary: Summary[];
  prMdo: Mdo[];
  prMatt: MattBatch[];
  prWip: WipBatch[];
  prWipAdj: WipAdjustment[];
  // Sales module
  slCustomers: Customer[];
  slItems: SalesItem[];
  slPrices: PriceEntry[];
  slWeights: WeightEntry[];
  slProformas: Proforma[];
  slOrders: SalesOrder[];
  slInvoices: SalesInvoice[];
  slFgStock: FgStock[];
  slIntercompany: Intercompany[];
  // CRM module
  crmLeads: Lead[];
  crmCustomers: CrmCustomer[];
  crmFollowups: Followup[];
  crmOpportunities: Opportunity[];
  crmQuotations: Quotation[];
  crmWon: OrderWon[];
  crmLost: OrderLost[];
  crmTasks: CrmTask[];
  crmCampaigns: Campaign[];
  crmProducts: CrmProduct[];
  crmSalespersons: Salesperson[];
  // Transport module
  trVehicles: VehicleType[];
  trTransporters: Transporter[];
  trInquiries: Inquiry[];
  trRateCmps: RateComparison[];
  trOrders: FreightOrder[];
  mtAreas: MtArea[];
  mtWorkOrders: WorkOrder[];
  /** Data upgrades already applied to this store (see seed/upgrades.ts). The memory twin of a migrations table. */
  upgrades: { name: string; appliedAt: string }[];
}

export type TableName = keyof MemoryData;
type Row<K extends TableName> = MemoryData[K][number];

/** The primary key of each table: a field name, or a function for composite keys. */
const KEYS: { [K in TableName]: (keyof Row<K> & string) | ((row: Row<K>) => string) } = {
  users: 'id',
  sessions: 'id',
  rolePermissions: 'role',
  activity: 'id',
  states: 'id',
  cities: 'id',
  parties: 'id',
  couriers: 'id',
  products: 'id',
  requests: 'id',
  requestItems: 'id',
  dispatches: 'id',
  counters: 'name',
  notifications: 'id',
  dispatchHistory: 'id',
  settings: 'key',
  notificationReads: (r) => readKey(r.notificationId, r.userId),
  vnCategories: 'id',
  vnProducts: 'id',
  vendors: 'id',
  vnTnc: 'id',
  puTypes: 'id',
  puEntries: 'id',
  puOrders: 'id',
  puReturns: 'id',
  puOpening: 'fy',
  puConsumption: (r) => `${r.fy}|${r.key}`,
  puDocuments: 'id',
  stoMrns: 'id',
  stoGrns: 'id',
  skGroups: 'id',
  skSlips: 'id',
  skOpening: 'id',
  skReclass: 'id',
  prPlans: 'id',
  prHotpress: 'id',
  prChipping: 'id',
  prResin: 'id',
  prCutting: 'id',
  prSummary: 'id',
  prMdo: 'id',
  prMatt: 'id',
  prWip: 'id',
  prWipAdj: 'id',
  slCustomers: 'id',
  slItems: 'id',
  slPrices: 'id',
  slWeights: 'id',
  slProformas: 'id',
  slOrders: 'id',
  slInvoices: 'id',
  slFgStock: 'id',
  slIntercompany: 'id',
  crmLeads: 'id',
  crmCustomers: 'id',
  crmFollowups: 'id',
  crmOpportunities: 'id',
  crmQuotations: 'id',
  crmWon: 'id',
  crmLost: 'id',
  crmTasks: 'id',
  crmCampaigns: 'id',
  crmProducts: 'id',
  crmSalespersons: 'id',
  trVehicles: 'id',
  trTransporters: 'id',
  trInquiries: 'id',
  trRateCmps: 'id',
  trOrders: 'id',
  mtAreas: 'id',
  mtWorkOrders: 'id',
  upgrades: 'name',
};

export const readKey = (notificationId: string, userId: string) => `${notificationId}\u0000${userId}`;

export const TABLE_NAMES = Object.keys(KEYS) as TableName[];

export const emptyMemoryData = (): MemoryData =>
  Object.fromEntries(TABLE_NAMES.map((t) => [t, []])) as unknown as MemoryData;

/** Fills in tables missing from `data` (e.g. an older dev.json snapshot) from `fallback`. */
export function withMissingTables(data: Partial<MemoryData>, fallback: MemoryData): MemoryData {
  return Object.fromEntries(TABLE_NAMES.map((t) => [t, data[t] ?? fallback[t]])) as unknown as MemoryData;
}

type Tables = { [K in TableName]: Map<string, Row<K>> };

/**
 * Holds every in-memory table. Repos mutate `tables`, then call `changed()`.
 * `onChange` receives the full dump, e.g. for the dev.json snapshot. It is held back
 * while a unit of work is open and fires once when the work commits.
 */
export class MemoryStore {
  tables!: Tables;
  private holdDepth = 0;
  private dirty = false;

  constructor(
    initial: MemoryData = emptyMemoryData(),
    private readonly onChange?: (data: MemoryData) => void,
  ) {
    this.load(initial);
  }

  dump(): MemoryData {
    return structuredClone(
      Object.fromEntries(TABLE_NAMES.map((t) => [t, [...this.tables[t].values()]])),
    ) as unknown as MemoryData;
  }

  load(data: MemoryData): void {
    const full = withMissingTables(data, emptyMemoryData());
    this.tables = Object.fromEntries(
      TABLE_NAMES.map((t) => {
        const key = KEYS[t] as string | ((row: unknown) => string);
        const rows = full[t] as unknown as Record<string, unknown>[];
        return [t, new Map(rows.map((r) => [typeof key === 'function' ? key(r) : String(r[key]), structuredClone(r)]))];
      }),
    ) as unknown as Tables;
  }

  changed(): void {
    if (this.holdDepth > 0) {
      this.dirty = true;
      return;
    }
    this.onChange?.(this.dump());
  }

  hold(): void {
    this.holdDepth++;
  }

  /** Ends a hold. When the last hold ends, fires onChange if anything changed and `commit` is true. */
  release(commit: boolean): void {
    this.holdDepth--;
    if (this.holdDepth === 0) {
      const fire = this.dirty && commit;
      this.dirty = false;
      if (fire) this.onChange?.(this.dump());
    }
  }
}
