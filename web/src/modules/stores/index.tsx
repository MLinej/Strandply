import type { ModulePages } from '../types';
import { AccountingPage } from './pages/AccountingPage';
import { AuditPage } from './pages/AuditPage';
import { DashboardPage } from './pages/DashboardPage';
import { GatePage } from './pages/GatePage';
import { GrnPage } from './pages/GrnPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

export const pages: ModulePages = {
  dashboard: DashboardPage,
  'gate-entry': GatePage,
  grn: GrnPage,
  accounting: AccountingPage,
  reports: ReportsPage,
  settings: SettingsPage,
  audit: AuditPage,
};
