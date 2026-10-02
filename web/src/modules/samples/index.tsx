import type { ModulePages } from '../types';
import { CouriersPage } from './pages/CouriersPage';
import { DashboardPage } from './pages/DashboardPage';
import { DispatchPage } from './pages/DispatchPage';
import { PartiesPage } from './pages/PartiesPage';
import { ProductsPage } from './pages/ProductsPage';
import { ReportsPage } from './pages/ReportsPage';
import { RequestsPage } from './pages/RequestsPage';
import { TrackingPage } from './pages/TrackingPage';

export const pages: ModulePages = {
  dashboard: DashboardPage,
  requests: RequestsPage,
  dispatch: DispatchPage,
  tracking: TrackingPage,
  parties: PartiesPage,
  couriers: CouriersPage,
  products: ProductsPage,
  reports: ReportsPage,
};
