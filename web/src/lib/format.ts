const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** 110719.4 → "1,10,719.40" (Indian grouping). Pass `symbol` for "₹1,10,719.40". */
export function formatAmount(value: number, { symbol = false, decimals = 2 }: { symbol?: boolean; decimals?: 0 | 2 } = {}) {
  const s = (decimals === 2 ? inr2 : inr0).format(value);
  return symbol ? `₹${s}` : s;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** "2026-09-22" → "22 Sept 2026" (the mockups' house style). */
export function formatDate(iso: string) {
  return dateFmt.format(new Date(`${iso}T00:00:00`)).replace(/\bSep\b/, 'Sept');
}

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/** "just now", "12 min ago", "3 h ago", "yesterday", then "22 Sept". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const mins = Math.round((now.getTime() - then.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24 && then.getDate() === now.getDate()) return `${hours} h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return 'yesterday';
  return shortDate.format(then).replace(/\bSep\b/, 'Sept');
}

/** 1234567 → "12,34,567" (Indian grouping, no decimals). */
export function formatCount(n: number) {
  return formatAmount(n, { decimals: 0 });
}
