import type { ElBill, ElRate, ElReading } from '../../contracts/electricity';
import { dateRange, MemoryRecordTable } from './record-table';
import type { MemoryStore } from './store';

export function electricityRepos(store: MemoryStore) {
  return {
    elRates: new MemoryRecordTable<ElRate, { kind: string }>(store, 'elRates', 'electricity_rates', [], { searchFields: [], sortable: ['effectiveFrom'], defaultSort: 'effectiveFrom' }),
    elReadings: new MemoryRecordTable<ElReading, { shift: string; from: string; to: string }>(store, 'elReadings', 'meter_readings', ['at'], {
      searchFields: ['remarks'],
      sortable: ['at', 'kwh'],
      defaultSort: '-at',
      customFilters: dateRange<ElReading>('date'),
    }),
    elBills: new MemoryRecordTable<ElBill, { from: string; to: string }>(store, 'elBills', 'electricity_bills', ['billDate'], {
      searchFields: ['remarks'],
      sortable: ['billDate'],
      defaultSort: '-billDate',
      customFilters: dateRange<ElBill>('billDate'),
    }),
  };
}
