import { Download, History, Pencil, Plus, Search, Trash2, Wrench } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import type { ActivityEntryView } from '@contracts/admin';
import type { MaintenanceReportRow } from '@contracts/maintenance';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, KpiTile, MenuItem, Modal, Pagination, Pill, Skeleton, useToast, type Column } from '@/components/ui';
import { BarList } from '../../purchase/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportWorkOrders, useAreas, useAssignees, useDeleteArea, useDeleteAssignee, useMaintenanceAudit, useMaintenanceDashboard, useMaintenanceReports, useSaveArea, useSaveAssignee } from '../api';
import { d, PriorityPill, stamp } from '../ui';

/** Maintenance dashboard: status counts, what's overdue, open work by area / category / priority, latest activity. */
export function DashboardPage() {
  const navigate = useNavigate();
  const { canDo } = useSession();
  const v = useMaintenanceDashboard().data;
  if (!v) return <Skeleton className="m-6 h-96" />;
  const tile = (q: string, label: string, value: number, meta: string) => (
    <Link to={`/maintenance/work-orders${q}`} className="block rounded-lg focus-visible:outline focus-visible:outline-2">
      <KpiTile label={label} value={String(value)} meta={meta} />
    </Link>
  );
  const bars = (rows: { name: string; value: number }[]) => rows.map((x) => ({ label: x.name, value: x.value }));
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Maintenance dashboard"
        description="Plant maintenance work orders: what's open, what's late, and where."
        actions={
          canDo('edit') && (
            <Button variant="primary" icon={Plus} onClick={() => navigate('/maintenance/work-orders?new=1')}>
              New work order
            </Button>
          )
        }
      />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tile('?status=Open', 'Open', v.open, 'Not started')}
        {tile('?status=In%20Progress', 'In progress', v.inProgress, 'Being worked on')}
        {tile('?status=On%20Hold', 'On hold', v.onHold, 'Waiting (parts, shutdown)')}
        {tile('?priority=Critical', 'Critical open', v.critical, 'Not completed')}
        {tile('?overdue=true', 'Overdue', v.overdue, 'Past the due date')}
        {tile('?status=Completed', 'Completed', v.completed, `${v.total} in all`)}
      </div>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card title="Overdue" flush>
          {v.overdueList.length ? (
            <ul className="flex flex-col divide-y divide-divider" aria-label="Overdue work orders">
              {v.overdueList.map((w) => (
                <li key={w.id}>
                  <Link to={`/maintenance/work-orders?open=${w.id}`} className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-page">
                    <span className="min-w-0">
                      <span className="font-mono text-caption font-semibold text-muted">{w.woNo}</span> <span className="font-medium">{w.title}</span>
                      <span className="block text-caption text-muted">
                        {w.area} · {w.assignee} · due {d(w.dueDate)}
                      </span>
                    </span>
                    <PriorityPill p={w.priority} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-muted">Nothing overdue.</p>
          )}
        </Card>
        <Card title="Open work by priority">
          <BarList rows={bars(v.byPriority)} format={String} />
        </Card>
        <Card title="Open work by area">
          <BarList rows={bars(v.byArea)} format={String} empty="Nothing open" />
        </Card>
        <Card title="Open work by category">
          <BarList rows={bars(v.byCategory)} format={String} empty="Nothing open" />
        </Card>
      </div>
      <Card title="Latest activity">
        {v.recent.length ? (
          <ul className="flex flex-col divide-y divide-divider" aria-label="Latest activity">
            {v.recent.map((e) => (
              <li key={`${e.workOrderId}-${e.id}`} className="flex justify-between gap-3 py-1.5 text-sm">
                <Link to={`/maintenance/work-orders?open=${e.workOrderId}`} className="min-w-0 hover:underline">
                  <span className="font-mono text-caption font-semibold text-muted">{e.woNo}</span> {e.text}
                  <span className="block truncate text-caption text-faint">{e.title}</span>
                </Link>
                <span className="shrink-0 text-caption text-muted">
                  {e.byName} · {stamp(e.at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No activity yet.</p>
        )}
      </Card>
    </div>
  );
}

type NamedRow = { id: string; name: string; active: boolean };
interface NameListCopy {
  /** "area" / "name": used in buttons and messages. */
  noun: string;
  title: string;
  description: string;
  placeholder: string;
  activeLabel: string;
  removeNote: string;
}

/** A master of names (plant areas, technicians): add, rename, deactivate, remove. */
function NameList<T extends NamedRow>({ copy, rows, loading, save, remove }: { copy: NameListCopy; rows: T[]; loading: boolean; save: ReturnType<typeof useSaveArea>; remove: ReturnType<typeof useDeleteArea> }) {
  const toast = useToast();
  const { canDo } = useSession();
  const [form, setForm] = useState<T | 'new' | null>(null);
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string>();
  const [toDelete, setToDelete] = useState<T | null>(null);
  const formId = `mt-${copy.noun}-form`;
  useEffect(() => {
    setName(form && form !== 'new' ? form.name : '');
    setActive(form && form !== 'new' ? form.active : true);
    setError(undefined);
  }, [form]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await save.mutateAsync({ id: form === 'new' ? null : form?.id, input: { name, active } });
      toast({ tone: 'success', title: `${copy.noun[0]!.toUpperCase()}${copy.noun.slice(1)} saved` });
      setForm(null);
    } catch (err) {
      setError(fieldErrors(err).name ?? errorMessage(err));
    }
  };
  const columns: Column<T>[] = [
    { id: 'name', header: 'Name', className: 'font-medium', cell: (a) => a.name },
    { id: 'st', header: 'Status', width: '110px', cell: (a) => (a.active ? <Pill tone="green">Active</Pill> : <Pill>Inactive</Pill>) },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (a) =>
        (canDo('edit') || canDo('delete')) && (
          <span onClick={(e) => e.stopPropagation()}>
            <RowMenu label={`Actions for ${a.name}`}>
              {(close) => (
                <>
                  {canDo('edit') && (
                    <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(a))}>
                      Edit
                    </MenuItem>
                  )}
                  {canDo('delete') && (
                    <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(a))}>
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
    <section className="flex flex-col gap-3" aria-label={copy.title}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{copy.title}</h2>
          <p className="text-base text-muted">{copy.description}</p>
        </div>
        {canDo('edit') && (
          <Button icon={Plus} onClick={() => setForm('new')}>
            Add {copy.noun}
          </Button>
        )}
      </div>
      <DataTable label={copy.title} columns={columns} rows={rows} getRowId={(a) => a.id} minWidth={420} loading={loading} onRowClick={canDo('edit') ? (a) => setForm(a) : undefined} empty={<EmptyState icon={Wrench} title={`No ${copy.noun}s yet`} />} />
      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        size="sm"
        title={form === 'new' ? `Add ${copy.noun}` : `Edit ${copy.noun}`}
        footer={
          <>
            <Button onClick={() => setForm(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form={formId} loading={save.isPending}>
              Save
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={error} placeholder={copy.placeholder} />
          <label className="flex items-center gap-2 text-base">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" />
            {copy.activeLabel}
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
            .then(() => toast({ tone: 'success', title: `${toDelete!.name} removed` }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t remove', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        {copy.removeNote}
      </ConfirmDialog>
    </section>
  );
}

/** Maintenance masters: plant areas (legacy Manage Areas) and the "Assigned to" names, both offered on work orders. */
export function AreasPage() {
  const areas = useAreas();
  const people = useAssignees();
  const saveArea = useSaveArea();
  const removeArea = useDeleteArea();
  const savePerson = useSaveAssignee();
  const removePerson = useDeleteAssignee();
  return (
    <div className="flex max-w-3xl flex-col gap-6 p-6">
      <PageHeader title="Maintenance masters" description="Lists offered on work orders." />
      <NameList
        copy={{
          noun: 'area',
          title: 'Plant areas',
          description: 'Renaming one renames it on its work orders; an area with work orders can only be deactivated.',
          placeholder: 'e.g. CNC machine shop',
          activeLabel: 'Active (offered on new work orders)',
          removeNote: 'Areas with work orders can’t be removed; deactivate them instead.',
        }}
        rows={areas.data ?? []}
        loading={areas.isLoading}
        save={saveArea}
        remove={removeArea}
      />
      <NameList
        copy={{
          noun: 'name',
          title: 'Assigned to',
          description: 'Technicians offered in “Assigned to”. Names can also be added from the work order form. Renaming one renames it on its work orders.',
          placeholder: 'e.g. Raj Kumar',
          activeLabel: 'Active (offered on new work orders)',
          removeNote: 'Work orders already assigned to this name keep it.',
        }}
        rows={people.data ?? []}
        loading={people.isLoading}
        save={savePerson}
        remove={removePerson}
      />
    </div>
  );
}

function SplitTable({ title, rows }: { title: string; rows: MaintenanceReportRow[] }) {
  return (
    <Card title={title} flush>
      <table className="w-full text-sm" aria-label={title}>
        <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
          <tr>
            <th className="px-3 py-1.5 text-left">Name</th>
            <th className="px-3 py-1.5 text-right">Raised</th>
            <th className="px-3 py-1.5 text-right">Completed</th>
            <th className="px-3 py-1.5 text-right">Open</th>
            <th className="px-3 py-1.5 text-right">Overdue</th>
            <th className="px-3 py-1.5 text-right">Avg days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-divider">
              <td className="px-3 py-1.5">{r.name}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.raised}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.completed}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.open}</td>
              <td className={`px-3 py-1.5 text-right tabular-nums ${r.overdue ? 'font-semibold text-primary' : ''}`}>{r.overdue}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.avgDays ?? '—'}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={6} className="px-3 py-3 text-muted">
                No work orders in this period
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

/** Maintenance reports (new; legacy had the stats bar only): completion, time to complete, split by area, category, technician and priority. */
export function ReportsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['from', 'to'] as const);
  const v = url.values;
  const range = { from: v.from || undefined, to: v.to || undefined };
  const r = useMaintenanceReports(range).data;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Maintenance reports"
        description="Work orders raised in the period. Average days run from raised to completed."
        actions={
          canDo('export') && (
            <Button icon={Download} onClick={() => void exportWorkOrders(range).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
              Excel
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="From date" type="date" value={v.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={v.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
      </div>
      {!r ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiTile label="Raised" value={String(r.raised)} meta="In the period" />
            <KpiTile label="Completed" value={String(r.completed)} meta="Of those raised" />
            <KpiTile label="On time" value={r.onTimeShare === null ? '—' : `${r.onTimeShare}%`} meta="Completed by the due date" />
            <KpiTile label="Avg days to complete" value={r.avgDays === null ? '—' : String(r.avgDays)} meta="Raised → completed" />
            <KpiTile label="Open now" value={String(r.openNow)} meta="All work orders" />
            <KpiTile label="Overdue now" value={String(r.overdueNow)} meta="All work orders" />
          </div>
          <Card title="Raised and completed by month" flush>
            <table className="w-full text-sm" aria-label="Raised and completed by month">
              <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
                <tr>
                  <th className="px-3 py-1.5 text-left">Month</th>
                  <th className="px-3 py-1.5 text-right">Raised</th>
                  <th className="px-3 py-1.5 text-right">Completed</th>
                </tr>
              </thead>
              <tbody>
                {r.byMonth.map((m) => (
                  <tr key={m.name} className="border-t border-divider">
                    <td className="px-3 py-1.5">{m.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{m.raised}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{m.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="grid gap-3.5 xl:grid-cols-2">
            <SplitTable title="By area" rows={r.byArea} />
            <SplitTable title="By category" rows={r.byCategory} />
            <SplitTable title="By technician" rows={r.byAssignee} />
            <SplitTable title="By priority" rows={r.byPriority} />
          </div>
        </>
      )}
    </div>
  );
}

const AREA: Record<string, string> = { maintenance_work_order: 'Work order', maintenance_area: 'Area', maintenance_export: 'Export' };

/** Every maintenance change, note, export and print, newest first. */
export function AuditPage() {
  const url = useUrlState([] as const);
  const [search, setSearch] = useSearchParam(url);
  const list = useMaintenanceAudit({ q: url.q || undefined, page: url.page });
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
    { id: 'area', header: 'Area', width: '120px', cell: (a) => <Pill>{AREA[a.entityType ?? ''] ?? a.entityType}</Pill> },
    { id: 'action', header: 'Action', width: '120px', cell: (a) => a.action },
    { id: 'details', header: 'Details', cell: (a) => a.details },
  ];
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Maintenance audit trail" description="Every work order, status change, note, area change, export and print, newest first." />
      <Input aria-label="Search audit trail" icon={Search} placeholder="User or details" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[280px]" />
      <DataTable
        label="Maintenance audit trail"
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
