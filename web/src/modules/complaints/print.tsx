import { renderToStaticMarkup } from 'react-dom/server';
import { PAGES, printHtml } from '@/lib/print';
import { fetchComplaintPrint, fileUrl } from './api';
import { d, stamp } from './ui';

// Inline styles only: this renders in a bare iframe without the app's CSS.
const INK = '#172033';
const MUTED = '#667085';
const FAINT = '#98A2B3';
const RED = '#D71920';
const LINE = '#E6E8EC';

/** Customer complaint report on A4: details, description, photo evidence, the case timeline, sign-offs (legacy buildComplaintPdf). */
export async function printComplaint(id: string) {
  const { company, complaint: c, generatedAt } = await fetchComplaintPrint(id);
  const h4 = { fontSize: 7.5, fontWeight: 700, color: RED, textTransform: 'uppercase' as const, letterSpacing: 0.6, borderBottom: `1px solid ${LINE}`, paddingBottom: '1mm', margin: '4mm 0 2mm' };
  const kv = (k: string, v: string | null) => (
    <div>
      <div style={{ fontSize: 7, color: FAINT, textTransform: 'uppercase', letterSpacing: 0.4 }}>{k}</div>
      <div style={{ fontWeight: 600 }}>{v || '—'}</div>
    </div>
  );
  const photos = c.photos;
  await printHtml({
    page: PAGES.requestSlip,
    marginMm: 14,
    css: 'html, body { width: auto; min-height: 0; }',
    title: c.complaintNo,
    bodyHtml: renderToStaticMarkup(
      <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 9.5, color: INK }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `2.5px solid ${RED}`, paddingBottom: '2mm', marginBottom: '3mm' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: RED }}>{company.name}</div>
            <div style={{ fontSize: 8.5, color: MUTED }}>{[company.city, company.phone].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: 0.6 }}>Customer complaint report</div>
            <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'monospace' }}>{c.complaintNo}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2mm', background: '#FFF5F5', border: `1px solid ${LINE}`, borderRadius: 4, padding: '2mm 3mm' }}>
          {kv('Date', d(c.date))}
          {kv('Salesman', c.salesman)}
          {kv('Priority', c.priority)}
          {kv('Status', c.status)}
        </div>
        <div style={h4}>Customer details</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2mm' }}>
          {kv('Customer', c.customerName)}
          {kv('Contact', c.customerPhone)}
          {kv('Location', c.customerLocation)}
          {kv('Invoice', c.invoiceNo)}
        </div>
        <div style={h4}>Complaint information</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2mm', marginBottom: '2mm' }}>
          {kv('Material', c.material)}
          {kv('Category', c.category)}
          {kv('Notified', [c.recipientName, c.recipientEmail].filter(Boolean).join(' · '))}
          {kv('Resolved on', c.resolvedOn ? d(c.resolvedOn) : null)}
        </div>
        <div style={{ whiteSpace: 'pre-wrap' }}>{c.description}</div>
        {photos.length > 0 && (
          <>
            <div style={h4}>Photo evidence ({photos.length})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2mm' }}>
              {photos.map((p) => (
                <img key={p.id} src={fileUrl(c.id, p.id)} alt={p.name} style={{ width: '100%', height: '42mm', objectFit: 'cover', borderRadius: 3, border: `1px solid ${LINE}` }} />
              ))}
            </div>
          </>
        )}
        <div style={h4}>Case timeline ({c.timeline.length} entries)</div>
        {c.timeline.map((e) => (
          <div key={e.id} style={{ borderLeft: `2px solid ${LINE}`, paddingLeft: '3mm', marginBottom: '2mm', breakInside: 'avoid' }}>
            <div style={{ fontSize: 8, color: FAINT }}>
              <b style={{ color: INK }}>{e.byName}</b> · {stamp(e.at)}
            </div>
            {e.text && <div style={{ whiteSpace: 'pre-wrap' }}>{e.text}</div>}
            {e.files.some((f) => f.kind === 'photo') && (
              <div style={{ display: 'flex', gap: '1.5mm', marginTop: '1mm' }}>
                {e.files
                  .filter((f) => f.kind === 'photo')
                  .map((f) => (
                    <img key={f.id} src={fileUrl(c.id, f.id)} alt={f.name} style={{ width: '28mm', height: '20mm', objectFit: 'cover', borderRadius: 2 }} />
                  ))}
              </div>
            )}
            {e.files.some((f) => f.kind === 'video') && <div style={{ fontSize: 8, color: MUTED }}>{e.files.filter((f) => f.kind === 'video').length} video(s) — in the app</div>}
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6mm', marginTop: '12mm', fontSize: 8.5, color: MUTED }}>
          {[
            ['Reported by (salesman)', c.salesman],
            ['Notified to', c.recipientName],
            ['Status', c.status],
          ].map(([k, v]) => (
            <div key={k} style={{ borderTop: `1px solid ${INK}`, paddingTop: '1mm' }}>
              <div>{k}</div>
              <div style={{ fontWeight: 700, color: INK }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '5mm', textAlign: 'center', color: FAINT, fontSize: 7.5 }}>
          {company.name} complaint register · Generated {stamp(generatedAt)} · Confidential
        </div>
      </div>,
    ),
  });
}
