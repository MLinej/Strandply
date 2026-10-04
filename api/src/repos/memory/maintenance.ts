import { isOverdue, type MtArea, type WorkOrder, type WorkOrderFilters } from '../../contracts/maintenance';
import { MemoryRecordTable } from './record-table';
import type { MemoryStore } from './store';

export function maintenanceRepos(store: MemoryStore) {
  return {
    mtAreas: new MemoryRecordTable<MtArea>(store, 'mtAreas', 'maintenance_areas', ['name'], { searchFields: ['name'], sortable: ['name', 'createdAt'], defaultSort: 'name' }),
    mtWorkOrders: new MemoryRecordTable<WorkOrder, WorkOrderFilters>(store, 'mtWorkOrders', 'work_orders', ['woNo'], {
      searchFields: ['woNo', 'title', 'assignee'],
      sortable: ['createdAt', 'dueDate', 'woNo', 'priority', 'status'],
      defaultSort: '-createdAt',
      customFilters: {
        overdueAsOf: (r, v) => isOverdue(r, String(v)),
        from: (r, v) => r.createdAt.slice(0, 10) >= String(v),
        to: (r, v) => r.createdAt.slice(0, 10) <= String(v),
      },
    }),
  };
}
