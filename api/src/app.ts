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
import type { DataLayer } from './repos';

export interface AppDeps {
  data: DataLayer;
  config: AppConfig;
  clock?: Clock;
}

export function createServices({ data, config, clock = systemClock }: AppDeps): Services {
  const activity = new ActivityService(data, clock);
  const notifications = new NotificationService(data, clock);
  const requests = new RequestService(data, activity, notifications, clock);
  const dispatches = new DispatchService(data, activity, notifications, clock);
  const company = new CompanyService(data, activity, clock);
  const print = new PrintService(data, dispatches, requests, activity, company, clock);
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
