import type { PermissionSet } from './domain/access';
import type { User, Session } from './repos';
import type { AuthService } from './auth/auth-service';
import type { ActivityService } from './modules/sampletrack/activity-service';
import type { PermissionService } from './modules/sampletrack/permission-service';
import type { UserService } from './modules/sampletrack/user-service';
import type { AppConfig } from './config';
import type { CityService } from './modules/sampletrack/masters/city-service';
import type { CourierService } from './modules/sampletrack/masters/courier-service';
import type { PartyService } from './modules/sampletrack/masters/party-service';
import type { ProductService } from './modules/sampletrack/masters/product-service';
import type { Clock } from './lib/clock';
import type { RequestService } from './modules/sampletrack/requests/request-service';
import type { DispatchService } from './modules/sampletrack/dispatches/dispatch-service';
import type { PrintService } from './modules/sampletrack/print/print-service';
import type { CompanyService } from './modules/sampletrack/settings/company-service';
import type { NotificationService } from './modules/sampletrack/notification-service';
import type { DashboardService } from './modules/sampletrack/reports/dashboard-service';
import type { ReportService } from './modules/sampletrack/reports/report-service';
import type { VendorImportService } from './modules/vendors/import-service';
import type { TncService, VendorCategoryService, VendorProductService } from './modules/vendors/masters';
import type { VendorSettingsService } from './modules/vendors/settings-service';
import type { VendorService } from './modules/vendors/vendor-service';
import type { PurchaseDocumentService } from './modules/purchase/document-service';
import type { PurchaseEntryService } from './modules/purchase/entry-service';
import type { InventoryService } from './modules/purchase/inventory-service';
import type { PurchaseMasterService, PurchaseOrderService, PurchaseReturnService } from './modules/purchase/order-service';
import type { PurchaseReportService } from './modules/purchase/report-service';
import type { GrnService } from './modules/stores/grn-service';
import type { MrnService } from './modules/stores/mrn-service';
import type { StoresReportService } from './modules/stores/report-service';
import type { StockMasterService } from './modules/stock/master-service';
import type { StockService } from './modules/stock/stock-service';
import type { ProductionDocService } from './modules/production/documents';
import type { MattService, WipService } from './modules/production/matt-wip';
import type { ProductionReportService } from './modules/production/report-service';
import type { SalesDocumentService } from './modules/sales/document-service';
import type { SalesMasterService } from './modules/sales/master-service';
import type { SalesReportService } from './modules/sales/report-service';
import type { CrmRecordService } from './modules/crm/record-service';
import type { CrmReportService } from './modules/crm/report-service';
import type { CrmWorkflowService } from './modules/crm/workflow-service';

export interface AuthContext {
  user: User;
  session: Session;
  /** Effective SampleTrack permissions for user.role, resolved once per request. */
  permissions: PermissionSet;
}

export interface Services {
  auth: AuthService;
  permissions: PermissionService;
  users: UserService;
  activity: ActivityService;
  parties: PartyService;
  couriers: CourierService;
  products: ProductService;
  cities: CityService;
  requests: RequestService;
  dispatches: DispatchService;
  print: PrintService;
  company: CompanyService;
  notifications: NotificationService;
  dashboard: DashboardService;
  reports: ReportService;
  vendors: VendorService;
  vendorCategories: VendorCategoryService;
  vendorProducts: VendorProductService;
  tnc: TncService;
  vendorImport: VendorImportService;
  vendorSettings: VendorSettingsService;
  purchaseMasters: PurchaseMasterService;
  purchaseEntries: PurchaseEntryService;
  purchaseOrders: PurchaseOrderService;
  purchaseReturns: PurchaseReturnService;
  inventory: InventoryService;
  purchaseReports: PurchaseReportService;
  purchaseDocuments: PurchaseDocumentService;
  mrns: MrnService;
  grns: GrnService;
  storesReports: StoresReportService;
  stockMasters: StockMasterService;
  stock: StockService;
  productionDocs: ProductionDocService;
  mattBatches: MattService;
  wipBatches: WipService;
  productionReports: ProductionReportService;
  salesDocs: SalesDocumentService;
  salesMasters: SalesMasterService;
  salesReports: SalesReportService;
  crmRecords: CrmRecordService;
  crmFlow: CrmWorkflowService;
  crmReports: CrmReportService;
  clock: Clock;
}

/** Hono environment shared by every route. */
export interface AppEnv {
  Variables: {
    /** Set by the session middleware. null = anonymous. */
    auth: AuthContext | null;
    services: Services;
    config: AppConfig;
  };
}
