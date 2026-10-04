// Maintenance reference data: the legacy DEFAULT_AREAS, and in dev the legacy DEMO_TASKS (dates moved to the
// current season so the dashboard has something open and overdue).
import type { MtArea, TimelineEntry, WorkOrder } from '../contracts/maintenance';

type Ref<T> = Omit<T, 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export const REF_MT_AREAS: Ref<MtArea>[] = ['Assembly Line A', 'Assembly Line B', 'Packaging Unit', 'Boiler Room', 'Warehouse', 'Quality Lab', 'Utility Block', 'Press Shop'].map((name, i) => ({
  id: `mta-${i + 1}`,
  name,
  active: true,
}));

const t = (id: string, type: TimelineEntry['type'], byName: string, at: string, text: string): TimelineEntry => ({ id, type, by: null, byName, at, text });

export const DEMO_WORK_ORDERS: (Ref<WorkOrder> & { createdAt: string })[] = [
  {
    id: 'wo-1', woNo: 'WO-26-0001', title: 'Hydraulic Press #3 Oil Leak', category: 'Hydraulic', area: 'Press Shop', priority: 'Critical', status: 'In Progress', assignee: 'Raj Kumar',
    description: 'Continuous oil drip from main cylinder seal. Production halted.', notes: 'Replacement seal ordered.', dueDate: '2026-09-28', completedOn: null, createdAt: '2026-09-25T03:40:00.000Z',
    timeline: [
      t('t1', 'created', 'Suresh Mehta', '2026-09-25T03:40:00.000Z', 'Work order created.'),
      t('t2', 'assigned', 'Suresh Mehta', '2026-09-25T03:41:00.000Z', 'Assigned to Raj Kumar.'),
      t('t3', 'status', 'Raj Kumar', '2026-09-26T03:00:00.000Z', 'Status changed to In Progress.'),
      t('t4', 'note', 'Raj Kumar', '2026-09-26T08:30:00.000Z', 'Inspected seal — ordering replacement part. ETA 2 days.'),
    ],
  },
  {
    id: 'wo-2', woNo: 'WO-26-0002', title: 'Conveyor Belt Motor Bearing Noise', category: 'Mechanical', area: 'Assembly Line A', priority: 'High', status: 'Open', assignee: 'Priya Nair',
    description: 'Unusual grinding noise from conveyor motor bearing at station 4.', notes: null, dueDate: '2026-10-06', completedOn: null, createdAt: '2026-09-26T05:30:00.000Z',
    timeline: [t('t1', 'created', 'Operations', '2026-09-26T05:30:00.000Z', 'Work order created.'), t('t2', 'assigned', 'Operations', '2026-09-26T05:32:00.000Z', 'Assigned to Priya Nair.')],
  },
  {
    id: 'wo-3', woNo: 'WO-26-0003', title: 'Panel PLC Fault — Line B', category: 'Electrical', area: 'Assembly Line B', priority: 'Critical', status: 'Open', assignee: 'Suresh Yadav',
    description: 'PLC throwing E204 fault code. Assembly Line B is stopped.', notes: null, dueDate: '2026-09-27', completedOn: null, createdAt: '2026-09-27T02:15:00.000Z',
    timeline: [t('t1', 'created', 'Shift Supervisor', '2026-09-27T02:15:00.000Z', 'Work order created. Line B halted.'), t('t2', 'assigned', 'Shift Supervisor', '2026-09-27T02:16:00.000Z', 'Assigned to Suresh Yadav.')],
  },
  {
    id: 'wo-4', woNo: 'WO-26-0004', title: 'Air Compressor Pressure Drop', category: 'Pneumatic', area: 'Utility Block', priority: 'Medium', status: 'On Hold', assignee: 'Meena Das',
    description: 'Compressor #2 not holding pressure above 6 bar.', notes: 'Parts ETA: 8 October.', dueDate: '2026-10-09', completedOn: null, createdAt: '2026-09-22T04:30:00.000Z',
    timeline: [
      t('t1', 'created', 'Meena Das', '2026-09-22T04:30:00.000Z', 'Work order created.'),
      t('t2', 'status', 'Meena Das', '2026-09-23T03:30:00.000Z', 'Status changed to In Progress.'),
      t('t3', 'note', 'Meena Das', '2026-09-24T09:30:00.000Z', 'Spare parts not available locally. Ordered from Rajkot supplier.'),
      t('t4', 'status', 'Meena Das', '2026-09-24T09:35:00.000Z', 'Status changed to On Hold — awaiting parts.'),
    ],
  },
  {
    id: 'wo-5', woNo: 'WO-26-0005', title: 'Fire Exit Door Hinge Repair', category: 'Civil', area: 'Warehouse', priority: 'Low', status: 'Completed', assignee: 'Arjun Singh',
    description: 'South warehouse fire exit door hinge broken. Safety hazard.', notes: 'Completed on schedule.', dueDate: '2026-09-23', completedOn: '2026-09-22', createdAt: '2026-09-20T02:30:00.000Z',
    timeline: [
      t('t1', 'created', 'Safety Officer', '2026-09-20T02:30:00.000Z', 'Work order created.'),
      t('t2', 'assigned', 'Safety Officer', '2026-09-20T02:35:00.000Z', 'Assigned to Arjun Singh.'),
      t('t3', 'status', 'Arjun Singh', '2026-09-21T04:00:00.000Z', 'Status changed to In Progress.'),
      t('t4', 'note', 'Arjun Singh', '2026-09-22T05:30:00.000Z', 'Hinge replaced and tested. Door closes properly.'),
      t('t5', 'status', 'Arjun Singh', '2026-09-22T05:40:00.000Z', 'Status changed to Completed.'),
    ],
  },
];
