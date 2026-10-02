import { clsx } from 'clsx';
import { MATERIAL_BY_ID, rateUnitOf, type EntryCalc, type MaterialId, type NoteCalc, type TaxSplit, type TaxType } from '@contracts/purchase';
import { inr, qtyFmt } from '../ui';

/**
 * Amount breakup (legacy slip table): A invoice weight, B Strandply weight, C quantity note,
 * D rate-difference note, then what is owed.
 */
export function CalcTable({
  material,
  invQty,
  splQty,
  ratePaise,
  rateDiffPaise,
  taxType,
  calc,
}: {
  material: MaterialId;
  invQty: number;
  splQty: number;
  ratePaise: number;
  rateDiffPaise: number;
  taxType: TaxType;
  calc: EntryCalc;
}) {
  const unit = MATERIAL_BY_ID[material].unit;
  const igst = taxType === 'IGST';
  const tax = (t: TaxSplit, sign = '') => (
    <>
      <td className="px-2 py-1.5 text-right tabular-nums">{sign}{inr(t.basic)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{igst ? '—' : `${sign}${inr(t.cgst + t.sgst)}`}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{igst ? `${sign}${inr(t.igst)}` : '—'}</td>
      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{sign}{inr(t.total)}</td>
    </>
  );
  const noteRow = (code: string, n: NoteCalc | null, label: (n: NoteCalc) => string, rate: number) =>
    n && (
      <tr className={clsx('border-t border-divider', n.type === 'dn' ? 'bg-primary-tint' : 'bg-green-light/50')}>
        <td className="px-2 py-1.5 text-faint">{code}</td>
        <td className="px-2 py-1.5">
          <span className={clsx('mr-1.5 rounded px-1.5 text-label font-semibold', n.type === 'dn' ? 'bg-primary-light text-primary' : 'bg-green-light text-green')}>{n.type.toUpperCase()}</span>
          {label(n)}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{qtyFmt(n.qty)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{inr(rate)}</td>
        {tax(n, n.type === 'dn' ? '−' : '+')}
      </tr>
    );
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full min-w-[640px] text-sm" aria-label="Amount breakup">
        <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
          <tr>
            <th className="w-8 px-2 py-1.5 text-left" />
            <th className="px-2 py-1.5 text-left">Description</th>
            <th className="px-2 py-1.5 text-right">Qty ({unit})</th>
            <th className="px-2 py-1.5 text-right">Rate/{rateUnitOf(MATERIAL_BY_ID[material])}</th>
            <th className="px-2 py-1.5 text-right">Basic</th>
            <th className="px-2 py-1.5 text-right">CGST+SGST</th>
            <th className="px-2 py-1.5 text-right">IGST</th>
            <th className="px-2 py-1.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-divider">
            <td className="px-2 py-1.5 text-faint">A</td>
            <td className="px-2 py-1.5 font-medium">Invoice weight</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{qtyFmt(invQty)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{inr(ratePaise)}</td>
            {tax(calc.invoice)}
          </tr>
          <tr className="border-t border-divider">
            <td className="px-2 py-1.5 text-faint">B</td>
            <td className="px-2 py-1.5 font-medium">Strandply weight</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{qtyFmt(splQty)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{inr(ratePaise)}</td>
            {tax(calc.spl)}
          </tr>
          {noteRow('C', calc.qtyNote, (n) => (n.type === 'dn' ? 'Short received (invoice > Strandply)' : 'Excess received (Strandply > invoice)'), ratePaise)}
          {noteRow('D', calc.rateNote, (n) => `Rate difference ${inr(Math.abs(rateDiffPaise))}${n.type === 'dn' ? ' over' : ' under'} agreed`, Math.abs(rateDiffPaise))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-page font-semibold">
            <td />
            <td className="px-2 py-2" colSpan={6}>
              Payable
              <span className="ml-1 font-normal text-muted">(Strandply total{calc.invoice.total !== calc.invoice.basic + calc.invoice.cgst + calc.invoice.sgst + calc.invoice.igst ? ' + other charges' : ''}{calc.rateNote ? ` ${calc.rateNote.type === 'dn' ? '−' : '+'} rate note` : ''})</span>
            </td>
            <td className="px-2 py-2 text-right text-base tabular-nums">{inr(calc.payable)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
