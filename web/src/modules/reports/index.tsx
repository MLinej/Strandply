import type { ModulePages } from '../types';
import { AnalyticsPage, DashboardPage, ElectricityPage, MaintenancePage, ProductionPage, PurchasePage, SalesPage, SourcesPage, StockPage } from './pages/ModulePages';
import { DailyPage, FyPage, MonthlyPage } from './pages/PeriodPages';

export const pages: ModulePages = {
  dashboard: DashboardPage,
  purchase: PurchasePage,
  production: ProductionPage,
  stock: StockPage,
  electricity: ElectricityPage,
  sales: SalesPage,
  maintenance: MaintenancePage,
  analytics: AnalyticsPage,
  daily: DailyPage,
  monthly: MonthlyPage,
  fy: FyPage,
  sources: SourcesPage,
};
