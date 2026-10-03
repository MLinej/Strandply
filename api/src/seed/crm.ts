import { DEFAULT_LOST_REASONS, DEFAULT_SOURCES, type CrmProduct, type Salesperson } from '../contracts/crm';

type Bare<T> = Omit<T, 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

/** CRM settings (st_settings keys). Same as the seed rows in db/migrations/0011_crm.sql. */
export const DEFAULT_CRM_SETTINGS: Record<string, unknown> = {
  'crm.sources': DEFAULT_SOURCES,
  'crm.lost_reasons': DEFAULT_LOST_REASONS,
};

/** Legacy DEFAULT_PRODUCTS. */
export const REF_CRM_PRODUCTS: Bare<CrmProduct>[] = [
  { id: 'crp-osb', name: 'OSB', thickness: '9/12/15/18mm', size: '8x4 ft', grade: 'Standard', application: 'Roofing/Flooring/Packing', ratePaise: 0, moq: null, active: true },
  { id: 'crp-sosb', name: 'S-OSB', thickness: '9/12/15/18mm', size: '8x4 ft', grade: 'Structural', application: 'Structural panels', ratePaise: 0, moq: null, active: true },
  { id: 'crp-mdo', name: 'MDO Board', thickness: '12/15/18mm', size: '8x4 ft', grade: 'Overlay', application: 'Shuttering/Signage', ratePaise: 0, moq: null, active: true },
  { id: 'crp-hybrid', name: 'Hybrid Board', thickness: '12/15/18mm', size: '8x4 ft', grade: 'Hybrid', application: 'Furniture/Interior', ratePaise: 0, moq: null, active: true },
  { id: 'crp-firnopan', name: 'Firnopan', thickness: '12/15/18mm', size: '8x4 ft', grade: 'Premium', application: 'Furniture', ratePaise: 0, moq: null, active: true },
  { id: 'crp-other', name: 'Other', thickness: null, size: null, grade: null, application: null, ratePaise: 0, moq: null, active: true },
];

/** Legacy DEFAULT_SALESPERSONS. */
export const REF_SALESPERSONS: Bare<Salesperson>[] = [
  { id: 'crs-suresh', name: 'Suresh Kumar', mobile: null, email: null, territory: 'Gujarat', designation: 'Marketing Head', active: true },
  { id: 'crs-kaushik', name: 'Kaushik Kothari', mobile: null, email: null, territory: 'Rajkot', designation: 'Accounts/Sales', active: true },
];
