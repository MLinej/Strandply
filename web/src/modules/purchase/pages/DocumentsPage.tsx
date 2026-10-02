import { FileText, Search, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { DOCUMENT_TYPES, type DocumentType, type PurchaseDocumentView } from '@contracts/purchase';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, Pagination, Select, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { documentUrl, useDeleteDocument, useDocuments, useUploadDocument } from '../api';

const PAGE_SIZE = 20;
const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Invoices, weighment slips, GRN/MRN, photos (legacy Document Management). */
export function DocumentsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['type'] as const);
  const [search, setSearch] = useSearchParam(url);
  const list = useDocuments({ q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE, filters: { type: (url.values.type || undefined) as DocumentType | undefined } });
  const upload = useUploadDocument();
  const remove = useDeleteDocument();
  const [type, setType] = useState<DocumentType>('Invoice');
  const [dragging, setDragging] = useState(false);
  const [toDelete, setToDelete] = useState<PurchaseDocumentView | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | File[] | null) {
    for (const file of [...(files ?? [])]) {
      try {
        await upload.mutateAsync({ file, type });
        toast({ tone: 'success', title: `${file.name} uploaded` });
      } catch (err) {
        toast({ tone: 'error', title: `Couldn’t upload ${file.name}`, description: errorMessage(err) });
      }
    }
  }

  const columns: Column<PurchaseDocumentView>[] = [
    {
      id: 'name',
      header: 'Document',
      cell: (d) => (
        <a href={documentUrl(d.id)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
          <FileText size={15} className="shrink-0 text-muted" aria-hidden />
          <span className="truncate">{d.name}</span>
        </a>
      ),
    },
    { id: 'type', header: 'Type', width: '140px', cell: (d) => d.type },
    { id: 'entry', header: 'Entry', width: '220px', className: 'text-sm text-muted', cell: (d) => d.entryLabel ?? '—' },
    { id: 'size', header: 'Size', width: '80px', align: 'right', className: 'text-sm tabular-nums', cell: (d) => size(d.sizeBytes) },
    { id: 'when', header: 'Uploaded', width: '170px', className: 'text-sm text-muted', cell: (d) => `${formatDate(d.createdAt.slice(0, 10))}${d.uploadedByName ? ` · ${d.uploadedByName}` : ''}` },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '56px',
      align: 'right',
      cell: (d) => canDo('delete') && <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete ${d.name}`} onClick={() => setToDelete(d)} />,
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Documents" description="Invoices, weighment slips, GRN/MRN, notes and photos. Attach them to an entry from the entry itself, or upload here." />
      {canDo('edit') && (
        <Card>
          <div
            className={`flex flex-col items-center gap-2 rounded border-2 border-dashed px-4 py-6 text-center transition-colors ${dragging ? 'border-primary bg-primary-tint' : 'border-border'}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void onFiles(e.dataTransfer.files);
            }}
          >
            <Upload size={22} className="text-muted" aria-hidden />
            <p className="font-medium">Drop files here, or choose them</p>
            <p className="text-caption text-faint">PDF, JPG or PNG, up to 10 MB each</p>
            <div className="mt-1 flex items-center gap-2">
              <Select aria-label="Type for uploads" options={DOCUMENT_TYPES.map((t) => ({ value: t, label: t }))} value={type} onChange={(e) => setType(e.target.value as DocumentType)} containerClassName="w-[170px]" />
              <input ref={input} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="sr-only" aria-label="Choose files" onChange={(e) => void onFiles(e.target.files)} />
              <Button variant="primary" icon={Upload} loading={upload.isPending} onClick={() => input.current?.click()}>
                Choose files
              </Button>
            </div>
          </div>
        </Card>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search documents" icon={Search} placeholder="File name" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[240px]" />
        <Select
          aria-label="Type"
          placeholder="All types"
          options={DOCUMENT_TYPES.map((t) => ({ value: t, label: `${t}${list.data?.byType[t] ? ` (${list.data.byType[t]})` : ''}` }))}
          value={url.values.type}
          onChange={(e) => url.set({ type: e.target.value })}
          containerClassName="w-[200px]"
        />
      </div>
      <DataTable
        label="Documents"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(d) => d.id}
        minWidth={900}
        loading={list.isLoading}
        empty={<EmptyState icon={FileText} title="No documents" />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.name ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: 'Document deleted' }))
            .catch((err) => toast({ tone: 'error', title: 'Couldn’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
