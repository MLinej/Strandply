import { isOverdue, type MtPriority, type MtStatus, type WorkOrder } from '@contracts/maintenance';
import { Pill } from '@/components/ui';
import type { Tone } from '@/lib/status';
import { d } from '../crm/ui';

export { d, stamp } from '../crm/ui';

const PRIORITY: Record<MtPriority, Tone> = { Critical: 'red', High: 'amber', Medium: 'purple', Low: 'green' };
export const PriorityPill = ({ p }: { p: MtPriority }) => <Pill tone={PRIORITY[p]}>{p}</Pill>;
const STATUS: Record<MtStatus, Tone> = { Open: 'neutral', 'In Progress': 'purple', 'On Hold': 'amber', Completed: 'green' };
export const StatusPill = ({ s }: { s: MtStatus }) => <Pill tone={STATUS[s]}>{s}</Pill>;

/** Due date, red with a warning when overdue. */
export function Due({ w, today }: { w: Pick<WorkOrder, 'dueDate' | 'status'>; today: string }) {
  const late = !!today && isOverdue(w, today);
  return <span className={late ? 'font-semibold text-primary' : undefined}>{late ? `Overdue · ${d(w.dueDate)}` : d(w.dueDate)}</span>;
}

/** WhatsApp share text (legacy shareWhatsApp), sent to wa.me without a number so the user picks the chat. */
export function whatsAppLink(w: WorkOrder, today: string) {
  const lines = [
    `🔧 *Maintenance Work Order — ${w.woNo}*`,
    '',
    `📌 *${w.title}*`,
    '',
    `🏷 Priority: *${w.priority}*${w.priority === 'Critical' ? ' 🔴' : ''}`,
    `📊 Status: *${w.status}*`,
    `⚙️ Category: ${w.category}`,
    `📍 Area: ${w.area}`,
    `👤 Assigned To: ${w.assignee}`,
    `📅 Due Date: ${d(w.dueDate)}${isOverdue(w, today) ? ' ⚠️ *OVERDUE*' : ''}`,
  ];
  if (w.description) lines.push('', `📝 *Description:*\n${w.description}`);
  if (w.notes) lines.push('', `💬 *Notes:*\n${w.notes}`);
  lines.push('', '_Strandply LLP — Maintenance Tracker_');
  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
}
