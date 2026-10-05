import { Download, History, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import type { ActivityEntryView } from '@contracts/admin';
import type { CpRecipient, PartyRow } from '@contracts/complaints';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, KpiTile, MenuItem, Modal, Pagination, Pill, Select, Skeleton, useToast, type Column } from '@/components/ui';
import { BarList } from '../../purchase/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportComplaints, useComplaintsAudit, useComplaintsDashboard, useComplaintsReports, useDeleteRecipient, useRecipients, useSaveRecipient } from '../api';
import { d, PriorityPill, stamp, StatusPill } from '../ui';

/** Complaints dashboard (legacy Dashboard): counts by status, open criticals, recent complaints, categories. */
export function DashboardPage() {
  const navigate = useNavigate();
  const { canDo } = useSession();
  const v = useComplaintsDashboard().data;
  if (!v) return <Skeleton className="m-6 h-96" />;
  const tile = (q: string, label: string, value: number, meta: string) => (
    <Link to={`/complaints/register${q}`} className="block rounded-lg focus-visible:outline focus-visible:outline-2">
      <KpiTile label={label} value={String(value)} meta={meta} />
    </Link>
  );
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Complaints dashboard"
        description="Customer complaints raised by the sales team and how they’re being followed up."
        actions={
          canDo('edit') && (
            <Button variant="primary" icon={Plus} onClick={() => navigate('/complaints/new')}>
              New complaint
            </Button>
          )
        }
      />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tile('', 'Total', v.total, 'All complaints')}
        {tile('?status=Open', 'Open', v.open, 'Not taken up yet')}
        {tile('?status=In%20Progress', 'In progress', v.inProgress, 'Being worked on')}
        {tile('?active=true&priority=Critical', 'Critical open', v.critical, 'Open or in progress')}
        {tile('?status=Resolved', 'Resolved', v.resolved, 'Fix done')}
        {tile('?status=Closed', 'Closed', v.closed, 'Customer signed off')}
      </div>
      <div className="grid gap-3.5 lg:grid-cols-[2fr_1fr]">
        <Card title="Recent complaints" flush>
          <DataTable
            label="Recent complaints"
            minWidth={640}
            columns={[
              { id: 'no', header: 'Complaint no.', width: '140px', className: 'font-mono text-sm font-semibold', cell: (c) => c.complaintNo },
              { id: 'date', header: 'Date', width: '100px', className: 'text-sm tabular-nums', cell: (c) => d(c.date) },
              { id: 'customer', header: 'Customer', className: 'font-medium', cell: (c) => c.customerName },
              { id: 'category', header: 'Category', width: '160px', className: 'text-sm', cell: (c) => c.category },
              { id: 'priority', header: 'Priority', width: '100px', cell: (c) => <PriorityPill p={c.priority} /> },
              { id: 'status', header: 'Status', width: '110px', cell: (c) => <StatusPill s={c.status} /> },
            ]}
            rows={v.recent}
            getRowId={(c) => c.id}
            onRowClick={(c) => navigate(`/complaints/register?open=${c.id}`)}
            empty={<EmptyState title="No complaints registered yet" />}
          />
        </Card>
        <Card title="By category">
          <BarList rows={v.byCategory.map((x) => ({ label: x.name, value: x.value }))} format={String} empty="No complaints yet" />
        </Card>
      </div>
    </div>
  );
}

function SplitTable({ title, rows, first }: { title: string; rows: PartyRow[]; first: string }) {
  return (
    <Card title={title} flush>
      <table className="w-full text-sm" aria-label={title}>
        <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
          <tr>
            <th className="px-3 py-1.5 text-left">{first}</th>
            <th className="px-3 py-1.5 text-right">Total</th>
            <th className="px-3 py-1.5 text-right">Open</th>
            <th className="px-3 py-1.5 text-right">Resolved</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-divider">
              <td className="px-3 py-1.5 font-medium">{r.name}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.total}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-amber">{r.open}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-green">{r.resolved}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={4} className="px-3 py-3 text-muted">
                No data for the selected period
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

/** Reports (legacy Reports): FY and date range; party-, issue- and month-wise, plus material, salesman and time to resolve. */
export function ReportsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['fy', 'from', 'to'] as const);
  const v = url.values;
  const q = { fy: v.fy || undefined, from: v.from || undefined, to: v.to || undefined };
  const r = useComplaintsReports(q).data;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Complaint reports"
        description="Open counts Open and In progress; resolved counts Resolved and Closed."
        actions={
          canDo('export') && (
            <Button icon={Download} onClick={() => void exportComplaints(q).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
              Excel
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Select aria-label="Financial year" placeholder="All years" options={(r?.years ?? []).map((y) => ({ value: y, label: `FY ${y}` }))} value={v.fy} onChange={(e) => url.set({ fy: e.target.value })} containerClassName="w-[150px]" />
        <Input aria-label="From date" type="date" value={v.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={v.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
      </div>
      {!r ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <KpiTile label="Complaints" value={String(r.total)} />
            <KpiTile label="Open" value={String(r.open)} meta="Open + in progress" />
            <KpiTile label="Resolved" value={String(r.resolved)} meta="Resolved + closed" />
            <KpiTile label="Average days to resolve" value={r.avgDaysToResolve === null ? '—' : String(r.avgDaysToResolve)} meta="Complaint date → resolved" />
          </div>
          <div className="grid gap-3.5 lg:grid-cols-2">
            <SplitTable title="Party-wise complaints" rows={r.byParty} first="Customer" />
            <Card title="Issue-wise complaints" flush>
              <table className="w-full text-sm" aria-label="Issue-wise complaints">
                <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
                  <tr>
                    <th className="px-3 py-1.5 text-left">Category</th>
                    <th className="px-3 py-1.5 text-right">Count</th>
                    <th className="px-3 py-1.5 text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {r.byCategory.map((x) => (
                    <tr key={x.name} className="border-t border-divider">
                      <td className="px-3 py-1.5 font-medium">{x.name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{x.value}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{x.share.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <SplitTable title="Salesman-wise" rows={r.bySalesman} first="Salesman" />
            <Card title="Material-wise">
              <BarList rows={r.byMaterial.map((x) => ({ label: x.name, value: x.value }))} format={String} empty="No data" />
            </Card>
          </div>
          <Card title="Month-wise trend">
            <BarList rows={r.byMonth.map((x) => ({ label: new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${x.name}-01T00:00:00Z`)), value: x.value }))} format={String} empty="No complaints in this period" />
          </Card>
        </>
      )}
    </div>
  );
}

/** Notification recipients (legacy Recipients & Parties; parties now come from the Sales party master). */
export function RecipientsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const list = useRecipients();
  const save = useSaveRecipient();
  const remove = useDeleteRecipient();
  const [form, setForm] = useState<CpRecipient | 'new' | null>(null);
  const [v, setV] = useState({ name: '', role: '', email: '', active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<CpRecipient | null>(null);
  useEffect(() => {
    const r = form === 'new' ? null : form;
    setV({ name: r?.name ?? '', role: r?.role ?? '', email: r?.email ?? '', active: r?.active ?? true });
    setErrors({});
  }, [form]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await save.mutateAsync({ id: form === 'new' ? null : form?.id, input: { name: v.name, role: v.role || null, email: v.email || null, active: v.active } });
      toast({ tone: 'success', title: 'Recipient saved' });
      setForm(null);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  };
  const columns: Column<CpRecipient>[] = [
    { id: 'name', header: 'Name', className: 'font-medium', cell: (r) => r.name },
    { id: 'role', header: 'Role', width: '220px', className: 'text-sm', cell: (r) => r.role ?? '—' },
    { id: 'email', header: 'Email', width: '240px', className: 'text-sm', cell: (r) => r.email ?? <span className="text-amber">No email</span> },
    { id: 'st', header: 'Status', width: '100px', cell: (r) => (r.active ? <Pill tone="green">Active</Pill> : <Pill>Inactive</Pill>) },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (r) =>
        (canDo('edit') || canDo('delete')) && (
          <span onClick={(e) => e.stopPropagation()}>
            <RowMenu label={`Actions for ${r.name}`}>
              {(close) => (
                <>
                  {canDo('edit') && (
                    <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(r))}>
                      Edit
                    </MenuItem>
                  )}
                  {canDo('delete') && (
                    <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(r))}>
                      Remove
                    </MenuItem>
                  )}
                </>
              )}
            </RowMenu>
          </span>
        ),
    },
  ];
  return (
    <div className="flex max-w-5xl flex-col gap-3.5 p-6">
      <PageHeader
        title="Recipients"
        description="Who is notified when a complaint is raised. Customers come from the Sales party master; new names typed on complaints are offered next time."
        actions={
          canDo('edit') && (
            <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
              Add recipient
            </Button>
          )
        }
      />
      <DataTable label="Recipients" columns={columns} rows={list.data ?? []} getRowId={(r) => r.id} minWidth={720} loading={list.isLoading} onRowClick={canDo('edit') ? (r) => setForm(r) : undefined} empty={<EmptyState icon={Users} title="No recipients yet" />} />
      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        size="sm"
        title={form === 'new' ? 'Add recipient' : 'Edit recipient'}
        footer={
          <>
            <Button onClick={() => setForm(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="cp-recipient-form" loading={save.isPending}>
              Save
            </Button>
          </>
        }
      >
        <form id="cp-recipient-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <Input label="Name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={errors.name} />
          <Input label="Role" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })} error={errors.role} placeholder="e.g. Plant Manager" />
          <Input label="Email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} error={errors.email} placeholder="name@strandply.in" />
          <label className="flex items-center gap-2 text-base">
            <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} className="accent-primary" />
            Active (offered on new complaints)
          </label>
        </form>
      </Modal>
      <ConfirmDialog
        open={!!toDelete}
        title={`Remove ${toDelete?.name ?? ''}?`}
        confirmLabel="Remove"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: 'Recipient removed' }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t remove', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        Complaints already raised keep the name and email they were sent to.
      </ConfirmDialog>
    </div>
  );
}

const AREA: Record<string, string> = { complaint: 'Complaint', complaint_recipient: 'Recipient', complaint_export: 'Export' };

/** Every complaint change, comment, export and print, newest first. */
export function AuditPage() {
  const url = useUrlState([] as const);
  const [search, setSearch] = useSearchParam(url);
  const list = useComplaintsAudit({ q: url.q || undefined, page: url.page });
  const columns: Column<ActivityEntryView>[] = [
    { id: 'when', header: 'When', width: '170px', className: 'text-muted tabular-nums', cell: (a) => stamp(a.createdAt) },
    {
      id: 'who',
      header: 'By',
      width: '170px',
      cell: (a) => (
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{a.userName ?? 'System'}</span>
          {a.userRole && <span className="text-caption text-faint">{a.userRole}</span>}
        </span>
      ),
    },
    { id: 'area', header: 'Area', width: '110px', cell: (a) => <Pill>{AREA[a.entityType ?? ''] ?? a.entityType}</Pill> },
    { id: 'action', header: 'Action', width: '110px', cell: (a) => a.action },
    { id: 'details', header: 'Details', cell: (a) => a.details },
  ];
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Complaints audit trail" description="Every complaint, status change, comment, photo, recipient change, export and print, newest first." />
      <Input aria-label="Search audit trail" icon={Search} placeholder="User or details" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[280px]" />
      <DataTable
        label="Complaints audit trail"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(a) => a.id}
        minWidth={900}
        loading={list.isLoading}
        empty={<EmptyState icon={History} title="Nothing recorded yet" />}
        footer={(list.data?.total ?? 0) > 50 && <Pagination page={url.page} pageSize={50} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
    </div>
  );
}
