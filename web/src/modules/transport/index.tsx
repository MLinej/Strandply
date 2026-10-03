import type { ModulePages } from '../types';
import { InquiriesPage } from './pages/InquiriesPage';
import { TransportersPage, VehiclesPage } from './pages/MastersPages';
import { OrdersPage } from './pages/OrdersPage';
import { AuditPage, DashboardPage, ReportsPage } from './pages/OverviewPages';
import { ApprovalsPage, RatesPage } from './pages/RatesPage';

export const pages: ModulePages = {
  dashboard: DashboardPage,
  inquiries: InquiriesPage,
  rates: RatesPage,
  approvals: ApprovalsPage,
  orders: OrdersPage,
  transporters: TransportersPage,
  vehicles: VehiclesPage,
  reports: ReportsPage,
  audit: AuditPage,
};
