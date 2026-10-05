import { renderToStaticMarkup } from 'react-dom/server';
import { achievementPct, lightOf } from '@contracts/dwpas';
import { PAGES, printHtml } from '@/lib/print';
import { fetchPlanPrint } from './api';
import { d, stamp } from './ui';

// Inline styles only: this renders in a bare iframe without the app's CSS.
const INK = '#172033';
const MUTED = '#667085';
const RED = '#C8102E';
const LINE = '#DDE3EC';
const LIGHT = { green: '#16A34A', amber: '#D97706', red: '#DC2626' };
type Kind = 'plan' | 'achievement' | 'manpower';
const NUMERIC = new Set(['Target', 'Skilled', 'Unskilled', 'Actual', 'Achv %', 'Skilled P / A', 'Unskilled P / A', 'Total']);
const TITLE: Record<Kind, [string, string]> = { plan: ['Daily work plan', 'Department-wise planning sheet'], achievement: ['Daily achievement report', 'Plan vs actual by department'], manpower: ['HR manpower requirement', 'Skilled and unskilled manpower by department'] };

/** The legacy plan, achievement and manpower PDFs as A4 prints (plan and achievement landscape). */
export async function printPlan(id: string, kind: Kind) {
  const { company, plan: p, generatedAt } = await fetchPlanPrint(id, kind);
  const th = { padding: '1.2mm 1.5mm', background: RED, color: '#fff', fontSize: 7.5, textAlign: 'left' as const };
  const td = { padding: '1.2mm 1.5mm', borderBottom: `1px solid ${LINE}`, fontSize: 8, verticalAlign: 'top' as const };
  const r = { ...td, textAlign: 'right' as const };
  const strip = [
    ['Plan date', d(p.date)],
    ['Plan type', p.type],
    ['Prepared by', p.preparedBy ?? '—'],
    ['Status', p.status],
    ['Departments', String(p.totals.lines)],
    ['Generated', stamp(generatedAt)],
  ];
  const t = p.totals;
  const body =
    kind === 'plan' ? (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['#', 'Department', 'Head', 'Work planned', 'Target', 'Skilled', 'Unskilled', 'Machine', 'Priority', 'Operator'].map((h) => (
              <th key={h} style={NUMERIC.has(h) ? { ...th, textAlign: 'right' } : th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.lines.map((l, i) => (
            <tr key={i}>
              <td style={td}>{i + 1}</td>
              <td style={{ ...td, fontWeight: 700 }}>{l.department}</td>
              <td style={td}>{l.head}</td>
              <td style={td}>{l.work}</td>
              <td style={r}>
                {l.qty} {l.unit}
              </td>
              <td style={r}>{l.skilled}</td>
              <td style={r}>{l.unskilled}</td>
              <td style={td}>{l.machine ?? '—'}</td>
              <td style={td}>{l.priority}</td>
              <td style={td}>{l.operator ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : kind === 'achievement' ? (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['#', 'Department', 'Work', 'Target', 'Actual', 'Achv %', 'Skilled P / A', 'Unskilled P / A', 'Deviation reason', 'Head remarks'].map((h) => (
              <th key={h} style={NUMERIC.has(h) ? { ...th, textAlign: 'right' } : th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.lines.map((l, i) => {
            const pct = achievementPct(l.qty, l.actualQty);
            return (
              <tr key={i}>
                <td style={td}>{i + 1}</td>
                <td style={{ ...td, fontWeight: 700 }}>{l.department}</td>
                <td style={td}>{l.work}</td>
                <td style={r}>
                  {l.qty} {l.unit}
                </td>
                <td style={r}>{l.actualQty === null ? '—' : `${l.actualQty} ${l.unit}`}</td>
                <td style={{ ...r, fontWeight: 700, color: pct === null ? MUTED : LIGHT[lightOf(pct)] }}>{pct === null ? '—' : `${pct}%`}</td>
                <td style={r}>
                  {l.skilled} / {l.actualSkilled ?? '—'}
                </td>
                <td style={r}>
                  {l.unskilled} / {l.actualUnskilled ?? '—'}
                </td>
                <td style={td}>{l.reason ?? ''}</td>
                <td style={td}>{l.headRemarks ?? ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    ) : (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3mm', marginBottom: '4mm' }}>
          {[
            ['Total skilled required', t.skilled, RED],
            ['Total unskilled required', t.unskilled, '#0891B2'],
            ['Total manpower required', t.skilled + t.unskilled, LIGHT.green],
          ].map(([k, v, c]) => (
            <div key={k as string} style={{ border: `1px solid ${LINE}`, borderRadius: 4, padding: '3mm', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: c as string }}>{v}</div>
              <div style={{ fontSize: 7.5, color: MUTED, textTransform: 'uppercase' }}>{k}</div>
            </div>
          ))}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['#', 'Department', 'Head', 'Work', 'Skilled', 'Unskilled', 'Total', 'Priority'].map((h) => (
                <th key={h} style={NUMERIC.has(h) ? { ...th, textAlign: 'right' } : th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.lines.map((l, i) => (
              <tr key={i}>
                <td style={td}>{i + 1}</td>
                <td style={{ ...td, fontWeight: 700 }}>{l.department}</td>
                <td style={td}>{l.head}</td>
                <td style={td}>{l.work}</td>
                <td style={r}>{l.skilled}</td>
                <td style={r}>{l.unskilled}</td>
                <td style={{ ...r, fontWeight: 700 }}>{l.skilled + l.unskilled}</td>
                <td style={td}>{l.priority}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td style={td} colSpan={4}>
                Total
              </td>
              <td style={r}>{t.skilled}</td>
              <td style={r}>{t.unskilled}</td>
              <td style={r}>{t.skilled + t.unskilled}</td>
              <td style={td} />
            </tr>
          </tbody>
        </table>
      </>
    );
  await printHtml({
    page: kind === 'manpower' ? PAGES.requestSlip : PAGES.register,
    marginMm: 10,
    css: 'html, body { width: auto; min-height: 0; } tr { break-inside: avoid; }',
    title: `${TITLE[kind][0]} ${p.date}`,
    bodyHtml: renderToStaticMarkup(
      <div style={{ fontFamily: 'Times New Roman, Times, serif', color: INK }}>
        <div style={{ background: RED, color: '#fff', padding: '3mm 4mm', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div>
            <div style={{ fontSize: 8 }}>DWPAS · {TITLE[kind][1]}</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>{TITLE[kind][0]}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '2mm', background: '#F8F9FB', border: `1px solid ${LINE}`, padding: '2mm 3mm', margin: '3mm 0' }}>
          {strip.map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 7, color: MUTED, textTransform: 'uppercase' }}>{k}</div>
              <div style={{ fontSize: 9, fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>
        {p.remarks && <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: '2mm 3mm', fontSize: 8.5, marginBottom: '3mm' }}>Special instructions: {p.remarks}</div>}
        {body}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8mm', marginTop: '14mm', fontSize: 8.5, color: MUTED }}>
          {['Supervisor', 'Department head', 'Production head'].map((s) => (
            <div key={s} style={{ borderTop: `1px solid ${INK}`, paddingTop: '1mm' }}>
              {s}
            </div>
          ))}
        </div>
      </div>,
    ),
  });
}
