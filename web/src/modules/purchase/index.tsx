import type { ModulePages } from '../types';
import { AuditPage } from './pages/AuditPage';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { InventoryPage } from './pages/InventoryPage';
import { NotesPage } from './pages/NotesPage';
import { OrdersPage } from './pages/OrdersPage';
import { RegisterPage } from './pages/RegisterPage';
import { ReportsPage } from './pages/ReportsPage';
import { ReturnsPage } from './pages/ReturnsPage';
import { TrucksPage } from './pages/TrucksPage';

export const pages: ModulePages = {
  dashboard: DashboardPage,
  register: RegisterPage,
  trucks: TrucksPage,
  orders: OrdersPage,
  returns: ReturnsPage,
  notes: NotesPage,
  inventory: InventoryPage,
  reports: ReportsPage,
  documents: DocumentsPage,
  audit: AuditPage,
};
