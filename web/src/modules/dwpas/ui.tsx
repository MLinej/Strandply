import { achievementPct, lightOf, type LinePriority, type PlanLine, type PlanStatus } from '@contracts/dwpas';
import { Pill } from '@/components/ui';
import type { Tone } from '@/lib/status';

export { d, stamp } from '../crm/ui';

const STATUS: Record<PlanStatus, Tone> = { Draft: 'neutral', Submitted: 'amber', Approved: 'green' };
export const StatusPill = ({ s }: { s: PlanStatus }) => <Pill tone={STATUS[s]}>{s}</Pill>;
const PRI: Record<LinePriority, Tone> = { High: 'red', Medium: 'amber', Low: 'green' };
export const PriorityPill = ({ p }: { p: LinePriority }) => <Pill tone={PRI[p]}>{p}</Pill>;

/** Achievement % with the legacy traffic light. */
export function Achievement({ line }: { line: Pick<PlanLine, 'qty' | 'actualQty'> }) {
  const pct = achievementPct(line.qty, line.actualQty);
  if (pct === null) return <span className="text-faint">—</span>;
  const light = lightOf(pct);
  return <Pill tone={light === 'green' ? 'green' : light === 'amber' ? 'amber' : 'red'}>{`${pct}%`}</Pill>;
}
export const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 2 }));
