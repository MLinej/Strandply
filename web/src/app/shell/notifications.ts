import type { ModuleKey } from '../modules';

export interface Notification {
  id: string;
  module: ModuleKey;
  moduleLabel: string;
  title: string;
  when: string;
  tone: 'bad' | 'warn' | 'info';
  href: string;
}

/**
 * Placeholder feed, from the Home mockup's Alerts rail. Phase 0 swaps this for GET /notifications
 * (each module's pending.ts contributes items). Filtered by module permission before display.
 */
export const SAMPLE_NOTIFICATIONS: Notification[] = [
  { id: 'n1', module: 'stores', moduleLabel: 'Stores', title: '1 GRN is waiting for your approval', when: '10 min ago', tone: 'info', href: '/stores/grn' },
  { id: 'n2', module: 'stores', moduleLabel: 'Stores', title: '4 store items at or below minimum', when: 'today', tone: 'warn', href: '/stores/item-stock' },
  { id: 'n3', module: 'transport', moduleLabel: 'Transport', title: '4 trips delayed', when: 'today', tone: 'warn', href: '/transport/trips' },
  { id: 'n4', module: 'accounts', moduleLabel: 'Accounts', title: '₹67,787.06 ITC at risk: 3 bills not in GSTR-2B', when: '17 Sept', tone: 'bad', href: '/accounts/gstr-2b' },
  { id: 'n5', module: 'sales', moduleLabel: 'Sales', title: '1 sales order on credit hold', when: 'yesterday', tone: 'info', href: '/sales/orders' },
];
