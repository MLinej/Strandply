import { Download, History, Pencil, Plus, Printer, Search, Trash2, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { achievementPct, EMPLOYEE_TYPES, lightOf, type DwDepartment, type DwEmployee } from '@contracts/dwpas';
import type { ActivityEntryView } from '@contracts/admin';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, KpiTile, MenuItem, Modal, Pagination, Pill, Select, Skeleton, useToast, type Column } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportPlans, useDay, useDeleteMaster, useDepartments, useDwpasAudit, useDwpasMeta, useEmployees, useManpower, useSaveMaster, useVariance } from '../api';
import { printPlan } from '../print';
import { Achievement, d, num, PriorityPill, stamp, StatusPill } from '../ui';

const BAR = { green: 'bg-green', amber: 'bg-amber', red: 'bg-primary' };

/** Today's plan (legacy Dashboard): lines planned, the traffic lights, manpower and plan vs actual per department. */
export function DashboardPage() {
  const navigate = useNavigate();
  const { canDo } = useSession();
  const url = useUrlState(['date'] as const);
  const day = useDay(url.values.date || undefined).data;
  if (!day) return <Skeleton className="m-6 h-96" />;
  const p = day.plan;
  const t = p?.totals;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Today’s plan"
        description="The day’s work plan and how each department is doing against it."
        actions={
          canDo('edit') && (
            <Button variant="primary" icon={p ? Pencil : Plus} onClick={() => navigate(`/dwpas/plan?date=${day.date}`)}>
              {p ? 'Open plan' : 'Create plan'}
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label="Date" type="date" value={day.date} onChange={(e) => url.set({ date: e.target.value })} containerClassName="w-[170px]" />
        {p && <StatusPill s={p.status} />}
        {p && (
          <Link to={`/dwpas/register?open=${p.id}`} className="text-sm font-medium text-primary hover:underline">
            Open in register
          </Link>
        )}
      </div>
      {!p || !t ? (
        <EmptyState title={`No plan for ${d(day.date)}`} description="Use Daily plan entry to create it." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiTile label="Lines planned" value={String(t.lines)} meta={`${t.highPriority} high priority`} />
            <KpiTile label="On target (≥ 95%)" value={String(t.green)} />
            <KpiTile label="Near target (80–94%)" value={String(t.amber)} />
            <KpiTile label="Below 80%" value={String(t.red)} />
            <KpiTile label="Skilled" value={`${t.actualSkilled ?? '—'} / ${t.skilled}`} meta="Actual / planned" />
            <KpiTile label="Unskilled" value={`${t.actualUnskilled ?? '—'} / ${t.unskilled}`} meta="Actual / planned" />
          </div>
          <Card title="Plan vs actual" description={`${t.recorded} of ${t.lines} line(s) recorded`}>
            <ul className="flex flex-col gap-2.5" aria-label="Plan vs actual">
              {p.lines.map((l, i) => {
                const pct = achievementPct(l.qty, l.actualQty);
                return (
                  <li key={i} className="grid grid-cols-[160px_1fr_70px] items-center gap-3 text-sm">
                    <span className="truncate font-medium" title={l.department}>
                      {l.department}
                    </span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-page">
                      <span className={`block h-full rounded-full ${pct === null ? '' : BAR[lightOf(pct)]}`} style={{ width: `${Math.min(pct ?? 0, 100)}%` }} />
                    </span>
                    <span className="text-right tabular-nums">{pct === null ? '—' : `${pct}%`}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card title="Department summary" flush>
            <DataTable
              label="Department summary"
              minWidth={980}
              rows={p.lines.map((l, i) => ({ ...l, i }))}
              getRowId={(l) => String(l.i)}
              columns={[
                { id: 'dept', header: 'Department', width: '150px', className: 'font-medium', cell: (l) => l.department },
                { id: 'head', header: 'Head', width: '140px', className: 'text-sm text-muted', cell: (l) => l.head },
                { id: 'work', header: 'Work planned', className: 'text-sm', cell: (l) => l.work },
                { id: 'target', header: 'Target', width: '110px', align: 'right', className: 'tabular-nums', cell: (l) => `${num(l.qty)} ${l.unit}` },
                { id: 'actual', header: 'Actual', width: '110px', align: 'right', className: 'tabular-nums', cell: (l) => (l.actualQty === null ? '—' : `${num(l.actualQty)} ${l.unit}`) },
                { id: 'pct', header: 'Achv', width: '80px', cell: (l) => (l.actualQty === null ? <PriorityPill p={l.priority} /> : <Achievement line={l} />) },
                { id: 'remarks', header: 'Remarks', width: '200px', className: 'text-sm text-muted', cell: (l) => l.reason ?? l.headRemarks ?? '—' },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}

/** Variance analysis (legacy Variance Analysis): recorded lines in a range, worst departments first. */
export function VariancePage() {
  const toast = useToast();
  const { canDo } = useSession();
  const meta = useDwpasMeta().data;
  const url = useUrlState(['from', 'to', 'dept'] as const);
  const v = url.values;
  const range = { from: v.from || undefined, to: v.to || undefined, department: v.dept || undefined };
  const r = useVariance(range).data;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Variance analysis"
        description="Planned vs actual for every line with an achievement recorded."
        actions={
          canDo('export') && (
            <Button icon={Download} onClick={() => void exportPlans(range).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
              Excel
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="From date" type="date" value={v.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={v.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
        <Select aria-label="Department" placeholder="All departments" options={(meta?.departments ?? []).map((x) => ({ value: x.name, label: x.name }))} value={v.dept} onChange={(e) => url.set({ dept: e.target.value })} containerClassName="w-[190px]" />
      </div>
      {!r ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <Card title="By department" description={r.pending ? `${r.pending} planned line(s) up to today have no achievement yet.` : undefined} flush>
            <DataTable
              label="By department"
              minWidth={640}
              rows={r.byDepartment}
              getRowId={(x) => x.department}
              empty={<EmptyState title="No achievement recorded in this period" />}
              columns={[
                { id: 'dept', header: 'Department', className: 'font-medium', cell: (x) => x.department },
                { id: 'lines', header: 'Lines', width: '80px', align: 'right', className: 'tabular-nums', cell: (x) => x.lines },
                { id: 'avg', header: 'Average', width: '100px', align: 'right', cell: (x) => (x.avgPct === null ? '—' : <Pill tone={lightOf(x.avgPct) === 'green' ? 'green' : lightOf(x.avgPct) === 'amber' ? 'amber' : 'red'}>{`${x.avgPct}%`}</Pill>) },
                { id: 'g', header: 'Green', width: '80px', align: 'right', className: 'tabular-nums text-green', cell: (x) => x.green },
                { id: 'a', header: 'Amber', width: '80px', align: 'right', className: 'tabular-nums text-amber', cell: (x) => x.amber },
                { id: 'r', header: 'Red', width: '80px', align: 'right', className: 'tabular-nums text-primary', cell: (x) => x.red },
              ]}
            />
          </Card>
          <Card title="Lines" flush>
            <DataTable
              label="Variance lines"
              minWidth={1150}
              rows={r.rows}
              getRowId={(x) => `${x.date}-${x.department}-${x.work}`}
              empty={<EmptyState title="No achievement recorded in this period" />}
              columns={[
                { id: 'date', header: 'Date', width: '110px', className: 'tabular-nums', cell: (x) => d(x.date) },
                { id: 'dept', header: 'Department', width: '150px', className: 'font-medium', cell: (x) => x.department },
                { id: 'work', header: 'Work', className: 'text-sm', cell: (x) => x.work },
                { id: 'plan', header: 'Planned', width: '110px', align: 'right', className: 'tabular-nums', cell: (x) => `${num(x.planned)} ${x.unit}` },
                { id: 'actual', header: 'Actual', width: '110px', align: 'right', className: 'tabular-nums', cell: (x) => `${num(x.actual)} ${x.unit}` },
                { id: 'diff', header: 'Variance', width: '110px', align: 'right', className: 'tabular-nums', cell: (x) => <span className={x.diff >= 0 ? 'text-green' : 'text-primary'}>{`${x.diff >= 0 ? '+' : ''}${num(x.diff)}`}</span> },
                { id: 'pct', header: 'Achv', width: '80px', cell: (x) => <Achievement line={{ qty: x.planned, actualQty: x.actual }} /> },
                { id: 'reason', header: 'Reason / remarks', width: '220px', className: 'text-sm text-muted', cell: (x) => [x.reason, x.headRemarks].filter(Boolean).join(' · ') || '—' },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}

/** HR manpower (legacy HR Manpower): skilled and unskilled required by department for a day, with what was used. */
export function ManpowerPage() {
  const { canDo } = useSession();
  const url = useUrlState(['date'] as const);
  const m = useManpower(url.values.date || undefined).data;
  if (!m) return <Skeleton className="m-6 h-96" />;
  const t = m.plan?.totals;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="HR manpower"
        description="Manpower the day’s plan needs, by department, against what was used."
        actions={
          m.plan &&
          canDo('print') && (
            <Button icon={Printer} onClick={() => void printPlan(m.plan!.id, 'manpower')}>
              Print manpower
            </Button>
          )
        }
      />
      <Input aria-label="Date" type="date" value={m.date} onChange={(e) => url.set({ date: e.target.value })} containerClassName="w-[170px]" />
      {!t ? (
        <EmptyState title={`No plan for ${d(m.date)}`} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <KpiTile label="Skilled required" value={String(t.skilled)} meta={t.actualSkilled === null ? 'Not recorded' : `${t.actualSkilled} used`} />
            <KpiTile label="Unskilled required" value={String(t.unskilled)} meta={t.actualUnskilled === null ? 'Not recorded' : `${t.actualUnskilled} used`} />
            <KpiTile label="Total manpower" value={String(t.skilled + t.unskilled)} meta={t.actualSkilled === null ? '' : `${(t.actualSkilled ?? 0) + (t.actualUnskilled ?? 0)} used`} />
          </div>
          <Card flush>
            <DataTable
              label="Manpower"
              minWidth={900}
              rows={m.rows.map((x, i) => ({ ...x, i }))}
              getRowId={(x) => String(x.i)}
              columns={[
                { id: 'dept', header: 'Department', width: '160px', className: 'font-medium', cell: (x) => x.department },
                { id: 'head', header: 'Head', width: '150px', className: 'text-sm text-muted', cell: (x) => x.head },
                { id: 'work', header: 'Work', className: 'text-sm', cell: (x) => x.work },
                { id: 's', header: 'Skilled', width: '100px', align: 'right', className: 'tabular-nums', cell: (x) => `${x.actualSkilled ?? '—'} / ${x.skilled}` },
                { id: 'u', header: 'Unskilled', width: '100px', align: 'right', className: 'tabular-nums', cell: (x) => `${x.actualUnskilled ?? '—'} / ${x.unskilled}` },
                { id: 't', header: 'Total', width: '80px', align: 'right', className: 'font-semibold tabular-nums', cell: (x) => x.skilled + x.unskilled },
                { id: 'p', header: 'Priority', width: '100px', cell: (x) => <PriorityPill p={x.priority} /> },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}

type MasterKind = 'departments' | 'employees';
const FIELDS: Record<MasterKind, { key: string; label: string; options?: readonly string[] }[]> = {
  departments: [
    { key: 'name', label: 'Department' },
    { key: 'code', label: 'Code' },
    { key: 'head', label: 'Department head' },
    { key: 'description', label: 'Description' },
  ],
  employees: [
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code' },
    { key: 'department', label: 'Department' },
    { key: 'designation', label: 'Designation' },
    { key: 'type', label: 'Type', options: EMPLOYEE_TYPES },
  ],
};

/** A master list with an add / edit modal (legacy Department Master / Employee Master). */
function MasterPage<T extends DwDepartment | DwEmployee>({ kind, title, description, rows, loading, columns }: { kind: MasterKind; title: string; description: string; rows: T[]; loading: boolean; columns: Column<T>[] }) {
  const toast = useToast();
  const { canDo } = useSession();
  const meta = useDwpasMeta().data;
  const save = useSaveMaster(kind);
  const remove = useDeleteMaster(kind);
  const [form, setForm] = useState<T | 'new' | null>(null);
  const [v, setV] = useState<Record<string, string | boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<T | null>(null);
  useEffect(() => {
    const r = (form === 'new' ? null : form) as Record<string, unknown> | null;
    setV({ ...Object.fromEntries(FIELDS[kind].map((f) => [f.key, (r?.[f.key] as string | null) ?? (f.key === 'type' ? 'Skilled' : '')])), active: (r?.active as boolean | undefined) ?? true });
    setErrors({});
  }, [form]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await save.mutateAsync({ id: form === 'new' ? null : (form as T).id, input: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '' ? null : x])) });
      toast({ tone: 'success', title: 'Saved' });
      setForm(null);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  };
  const all: Column<T>[] = [
    ...columns,
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
                      Delete
                    </MenuItem>
                  )}
                </>
              )}
            </RowMenu>
          </span>
        ),
    },
  ];
  const noun = kind === 'departments' ? 'department' : 'employee';
  return (
    <div className="flex max-w-6xl flex-col gap-3.5 p-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          canDo('edit') && (
            <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
              Add {noun}
            </Button>
          )
        }
      />
      <DataTable label={title} columns={all} rows={rows} getRowId={(r) => r.id} minWidth={800} loading={loading} onRowClick={canDo('edit') ? (r) => setForm(r) : undefined} empty={<EmptyState icon={Users} title={`No ${noun}s`} />} />
      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        size="sm"
        title={form === 'new' ? `Add ${noun}` : `Edit ${noun}`}
        footer={
          <>
            <Button onClick={() => setForm(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="dw-master-form" loading={save.isPending}>
              Save
            </Button>
          </>
        }
      >
        <form id="dw-master-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          {FIELDS[kind].map((f) =>
            f.options ? (
              <Select key={f.key} label={f.label} options={f.options.map((x) => ({ value: x, label: x }))} value={String(v[f.key] ?? '')} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
            ) : (
              <Input key={f.key} label={f.label} value={String(v[f.key] ?? '')} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} error={errors[f.key]} list={f.key === 'department' ? 'dw-depts' : undefined} />
            ),
          )}
          <datalist id="dw-depts">
            {(meta?.departments ?? []).map((x) => (
              <option key={x.name} value={x.name} />
            ))}
          </datalist>
          <label className="flex items-center gap-2 text-base">
            <input type="checkbox" checked={!!v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} className="accent-primary" />
            Active (offered on plans)
          </label>
        </form>
      </Modal>
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.name ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: 'Deleted' }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        Plans keep the names they were saved with.
      </ConfirmDialog>
    </div>
  );
}

export function DepartmentsPage() {
  const q = useDepartments();
  return (
    <MasterPage<DwDepartment>
      kind="departments"
      title="Departments"
      description="Departments offered on plan lines, with their heads. A department on plans can only be deactivated; renaming one renames it on employees."
      rows={q.data ?? []}
      loading={q.isLoading}
      columns={[
        { id: 'name', header: 'Department', className: 'font-medium', cell: (x) => x.name },
        { id: 'code', header: 'Code', width: '80px', className: 'font-mono text-sm', cell: (x) => x.code ?? '—' },
        { id: 'head', header: 'Head', width: '180px', className: 'text-sm', cell: (x) => x.head },
        { id: 'desc', header: 'Description', width: '280px', className: 'text-sm text-muted', cell: (x) => x.description ?? '—' },
      ]}
    />
  );
}

export function EmployeesPage() {
  const q = useEmployees();
  return (
    <MasterPage<DwEmployee>
      kind="employees"
      title="Employees"
      description="People who prepare plans and operate machines. Names and codes are unique."
      rows={q.data ?? []}
      loading={q.isLoading}
      columns={[
        { id: 'name', header: 'Name', className: 'font-medium', cell: (x) => x.name },
        { id: 'code', header: 'Code', width: '100px', className: 'font-mono text-sm', cell: (x) => x.code ?? '—' },
        { id: 'dept', header: 'Department', width: '160px', className: 'text-sm', cell: (x) => x.department ?? '—' },
        { id: 'desg', header: 'Designation', width: '180px', className: 'text-sm', cell: (x) => x.designation ?? '—' },
        { id: 'type', header: 'Type', width: '110px', cell: (x) => <Pill>{x.type}</Pill> },
      ]}
    />
  );
}

const AREA: Record<string, string> = { dwpas_plan: 'Plan', dwpas_department: 'Department', dwpas_employee: 'Employee', dwpas_export: 'Export' };

export function AuditPage() {
  const url = useUrlState([] as const);
  const [search, setSearch] = useSearchParam(url);
  const list = useDwpasAudit({ q: url.q || undefined, page: url.page });
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
      <PageHeader title="DWPAS audit trail" description="Every plan, approval, achievement, master change, export and print, newest first." />
      <Input aria-label="Search audit trail" icon={Search} placeholder="User or details" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[280px]" />
      <DataTable
        label="DWPAS audit trail"
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
