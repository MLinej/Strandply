/**
 * The one place where a status maps to a colour. Screens never pick pill colours themselves.
 * Workflow: Draft (neutral) → Reviewed (amber) → Approved (purple) → Accounted (green); Rejected red.
 * Red is kept for states that need action (Rejected, Overdue). Cancelled is neutral so red stays scarce.
 */
export type Tone = 'neutral' | 'amber' | 'purple' | 'green' | 'red';

export const STATUS_TONE = {
  // Document workflow (GRN, vendor bills, stock slips …)
  Draft: 'neutral',
  Submitted: 'amber',
  Reviewed: 'amber',
  Approved: 'purple',
  Accounted: 'green',
  Rejected: 'red',
  Cancelled: 'neutral',
  // Orders & invoices
  Active: 'green',
  Open: 'amber',
  Partial: 'purple',
  Completed: 'green',
  'On hold': 'amber',
  // Payments
  Unpaid: 'amber',
  'Part paid': 'purple',
  Paid: 'green',
  Overdue: 'red',
  // Reconciliation / report inputs
  Matched: 'green',
  Complete: 'green',
  Flagged: 'amber',
} as const satisfies Record<string, Tone>;

export type Status = keyof typeof STATUS_TONE;

export const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-subtle text-muted',
  amber: 'bg-amber-light text-amber',
  purple: 'bg-purple-light text-purple',
  green: 'bg-green-light text-green',
  red: 'bg-primary-light text-primary',
};

export function toneFor(status: string): Tone {
  return (STATUS_TONE as Record<string, Tone>)[status] ?? 'neutral';
}
