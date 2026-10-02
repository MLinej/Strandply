import { renderToStaticMarkup } from 'react-dom/server';
import type { CSSProperties, ReactNode } from 'react';
import { qualityLabel, storeMaterialLabel } from '@contracts/stores';
import type { CompanyBlock } from '@contracts/sampletrack';
import { formatDate } from '@/lib/format';
import { PAGES, printHtml } from '@/lib/print';
import { fetchGrnPrint, fetchMrnPrint, type GrnPrintPayload, type MrnPrintPayload } from './api';
import { grnStatusLabel, qtyFmt, stamp } from './ui';

// Inline styles only: these render in a bare iframe without the app's CSS.
const INK = '#172033';
const MUTED = '#667085';
const FAINT = '#98A2B3';
const RED = '#D71920';
const LINE = '#E6E8EC';
const AMBER = '#D97706';
const GREEN = '#16A34A';

function Header({ c, title, no, band }: { c: CompanyBlock; title: string; no: string; band: [string, string][] }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2.5px solid ${RED}`, paddingBottom: '2mm' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: RED }}>{c.name}</div>
          <div style={{ fontSize: 9, color: MUTED }}>{[c.city, c.gst && `GSTIN ${c.gst}`, c.llpin && `LLPIN ${c.llpin}`].filter(Boolean).join(' · ')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</div>
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'ui-monospace, Menlo, monospace' }}>{no}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6mm', background: '#FFF1F2', color: RED, fontSize: 8.5, padding: '1.4mm 2mm', margin: '0 0 3mm', fontFamily: 'ui-monospace, Menlo, monospace' }}>
        {band.map(([k, v]) => (
          <span key={k}>
            {k}: <strong>{v}</strong>
          </span>
        ))}
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 7.5, color: FAINT, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{children || '—'}</div>
    </div>
  );
}

const cell: CSSProperties = { padding: '1.3mm 1.8mm', borderBottom: `1px solid ${LINE}`, textAlign: 'left' };
const th: CSSProperties = { ...cell, background: RED, color: '#fff', fontWeight: 700, fontSize: 8, textTransform: 'uppercase', borderBottom: 'none' };
const right: CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap' };

function Table({ head, rows, rightCols = [] }: { head: string[]; rows: ReactNode[][]; rightCols?: number[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '3mm' }}>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} style={{ ...th, ...(rightCols.includes(i) ? right : {}) }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} style={{ background: ri % 2 ? '#F9FAFC' : '#fff' }}>
            {r.map((v, i) => (
              <td key={i} style={{ ...cell, ...(rightCols.includes(i) ? right : {}) }}>
                {v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Stamp({ tone, children }: { tone: 'amber' | 'green'; children: ReactNode }) {
  const c = tone === 'green' ? GREEN : AMBER;
  return <div style={{ border: `1px solid ${c}`, color: c, borderRadius: 3, padding: '1.2mm 3mm', fontWeight: 700, fontSize: 9, textAlign: 'center' }}>{children}</div>;
}

function Signatures({ items }: { items: { role: string; name?: string | null; when?: string | null }[] }) {
  return (
    <div style={{ display: 'flex', gap: '8mm', marginTop: '9mm' }}>
      {items.map((s) => (
        <div key={s.role} style={{ flex: 1, fontSize: 8.5 }}>
          <div style={{ minHeight: '7mm', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            {s.name && <div style={{ fontWeight: 700 }}>{s.name}</div>}
            {s.when && <div style={{ color: FAINT, fontSize: 7.5 }}>{s.when}</div>}
          </div>
          <div style={{ borderTop: `1px solid ${INK}`, paddingTop: '1mm', color: MUTED, textTransform: 'uppercase', fontSize: 7.5, letterSpacing: 0.4 }}>{s.role}</div>
        </div>
      ))}
    </div>
  );
}

const footer = (generatedAt: string, note: string) => (
  <div style={{ marginTop: '4mm', textAlign: 'center', color: FAINT, fontSize: 7.5 }}>
    Generated {stamp(generatedAt)} · {note}
  </div>
);

/** A5 landscape MRN slip printed at the gate (legacy printMrnPdf). */
export function MrnDocument({ data }: { data: MrnPrintPayload }) {
  const m = data.mrn;
  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 9.5, color: INK }}>
      <Header c={data.company} title="Material receipt note (MRN)" no={m.mrnNo} band={[['Date', formatDate(m.date)], ['Time', m.time], ['Vehicle', m.vehicleNo], ['FY', m.fy]]} />
      <div style={{ display: 'flex', gap: '5mm', marginBottom: '3mm' }}>
        <Field label="Vendor">{m.vendorName}</Field>
        <Field label="Invoice / challan no.">{m.invoiceNo ?? 'Not available at gate'}</Field>
        <Field label="Driver">{[m.driverName, m.driverPhone].filter(Boolean).join(' · ')}</Field>
      </div>
      <Table
        head={['#', 'Material', 'Approx qty', 'Packages', 'Remarks']}
        rightCols={[2]}
        rows={m.items.map((it, i) => [i + 1, storeMaterialLabel(it.material), `${qtyFmt(it.approxQty)} ${it.unit}`, it.packages ?? '—', it.remarks ?? ''])}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6mm' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 7.5, color: FAINT, textTransform: 'uppercase' }}>Remarks / gate observations</div>
          <div>{m.remarks || 'None recorded'}</div>
        </div>
        <Stamp tone={m.status === 'pending_grn' ? 'amber' : 'green'}>{m.status === 'pending_grn' ? 'STATUS: PENDING GRN' : `GRN ${m.grnNo}`}</Stamp>
      </div>
      <Signatures items={[{ role: 'Security guard', name: m.securityName }, { role: 'Driver signature' }, { role: 'Stores received by (GRN)', name: m.grnNo ? null : 'Pending' }]} />
      {footer(data.generatedAt, 'Preliminary gate entry, not a final receipt.')}
    </div>
  );
}

/** A5 landscape GRN with the sign-off trail (legacy printGrnPdf). */
export function GrnDocument({ data }: { data: GrnPrintPayload }) {
  const g = data.grn;
  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 9.5, color: INK }}>
      <Header c={data.company} title="Goods receipt note (GRN)" no={g.grnNo} band={[['Date', formatDate(g.date)], ['Time', g.time], ['MRN', g.mrnNo], ['Vehicle', g.vehicleNo], ['FY', g.fy]]} />
      <div style={{ display: 'flex', gap: '5mm', marginBottom: '3mm' }}>
        <Field label="Vendor">{g.vendorName}</Field>
        <Field label="Invoice / bill no.">
          {g.invoiceNo} <span style={{ color: MUTED, fontWeight: 400 }}>{g.purchaseEntry ? `(Purchase lot ${g.purchaseEntry.lotNo})` : '(manual reference)'}</span>
        </Field>
        <Field label="Received by">{g.receivedByName}</Field>
      </div>
      <Table
        head={['#', 'Material', 'Approx (gate)', 'Actual received', 'Quality', 'Remarks']}
        rightCols={[2, 3]}
        rows={g.items.map((it, i) => [
          i + 1,
          `${storeMaterialLabel(it.material)}${it.mrnItemId ? '' : ' (unlisted)'}`,
          it.approxQty ? `${qtyFmt(it.approxQty)} ${it.unit}` : '—',
          <strong key="q">{`${qtyFmt(it.actualQty)} ${it.unit}`}</strong>,
          qualityLabel(it.quality),
          it.qualityRemarks ?? '',
        ])}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6mm' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 7.5, color: FAINT, textTransform: 'uppercase' }}>Overall remarks</div>
          <div>{g.remarks || 'None recorded'}</div>
        </div>
        {g.status === 'approved' ? <Stamp tone="green">✔ APPROVED · {stamp(g.approvedAt)}</Stamp> : <Stamp tone="amber">STATUS: {grnStatusLabel(g.status).toUpperCase()}</Stamp>}
      </div>
      <Signatures
        items={[
          { role: 'Received by', name: g.receivedByName, when: `${formatDate(g.date)} ${g.time}` },
          { role: 'Reviewed by', name: g.reviewedByName, when: g.reviewedAt ? stamp(g.reviewedAt) : null },
          { role: 'Approved by', name: g.approvedByName, when: g.approvedAt ? stamp(g.approvedAt) : null },
        ]}
      />
      {footer(data.generatedAt, g.accounted ? `Accounted, voucher ${g.voucherNo}` : 'Confidential')}
    </div>
  );
}

const slip = { page: PAGES.courierLabel, marginMm: 7, css: 'html, body { width: auto; min-height: 0; }' };

export async function printMrn(id: string) {
  const data = await fetchMrnPrint(id);
  await printHtml({ ...slip, title: data.mrn.mrnNo, bodyHtml: renderToStaticMarkup(<MrnDocument data={data} />) });
}

export async function printGrn(id: string) {
  const data = await fetchGrnPrint(id);
  await printHtml({ ...slip, title: data.grn.grnNo, bodyHtml: renderToStaticMarkup(<GrnDocument data={data} />) });
}
