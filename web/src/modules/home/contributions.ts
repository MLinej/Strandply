import type { LucideIcon } from 'lucide-react';
import type { ModuleKey } from '@/app/modules';

/**
 * What a module adds to Home (Home.dc.html). Each module exports a hook returning one of these,
 * computed from its live API and filtered by the user's permissions. Home never shows a figure
 * that no module has computed.
 */
export interface ModuleHome {
  module: ModuleKey;
  label: string;
  loading: boolean;
  kpis: HomeKpi[];
  pending: PendingItem[];
  glance: GlanceCard | null;
}

export interface HomeKpi {
  id: string;
  label: string;
  value: string;
  meta: string;
  icon: LucideIcon;
  /** The one figure that needs attention gets `bad`. */
  emphasis?: 'bad' | 'warn';
}

export interface PendingItem {
  id: string;
  label: string;
  count: number;
  href: string;
  /** Overdue or past a deadline: red dot and red label, counted in the "overdue" pill. */
  critical?: boolean;
}

export interface GlanceRow {
  label: string;
  value: string;
  tone?: 'bad' | 'warn';
}

export interface GlanceCard {
  title: string;
  href: string;
  rows: GlanceRow[];
  note?: string;
}
