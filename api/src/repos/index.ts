import type { ActivityRepo } from './activity';
import type { RolePermissionRepo } from './role-permissions';
import type { SessionRepo } from './sessions';
import type { CityRepo, CourierRepo, PartyRepo, ProductRepo, StateRepo, UsageRepo } from './masters';
import type { SettingsRepo } from './settings';
import type { UserRepo } from './users';
import type { TncRepo, VendorCategoryRepo, VendorProductRepo, VendorRepo } from './vendors';
import type { ConsumptionRepo, OpeningStockRepo, PurchaseDocumentRepo, PurchaseEntryRepo, PurchaseOrderRepo, PurchaseReturnRepo, PurchaseTypeRepo } from './purchase';
import type { GrnRepo, MrnRepo } from './stores';
import type { ChippingRepo, CuttingRepo, HotPressRepo, MattBatchRepo, MdoRepo, PlanRepo, ResinUseRepo, SummaryRepo, WipAdjustmentRepo, WipBatchRepo } from './production';
import type { ReclassRepo, SkuGroupRepo, StockOpeningRepo, StockSlipRepo } from './stock';
import type { CustomerRepo, FgStockRepo, IntercompanyRepo, PriceEntryRepo, ProformaRepo, SalesInvoiceRepo, SalesItemRepo, SalesOrderRepo, WeightEntryRepo } from './sales';
import type { CampaignRepo, CrmCustomerRepo, CrmProductRepo, CrmTaskRepo, FollowupRepo, LeadRepo, OpportunityRepo, OrderLostRepo, OrderWonRepo, QuotationRepo, SalespersonRepo } from './crm';
import type { FreightOrderRepo, InquiryRepo, RateComparisonRepo, TransporterRepo, VehicleTypeRepo } from './transport';
import type { MtAreaRepo, WorkOrderRepo } from './maintenance';
import type { CounterRepo, DispatchRepo, NotificationRepo, RequestRepo } from './workflow';

export * from './types';
export * from './users';
export * from './sessions';
export * from './role-permissions';
export * from './activity';
export * from './masters';
export * from './workflow';
export * from './settings';
export * from './vendors';
export * from './purchase';
export * from './stores';
export * from './stock';
export * from './production';
export * from './sales';
export * from './crm';
export * from './record-table';
export * from './transport';
export * from './maintenance';

/** Every repo the app uses. Routes and services receive this, never a concrete implementation. */
export interface Repos {
  users: UserRepo;
  sessions: SessionRepo;
  rolePermissions: RolePermissionRepo;
  activity: ActivityRepo;
  parties: PartyRepo;
  couriers: CourierRepo;
  products: ProductRepo;
  states: StateRepo;
  cities: CityRepo;
  usage: UsageRepo;
  counters: CounterRepo;
  requests: RequestRepo;
  notifications: NotificationRepo;
  dispatches: DispatchRepo;
  settings: SettingsRepo;
  vendorCategories: VendorCategoryRepo;
  vendorProducts: VendorProductRepo;
  vendors: VendorRepo;
  tnc: TncRepo;
  purchaseTypes: PurchaseTypeRepo;
  purchaseEntries: PurchaseEntryRepo;
  purchaseOrders: PurchaseOrderRepo;
  purchaseReturns: PurchaseReturnRepo;
  openingStock: OpeningStockRepo;
  consumption: ConsumptionRepo;
  purchaseDocuments: PurchaseDocumentRepo;
  mrns: MrnRepo;
  grns: GrnRepo;
  skuGroups: SkuGroupRepo;
  stockSlips: StockSlipRepo;
  stockOpening: StockOpeningRepo;
  reclasses: ReclassRepo;
  prodPlans: PlanRepo;
  prodHotpress: HotPressRepo;
  prodChipping: ChippingRepo;
  prodResin: ResinUseRepo;
  prodCutting: CuttingRepo;
  prodSummary: SummaryRepo;
  prodMdo: MdoRepo;
  mattBatches: MattBatchRepo;
  wipBatches: WipBatchRepo;
  wipAdjustments: WipAdjustmentRepo;
  salesCustomers: CustomerRepo;
  salesItems: SalesItemRepo;
  salesPrices: PriceEntryRepo;
  salesWeights: WeightEntryRepo;
  proformas: ProformaRepo;
  salesOrders: SalesOrderRepo;
  salesInvoices: SalesInvoiceRepo;
  fgStock: FgStockRepo;
  intercompany: IntercompanyRepo;
  crmLeads: LeadRepo;
  crmCustomers: CrmCustomerRepo;
  crmFollowups: FollowupRepo;
  crmOpportunities: OpportunityRepo;
  crmQuotations: QuotationRepo;
  crmWon: OrderWonRepo;
  crmLost: OrderLostRepo;
  crmTasks: CrmTaskRepo;
  crmCampaigns: CampaignRepo;
  crmProducts: CrmProductRepo;
  crmSalespersons: SalespersonRepo;
  trVehicles: VehicleTypeRepo;
  trTransporters: TransporterRepo;
  trInquiries: InquiryRepo;
  trRateCmps: RateComparisonRepo;
  trOrders: FreightOrderRepo;
  mtAreas: MtAreaRepo;
  mtWorkOrders: WorkOrderRepo;
}

/**
 * Unit of work. Everything `fn` does through `tx` commits together or not at all.
 * Use it wherever the spec says "atomic".
 * - memory: snapshot and roll back, serialised. A nested run joins the outer one.
 * - d1: one batch(). TODO(d1)
 */
export interface UnitOfWork {
  run<T>(fn: (tx: Repos) => Promise<T>): Promise<T>;
}

export interface DataLayer {
  repos: Repos;
  uow: UnitOfWork;
}
