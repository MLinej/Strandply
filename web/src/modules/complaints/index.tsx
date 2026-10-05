import type { ModulePages } from '../types';
import { ComplaintFormPage } from './pages/ComplaintFormPage';
import { AuditPage, DashboardPage, RecipientsPage, ReportsPage } from './pages/OverviewPages';
import { RegisterPage } from './pages/RegisterPage';

export const pages: ModulePages = {
  dashboard: DashboardPage,
  new: ComplaintFormPage,
  register: RegisterPage,
  reports: ReportsPage,
  recipients: RecipientsPage,
  audit: AuditPage,
};
