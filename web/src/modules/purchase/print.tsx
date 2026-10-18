import { renderToStaticMarkup } from 'react-dom/server';
import type { CSSProperties, ReactNode } from 'react';
import { amountFor, MATERIAL_BY_ID, rateUnitOf, type NoteCalc, type TaxSplit } from '@contracts/purchase';
import type { CompanyBlock } from '@contracts/sampletrack';
import { formatDate, formatDateTime } from '@/lib/format';
import { InvoiceDocument } from '@/lib/invoice-print';
import { PAGES, printHtml } from '@/lib/print';
import { KIT_CSS } from '@/lib/print-kit';
import { fetchEntryPrint, fetchPoPrint, type EntryPrintPayload, type PoPrintPayload } from './api';
import { inr, qtyFmt } from './ui';

// Inline styles only: these render in a bare iframe without the app's CSS.
const INK = '#172033';
const MUTED = '#667085';
const FAINT = '#98A2B3';
const RED = '#D71920';
const LINE = '#E6E8EC';
const d = (iso: string | null) => (iso ? formatDate(iso) : '—');

function Header({ c, title, right }: { c: CompanyBlock; title: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2.5px solid ${RED}`, paddingBottom: '2.5mm', marginBottom: '3mm' }}>
      <div>
        <div style={{ fontSize: 17, fontWeight: 800, color: RED }}>{c.name}</div>
        <div style={{ fontSize: 9.5, color: MUTED }}>{[c.city, c.gst && `GSTIN ${c.gst}`, c.llpin && `LLPIN ${c.llpin}`].filter(Boolean).join(' · ')}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</div>
        {right}
      </div>
    </div>
  );
}

const cell: CSSProperties = { padding: '1.2mm 1.6mm', borderBottom: `1px solid ${LINE}`, textAlign: 'right', whiteSpace: 'nowrap' };
const th: CSSProperties = { ...cell, background: RED, color: '#fff', fontWeight: 700, fontSize: 8, textTransform: 'uppercase', borderBottom: 'none' };

/** A5 landscape truck receiving slip (legacy renderSlip / downloadSlipPDF). */
export function SlipDocument({ data }: { data: EntryPrintPayload }) {
  const e = data.entry;
  const m = MATERIAL_BY_ID[e.material];
  const c = e.calc;
  const igst = e.taxType === 'IGST';
  const amounts = (t: TaxSplit, sign = '') => [
    `${sign}${inr(t.basic)}`,
    igst ? '—' : `${sign}${inr(t.cgst)}`,
    igst ? '—' : `${sign}${inr(t.sgst)}`,
    igst ? `${sign}${inr(t.igst)}` : '—',
    `${sign}${inr(t.total)}`,
  ];
  const noteRow = (code: string, n: NoteCalc | null, label: string, rate: number) =>
    n ? [code, `${n.type === 'dn' ? 'Debit' : 'Credit'} note: ${label}`, qtyFmt(n.qty), inr(rate), ...amounts(n, n.type === 'dn' ? '−' : '+')] : null;
  // Only weighed materials (Kg) talk about weight; Kraft and veneers are counted.
  const measure = m.unit === 'Kg' ? 'weight' : 'quantity';
  const rows = [
    // Invoice-wise entries list their lines; the A/B reconciliation follows only when notes are raised.
    ...e.lines.map((l, i) => [String(i + 1), `${l.itemName}${l.hsn ? ` (HSN ${l.hsn})` : ''}`, qtyFmt(l.invQty), inr(l.ratePaise), inr(amountFor(e.material, l.invQty, l.ratePaise)), '', '', '', '']),
    ...(e.lines.length && !e.raiseNotes
      ? [['', 'Invoice total', qtyFmt(e.invQty), '', ...amounts(c.invoice)]]
      : [
          ['A', `Invoice ${measure}`, qtyFmt(e.invQty), inr(e.ratePaise), ...amounts(c.invoice)],
          ['B', `Strandply (SPL) ${measure}`, qtyFmt(e.splQty), inr(e.ratePaise), ...amounts(c.spl)],
        ]),
    noteRow('C', c.qtyNote, c.qtyNote?.type === 'dn' ? 'invoice > SPL' : 'SPL > invoice', e.ratePaise),
    noteRow('D', c.rateNote, `rate difference ${inr(Math.abs(e.rateDiffPaise))}/${rateUnitOf(m)}`, Math.abs(e.rateDiffPaise)),
  ].filter((r): r is string[] => !!r);
  const kv = (k: string, v: ReactNode) => (
    <tr>
      <td style={{ color: MUTED, padding: '0.6mm 0', width: '36%' }}>{k}</td>
      <td style={{ fontWeight: 600 }}>{v ?? '—'}</td>
    </tr>
  );
  const sig = (name: string, role: string, extra?: ReactNode) => (
    <div style={{ flex: 1, borderTop: `1px solid ${INK}`, paddingTop: '1mm', textAlign: 'center', fontSize: 8.5 }}>
      <div style={{ fontWeight: 700 }}>{name}</div>
      <div style={{ color: MUTED }}>{role}</div>
      {extra}
    </div>
  );
  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 9.5, color: INK }}>
      <Header
        c={data.company}
        title={`${m.label} inward summary`}
        right={
          <>
            <div style={{ fontSize: 8.5, color: FAINT }}>MRN {e.mrnNo ?? '—'} · GRN {e.grnNo ?? '—'}</div>
            <div style={{ fontSize: 8.5, color: MUTED }}>Generated {formatDateTime(data.generatedAt)}</div>
          </>
        }
      />
      <div style={{ display: 'flex', background: INK, color: '#fff', borderRadius: 3, padding: '1.8mm 3mm', gap: '6mm', alignItems: 'center', marginBottom: '2.5mm' }}>
        <div>
          <div style={{ fontSize: 7, letterSpacing: 2, opacity: 0.6 }}>LOT NUMBER</div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 3 }}>{e.lotNo}</div>
        </div>
        {[
          ['Inward date', d(e.date)],
          ['Invoice', `${e.invoiceNo} · ${d(e.invoiceDate)}`],
          ['RST', e.rstNo ?? '—'],
          ['PO', e.poNo ?? '—'],
          ['Tax', e.taxType],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 7, letterSpacing: 1.5, opacity: 0.6, textTransform: 'uppercase' }}>{k}</div>
            <div style={{ fontSize: 10, fontWeight: 700 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3mm', marginBottom: '2.5mm' }}>
        <table style={{ border: `1px solid ${LINE}`, borderRadius: 3, padding: '1.5mm 2.5mm', width: '100%' }}>
          <tbody>
            {kv('Vendor', e.vendorName)}
            {kv('Code / GSTIN', [e.vendorCode, e.gstin].filter(Boolean).join(' · ') || null)}
            {kv('Mobile', e.mobile)}
          </tbody>
        </table>
        <table style={{ border: `1px solid ${LINE}`, borderRadius: 3, padding: '1.5mm 2.5mm', width: '100%' }}>
          <tbody>
            {kv('Vehicle', [e.vehicleNo, e.driver].filter(Boolean).join(' · ') || null)}
            {kv('Material', [m.label, e.lines.length ? null : e.itemName, e.species ?? e.veneerType].filter(Boolean).join(' — '))}
            {kv(`Rate / ${rateUnitOf(m)}`, inr(e.ratePaise))}
          </tbody>
        </table>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8.5 }}>
        <thead>
          <tr>
            {['', 'Description', `Qty (${m.unit})`, 'Rate', 'Basic', 'CGST', 'SGST', 'IGST', 'Total'].map((h, i) => (
              <th key={i} style={{ ...th, textAlign: i < 2 ? 'left' : 'right' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, j) => (
            <tr key={j}>
              {r.map((v, i) => (
                <td key={i} style={{ ...cell, textAlign: i < 2 ? 'left' : 'right', fontWeight: i === 8 ? 700 : 400 }}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
          {e.otherChargesPaise > 0 && (
            <tr>
              <td style={{ ...cell, textAlign: 'left' }} />
              <td style={{ ...cell, textAlign: 'left' }} colSpan={7}>
                Other charges (freight etc.)
              </td>
              <td style={{ ...cell, fontWeight: 700 }}>+{inr(e.otherChargesPaise)}</td>
            </tr>
          )}
          <tr style={{ background: '#FFF1F2' }}>
            <td style={{ ...cell, textAlign: 'left', fontWeight: 800 }} colSpan={8}>
              Amount to be paid
            </td>
            <td style={{ ...cell, fontWeight: 800, fontSize: 11, color: RED }}>{inr(c.payable)}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: '6mm', marginTop: '9mm' }}>
        {sig('', 'Unloading supervisor')}
        {sig('', 'Checked by')}
        {sig(
          e.status === 'approved' ? (e.approvedByName ?? 'Approved') : '',
          'Approved by',
          <div style={{ color: e.status === 'approved' ? '#15803D' : '#B45309', fontWeight: 700 }}>{e.status === 'approved' ? `Approved${e.approvedAt ? ` ${formatDateTime(e.approvedAt)}` : ''}` : 'Pending approval'}</div>,
        )}
      </div>
      <div style={{ marginTop: '2mm', fontSize: 7.5, color: FAINT, display: 'flex', justifyContent: 'space-between' }}>
        <span>{e.status === 'approved' ? `Approved by ${e.approvedByName ?? '—'} on ${e.approvedAt ? formatDateTime(e.approvedAt) : '—'}` : 'Not approved yet'}</span>
        <span>PDF generated {formatDateTime(data.generatedAt)}</span>
      </div>
    </div>
  );
}

/** A4 landscape Nilgiri lot label (legacy renderNilgiriLabel / downloadLabelPDF). */
export function LabelDocument({ data }: { data: EntryPrintPayload }) {
  const e = data.entry;
  const box: CSSProperties = { border: '1px solid #000', padding: '2.5mm 3mm' };
  const label: CSSProperties = { ...box, fontSize: 9, fontWeight: 700, color: '#555', width: '20%' };
  const value: CSSProperties = { ...box, fontSize: 16, fontWeight: 900 };
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#000', border: '2px solid #000', padding: '8mm 10mm', height: '186mm', boxSizing: 'border-box' }}>
      <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '3mm', marginBottom: '4mm' }}>
        <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 3 }}>{data.company.name.toUpperCase()}</div>
        <div style={{ fontSize: 12, letterSpacing: 4 }}>RAW MATERIAL INWARD LABEL</div>
      </div>
      <div style={{ textAlign: 'center', border: '2px solid #000', padding: '3mm', marginBottom: '4mm' }}>
        <div style={{ fontSize: 10, letterSpacing: 5, fontWeight: 700, color: '#555' }}>LOT NUMBER</div>
        <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: 6, lineHeight: 1.05 }}>{e.lotNo}</div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={label}>RST No.</td>
            <td style={value}>{e.rstNo ?? '—'}</td>
            <td style={label}>Vehicle No.</td>
            <td style={value}>{e.vehicleNo ?? '—'}</td>
          </tr>
          <tr>
            <td style={label}>Inward date</td>
            <td style={value}>{d(e.date)}</td>
            <td style={label}>Invoice No.</td>
            <td style={{ ...value, fontSize: 14 }}>{e.invoiceNo}</td>
          </tr>
          <tr>
            <td style={label}>SPL weight</td>
            <td style={{ ...value, fontSize: 22 }}>{qtyFmt(e.splQty)} Kg</td>
            <td style={label}>Invoice weight</td>
            <td style={value}>{qtyFmt(e.invQty)} Kg</td>
          </tr>
          <tr>
            <td style={label}>Vendor</td>
            <td style={{ ...value, fontSize: 14 }} colSpan={3}>
              {e.vendorName}
            </td>
          </tr>
          <tr>
            <td style={label}>Item</td>
            <td style={{ ...value, fontSize: 26, lineHeight: 1.15 }} colSpan={3}>
              {e.itemName ?? 'Nilgiri wood'}
            </td>
          </tr>
          <tr>
            <td style={label}>MRN No.</td>
            <td style={value}>{e.mrnNo ?? '—'}</td>
            <td style={label}>Species</td>
            <td style={{ ...value, fontSize: 20 }}>Nilgiri wood{e.species ? ` — ${e.species}` : ''}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** A4 purchase order in the tax invoice format, with Generated / Reviewed / Approved signatures. */
export function PoDocument({ data }: { data: PoPrintPayload }) {
  const p = data.po;
  const c = data.company;
  const m = MATERIAL_BY_ID[p.material];
  const tons = m.rateBasis === 'ton';
  const status = p.status === 'approved' ? 'Approved' : p.status === 'reviewed' ? 'Reviewed, awaiting approval' : 'Awaiting review';
  const v = data.vendor;
  return (
    <InvoiceDocument
      company={c}
      title="Purchase order"
      copyLabel={status}
      docNo={p.poNo}
      dateText={d(p.date)}
      detailsTitle="Order details"
      left={[
        ['PO no.', p.poNo, true],
        ['PO date', d(p.date)],
        ['Material', m.label],
        ['Quotation ref.', p.quotationRef],
        ['Supply', p.taxType === 'IGST' ? 'Inter-state (IGST)' : p.taxType === 'URD' ? 'Unregistered vendor' : 'Intra-state (CGST + SGST)'],
      ]}
      right={[
        ['Expected delivery', p.deliveryDate ? d(p.deliveryDate) : null],
        ['Payment terms', p.paymentTerms ?? v?.paymentTerms ?? null],
        ['Delivery terms', p.deliveryTerms],
        ['Received so far', `${qtyFmt(p.receivedQty)} ${m.unit} of ${qtyFmt(p.qty)}`],
      ]}
      parties={[
        { title: 'Vendor', name: p.vendorName, lines: [v?.address, v?.gstin ? `GSTIN ${v.gstin}` : null, [v?.phone, v?.email].filter(Boolean).join(' · ') || null] },
        { title: 'Deliver to', name: c.name, lines: [c.city, c.gst ? `GSTIN ${c.gst}` : null, c.phone ? `Ph ${c.phone}` : null] },
      ]}
      lines={p.lines.map((l) => ({
        name: l.itemName,
        sub: null,
        hsn: l.hsn,
        qty: tons ? l.qty / 1000 : l.qty,
        uom: tons ? 'MT' : m.unit.toUpperCase(),
        ratePaise: l.ratePaise,
        taxablePaise: l.amountPaise,
      }))}
      freightPaise={p.freightPaise}
      taxType={p.taxType}
      gstPct={p.gstPct}
      totals={{ taxablePaise: p.totals.taxablePaise, cgst: p.totals.cgst, sgst: p.totals.sgst, igst: p.totals.igst, total: p.totals.total }}
      showBank={false}
      extra={
        <>
          {p.remarks && (
            <div style={{ marginBottom: '3mm' }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: MUTED, marginRight: '3mm' }}>REMARKS</span>
              {p.remarks}
            </div>
          )}
          {data.tnc.length > 0 && (
            <div style={{ marginBottom: '3mm', breakInside: 'avoid' }}>
              <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: MUTED, marginBottom: '1.5mm' }}>TERMS AND CONDITIONS</div>
              <ol style={{ margin: 0, paddingLeft: '5mm' }}>
                {data.tnc.map((x) => (
                  <li key={x.id} style={{ marginBottom: '1mm' }}>
                    <strong>{x.title}:</strong> {x.body}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      }
      signers={[
        { role: 'Generated by', name: p.createdByName, at: p.createdAt },
        { role: 'Reviewed by', name: p.reviewedByName, at: p.reviewedAt },
        { role: 'Approved by', name: p.approvedByName, at: p.approvedAt },
      ]}
      footer={`For ${c.name} · Computer-generated purchase order · Generated ${formatDateTime(data.generatedAt)} · Page 1 of 1`}
      pageHeightMm={297 - 28 - 2}
    />
  );
}

const A4_LANDSCAPE = { size: 'A4', orientation: 'landscape', widthMm: 297, heightMm: 210 } as const;

export async function printEntry(id: string, kind: 'slip' | 'label') {
  const data = await fetchEntryPrint(id, kind);
  if (kind === 'slip') {
    // The title is the saved PDF's file name: Lot no – Party name – Inward date.
    const [y, mo, dd] = data.entry.date.split('-');
    const fileName = `${data.entry.lotNo} – ${data.entry.vendorName.replace(/[\\/:*?"<>|]/g, ' ').trim()} – ${dd}-${mo}-${y}`;
    await printHtml({ title: fileName, page: PAGES.courierLabel, marginMm: 7, css: 'html, body { width: auto; min-height: 0; }', bodyHtml: renderToStaticMarkup(<SlipDocument data={data} />) });
  } else {
    await printHtml({ title: `Label ${data.entry.lotNo}`, page: A4_LANDSCAPE, marginMm: 6, css: 'html, body { width: auto; min-height: 0; }', bodyHtml: renderToStaticMarkup(<LabelDocument data={data} />) });
  }
}

export async function printPo(id: string) {
  const data = await fetchPoPrint(id);
  await printHtml({ title: `PO ${data.po.poNo.replace(/\//g, '-')}`, page: PAGES.requestSlip, marginMm: 14, css: KIT_CSS, bodyHtml: renderToStaticMarkup(<PoDocument data={data} />) });
}
