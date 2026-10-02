import { renderToStaticMarkup } from 'react-dom/server';
import type { VendorView } from '@contracts/vendors';
import { formatDate } from '@/lib/format';
import { PAGES, printHtml } from '@/lib/print';
import { fetchVendorPrint, type VendorPrintPayload, type VendorQuery } from './api';
import { CATEGORY_STYLE, STATUS_LABEL } from './ui';

// Inline styles only: the document renders in a bare iframe without the app's CSS.
const INK = '#172033';
const MUTED = '#667085';
const FAINT = '#98A2B3';
const RED = '#D71920';
const LINE = '#E6E8EC';

const STATUS_COLORS: Record<VendorView['status'], [string, string]> = {
  pending: ['#FFFBEB', '#B45309'],
  approved: ['#F5F3FF', '#6D28D9'],
  active: ['#F0FDF4', '#15803D'],
  inactive: ['#F5F6F8', '#667085'],
  blacklisted: ['#FFF1F2', RED],
};

function VendorCard({ v }: { v: VendorView }) {
  const [bg, fg] = STATUS_COLORS[v.status];
  const rows: [string, string][] = [
    ['Contact', [v.contact, v.designation].filter(Boolean).join(', ') || '—'],
    ['Phone', v.phone ?? '—'],
    ['Email', v.email ?? '—'],
    ['City / State', [v.city, v.state].filter(Boolean).join(', ') || '—'],
    ['GSTIN', v.gst ?? '—'],
    ['Payment terms', v.paymentTerms ?? '—'],
    ['Products', v.products.map((p) => p.name).join(', ') || '—'],
  ];
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 6, padding: '4mm 5mm', marginBottom: '4mm', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{v.name}</div>
          <div style={{ fontSize: 10, color: FAINT, marginBottom: '2mm' }}>
            {v.code}
            {v.type ? ` · ${v.type}` : ''}
            {v.rating ? ` · ${'★'.repeat(v.rating)}` : ''}
          </div>
        </div>
        <span style={{ padding: '1px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: bg, color: fg }}>{STATUS_LABEL[v.status]}</span>
      </div>
      <div style={{ marginBottom: '2mm' }}>
        {v.categories.map((c) => (
          <span key={c.id} style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 99, fontSize: 9.5, fontWeight: 700, marginRight: 4, background: CATEGORY_STYLE[c.color].bg, color: CATEGORY_STYLE[c.color].fg }}>
            {c.name}
          </span>
        ))}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <tbody>
          {rows.map(([k, val]) => (
            <tr key={k}>
              <td style={{ color: MUTED, fontWeight: 600, width: '32mm', padding: '1.5mm 0', borderBottom: `1px solid #F2F4F7`, verticalAlign: 'top' }}>{k}</td>
              <td style={{ padding: '1.5mm 0', borderBottom: `1px solid #F2F4F7` }}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {v.status === 'blacklisted' && v.blacklistReason && <div style={{ marginTop: '2mm', fontSize: 10.5, color: RED }}>Blacklisted: {v.blacklistReason}</div>}
      {v.notes && <div style={{ marginTop: '2mm', fontSize: 10.5, color: MUTED, fontStyle: 'italic' }}>{v.notes}</div>}
    </div>
  );
}

/** A4 vendor directory or single vendor card (legacy downloadVendorPDF). */
export function VendorDocument({ data, title }: { data: VendorPrintPayload; title: string }) {
  const c = data.company;
  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 12, color: INK }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2.5px solid ${RED}`, paddingBottom: '4mm', marginBottom: '6mm' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: RED }}>{c.name}</div>
          {c.city && <div style={{ fontSize: 11, color: MUTED }}>{c.city}</div>}
          {(c.llpin || c.gst) && <div style={{ fontSize: 10, color: FAINT }}>{[c.llpin && `LLPIN: ${c.llpin}`, c.gst && `GSTIN: ${c.gst}`].filter(Boolean).join(' · ')}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: 0.8 }}>{title}</div>
          <div style={{ fontSize: 10, color: FAINT, marginTop: 3 }}>Generated {formatDate(data.generatedAt.slice(0, 10))}</div>
          <div style={{ fontSize: 10, color: FAINT }}>
            {data.vendors.length} vendor{data.vendors.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>
      {data.vendors.map((v) => (
        <VendorCard key={v.id} v={v} />
      ))}
      <div style={{ marginTop: '6mm', paddingTop: '3mm', borderTop: `1px solid ${LINE}`, fontSize: 9.5, color: FAINT, display: 'flex', justifyContent: 'space-between' }}>
        <span>{c.name} — Confidential</span>
        <span>{data.generatedAt.slice(0, 10)}</span>
      </div>
    </div>
  );
}

/** Prints one vendor (`id`) or every vendor matching the list filters. */
export async function printVendors(opts: { id?: string; query?: Omit<VendorQuery, 'page' | 'pageSize'> }) {
  const data = await fetchVendorPrint(opts.id, opts.query);
  const title = opts.id ? 'Vendor card' : 'Vendor directory';
  await printHtml({
    title: opts.id ? (data.vendors[0]?.name ?? 'Vendor') : 'Vendor directory',
    page: PAGES.requestSlip,
    // A directory runs to several pages: real page margins, so every page gets them, not only the first.
    marginMm: 12,
    css: 'html, body { width: auto; min-height: 0; }',
    bodyHtml: renderToStaticMarkup(<VendorDocument data={data} title={title} />),
  });
}
