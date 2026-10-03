import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { APPROVAL_LABEL, FIRM_LABEL, PI_STATUS_LABEL, rateSqftOf, SO_STATUS_LABEL, type Customer, type DocTotals, type ProformaView, type ReportResult, type SalesInvoiceView, type SalesOrderView } from '@contracts/sales';
import type { CompanyBlock } from '@contracts/sampletrack';
import { formatDate } from '@/lib/format';
import { PAGES, printHtml } from '@/lib/print';
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

function Party({ title, name, party }: { title: string; name: string; party: Customer | null }) {
  return (
    <div style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 4, padding: '2mm 3mm' }}>
      <div style={{ fontSize: 7.5, color: FAINT, textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</div>
      <div style={{ fontWeight: 700, fontSize: 10.5 }}>{name}</div>
      {party?.address && <div style={{ color: MUTED }}>{party.address}</div>}
      <div style={{ color: MUTED }}>{[party?.city, party?.state, party?.pincode].filter(Boolean).join(', ')}</div>
      {party?.gstin && <div>GSTIN {party.gstin}</div>}
      {party?.mobile1 && <div style={{ color: MUTED }}>{party.mobile1}</div>}
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

function Totals({ t, gstPct, label }: { t: DocTotals; gstPct: number; label: string }) {
  const rows: [string, number][] = [['Total of items', t.itemsPaise], ...(t.freightPaise ? ([['Freight', t.freightPaise]] as [string, number][]) : [])];
  if (t.cgst) rows.push([`CGST @ ${gstPct / 2}%`, t.cgst], [`SGST @ ${gstPct / 2}%`, t.sgst]);
  if (t.igst) rows.push([`IGST @ ${gstPct}%`, t.igst]);
  return (
    <div style={{ marginLeft: 'auto', width: '75mm', marginBottom: '3mm' }}>
      {rows.map(([k, x]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6mm 0' }}>
          <span style={{ color: MUTED }}>{k}</span>
          <span>{inr(x)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1.5px solid ${INK}`, marginTop: '1mm', paddingTop: '1mm', fontSize: 11, fontWeight: 800 }}>
        <span>{label}</span>
        <span>{inr(t.total)}</span>
      </div>
    </div>
  );
}

function SignOff({ firm, generatedAt, note }: { firm: string; generatedAt: string; note?: ReactNode }) {
  return (
    <>
      {note && <div style={{ marginTop: '2mm', color: MUTED }}>{note}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12mm', marginTop: '14mm', fontSize: 8.5 }}>
        <div style={{ flex: 1, borderTop: `1px solid ${INK}`, paddingTop: '1mm', color: MUTED }}>Prepared by</div>
        <div style={{ flex: 1, borderTop: `1px solid ${INK}`, paddingTop: '1mm', color: MUTED, textAlign: 'right' }}>Authorised signatory — {firm}</div>
      </div>
      <div style={{ marginTop: '4mm', textAlign: 'center', color: FAINT, fontSize: 7.5 }}>Generated {stamp(generatedAt)}</div>
    </>
  );
}

/** Proforma, sales order or tax invoice on A4 (legacy printPiPdf / printSalesOrderPdf / printInvoicePdf). */
export async function printSalesDoc(path: DocPath, id: string) {
  const data = await fetchPrint(path, id);
  const { company, billParty, shipParty, generatedAt } = data;
  const firm = FIRM_LABEL[data.doc.firm];
  let title: string;
  let no: string;
  let sub: string;
  let fields: [string, Cell][];
  let table: Table;
  let label = 'Grand total';
  let note: ReactNode = null;
  if (path === 'invoices') {
    const i = data.doc as SalesInvoiceView;
    title = 'Tax invoice';
    no = i.invNo;
    sub = `${d(i.date)} · ${APPROVAL_LABEL[i.approval]}`;
    fields = [
      ['Invoice date', d(i.date)],
      ['Sales order', i.soNo],
      ['Customer PO', i.poNo],
      ['Tax type', i.taxType],
      ['E-way bill', i.ewayBill ?? 'Not generated'],
      ['IRN', i.irn ?? 'Not generated'],
      ['Weight', `${qtyFmt(i.tons)} t`],
    ];
    table = {
      head: ['#', 'Item', 'HSN', 'SO qty (sq m)', 'Pcs', 'Qty (sq m)', 'Rate / sq m', 'Rate / sq ft', 'Amount'],
      numeric: [3, 4, 5, 6, 7, 8],
      rows: i.lines.map((l, n) => [n + 1, l.itemName, l.hsn, sqmFmt(l.soQtySqm), l.pcs, sqmFmt(l.qtySqm), inr(l.ratePaise), inr(rateSqftOf(l.ratePaise)), inr(l.amountPaise)]),
      foot: ['', 'Total', '', '', i.lines.reduce((s, l) => s + l.pcs, 0), sqmFmt(i.lines.reduce((s, l) => s + l.qtySqm, 0)), '', '', inr(i.totals.itemsPaise)],
    };
    note = i.remarks;
  } else {
    const o = data.doc as SalesOrderView & ProformaView;
    const isOrder = path === 'orders';
    title = isOrder ? 'Sales order' : 'Proforma invoice';
    no = isOrder ? o.soNo : o.piNo;
    sub = `${d(o.date)} · ${isOrder ? SO_STATUS_LABEL[o.status as SalesOrderView['status']] : PI_STATUS_LABEL[o.status as ProformaView['status']]}`;
    fields = isOrder
      ? [
          ['SO date', d(o.date)],
          ['Customer PO', o.poNo ? `${o.poNo}${o.poDate ? ` · ${d(o.poDate)}` : ''}` : null],
          ['Expected dispatch', d(o.edd)],
          ['Sales person', o.salesPerson],
          ['Payment terms', o.paymentTerms],
          ['Delivery terms', o.deliveryTerms],
        ]
      : [
          ['PI date', d(o.date)],
          ['Valid until', d(o.validUntil)],
          ['Party’s PO ref', o.poRef],
          ['Sales person', o.salesPerson],
          ['Payment terms', o.paymentTerms],
          ['Delivery terms', o.deliveryTerms],
        ];
    table = {
      head: ['#', 'Item', 'Brand', 'Pcs', 'Qty (sq m)', 'Rate / sq m', 'Rate / sq ft', 'Wt (kg)', 'Amount'],
      numeric: [3, 4, 5, 6, 7, 8],
      rows: o.lines.map((l, n) => [n + 1, l.itemName, l.brand, l.pcs, sqmFmt(l.qtySqm), inr(l.ratePaise), inr(rateSqftOf(l.ratePaise)), l.weightKg ? qtyFmt(l.pcs * l.weightKg) : '—', inr(l.amountPaise)]),
      foot: ['', 'Total', '', o.lines.reduce((s, l) => s + l.pcs, 0), sqmFmt(o.lines.reduce((s, l) => s + l.qtySqm, 0)), '', '', o.totalWeightKg ? qtyFmt(o.totalWeightKg) : '', inr(o.totals.itemsPaise)],
    };
    label = isOrder ? 'Order value' : 'Total value';
    note = o.remarks;
  }
  await printHtml({
    ...A4,
    title: no,
    bodyHtml: renderToStaticMarkup(
      <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 9.5, color: INK }}>
        <Letterhead company={company} title={title} no={no} sub={sub} />
        <Fields fields={fields} />
        <div style={{ display: 'flex', gap: '4mm', marginBottom: '3mm' }}>
          <Party title="Bill to" name={data.doc.billTo} party={billParty} />
          <Party title="Ship to" name={data.doc.shipTo} party={shipParty} />
        </div>
        <TableBlock t={table} />
        <Totals t={data.doc.totals} gstPct={data.doc.gstPct} label={label} />
        <SignOff firm={firm} generatedAt={generatedAt} note={note} />
      </div>,
    ),
  });
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
