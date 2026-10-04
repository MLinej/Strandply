import type { ModulePages } from '../types';
import { AuditPage, BillsPage, MeterPage } from './pages/OtherPages';
import { ReadingsPage } from './pages/ReadingsPage';
import { DailyPage, DashboardPage, MonthlyReportPage } from './pages/ReportPages';

export const pages: ModulePages = {
  dashboard: DashboardPage,
  readings: ReadingsPage,
  daily: DailyPage,
  report: MonthlyReportPage,
  bills: BillsPage,
  meter: MeterPage,
  audit: AuditPage,
};
