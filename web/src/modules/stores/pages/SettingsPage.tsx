import { Link } from 'react-router';
import type { StoresSettings } from '@contracts/stores';
import { useSession } from '@/app/session';
import { Card, Skeleton, useToast } from '@/components/ui';
import { errorMessage } from '../../samples/ui/errors';
import { PageHeader } from '../../samples/ui/PageHeader';
import { useSaveStoresSettings, useStoresMeta } from '../api';

const TOGGLES: { key: keyof StoresSettings; title: string; detail: string }[] = [
  { key: 'autoPunchMrn', title: 'Auto-punch MRN date and time', detail: 'Gate entry (Security). The server clock stamps the entry; the guard can’t type a different time.' },
  { key: 'autoPunchGrn', title: 'Auto-punch GRN date and time', detail: 'Receiving (Stores). Off lets Stores enter when the material was actually received.' },
];

const SIGN_OFFS = [
  { step: 'Review a GRN', permission: 'Review GRNs', legacy: 'Reviewer PIN (P K Sinha)' },
  { step: 'Approve a GRN', permission: 'Approve GRNs', legacy: 'Approver PIN (Jimit Mehta)' },
  { step: 'Mark accounted / undo', permission: 'Account GRNs', legacy: 'Accountant PIN (Accounts team)' },
];

/** Stores settings (legacy renderSettings). The PIN roles became role permissions. */
export function SettingsPage() {
  const toast = useToast();
  const { canDo, can } = useSession();
  const meta = useStoresMeta().data;
  const save = useSaveStoresSettings();
  const editable = canDo('edit');

  async function toggle(key: keyof StoresSettings, value: boolean) {
    try {
      await save.mutateAsync({ [key]: value });
      toast({ tone: 'success', title: 'Stores settings saved' });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-3.5 p-6">
      <PageHeader title="Stores settings" description="How gate entries and GRNs are time-stamped, and who signs off each GRN step." />
      <Card title="Date and time">
        {!meta ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="flex flex-col gap-3">
            {TOGGLES.map((t) => (
              <label key={t.key} className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={meta.settings[t.key]}
                  disabled={!editable || save.isPending}
                  onChange={(e) => void toggle(t.key, e.target.checked)}
                />
                <span>
                  <span className="block font-semibold text-ink">{t.title}</span>
                  <span className="block text-sm text-muted">{t.detail}</span>
                </span>
              </label>
            ))}
            <p className="text-caption text-faint">Reviewed, approved and accounted times are always stamped when the step happens and can’t be edited.</p>
          </div>
        )}
      </Card>
      <Card flush title="GRN sign-offs" description="Each step needs its own permission, set per role.">
        <table className="w-full text-sm">
          <thead className="border-y border-divider bg-page text-label font-semibold uppercase tracking-label text-muted">
            <tr>
              <th className="px-5 py-2 text-left">Step</th>
              <th className="px-5 py-2 text-left">Permission</th>
              <th className="px-5 py-2 text-left">Was</th>
            </tr>
          </thead>
          <tbody>
            {SIGN_OFFS.map((s) => (
              <tr key={s.step} className="border-b border-divider last:border-0">
                <td className="px-5 py-2 font-medium">{s.step}</td>
                <td className="px-5 py-2">{s.permission}</td>
                <td className="px-5 py-2 text-muted">{s.legacy}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {can('admin.users') && (
          <p className="px-5 py-3 text-sm">
            <Link to="/admin/roles" className="font-semibold text-primary hover:underline">
              Change who can sign off in Roles
            </Link>
          </p>
        )}
      </Card>
    </div>
  );
}
