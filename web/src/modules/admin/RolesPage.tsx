import { Lock, RotateCcw, Save } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ACTION_KEYS, PAGE_KEYS, WIDGET_KEYS, type RoleKey } from '@contracts/admin';
import type { PermissionSetView } from '@contracts/session';
import { useSession } from '@/app/session';
import { Button, Card, Skeleton, useToast } from '@/components/ui';
import { timeAgo } from '@/lib/format';
import { ConfirmDialog } from '../samples/ui/ConfirmDialog';
import { errorMessage } from '../samples/ui/errors';
import { PageHeader } from '../samples/ui/PageHeader';
import { useResetRolePermissions, useRolePermissions, useSaveRolePermissions } from './api';

type Section = keyof PermissionSetView;
const SECTIONS: { key: Section; title: string; items: readonly string[]; label: Record<string, string> }[] = [
  {
    key: 'pages',
    title: 'Samples & admin pages',
    items: PAGE_KEYS.filter((k) => !k.startsWith('vendor') && !k.startsWith('purchase_')),
    label: {
      dashboard: 'Dashboard',
      requests: 'Sample requests',
      dispatch: 'Sample dispatch',
      tracking: 'Tracking',
      parties: 'Parties',
      couriers: 'Couriers',
      products: 'Products',
      reports: 'Reports',
      notifications: 'Notifications',
      users: 'Users',
      settings: 'Settings',
    },
  },
  {
    key: 'pages',
    title: 'Vendors pages',
    items: PAGE_KEYS.filter((k) => k.startsWith('vendor')),
    label: { vendors: 'Vendors (list, compare, find)', vendor_reports: 'Vendor reports', vendor_masters: 'Vendor masters', vendor_settings: 'Vendor settings' },
  },
  {
    key: 'pages',
    title: 'Purchase pages',
    items: PAGE_KEYS.filter((k) => k.startsWith('purchase_')),
    label: {
      purchase_dashboard: 'Dashboard, reports, audit',
      purchase_entries: 'Register, trucks, returns, documents',
      purchase_orders: 'Purchase orders',
      purchase_notes: 'Debit / credit notes',
      purchase_inventory: 'Raw material stock',
    },
  },
  {
    key: 'actions',
    title: 'Actions',
    items: ACTION_KEYS,
    label: { edit: 'Add and edit', delete: 'Delete', approve: 'Approve requests', print: 'Print', export: 'Export', dashboard_full: 'Full dashboard', vendor_approve: 'Approve vendors', purchase_approve: 'Approve purchases' },
  },
  {
    key: 'widgets',
    title: 'Dashboard tiles',
    items: WIDGET_KEYS,
    label: { total: 'Total samples', pending: 'Pending', delivered: 'Delivered', delayed: 'Delayed', parties: 'Parties', couriers: 'Couriers' },
  },
];

type Matrix = Record<RoleKey, PermissionSetView>;
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const samePerms = (a: PermissionSetView, b: PermissionSetView) => (['pages', 'actions', 'widgets'] as const).every((k) => sameSet(a[k], b[k]));

/** Role permissions matrix (legacy renderPermMatrix / savePerms / resetPerms). Only a Super Admin edits it. */
export function RolesPage() {
  const toast = useToast();
  const { user } = useSession();
  const roles = useRolePermissions();
  const save = useSaveRolePermissions();
  const reset = useResetRolePermissions();
  const [draft, setDraft] = useState<Matrix | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const editable = !!user.isSuperadmin;

  const saved = useMemo(() => (roles.data ? (Object.fromEntries(roles.data.map((r) => [r.role, r.permissions])) as Matrix) : null), [roles.data]);
  useEffect(() => setDraft(saved), [saved]);
  const changed = saved && draft ? (roles.data ?? []).map((r) => r.role).filter((r) => !samePerms(saved[r], draft[r])) : [];

  function toggle(role: RoleKey, section: Section, item: string) {
    setDraft((d) => {
      if (!d) return d;
      const list = d[role][section];
      const next = list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
      return { ...d, [role]: { ...d[role], [section]: next } };
    });
  }

  async function onSave() {
    if (!draft) return;
    try {
      for (const role of changed) await save.mutateAsync({ role, permissions: draft[role] });
      toast({ tone: 'success', title: 'Permissions saved', description: 'They apply on each user’s next click.' });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t save permissions', description: errorMessage(err) });
    }
  }
  async function onReset() {
    try {
      await reset.mutateAsync();
      toast({ tone: 'success', title: 'Permissions reset to the defaults' });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t reset', description: errorMessage(err) });
    }
    setConfirmReset(false);
  }

  const rows = roles.data ?? [];
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Roles & permissions"
        description={editable ? 'Tick what each role can see and do. Super Admin always has everything.' : 'What each role can see and do. Only a Super Admin can change this.'}
        actions={
          editable && (
            <>
              <Button icon={RotateCcw} onClick={() => setConfirmReset(true)}>
                Reset to defaults
              </Button>
              {changed.length > 0 && <Button onClick={() => setDraft(saved)}>Discard</Button>}
              <Button variant="primary" icon={Save} disabled={changed.length === 0} loading={save.isPending} onClick={onSave}>
                Save{changed.length > 0 ? ` (${changed.length})` : ''}
              </Button>
            </>
          )
        }
      />
      {!draft ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-base">
              <thead>
                <tr className="border-b border-divider bg-page">
                  <th className="px-4 py-2.5 text-left text-label font-semibold uppercase tracking-label text-muted">Permission</th>
                  {rows.map((r) => (
                    <th key={r.role} scope="col" className="px-3 py-2.5 text-center">
                      <span className="flex flex-col items-center gap-0.5">
                        <span className="flex items-center gap-1 font-semibold">
                          {r.locked && <Lock className="h-3.5 w-3.5 text-faint" aria-hidden />}
                          {r.label}
                        </span>
                        <span className="text-caption font-normal text-faint">{r.updatedAt ? `Changed ${timeAgo(r.updatedAt)}` : 'Default'}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((s) => (
                  <Fragment key={s.title}>
                    <tr className="bg-page/60">
                      <th colSpan={rows.length + 1} scope="colgroup" className="px-4 pb-1 pt-3 text-left text-label font-semibold uppercase tracking-label text-primary">
                        {s.title}
                      </th>
                    </tr>
                    {s.items.map((item) => (
                      <tr key={item} className="h-row border-b border-divider">
                        <th scope="row" className="px-4 text-left font-medium">
                          {s.label[item] ?? item}
                        </th>
                        {rows.map((r) => {
                          const on = r.locked || draft[r.role][s.key].includes(item);
                          const dirty = !r.locked && saved![r.role][s.key].includes(item) !== on;
                          return (
                            <td key={r.role} className="px-3 text-center">
                              <input
                                type="checkbox"
                                className="h-4 w-4 cursor-pointer accent-primary disabled:cursor-default"
                                aria-label={`${r.label}: ${s.label[item] ?? item}`}
                                checked={on}
                                disabled={!editable || r.locked}
                                onChange={() => toggle(r.role, s.key, item)}
                              />
                              {dirty && <span className="ml-1 text-caption text-primary" title="Not saved yet">•</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <ConfirmDialog open={confirmReset} title="Reset all roles to the defaults?" confirmLabel="Reset" danger busy={reset.isPending} onConfirm={onReset} onClose={() => setConfirmReset(false)}>
        Every custom change to Admin, Dispatch, Marketing and Management is lost. Users see the new menus on their next click.
      </ConfirmDialog>
    </div>
  );
}
