import type { ModulePages } from '../types';
import { AuditPage } from './pages/AuditPage';
import { ChippingPage } from './pages/ChippingPage';
import { CuttingPage } from './pages/CuttingPage';
import { DashboardPage } from './pages/DashboardPage';
import { HotPressPage } from './pages/HotPressPage';
import { MattPage } from './pages/MattPage';
import { MdoPage } from './pages/MdoPage';
import { PlanPage } from './pages/PlanPage';
import { ReportsPage } from './pages/ReportsPage';
import { ResinPage } from './pages/ResinPage';
import { SettingsPage } from './pages/SettingsPage';
import { SummaryPage } from './pages/SummaryPage';
import { WipPage } from './pages/WipPage';

export const pages: ModulePages = {
  dashboard: DashboardPage,
  planning: PlanPage,
  'hot-press': HotPressPage,
  matt: MattPage,
  chipping: ChippingPage,
  wip: WipPage,
  resin: ResinPage,
  'board-cutting': CuttingPage,
  summary: SummaryPage,
  mdo: MdoPage,
  reports: ReportsPage,
  settings: SettingsPage,
  audit: AuditPage,
};
