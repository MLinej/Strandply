import { renderToStaticMarkup } from 'react-dom/server';
import type { CSSProperties, ReactNode } from 'react';
import type { CompanyBlock } from '@contracts/sampletrack';
import type { SlipView } from '@contracts/stock';
import { formatDate } from '@/lib/format';
import { PAGES, printHtml } from '@/lib/print';
import { openWhatsApp } from '@/lib/share';
import { fetchSlipPrint, type SlipPrintPayload } from './api';
import { qtyFmt, skuDetail, SLIP_TYPE_LABEL } from './ui';

// Inline styles only: these render in a bare iframe without the app's CSS.
const INK = '#172033';
const MUTED = '#667085';
const FAINT = '#98A2B3';
const RED = '#D71920';
const GREEN = '#16A34A';
const LINE = '#E6E8EC';
const stamp = (iso: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

function Header({ c, title, right }: { c: CompanyBlock; title: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2.5px solid ${RED}`, paddingBottom: '2mm', marginBottom: '3mm' }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800, color: RED }}>{c.name}</div>
        <div style={{ fontSize: 9, color: MUTED }}>{[c.city, c.gst && `GSTIN ${c.gst}`, c.llpin && `LLPIN ${c.llpin}`].filter(Boolean).join(' · ')}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</div>
        {right}
      </div>
    </div>
  );
}

const cell: CSSProperties = { padding: '1.3mm 1.8mm', borderBottom: `1px solid ${LINE}`, textAlign: 'left', verticalAlign: 'top' };

/** A5 landscape SIS / SRS slip with the Miracle accounting entry (legacy printSlip). */
export function SlipDocument({ data }: { data: SlipPrintPayload }) {
  const s = data.slip;
  const leg = (sign: '−' | '+', ref: SlipView['from'], info: SlipView['fromInfo'], dir: string) => (
    <tr>
      <td style={{ ...cell, width: '18mm' }}>
        <span style={{ fontWeight: 800, color: sign === '−' ? RED : GREEN }}>{sign === '−' ? 'MINUS −' : 'PLUS +'}</span>
      </td>
      <td style={cell}>
        <div style={{ fontSize: 12, fontWeight: 800 }}>{ref.sku}</div>
        <div style={{ color: MUTED }}>{info ? skuDetail(info) : ''}</div>
        <div style={{ color: FAINT, fontSize: 8.5 }}>
          {dir}: {info?.dept ?? '—'}
        </div>
      </td>
      <td style={{ ...cell, textAlign: 'right', fontSize: 12, fontWeight: 800, color: sign === '−' ? RED : GREEN, whiteSpace: 'nowrap' }}>
        {sign} {qtyFmt(s.qty)} {info?.unit ?? ''}
      </td>
    </tr>
  );
  const kv = (k: string, v: ReactNode) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 7.5, color: FAINT, textTransform: 'uppercase' }}>{k}</div>
      <div style={{ fontWeight: 600 }}>{v || '—'}</div>
    </div>
  );
  const sig = (t: string) => (
    <div style={{ flex: 1, fontSize: 8.5 }}>
      <div style={{ height: '8mm' }} />
      <div style={{ borderTop: `1px solid ${INK}`, paddingTop: '1mm', color: MUTED }}>{t}</div>
    </div>
  );
  const sis = s.type === 'SIS';
  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 9.5, color: INK }}>
      <Header
        c={data.company}
        title={SLIP_TYPE_LABEL[s.type]}
        right={
          <>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{s.slipNo}</div>
            <div style={{ fontSize: 8.5, color: FAINT }}>{formatDate(s.date)}</div>
          </>
        }
      />
      <div style={{ display: 'flex', gap: '5mm', marginBottom: '3mm' }}>
        {kv('Against PR / SO', s.refNo)}
        {kv('Shift', s.shift)}
        {kv('Batch', s.batch)}
        {kv('Quantity', `${qtyFmt(s.qty)} ${s.fromInfo?.unit ?? ''}`)}
      </div>
      <div style={{ fontSize: 8, fontWeight: 700, color: MUTED, textTransform: 'uppercase', marginBottom: '1mm' }}>Miracle accounting entry</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2mm', border: `1px solid ${LINE}` }}>
        <tbody>
          {leg('−', s.from, s.fromInfo, 'From')}
          {leg('+', s.to, s.toInfo, 'To')}
        </tbody>
      </table>
      <div style={{ color: MUTED, fontSize: 8.5, marginBottom: '2mm' }}>Miracle ref (JV / STJ / entry no.): ____________________</div>
      {s.remarks && (
        <div>
          <strong>Remarks:</strong> {s.remarks}
        </div>
      )}
      <div style={{ display: 'flex', gap: '8mm', marginTop: '6mm' }}>
        {sig(sis ? 'Issued by (store incharge)' : 'Dept incharge')}
        {sig(sis ? 'Received by (dept incharge)' : 'Received by (store incharge)')}
        {sig('Verified by (accounts, Miracle entry)')}
      </div>
      <div style={{ marginTop: '3mm', textAlign: 'center', color: FAINT, fontSize: 7.5 }}>Generated {stamp(data.generatedAt)}</div>
    </div>
  );
}

export async function printSlip(id: string) {
  const data = await fetchSlipPrint(id);
  await printHtml({ title: data.slip.slipNo, page: PAGES.courierLabel, marginMm: 7, css: 'html, body { width: auto; min-height: 0; }', bodyHtml: renderToStaticMarkup(<SlipDocument data={data} />) });
}

/** WhatsApp text for a slip (legacy sendWA). */
export function shareSlip(s: SlipView) {
  const unit = s.fromInfo?.unit ?? '';
  openWhatsApp(
    [
      `*Strandply LLP – ${SLIP_TYPE_LABEL[s.type]}*`,
      '',
      `*Slip no.:* ${s.slipNo}`,
      `*Date:* ${formatDate(s.date)}`,
      s.refNo && `*Against PR / SO:* ${s.refNo}`,
      s.shift && `*Shift:* ${s.shift}`,
      `*Quantity:* ${qtyFmt(s.qty)} ${unit}`,
      `*Batch:* ${s.batch}`,
      '',
      '*Miracle entry:*',
      `MINUS − \`${s.from.sku}\` ${s.fromInfo ? skuDetail(s.fromInfo) : ''}`,
      `From: ${s.fromInfo?.dept ?? '—'}`,
      `PLUS + \`${s.to.sku}\` ${s.toInfo ? skuDetail(s.toInfo) : ''}`,
      `To: ${s.toInfo?.dept ?? '—'}`,
      s.remarks && `\n*Remarks:* ${s.remarks}`,
    ]
      .filter((x): x is string => typeof x === 'string')
      .join('\n'),
  );
}

// ── Table reports (legacy printReport / waReport) ────────────────────

export interface ReportSection {
  title?: string;
  head: string[];
  /** Indexes of right-aligned (number) columns. */
  numeric?: number[];
  rows: (string | number)[][];
  foot?: (string | number)[];
}
export interface TableReport {
  title: string;
  subtitle?: string;
  sections: ReportSection[];
}

function ReportDocument({ company, r, generatedAt }: { company: CompanyBlock; r: TableReport; generatedAt: string }) {
  const th: CSSProperties = { ...cell, background: '#F8F9FA', fontWeight: 700, fontSize: 8.5, textTransform: 'uppercase', color: MUTED };
  const al = (s: ReportSection, i: number): CSSProperties => (s.numeric?.includes(i) ? { textAlign: 'right', whiteSpace: 'nowrap' } : {});
  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 9.5, color: INK }}>
      <Header c={company} title={r.title} right={r.subtitle ? <div style={{ fontSize: 9, color: MUTED }}>{r.subtitle}</div> : undefined} />
      {r.sections.map((s, si) => (
        <div key={si} style={{ marginBottom: '5mm', breakInside: 'avoid-page' }}>
          {s.title && <div style={{ fontWeight: 700, fontSize: 10.5, margin: '0 0 1.5mm' }}>{s.title}</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {s.head.map((h, i) => (
                  <th key={h} style={{ ...th, ...al(s, i) }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((v, i) => (
                    <td key={i} style={{ ...cell, ...al(s, i) }}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
              {s.foot && (
                <tr>
                  {s.foot.map((v, i) => (
                    <td key={i} style={{ ...cell, ...al(s, i), fontWeight: 700, background: '#F8F9FA' }}>
                      {v}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
      <div style={{ textAlign: 'center', color: FAINT, fontSize: 7.5 }}>Generated {stamp(generatedAt)}</div>
    </div>
  );
}

const A4_PORTRAIT = PAGES.requestSlip;
export function printTableReport(company: CompanyBlock, r: TableReport) {
  return printHtml({ title: r.title, page: A4_PORTRAIT, marginMm: 10, css: 'html, body { width: auto; min-height: 0; }', bodyHtml: renderToStaticMarkup(<ReportDocument company={company} r={r} generatedAt={new Date().toISOString()} />) });
}

/** The same report as WhatsApp text, one line per row. Long reports are cut at 60 rows. */
export function shareTableReport(r: TableReport) {
  const lines = [`*Strandply LLP*`, `*${r.title}*`, r.subtitle ? `_${r.subtitle}_` : '', ''];
  let n = 0;
  for (const s of r.sections) {
    if (s.title) lines.push(`*${s.title}*`);
    for (const row of s.rows) {
      if (n++ >= 60) break;
      lines.push(row.join('  |  '));
    }
    if (s.foot) lines.push(`*${s.foot.filter((x) => x !== '').join('  |  ')}*`);
    lines.push('');
  }
  if (n > 60) lines.push(`… ${n - 60} more rows: see the printed report.`);
  openWhatsApp(lines.join('\n'));
}
