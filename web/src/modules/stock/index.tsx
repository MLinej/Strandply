import type { ModulePages } from '../types';
import { AuditPage } from './pages/AuditPage';
import { DashboardPage } from './pages/DashboardPage';
import { ItemsPage } from './pages/ItemsPage';
import { LedgerPage } from './pages/LedgerPage';
import { LivePage } from './pages/LivePage';
import { OpeningPage } from './pages/OpeningPage';
import { ReclassPage } from './pages/ReclassPage';
import { SlipsPage } from './pages/SlipsPage';

export const pages: ModulePages = {
  dashboard: DashboardPage,
  slips: SlipsPage,
  live: LivePage,
  ledger: LedgerPage,
  reclass: ReclassPage,
  items: ItemsPage,
  opening: OpeningPage,
  audit: AuditPage,
};
