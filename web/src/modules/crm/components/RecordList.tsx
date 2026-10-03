import { Download, FileText, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, MenuItem, MenuSeparator, Pagination, useToast, type Column } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportCrm, useDeleteRecord, useRecords, type CrmKind, type CrmViews, type ExportKind } from '../api';
import { RecordForm, type FieldDef } from './RecordForm';

const PAGE_SIZE = 25;

/**
 * A register for one CRM record kind: search, page filters (URL-backed), table, row menu with edit / delete
 * and page-specific actions, the kind's form. `?new=1` opens the form.
 */
export function RecordList<K extends CrmKind>({
  kind,
  title,
  description,
  noun,
  columns,
  fields,
  filterKeys = [],
  filters,
  toQuery,
  rowActions,
  onRowClick,
  above,
  exportKind,
  canAdd = true,
  minWidth = 1000,
  searchPlaceholder = 'Search',
  newInitial,
  formExtra,
}: {
  kind: K;
  title: string;
  description: string;
  /** "lead", "task"… */
  noun: string;
  columns: Column<CrmViews[K]>[];
  fields: FieldDef[];
  filterKeys?: readonly string[];
  filters?: (values: Record<string, string>, set: (patch: Record<string, string | null>) => void) => ReactNode;
  /** URL values → API filters. */
  toQuery?: (values: Record<string, string>) => Record<string, unknown>;
  rowActions?: (row: CrmViews[K], close: () => void) => ReactNode;
  onRowClick?: (row: CrmViews[K]) => void;
  above?: ReactNode;
  exportKind?: ExportKind;
  canAdd?: boolean;
  minWidth?: number;
  searchPlaceholder?: string;
  newInitial?: Record<string, unknown>;
  /** Under the form's fields (gets the values and the record being edited). */
  formExtra?: (values: Record<string, string | boolean>, record: CrmViews[K] | null) => ReactNode;
}) {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState([...filterKeys, 'new'] as string[]);
  const [search, setSearch] = useSearchParam(url);
  const values = url.values as Record<string, string>;
  const list = useRecords(kind, { q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE, sort: url.sort || undefined, filters: toQuery ? toQuery(values) : {} });
  const remove = useDeleteRecord(kind);
  const [form, setForm] = useState<CrmViews[K] | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<CrmViews[K] | null>(null);
  const label = (r: CrmViews[K]) => {
    const x = r as unknown as Record<string, unknown>;
    return String(x.companyName ?? x.name ?? x.quoteNo ?? x.orderNo ?? x.customerName ?? noun);
  };

  useEffect(() => {
    if (values.new && canAdd && canDo('edit')) {
      setForm('new');
      url.set({ new: null });
    }
  }, [values.new]);

  const all: Column<CrmViews[K]>[] = [
    ...columns,
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (r) =>
        (canDo('edit') || canDo('delete') || rowActions) && (
          <span onClick={(e) => e.stopPropagation()}>
            <RowMenu label={`Actions for ${label(r)}`}>
              {(close) => (
                <>
                  {rowActions?.(r, close)}
                  {canDo('edit') && (
                    <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(r))}>
                      Edit
                    </MenuItem>
                  )}
                  {canDo('delete') && (
                    <>
                      <MenuSeparator />
                      <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(r))}>
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

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            {exportKind && canDo('export') && (
              <Button icon={Download} onClick={() => void exportCrm(exportKind).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
            {canAdd && canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                Add {noun}
              </Button>
            )}
          </>
        }
      />
      {above}
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search" icon={Search} placeholder={searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[260px]" />
        {filters?.(values, (p) => url.set(p))}
      </div>
      <DataTable
        label={title}
        columns={all}
        rows={list.data?.rows ?? []}
        getRowId={(r) => (r as { id: string }).id}
        minWidth={minWidth}
        loading={list.isLoading}
        onRowClick={onRowClick ?? (canDo('edit') ? (r) => setForm(r) : undefined)}
        empty={<EmptyState icon={FileText} title={`No ${noun}s yet`} />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <RecordForm kind={kind} open={form !== null} record={form === 'new' ? null : form} initial={newInitial} title={form === 'new' ? `Add ${noun}` : `Edit ${noun}`} fields={fields} extra={formExtra ? (v) => formExtra(v, form === 'new' ? null : form) : undefined} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete ? label(toDelete) : ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync((toDelete as { id: string }).id)
            .then(() => toast({ tone: 'success', title: 'Deleted' }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        This can’t be undone.
      </ConfirmDialog>
    </div>
  );
}
