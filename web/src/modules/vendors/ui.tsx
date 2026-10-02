import { clsx } from 'clsx';
import { Star } from 'lucide-react';
import type { CategoryColor, VendorAction, VendorStatus } from '@contracts/vendors';
import { Pill } from '@/components/ui';
import type { Tone } from '@/lib/status';

export const STATUS_LABEL: Record<VendorStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  active: 'Active',
  inactive: 'Inactive',
  blacklisted: 'Blacklisted',
};

/** What each status means, from the legacy section subtitles. */
export const STATUS_NOTE: Record<VendorStatus, string> = {
  pending: 'Awaiting approval',
  approved: 'Approved, activate to raise POs',
  active: 'Live vendors ready for procurement',
  inactive: 'Saved, not yet submitted',
  blacklisted: 'Do not issue POs',
};

const STATUS_TONE: Record<VendorStatus, Tone> = {
  pending: 'amber',
  approved: 'purple',
  active: 'green',
  inactive: 'neutral',
  blacklisted: 'red',
};

export function VendorStatusPill({ status }: { status: VendorStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}

/** Category colour themes (legacy c1…c12): background and text. Each pair is ≥ 4.5:1. */
export const CATEGORY_STYLE: Record<CategoryColor, { bg: string; fg: string; label: string }> = {
  yellow: { bg: '#FEF9C3', fg: '#713F12', label: 'Yellow' },
  indigo: { bg: '#E0E7FF', fg: '#3730A3', label: 'Indigo' },
  pink: { bg: '#FCE7F3', fg: '#9D174D', label: 'Pink' },
  blue: { bg: '#DBEAFE', fg: '#1E3A8A', label: 'Blue' },
  green: { bg: '#D1FAE5', fg: '#065F46', label: 'Green' },
  purple: { bg: '#EDE9FE', fg: '#5B21B6', label: 'Purple' },
  grey: { bg: '#F1F2F4', fg: '#4B5563', label: 'Grey' },
  orange: { bg: '#FFF7ED', fg: '#C2410C', label: 'Orange' },
  red: { bg: '#FEF2F2', fg: '#B91C1C', label: 'Red' },
  teal: { bg: '#F0FDFA', fg: '#0F766E', label: 'Teal' },
  amber: { bg: '#FFFBEB', fg: '#B45309', label: 'Amber' },
  lime: { bg: '#F7FEE7', fg: '#4D7C0F', label: 'Lime' },
};

export function CategoryPill({ name, icon, color, className }: { name: string; icon?: string | null; color: CategoryColor; className?: string }) {
  const s = CATEGORY_STYLE[color];
  return (
    <span
      className={clsx('inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-label font-semibold', className)}
      style={{ background: s.bg, color: s.fg }}
    >
      {icon && <span aria-hidden>{icon}</span>}
      {name}
    </span>
  );
}

/** Read-only stars with the number, or a dash when not rated. */
export function Stars({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${rating} out of 5`}>
      <span className="inline-flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={13} strokeWidth={1.8} className={i <= rating ? 'fill-amber text-amber' : 'text-border'} />
        ))}
      </span>
      <span className="text-caption text-muted">{rating}.0</span>
    </span>
  );
}

/** 1–5 star picker; clicking the current value clears it. */
export function StarInput({ value, onChange, label = 'Rating' }: { value: number | null; onChange: (v: number | null) => void; label?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex h-9 items-center gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} star${i === 1 ? '' : 's'}`}
            onClick={() => onChange(value === i ? null : i)}
            className="rounded p-0.5 hover:bg-page"
          >
            <Star size={20} strokeWidth={1.8} className={value && i <= value ? 'fill-amber text-amber' : 'text-border'} />
          </button>
        ))}
        {value && <span className="ml-1 text-caption text-muted">{value} of 5</span>}
      </div>
    </div>
  );
}

/** Workflow steps offered for a status (legacy openDet footer). `approval` = the vendor_approve action. */
export function stepsFor(status: VendorStatus, { edit, approval }: { edit: boolean; approval: boolean }): VendorAction[] {
  const out: VendorAction[] = [];
  if (edit && status === 'inactive') out.push('submit');
  if (approval) {
    if (status === 'pending') out.push('approve');
    if (status === 'approved') out.push('activate');
    if (status === 'blacklisted') out.push('reinstate');
    if (status !== 'blacklisted') out.push('blacklist');
  }
  return out;
}

export const STEP_LABEL: Record<VendorAction, string> = {
  submit: 'Submit for review',
  approve: 'Approve',
  activate: 'Activate',
  blacklist: 'Blacklist',
  reinstate: 'Reinstate',
};

export const STEP_DONE: Record<VendorAction, string> = {
  submit: 'submitted for review',
  approve: 'approved',
  activate: 'activated',
  blacklist: 'blacklisted',
  reinstate: 'reinstated',
};
