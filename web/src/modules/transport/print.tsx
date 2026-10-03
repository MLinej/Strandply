import { renderToStaticMarkup } from 'react-dom/server';
import { PAGES, printHtml } from '@/lib/print';
import type { Transporter } from '@contracts/transport';
import { fetchOrderPrint } from './api';
import { d, inr, placeText, stamp, weight } from './ui';

// Inline styles only: this renders in a bare iframe without the app's CSS.
const INK = '#172033';
const MUTED = '#667085';
const FAINT = '#98A2B3';
const RED = '#D71920';
const LINE = '#E6E8EC';

/** Legacy order-form terms, word for word. */
export const ORDER_TERMS = [
  'Vehicle to report at loading point on specified date.',
  'Driver to carry all valid documents.',
  'Rate is final as per approved freight authorization.',
  'POD to be submitted within 3 days of delivery.',
  'Damage claims within 24 hours.',
  'Payment as per credit terms after valid invoice.',
];

/** Transport order form on A4 for the transporter to accept (legacy printOrder). */
export async function printOrder(id: string) {
  const { company, order: o, generatedAt } = await fetchOrderPrint(id);
  const h4 = { fontSize: 7.5, fontWeight: 700, color: FAINT, textTransform: 'uppercase' as const, letterSpacing: 0.6, borderBottom: `1px solid ${LINE}`, paddingBottom: '1mm', marginBottom: '2mm' };
  const row = (k: string, v: string | null | undefined, strong = false) => (
    <div style={{ display: 'flex', gap: '2mm', marginBottom: '1mm' }}>
      <span style={{ minWidth: '30mm', color: FAINT, fontWeight: 600 }}>{k}</span>
      <span style={{ fontWeight: strong ? 700 : 500 }}>{v || '—'}</span>
    </div>
  );
  const chip = (s: string | null) => s && <span style={{ fontFamily: 'monospace', fontSize: 8.5, fontWeight: 700, padding: '0.5mm 2mm', border: `1px solid ${LINE}`, borderRadius: 3 }}>{s}</span>;
  const t = o.transporter;
  await printHtml({
    page: PAGES.requestSlip,
    marginMm: 14,
    css: 'html, body { width: auto; min-height: 0; }',
    title: o.orderNo,
    bodyHtml: renderToStaticMarkup(
      <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 10, color: INK }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `2.5px solid ${RED}`, paddingBottom: '2mm', marginBottom: '4mm' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: RED }}>{company.name}</div>
            <div style={{ fontSize: 9, color: MUTED }}>{[company.city, company.phone, company.gst && `GSTIN ${company.gst}`].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: 0.6 }}>Order form</div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{o.orderNo}</div>
            <div style={{ fontSize: 8.5, color: FAINT }}>{d(o.date)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1.5mm', alignItems: 'center', marginBottom: '4mm', fontSize: 8, color: FAINT }}>
          <span style={{ fontWeight: 700 }}>LINKED:</span> {chip(o.inqNo)} → {chip(o.rcNo)} → {chip(o.approvalNo)} → {chip(o.orderNo)}
          {o.status === 'cancelled' && <span style={{ marginLeft: 'auto', color: RED, fontWeight: 800 }}>CANCELLED</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4mm 7mm', marginBottom: '4mm' }}>
          <div>
            <div style={h4}>Transporter</div>
            {row('Name', t.name, true)}
            {row('Contact', t.contactPerson)}
            {row('Phone', t.phone)}
            {row('GSTIN', t.gstin)}
            {row('Address', [t.address, t.city, t.state].filter(Boolean).join(', '))}
          </div>
          <div>
            <div style={h4}>Route & shipment</div>
            {row('From', placeText(o.from), true)}
            {row('To', placeText(o.to), true)}
            {row('Vehicle', o.vehicle)}
            {row('Delivery', o.deliveryType)}
            {row('Freight paid by', o.freightPaidBy)}
          </div>
          <div>
            <div style={h4}>Material</div>
            {row('Material', o.material, true)}
            {row('Weight', weight(o.weightMt))}
            {row('Date of loading', d(o.pickupDate), true)}
            {row('Expected transit', o.transit)}
          </div>
          <div>
            <div style={h4}>Confirmed rate</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: RED }}>{inr(o.ratePaise)}</div>
            <div style={{ fontSize: 8.5, color: FAINT, marginBottom: '2mm' }}>All-inclusive freight rate</div>
            {row('Payment terms', t.creditTerms, true)}
            {row('Invoice to', [company.name, company.city].filter(Boolean).join(', '))}
          </div>
        </div>
        {o.remarks && <div style={{ marginBottom: '3mm' }}>{row('Remarks', o.remarks)}</div>}
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 4, padding: '2.5mm 3mm', fontSize: 9 }}>
          <div style={{ fontWeight: 700, marginBottom: '1mm' }}>Terms & conditions</div>
          <ol style={{ margin: 0, paddingLeft: '4mm' }}>
            {ORDER_TERMS.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6mm', marginTop: '16mm', fontSize: 9, color: MUTED }}>
          {['Dispatch executive', 'Authorised signatory', 'Transporter acceptance'].map((s, i) => (
            <div key={s} style={{ borderTop: `1px solid ${INK}`, paddingTop: '1mm' }}>
              <div style={{ fontWeight: 700, color: INK }}>{s}</div>
              {i === 2 ? t.name : company.name}
            </div>
          ))}
        </div>
        <div style={{ marginTop: '5mm', textAlign: 'center', color: FAINT, fontSize: 7.5 }}>Generated {stamp(generatedAt)}</div>
      </div>,
    ),
  });
}

/** One transporter's profile on A4: contact, address, tax, bank, vehicles and cities (legacy pdfTp). */
export async function printTransporter(t: Transporter) {
  const h4 = { fontSize: 7.5, fontWeight: 700, color: FAINT, textTransform: 'uppercase' as const, letterSpacing: 0.6, borderBottom: `1px solid ${LINE}`, paddingBottom: '1mm', marginBottom: '2mm' };
  const row = (k: string, v: string | null | undefined) => (
    <div style={{ display: 'flex', gap: '2mm', marginBottom: '1mm' }}>
      <span style={{ minWidth: '28mm', color: FAINT, fontWeight: 600 }}>{k}</span>
      <span>{v || '—'}</span>
    </div>
  );
  await printHtml({
    page: PAGES.requestSlip,
    marginMm: 14,
    css: 'html, body { width: auto; min-height: 0; }',
    title: t.code,
    bodyHtml: renderToStaticMarkup(
      <div style={{ fontFamily: 'Inter, Arial, sans-serif', fontSize: 10, color: INK }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `2.5px solid ${RED}`, paddingBottom: '2mm', marginBottom: '4mm' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: 0.6 }}>Transporter profile</div>
          <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{t.code}</div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{t.name}</div>
        <div style={{ color: MUTED, marginBottom: '4mm' }}>
          {[t.city, t.state, t.pincode].filter(Boolean).join(', ')} · {'★'.repeat(t.rating)}
          {'☆'.repeat(5 - t.rating)} · TDS declaration: {t.tds ? 'Yes' : 'No'}
          {t.active ? '' : ' · INACTIVE'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4mm 7mm', marginBottom: '4mm' }}>
          <div>
            <div style={h4}>Contact</div>
            {row('Contact', t.contactPerson)}
            {row('Mobile', t.phone)}
            {row('Mobile 2', t.phone2)}
            {row('Email', t.email)}
            {row('Address', t.address)}
          </div>
          <div>
            <div style={h4}>Tax & payment</div>
            {row('GSTIN', t.gstin)}
            {row('PAN', t.pan)}
            {row('Credit terms', t.creditTerms)}
          </div>
          <div>
            <div style={h4}>Bank</div>
            {row('Bank', [t.bankName, t.bankBranch].filter(Boolean).join(', '))}
            {row('Account name', t.accountName)}
            {row('Account no.', t.accountNo)}
            {row('IFSC', t.ifsc)}
          </div>
          <div>
            <div style={h4}>Vehicles</div>
            <div style={{ marginBottom: '3mm' }}>{t.vehicles.join(', ') || '—'}</div>
            <div style={h4}>Operating cities</div>
            <div>{t.operatingCities.map((c) => c.city).join(', ') || '—'}</div>
          </div>
        </div>
      </div>,
    ),
  });
}
