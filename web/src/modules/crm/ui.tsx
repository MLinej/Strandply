import type { CustomerStatus, FollowupStatus, LeadStage, OppStage, Priority, QuoteStatus, TaskStatus } from '@contracts/crm';
import { Pill } from '@/components/ui';
import { formatAmount, formatDate } from '@/lib/format';
import type { Tone } from '@/lib/status';

/** ₹ from paise, no decimals (legacy fmtMoney). */
export const inr = (paise: number | null | undefined) => (paise === null || paise === undefined ? '—' : formatAmount(Math.round(paise / 100), { symbol: true, decimals: 0 }));
export const lakh = (paise: number) => (Math.abs(paise) >= 1e7 ? `₹${(paise / 1e7).toFixed(2)} L` : inr(paise));
export const d = (iso: string | null | undefined) => (iso ? formatDate(iso) : '—');
export const stamp = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const toPaise = (s: string) => Math.round((Number(s) || 0) * 100);
export const rupeesText = (p: number | null | undefined) => (p ? String(p / 100) : '');

const PRIORITY: Record<Priority, Tone> = { Hot: 'red', Warm: 'amber', Cold: 'neutral' };
export const PriorityPill = ({ p }: { p: Priority }) => <Pill tone={PRIORITY[p]}>{p}</Pill>;

const STAGE: Partial<Record<LeadStage | OppStage, Tone>> = { 'New Lead': 'neutral', Qualified: 'purple', Quotation: 'purple', Negotiation: 'amber', 'Order Won': 'green', 'Order Lost': 'red' };
export const StagePill = ({ s }: { s: LeadStage | OppStage }) => <Pill tone={STAGE[s] ?? 'neutral'}>{s}</Pill>;

const FU: Record<FollowupStatus, Tone> = { Pending: 'amber', Completed: 'green', Rescheduled: 'purple', 'Customer Not Reachable': 'red', 'Customer Requested Later': 'neutral', Converted: 'green', Lost: 'red' };
export const FollowupPill = ({ s }: { s: FollowupStatus }) => <Pill tone={FU[s]}>{s}</Pill>;

const QUOTE: Record<QuoteStatus, Tone> = { Draft: 'neutral', Sent: 'purple', 'Under Discussion': 'amber', Negotiation: 'amber', Accepted: 'green', Rejected: 'red', Expired: 'neutral' };
export const QuotePill = ({ s }: { s: QuoteStatus }) => <Pill tone={QUOTE[s]}>{s}</Pill>;

const TASK: Record<TaskStatus, Tone> = { Pending: 'amber', 'In Progress': 'purple', Completed: 'green' };
export const TaskPill = ({ s }: { s: TaskStatus }) => <Pill tone={TASK[s]}>{s}</Pill>;

const CUST: Record<CustomerStatus, Tone> = { Active: 'green', Inactive: 'neutral', Archived: 'neutral' };
export const CustomerPill = ({ s }: { s: CustomerStatus }) => <Pill tone={CUST[s]}>{s}</Pill>;

/** WhatsApp link for an Indian number (adds 91 to a bare 10-digit number). */
export const waLink = (num: string | null | undefined) => {
  const digits = (num ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
};
export const telLink = (num: string | null | undefined) => (num ? `tel:${num.replace(/[^\d+]/g, '')}` : null);
