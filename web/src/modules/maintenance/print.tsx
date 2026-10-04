import { renderToStaticMarkup } from 'react-dom/server';
import { PAGES, printHtml } from '@/lib/print';
import { fetchWorkOrderPrint } from './api';
import { d, stamp } from './ui';

// Inline styles only: this renders in a bare iframe without the app's CSS.
const INK = '#172033';
const MUTED = '#667085';
const FAINT = '#98A2B3';
const RED = '#D71920';
const LINE = '#E6E8EC';

/** Work order on A4 with its timeline and signature lines (legacy generatePDF). */
export async function printWorkOrder(id: string) {
  const { company, workOrder: w, generatedAt } = await fetchWorkOrderPrint(id);
  const label = { fontSize: 7.5, color: FAINT, textTransform: 'uppercase' as const, letterSpacing: 0.5 };
  const tag = (s: string, color = MUTED) => <span style={{ fontSize: 8, fontWeight: 700, color, border: `1px solid ${LINE}`, borderRadius: 3, padding: '0.5mm 2mm', marginRight: '1.5mm', textTransform: 'uppercase' }}>{s}</span>;
  await printHtml({
    page: PAGES.requestSlip,
    marginMm: 14,
    css: 'html, body { width: auto; min-height: 0; }',
    title: w.woNo,
    bodyHtml: renderToStaticMarkup(
      <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 10, color: INK }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `2.5px solid ${RED}`, paddingBottom: '2mm', marginBottom: '4mm' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: RED }}>{company.name}</div>
            <div style={{ fontSize: 9, color: MUTED }}>Maintenance work order</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, alignSelf: 'center' }}>{w.woNo}</div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: '2mm' }}>{w.title}</div>
        <div style={{ marginBottom: '4mm' }}>
          {tag(w.priority, w.priority === 'Critical' ? RED : MUTED)}
          {tag(w.status)}
          {tag(w.category)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3mm 8mm', borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, padding: '3mm 0', marginBottom: '4mm' }}>
          {[
            ['Assigned to', w.assignee],
            ['Plant area', w.area],
            ['Raised', stamp(w.createdAt)],
            ['Due date', d(w.dueDate)],
            ...(w.completedOn ? [['Completed on', d(w.completedOn)]] : []),
          ].map(([k, v]) => (
            <div key={k}>
              <div style={label}>{k}</div>
              <div style={{ fontWeight: 700 }}>{v}</div>
            </div>
          ))}
        </div>
        {w.description && (
          <div style={{ marginBottom: '3mm' }}>
            <div style={label}>Description</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{w.description}</div>
          </div>
        )}
        {w.notes && (
          <div style={{ marginBottom: '3mm' }}>
            <div style={label}>Notes / remarks</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{w.notes}</div>
          </div>
        )}
        <div style={{ ...label, marginTop: '3mm', marginBottom: '1.5mm' }}>Activity timeline</div>
        {[...w.timeline].reverse().map((e) => (
          <div key={e.id} style={{ borderLeft: `2px solid ${LINE}`, paddingLeft: '3mm', marginBottom: '2mm' }}>
            <div style={{ fontWeight: 600 }}>{e.text}</div>
            <div style={{ fontSize: 8, color: FAINT }}>
              {e.byName} · {stamp(e.at)}
            </div>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6mm', marginTop: '16mm', fontSize: 9, color: MUTED }}>
          {['Raised by', 'Assigned technician', 'Approved by'].map((s) => (
            <div key={s} style={{ borderTop: `1px solid ${INK}`, paddingTop: '1mm' }}>
              <div style={{ fontWeight: 700, color: INK }}>{s}</div>
              Signature & date
            </div>
          ))}
        </div>
        <div style={{ marginTop: '5mm', textAlign: 'center', color: FAINT, fontSize: 7.5 }}>
          {company.name} — Maintenance work tracker · Generated {stamp(generatedAt)}
        </div>
      </div>,
    ),
  });
}
