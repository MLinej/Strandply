import { renderToStaticMarkup } from 'react-dom/server';
import type { VendorView } from '@contracts/vendors';
import { formatDateTime } from '@/lib/format';
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
  const dash = (x: string | number | null | undefined) => (x === null || x === undefined || x === '' ? '—' : String(x));
  const groups: [string, [string, string][]][] = [
    [
      'Basic info',
      [
        ['Vendor name', v.name],
        ['Vendor code', v.code],
        ['Type', dash(v.type)],
        ['Year established', dash(v.yearEstablished)],
        ['Categories', v.categories.map((c) => c.name).join(', ') || '—'],
        ['Rating', v.rating ? `${'★'.repeat(v.rating)}${'☆'.repeat(5 - v.rating)}` : '—'],
      ],
    ],
    [
      'Contact',
      [
        ['Contact person', [v.contact, v.designation].filter(Boolean).join(', ') || '—'],
        ['Phone', dash(v.phone)],
        ['Email', dash(v.email)],
        ['Website', dash(v.website)],
        ['Address', [v.address, v.city, v.state].filter(Boolean).join(', ') + (v.pincode ? ` — ${v.pincode}` : '') || '—'],
      ],
    ],
    [
      'Tax & terms',
      [
        ['GSTIN', dash(v.gst)],
        ['PAN', dash(v.pan)],
        ['MSME / Udyam', dash(v.msme)],
        ['Payment terms', dash(v.paymentTerms)],
      ],
    ],
    [
      'Bank details',
      [
        ['Bank', dash(v.bank)],
        ['Branch', dash(v.branch)],
        ['Account number', dash(v.accountNo)],
        ['IFSC', dash(v.ifsc)],
      ],
    ],
    ['Products supplied', [['Products', v.products.map((p) => p.name).join(', ') || '—']]],
    ...(v.documents.length ? ([['Documents on file', [['Documents', v.documents.map((d) => d.type).filter((t, i, a) => a.indexOf(t) === i).join(', ')]]]] as [string, [string, string][]][]) : []),
    [
      'Approval',
      [
        ['Status', STATUS_LABEL[v.status]],
        ['Added', [v.createdAt && formatDateTime(v.createdAt), v.createdByName].filter(Boolean).join(' · ') || '—'],
        ['Approved', [v.approvedAt && formatDateTime(v.approvedAt), v.approvedByName].filter(Boolean).join(' · ') || '—'],
        ['Activated', [v.activatedAt && formatDateTime(v.activatedAt), v.activatedByName].filter(Boolean).join(' · ') || '—'],
      ],
    ],
  ];
  const cell = { padding: '1.8mm 0', borderBottom: '1px solid #F2F4F7', verticalAlign: 'top' } as const;
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 6, padding: '5mm 6mm', marginBottom: '5mm', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '4mm', marginBottom: '3mm' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: INK, lineHeight: 1.25 }}>{v.name}</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
            {v.code}
            {v.type ? ` · ${v.type}` : ''}
          </div>
        </div>
        <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700, background: bg, color: fg, whiteSpace: 'nowrap' }}>{STATUS_LABEL[v.status]}</span>
      </div>
      <div style={{ marginBottom: '3mm' }}>
        {v.categories.map((c) => (
          <span key={c.id} style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, marginRight: 4, background: CATEGORY_STYLE[c.color].bg, color: CATEGORY_STYLE[c.color].fg }}>
            {c.name}
          </span>
        ))}
      </div>
      {groups.map(([title, rows]) => (
        <div key={title} style={{ marginBottom: '3mm', breakInside: 'avoid' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: 0.6, borderBottom: `1.5px solid ${LINE}`, paddingBottom: '1mm', marginBottom: '0.5mm' }}>{title}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <tbody>
              {rows.map(([k, val]) => (
                <tr key={k}>
                  <td style={{ ...cell, color: MUTED, fontWeight: 600, width: '45mm' }}>{k}</td>
                  <td style={cell}>{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {v.status === 'blacklisted' && v.blacklistReason && <div style={{ marginTop: '2mm', fontSize: 13, color: RED }}>Blacklisted: {v.blacklistReason}</div>}
      {v.notes && <div style={{ marginTop: '2mm', fontSize: 13, color: MUTED, fontStyle: 'italic' }}>Notes: {v.notes}</div>}
    </div>
  );
}

/** A4 vendor directory or single vendor card (legacy downloadVendorPDF). */
export function VendorDocument({ data, title }: { data: VendorPrintPayload; title: string }) {
  const c = data.company;
  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 13.5, color: INK }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2.5px solid ${RED}`, paddingBottom: '4mm', marginBottom: '6mm' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: RED }}>{c.name}</div>
          {c.city && <div style={{ fontSize: 12.5, color: MUTED }}>{c.city}</div>}
          {(c.llpin || c.gst) && <div style={{ fontSize: 11.5, color: FAINT }}>{[c.llpin && `LLPIN: ${c.llpin}`, c.gst && `GSTIN: ${c.gst}`].filter(Boolean).join(' · ')}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: 0.8 }}>{title}</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3 }}>Generated {formatDateTime(data.generatedAt)}</div>
          <div style={{ fontSize: 11.5, color: FAINT }}>
            {data.vendors.length} vendor{data.vendors.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>
      {data.vendors.map((v) => (
        <VendorCard key={v.id} v={v} />
      ))}
      <div style={{ marginTop: '6mm', paddingTop: '3mm', borderTop: `1px solid ${LINE}`, fontSize: 11, color: FAINT, display: 'flex', justifyContent: 'space-between' }}>
        <span>{c.name} — Confidential</span>
        <span>Generated {formatDateTime(data.generatedAt)}</span>
      </div>
    </div>
  );
}

/** Prints one vendor (`id`) or every vendor matching the list filters. */
export async function printVendors(opts: { id?: string; query?: Omit<VendorQuery, 'page' | 'pageSize'> }) {
  const data = await fetchVendorPrint(opts.id, opts.query);
  const title = opts.id ? 'Vendor card' : 'Vendor directory';
  await printHtml({
    // The title is the saved PDF's file name.
    title: opts.id ? `Vendor card - ${data.vendors[0]?.name ?? 'Vendor'} - ${data.vendors[0]?.code ?? ''}` : 'Vendor directory',
    page: PAGES.requestSlip,
    // A directory runs to several pages: real page margins, so every page gets them, not only the first.
    marginMm: 12,
    css: 'html, body { width: auto; min-height: 0; }',
    bodyHtml: renderToStaticMarkup(<VendorDocument data={data} title={title} />),
  });
}
