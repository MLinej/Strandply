import { clsx } from 'clsx';
import { skuCode, type SkuGroup } from '@contracts/stock';
import { Select } from '@/components/ui';
import { useBalance, type Side } from '../api';
import { groupOption, qtyFmt, skuDetail } from '../ui';

/**
 * Item group (grouped by department) + thickness pills, then the resulting SKU code, its details and
 * current balance (legacy skuPanel).
 */
export function SkuPicker({
  title,
  tone,
  groups,
  value,
  onChange,
  errors = {},
  idPrefix,
}: {
  title: string;
  tone: 'out' | 'in';
  groups: SkuGroup[];
  value: Side | null;
  onChange: (v: Side | null) => void;
  errors?: { groupId?: string; thick?: string };
  idPrefix: string;
}) {
  const g = groups.find((x) => x.id === value?.groupId);
  const ready = g && (g.thicknesses.length === 0 || value?.thick);
  const sku = ready ? skuCode(g, value!.thick) : null;
  const balance = useBalance(sku).data;
  return (
    <fieldset className={clsx('flex flex-col gap-2 rounded border p-3', tone === 'out' ? 'border-primary-border' : 'border-green/40')}>
      <legend className="px-1 text-sm font-semibold">
        <span className={tone === 'out' ? 'text-primary' : 'text-green'}>{tone === 'out' ? 'MINUS −' : 'PLUS +'}</span> {title}
      </legend>
      <Select
        id={`${idPrefix}-group`}
        label="Item"
        placeholder="Select department / item"
        options={groups.map(groupOption)}
        value={value?.groupId ?? ''}
        onChange={(e) => onChange(e.target.value ? { groupId: e.target.value, thick: null } : null)}
        error={errors.groupId}
      />
      {g && g.thicknesses.length > 0 && (
        <div>
          <div className="mb-1 text-sm font-semibold text-ink" id={`${idPrefix}-thick-label`}>
            Thickness
          </div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={`${idPrefix}-thick-label`}>
            {g.thicknesses.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={value?.thick === t}
                onClick={() => onChange({ groupId: g.id, thick: t })}
                className={clsx(
                  'h-7 rounded border px-2 text-sm tabular-nums',
                  value?.thick === t ? 'border-ink bg-ink font-semibold text-card' : 'border-border bg-card text-ink hover:bg-page',
                )}
              >
                {t} mm
              </button>
            ))}
          </div>
          {errors.thick && <p className="mt-1 text-sm text-primary">{errors.thick}</p>}
        </div>
      )}
      {g && g.thicknesses.length === 0 && <p className="text-caption text-faint">Fixed code, no thickness.</p>}
      {sku && (
        <div className="flex items-start justify-between gap-3 rounded bg-page px-3 py-2">
          <div className="min-w-0">
            <div className="text-title font-bold tabular-nums" data-testid={`${idPrefix}-sku`}>
              {sku}
            </div>
            <div className="truncate text-caption text-muted">{skuDetail({ label: g!.label, thick: value!.thick, size: g!.size, grade: g!.grade })}</div>
            <div className="text-caption text-faint">{g!.dept}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-caption text-faint">In stock</div>
            <div className={clsx('font-semibold tabular-nums', balance === 0 && 'text-primary')}>{balance === undefined ? '…' : `${qtyFmt(balance)} ${g!.unit}`}</div>
          </div>
        </div>
      )}
    </fieldset>
  );
}
