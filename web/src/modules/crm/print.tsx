import { renderToStaticMarkup } from 'react-dom/server';
import { PAGES, printHtml } from '@/lib/print';
import { fetchQuotationPrint } from './api';
import { d, inr, stamp } from './ui';

// Inline styles only: this renders in a bare iframe without the app's CSS.
const INK = '#172033';
const MUTED = '#667085';
const FAINT = '#98A2B3';
const RED = '#D71920';
const LINE = '#E6E8EC';

/** Quotation on A4 (legacy printQuotation). */
export async function printQuotation(id: string) {
  const { company, quotation: q, customer: c, generatedAt } = await fetchQuotationPrint(id);
  const td = { padding: '2mm', borderBottom: `1px solid ${LINE}` };
  const num = { ...td, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' };
  await printHtml({
    page: PAGES.requestSlip,
    marginMm: 14,
    css: 'html, body { width: auto; min-height: 0; } table { border-collapse: collapse; }',
    title: q.quoteNo,
    bodyHtml: renderToStaticMarkup(
      <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 10, color: INK }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `2.5px solid ${RED}`, paddingBottom: '2mm', marginBottom: '5mm' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: RED }}>{company.name}</div>
            <div style={{ fontSize: 9, color: MUTED }}>{[company.city, company.phone, company.gst && `GSTIN ${company.gst}`].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: 0.6 }}>Quotation</div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{q.quoteNo}</div>
            <div style={{ fontSize: 8.5, color: FAINT }}>
              {d(q.date)}
              {q.validUntil ? ` · valid until ${d(q.validUntil)}` : ''}
            </div>
          </div>
        </div>
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 4, padding: '3mm', marginBottom: '5mm' }}>
          <div style={{ fontSize: 7.5, color: FAINT, textTransform: 'uppercase', letterSpacing: 0.4 }}>To</div>
          <div style={{ fontWeight: 700, fontSize: 11 }}>{q.customerName}</div>
          {c?.contactPerson && <div>Kind attn: {c.contactPerson}</div>}
          {c?.address && <div style={{ color: MUTED }}>{c.address}</div>}
          <div style={{ color: MUTED }}>{[c?.city, c?.state, c?.pincode].filter(Boolean).join(', ')}</div>
          <div style={{ color: MUTED }}>{[c?.mobile && `Mobile ${c.mobile}`, c?.gstin && `GSTIN ${c.gstin}`].filter(Boolean).join(' · ')}</div>
        </div>
        <table style={{ width: '100%', marginBottom: '4mm' }}>
          <thead>
            <tr style={{ background: '#F7F8FA', color: MUTED, fontSize: 8, textTransform: 'uppercase' }}>
              <th style={{ ...td, textAlign: 'left' }}>Product</th>
              <th style={num}>Quantity</th>
              <th style={num}>Rate</th>
              <th style={num}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}>{q.product}</td>
              <td style={num}>{q.quantity}</td>
              <td style={num}>{inr(q.ratePaise)}</td>
              <td style={num}>{inr(q.totalPaise)}</td>
            </tr>
            <tr>
              <td style={td} colSpan={3}>
                GST @ {q.gstPct}%
              </td>
              <td style={num}>{inr(q.gstPaise)}</td>
            </tr>
            <tr style={{ fontWeight: 800, fontSize: 11 }}>
              <td style={td} colSpan={3}>
                Net payable
              </td>
              <td style={num}>{inr(q.finalPaise)}</td>
            </tr>
          </tbody>
        </table>
        {q.remarks && (
          <div style={{ marginBottom: '4mm' }}>
            <div style={{ fontSize: 7.5, color: FAINT, textTransform: 'uppercase' }}>Terms</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{q.remarks}</div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16mm', fontSize: 9 }}>
          <span style={{ color: MUTED }}>{q.salesperson ? `Salesperson: ${q.salesperson}` : ''}</span>
          <span style={{ borderTop: `1px solid ${INK}`, paddingTop: '1mm', color: MUTED }}>For {company.name}</span>
        </div>
        <div style={{ marginTop: '5mm', textAlign: 'center', color: FAINT, fontSize: 7.5 }}>Generated {stamp(generatedAt)}</div>
      </div>,
    ),
  });
}
