import { renderToStaticMarkup } from 'react-dom/server';
import type { CompanyBlock, CourierLabel, ReportPrint, RequestSlip } from '@contracts/sampletrack';
import { formatAmount, formatDate } from '@/lib/format';
import { printHtml } from '@/lib/print';
import { qrSvg } from '@/lib/qr';
import { fetchCourierLabel, fetchReportPrint, fetchRequestSlip } from '../api';

// Print documents use inline styles and plain HTML: they render in a bare iframe without the app's CSS.
const INK = '#172033';
const MUTED = '#667085';
const FAINT = '#98A2B3';
const RED = '#D71920';
const LINE = '#E6E8EC';

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    .format(new Date(iso))
    .replace(/\bSep\b/, 'Sept');
const d = (iso: string | null) => (iso ? formatDate(iso) : '—');

function CompanyHeader({ c, right }: { c: CompanyBlock; right: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2.5px solid ${RED}`, paddingBottom: '4mm', marginBottom: '6mm' }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: RED }}>{c.name}</div>
        {c.city && <div style={{ fontSize: 11, color: MUTED }}>{c.city}</div>}
        {c.phone && <div style={{ fontSize: 11, color: MUTED }}>Ph: {c.phone}</div>}
        {(c.llpin || c.gst) && <div style={{ fontSize: 10, color: FAINT }}>{[c.llpin && `LLPIN: ${c.llpin}`, c.gst && `GSTIN: ${c.gst}`].filter(Boolean).join(' · ')}</div>}
      </div>
      <div style={{ textAlign: 'right' }}>{right}</div>
    </div>
  );
}

const box: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 4, padding: '4mm' };
const boxTitle: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: '2.5mm' };
const kv = (k: string, v: React.ReactNode, strong = false) => (
  <tr>
    <td style={{ color: MUTED, padding: '1.5px 0', width: '42%' }}>{k}</td>
    <td style={{ fontWeight: strong ? 700 : 500 }}>{v}</td>
  </tr>
);

/** A4 sample request slip (legacy previewRequestSlip). */
export function SlipDocument({ slip }: { slip: RequestSlip }) {
  const r = slip.request;
  const p = slip.party;
  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 12, color: INK, padding: '12mm 14mm' }}>
      <CompanyHeader
        c={slip.company}
        right={
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>Sample request slip</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{r.reqNo}</div>
            <div style={{ display: 'inline-block', marginTop: 3, padding: '2px 10px', borderRadius: 99, background: '#F5F6F8', fontSize: 11, fontWeight: 700 }}>{r.status}</div>
          </>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5mm', marginBottom: '5mm' }}>
        <div style={box}>
          <div style={boxTitle}>Request details</div>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <tbody>
              {kv('Request date', d(r.date))}
              {kv('Raised at', dateTime(r.createdAt))}
              {kv('Required by', d(r.requiredDispatchDate))}
              {kv('Priority', <span style={{ color: r.highPriority ? RED : INK, fontWeight: 700 }}>{r.priority}</span>)}
              {kv('Purpose', r.purpose ?? '—')}
              {kv('Requested by', r.requestedByName ?? '—')}
            </tbody>
          </table>
        </div>
        <div style={box}>
          <div style={boxTitle}>Party / customer</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
          {p.contact && <div style={{ fontSize: 11, color: MUTED }}>Contact: {p.contact}</div>}
          {p.mobile && <div style={{ fontSize: 11, color: MUTED }}>Ph: {p.mobile}</div>}
          {p.email && <div style={{ fontSize: 11, color: MUTED }}>Email: {p.email}</div>}
          {(p.address || p.city) && (
            <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>
              {[p.address, p.city, p.state].filter(Boolean).join(', ')}
              {p.pin ? ` — ${p.pin}` : ''}
            </div>
          )}
          {p.gst && <div style={{ fontSize: 10, color: FAINT, marginTop: 2 }}>GSTIN: {p.gst}</div>}
        </div>
      </div>
      <div style={boxTitle}>Products requested</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: '5mm' }}>
        <thead>
          <tr style={{ background: '#F8F9FA', textAlign: 'left' }}>
            {['#', 'Product', 'Board', 'Thickness', 'Size', 'Quantity'].map((h, i) => (
              <th key={h} style={{ padding: '6px 8px', borderBottom: `1px solid ${LINE}`, textAlign: i === 5 ? 'right' : 'left', fontSize: 10, color: MUTED, textTransform: 'uppercase' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slip.items.map((i) => (
            <tr key={i.lineNo} style={{ borderBottom: `1px solid ${LINE}` }}>
              <td style={{ padding: '5px 8px', color: FAINT }}>{i.lineNo}</td>
              <td style={{ padding: '5px 8px', fontWeight: 600 }}>{i.productName}</td>
              <td style={{ padding: '5px 8px' }}>{i.board ?? '—'}</td>
              <td style={{ padding: '5px 8px' }}>{i.thickness ?? '—'}</td>
              <td style={{ padding: '5px 8px' }}>{i.size ?? '—'}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700 }}>{i.qty ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.remarks && (
        <div style={{ marginBottom: '5mm', padding: '3mm 4mm', background: '#FFF7F7', borderLeft: `3px solid ${RED}` }}>
          <div style={boxTitle}>Remarks</div>
          <div style={{ fontSize: 11 }}>{r.remarks}</div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6mm', marginTop: '10mm' }}>
        {slip.signatures.map((s) => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ height: '12mm', borderBottom: `1px solid ${FAINT}`, marginBottom: 3, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontSize: 10, color: MUTED }}>
              {s.name ?? ''}
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: MUTED }}>{s.label}</div>
            <div style={{ fontSize: 10, color: FAINT }}>({s.role})</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '6mm', paddingTop: '3mm', borderTop: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: FAINT }}>
        <span>{slip.approvedBy ? `Approved by ${slip.approvedBy.name ?? '—'} · ${dateTime(slip.approvedBy.at)}` : r.status === 'Pending' ? 'Not yet approved' : 'Approver not recorded'}</span>
        <span>Printed {dateTime(slip.printedAt)}</span>
      </div>
    </div>
  );
}

/** A5 landscape courier label (legacy buildLabelHTML). The QR is drawn locally. */
export function LabelDocument({ label, qr }: { label: CourierLabel; qr: string }) {
  const f = label.from;
  const t = label.to;
  const x = label.dispatch;
  const meta: [string, string | null][] = [
    ['Dispatch ID', x.dspNo],
    ['Date', d(x.date)],
    ['Exp. delivery', x.expectedDeliveryDate ? d(x.expectedDeliveryDate) : null],
    ['Tracking', x.trackingNo],
    ['Courier', x.courierName],
    ['Vehicle', x.vehicleNo],
    ['Dimensions', x.dimensions],
  ];
  return (
    <div style={{ width: '210mm', height: '148mm', border: '2px solid #000', display: 'flex', fontFamily: 'Arial, sans-serif', color: '#111', boxSizing: 'border-box' }}>
      <div style={{ width: '38%', borderRight: '2px solid #000', padding: '6mm', display: 'flex', flexDirection: 'column' }}>
        <div style={{ borderBottom: '1px solid #000', paddingBottom: '4mm', marginBottom: '4mm' }}>
          <div style={{ fontSize: 8, color: '#888', fontWeight: 700, letterSpacing: 0.8 }}>FROM</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: RED }}>{f.name}</div>
          {f.city && <div style={{ fontSize: 9, color: '#444' }}>{f.city}</div>}
          {f.phone && <div style={{ fontSize: 9, color: '#444' }}>Ph: {f.phone}</div>}
          {f.llpin && <div style={{ fontSize: 8, color: '#999' }}>LLPIN: {f.llpin}</div>}
        </div>
        <div style={{ marginBottom: '3mm' }}>
          <span style={{ background: RED, color: '#fff', padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700 }}>{x.mode.toUpperCase()}</span>
        </div>
        <table style={{ fontSize: 9, borderCollapse: 'collapse' }}>
          <tbody>
            {meta
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <tr key={k}>
                  <td style={{ color: '#888', paddingRight: 8, verticalAlign: 'top' }}>{k}</td>
                  <td style={{ fontWeight: 700, fontFamily: k === 'Tracking' || k === 'Dispatch ID' ? 'monospace' : undefined, color: k === 'Tracking' ? RED : '#111' }}>{v}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {x.contents && (
          <div style={{ marginTop: '3mm', borderTop: '1px dashed #ccc', paddingTop: '2mm' }}>
            <div style={{ fontSize: 7, color: '#888', fontWeight: 700 }}>CONTENTS</div>
            <div style={{ fontSize: 9 }}>{x.contents}</div>
          </div>
        )}
        <div style={{ marginTop: 'auto' }} dangerouslySetInnerHTML={{ __html: qr.replace('<svg', '<svg width="72" height="72"') }} />
      </div>
      <div style={{ flex: 1, padding: '6mm', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 8, color: '#888', fontWeight: 700, letterSpacing: 0.8, marginBottom: '3mm' }}>DELIVER TO</div>
        <div style={{ fontSize: 20, fontWeight: 800, borderBottom: `2.5px solid ${RED}`, paddingBottom: '2mm', marginBottom: '3mm' }}>{t.name}</div>
        {t.contact && <div style={{ fontSize: 11 }}>Attn: <strong>{t.contact}</strong></div>}
        {t.mobile && <div style={{ fontSize: 12, fontWeight: 700, marginBottom: '2mm' }}>Ph: {t.mobile}</div>}
        <div style={{ fontSize: 12, lineHeight: 1.7, borderLeft: `4px solid ${RED}`, paddingLeft: 6, marginTop: '2mm' }}>
          {t.address && <div>{t.address}</div>}
          {t.cityState && <div>{t.cityState}</div>}
          {t.pin && <div style={{ fontSize: 14, fontWeight: 800 }}>PIN: {t.pin}</div>}
        </div>
        {t.email && <div style={{ fontSize: 9, color: '#666', marginTop: '3mm' }}>{t.email}</div>}
        <div style={{ marginTop: 'auto', paddingTop: '3mm', borderTop: '1px dashed #ccc', fontSize: 9, color: '#888' }}>
          Status: <strong style={{ color: '#16A34A' }}>{x.status}</strong>
        </div>
      </div>
    </div>
  );
}

const cell = (v: string | number | null, type: string) =>
  v === null || v === undefined || v === '' ? '—' : type === 'money' && typeof v === 'number' ? formatAmount(v / 100) : type === 'percent' ? `${v}%` : type === 'date' && typeof v === 'string' ? formatDate(v) : String(v);

/** A4 landscape report print (all tables, summary and filters). */
export function ReportDocument({ data }: { data: ReportPrint }) {
  const r = data.report;
  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 11, color: INK, padding: '10mm 12mm' }}>
      <CompanyHeader
        c={data.company}
        right={
          <>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{r.title}</div>
            <div style={{ fontSize: 10, color: MUTED }}>
              {r.filters.dateFrom ? d(r.filters.dateFrom) : 'Start'} – {r.filters.dateTo ? d(r.filters.dateTo) : 'today'}
              {r.filters.partyName ? ` · ${r.filters.partyName}` : ''}
              {r.filters.courierName ? ` · ${r.filters.courierName}` : ''}
            </div>
          </>
        }
      />
      <div style={{ display: 'flex', gap: '6mm', marginBottom: '5mm' }}>
        {r.summary.map((s) => (
          <div key={s.label} style={{ ...box, minWidth: '40mm' }}>
            <div style={{ fontSize: 9, color: FAINT, textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{cell(s.value, s.type)}</div>
          </div>
        ))}
      </div>
      {r.tables.map((t) => (
        <div key={t.name} style={{ marginBottom: '6mm' }}>
          {r.tables.length > 1 && <div style={boxTitle}>{t.title}</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8F9FA' }}>
                {t.columns.map((c) => (
                  <th key={c.key} style={{ padding: '5px 6px', borderBottom: `1px solid ${LINE}`, textAlign: c.type === 'text' || c.type === 'date' ? 'left' : 'right', fontSize: 9, color: MUTED, textTransform: 'uppercase' }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...t.rows, ...(t.totals ? [t.totals] : [])].map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${LINE}`, fontWeight: t.totals && i === t.rows.length ? 700 : 400 }}>
                  {t.columns.map((c) => (
                    <td key={c.key} style={{ padding: '4px 6px', textAlign: c.type === 'text' || c.type === 'date' ? 'left' : 'right' }}>
                      {cell(row[c.key] ?? null, c.type)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div style={{ fontSize: 9, color: FAINT, textAlign: 'right' }}>Printed {dateTime(data.printedAt)}</div>
    </div>
  );
}

export async function printRequestSlip(requestId: string) {
  const slip = await fetchRequestSlip(requestId);
  await printHtml({ title: `Request slip ${slip.request.reqNo}`, page: slip.page, bodyHtml: renderToStaticMarkup(<SlipDocument slip={slip} />) });
}

export async function printCourierLabel(dispatchId: string) {
  const label = await fetchCourierLabel(dispatchId);
  const qr = await qrSvg(label.qrPayload);
  await printHtml({ title: `Label ${label.dispatch.dspNo}`, page: label.page, bodyHtml: renderToStaticMarkup(<LabelDocument label={label} qr={qr} />) });
}

export async function printReport(...args: Parameters<typeof fetchReportPrint>) {
  const data = await fetchReportPrint(...args);
  await printHtml({ title: data.report.title, page: data.page, bodyHtml: renderToStaticMarkup(<ReportDocument data={data} />) });
}
