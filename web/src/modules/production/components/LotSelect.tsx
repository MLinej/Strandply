import type { LotOption } from '@contracts/production';
import { Select } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { kg, perKg } from '../ui';

/** A Purchase lot picker: lot, vendor, what's left and the net rate. Lots with nothing left are hidden unless picked. */
export function LotSelect({ lots, value, onChange, error, label = 'Lot', ariaLabel }: { lots: LotOption[]; value: string; onChange: (id: string) => void; error?: string; label?: string; ariaLabel?: string }) {
  const shown = lots.filter((l) => l.availKg > 0 || l.purchaseEntryId === value);
  const lot = lots.find((l) => l.purchaseEntryId === value);
  return (
    <div className="min-w-0">
      <Select
        label={label}
        aria-label={ariaLabel}
        placeholder={shown.length ? 'Select lot' : 'No lot has stock left'}
        options={shown.map((l) => ({ value: l.purchaseEntryId, label: `${l.lotNo} · ${l.vendorName.slice(0, 22)} · ${kg(l.availKg)} left · ${perKg(l.netRatePaise)}` }))}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
      />
      {lot && (
        <p className="mt-1 text-caption text-muted">
          Invoice {lot.invoiceNo}, {formatDate(lot.date)} · invoice rate {perKg(lot.invoiceRatePaise)}
          {lot.rateDiffPaise ? ` ${lot.rateDiffPaise > 0 ? '−' : '+'} note ${perKg(Math.abs(lot.rateDiffPaise))}` : ''} = net <strong>{perKg(lot.netRatePaise)}</strong> · <strong>{kg(lot.availKg)}</strong> left
        </p>
      )}
    </div>
  );
}
