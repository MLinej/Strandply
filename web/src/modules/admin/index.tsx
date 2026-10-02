import type { ModulePages } from '../types';
import { ActivityPage } from './ActivityPage';
import { CitiesPage } from './CitiesPage';
import { CompanySettingsPage } from './CompanySettingsPage';
import { RolesPage } from './RolesPage';
import { UsersPage } from './UsersPage';

export const pages: ModulePages = {
  users: UsersPage,
  roles: RolesPage,
  activity: ActivityPage,
  settings: CompanySettingsPage,
  cities: CitiesPage,
};
