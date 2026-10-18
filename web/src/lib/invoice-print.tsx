// The tax invoice layout (house format), shared by the Sales tax invoice, proforma, sales order and the
// Purchase order: letterhead, document details, bill-to / ship-to, item table with GST per line, amount in
// words with the tax summary, bank details and the signature block.
import type { ReactNode } from 'react';
import type { CompanyBlock } from '@contracts/sampletrack';
import { formatAmount } from './format';
import { amountInWords, Box, DocHeader, DocTable, FAINT, Grid, KV, LINE, MUTED, Sheet, Signatures, type Signer } from './print-kit';

export interface InvoiceLineRow {
  name: string;
  /** Small grey line under the name (item code, pieces…). */
  sub?: string | null;
  hsn: string | null;
  qty: number | null;
  uom: string | null;
  /** Paise per uom. */
  ratePaise: number | null;
  taxablePaise: number;
}

export interface InvoiceParty {
  title: string;
  name: string;
  lines: (string | null | undefined)[];
}

export interface InvoiceTotals {
  taxablePaise: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

const amt = (paise: number) => formatAmount(paise / 100);
const qtyF = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 });

export function InvoiceDocument(p: {
  company: CompanyBlock;
  title: string;
  /** "Original for recipient" etc. */
  copyLabel?: string;
  docNo: string;
  dateText: string;
  /** IRN / acknowledgement line under the header. */
  banner?: ReactNode;
  detailsTitle: string;
  left: [string, ReactNode, boolean?][];
  right: [string, ReactNode, boolean?][];
  parties: InvoiceParty[];
  lines: InvoiceLineRow[];
  freightPaise?: number;
  taxType: 'IGST' | 'SG+CG' | 'URD';
  gstPct: number;
  totals: InvoiceTotals;
  /** Remarks, terms and conditions… between the totals and the signatures. */
  extra?: ReactNode;
  showBank?: boolean;
  /** Named sign-off row; without it, "For <company> / Authorised signatory". */
  signers?: Signer[];
  footer: string;
  pageHeightMm: number;
}) {
  const igst = p.taxType === 'IGST';
  const gstHead = igst ? 'IGST %' : p.taxType === 'URD' ? 'GST %' : 'GST %';
  const rate = p.taxType === 'URD' ? 0 : p.gstPct;
  const withTax = (paise: number) => paise + Math.round((paise * rate) / 100);
  const rows: ReactNode[][] = p.lines.map((l, i) => [
    i + 1,
    <span key="n">
      <strong>{l.name}</strong>
      {l.sub && <span style={{ display: 'block', color: FAINT, fontSize: 9 }}>{l.sub}</span>}
    </span>,
    l.hsn ?? '',
    l.qty === null ? '' : qtyF.format(l.qty),
    l.uom ?? '',
    l.ratePaise === null ? '' : amt(l.ratePaise),
    amt(l.taxablePaise),
    rate,
    amt(withTax(l.taxablePaise)),
  ]);
  if (p.freightPaise) rows.push([p.lines.length + 1, <strong key="f">Freight charges</strong>, '996511', '', '', '', amt(p.freightPaise), rate, amt(withTax(p.freightPaise))]);
  const qtyTotal = p.lines.every((l) => l.uom === p.lines[0]?.uom) ? p.lines.reduce((s, l) => s + (l.qty ?? 0), 0) : null;
  const summary: [string, number][] = [['Taxable value', p.totals.taxablePaise]];
  if (p.totals.igst) summary.push([`IGST @ ${p.gstPct}%`, p.totals.igst]);
  if (p.totals.cgst) summary.push([`CGST @ ${p.gstPct / 2}%`, p.totals.cgst], [`SGST @ ${p.gstPct / 2}%`, p.totals.sgst]);
  const c = p.company;
  const bank = [c.bankName, c.bankAccountNo && `A/c ${c.bankAccountNo}`, c.bankIfsc && `IFSC ${c.bankIfsc}`].filter(Boolean).join(' · ');
  return (
    <Sheet
      minHeightMm={p.pageHeightMm}
      bottom={
        p.signers ? (
          <Signatures signers={p.signers} />
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: `1px solid ${LINE}`, paddingTop: '4mm', marginTop: '8mm' }}>
            <div>
              {p.showBank !== false && (
                <>
                  <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: MUTED }}>BANK DETAILS</div>
                  <div>{bank || '—'}</div>
                </>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, marginBottom: '12mm' }}>For {c.name}</div>
              <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: '1.5mm', color: MUTED, minWidth: '45mm' }}>Authorised signatory</div>
            </div>
          </div>
        )
      }
      footer={p.footer}
    >
      <DocHeader
        company={c}
        letterhead
        title={p.title}
        right={
          <>
            {p.copyLabel && <div style={{ fontSize: 9.5, color: MUTED, marginTop: 2 }}>{p.copyLabel}</div>}
            <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>{p.docNo}</div>
            <div style={{ fontSize: 9.5, color: MUTED }}>{p.dateText}</div>
          </>
        }
      />
      {p.banner && <div style={{ fontSize: 8.5, color: MUTED, marginTop: '-1.5mm', marginBottom: '3mm', wordBreak: 'break-all' }}>{p.banner}</div>}
      <Box title={p.detailsTitle} style={{ marginBottom: '4mm' }}>
        <Grid cols="1fr 1fr" gap="10mm" style={{ marginBottom: 0 }}>
          <KV rows={p.left} />
          <KV rows={p.right} />
        </Grid>
      </Box>
      <Grid cols={p.parties.map(() => '1fr').join(' ')}>
        {p.parties.map((x) => (
          <Box key={x.title} title={x.title}>
            <div style={{ fontWeight: 700, fontSize: 11.5 }}>{x.name}</div>
            {x.lines.filter(Boolean).map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </Box>
        ))}
      </Grid>
      <DocTable
        cols={[
          { header: '#', width: '7mm' },
          { header: 'Item' },
          { header: 'HSN/SAC', width: '18mm' },
          { header: 'Qty', align: 'right', width: '16mm' },
          { header: 'UOM', width: '13mm' },
          { header: 'Rate', align: 'right', width: '20mm' },
          { header: 'Taxable', align: 'right', width: '24mm' },
          { header: gstHead, align: 'right', width: '15mm' },
          { header: 'Amount', align: 'right', width: '26mm' },
        ]}
        rows={rows}
        foot={['', 'Total', '', qtyTotal === null ? '' : qtyF.format(qtyTotal), '', '', amt(p.totals.taxablePaise), '', amt(p.totals.total)]}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10mm', alignItems: 'flex-start', marginBottom: '4mm', breakInside: 'avoid' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, color: MUTED, marginBottom: '1mm' }}>AMOUNT IN WORDS</div>
          <div style={{ fontWeight: 700 }}>{amountInWords(p.totals.total)}</div>
        </div>
        <div style={{ width: '78mm' }}>
          {summary.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.8mm 0', color: MUTED }}>
              <span>{k}</span>
              <span style={{ color: '#172033' }}>Rs. {amt(v)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #172033', marginTop: '1mm', paddingTop: '1.5mm', fontSize: 12.5, fontWeight: 800 }}>
            <span>Grand total</span>
            <span>Rs. {amt(p.totals.total)}</span>
          </div>
        </div>
      </div>
      {p.extra}
    </Sheet>
  );
}

/** "Maharashtra (27)" from a state and GSTIN. */
export const stateWithCode = (state: string | null | undefined, gstin: string | null | undefined) => {
  const code = gstin && /^\d\d/.test(gstin) ? gstin.slice(0, 2) : null;
  return state ? `${state}${code ? ` (${code})` : ''}` : code ? `State code ${code}` : null;
};

/** Due date from "30 Days" style payment terms. */
export function dueDate(date: string, terms: string | null | undefined): string | null {
  const days = Number(/(\d+)\s*day/i.exec(terms ?? '')?.[1]);
  if (!days) return null;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
