import { Hono } from 'hono';
import { AuthService } from './auth/auth-service';
import { authRoutes } from './auth/routes';
import type { RoutePolicy, SecureRouter } from './auth/secure-router';
import { csrfHeaderMiddleware, sessionMiddleware } from './auth/session-middleware';
import type { AppConfig } from './config';
import type { AppEnv, Services } from './env';
import { systemClock, type Clock } from './lib/clock';
import { HttpError } from './lib/errors';
import { ActivityService } from './modules/sampletrack/activity-service';
import { sampletrackRoutes } from './modules/sampletrack';
import { PermissionService } from './modules/sampletrack/permission-service';
import { UserService } from './modules/sampletrack/user-service';
import { CityService } from './modules/sampletrack/masters/city-service';
import { CourierService } from './modules/sampletrack/masters/courier-service';
import { PartyService } from './modules/sampletrack/masters/party-service';
import { ProductService } from './modules/sampletrack/masters/product-service';
import { NotificationService } from './modules/sampletrack/notification-service';
import { RequestService } from './modules/sampletrack/requests/request-service';
import { DispatchService } from './modules/sampletrack/dispatches/dispatch-service';
import { PrintService } from './modules/sampletrack/print/print-service';
import { CompanyService } from './modules/sampletrack/settings/company-service';
import { DashboardService } from './modules/sampletrack/reports/dashboard-service';
import { ReportService } from './modules/sampletrack/reports/report-service';
import { VendorImportService } from './modules/vendors/import-service';
import { TncService, VendorCategoryService, VendorProductService } from './modules/vendors/masters';
import { vendorRoutes } from './modules/vendors/routes';
import { VendorSettingsService } from './modules/vendors/settings-service';
import { VendorService } from './modules/vendors/vendor-service';
import { MemoryBlobStore, type BlobStore } from './lib/blob-store';
import { PurchaseDocumentService } from './modules/purchase/document-service';
import { PurchaseEntryService } from './modules/purchase/entry-service';
import { InventoryService } from './modules/purchase/inventory-service';
import { PurchaseMasterService, PurchaseOrderService, PurchaseReturnService } from './modules/purchase/order-service';
import { PurchaseReportService } from './modules/purchase/report-service';
import { purchaseRoutes } from './modules/purchase/routes';
import { GrnService } from './modules/stores/grn-service';
import { MrnService } from './modules/stores/mrn-service';
import { StoresReportService } from './modules/stores/report-service';
import { storesRoutes } from './modules/stores/routes';
import { StockMasterService } from './modules/stock/master-service';
import { stockRoutes } from './modules/stock/routes';
import { StockService } from './modules/stock/stock-service';
import { ProductionDocService } from './modules/production/documents';
import { MattService, WipService } from './modules/production/matt-wip';
import { ProductionReportService } from './modules/production/report-service';
import { productionRoutes } from './modules/production/routes';
import { SalesDocumentService } from './modules/sales/document-service';
import { SalesMasterService } from './modules/sales/master-service';
import { SalesReportService } from './modules/sales/report-service';
import { salesRoutes } from './modules/sales/routes';
import { CrmRecordService } from './modules/crm/record-service';
import { CrmReportService } from './modules/crm/report-service';
import { crmRoutes } from './modules/crm/routes';
import { CrmWorkflowService } from './modules/crm/workflow-service';
import { FreightService } from './modules/transport/freight-service';
import { TransportMasterService } from './modules/transport/master-service';
import { TransportReportService } from './modules/transport/report-service';
import { transportRoutes } from './modules/transport/routes';
import { MaintenanceReportService } from './modules/maintenance/report-service';
import { maintenanceRoutes } from './modules/maintenance/routes';
import { ElectricityService } from './modules/electricity/electricity-service';
import { ElectricityReportService } from './modules/electricity/report-service';
import { electricityRoutes } from './modules/electricity/routes';
import { ComplaintService } from './modules/complaints/complaint-service';
import { ComplaintReportService } from './modules/complaints/report-service';
import { complaintsRoutes } from './modules/complaints/routes';
import { DwpasService } from './modules/dwpas/dwpas-service';
import { DwpasReportService } from './modules/dwpas/report-service';
import { dwpasRoutes } from './modules/dwpas/routes';
import { WorkOrderService } from './modules/maintenance/work-order-service';
import type { DataLayer } from './repos';

export interface AppDeps {
  data: DataLayer;
  config: AppConfig;
  clock?: Clock;
  /** Uploaded files. Defaults to memory (tests); entry.node.ts passes a disk store. */
  blobs?: BlobStore;
}

export function createServices({ data, config, clock = systemClock, blobs = new MemoryBlobStore() }: AppDeps): Services {
  const activity = new ActivityService(data, clock);
  const notifications = new NotificationService(data, clock);
  const requests = new RequestService(data, activity, notifications, clock);
  const dispatches = new DispatchService(data, activity, notifications, clock);
  const company = new CompanyService(data, activity, clock);
  const print = new PrintService(data, dispatches, requests, activity, company, clock);
  const vendors = new VendorService(data, activity, clock);
  const inventory = new InventoryService(data, activity, clock);
  const mrns = new MrnService(data, activity, company, clock);
  const grns = new GrnService(data, activity, company, clock);
  const productionDocs = new ProductionDocService(data, activity, clock);
  const mattBatches = new MattService(data, activity, clock);
  const wipBatches = new WipService(data, activity, clock);
  const salesDocs = new SalesDocumentService(data, activity, clock);
  const salesMasters = new SalesMasterService(data, activity, clock);
  const workOrders = new WorkOrderService(data, activity, clock);
  const electricity = new ElectricityService(data, blobs, activity, clock);
  const complaints = new ComplaintService(data, blobs, activity, clock);
  const dwpas = new DwpasService(data, activity, clock);
  const crmRecords = new CrmRecordService(data, activity, clock);
  const crmFlow = new CrmWorkflowService(data, crmRecords, activity, clock);
  const freight = new FreightService(data, activity, clock);
  return {
    activity,
    permissions: new PermissionService(data, activity, clock, config.permissionCacheMs),
    users: new UserService(data, activity, clock, config.argon2),
    auth: new AuthService(data, activity, clock, config),
    parties: new PartyService(data, activity, clock),
    couriers: new CourierService(data, activity, clock),
    products: new ProductService(data, activity, clock),
    cities: new CityService(data, activity, clock),
    requests,
    dispatches,
    print,
    company,
    notifications,
    dashboard: new DashboardService(data, dispatches, clock),
    reports: new ReportService(data, dispatches, print, activity, clock),
    vendors,
    vendorCategories: new VendorCategoryService(data, activity, clock),
    vendorProducts: new VendorProductService(data, activity, clock),
    tnc: new TncService(data, activity, clock),
    vendorImport: new VendorImportService(data, activity, clock),
    vendorSettings: new VendorSettingsService(data, vendors, company, activity, clock),
    purchaseMasters: new PurchaseMasterService(data, activity, clock),
    purchaseEntries: new PurchaseEntryService(data, activity, company, clock),
    purchaseOrders: new PurchaseOrderService(data, activity, company, clock),
    purchaseReturns: new PurchaseReturnService(data, activity, clock),
    inventory,
    purchaseReports: new PurchaseReportService(data, inventory, activity, clock),
    purchaseDocuments: new PurchaseDocumentService(data, blobs, activity, clock),
    mrns,
    grns,
    storesReports: new StoresReportService(data, mrns, grns, activity, clock),
    stockMasters: new StockMasterService(data, activity, company, clock),
    stock: new StockService(data, activity, company, clock),
    productionDocs,
    mattBatches,
    wipBatches,
    productionReports: new ProductionReportService(data, productionDocs, mattBatches, wipBatches, company, activity, clock),
    salesDocs,
    salesMasters,
    salesReports: new SalesReportService(data, salesDocs, salesMasters, company, activity, clock),
    crmRecords,
    crmFlow,
    crmReports: new CrmReportService(data, crmRecords, company, activity, clock),
    freight,
    transportMasters: new TransportMasterService(data, activity, clock),
    transportReports: new TransportReportService(data, freight, company, activity, clock),
    workOrders,
    maintenanceReports: new MaintenanceReportService(data, workOrders, company, activity, clock),
    electricity,
    electricityReports: new ElectricityReportService(data, electricity, activity, clock),
    complaints,
    complaintReports: new ComplaintReportService(data, complaints, company, activity, clock),
    dwpas,
    dwpasReports: new DwpasReportService(data, dwpas, company, activity, clock),
    clock,
  };
}

/** Builds the Hono app. Doesn't depend on the runtime: everything comes in through `deps`. */
export function createApp(deps: AppDeps) {
  const services = createServices(deps);
  const app = new Hono<AppEnv>();
  const routePolicies: RoutePolicy[] = [];

  app.use('*', async (c, next) => {
    c.set('services', services);
    c.set('config', deps.config);
    await next();
  });
  app.use('/api/*', csrfHeaderMiddleware);
  app.use('/api/*', sessionMiddleware);

  const mount = (prefix: string, router: SecureRouter) => {
    app.route(prefix, router.hono);
    for (const p of router.policies) routePolicies.push({ ...p, path: prefix + p.path });
  };
  mount('/api', authRoutes());
  mount('/api/sampletrack', sampletrackRoutes());
  mount('/api/vendors', vendorRoutes());
  mount('/api/purchase', purchaseRoutes());
  mount('/api/stores', storesRoutes());
  mount('/api/stock', stockRoutes());
  mount('/api/production', productionRoutes());
  mount('/api/sales', salesRoutes());
  mount('/api/crm', crmRoutes());
  mount('/api/transport', transportRoutes());
  mount('/api/maintenance', maintenanceRoutes());
  mount('/api/electricity', electricityRoutes());
  mount('/api/complaints', complaintsRoutes());
  mount('/api/dwpas', dwpasRoutes());

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'No such endpoint' } }, 404));
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
    }
    console.error(err);
    return c.json({ error: { code: 'internal', message: 'Something went wrong' } }, 500);
  });

  return { app, services, routePolicies };
}

export type App = ReturnType<typeof createApp>['app'];
