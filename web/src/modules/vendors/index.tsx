import { CitiesPage } from '../admin/CitiesPage';
import type { ModulePages } from '../types';
import { CategoriesPage } from './pages/CategoriesPage';
import { ComparePage } from './pages/ComparePage';
import { FindByProductPage } from './pages/FindByProductPage';
import { ProductMasterPage } from './pages/ProductMasterPage';
import { TncPage } from './pages/TncPage';
import { VendorReportsPage } from './pages/VendorReportsPage';
import { VendorSettingsPage } from './pages/VendorSettingsPage';
import { VendorsPage } from './pages/VendorsPage';

/** The shared city master, worded for vendors (legacy City / State master with pincodes). */
function VendorCitiesPage() {
  return <CitiesPage title="City & pincodes" description="City, state and pincode lookup for the vendor form. The same list feeds the party form in Samples." />;
}

export const pages: ModulePages = {
  directory: VendorsPage,
  compare: ComparePage,
  find: FindByProductPage,
  reports: VendorReportsPage,
  products: ProductMasterPage,
  categories: CategoriesPage,
  cities: VendorCitiesPage,
  tnc: TncPage,
  settings: VendorSettingsPage,
};
