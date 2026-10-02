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
