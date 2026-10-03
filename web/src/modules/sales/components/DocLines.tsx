import { rateSqftOf, type InvoiceLine, type OrderLine, type SoLineProgress } from '@contracts/sales';
import { inr, qtyFmt, sqmFmt } from '../ui';

const th = 'px-3 py-1.5 text-left';
const thr = 'px-3 py-1.5 text-right';
const td = 'px-3 py-1.5';
const tdr = 'px-3 py-1.5 text-right tabular-nums';

/** Proforma / order lines; with `progress`, what's invoiced and left per line. */
export function OrderLines({ lines, progress }: { lines: OrderLine[]; progress?: SoLineProgress[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm" aria-label="Items">
        <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
          <tr>
            <th className={th}>Item</th>
            <th className={thr}>Pcs</th>
            <th className={thr}>Sq m</th>
            <th className={thr}>Rate / sq m</th>
            <th className={thr}>Rate / sq ft</th>
            <th className={thr}>Weight</th>
            <th className={thr}>Amount</th>
            {progress && <th className={thr}>Invoiced</th>}
            {progress && <th className={thr}>Balance</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-t border-divider">
              <td className={td}>
                <span className="block font-medium">{l.itemName}</span>
                <span className="text-caption text-faint">{[l.brand, l.hsn && `HSN ${l.hsn}`].filter(Boolean).join(' · ')}</span>
              </td>
              <td className={tdr}>{qtyFmt(l.pcs)}</td>
              <td className={tdr}>{sqmFmt(l.qtySqm)}</td>
              <td className={tdr}>{inr(l.ratePaise)}</td>
              <td className={`${tdr} text-muted`}>{inr(rateSqftOf(l.ratePaise))}</td>
              <td className={tdr}>{l.weightKg ? `${qtyFmt(l.pcs * l.weightKg)} kg` : '—'}</td>
              <td className={`${tdr} font-semibold`}>{inr(l.amountPaise)}</td>
              {progress && <td className={tdr}>{qtyFmt(progress[i]!.invoicedPcs)} pcs</td>}
              {progress && <td className={`${tdr} ${progress[i]!.balancePcs > 0 ? 'font-semibold text-ink' : 'text-muted'}`}>{progress[i]!.balancePcs > 0 ? `${qtyFmt(progress[i]!.balancePcs)} pcs` : 'Done'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InvoiceLines({ lines }: { lines: InvoiceLine[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm" aria-label="Items">
        <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
          <tr>
            <th className={th}>Item</th>
            <th className={thr}>SO sq m</th>
            <th className={thr}>Pcs</th>
            <th className={thr}>Sq m</th>
            <th className={thr}>Rate / sq m</th>
            <th className={thr}>Rate / sq ft</th>
            <th className={thr}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-t border-divider">
              <td className={td}>
                <span className="block font-medium">{l.itemName}</span>
                <span className="text-caption text-faint">{[l.brand, l.hsn && `HSN ${l.hsn}`].filter(Boolean).join(' · ')}</span>
              </td>
              <td className={`${tdr} text-muted`}>{sqmFmt(l.soQtySqm)}</td>
              <td className={tdr}>{qtyFmt(l.pcs)}</td>
              <td className={tdr}>{sqmFmt(l.qtySqm)}</td>
              <td className={tdr}>{inr(l.ratePaise)}</td>
              <td className={`${tdr} text-muted`}>{inr(rateSqftOf(l.ratePaise))}</td>
              <td className={`${tdr} font-semibold`}>{inr(l.amountPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
