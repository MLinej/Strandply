import { pfBand } from '@contracts/electricity';
import { Pill } from '@/components/ui';

export { d, inr, stamp } from '../crm/ui';

/** Meter units, Indian grouping, up to 2 decimals. */
export const kwh = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 2 }));
/** ₹ per kWh from paise per kWh, two decimals. */
export const perUnit = (paise: number) => `₹${(paise / 100).toFixed(2)}/kWh`;

/** PF with its band (legacy pass / warn / fail colours). */
export function PfCell({ pf }: { pf: number | null }) {
  if (pf === null) return <span className="text-faint">—</span>;
  const band = pfBand(pf);
  return <span className={band === 'incentive' ? 'font-semibold text-green' : band === 'penalty' ? 'font-semibold text-primary' : 'text-amber'}>{pf.toFixed(3)}</span>;
}
export function PfPill({ pf }: { pf: number }) {
  const band = pfBand(pf);
  return <Pill tone={band === 'incentive' ? 'green' : band === 'penalty' ? 'red' : 'amber'}>{band === 'incentive' ? 'PF incentive (≥ 0.95)' : band === 'penalty' ? 'PF penalty (< 0.85)' : 'Normal (0.85–0.94)'}</Pill>;
}

/** Month bounds for a YYYY-MM value. */
export const monthRange = (ym: string) => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
};
export const monthLabel = (ym: string) => new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`));
