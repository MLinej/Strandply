import type { ModulePages } from '../types';
import { AreasPage, AuditPage, DashboardPage, ReportsPage } from './pages/OverviewPages';
import { WorkOrdersPage } from './pages/WorkOrdersPage';

export const pages: ModulePages = {
  dashboard: DashboardPage,
  'work-orders': WorkOrdersPage,
  areas: AreasPage,
  reports: ReportsPage,
  audit: AuditPage,
};
