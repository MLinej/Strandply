import { Download, Eye, FileText, Pencil, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { DOC_KINDS, WF_STATES, type DocKind, type WfState } from '@contracts/production';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, MenuItem, MenuSeparator, Modal, Pagination, Tabs, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportProduction, useDeleteDoc, useDoc, useDocs, type ViewByKind } from '../api';
import { printDoc } from '../print';
import { FySelect, Trail, WfPill, wfLabel } from '../ui';
import { WorkflowActions } from './Workflow';

const PAGE_SIZE = 20;
type Tab = 'all' | WfState;

export interface FormProps<V> {
  open: boolean;
  doc: V | null;
  onClose: () => void;
  onSaved: (doc: V) => void;
}

interface Props<K extends DocKind> {
  kind: K;
  title: string;
  description: string;
  newLabel: string;
  searchPlaceholder: string;
  columns: Column<ViewByKind[K]>[];
  minWidth: number;
  Form: ComponentType<FormProps<ViewByKind[K]>>;
  Detail: ComponentType<{ doc: ViewByKind[K] }>;
  /** Extra row-menu items (e.g. chipping → create WIP batch). */
  extraMenu?: (doc: ViewByKind[K], close: () => void) => ReactNode;
  /** Extra buttons in the detail footer. */
  extraDetailActions?: (doc: ViewByKind[K]) => ReactNode;
  /** Shown under the header (e.g. resin lot stock). */
  children?: ReactNode;
}

type Doc = { id: string; docNo: string; date: string; wfState: WfState; wfTrail: ViewByKind['plan']['wfTrail'] };

/** One document with its review history (legacy view*). */
export function DocDetail<K extends DocKind>({
  kind,
  id,
  onClose,
  onEdit,
  Detail,
  extra,
}: {
  kind: K;
  id: string | null;
  onClose: () => void;
  onEdit?: (d: ViewByKind[K]) => void;
  Detail: ComponentType<{ doc: ViewByKind[K] }>;
  extra?: (doc: ViewByKind[K]) => ReactNode;
}) {
  const toast = useToast();
  const { canDo } = useSession();
  const q = useDoc(kind, id);
  const d = q.data as (ViewByKind[K] & Doc) | undefined;
  return (
    <Modal
      open={!!id}
      onClose={onClose}
      size="lg"
      title={d ? `${DOC_KINDS[kind].label} ${d.docNo}` : DOC_KINDS[kind].label}
      description={d ? `${formatDate(d.date)} · ${wfLabel(d.wfState)}` : undefined}
      footer={
        d && (
          <>
            {extra?.(d)}
            {canDo('print') && (
              <Button icon={Printer} onClick={() => void printDoc(kind, d.id).catch((err) => toast({ tone: 'error', title: 'Couldn’t print', description: errorMessage(err) }))}>
                Print
              </Button>
            )}
            {canDo('edit') && onEdit && d.wfState !== 'approved' && (
              <Button icon={Pencil} onClick={() => onEdit(d)}>
                Edit
              </Button>
            )}
            <WorkflowActions kind={kind} id={d.id} docNo={d.docNo} state={d.wfState} />
          </>
        )
      }
    >
      {!d ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <Detail doc={d} />
          <section>
            <h3 className="mb-1.5 text-label font-semibold uppercase tracking-label text-faint">Review and approval</h3>
            <Trail steps={d.wfTrail} />
          </section>
        </div>
      )}
    </Modal>
  );
}

/**
 * Register for one production document kind: workflow tabs, search, FY and date filters, Excel, row menu
 * (view, edit, print, sign-off, delete), the kind's form and detail. `?new=1` opens the form, `?open=<id>` a document.
 */
export function DocRegister<K extends DocKind>({ kind, title, description, newLabel, searchPlaceholder, columns, minWidth, Form, Detail, extraMenu, extraDetailActions, children }: Props<K>) {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['wf', 'fy', 'from', 'to', 'new'] as const);
  const [search, setSearch] = useSearchParam(url);
  const tab = (url.values.wf || 'all') as Tab;
  const filters = { wfState: tab === 'all' ? undefined : tab, fy: url.values.fy || undefined, from: url.values.from || undefined, to: url.values.to || undefined };
  const list = useDocs(kind, { q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE, filters });
  const remove = useDeleteDoc(kind);
  const [form, setForm] = useState<ViewByKind[K] | 'new' | null>(null);
  const [viewing, setViewing] = useState<string | null>(url.open);
  const [toDelete, setToDelete] = useState<(ViewByKind[K] & Doc) | null>(null);
  const guard = (t: string, fn: () => Promise<unknown>) => void fn().catch((err) => toast({ tone: 'error', title: t, description: errorMessage(err) }));

  useEffect(() => {
    if (url.values.new && canDo('edit')) {
      setForm('new');
      url.set({ new: null });
    }
    // Only when the link changes.
  }, [url.values.new]);

  const all: Column<ViewByKind[K]>[] = [
    {
      id: 'no',
      header: 'Document',
      width: '130px',
      cell: (d) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold tabular-nums">{(d as Doc).docNo}</span>
          <span className="text-caption text-faint">{formatDate((d as Doc).date)}</span>
        </span>
      ),
    },
    ...columns,
    { id: 'wf', header: 'Status', width: '140px', cell: (d) => <WfPill state={(d as Doc).wfState} /> },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (row) => {
        const d = row as ViewByKind[K] & Doc;
        return (
          <RowMenu label={`Actions for ${d.docNo}`}>
            {(close) => (
              <>
                <MenuItem icon={Eye} onClick={runAndClose(close, () => setViewing(d.id))}>
                  View
                </MenuItem>
                {canDo('edit') && d.wfState !== 'approved' && (
                  <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(d))}>
                    Edit
                  </MenuItem>
                )}
                {canDo('print') && (
                  <MenuItem icon={Printer} onClick={runAndClose(close, () => guard('Couldn’t print', () => printDoc(kind, d.id)))}>
                    Print
                  </MenuItem>
                )}
                {extraMenu?.(d, close)}
                {canDo('delete') && d.wfState !== 'approved' && (
                  <>
                    <MenuSeparator />
                    <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(d))}>
                      Delete
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </RowMenu>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => guard('Export failed', () => exportProduction(kind, { fy: filters.fy, from: filters.from, to: filters.to }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                {newLabel}
              </Button>
            )}
          </>
        }
      />
      {children}
      <Tabs<Tab>
        aria-label="Review status"
        items={[{ value: 'all', label: 'All' }, ...WF_STATES.map((s) => ({ value: s, label: wfLabel(s) }))]}
        value={tab}
        onChange={(v) => url.set({ wf: v === 'all' ? null : v })}
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search" icon={Search} placeholder={searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[240px]" />
        <FySelect value={url.values.fy} onChange={(v) => url.set({ fy: v })} />
        <Input aria-label="From date" type="date" value={url.values.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={url.values.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
      </div>
      <DataTable
        label={title}
        columns={all}
        rows={list.data?.rows ?? []}
        getRowId={(d) => (d as Doc).id}
        minWidth={minWidth}
        loading={list.isLoading}
        onRowClick={(d) => setViewing((d as Doc).id)}
        empty={<EmptyState icon={FileText} title="Nothing here yet" />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <Form
        open={form !== null}
        doc={form === 'new' ? null : form}
        onClose={() => setForm(null)}
        onSaved={(d) => {
          setForm(null);
          setViewing((d as Doc).id);
        }}
      />
      <DocDetail
        kind={kind}
        id={viewing}
        onClose={() => {
          setViewing(null);
          if (url.open) url.set({ open: null });
        }}
        onEdit={(d) => {
          setViewing(null);
          setForm(d);
        }}
        Detail={Detail}
        extra={extraDetailActions}
      />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.docNo ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: `${toDelete!.docNo} deleted` }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        A document that other documents use, or that is approved, can’t be deleted.
      </ConfirmDialog>
    </div>
  );
}
