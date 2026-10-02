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
