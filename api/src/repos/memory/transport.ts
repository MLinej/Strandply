import type { FreightOrder, Inquiry, RateComparison, Transporter, TransporterFilters, VehicleType } from '../../contracts/transport';
import { dateRange, MemoryRecordTable } from './record-table';
import type { MemoryStore } from './store';

export function transportRepos(store: MemoryStore) {
  return {
    trVehicles: new MemoryRecordTable<VehicleType>(store, 'trVehicles', 'transport_vehicle_types', ['name'], { searchFields: ['name', 'description'], sortable: ['name', 'createdAt'], defaultSort: 'createdAt' }),
    trTransporters: new MemoryRecordTable<Transporter, TransporterFilters>(store, 'trTransporters', 'transporters', ['code', 'name'], {
      searchFields: ['name', 'code', 'contactPerson', 'phone', 'city', 'gstin'],
      sortable: ['name', 'code', 'rating', 'createdAt'],
      defaultSort: 'name',
      customFilters: {
        vehicle: (r, v) => r.vehicles.includes(String(v)),
        operatesIn: (r, v) => r.operatingCities.some((c) => c.city.toLowerCase() === String(v).toLowerCase()) || r.city.toLowerCase() === String(v).toLowerCase(),
      },
    }),
    trInquiries: new MemoryRecordTable<Inquiry, { status: string; vehicle: string; from: string; to: string }>(store, 'trInquiries', 'transport_inquiries', ['inqNo'], {
      searchFields: ['inqNo', 'material'],
      sortable: ['date', 'inqNo', 'createdAt'],
      defaultSort: '-date',
      customFilters: dateRange<Inquiry>('date'),
    }),
    trRateCmps: new MemoryRecordTable<RateComparison, { status: string; inquiryId: string }>(store, 'trRateCmps', 'transport_rate_comparisons', ['rcNo'], {
      searchFields: ['rcNo', 'approvalNo'],
      sortable: ['createdAt', 'rcNo'],
      defaultSort: '-createdAt',
    }),
    trOrders: new MemoryRecordTable<FreightOrder, { status: string; transporterId: string; from: string; to: string }>(store, 'trOrders', 'transport_orders', ['orderNo'], {
      searchFields: ['orderNo', 'material'],
      sortable: ['date', 'orderNo', 'ratePaise', 'createdAt'],
      defaultSort: '-date',
      customFilters: dateRange<FreightOrder>('date'),
    }),
  };
}
