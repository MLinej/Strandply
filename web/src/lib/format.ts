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
