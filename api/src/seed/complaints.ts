// Complaints reference data: the legacy default recipients, and in dev a few complaints against the demo Sales parties.
import type { Complaint, CpEvent, CpRecipient } from '../contracts/complaints';

type Ref<T> = Omit<T, 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export const REF_CP_RECIPIENTS: Ref<CpRecipient>[] = [
  { id: 'cpr-jimit', name: 'Jimit Mehta', role: 'Plant Manager / Approver', email: null, active: true },
  { id: 'cpr-sinha', name: 'P K Sinha', role: 'Reviewer', email: null, active: true },
];

const ev = (id: string, type: CpEvent['type'], byName: string, at: string, text: string): CpEvent => ({ id, type, by: null, byName, at, text, files: [] });
const base = { customerId: null, customerPhone: null, invoiceId: null, invoiceNo: null, recipientName: 'Jimit Mehta', recipientEmail: null, photos: [] };

export const DEMO_COMPLAINTS: (Ref<Complaint> & { createdAt: string })[] = [
  {
    ...base, id: 'cmp-1', complaintNo: 'CMP/26-27/0001', date: '2026-09-12', salesman: 'Suresh Kumar', customerName: 'Shree Ganesh Timber', customerLocation: 'Rajkot', material: 'OSB Board', category: 'Damage in Transit', priority: 'High',
    description: '12 sheets of 18mm OSB arrived with broken edges; the truck tarpaulin was torn.', status: 'Resolved', resolvedOn: '2026-09-18', createdAt: '2026-09-12T06:30:00.000Z',
    timeline: [ev('e1', 'created', 'Suresh Kumar', '2026-09-12T06:30:00.000Z', 'Complaint registered · notified Jimit Mehta'), ev('e2', 'status', 'Jimit Mehta', '2026-09-13T05:00:00.000Z', 'Status changed from Open to In Progress.'), ev('e3', 'comment', 'Jimit Mehta', '2026-09-17T09:00:00.000Z', 'Replacement sheets sent with the next dispatch; transporter debited.'), ev('e4', 'status', 'Jimit Mehta', '2026-09-18T04:30:00.000Z', 'Status changed from In Progress to Resolved.')],
  },
  {
    ...base, id: 'cmp-2', complaintNo: 'CMP/26-27/0002', date: '2026-09-24', salesman: 'Kaushik Kothari', customerName: 'Patel Plywood House', customerLocation: 'Surat', material: 'Plywood', category: 'Quality Issue', priority: 'Critical',
    description: 'Delamination seen on 8 boards of the 12mm lot after two days at site.', status: 'In Progress', resolvedOn: null, createdAt: '2026-09-24T07:15:00.000Z',
    timeline: [ev('e1', 'created', 'Kaushik Kothari', '2026-09-24T07:15:00.000Z', 'Complaint registered · notified Jimit Mehta'), ev('e2', 'status', 'P K Sinha', '2026-09-25T04:00:00.000Z', 'Status changed from Open to In Progress.')],
  },
  {
    ...base, id: 'cmp-3', complaintNo: 'CMP/26-27/0003', date: '2026-09-30', salesman: 'Suresh Kumar', customerName: 'Shree Ganesh Timber', customerLocation: 'Rajkot', material: 'OSB Board', category: 'Quantity Shortage', priority: 'Medium',
    description: 'Invoice shows 120 sheets; 116 received.', status: 'Open', resolvedOn: null, createdAt: '2026-09-30T10:00:00.000Z',
    timeline: [ev('e1', 'created', 'Suresh Kumar', '2026-09-30T10:00:00.000Z', 'Complaint registered · notified Jimit Mehta')],
  },
];
