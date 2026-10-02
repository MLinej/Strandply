import { renderToStaticMarkup } from 'react-dom/server';
import type { CSSProperties, ReactNode } from 'react';
import { MATERIAL_BY_ID, rateUnitOf, type NoteCalc, type TaxSplit } from '@contracts/purchase';
import type { CompanyBlock } from '@contracts/sampletrack';
import { formatDate } from '@/lib/format';
import { PAGES, printHtml } from '@/lib/print';
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
  const rows = [
    ['A', 'Invoice weight', qtyFmt(e.invQty), inr(e.ratePaise), ...amounts(c.invoice)],
    ['B', 'Strandply (SPL) weight', qtyFmt(e.splQty), inr(e.ratePaise), ...amounts(c.spl)],
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
      <Header c={data.company} title={`${m.label} inward slip`} right={<div style={{ fontSize: 8.5, color: FAINT }}>MRN {e.mrnNo ?? '—'} · GRN {e.grnNo ?? '—'}</div>} />
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
            {kv('Material', [m.label, e.species ?? e.veneerType].filter(Boolean).join(' — '))}
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
          {rows.map((r) => (
            <tr key={r[0]}>
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
          <div style={{ color: e.status === 'approved' ? '#15803D' : '#B45309', fontWeight: 700 }}>{e.status === 'approved' ? `Approved ${e.approvedAt ? d(e.approvedAt.slice(0, 10)) : ''}` : 'Pending approval'}</div>,
        )}
      </div>
      <div style={{ marginTop: '2mm', fontSize: 7.5, color: FAINT, textAlign: 'right' }}>Printed {d(data.generatedAt.slice(0, 10))}</div>
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
            <td style={label}>MRN No.</td>
            <td style={value}>{e.mrnNo ?? '—'}</td>
            <td style={label}>Species</td>
            <td style={value}>Nilgiri wood{e.species ? ` — ${e.species}` : ''}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** A4 purchase order (legacy downloadPOPdf), with the chosen T&C clauses. */
export function PoDocument({ data }: { data: PoPrintPayload }) {
  const p = data.po;
  const m = MATERIAL_BY_ID[p.material];
  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 11, color: INK }}>
      <Header c={data.company} title="Purchase order" right={<div style={{ fontSize: 18, fontWeight: 800 }}>{p.poNo}</div>} />
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '6mm', marginBottom: '6mm' }}>
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 4, padding: '3mm 4mm' }}>
          <div style={{ fontSize: 8.5, fontWeight: 700, color: RED, textTransform: 'uppercase', marginBottom: '1.5mm' }}>To</div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{p.vendorName}</div>
          {data.vendor?.address && <div style={{ color: MUTED }}>{data.vendor.address}</div>}
          <div style={{ color: MUTED }}>{[data.vendor?.gstin && `GSTIN ${data.vendor.gstin}`, data.vendor?.phone].filter(Boolean).join(' · ')}</div>
        </div>
        <table style={{ border: `1px solid ${LINE}`, borderRadius: 4, padding: '3mm 4mm' }}>
          <tbody>
            {[
              ['PO date', d(p.date)],
              ['Payment terms', data.vendor?.paymentTerms ?? '—'],
              ['Status', p.status === 'approved' ? `Approved${p.approvedByName ? ` by ${p.approvedByName}` : ''}` : 'Pending approval'],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ color: MUTED, paddingRight: '3mm' }}>{k}</td>
                <td style={{ fontWeight: 600 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5mm' }}>
        <thead>
          <tr>
            {['Material', 'Unit', 'PO qty', `Rate / ${rateUnitOf(m)}`, 'Value (before GST)', 'Received', 'Balance'].map((h, i) => (
              <th key={h} style={{ ...th, fontSize: 8.5, textAlign: i < 2 ? 'left' : 'right' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>{m.label}</td>
            <td style={{ ...cell, textAlign: 'left' }}>{m.unit}</td>
            <td style={cell}>{qtyFmt(p.qty)}</td>
            <td style={cell}>{inr(p.ratePaise)}</td>
            <td style={{ ...cell, fontWeight: 700 }}>{inr(p.valuePaise)}</td>
            <td style={cell}>{qtyFmt(p.receivedQty)}</td>
            <td style={cell}>{qtyFmt(p.balanceQty)}</td>
          </tr>
        </tbody>
      </table>
      {p.remarks && (
        <p style={{ margin: '0 0 5mm' }}>
          <strong>Remarks:</strong> {p.remarks}
        </p>
      )}
      {data.tnc.length > 0 && (
        <div style={{ marginBottom: '8mm' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: RED, textTransform: 'uppercase', marginBottom: '2mm' }}>Terms and conditions</div>
          <ol style={{ margin: 0, paddingLeft: '5mm' }}>
            {data.tnc.map((t) => (
              <li key={t.id} style={{ marginBottom: '1.5mm' }}>
                <strong>{t.title}:</strong> {t.body}
              </li>
            ))}
          </ol>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18mm' }}>
        <div style={{ width: '65mm', borderTop: `1px solid ${INK}`, paddingTop: '1.5mm', textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>{p.status === 'approved' ? (p.approvedByName ?? '') : ''}</div>
          <div style={{ color: MUTED, fontSize: 9.5 }}>Authorised signatory, {data.company.name}</div>
        </div>
      </div>
    </div>
  );
}

const A4_LANDSCAPE = { size: 'A4', orientation: 'landscape', widthMm: 297, heightMm: 210 } as const;

export async function printEntry(id: string, kind: 'slip' | 'label') {
  const data = await fetchEntryPrint(id, kind);
  if (kind === 'slip') {
    await printHtml({ title: `Slip ${data.entry.lotNo}`, page: PAGES.courierLabel, marginMm: 7, css: 'html, body { width: auto; min-height: 0; }', bodyHtml: renderToStaticMarkup(<SlipDocument data={data} />) });
  } else {
    await printHtml({ title: `Label ${data.entry.lotNo}`, page: A4_LANDSCAPE, marginMm: 6, css: 'html, body { width: auto; min-height: 0; }', bodyHtml: renderToStaticMarkup(<LabelDocument data={data} />) });
  }
}

export async function printPo(id: string) {
  const data = await fetchPoPrint(id);
  await printHtml({ title: `PO ${data.po.poNo}`, page: PAGES.requestSlip, marginMm: 14, css: 'html, body { width: auto; min-height: 0; }', bodyHtml: renderToStaticMarkup(<PoDocument data={data} />) });
}
