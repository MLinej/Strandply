import { CalendarClock, Check, Download, MessageCircle, NotebookPen, Phone, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { FOLLOWUP_STATUSES, FOLLOWUP_TYPES, type FollowupView } from '@contracts/crm';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, Pagination, Select, Tabs, useToast, type Column } from '@/components/ui';
import { errorMessage } from '../../samples/ui/errors';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { BarList } from '../../purchase/ui';
import { exportCrm, useBoard, useCrmMeta, useCrmReports, useRecords, useSaveRecord } from '../api';
import { RecordForm, type FieldDef } from '../components/RecordForm';
import { FOLLOWUP_FIELDS } from '../fields';
import { d, FollowupPill, PriorityPill, telLink, waLink } from '../ui';

const NOTE: FieldDef[] = [{ key: 'discussion', label: 'Note', type: 'textarea' }];
const RESCHEDULE: FieldDef[] = [
  { key: 'nextFollowUpDate', label: 'New date', type: 'date', required: true },
  { key: 'nextAction', label: 'Next action' },
];

function PartyCell({ f }: { f: FollowupView }) {
  return (
    <span className="flex flex-col leading-tight">
      <Link to={`/crm/customers?open=${f.customerId}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
        {f.customerName}
      </Link>
      <span className="text-caption text-faint">{[f.contactPerson, f.city].filter(Boolean).join(' · ')}</span>
    </span>
  );
}

/** Today's follow-ups board (legacy drawTodayScreen): overdue, today, tomorrow, upcoming, with quick actions. */
function Board() {
  const toast = useToast();
  const { canDo } = useSession();
  const meta = useCrmMeta().data;
  const [sp, setSp] = useState('');
  const b = useBoard(sp || undefined).data;
  const save = useSaveRecord('followups');
  const [noting, setNoting] = useState<FollowupView | null>(null);
  const [moving, setMoving] = useState<FollowupView | null>(null);
  const complete = (f: FollowupView) =>
    void save
      .mutateAsync({ id: f.id, input: { status: 'Completed' } })
      .then(() => toast({ tone: 'success', title: `Done: ${f.customerName}` }))
      .catch((err) => toast({ tone: 'error', title: 'Couldn’t update', description: errorMessage(err) }));
  const columns: Column<FollowupView>[] = [
    { id: 'party', header: 'Customer', cell: (f) => <PartyCell f={f} /> },
    { id: 'sp', header: 'Salesperson', width: '130px', className: 'text-sm', cell: (f) => f.salesperson ?? '—' },
    { id: 'last', header: 'Last discussion', className: 'text-sm', cell: (f) => f.discussion ?? '—' },
    { id: 'next', header: 'Next action', width: '170px', className: 'text-sm', cell: (f) => f.nextAction ?? '—' },
    { id: 'due', header: 'Due', width: '100px', className: 'tabular-nums text-sm', cell: (f) => d(f.due) },
    { id: 'pri', header: 'Priority', width: '80px', cell: (f) => <PriorityPill p={f.priority} /> },
    {
      id: 'act',
      header: <span className="sr-only">Actions</span>,
      width: '210px',
      align: 'right',
      cell: (f) => (
        <span className="flex justify-end gap-1">
          {telLink(f.mobile) && (
            <a href={telLink(f.mobile)!} aria-label={`Call ${f.customerName}`} className="rounded p-1.5 text-muted hover:bg-page hover:text-ink">
              <Phone size={15} aria-hidden />
            </a>
          )}
          {waLink(f.whatsapp) && (
            <a href={waLink(f.whatsapp)!} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${f.customerName}`} className="rounded p-1.5 text-muted hover:bg-page hover:text-ink">
              <MessageCircle size={15} aria-hidden />
            </a>
          )}
          {canDo('edit') && (
            <>
              <Button variant="ghost" size="sm" icon={NotebookPen} aria-label={`Note for ${f.customerName}`} onClick={() => setNoting(f)} />
              <Button variant="ghost" size="sm" icon={CalendarClock} aria-label={`Reschedule ${f.customerName}`} onClick={() => setMoving(f)} />
              <Button size="sm" icon={Check} onClick={() => complete(f)}>
                Done
              </Button>
            </>
          )}
        </span>
      ),
    },
  ];
  const sections: [string, FollowupView[] | undefined][] = [
    ['Overdue', b?.overdue],
    ['Today', b?.today],
    ['Tomorrow', b?.tomorrow],
    ['Upcoming', b?.upcoming],
  ];
  return (
    <div className="flex flex-col gap-3.5">
      <Select aria-label="Salesperson" placeholder="All salespersons" options={(meta?.salespersons ?? []).map((s) => ({ value: s, label: s }))} value={sp} onChange={(e) => setSp(e.target.value)} containerClassName="w-[200px]" />
      {sections.map(([title, rows]) => (
        <Card key={title} title={`${title} (${rows?.length ?? 0})`}>
          <DataTable label={`${title} follow-ups`} columns={columns} rows={rows ?? []} getRowId={(f) => f.id} minWidth={1000} loading={!b} empty={<EmptyState icon={Check} title="Nothing here" />} />
        </Card>
      ))}
      <RecordForm kind="followups" open={!!noting} record={noting} title={`Note · ${noting?.customerName ?? ''}`} fields={NOTE} size="md" onClose={() => setNoting(null)} />
      <RecordForm
        kind="followups"
        open={!!moving}
        record={moving}
        title={`Reschedule · ${moving?.customerName ?? ''}`}
        fields={RESCHEDULE}
        size="md"
        onClose={() => setMoving(null)}
        submit={(input) => save.mutateAsync({ id: moving!.id, input: { ...input, status: 'Rescheduled' } })}
      />
    </div>
  );
}

/** Follow-up report (legacy drawFollowupReport): every follow-up by date, city, salesperson, type and status. */
function Report() {
  const toast = useToast();
  const { canDo } = useSession();
  const meta = useCrmMeta().data;
  const url = useUrlState(['from', 'to', 'city', 'sp', 'type', 'status'] as const);
  const v = url.values;
  const list = useRecords('followups', { page: url.page, pageSize: 25, filters: { from: v.from || undefined, to: v.to || undefined, city: v.city || undefined, salesperson: v.sp || undefined, type: v.type || undefined, status: v.status || undefined } });
  const charts = useCrmReports({ from: v.from || undefined, to: v.to || undefined, salesperson: v.sp || undefined }).data;
  const cities = useMemo(() => [...new Set((meta?.customers ?? []).map((c) => c.city).filter((c): c is string => !!c))].sort(), [meta?.customers]);
  const columns: Column<FollowupView>[] = [
    { id: 'date', header: 'Date', width: '100px', className: 'tabular-nums text-sm', cell: (f) => d(f.date) },
    { id: 'party', header: 'Party', cell: (f) => <PartyCell f={f} /> },
    { id: 'type', header: 'Type', width: '120px', className: 'text-sm', cell: (f) => f.type },
    { id: 'disc', header: 'Discussion', className: 'text-sm', cell: (f) => f.discussion ?? '—' },
    { id: 'next', header: 'Next action', width: '160px', className: 'text-sm', cell: (f) => f.nextAction ?? '—' },
    { id: 'nd', header: 'Next date', width: '100px', className: 'tabular-nums text-sm', cell: (f) => d(f.nextFollowUpDate) },
    { id: 'st', header: 'Status', width: '140px', cell: (f) => <FollowupPill s={f.status} /> },
  ];
  const any = Object.values(v).some(Boolean);
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="From date" type="date" value={v.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={v.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
        <Select aria-label="City" placeholder="All cities" options={cities.map((c) => ({ value: c, label: c }))} value={v.city} onChange={(e) => url.set({ city: e.target.value })} containerClassName="w-[150px]" />
        <Select aria-label="Salesperson" placeholder="All salespersons" options={(meta?.salespersons ?? []).map((s) => ({ value: s, label: s }))} value={v.sp} onChange={(e) => url.set({ sp: e.target.value })} containerClassName="w-[170px]" />
        <Select aria-label="Type" placeholder="All types" options={FOLLOWUP_TYPES.map((s) => ({ value: s, label: s }))} value={v.type} onChange={(e) => url.set({ type: e.target.value })} containerClassName="w-[150px]" />
        <Select aria-label="Status" placeholder="All statuses" options={FOLLOWUP_STATUSES.map((s) => ({ value: s, label: s }))} value={v.status} onChange={(e) => url.set({ status: e.target.value })} containerClassName="w-[170px]" />
        {any && (
          <Button variant="ghost" size="sm" icon={X} onClick={() => url.set({ from: null, to: null, city: null, sp: null, type: null, status: null })}>
            Clear
          </Button>
        )}
        {canDo('export') && (
          <Button icon={Download} onClick={() => void exportCrm('followups', { from: v.from || undefined, to: v.to || undefined, city: v.city || undefined, salesperson: v.sp || undefined, type: v.type || undefined, status: v.status || undefined }).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
            Excel
          </Button>
        )}
      </div>
      {charts && (
        <div className="grid gap-3.5 lg:grid-cols-2">
          <Card title="By type">
            <BarList rows={charts.followupTypes.map((x) => ({ label: x.name, value: x.value }))} format={String} empty="No follow-ups" />
          </Card>
          <Card title="By date">
            <BarList rows={charts.followupTrend.slice(-12).map((x) => ({ label: d(x.name), value: x.value }))} format={String} empty="No follow-ups" />
          </Card>
        </div>
      )}
      <DataTable
        label="Follow-up report"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(f) => f.id}
        minWidth={1050}
        loading={list.isLoading}
        empty={<EmptyState icon={NotebookPen} title="No follow-ups match" />}
        footer={(list.data?.total ?? 0) > 25 && <Pagination page={url.page} pageSize={25} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
    </div>
  );
}

/** Follow-up management (legacy followups): the daily action screen and the full report. */
export function FollowupsPage() {
  const { canDo } = useSession();
  const url = useUrlState(['tab'] as const);
  const tab = url.values.tab === 'report' ? 'report' : 'today';
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Follow-ups"
        description="Who to call today, and every follow-up on record. Logging one updates the customer’s last contact and next date."
        actions={
          canDo('edit') && (
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
              Log follow-up
            </Button>
          )
        }
      />
      <Tabs<'today' | 'report'>
        aria-label="Follow-up views"
        items={[
          { value: 'today', label: 'Today’s follow-ups' },
          { value: 'report', label: 'Follow-up report' },
        ]}
        value={tab}
        onChange={(t) => url.set({ tab: t === 'today' ? null : t })}
      />
      {tab === 'today' ? <Board /> : <Report />}
      <RecordForm kind="followups" open={adding} record={null} title="Log follow-up" fields={FOLLOWUP_FIELDS} initial={{ type: 'Call', status: 'Pending' }} onClose={() => setAdding(false)} />
    </div>
  );
}
