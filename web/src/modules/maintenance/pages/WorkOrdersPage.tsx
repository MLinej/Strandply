import { Download, MessageCircle, Pencil, Plus, Printer, Search, Trash2, Wrench, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { MT_CATEGORIES, MT_PRIORITIES, MT_STATUSES, type MtStatus, type TimelineType, type WorkOrder } from '@contracts/maintenance';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, KpiTile, MenuItem, MenuSeparator, Modal, Pagination, SegmentedControl, Select, Skeleton, Tabs, Textarea, useToast, type Column } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportWorkOrders, useAddNote, useDeleteWorkOrder, useMaintenanceDashboard, useMaintenanceMeta, useSaveWorkOrder, useSetStatus, useWorkOrder, useWorkOrders } from '../api';
import { printWorkOrder } from '../print';
import { d, Due, PriorityPill, stamp, StatusPill, whatsAppLink } from '../ui';

const PAGE_SIZE = 25;
type View = 'list' | 'board';
const TIMELINE_LABEL: Record<TimelineType, string> = { created: 'Created', assigned: 'Assigned', status: 'Status', edited: 'Edited', note: 'Note' };

/** New / edit work order (legacy form: identity, assignment & schedule, details). */
function WorkOrderForm({ open, workOrder, onClose, onSaved }: { open: boolean; workOrder: WorkOrder | null; onClose: () => void; onSaved?: (w: WorkOrder) => void }) {
  const toast = useToast();
  const meta = useMaintenanceMeta().data;
  const save = useSaveWorkOrder();
  const [v, setV] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    const w = workOrder;
    setV({
      title: w?.title ?? '',
      category: w?.category ?? 'Mechanical',
      area: w?.area ?? meta?.areas[0] ?? '',
      assignee: w?.assignee ?? '',
      dueDate: w?.dueDate ?? '',
      priority: w?.priority ?? 'High',
      status: w?.status ?? 'Open',
      description: w?.description ?? '',
      notes: w?.notes ?? '',
    });
    setErrors({});
  }, [open, workOrder, meta?.areas]);
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const saved = await save.mutateAsync({ id: workOrder?.id, input: { ...v, description: v.description || null, notes: v.notes || null } });
      toast({ tone: 'success', title: workOrder ? 'Work order saved' : `${saved.woNo} created` });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }
  const areas = [...new Set([...(meta?.areas ?? []), ...(workOrder ? [workOrder.area] : [])])];
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={workOrder ? `Edit ${workOrder.woNo}` : 'New work order'}
      description={workOrder ? 'Changes are recorded on the timeline.' : 'Fill in the details to create a maintenance task.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="mt-wo-form" loading={save.isPending}>
            {workOrder ? 'Save changes' : 'Create work order'}
          </Button>
        </>
      }
    >
      <form id="mt-wo-form" onSubmit={(e) => void submit(e)} className="grid grid-cols-2 items-start gap-3">
        <div className="col-span-2">
          <Input label="Title" value={v.title ?? ''} onChange={set('title')} error={errors.title} placeholder="e.g. Hydraulic press oil leak — unit 3" />
        </div>
        <Select label="Category" options={MT_CATEGORIES.map((x) => ({ value: x, label: x }))} value={v.category ?? ''} onChange={set('category')} />
        <Select label="Plant area" placeholder="Pick an area" options={areas.map((x) => ({ value: x, label: x }))} value={v.area ?? ''} onChange={set('area')} error={errors.area} />
        <Input label="Assigned to" value={v.assignee ?? ''} onChange={set('assignee')} error={errors.assignee} placeholder="Technician name" list="mt-assignees" />
        <datalist id="mt-assignees">
          {(meta?.assignees ?? []).map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        <Input label="Due date" type="date" value={v.dueDate ?? ''} onChange={set('dueDate')} error={errors.dueDate} />
        <Select label="Priority" options={MT_PRIORITIES.map((x) => ({ value: x, label: x }))} value={v.priority ?? ''} onChange={set('priority')} />
        <Select label="Status" options={MT_STATUSES.map((x) => ({ value: x, label: x }))} value={v.status ?? ''} onChange={set('status')} />
        <div className="col-span-2">
          <Textarea label="Description" rows={3} value={v.description ?? ''} onChange={set('description')} error={errors.description} placeholder="Describe the issue in detail" />
        </div>
        <div className="col-span-2">
          <Textarea label="Notes / remarks" rows={2} value={v.notes ?? ''} onChange={set('notes')} error={errors.notes} placeholder="Parts needed, observations" />
        </div>
      </form>
    </Modal>
  );
}

/** The selected work order (legacy detail panel): details with status buttons, and the timeline with notes. */
function DetailPanel({ id, today, onClose, onEdit, onDelete }: { id: string; today: string; onClose: () => void; onEdit: (w: WorkOrder) => void; onDelete: (w: WorkOrder) => void }) {
  const toast = useToast();
  const { canDo } = useSession();
  const w = useWorkOrder(id).data;
  const setStatus = useSetStatus();
  const addNote = useAddNote();
  const [tab, setTab] = useState<'details' | 'timeline'>('details');
  const [note, setNote] = useState('');
  if (!w) return <Skeleton className="h-96" />;
  const changeStatus = (status: MtStatus) =>
    void setStatus
      .mutateAsync({ id: w.id, status })
      .then(() => toast({ tone: 'success', title: `${w.woNo}: ${status}` }))
      .catch((err) => toast({ tone: 'error', title: 'Couldn’t change status', description: errorMessage(err) }));
  const post = () =>
    void addNote
      .mutateAsync({ id: w.id, text: note.trim() })
      .then(() => {
        setNote('');
        toast({ tone: 'success', title: 'Note added' });
      })
      .catch((err) => toast({ tone: 'error', title: 'Couldn’t add the note', description: errorMessage(err) }));
  return (
    <Card
      aria-label={`Work order ${w.woNo}`}
      title={
        <span className="flex flex-col">
          <span className="font-mono text-caption font-semibold text-muted">{w.woNo}</span>
          <span>{w.title}</span>
        </span>
      }
      actions={<Button variant="ghost" size="sm" icon={X} aria-label="Close" onClick={onClose} />}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {canDo('print') && (
            <Button size="sm" icon={Printer} onClick={() => void printWorkOrder(w.id).catch((err) => toast({ tone: 'error', title: 'Couldn’t print', description: errorMessage(err) }))}>
              Print
            </Button>
          )}
          <a href={whatsAppLink(w, today)} target="_blank" rel="noreferrer" className="inline-flex h-ctl-sm items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-page">
            <MessageCircle size={14} aria-hidden /> WhatsApp
          </a>
          {canDo('edit') && (
            <Button size="sm" icon={Pencil} onClick={() => onEdit(w)}>
              Edit
            </Button>
          )}
        </div>
        <Tabs<'details' | 'timeline'>
          aria-label="Work order views"
          items={[
            { value: 'details', label: 'Details' },
            { value: 'timeline', label: `Timeline (${w.timeline.length})` },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'details' ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              <PriorityPill p={w.priority} />
              <StatusPill s={w.status} />
              <span className="rounded-full border border-border px-2 py-0.5 text-caption text-muted">{w.category}</span>
            </div>
            <DetailList
              items={[
                { label: 'Assigned to', value: w.assignee },
                { label: 'Plant area', value: w.area },
                { label: 'Raised', value: d(w.createdAt.slice(0, 10)) },
                { label: 'Due date', value: <Due w={w} today={today} /> },
                ...(w.completedOn ? [{ label: 'Completed on', value: d(w.completedOn) }] : []),
                { label: 'Description', value: w.description, wide: true },
                { label: 'Notes', value: w.notes, wide: true },
              ]}
            />
            {canDo('edit') && (
              <div>
                <p className="mb-1.5 text-label font-semibold uppercase tracking-label text-faint">Update status</p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Update status">
                  {MT_STATUSES.map((s) => (
                    <Button key={s} size="sm" aria-pressed={w.status === s} className={w.status === s ? 'border-primary text-primary disabled:opacity-100' : undefined} disabled={w.status === s || setStatus.isPending} onClick={() => changeStatus(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {canDo('delete') && (
              <Button variant="danger-outline" size="sm" icon={Trash2} onClick={() => onDelete(w)}>
                Delete work order
              </Button>
            )}
          </>
        ) : (
          <>
            {canDo('edit') && (
              <div className="flex flex-col gap-2">
                <Textarea label="Add a note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="An update, observation or action taken" />
                <Button size="sm" className="self-end" disabled={!note.trim()} loading={addNote.isPending} onClick={post}>
                  Post note
                </Button>
              </div>
            )}
            <ol className="flex flex-col gap-2.5 border-l border-divider pl-3" aria-label="Timeline">
              {[...w.timeline].reverse().map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="mr-1.5 text-caption font-semibold uppercase tracking-label text-faint">{TIMELINE_LABEL[e.type]}</span>
                  <span className={e.type === 'note' ? 'whitespace-pre-wrap' : undefined}>{e.text}</span>
                  <span className="block text-caption text-muted">
                    {e.byName} · {stamp(e.at)}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </Card>
  );
}

/** Board column per status (legacy board view). */
function Board({ rows, today, selected, onOpen }: { rows: WorkOrder[]; today: string; selected: string | null; onOpen: (w: WorkOrder) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Work order board">
      {MT_STATUSES.map((s) => {
        const col = rows.filter((w) => w.status === s);
        return (
          <section key={s} aria-label={s} className="flex min-w-0 flex-col gap-2">
            <h2 className="flex items-center justify-between border-b border-divider pb-1.5 text-label font-semibold uppercase tracking-label text-muted">
              {s} <span className="tabular-nums">{col.length}</span>
            </h2>
            {col.map((w) => (
              <button key={w.id} type="button" onClick={() => onOpen(w)} className={`flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-left hover:border-primary ${selected === w.id ? 'border-primary' : 'border-border'}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-caption font-semibold text-muted">{w.woNo}</span>
                  <PriorityPill p={w.priority} />
                </span>
                <span className="text-base font-medium leading-snug">{w.title}</span>
                <span className="text-caption text-muted">
                  {w.category} · {w.area}
                </span>
                <span className="flex justify-between gap-2 text-caption text-muted">
                  <span className="truncate">{w.assignee}</span>
                  <Due w={w} today={today} />
                </span>
              </button>
            ))}
            {!col.length && <p className="rounded-lg border border-dashed border-border py-4 text-center text-caption text-faint">None</p>}
          </section>
        );
      })}
    </div>
  );
}

/** Work orders (legacy main screen): stats, filters, list or board, and the detail panel. */
export function WorkOrdersPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const meta = useMaintenanceMeta().data;
  const today = meta?.today ?? '';
  const stats = useMaintenanceDashboard().data;
  const url = useUrlState(['status', 'priority', 'area', 'category', 'assignee', 'overdue', 'view', 'new'] as const);
  const [search, setSearch] = useSearchParam(url);
  const v = url.values;
  const view: View = v.view === 'board' ? 'board' : 'list';
  const filters = { status: v.status || undefined, priority: v.priority || undefined, area: v.area || undefined, category: v.category || undefined, assignee: v.assignee || undefined, overdue: v.overdue || undefined };
  // The board shows every match (up to 100) in its columns; the list pages.
  const list = useWorkOrders({ q: url.q || undefined, page: view === 'board' ? 1 : url.page, pageSize: view === 'board' ? 100 : PAGE_SIZE, sort: url.sort || undefined, filters });
  const remove = useDeleteWorkOrder();
  const [form, setForm] = useState<WorkOrder | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<WorkOrder | null>(null);
  const selected = url.open;
  const open = (w: WorkOrder) => url.set({ open: w.id, page: url.page });

  useEffect(() => {
    if (v.new && canDo('edit')) {
      setForm('new');
      url.set({ new: null });
    }
  }, [v.new]);

  const columns: Column<WorkOrder>[] = [
    { id: 'no', header: 'WO #', width: '120px', className: 'font-mono text-sm font-semibold', cell: (w) => w.woNo },
    { id: 'title', header: 'Title', className: 'font-medium', cell: (w) => w.title },
    { id: 'cat', header: 'Category', width: '130px', className: 'text-sm', cell: (w) => w.category },
    { id: 'area', header: 'Area', width: '150px', className: 'text-sm text-muted', cell: (w) => w.area },
    { id: 'prio', header: 'Priority', width: '100px', cell: (w) => <PriorityPill p={w.priority} /> },
    { id: 'status', header: 'Status', width: '120px', cell: (w) => <StatusPill s={w.status} /> },
    { id: 'who', header: 'Assigned to', width: '140px', className: 'text-sm', cell: (w) => w.assignee },
    { id: 'due', header: 'Due', width: '180px', className: 'text-sm tabular-nums', cell: (w) => <Due w={w} today={today} /> },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (w) => (
        <span onClick={(e) => e.stopPropagation()}>
          <RowMenu label={`Actions for ${w.woNo}`}>
            {(close) => (
              <>
                {canDo('edit') && (
                  <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(w))}>
                    Edit
                  </MenuItem>
                )}
                {canDo('print') && (
                  <MenuItem icon={Printer} onClick={runAndClose(close, () => void printWorkOrder(w.id))}>
                    Print
                  </MenuItem>
                )}
                <MenuItem icon={MessageCircle} onClick={runAndClose(close, () => window.open(whatsAppLink(w, today), '_blank', 'noopener'))}>
                  Share on WhatsApp
                </MenuItem>
                {canDo('delete') && (
                  <>
                    <MenuSeparator />
                    <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(w))}>
                      Delete
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </RowMenu>
        </span>
      ),
    },
  ];

  const filtered = Object.values(filters).some(Boolean) || !!url.q;
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Work orders"
        description="Track, assign and resolve plant maintenance tasks."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => void exportWorkOrders().catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                New work order
              </Button>
            )}
          </>
        }
      />
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['All', stats.total, () => url.set({ status: null, priority: null, overdue: null })],
            ['Open', stats.open, () => url.set({ status: 'Open', overdue: null })],
            ['In progress', stats.inProgress, () => url.set({ status: 'In Progress', overdue: null })],
            ['On hold', stats.onHold, () => url.set({ status: 'On Hold', overdue: null })],
            ['Critical open', stats.critical, () => url.set({ priority: 'Critical', status: null, overdue: null })],
            ['Overdue', stats.overdue, () => url.set({ overdue: 'true', status: null })],
          ].map(([label, value, onClick]) => (
            <button key={label as string} type="button" className="rounded-lg text-left focus-visible:outline focus-visible:outline-2" onClick={onClick as () => void}>
              <KpiTile variant="compact" label={label as string} value={value as number} />
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <SegmentedControl<View>
          aria-label="View"
          options={[
            { value: 'list', label: 'List' },
            { value: 'board', label: 'Board' },
          ]}
          value={view}
          onChange={(x) => url.set({ view: x === 'list' ? null : x })}
        />
        <Input aria-label="Search" icon={Search} placeholder="WO #, title, technician" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[220px]" />
        <Select aria-label="Status" placeholder="All statuses" options={MT_STATUSES.map((x) => ({ value: x, label: x }))} value={v.status} onChange={(e) => url.set({ status: e.target.value })} containerClassName="w-[150px]" />
        <Select aria-label="Priority" placeholder="All priorities" options={MT_PRIORITIES.map((x) => ({ value: x, label: x }))} value={v.priority} onChange={(e) => url.set({ priority: e.target.value })} containerClassName="w-[150px]" />
        <Select aria-label="Area" placeholder="All areas" options={(meta?.areas ?? []).map((x) => ({ value: x, label: x }))} value={v.area} onChange={(e) => url.set({ area: e.target.value })} containerClassName="w-[170px]" />
        <Select aria-label="Category" placeholder="All categories" options={MT_CATEGORIES.map((x) => ({ value: x, label: x }))} value={v.category} onChange={(e) => url.set({ category: e.target.value })} containerClassName="w-[160px]" />
        <Select aria-label="Assigned to" placeholder="Anyone" options={(meta?.assignees ?? []).map((x) => ({ value: x, label: x }))} value={v.assignee} onChange={(e) => url.set({ assignee: e.target.value })} containerClassName="w-[150px]" />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={v.overdue === 'true'} onChange={(e) => url.set({ overdue: e.target.checked ? 'true' : null })} className="accent-primary" />
          Overdue only
        </label>
        {filtered && (
          <Button variant="ghost" size="sm" icon={X} onClick={() => url.set({ q: null, status: null, priority: null, area: null, category: null, assignee: null, overdue: null })}>
            Clear
          </Button>
        )}
      </div>
      <div className={selected ? 'grid items-start gap-3.5 xl:grid-cols-[minmax(0,1fr)_380px]' : undefined}>
        <div className="min-w-0">
          {view === 'list' ? (
            <DataTable
              label="Work orders"
              // With the detail panel open, keep the columns that identify a work order.
              columns={selected ? columns.filter((c) => ['no', 'title', 'prio', 'status', 'due'].includes(c.id)) : columns}
              rows={list.data?.rows ?? []}
              getRowId={(w) => w.id}
              minWidth={selected ? 640 : 1050}
              loading={list.isLoading}
              onRowClick={open}
              empty={<EmptyState icon={Wrench} title="No work orders found" description={filtered ? 'Try adjusting the filters.' : undefined} />}
              footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
            />
          ) : (
            <Board rows={list.data?.rows ?? []} today={today} selected={selected} onOpen={open} />
          )}
        </div>
        {selected && <DetailPanel key={selected} id={selected} today={today} onClose={() => url.set({ open: null, page: url.page })} onEdit={setForm} onDelete={setToDelete} />}
      </div>
      <WorkOrderForm open={form !== null} workOrder={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={(w) => form === 'new' && url.set({ open: w.id })} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.woNo ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => {
              toast({ tone: 'success', title: 'Work order deleted' });
              if (selected === toDelete!.id) url.set({ open: null });
            })
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        {toDelete?.title}. This can’t be undone.
      </ConfirmDialog>
    </div>
  );
}
