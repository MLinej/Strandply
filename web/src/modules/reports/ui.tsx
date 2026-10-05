import { clsx } from 'clsx';
import { useState, type ReactNode } from 'react';
import { Card, Input, Select } from '@/components/ui';
import { useUrlState } from '../samples/ui/list-state';
import { useYears, type Range } from './api';

export { inr } from '../crm/ui';
export { d } from '../crm/ui';
export { BarList, monthLabel } from '../purchase/ui';

/** ₹ in lakh / crore for big tiles (legacy fmtINRShort). */
export function inrShort(paise: number | null | undefined) {
  if (paise === null || paise === undefined) return '—';
  const r = paise / 100;
  const a = Math.abs(r);
  const s = a >= 1e7 ? `${(a / 1e7).toFixed(2)} Cr` : a >= 1e5 ? `${(a / 1e5).toFixed(2)} L` : a.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return `${r < 0 ? '−' : ''}₹${s}`;
}
export const num = (n: number | null | undefined, dec = 0) => (n === null || n === undefined ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: dec }));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const shortMonth = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

/** A round axis maximum: 1, 2, 5 × 10ⁿ. */
function niceMax(n: number) {
  if (n <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= n)!;
}

export interface Series {
  label: string;
  /** chart-s1 / chart-s2: the design system's first two categorical hues, in order. */
  className: 'bg-chart-s1' | 'bg-chart-s2';
  values: number[];
}

/**
 * Month columns: one or two series in the same unit (never two scales), 4px rounded tops on the baseline, a hover
 * readout per month, a legend for two series, and a table view.
 */
/** Every month from the first to the last given (YYYY-MM), so a quiet month shows as an empty column, not a gap. */
function fillMonths(given: string[]) {
  if (!given.length) return [];
  const sorted = [...given].sort();
  const out: string[] = [];
  let [y, m] = sorted[0]!.split('-').map(Number) as [number, number];
  const last = sorted[sorted.length - 1]!;
  for (let ym = sorted[0]!; ym <= last; ym = `${y}-${String(m).padStart(2, '0')}`) {
    out.push(ym);
    m += 1;
    if (m > 12) [y, m] = [y + 1, 1];
  }
  return out;
}

export function MonthChart({ title, description, months: given, series: rawSeries, format }: { title: string; description?: string; months: string[]; series: Series[]; format: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const months = fillMonths(given);
  const series = rawSeries.map((s) => ({ ...s, values: months.map((m) => s.values[given.indexOf(m)] ?? 0) }));
  const empty = series.every((s) => s.values.every((v) => !v));
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const ticks = [max, max / 2, 0];
  return (
    <Card
      title={title}
      description={description}
      actions={
        <button type="button" className="text-sm font-semibold text-muted hover:text-ink" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      }
    >
      {series.length > 1 && (
        <ul className="mb-3 flex gap-4 text-sm text-muted" aria-label="Legend">
          {series.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5">
              <span className={clsx('h-2.5 w-2.5 rounded-sm', s.className)} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      {empty ? (
        <p className="py-8 text-center text-sm text-muted">Nothing in this period.</p>
      ) : asTable ? (
        <table className="w-full text-sm" aria-label={title}>
          <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
            <tr>
              <th className="px-3 py-1.5 text-left">Month</th>
              {series.map((s) => (
                <th key={s.label} className="px-3 py-1.5 text-right">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={m} className="border-t border-divider">
                <td className="px-3 py-1.5">{shortMonth(m)}</td>
                {series.map((s) => (
                  <td key={s.label} className="px-3 py-1.5 text-right tabular-nums">
                    {format(s.values[i] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex h-44 gap-2" role="img" aria-label={`${title}: ${months.map((m, i) => `${shortMonth(m)} ${series.map((s) => `${s.label} ${format(s.values[i] ?? 0)}`).join(', ')}`).join('; ')}`}>
          <div className="flex w-16 flex-col justify-between pb-6 text-right text-caption tabular-nums text-faint" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="-translate-y-1.5 truncate">
                {format(t)}
              </span>
            ))}
          </div>
          <div className="relative flex flex-1 flex-col">
            <div className="pointer-events-none absolute inset-x-0 bottom-6 top-0 flex flex-col justify-between" aria-hidden>
              {ticks.map((t) => (
                <span key={t} className={clsx('h-px', t === 0 ? 'bg-border' : 'bg-divider')} />
              ))}
            </div>
            <div className="relative flex flex-1 items-end">
              {months.map((m, i) => (
                <div key={m} className="relative flex h-full flex-1 flex-col items-center justify-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  {hover === i && (
                    <div className="absolute bottom-full z-20 mb-1 whitespace-nowrap rounded border border-border bg-card px-2.5 py-1.5 text-sm shadow-overlay" role="tooltip">
                      <div className="font-semibold">{shortMonth(m)}</div>
                      {series.map((s) => (
                        <div key={s.label} className="flex items-center gap-1.5 text-muted">
                          <span className={clsx('h-2 w-2 rounded-sm', s.className)} aria-hidden />
                          {s.label} <span className="ml-auto pl-3 font-semibold tabular-nums text-ink">{format(s.values[i] ?? 0)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className={clsx('flex h-full w-full items-end justify-center gap-0.5 rounded-sm', hover === i && 'bg-page')}>
                    {series.map((s) => (
                      <span key={s.label} className={clsx('w-3.5 rounded-t-[4px]', s.className, hover !== null && hover !== i && 'opacity-50')} style={{ height: `${((s.values[i] ?? 0) / max) * 100}%`, minHeight: s.values[i] ? 2 : 0 }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex h-6 items-end" aria-hidden>
              {months.map((m) => (
                <span key={m} className="flex-1 truncate text-center text-caption text-muted">
                  {shortMonth(m)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Period picker shared by the hub pages: a financial year or a date range (URL-backed). Defaults to the current FY to date. */
export function useRangeFilter(): { range: Range; picker: ReactNode } {
  const url = useUrlState(['fy', 'from', 'to'] as const);
  const years = useYears().data ?? [];
  const v = url.values;
  const range: Range = v.from || v.to ? { from: v.from || undefined, to: v.to || undefined } : { fy: v.fy || undefined };
  const picker = (
    <div className="flex flex-wrap items-center gap-2.5">
      <Select aria-label="Financial year" placeholder="This FY to date" options={years.map((y) => ({ value: y, label: `FY ${y}` }))} value={v.from || v.to ? '' : v.fy} onChange={(e) => url.set({ fy: e.target.value, from: null, to: null })} containerClassName="w-[170px]" />
      <span className="text-sm text-muted">or</span>
      <Input aria-label="From date" type="date" value={v.from} onChange={(e) => url.set({ from: e.target.value, fy: null })} containerClassName="w-[150px]" />
      <span className="text-sm text-muted">to</span>
      <Input aria-label="To date" type="date" value={v.to} onChange={(e) => url.set({ to: e.target.value, fy: null })} containerClassName="w-[150px]" />
    </div>
  );
  return { range, picker };
}

/** A plain table with a header row and optional total row. */
export function SimpleTable({ label, head, rows, total, empty = 'Nothing in this period', align }: { label: string; head: string[]; rows: ReactNode[][]; total?: ReactNode[]; empty?: string; align?: ('left' | 'right')[] }) {
  const a = (i: number) => (align?.[i] ?? (i === 0 ? 'left' : 'right')) === 'right' ? 'text-right tabular-nums' : 'text-left';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label={label}>
        <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-1.5 ${a(i)}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-divider">
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-1.5 ${a(j)}${j === 0 ? ' whitespace-nowrap' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={head.length} className="px-3 py-4 text-center text-muted">
                {empty}
              </td>
            </tr>
          )}
          {rows.length > 0 && total && (
            <tr className="border-t-2 border-border bg-page font-semibold">
              {total.map((c, j) => (
                <td key={j} className={`px-3 py-1.5 ${a(j)}${j === 0 ? ' whitespace-nowrap' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
