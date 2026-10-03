import type { ModulePages } from '../types';
import { AuditPage } from './pages/AuditPage';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { DispatchPage } from './pages/DispatchPage';
import { PriceListPage, WeightChartPage } from './pages/EntriesPage';
import { FgPage } from './pages/FgPage';
import { IntercompanyPage } from './pages/IntercompanyPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { ItemsPage } from './pages/ItemsPage';
import { OrdersPage } from './pages/OrdersPage';
import { ProformaPage } from './pages/ProformaPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

export const pages: ModulePages = {
  dashboard: DashboardPage,
  customers: CustomersPage,
  items: ItemsPage,
  'price-list': PriceListPage,
  'weight-chart': WeightChartPage,
  proforma: ProformaPage,
  orders: OrdersPage,
  invoices: InvoicesPage,
  dispatch: DispatchPage,
  'fg-stock': FgPage,
  intercompany: IntercompanyPage,
  reports: ReportsPage,
  settings: SettingsPage,
  audit: AuditPage,
};
