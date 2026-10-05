import type { ModulePages } from '../types';
import { AchievementPage } from './pages/AchievementPage';
import { AuditPage, DashboardPage, DepartmentsPage, EmployeesPage, ManpowerPage, VariancePage } from './pages/OverviewPages';
import { PlanEntryPage } from './pages/PlanEntryPage';
import { RegisterPage } from './pages/RegisterPage';

export const pages: ModulePages = {
  dashboard: DashboardPage,
  plan: PlanEntryPage,
  register: RegisterPage,
  achievement: AchievementPage,
  variance: VariancePage,
  manpower: ManpowerPage,
  departments: DepartmentsPage,
  employees: EmployeesPage,
  audit: AuditPage,
};
