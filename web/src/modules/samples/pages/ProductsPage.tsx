import { Download, FileSpreadsheet, Package, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BOARD_TYPES, STOCK_STATUSES, type BoardType, type ImportReport, type Product, type ProductInput, type StockStatus } from '@contracts/sampletrack';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, KpiTile, MenuItem, MenuSeparator, Modal, Pagination, Pill, Select, StatusPill, useToast, type Column } from '@/components/ui';
import { formatAmount } from '@/lib/format';
import {
  downloadProductTemplate,
  exportProducts,
  inUseOf,
  useCommitProductImport,
  useCreateProduct,
  useDeleteProduct,
  usePreviewProductImport,
  useProducts,
  useProductSummary,
  useUpdateProduct,
} from '../api';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../ui/errors';
import { useSearchParam, useUrlState } from '../ui/list-state';
import { PageHeader } from '../ui/PageHeader';
import { RowMenu, runAndClose } from '../ui/RowMenu';
import { sortMapping } from '../ui/table-sort';

const PAGE_SIZE = 10;
const SORT = sortMapping({ code: 'code', name: 'name', board: 'boardType', thickness: 'thicknessMm', price: 'unitPricePaise', stock: 'stockStatus' });
const rupees = (paise: number) => formatAmount(paise / 100, { symbol: true });

type Form = { code: string; name: string; boardType: BoardType; thicknessMm: string; size: string; category: string; price: string; stockStatus: StockStatus; description: string };
const EMPTY: Form = { code: '', name: '', boardType: 'OSB', thicknessMm: '', size: '8x4 ft', category: 'Standard', price: '', stockStatus: 'Available', description: '' };

function ProductForm({ open, product, onClose }: { open: boolean; product: Product | null; onClose: () => void }) {
  const toast = useToast();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      product
        ? {
            code: product.code,
            name: product.name,
            boardType: product.boardType,
            thicknessMm: product.thicknessMm ? String(product.thicknessMm) : '',
            size: product.size ?? '',
            category: product.category ?? '',
            price: product.unitPricePaise ? String(product.unitPricePaise / 100) : '',
            stockStatus: product.stockStatus,
            description: product.description ?? '',
          }
        : EMPTY,
    );
  }, [open, product]);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.code.trim()) local.code = 'Product code is required';
    if (!f.name.trim()) local.name = 'Product name is required';
    const price = f.price.trim() ? Number(f.price) : 0;
    if (!Number.isFinite(price) || price < 0) local.unitPricePaise = 'Enter a price in rupees';
    const thick = f.thicknessMm.trim() ? Number(f.thicknessMm) : null;
    if (thick !== null && (!Number.isFinite(thick) || thick <= 0)) local.thicknessMm = 'Thickness must be a positive number';
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    const input: ProductInput = {
      code: f.code.trim(),
      name: f.name.trim(),
      boardType: f.boardType,
      thicknessMm: thick,
      size: f.size.trim() || null,
      category: f.category.trim() || null,
      unitPricePaise: Math.round(price * 100),
      stockStatus: f.stockStatus,
      description: f.description.trim() || null,
    };
    try {
      const saved = product ? await update.mutateAsync({ id: product.id, input }) : await create.mutateAsync(input);
      toast({ tone: 'success', title: product ? `${saved.code} updated` : `${saved.code} added` });
      onClose();
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(Object.keys(fe).length ? fe : err && (err as { code?: string }).code === 'code_taken' ? { code: 'Another product already uses this code' } : {});
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      title={product ? `Edit ${product.code}` : 'Add product'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="product-form" loading={create.isPending || update.isPending}>
            {product ? 'Save changes' : 'Add product'}
          </Button>
        </>
      }
    >
      <form id="product-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <Input label="Product code" placeholder="OSB-18-8X4" value={f.code} onChange={(e) => set('code')(e.target.value.toUpperCase())} error={errors.code} />
        <Input label="Product name" placeholder="OSB 18mm Premium" value={f.name} onChange={(e) => set('name')(e.target.value)} error={errors.name} />
        <Select label="Board type" options={BOARD_TYPES.map((b) => ({ value: b, label: b }))} value={f.boardType} onChange={(e) => set('boardType')(e.target.value as BoardType)} />
        <Input label="Thickness" type="number" inputMode="decimal" suffix="mm" value={f.thicknessMm} onChange={(e) => set('thicknessMm')(e.target.value)} error={errors.thicknessMm} />
        <Input label="Size" placeholder="8x4 ft" value={f.size} onChange={(e) => set('size')(e.target.value)} />
        <Input label="Category" placeholder="Standard / Premium" value={f.category} onChange={(e) => set('category')(e.target.value)} />
        <Input label="Unit price" type="number" inputMode="decimal" suffix="₹" value={f.price} onChange={(e) => set('price')(e.target.value)} error={errors.unitPricePaise} />
        <Select label="Stock" options={STOCK_STATUSES.map((s) => ({ value: s, label: s }))} value={f.stockStatus} onChange={(e) => set('stockStatus')(e.target.value as StockStatus)} />
        <Input label="Description" value={f.description} onChange={(e) => set('description')(e.target.value)} containerClassName="sm:col-span-2" />
      </form>
    </Modal>
  );
}

const STATUS_LABEL = { would_add: 'Will add', added: 'Added', skipped: 'Skipped', error: 'Error' } as const;
const STATUS_TONE = { would_add: 'green', added: 'green', skipped: 'neutral', error: 'red' } as const;

/** Excel/CSV import (legacy importProductsExcel): preview first, then import the valid rows together. */
function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const preview = usePreviewProductImport();
  const commit = useCommitProductImport();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setReport(null);
    }
  }, [open]);

  async function choose(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setReport(null);
    try {
      setReport(await preview.mutateAsync(f));
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t read the file', description: errorMessage(err) });
    }
  }

  async function doImport() {
    if (!file) return;
    try {
      const r = await commit.mutateAsync(file);
      setReport(r);
      toast({ tone: r.totals.added ? 'success' : 'warning', title: `${r.totals.added} product${r.totals.added === 1 ? '' : 's'} imported`, description: `${r.totals.skipped} skipped, ${r.totals.errors} with errors` });
    } catch (err) {
      toast({ tone: 'error', title: 'Import failed', description: errorMessage(err) });
    }
  }

  const unmapped = report ? Object.entries(report.columns).filter(([, v]) => !v).map(([k]) => k) : [];
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Import products"
      description="Excel (.xlsx, .xls) or CSV. Headers are matched loosely (“Item code”, “MRP”, “Availability”…). Rows with an empty name or a name that already exists are skipped."
      footer={
        <>
          <Button icon={FileSpreadsheet} onClick={() => downloadProductTemplate().catch((err) => toast({ tone: 'error', title: 'Download failed', description: errorMessage(err) }))}>
            Download template
          </Button>
          <Button onClick={onClose}>{report?.mode === 'commit' ? 'Done' : 'Cancel'}</Button>
          {report?.mode === 'preview' && (
            <Button variant="primary" icon={Upload} loading={commit.isPending} disabled={!report.totals.added} onClick={doImport}>
              Import {report.totals.added} product{report.totals.added === 1 ? '' : 's'}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="sr-only" aria-label="Spreadsheet file" onChange={(e) => choose(e.target.files?.[0])} />
          <Button icon={Upload} loading={preview.isPending} onClick={() => input.current?.click()}>
            {file ? 'Choose another file' : 'Choose file'}
          </Button>
          <span className="truncate text-base text-muted">{file?.name ?? 'No file chosen'}</span>
        </div>
        {report && (
          <>
            <div className="flex flex-wrap gap-2">
              <Pill tone="green" size="md">
                {report.totals.added} {report.mode === 'commit' ? 'added' : 'to add'}
              </Pill>
              <Pill size="md">{report.totals.skipped} skipped</Pill>
              <Pill tone={report.totals.errors ? 'red' : 'neutral'} size="md">
                {report.totals.errors} errors
              </Pill>
              <span className="text-caption text-faint">{report.totals.rows} rows read</span>
            </div>
            {unmapped.length > 0 && <p className="text-meta text-muted">No column found for: {unmapped.join(', ')}. Defaults are used.</p>}
            <div className="max-h-80 overflow-y-auto rounded border border-border">
              <table className="w-full text-base">
                <thead className="sticky top-0 bg-page">
                  <tr className="h-row-head text-left text-label font-semibold uppercase tracking-label text-muted">
                    <th className="px-3 font-semibold">Row</th>
                    <th className="px-3 font-semibold">Code</th>
                    <th className="px-3 font-semibold">Name</th>
                    <th className="px-3 font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.row} className="border-t border-divider align-top">
                      <td className="px-3 py-1.5 text-faint">{r.row}</td>
                      <td className="px-3 py-1.5 font-mono text-sm">{r.product?.code ?? '—'}</td>
                      <td className="px-3 py-1.5">{r.product?.name ?? '—'}</td>
                      <td className="px-3 py-1.5">
                        <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill>
                        {r.reason && <span className="ml-2 text-meta text-muted">{r.reason}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Product master (legacy renderProductTable / saveProduct / delProduct / exportProducts / importProductsExcel / downloadProductTemplate). */
export function ProductsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['boardType', 'stockStatus'] as const);
  const [search, setSearch] = useSearchParam(url);
  const query = {
    q: url.q || undefined,
    sort: url.sort || undefined,
    page: url.page,
    pageSize: PAGE_SIZE,
    filters: { boardType: (url.values.boardType || undefined) as BoardType | undefined, stockStatus: (url.values.stockStatus || undefined) as StockStatus | undefined },
  };
  const list = useProducts(query);
  const summary = useProductSummary().data;
  const [form, setForm] = useState<Product | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const remove = useDeleteProduct();
  const canEdit = canDo('edit');

  async function onDelete() {
    if (!toDelete) return;
    try {
      await remove.mutateAsync(toDelete.id);
      toast({ tone: 'success', title: `${toDelete.code} deleted` });
    } catch (err) {
      const used = inUseOf(err);
      toast({ tone: 'error', title: 'Can’t delete', description: used ? `${used.requests} request(s) use this product.` : errorMessage(err) });
    }
    setToDelete(null);
  }

  const columns: Column<Product>[] = [
    { id: 'code', header: 'Code', width: '130px', sortValue: (p) => p.code, className: 'font-mono text-sm font-semibold', cell: (p) => p.code },
    { id: 'name', header: 'Product', sortValue: (p) => p.name, cell: (p) => <span className="font-medium">{p.name}</span> },
    { id: 'board', header: 'Board', width: '110px', sortValue: (p) => p.boardType, cell: (p) => p.boardType },
    { id: 'thickness', header: 'Thickness', width: '96px', align: 'right', sortValue: (p) => p.thicknessMm, cell: (p) => (p.thicknessMm ? `${p.thicknessMm} mm` : '—') },
    { id: 'size', header: 'Size', width: '90px', className: 'text-muted', cell: (p) => p.size ?? '—' },
    { id: 'category', header: 'Category', width: '100px', className: 'text-muted', cell: (p) => p.category ?? '—' },
    { id: 'price', header: 'Unit price', width: '110px', align: 'right', sortValue: (p) => p.unitPricePaise, cell: (p) => rupees(p.unitPricePaise) },
    { id: 'stock', header: 'Stock', width: '110px', sortValue: (p) => p.stockStatus, cell: (p) => <StatusPill status={p.stockStatus} /> },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (p) =>
        (canEdit || canDo('delete')) && (
          <RowMenu label={`Actions for ${p.code}`}>
            {(close) => (
              <>
                {canEdit && (
                  <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(p))}>
                    Edit
                  </MenuItem>
                )}
                {canDo('delete') && (
                  <>
                    <MenuSeparator />
                    <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(p))}>
                      Delete
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </RowMenu>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Sample products"
        description="Boards that can be requested as samples. Picking one on a request fills in its details."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => exportProducts({ q: query.q, sort: query.sort, filters: query.filters }).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Export Excel
              </Button>
            )}
            {canEdit && (
              <>
                <Button icon={Upload} onClick={() => setImporting(true)}>
                  Import
                </Button>
                <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                  Add product
                </Button>
              </>
            )}
          </>
        }
      />
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(
            [
              ['Total', summary.total, ''],
              ['OSB', summary.osb, 'OSB'],
              ['S-OSB', summary.sosb, 'S-OSB'],
              ['MDO', summary.mdo, 'MDO'],
              ['Others', summary.others, ''],
            ] as const
          ).map(([label, n, board]) => (
            <button
              key={label}
              type="button"
              disabled={!board && label !== 'Total'}
              onClick={() => url.set({ boardType: board || null })}
              className="text-left disabled:cursor-default"
              aria-label={`${label}: ${n}${board || label === 'Total' ? ' (filter)' : ''}`}
            >
              <KpiTile variant="compact" label={label} value={n} />
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search products" icon={Search} placeholder="Code, name, size or category" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[300px]" />
        <Select aria-label="Board type" placeholder="All boards" options={BOARD_TYPES.map((b) => ({ value: b, label: b }))} value={url.values.boardType} onChange={(e) => url.set({ boardType: e.target.value })} containerClassName="w-[170px]" />
        <Select aria-label="Stock" placeholder="Any stock" options={STOCK_STATUSES.map((s) => ({ value: s, label: s }))} value={url.values.stockStatus} onChange={(e) => url.set({ stockStatus: e.target.value })} containerClassName="w-[170px]" />
      </div>
      <DataTable
        label="Products"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(r) => r.id}
        minWidth={1000}
        loading={list.isLoading}
        sort={SORT.fromApi(url.sort)}
        onSortChange={(s) => url.set({ sort: SORT.toApi(s) ?? null })}
        manualSort
        onRowClick={canEdit ? (p) => setForm(p) : undefined}
        empty={<EmptyState icon={Package} title={url.q || url.values.boardType || url.values.stockStatus ? 'No product matches' : 'No products yet'} />}
        footer={(list.data?.total ?? 0) > 0 && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <ProductForm open={form !== null} product={form === 'new' ? null : form} onClose={() => setForm(null)} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      <ConfirmDialog open={!!toDelete} title={`Delete ${toDelete?.code ?? ''}?`} confirmLabel="Delete" danger busy={remove.isPending} onConfirm={onDelete} onClose={() => setToDelete(null)}>
        A product used on a request can’t be deleted. Its code becomes free to reuse.
      </ConfirmDialog>
    </div>
  );
}
