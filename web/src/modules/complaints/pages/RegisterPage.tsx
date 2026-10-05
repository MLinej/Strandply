import { Download, Mail, MessageSquareWarning, Paperclip, Pencil, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CP_CATEGORIES, CP_MATERIALS, CP_PRIORITIES, CP_STATUSES, type ComplaintView, type CpStatus } from '@contracts/complaints';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, Pagination, Select, Skeleton, Tabs, Textarea, useToast, type Column } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportComplaints, fileUrl, useComment, useComplaint, useComplaints, useDeleteComplaint, useRemovePhoto, useSetStatus } from '../api';
import { printComplaint } from '../print';
import { d, mailtoLink, PriorityPill, stamp, StatusPill } from '../ui';

const PAGE_SIZE = 25;
const KIND: Record<string, string> = { created: 'Registered', edited: 'Edited', status: 'Status', comment: 'Comment' };

/** The selected complaint (legacy detail modal): details and photos, status with a note, and the case timeline with comments. */
function Detail({ id, onClose, onDeleted }: { id: string; onClose: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { canDo } = useSession();
  const c = useComplaint(id).data;
  const setStatus = useSetStatus();
  const comment = useComment();
  const removePhoto = useRemovePhoto();
  const remove = useDeleteComplaint();
  const [tab, setTab] = useState<'details' | 'timeline'>('details');
  const [status, setStatusValue] = useState<CpStatus | ''>('');
  const [note, setNote] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [confirm, setConfirm] = useState(false);
  if (!c) return <Skeleton className="h-96" />;
  const fail = (title: string) => (err: unknown) => toast({ tone: 'error', title, description: errorMessage(err) });
  const changeStatus = () =>
    void setStatus
      .mutateAsync({ id: c.id, status: status as CpStatus, note: note.trim() || null })
      .then((x) => {
        toast({ tone: 'success', title: `${x.complaintNo}: ${x.status}` });
        setStatusValue('');
        setNote('');
      })
      .catch(fail('Couldn’t change the status'));
  const post = () =>
    void comment
      .mutateAsync({ id: c.id, text, files })
      .then(() => {
        setText('');
        setFiles([]);
        toast({ tone: 'success', title: 'Added to the timeline' });
      })
      .catch(fail('Couldn’t post'));
  return (
    <Card
      aria-label={`Complaint ${c.complaintNo}`}
      title={
        <span className="flex flex-col">
          <span className="font-mono text-caption font-semibold text-muted">{c.complaintNo}</span>
          <span>{c.customerName}</span>
        </span>
      }
      actions={<Button variant="ghost" size="sm" icon={X} aria-label="Close" onClick={onClose} />}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {canDo('print') && (
            <Button size="sm" icon={Printer} onClick={() => void printComplaint(c.id).catch(fail('Couldn’t print'))}>
              Print
            </Button>
          )}
          {c.recipientEmail && (
            <a href={mailtoLink(c)} className="inline-flex h-ctl-sm items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-page">
              <Mail size={14} aria-hidden /> Email
            </a>
          )}
          {canDo('edit') && (
            <Button size="sm" icon={Pencil} onClick={() => navigate(`/complaints/new?edit=${c.id}`)}>
              Edit
            </Button>
          )}
          {canDo('delete') && (
            <Button size="sm" variant="danger-outline" icon={Trash2} onClick={() => setConfirm(true)}>
              Delete
            </Button>
          )}
        </div>
        <Tabs<'details' | 'timeline'>
          aria-label="Complaint views"
          items={[
            { value: 'details', label: 'Details' },
            { value: 'timeline', label: `Timeline (${c.timeline.length})` },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'details' ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              <PriorityPill p={c.priority} />
              <StatusPill s={c.status} />
            </div>
            <DetailList
              items={[
                { label: 'Date', value: d(c.date) },
                { label: 'Salesman', value: c.salesman },
                { label: 'Contact', value: c.customerPhone },
                { label: 'Location', value: c.customerLocation },
                { label: 'Material', value: c.material },
                { label: 'Category', value: c.category },
                { label: 'Invoice', value: c.invoiceNo },
                { label: 'Resolved on', value: c.resolvedOn ? d(c.resolvedOn) : null },
                { label: 'Notified', value: [c.recipientName, c.recipientEmail].filter(Boolean).join(' · '), wide: true },
                { label: 'Description', value: <span className="whitespace-pre-wrap">{c.description}</span>, wide: true },
              ]}
            />
            <div>
              <p className="mb-1.5 text-label font-semibold uppercase tracking-label text-faint">Photo evidence</p>
              {c.photos.length ? (
                <div className="grid grid-cols-3 gap-2" aria-label="Photo evidence">
                  {c.photos.map((p) => (
                    <div key={p.id} className="relative">
                      <a href={fileUrl(c.id, p.id)} target="_blank" rel="noreferrer">
                        <img src={fileUrl(c.id, p.id)} alt={p.name} className="h-20 w-full rounded-md border border-border object-cover" />
                      </a>
                      {canDo('edit') && (
                        <button type="button" aria-label={`Remove ${p.name}`} className="absolute right-1 top-1 rounded-full bg-card p-0.5 text-faint shadow hover:text-primary" onClick={() => void removePhoto.mutateAsync({ id: c.id, fileId: p.id }).catch(fail('Couldn’t remove'))}>
                          <X size={12} aria-hidden />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">No photos attached.</p>
              )}
            </div>
            {canDo('edit') && (
              <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <Select label="Change status" placeholder={`Now ${c.status}`} options={CP_STATUSES.filter((s) => s !== c.status).map((s) => ({ value: s, label: s }))} value={status} onChange={(e) => setStatusValue(e.target.value as CpStatus)} />
                {status && <Textarea label="Note (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
                <Button size="sm" className="self-end" disabled={!status} loading={setStatus.isPending} onClick={changeStatus}>
                  Update status
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            {canDo('edit') && (
              <div className="flex flex-col gap-2">
                <Textarea label="Add a comment" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Action taken, customer response, findings" />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1 text-sm hover:bg-page">
                    <Paperclip size={14} aria-hidden /> Photos / videos
                    <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" multiple className="sr-only" aria-label="Attach photos or videos" onChange={(e) => setFiles((fs) => [...fs, ...Array.from(e.target.files ?? [])].slice(0, 10))} />
                  </label>
                  {files.map((f, i) => (
                    <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded bg-page px-2 py-0.5 text-caption">
                      {f.name}
                      <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}>
                        <X size={11} aria-hidden />
                      </button>
                    </span>
                  ))}
                  <Button size="sm" className="ml-auto" disabled={!text.trim() && !files.length} loading={comment.isPending} onClick={post}>
                    Post
                  </Button>
                </div>
              </div>
            )}
            <ol className="flex flex-col gap-3 border-l border-divider pl-3" aria-label="Timeline">
              {[...c.timeline].reverse().map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="block text-caption text-muted">
                    <span className="mr-1.5 font-semibold uppercase tracking-label text-faint">{KIND[e.type]}</span>
                    {e.byName} · {stamp(e.at)}
                  </span>
                  {e.text && <span className="whitespace-pre-wrap">{e.text}</span>}
                  {e.files.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {e.files.map((f) =>
                        f.kind === 'photo' ? (
                          <a key={f.id} href={fileUrl(c.id, f.id)} target="_blank" rel="noreferrer">
                            <img src={fileUrl(c.id, f.id)} alt={f.name} className="h-14 w-20 rounded object-cover" />
                          </a>
                        ) : (
                          <video key={f.id} src={fileUrl(c.id, f.id)} controls className="h-24 rounded" aria-label={f.name} />
                        ),
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        title={`Delete ${c.complaintNo}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(c.id)
            .then(() => {
              toast({ tone: 'success', title: 'Complaint deleted' });
              onDeleted();
            })
            .catch(fail('Can’t delete'))
            .finally(() => setConfirm(false))
        }
        onClose={() => setConfirm(false)}
      >
        {c.customerName}: {c.category}. This can’t be undone.
      </ConfirmDialog>
    </Card>
  );
}

/** Complaint register (legacy Complaint Register): search, filters, the list and the selected complaint (`?open=`; the open-or-in-progress filter is `?active=`). */
export function RegisterPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { canDo } = useSession();
  const url = useUrlState(['status', 'priority', 'category', 'material', 'active', 'from', 'to'] as const);
  const [search, setSearch] = useSearchParam(url);
  const v = url.values;
  const list = useComplaints({ q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE, filters: { status: v.status || undefined, priority: v.priority || undefined, category: v.category || undefined, material: v.material || undefined, open: v.active || undefined, from: v.from || undefined, to: v.to || undefined } });
  const selected = url.open;
  const columns: Column<ComplaintView>[] = [
    { id: 'no', header: 'Complaint no.', width: '140px', className: 'font-mono text-sm font-semibold', cell: (c) => c.complaintNo },
    { id: 'date', header: 'Date', width: '110px', className: 'tabular-nums text-sm', cell: (c) => d(c.date) },
    {
      id: 'customer',
      header: 'Customer',
      cell: (c) => (
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{c.customerName}</span>
          <span className="text-caption text-faint">{[c.customerLocation, c.invoiceNo].filter(Boolean).join(' · ')}</span>
        </span>
      ),
    },
    { id: 'salesman', header: 'Salesman', width: '140px', className: 'text-sm', cell: (c) => c.salesman },
    { id: 'category', header: 'Category', width: '170px', className: 'text-sm', cell: (c) => c.category },
    { id: 'priority', header: 'Priority', width: '100px', cell: (c) => <PriorityPill p={c.priority} /> },
    { id: 'status', header: 'Status', width: '120px', cell: (c) => <StatusPill s={c.status} /> },
  ];
  const compact = ['no', 'customer', 'priority', 'status'];
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Complaint register"
        description="Every customer complaint, newest first. Open one to follow it up: status, photos and the case timeline."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => void exportComplaints({ from: v.from || undefined, to: v.to || undefined }).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => navigate('/complaints/new')}>
                New complaint
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search" icon={Search} placeholder="Number, customer, salesman" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[230px]" />
        <Select aria-label="Status" placeholder="All statuses" options={[{ value: 'active', label: 'Open + In progress' }, ...CP_STATUSES.map((x) => ({ value: x, label: x }))]} value={v.active === 'true' ? 'active' : v.status} onChange={(e) => (e.target.value === 'active' ? url.set({ active: 'true', status: null }) : url.set({ status: e.target.value, active: null }))} containerClassName="w-[170px]" />
        <Select aria-label="Priority" placeholder="All priorities" options={CP_PRIORITIES.map((x) => ({ value: x, label: x }))} value={v.priority} onChange={(e) => url.set({ priority: e.target.value })} containerClassName="w-[140px]" />
        <Select aria-label="Category" placeholder="All categories" options={CP_CATEGORIES.map((x) => ({ value: x, label: x }))} value={v.category} onChange={(e) => url.set({ category: e.target.value })} containerClassName="w-[190px]" />
        <Select aria-label="Material" placeholder="All materials" options={CP_MATERIALS.map((x) => ({ value: x, label: x }))} value={v.material} onChange={(e) => url.set({ material: e.target.value })} containerClassName="w-[150px]" />
        <Input aria-label="From date" type="date" value={v.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={v.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
      </div>
      <div className={selected ? 'grid items-start gap-3.5 xl:grid-cols-[minmax(0,1fr)_420px]' : undefined}>
        <div className="min-w-0">
          <DataTable
            label="Complaint register"
            columns={selected ? columns.filter((c) => compact.includes(c.id)) : columns}
            rows={list.data?.rows ?? []}
            getRowId={(c) => c.id}
            minWidth={selected ? 560 : 1050}
            loading={list.isLoading}
            onRowClick={(c) => url.set({ open: c.id, page: url.page })}
            empty={<EmptyState icon={MessageSquareWarning} title="No complaints match" />}
            footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
          />
        </div>
        {selected && <Detail key={selected} id={selected} onClose={() => url.set({ open: null, page: url.page })} onDeleted={() => url.set({ open: null })} />}
      </div>
    </div>
  );
}
