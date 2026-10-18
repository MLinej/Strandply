// Building blocks for printed documents (MRN, GRN, tax invoice, chipping, matt weight, job card…), matching the
// house print formats: logo header, bordered detail cards, figure tiles, grey-headed tables, status pills,
// signature row and a page footer. Inline styles only: documents render in a bare iframe without the app's CSS.
import type { CSSProperties, ReactNode } from 'react';
import type { CompanyBlock } from '@contracts/sampletrack';
import { formatDate, formatDateTime } from './format';

export const INK = '#172033';
export const MUTED = '#667085';
export const FAINT = '#98A2B3';
export const RED = '#D71920';
export const LINE = '#E6E8EC';
export const SOFT = '#F5F6F8';

export const LOGO_SRC = '/brand/strandply-lockup.png';
export const BASE_FONT: CSSProperties = { fontFamily: 'Inter, Arial, sans-serif', fontSize: 10.5, color: INK, lineHeight: 1.35 };

/** Print CSS for kit documents: each <Sheet> is one page; the footer sits at its bottom. */
export const KIT_CSS = 'html, body { width: auto; min-height: 0; } table { border-collapse: collapse; } .kit-sheet { page-break-after: always; break-after: page; } .kit-sheet:last-child { page-break-after: auto; break-after: auto; }';

export type Tone = 'green' | 'amber' | 'red' | 'neutral' | 'purple';
const TONES: Record<Tone, [string, string]> = {
  green: ['#ECFDF3', '#15803D'],
  amber: ['#FFF7ED', '#C2410C'],
  red: ['#FFF1F2', RED],
  neutral: ['#F2F4F7', MUTED],
  purple: ['#F5F3FF', '#6D28D9'],
};

/** "—" for empty values. */
export const dash = (v: ReactNode) => (v === null || v === undefined || v === '' ? '—' : v);
export const day = (iso: string | null | undefined) => (iso ? formatDate(iso.slice(0, 10)) : '—');
export const when = (iso: string | null | undefined) => (iso ? formatDateTime(iso) : '—');

export function Pill({ tone = 'neutral', children, outline }: { tone?: Tone; children: ReactNode; outline?: boolean }) {
  const [bg, fg] = TONES[tone];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: outline ? '1px 10px' : '1.5px 8px',
        borderRadius: outline ? 4 : 99,
        fontSize: outline ? 9.5 : 9,
        fontWeight: 700,
        letterSpacing: outline ? 1.2 : 0,
        background: outline ? '#fff' : bg,
        color: fg,
        border: outline ? `1.3px solid ${fg}` : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/**
 * Page header: logo (with the company address block when `letterhead`), the document title on the right with
 * extra lines under it, and a rule underneath (red on job cards, ink elsewhere).
 */
export function DocHeader({ company, title, right, letterhead = false, rule = INK }: { company: CompanyBlock; title: string; right?: ReactNode; letterhead?: boolean; rule?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6mm', borderBottom: `2px solid ${rule}`, paddingBottom: '3.5mm', marginBottom: '4mm' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5mm' }}>
        <img src={LOGO_SRC} alt={company.name} style={{ height: '11mm', width: 'auto', display: 'block' }} />
        {letterhead && (
          <div style={{ borderLeft: `1px solid ${LINE}`, paddingLeft: '5mm' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700 }}>{company.name.toUpperCase()}</div>
            {company.city && <div style={{ fontSize: 9.5, color: MUTED }}>{company.city}</div>}
            {(company.phone || company.email) && <div style={{ fontSize: 9.5, color: MUTED }}>{[company.phone && `Ph ${company.phone}`, company.email].filter(Boolean).join(' · ')}</div>}
            {(company.gst || company.pan) && (
              <div style={{ fontSize: 9.5, color: MUTED }}>{[company.gst && `GSTIN ${company.gst}`, company.pan && `PAN ${company.pan}`, company.stateCode && `State code ${company.stateCode}`].filter(Boolean).join(' · ')}</div>
            )}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', whiteSpace: 'nowrap', color: rule === RED ? RED : INK }}>{title}</div>
        {right}
      </div>
    </div>
  );
}

/** A bordered card with a small uppercase heading. */
export function Box({ title, titleRight, children, accent, style, labelColor = MUTED }: { title?: ReactNode; titleRight?: ReactNode; children: ReactNode; accent?: boolean; style?: CSSProperties; labelColor?: string }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderLeft: accent ? `3px solid ${INK}` : `1px solid ${LINE}`, borderRadius: 6, padding: '3mm 4mm', breakInside: 'avoid', ...style }}>
      {title && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.8mm' }}>
          <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: labelColor }}>{title}</span>
          {titleRight}
        </div>
      )}
      {children}
    </div>
  );
}

/** Label / value rows inside a Box. */
export function KV({ rows, labelWidth = '30mm', dense }: { rows: [string, ReactNode, boolean?][]; labelWidth?: string; dense?: boolean }) {
  const pad = dense ? '0.45mm 0' : '0.9mm 0';
  return (
    <table style={{ width: '100%' }}>
      <tbody>
        {rows.map(([k, v, strong]) => (
          <tr key={k}>
            <td style={{ color: MUTED, padding: pad, width: labelWidth, verticalAlign: 'top' }}>{k}</td>
            <td style={{ padding: pad, fontWeight: strong ? 700 : 500 }}>{dash(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Grid({ cols, gap = '4mm', children, style }: { cols: string; gap?: string; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: 'grid', gridTemplateColumns: cols, gap, marginBottom: '4mm', ...style }}>{children}</div>;
}

/** Figure tile: small caps label, big value, muted line under it. `alert` outlines it red. */
export function Tile({ label, value, sub, alert }: { label: string; value: ReactNode; sub?: ReactNode; alert?: boolean }) {
  return (
    <div style={{ border: `1px solid ${alert ? '#FCA5A5' : LINE}`, borderRadius: 6, padding: '2.5mm 3.5mm' }}>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: MUTED }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: alert ? RED : INK, margin: '0.6mm 0' }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: MUTED }}>{sub}</div>}
    </div>
  );
}

export interface Col {
  header: ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string;
}

/** Grey-headed table. `foot` is a bold total row on a soft background. */
export function DocTable({ cols, rows, foot, label, minRows = 0, compact }: { cols: Col[]; rows: ReactNode[][]; foot?: ReactNode[]; label?: string; minRows?: number; compact?: boolean }) {
  const cell = (i: number, extra: CSSProperties = {}): CSSProperties => ({ textAlign: cols[i]?.align ?? 'left', padding: compact ? '1.2mm 2mm' : '2.2mm 2mm', borderBottom: `1px solid ${LINE}`, verticalAlign: 'top', fontVariantNumeric: 'tabular-nums', ...extra });
  const blanks = Math.max(0, minRows - rows.length);
  return (
    <div style={{ marginBottom: '4mm' }}>
      {label && <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: MUTED, marginBottom: '1.5mm' }}>{label}</div>}
      <table style={{ width: '100%' }}>
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={i} style={{ ...cell(i), width: c.width, background: SOFT, color: MUTED, fontSize: 8, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', borderBottom: `1px solid ${LINE}`, padding: '2mm' }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, j) => (
            <tr key={j} style={{ breakInside: 'avoid' }}>
              {r.map((v, i) => (
                <td key={i} style={cell(i)}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
          {Array.from({ length: blanks }, (_, j) => (
            <tr key={`b${j}`}>
              {cols.map((_, i) => (
                <td key={i} style={{ ...cell(i), height: compact ? '5mm' : '6.5mm' }}>
                  {i === 0 ? rows.length + j + 1 : ''}
                </td>
              ))}
            </tr>
          ))}
          {foot && (
            <tr>
              {foot.map((v, i) => (
                <td key={i} style={cell(i, { fontWeight: 800, background: '#F9FAFB', borderBottom: 'none' })}>
                  {v}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Ruled lines to write on (job cards). */
export function WriteLines({ count, heightMm = 7 }: { count: number; heightMm?: number }) {
  return (
    <div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ borderBottom: `1px solid ${LINE}`, height: `${heightMm}mm` }} />
      ))}
    </div>
  );
}

/** An empty line to write on (a field left blank on the record). */
export const WriteBlank = () => <span style={{ display: 'inline-block', borderBottom: `1px solid ${LINE}`, width: '40mm', height: '3.5mm' }} />;

/** ☐ Yes ☐ No style choices. */
export function Checks({ options, checked }: { options: string[]; checked?: string | null }) {
  return (
    <span>
      {options.map((o) => (
        <span key={o} style={{ marginRight: '4mm', whiteSpace: 'nowrap' }}>
          {o} <span style={{ display: 'inline-block', width: '3mm', height: '3mm', border: `1px solid ${INK}`, borderRadius: 1, verticalAlign: '-0.3mm', textAlign: 'center', fontSize: 8, lineHeight: '3mm' }}>{checked === o ? '✓' : ''}</span>
        </span>
      ))}
    </span>
  );
}

export interface Signer {
  role: string;
  name?: string | null;
  at?: string | null;
}

/** Signature row: the person and time above the line when known, the role under it. */
export function Signatures({ signers, marginTopMm = 10 }: { signers: Signer[]; marginTopMm?: number }) {
  return (
    <div style={{ display: 'flex', gap: '6mm', marginTop: `${marginTopMm}mm`, breakInside: 'avoid' }}>
      {signers.map((s) => (
        <div key={s.role} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ minHeight: signers.some((x) => x.name || x.at) ? '9mm' : '7mm', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            {s.name && <div style={{ fontWeight: 700 }}>{s.name}</div>}
            {s.at && <div style={{ fontSize: 9, color: MUTED }}>{when(s.at)}</div>}
          </div>
          <div style={{ borderTop: `1px solid ${LINE}`, marginTop: '1.5mm', paddingTop: '1.5mm', color: MUTED }}>{s.role}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * One printed page: content at the top, signatures and the footer line at the bottom. `minHeightMm` is the
 * printable height (paper minus margins) so the footer sits at the page foot.
 */
export function Sheet({ children, footer, bottom, minHeightMm, fontSize }: { children: ReactNode; footer: ReactNode; bottom?: ReactNode; minHeightMm: number; fontSize?: number }) {
  return (
    <div className="kit-sheet" style={{ ...BASE_FONT, ...(fontSize ? { fontSize } : {}), minHeight: `${minHeightMm}mm`, display: 'flex', flexDirection: 'column' }}>
      <div>{children}</div>
      <div style={{ marginTop: 'auto' }}>
        {bottom}
        <div style={{ textAlign: 'center', color: FAINT, fontSize: 8.5, marginTop: '3mm' }}>{footer}</div>
      </div>
    </div>
  );
}

// ── Amounts in words (Indian system) ────────────────────────────────

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const twoDigits = (n: number) => (n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`);
function threeDigits(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? twoDigits(r) : ''].filter(Boolean).join(' ');
}
function rupeeWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${rupeeWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(' ');
}

/** 11071940 paise → "Rupees One Lakh Ten Thousand Seven Hundred Nineteen and Forty Paise Only". */
export function amountInWords(paise: number): string {
  const p = Math.round(Math.abs(paise));
  const rupees = Math.floor(p / 100);
  const ps = p % 100;
  return `Rupees ${rupeeWords(rupees)}${ps ? ` and ${twoDigits(ps)} Paise` : ''} Only`;
}
