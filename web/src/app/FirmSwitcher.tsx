import { SegmentedControl } from '@/components/ui';
import { firmScopeLabel, useSession } from './session';

/**
 * Firm scope control from the Home mockup. Reads and writes the global firm scope, so every screen
 * updates together. Hidden for users with access to a single firm.
 */
export function FirmSwitcher({ className }: { className?: string }) {
  const { firm, firmOptions, setFirm } = useSession();
  if (firmOptions.length < 2) return null;
  return (
    <SegmentedControl
      aria-label="Firm"
      value={firm}
      onChange={setFirm}
      options={firmOptions.map((f) => ({ value: f, label: firmScopeLabel(f) }))}
      className={className}
    />
  );
}
