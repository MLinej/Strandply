import type { ModulePages } from '../types';
import { CustomersPage } from './pages/CustomersPage';
import { FollowupsPage } from './pages/FollowupsPage';
import { LeadsPage, PipelinePage } from './pages/LeadsPage';
import { AuditPage, CampaignsPage, DashboardPage, ProductsPage, ReportsPage, SalespersonsPage, SettingsPage } from './pages/OverviewPages';
import { LostPage, OpportunitiesPage, QuotationsPage, TasksPage, WonPage } from './pages/PipelinePages';

export const pages: ModulePages = {
  dashboard: DashboardPage,
  leads: LeadsPage,
  pipeline: PipelinePage,
  followups: FollowupsPage,
  customers: CustomersPage,
  opportunities: OpportunitiesPage,
  quotations: QuotationsPage,
  won: WonPage,
  lost: LostPage,
  tasks: TasksPage,
  campaigns: CampaignsPage,
  products: ProductsPage,
  salespersons: SalespersonsPage,
  settings: SettingsPage,
  reports: ReportsPage,
  audit: AuditPage,
};
