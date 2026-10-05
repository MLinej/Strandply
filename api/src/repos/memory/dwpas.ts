import type { DwDepartment, DwEmployee, DwPlan } from '../../contracts/dwpas';
import { dateRange, MemoryRecordTable } from './record-table';
import type { MemoryStore } from './store';

export function dwpasRepos(store: MemoryStore) {
  return {
    dwDepartments: new MemoryRecordTable<DwDepartment>(store, 'dwDepartments', 'dwpas_departments', ['name'], { searchFields: ['name', 'code', 'head'], sortable: ['name'], defaultSort: 'name' }),
    dwEmployees: new MemoryRecordTable<DwEmployee>(store, 'dwEmployees', 'dwpas_employees', ['name'], { searchFields: ['name', 'code', 'department', 'designation'], sortable: ['name', 'code'], defaultSort: 'name' }),
    dwPlans: new MemoryRecordTable<DwPlan, { status: string; from: string; to: string }>(store, 'dwPlans', 'work_plans', ['date'], {
      searchFields: ['preparedBy', 'type', 'remarks', 'date'],
      sortable: ['date'],
      defaultSort: '-date',
      customFilters: dateRange<DwPlan>('date'),
    }),
  };
}
