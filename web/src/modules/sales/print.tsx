import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { PI_STATUS_LABEL, SO_STATUS_LABEL, type Customer, type ProformaView, type ReportResult, type SalesInvoiceView, type SalesOrderView } from '@contracts/sales';
import type { CompanyBlock } from '@contracts/sampletrack';
import { formatDate } from '@/lib/format';
import { dueDate, InvoiceDocument, stateWithCode, type InvoiceLineRow, type InvoiceParty } from '@/lib/invoice-print';
import { PAGES, printHtml } from '@/lib/print';
import { KIT_CSS } from '@/lib/print-kit';
import { fetchPrint, type DocPath } from './api';
import { inr, qtyFmt, sqmFmt, stamp } from './ui';

// Inline styles only: these render in a bare iframe without the app's CSS.
const INK = '#172033';
const MUTED = '#667085';
const FAINT = '#98A2B3';
const RED = '#D71920';
const LINE = '#E6E8EC';
const SOFT = '#F7F8FA';

type Cell = string | number | null | undefined;
const d = (x: string | null | undefined) => (x ? formatDate(x) : '—');
const v = (x: Cell) => (x === null || x === undefined || x === '' ? '—' : String(x));
const A4 = { page: PAGES.requestSlip, marginMm: 12, css: 'html, body { width: auto; min-height: 0; } table { border-collapse: collapse; }' };

function Letterhead({ company, title, no, sub }: { company: CompanyBlock; title: string; no: string; sub: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2.5px solid ${RED}`, paddingBottom: '2mm', marginBottom: '3mm' }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800, color: RED }}>{company.name}</div>
        <div style={{ fontSize: 9, color: MUTED }}>{[company.city, company.phone, company.gst && `GSTIN ${company.gst}`, company.llpin && `LLPIN ${company.llpin}`].filter(Boolean).join(' · ')}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</div>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{no}</div>
        <div style={{ fontSize: 8.5, color: FAINT }}>{sub}</div>
      </div>
    </div>
  );
}

function Fields({ fields, cols = 3 }: { fields: [string, Cell][]; cols?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '2mm 5mm', marginBottom: '3mm' }}>
      {fields.map(([k, x]) => (
        <div key={k}>
          <div style={{ fontSize: 7.5, color: FAINT, textTransform: 'uppercase', letterSpacing: 0.4 }}>{k}</div>
          <div style={{ fontWeight: 600 }}>{v(x)}</div>
        </div>
      ))}
    </div>
  );
}

interface Table {
  head: string[];
  numeric?: number[];
  rows: Cell[][];
  foot?: Cell[];
}
function TableBlock({ t }: { t: Table }) {
  const th = (i: number) => ({ textAlign: (t.numeric?.includes(i) ? 'right' : 'left') as 'right' | 'left', padding: '1.5mm 2mm', fontSize: 8, color: MUTED, textTransform: 'uppercase' as const, letterSpacing: 0.3, background: SOFT, borderBottom: `1px solid ${LINE}` });
  const td = (i: number, strong = false) => ({ textAlign: (t.numeric?.includes(i) ? 'right' : 'left') as 'right' | 'left', padding: '1.5mm 2mm', borderBottom: `1px solid ${LINE}`, fontWeight: strong ? 700 : 400, fontVariantNumeric: 'tabular-nums' });
  return (
    <table style={{ width: '100%', marginBottom: '3mm' }}>
      <thead>
        <tr>
          {t.head.map((h, i) => (
            <th key={i} style={th(i)}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {t.rows.map((r, j) => (
          <tr key={j}>
            {r.map((c, i) => (
              <td key={i} style={td(i)}>
                {v(c)}
              </td>
            ))}
          </tr>
        ))}
        {t.foot && (
          <tr>
            {t.foot.map((c, i) => (
              <td key={i} style={td(i, true)}>
                {c ?? ''}
              </td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** A party block: address, city / pincode, state with its GST code, GSTIN. */
function partyBlock(title: string, name: string, c: Customer | null): InvoiceParty {
  return {
    title,
    name,
    lines: [c?.address, [c?.city, c?.pincode].filter(Boolean).join(', ') || null, stateWithCode(c?.state, c?.gstin), c?.gstin ? `GSTIN ${c.gstin}` : null],
  };
}

const A4_PAGE_H = 297 - 24 - 2;

/** Proforma, sales order or tax invoice on A4, in the tax invoice format (legacy printPiPdf / printSalesOrderPdf / printInvoicePdf). */
export async function printSalesDoc(path: DocPath, id: string) {
  const data = await fetchPrint(path, id);
  const { no, body } = salesDocument(path, data);
  await printHtml({ page: PAGES.requestSlip, marginMm: 12, css: KIT_CSS, title: no.replace(/\//g, '-'), bodyHtml: renderToStaticMarkup(body) });
}

/** The printed document for a proforma, order or invoice payload. */
export function salesDocument(path: DocPath, data: Awaited<ReturnType<typeof fetchPrint>>): { no: string; body: ReactNode } {
  const { company, billParty, shipParty, generatedAt, dispatch } = data;
  const doc = data.doc;
  const lines: InvoiceLineRow[] = doc.lines.map((l) => ({
    name: l.itemName,
    sub: [l.pcs ? `${qtyFmt(l.pcs)} pcs` : null, l.brand].filter(Boolean).join(' · ') || null,
    hsn: l.hsn,
    qty: l.qtySqm,
    uom: 'SQM',
    ratePaise: l.ratePaise,
    taxablePaise: l.amountPaise,
  }));
  const place = stateWithCode(billParty?.state ?? doc.state, billParty?.gstin);
  const supply = doc.taxType === 'IGST' ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)';
  const t = doc.totals;
  const common = {
    company,
    lines,
    freightPaise: doc.freightPaise,
    taxType: doc.taxType,
    gstPct: doc.gstPct,
    totals: { taxablePaise: t.taxablePaise, cgst: t.cgst, sgst: t.sgst, igst: t.igst, total: t.total },
    parties: [partyBlock('Bill to', doc.billTo, billParty), partyBlock('Ship to', doc.shipTo, shipParty)],
    pageHeightMm: A4_PAGE_H,
    extra: doc.remarks ? (
      <div style={{ marginBottom: '3mm' }}>
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: MUTED, marginRight: '3mm' }}>REMARKS</span>
        {doc.remarks}
      </div>
    ) : undefined,
  };
  let body: ReactNode;
  let no: string;
  if (path === 'invoices') {
    const i = doc as SalesInvoiceView;
    no = i.invNo;
    body = (
      <InvoiceDocument
        {...common}
        title="Tax invoice"
        copyLabel="Original for recipient"
        docNo={i.invNo}
        dateText={d(i.date)}
        banner={i.irn ? `IRN ${i.irn}` : undefined}
        detailsTitle="Invoice details"
        left={[
          ['Invoice no.', i.invNo, true],
          ['Date', d(i.date)],
          ['Place of supply', place],
          ['Supply', supply],
          ['Reverse charge', 'No'],
          ['Due date', d(dueDate(i.date, billParty?.paymentTerms ?? (billParty?.creditDays ? `${billParty.creditDays} days` : null)))],
        ]}
        right={[
          ['Order ref.', i.soNo],
          // The town from the address line ("…, Morbi, Gujarat 363642" → Morbi).
          ['Dispatch from', company.city ? (company.city.split(',').map((x) => x.trim()).at(-2) ?? company.city) : null],
          ['E-way bill', i.ewayBill],
          ['Vehicle', dispatch?.vehicleNo],
          ['Transporter', dispatch?.transporter],
          ['LR no.', dispatch?.lrNo],
        ]}
        footer="Computer-generated invoice · Page 1 of 1"
      />
    );
  } else if (path === 'orders') {
    const o = doc as SalesOrderView;
    no = o.soNo;
    body = (
      <InvoiceDocument
        {...common}
        title="Sales order"
        copyLabel={SO_STATUS_LABEL[o.status]}
        docNo={o.soNo}
        dateText={d(o.date)}
        detailsTitle="Order details"
        left={[
          ['SO no.', o.soNo, true],
          ['Date', d(o.date)],
          ['Customer PO', o.poNo ? `${o.poNo}${o.poDate ? ` · ${d(o.poDate)}` : ''}` : null],
          ['Place of supply', place],
          ['Supply', supply],
          ['Expected dispatch', d(o.edd)],
        ]}
        right={[
          ['Sales person', o.salesPerson],
          ['Payment terms', o.paymentTerms],
          ['Delivery terms', o.deliveryTerms],
          ['Vehicle', dispatch?.vehicleNo],
          ['Transporter', dispatch?.transporter],
          ['Total weight', o.totalWeightKg ? `${qtyFmt(o.totalWeightKg)} kg` : null],
        ]}
        footer={`Computer-generated sales order · Generated ${stamp(generatedAt)} · Page 1 of 1`}
      />
    );
  } else {
    const p = doc as ProformaView;
    no = p.piNo;
    body = (
      <InvoiceDocument
        {...common}
        title="Proforma invoice"
        copyLabel={PI_STATUS_LABEL[p.status]}
        docNo={p.piNo}
        dateText={d(p.date)}
        detailsTitle="Proforma details"
        left={[
          ['PI no.', p.piNo, true],
          ['Date', d(p.date)],
          ['Valid until', d(p.validUntil)],
          ['Party’s PO ref.', p.poRef],
          ['Place of supply', place],
          ['Supply', supply],
        ]}
        right={[
          ['Sales person', p.salesPerson],
          ['Payment terms', p.paymentTerms],
          ['Delivery terms', p.deliveryTerms],
        ]}
        footer={`Computer-generated proforma invoice · Generated ${stamp(generatedAt)} · Page 1 of 1`}
      />
    );
  }
  return { no, body };
}

/** Any report as an A4 table (legacy printPendingOrderPdf, generalised). */
export async function printReport(r: ReportResult, company: CompanyBlock | null, scope: string) {
  const t = r.table;
  const money = new Set(t?.columns.filter((c) => c.kind === 'money').map((c) => c.key));
  const cell = (key: string, x: unknown, kind?: string): Cell => {
    if (x === null || x === undefined) return '';
    if (typeof x === 'number' && money.has(key)) return inr(x);
    if (kind === 'sqm' && typeof x === 'number') return sqmFmt(x);
    if (kind === 'date' && typeof x === 'string') return d(x);
    if (kind === 'pct' && typeof x === 'number') return `${x}%`;
    return typeof x === 'number' ? qtyFmt(x) : String(x);
  };
  const numeric = t ? t.columns.map((c, i) => (c.kind && c.kind !== 'text' && c.kind !== 'date' ? i : -1)).filter((i) => i >= 0) : [];
  await printHtml({
    ...A4,
    title: r.label,
    bodyHtml: renderToStaticMarkup(
      <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 9, color: INK }}>
        <Letterhead company={company ?? { name: 'Strandply', city: '', phone: null, llpin: null, gst: null }} title="Sales report" no={r.label} sub={scope} />
        {r.kpis && <Fields fields={r.kpis.map((k) => [k.label, k.value])} />}
        {t && (
          <TableBlock
            t={{
              head: t.columns.map((c) => c.label),
              numeric,
              rows: t.rows.map((row) => t.columns.map((c) => cell(c.key, row[c.key], c.kind))),
              foot: t.totals ? t.columns.map((c) => cell(c.key, t.totals![c.key], c.kind)) : undefined,
            }}
          />
        )}
        {r.pivot && (
          <>
            <div style={{ fontWeight: 700, margin: '3mm 0 1mm', textTransform: 'uppercase', fontSize: 8.5, color: MUTED }}>Product-wise balance</div>
            <TableBlock t={{ head: ['Product', 'Balance pcs'], numeric: [1], rows: r.pivot.products.map((p) => [p.itemName, p.pcs]), foot: ['Grand total', r.pivot.pcs] }} />
          </>
        )}
        <div style={{ marginTop: '4mm', textAlign: 'center', color: FAINT, fontSize: 7.5 }}>Printed {stamp(new Date().toISOString())}</div>
      </div>,
    ),
  });
}
