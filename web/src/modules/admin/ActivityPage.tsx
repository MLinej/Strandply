import { History, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ACTIVITY_ACTION_KEYS, type ActivityEntryView } from '@contracts/admin';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, Modal, Pagination, Pill, Select, useToast, type Column } from '@/components/ui';
import type { Tone } from '@/lib/status';
import { errorMessage } from '../samples/ui/errors';
import { useSearchParam, useUrlState } from '../samples/ui/list-state';
import { PageHeader } from '../samples/ui/PageHeader';
import { useActivity, usePurgeActivity } from './api';

type ActionKey = ActivityEntryView['action'];
const PAGE_SIZE = 25;
const ACTION_LABEL: Record<ActionKey, string> = {
  Login: 'Signed in',
  LoginFailed: 'Failed sign-in',
  Logout: 'Signed out',
  Create: 'Created',
  Edit: 'Edited',
  Delete: 'Deleted',
  PermissionChange: 'Permissions',
  Purge: 'Log purge',
  Import: 'Import',
  Export: 'Export',
  Approve: 'Approved',
  StatusChange: 'Status',
  Print: 'Print',
  Share: 'Share',
};
const ACTION_TONE: Partial<Record<ActionKey, Tone>> = {
  Create: 'green',
  Approve: 'green',
  Delete: 'red',
  LoginFailed: 'red',
  Purge: 'red',
  PermissionChange: 'amber',
  Edit: 'purple',
  StatusChange: 'purple',
};

const stamp = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

function PurgeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const purge = usePurgeActivity();
  const [days, setDays] = useState('90');
  const n = Number(days);
  const valid = Number.isInteger(n) && n >= 1;
  async function onPurge() {
    try {
      const r = await purge.mutateAsync(n);
      toast({ tone: 'success', title: r.purged === 1 ? '1 entry removed' : `${r.purged} entries removed` });
      onClose();
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t purge the log', description: errorMessage(err) });
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Purge old activity"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Trash2} disabled={!valid} loading={purge.isPending} onClick={onPurge}>
            Purge
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Remove entries older than (days)" type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} error={valid ? undefined : 'Enter a whole number of days, 1 or more'} containerClassName="w-[260px]" />
        <p className="text-sm text-muted">This can’t be undone. The purge itself is recorded in the log.</p>
      </div>
    </Modal>
  );
}

/** Activity log (legacy renderActivityLog / purgeOldLogs). */
export function ActivityPage() {
  const { user } = useSession();
  const url = useUrlState(['action', 'from', 'to'] as const);
  const [search, setSearch] = useSearchParam(url);
  const [purging, setPurging] = useState(false);
  const list = useActivity({
    q: url.q || undefined,
    page: url.page,
    pageSize: PAGE_SIZE,
    filters: {
      action: (url.values.action || undefined) as ActionKey | undefined,
      from: url.values.from || undefined,
      to: url.values.to || undefined,
    },
  });

  const columns: Column<ActivityEntryView>[] = [
    { id: 'when', header: 'When', width: '170px', className: 'text-muted tabular-nums', cell: (a) => stamp(a.createdAt) },
    {
      id: 'user',
      header: 'User',
      width: '180px',
      cell: (a) => (
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{a.userName ?? 'System'}</span>
          {a.userRole && <span className="text-caption text-faint">{a.userRole}</span>}
        </span>
      ),
    },
    { id: 'action', header: 'Action', width: '130px', cell: (a) => <Pill tone={ACTION_TONE[a.action] ?? 'neutral'}>{ACTION_LABEL[a.action] ?? a.action}</Pill> },
    {
      id: 'details',
      header: 'Details',
      cell: (a) => (
        <span className="flex flex-col leading-tight">
          <span>{a.details || '—'}</span>
          {a.entityType && <span className="text-caption text-faint">{[a.entityType, a.entityId].filter(Boolean).join(' · ')}</span>}
        </span>
      ),
    },
  ];
  const filtered = !!(url.q || url.values.action || url.values.from || url.values.to);

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Activity log"
        description="Sign-ins, changes and exports, newest first."
        actions={
          user.isSuperadmin && (
            <Button icon={Trash2} onClick={() => setPurging(true)}>
              Purge old entries
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-end gap-2.5">
        <Input aria-label="Search activity" icon={Search} placeholder="User or details" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[280px]" />
        <Select aria-label="Action" placeholder="All actions" options={ACTIVITY_ACTION_KEYS.map((k) => ({ value: k, label: ACTION_LABEL[k] }))} value={url.values.action} onChange={(e) => url.set({ action: e.target.value })} containerClassName="w-[170px]" />
        <Input aria-label="From" type="date" value={url.values.from} max={url.values.to || undefined} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[160px]" />
        <Input aria-label="To" type="date" value={url.values.to} min={url.values.from || undefined} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[160px]" />
        {filtered && (
          <Button variant="ghost" onClick={() => { setSearch(''); url.set({ action: null, from: null, to: null }); }}>
            Clear
          </Button>
        )}
      </div>
      <DataTable
        label="Activity"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(a) => a.id}
        minWidth={820}
        loading={list.isLoading}
        empty={<EmptyState icon={History} title={filtered ? 'Nothing matches' : 'No activity yet'} />}
        footer={(list.data?.total ?? 0) > 0 && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <PurgeDialog open={purging} onClose={() => setPurging(false)} />
    </div>
  );
}
