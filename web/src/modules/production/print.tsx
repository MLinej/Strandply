import { renderToStaticMarkup } from 'react-dom/server';
import type { CSSProperties, ReactNode } from 'react';
import { DOC_KINDS, mattStatus, PLAN_SECTIONS, type DocKind, type MattBatchView, type WfStep } from '@contracts/production';
import type { CompanyBlock } from '@contracts/sampletrack';
import { formatDate } from '@/lib/format';
import { PAGES, printHtml } from '@/lib/print';
import { fetchDocPrint, fetchMattPrint, type CompareRow, type ViewByKind } from './api';
import { inr, kg, mins, perKg, qtyFmt, stamp, wfLabel } from './ui';

// Inline styles only: these render in a bare iframe without the app's CSS.
const INK = '#172033';
const MUTED = '#667085';
const FAINT = '#98A2B3';
const RED = '#D71920';
const LINE = '#E6E8EC';

type Cell = string | number | null | undefined;
interface Table {
  title?: string;
  head: string[];
  numeric?: number[];
  rows: Cell[][];
  foot?: Cell[];
}
interface Sections {
  fields: [string, Cell][];
  tables: Table[];
}

const d = (x: string | null | undefined) => (x ? formatDate(x) : '—');
const v = (x: Cell) => (x === null || x === undefined || x === '' ? '—' : String(x));

/** What each kind prints (legacy hpDlPDF, chipDlPDF, resinDlPDF, bcDlPDF, mdoDlPDF, ppDlPDF, psDlPDF). */
function sections<K extends DocKind>(kind: K, doc: ViewByKind[K]): Sections {
  switch (kind) {
    case 'hotpress': {
      const h = doc as ViewByKind['hotpress'];
      return {
        fields: [
          ['Shift', h.shift],
          ['Product', `${h.product} · ${h.size}${h.thickness ? ` · ${h.thickness} mm` : ''}`],
          ['Operator', h.operator],
          ['Total boards', qtyFmt(h.calc.totalBoards)],
          ['Press time', mins(h.calc.pressMins)],
          ['Total time', mins(h.calc.totalMins)],
          ['Spare time', mins(h.calc.spareMins)],
          ['Average per charge', mins(h.calc.avgPressMins)],
          ['Board cutting', h.cuttingNo],
        ],
        tables: [
          {
            title: 'Charges',
            head: ['#', 'Charge', 'Pcs', 'Load', 'Unload', 'Time', 'Remarks'],
            numeric: [2],
            rows: h.charges.map((c, i) => [i + 1, c.label, c.pcs, c.load, c.unload, h.calc.perCharge[i] ? mins(h.calc.perCharge[i]!) : '—', c.remarks]),
            foot: ['', 'Total', h.calc.totalBoards, '', '', mins(h.calc.pressMins), ''],
          },
        ],
      };
    }
    case 'chipping': {
      const c = doc as ViewByKind['chipping'];
      return {
        fields: [
          ['Shift', c.shift],
          ['Machine', c.machine],
          ['Operator', c.operator],
          ['Total', kg(c.totalKg)],
          ['Amount', inr(c.totalPaise)],
          ['Average rate', perKg(c.avgRatePaise)],
          ['WIP batch', c.wipNo],
        ],
        tables: [{ title: 'Lots consumed', head: ['Lot', 'Qty (kg)', 'Net rate', 'Amount'], numeric: [1, 2, 3], rows: c.lots.map((l) => [l.lotNo, qtyFmt(l.qty), perKg(l.ratePaise), inr(l.amountPaise)]), foot: ['Total', qtyFmt(c.totalKg), perKg(c.avgRatePaise), inr(c.totalPaise)] }],
      };
    }
    case 'resin': {
      const r = doc as ViewByKind['resin'];
      return {
        fields: [
          ['Shift', r.shift],
          ['Lot', `${r.lot.lotNo} · ${r.vendorName ?? ''}`],
          ['Invoice', r.invoiceNo],
          ['Quantity', kg(r.lot.qty)],
          ['Rate', perKg(r.lot.ratePaise)],
          ['Amount', inr(r.lot.amountPaise)],
          ['Product', r.product],
          ['Operator', r.operator],
        ],
        tables: [],
      };
    }
    case 'cutting': {
      const b = doc as ViewByKind['cutting'];
      return {
        fields: [
          ['Hot press report', b.hotpressNo],
          ['Shift', b.shift],
          ['Product', `${v(b.product)} · ${v(b.size)}`],
          ['Operator', b.operator],
          ['Boards pressed', qtyFmt(b.hpPcs)],
          ['Boards cut', qtyFmt(b.cutPcs)],
          ['Rejects', `${qtyFmt(b.rejectPcs)} (${b.rejectPct}%)`],
        ],
        tables: [],
      };
    }
    case 'mdo': {
      const m = doc as ViewByKind['mdo'];
      return {
        fields: [
          ['Shift', m.shift],
          ['Operator', m.operator],
          ['Press start', m.pressStart],
          ['Press end', m.pressEnd],
          ['Working time', m.workingMins === null ? null : mins(m.workingMins)],
          ['Total pcs', qtyFmt(m.totalPcs)],
          ['Paper used', m.paperUsed],
          ['Paper wastage', m.paperWastage],
        ],
        tables: [{ title: 'Items', head: ['Board type', 'Thickness', 'Paper', 'Type', 'Finish', 'Pcs', 'Cycle'], numeric: [5], rows: m.items.map((x) => [x.boardType, x.thickness, x.paper, x.type, x.finish, x.pcs, x.cycleTime]) }],
      };
    }
    case 'plan': {
      const p = doc as ViewByKind['plan'];
      return {
        fields: [
          ['Shift', p.shift],
          ['Planned by', p.planOp],
          ['Target matt weight', p.mattWtKg === null ? null : kg(p.mattWtKg)],
          ['Matts', p.matts ?? p.calc.totalBoards],
          ['Resin per matt', p.resinPerMattKg === null ? null : kg(p.resinPerMattKg)],
          ['Wet wood on floor', p.wetWoodAvailKg === null ? null : kg(p.wetWoodAvailKg)],
        ],
        tables: [
          {
            title: 'Products',
            head: ['Product', 'Size', 'Thickness', 'Priority', 'Boards', 'Sqft', 'Charges'],
            numeric: [4, 5, 6],
            rows: p.products.map((x, i) => [x.product, x.size, `${x.thickness} mm`, x.priority, qtyFmt(x.targetBoards), qtyFmt(p.calc.lines[i]!.sqft), p.calc.lines[i]!.charges]),
            foot: ['Total', '', '', '', qtyFmt(p.calc.totalBoards), qtyFmt(p.calc.totalSqft), p.calc.totalCharges],
          },
          ...PLAN_SECTIONS.map((s) => ({ title: s.title, head: ['Parameter', 'Value'], rows: s.fields.map((f) => [f.label, v(p.process[f.key])] as Cell[]) })).filter((t) => t.rows.some((r) => r[1] !== '—')),
          {
            title: 'Raw material requirement',
            head: ['Material', 'Required (kg)'],
            numeric: [1],
            rows: [
              ['Resin', qtyFmt(p.calc.resinReqKg)],
              ['Dry wood', qtyFmt(p.calc.dryWoodReqKg)],
              ['Wet wood', qtyFmt(p.calc.wetWoodReqKg)],
            ],
          },
        ],
      };
    }
    case 'summary': {
      const s = doc as ViewByKind['summary'];
      return {
        fields: [
          ['Product', `${s.product} · ${s.size}${s.thickness ? ` · ${s.thickness} mm` : ''}`],
          ['Batch', s.batch],
          ['Press pcs', qtyFmt(s.pressPcs)],
          ['Boards produced', qtyFmt(s.boards)],
          ['Board rejects', `${qtyFmt(s.boardRej)} (${s.boardRejPct}%)`],
          ['Matts', qtyFmt(s.mattPcs)],
          ['Matt weight', kg(s.mattWtKg)],
          ['Matt rejects', qtyFmt(s.mattRej)],
          ['Resin', `${kg(s.resinKg)} · ${inr(s.resinPaise)}`],
          ['Dry wood', kg(s.dryWoodKg)],
          ['Wet wood', `${kg(s.wetWoodKg)} · ${inr(s.wetWoodPaise)}`],
          ['Linked', [s.links.planNo, s.links.hotpressNo, s.links.mattNo, ...s.links.resinNos, s.links.cuttingNo].filter(Boolean).join(', ')],
        ],
        tables: s.wip.length ? [{ title: 'WIP Nilgiri used', head: ['WIP batch', 'Qty (kg)'], numeric: [1], rows: s.wip.map((w, i) => [s.links.wipNos[i], qtyFmt(w.qty)]) }] : [],
      };
    }
  }
  return { fields: [], tables: [] };
}

const th: CSSProperties = { padding: '1.3mm 1.8mm', background: '#F8F9FA', fontWeight: 700, fontSize: 8, textTransform: 'uppercase', color: MUTED, borderBottom: `1px solid ${LINE}`, textAlign: 'left' };
const td: CSSProperties = { padding: '1.3mm 1.8mm', borderBottom: `1px solid ${LINE}`, textAlign: 'left', verticalAlign: 'top' };

function TableBlock({ t }: { t: Table }) {
  const al = (i: number): CSSProperties => (t.numeric?.includes(i) ? { textAlign: 'right', whiteSpace: 'nowrap' } : {});
  return (
    <div style={{ marginBottom: '4mm', breakInside: 'avoid-page' }}>
      {t.title && <div style={{ fontWeight: 700, fontSize: 10, margin: '0 0 1.2mm' }}>{t.title}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {t.head.map((h, i) => (
              <th key={h} style={{ ...th, ...al(i) }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, i) => (
                <td key={i} style={{ ...td, ...al(i) }}>
                  {v(c)}
                </td>
              ))}
            </tr>
          ))}
          {t.foot && (
            <tr>
              {t.foot.map((c, i) => (
                <td key={i} style={{ ...td, ...al(i), fontWeight: 700, background: '#F8F9FA' }}>
                  {c ?? ''}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Page({ company, title, no, sub, children, trail, generatedAt }: { company: CompanyBlock; title: string; no: string; sub: string; children: ReactNode; trail?: WfStep[]; generatedAt: string }) {
  const last = (a: WfStep['action']) => [...(trail ?? [])].reverse().find((s) => s.action === a);
  const sig = (role: string, s?: WfStep) => (
    <div style={{ flex: 1, fontSize: 8.5 }}>
      <div style={{ minHeight: '8mm', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        {s && <div style={{ fontWeight: 700 }}>{s.byName}</div>}
        {s && <div style={{ color: FAINT, fontSize: 7.5 }}>{stamp(s.at)}</div>}
      </div>
      <div style={{ borderTop: `1px solid ${INK}`, paddingTop: '1mm', color: MUTED }}>{role}</div>
    </div>
  );
  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 9.5, color: INK }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2.5px solid ${RED}`, paddingBottom: '2mm', marginBottom: '3mm' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: RED }}>{company.name}</div>
          <div style={{ fontSize: 9, color: MUTED }}>{[company.city, company.gst && `GSTIN ${company.gst}`, company.llpin && `LLPIN ${company.llpin}`].filter(Boolean).join(' · ')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</div>
          <div style={{ fontSize: 13, fontWeight: 800 }}>{no}</div>
          <div style={{ fontSize: 8.5, color: FAINT }}>{sub}</div>
        </div>
      </div>
      {children}
      {trail && (
        <div style={{ display: 'flex', gap: '8mm', marginTop: '8mm' }}>
          {sig('Prepared by', trail.find((s) => s.action === 'send'))}
          {sig('Reviewed by', last('review'))}
          {sig('Approved by', last('approve'))}
        </div>
      )}
      <div style={{ marginTop: '4mm', textAlign: 'center', color: FAINT, fontSize: 7.5 }}>Generated {stamp(generatedAt)}</div>
    </div>
  );
}

function Fields({ fields }: { fields: [string, Cell][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2mm 5mm', marginBottom: '4mm' }}>
      {fields.map(([k, x]) => (
        <div key={k}>
          <div style={{ fontSize: 7.5, color: FAINT, textTransform: 'uppercase', letterSpacing: 0.4 }}>{k}</div>
          <div style={{ fontWeight: 600 }}>{v(x)}</div>
        </div>
      ))}
    </div>
  );
}

const compareTable = (rows: CompareRow[]): Table => ({
  title: 'Plan vs actual',
  head: ['Metric', 'Plan', 'Actual', 'Variance', 'Status'],
  numeric: [1, 2, 3],
  rows: rows.map((r) => [r.metric, r.plan === null ? '—' : qtyFmt(r.plan), r.actual === null ? '—' : qtyFmt(r.actual), r.variance === null ? '—' : `${r.variance > 0 ? '+' : ''}${qtyFmt(r.variance)}`, r.status]),
});

const A4 = { page: PAGES.requestSlip, marginMm: 12, css: 'html, body { width: auto; min-height: 0; }' };

export async function printDoc<K extends DocKind>(kind: K, id: string) {
  const data = await fetchDocPrint(kind, id);
  const doc = data.doc as ViewByKind[K] & { docNo: string; date: string; wfState: ViewByKind['plan']['wfState']; wfTrail: WfStep[]; remarks: string | null };
  const s = sections(kind, doc);
  const tables = [...s.tables, ...(data.compare.length ? [compareTable(data.compare)] : [])];
  await printHtml({
    ...A4,
    title: doc.docNo,
    bodyHtml: renderToStaticMarkup(
      <Page company={data.company} title={DOC_KINDS[kind].label} no={doc.docNo} sub={`${d(doc.date)} · ${wfLabel(doc.wfState)}`} trail={doc.wfTrail} generatedAt={data.generatedAt}>
        <Fields fields={[...s.fields, ...(doc.remarks ? ([['Remarks', doc.remarks]] as [string, Cell][]) : [])]} />
        {tables.map((t, i) => (
          <TableBlock key={i} t={t} />
        ))}
      </Page>,
    ),
  });
}

/** Matt weight shift report (legacy mattDlPDF / weight-system report). */
export async function printMatt(id: string) {
  const { company, doc: b, generatedAt } = await fetchMattPrint(id);
  const st = b.stats;
  await printHtml({
    ...A4,
    title: b.docNo,
    bodyHtml: renderToStaticMarkup(
      <Page company={company} title="Matt weight report" no={b.docNo} sub={`${d(b.date)} · ${b.shift} · ${b.status === 'open' ? 'Open' : 'Closed'}`} generatedAt={generatedAt}>
        <Fields
          fields={[
            ['Product', `${b.product} · ${b.size}${b.thickness ? ` · ${b.thickness} mm` : ''}`],
            ['Setpoint', `${b.setpoint} kg ± ${b.band}`],
            ['Operator', b.operator],
            ['Matts', `${st.count}${b.targetQty ? ` of ${b.targetQty}` : ''}`],
            ['Average', kg(st.avg)],
            ['Min / max', `${st.min} / ${st.max} kg`],
            ['Std deviation', kg(st.stdDev)],
            ['Pass / warn / reject', `${st.pass} / ${st.warn} / ${st.fail}`],
            ['Pass rate', `${st.passRate}%`],
          ]}
        />
        <TableBlock
          t={{
            head: ['#', 'Weight (kg)', 'Deviation', 'Status', 'Time'],
            numeric: [1, 2],
            rows: b.weights.map((w) => {
              const dev = Math.round((w.weight - b.setpoint) * 1000) / 1000;
              return [w.n, w.weight.toFixed(3), `${dev > 0 ? '+' : ''}${dev.toFixed(3)}`, { pass: 'Pass', warn: 'Warn', fail: 'Reject' }[mattStatus(w.weight, b.setpoint, b.band)], stamp(w.at)];
            }),
          }}
        />
      </Page>,
    ),
  });
}
export type { MattBatchView };
