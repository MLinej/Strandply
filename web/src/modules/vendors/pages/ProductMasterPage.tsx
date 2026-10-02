import { Download, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { GST_RATES, PRODUCT_UNITS, type ProductUnit, type VendorProductInput, type VendorProductView } from '@contracts/vendors';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, KpiTile, MenuItem, MenuSeparator, Modal, Pagination, Select, Textarea, useToast, type Column } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { sortMapping } from '../../samples/ui/table-sort';
import { exportVendorProducts, useDeleteVendorProduct, useSaveVendorProduct, useVendorCategories, useVendorProducts, useVendorProductSummary } from '../api';
import { CategoryPill } from '../ui';

const PAGE_SIZE = 15;
const SORT = sortMapping({ name: 'name', code: 'code', unit: 'unit' });
const FIELDS = ['name', 'categoryId', 'unit', 'altUnit', 'convFactor', 'hsn', 'gstRate', 'moq', 'leadTimeDays', 'description', 'notes'] as const;
type Form = Record<(typeof FIELDS)[number], string>;
const EMPTY: Form = { name: '', categoryId: '', unit: 'Nos', altUnit: '', convFactor: '', hsn: '', gstRate: '', moq: '', leadTimeDays: '', description: '', notes: '' };

function ProductForm({ open, product, onClose }: { open: boolean; product: VendorProductView | null; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveVendorProduct();
  const categories = useVendorCategories().data ?? [];
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(product ? (Object.fromEntries(FIELDS.map((k) => [k, product[k] === null ? '' : String(product[k])])) as Form) : EMPTY);
  }, [open, product]);
  const set = (k: keyof Form) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.name.trim()) local.name = 'Product name is required';
    if (!f.categoryId) local.categoryId = 'Pick a category';
    if (Object.keys(local).length) return setErrors(local);
    const input = Object.fromEntries(FIELDS.map((k) => [k, f[k].trim() === '' ? null : f[k].trim()])) as unknown as VendorProductInput;
    input.unit = f.unit as ProductUnit;
    try {
      const saved = await save.mutateAsync({ id: product?.id, input });
      toast({ tone: 'success', title: product ? `${saved.name} updated` : `${saved.name} added`, description: product ? undefined : saved.code });
      onClose();
    } catch (err) {
      const fe = fieldErrors(err);
      if ((err as { code?: string }).code === 'name_taken') fe.name = 'Another product already has that name';
      setErrors(fe);
      toast({ tone: 'error', title: 'Couldn’t save the product', description: errorMessage(err) });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={product ? `Edit ${product.name}` : 'Add product'}
      description={product ? product.code : 'The code (SPL-P-YY-NNN) is assigned when you save.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="vproduct-form" loading={save.isPending}>
            {product ? 'Save changes' : 'Add product'}
          </Button>
        </>
      }
    >
      <form id="vproduct-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <Input label="Product name" placeholder="e.g. MDI Resin" value={f.name} onChange={(e) => set('name')(e.target.value)} error={errors.name} containerClassName="sm:col-span-2" />
        <Select label="Category" placeholder="Select category" options={categories.map((c) => ({ value: c.id, label: c.name }))} value={f.categoryId} onChange={(e) => set('categoryId')(e.target.value)} error={errors.categoryId} />
        <Select label="Default unit" options={PRODUCT_UNITS.map((u) => ({ value: u, label: u }))} value={f.unit} onChange={(e) => set('unit')(e.target.value)} error={errors.unit} />
        <Input label="Alternate unit" placeholder="e.g. KG if the unit is MT" value={f.altUnit} onChange={(e) => set('altUnit')(e.target.value)} />
        <Input
          label="Conversion factor"
          inputMode="decimal"
          placeholder="e.g. 1000"
          value={f.convFactor}
          onChange={(e) => set('convFactor')(e.target.value)}
          error={errors.convFactor}
          hint={f.altUnit && f.convFactor ? `1 ${f.unit} = ${f.convFactor} ${f.altUnit}` : '1 unit = factor × alternate unit'}
        />
        <Input label="HSN / SAC" inputMode="numeric" maxLength={8} placeholder="e.g. 3909" value={f.hsn} onChange={(e) => set('hsn')(e.target.value)} error={errors.hsn} />
        <Select label="GST rate" placeholder="Select rate" options={GST_RATES.map((g) => ({ value: String(g), label: `${g}%` }))} value={f.gstRate} onChange={(e) => set('gstRate')(e.target.value)} error={errors.gstRate} />
        <Input label="Minimum order qty" inputMode="decimal" value={f.moq} onChange={(e) => set('moq')(e.target.value)} error={errors.moq} suffix={f.unit} />
        <Input label="Lead time" inputMode="numeric" value={f.leadTimeDays} onChange={(e) => set('leadTimeDays')(e.target.value)} error={errors.leadTimeDays} suffix="days" />
        <Textarea label="Description / specs" rows={2} placeholder="Technical spec, quality grade…" value={f.description} onChange={(e) => set('description')(e.target.value)} containerClassName="sm:col-span-2" />
        <Textarea label="Internal notes" rows={2} placeholder="Storage, handling, alternatives…" value={f.notes} onChange={(e) => set('notes')(e.target.value)} containerClassName="sm:col-span-2" />
      </form>
    </Modal>
  );
}

/** Materials bought from vendors (legacy Product Master: openAddP / saveP / delP / renderProds). */
export function ProductMasterPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['categoryId'] as const);
  const [search, setSearch] = useSearchParam(url);
  const query = { q: url.q || undefined, sort: url.sort || undefined, page: url.page, pageSize: PAGE_SIZE, filters: { categoryId: url.values.categoryId || undefined } };
  const list = useVendorProducts(query);
  const summary = useVendorProductSummary().data;
  const categories = useVendorCategories().data ?? [];
  const catById = new Map(categories.map((c) => [c.id, c]));
  const remove = useDeleteVendorProduct();
  const [form, setForm] = useState<VendorProductView | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<VendorProductView | null>(null);

  async function onDelete() {
    if (!toDelete) return;
    try {
      await remove.mutateAsync(toDelete.id);
      toast({ tone: 'success', title: `${toDelete.name} deleted` });
    } catch (err) {
      toast({ tone: 'error', title: 'Can’t delete this product', description: errorMessage(err) });
    }
    setToDelete(null);
  }

  const columns: Column<VendorProductView>[] = [
    {
      id: 'name',
      header: 'Product',
      sortValue: (p) => p.name,
      cell: (p) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold">{p.name}</span>
          <span className="text-caption text-faint">{p.code}</span>
        </span>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      width: '190px',
      cell: (p) => {
        const c = catById.get(p.categoryId);
        return c ? <CategoryPill name={c.name} icon={c.icon} color={c.color} /> : p.categoryName;
      },
    },
    { id: 'unit', header: 'Unit', width: '80px', sortValue: (p) => p.unit, cell: (p) => p.unit },
    { id: 'hsn', header: 'HSN', width: '80px', className: 'font-mono text-sm', cell: (p) => p.hsn ?? '—' },
    { id: 'gst', header: 'GST', width: '64px', align: 'right', cell: (p) => (p.gstRate === null ? '—' : `${p.gstRate}%`) },
    { id: 'lead', header: 'Lead time', width: '96px', align: 'right', cell: (p) => (p.leadTimeDays === null ? '—' : `${p.leadTimeDays} d`) },
    {
      id: 'vendors',
      header: 'Vendors',
      width: '96px',
      align: 'right',
      cell: (p) => <span className={p.vendorCount ? 'font-semibold text-green' : 'text-faint'}>{p.vendorCount} linked</span>,
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (p) =>
        (canDo('edit') || canDo('delete')) && (
          <RowMenu label={`Actions for ${p.name}`}>
            {(close) => (
              <>
                {canDo('edit') && (
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
        title="Product master"
        description="Materials and services bought from vendors. Vendors are tagged with these."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => exportVendorProducts({ q: query.q, sort: query.sort, filters: query.filters }).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Export Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                Add product
              </Button>
            )}
          </>
        }
      />
      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile variant="compact" label="Products" value={summary.total} />
          <KpiTile variant="compact" label="Categories" value={summary.categories} />
          <KpiTile variant="compact" label="With vendors" value={summary.withVendors} meta="At least one supplier" />
          <KpiTile variant="compact" label="Showing" value={list.data?.total ?? '—'} meta="With these filters" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search products" icon={Search} placeholder="Name, code, HSN, unit…" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[300px]" />
        <Select aria-label="Category" placeholder="All categories" options={categories.map((c) => ({ value: c.id, label: c.name }))} value={url.values.categoryId} onChange={(e) => url.set({ categoryId: e.target.value })} containerClassName="w-[210px]" />
      </div>
      <DataTable
        label="Vendor products"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(p) => p.id}
        minWidth={940}
        loading={list.isLoading}
        sort={SORT.fromApi(url.sort)}
        onSortChange={(s) => url.set({ sort: SORT.toApi(s) ?? null })}
        manualSort
        onRowClick={canDo('edit') ? (p) => setForm(p) : undefined}
        empty={<EmptyState icon={Package} title="No products found" description="Add a product or change the filter." />}
        footer={(list.data?.total ?? 0) > 0 && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <ProductForm open={form !== null} product={form === 'new' ? null : form} onClose={() => setForm(null)} />
      <ConfirmDialog open={!!toDelete} title={`Delete ${toDelete?.name ?? ''}?`} confirmLabel="Delete" danger busy={remove.isPending} onConfirm={onDelete} onClose={() => setToDelete(null)}>
        A product that a vendor supplies can’t be deleted; remove it from those vendors first.
      </ConfirmDialog>
    </div>
  );
}
