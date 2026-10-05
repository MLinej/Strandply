import { isOpenStatus, type Complaint, type ComplaintFilters, type CpRecipient } from '../../contracts/complaints';
import { dateRange, MemoryRecordTable } from './record-table';
import type { MemoryStore } from './store';

export function complaintsRepos(store: MemoryStore) {
  return {
    complaints: new MemoryRecordTable<Complaint, ComplaintFilters>(store, 'complaints', 'complaints', ['complaintNo'], {
      searchFields: ['complaintNo', 'customerName', 'salesman', 'description', 'invoiceNo'],
      sortable: ['date', 'complaintNo', 'priority', 'createdAt'],
      defaultSort: '-date',
      customFilters: {
        ...dateRange<Complaint>('date'),
        open: (r, v) => isOpenStatus(r.status) === (v === true || v === 'true'),
      },
    }),
    cpRecipients: new MemoryRecordTable<CpRecipient>(store, 'cpRecipients', 'complaint_recipients', ['name'], { searchFields: ['name', 'email'], sortable: ['name'], defaultSort: 'name' }),
  };
}
