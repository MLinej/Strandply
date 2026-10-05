import type { ComplaintView, CpPriority, CpStatus } from '@contracts/complaints';
import { Pill } from '@/components/ui';
import type { Tone } from '@/lib/status';
import { d } from '../crm/ui';

export { d, stamp } from '../crm/ui';

const PRIORITY: Record<CpPriority, Tone> = { Low: 'green', Medium: 'amber', High: 'red', Critical: 'red' };
export const PriorityPill = ({ p }: { p: CpPriority }) => <Pill tone={PRIORITY[p]}>{p === 'Critical' ? 'Critical !' : p}</Pill>;
const STATUS: Record<CpStatus, Tone> = { Open: 'amber', 'In Progress': 'purple', Resolved: 'green', Closed: 'neutral' };
export const StatusPill = ({ s }: { s: CpStatus }) => <Pill tone={STATUS[s]}>{s}</Pill>;

/**
 * mailto: with the legacy subject and summary. Browsers can't attach files to mailto, so the body asks to attach
 * the printed report (legacy did the same with its downloaded PDF).
 */
export function mailtoLink(c: ComplaintView) {
  const subject = `Complaint Registered - ${c.complaintNo} - ${c.customerName}`;
  const body = [
    `Complaint No.: ${c.complaintNo}`,
    `Date: ${d(c.date)}`,
    `Salesman: ${c.salesman}`,
    `Customer: ${c.customerName}${c.customerLocation ? ` (${c.customerLocation})` : ''}`,
    `Contact: ${c.customerPhone ?? '-'}`,
    ...(c.invoiceNo ? [`Invoice: ${c.invoiceNo}`] : []),
    `Material: ${c.material}`,
    `Category: ${c.category}`,
    `Priority: ${c.priority}`,
    '',
    'Description:',
    c.description,
    '',
    '** Please attach the complaint report (Print → Save as PDF) before sending. **',
  ].join('\n');
  return `mailto:${encodeURIComponent(c.recipientEmail ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
