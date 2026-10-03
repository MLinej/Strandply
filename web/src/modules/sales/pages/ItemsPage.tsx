import { Download, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { rateSqftOf, sqmFactorOf, type SalesItem } from '@contracts/sales';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, MenuItem, MenuSeparator, Modal, Pagination, Pill, Select, useToast, type Column } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportSales, useDeleteRecord, useItems, useSalesMeta, useSaveItem } from '../api';
import { inr, rupeesText, toPaise } from '../ui';

const PAGE_SIZE = 25;
type Form = { name: string; brand: string; grade: string; subType: string; hsn: string; thic: string; width: string; length: string; sqmFactor: string; rate: string; active: boolean };
const EMPTY: Form = { name: '', brand: 'Strandply', grade: 'S-OSB', subType: '', hsn: '441012', thic: '12', width: '1220', length: '2440', sqmFactor: '', rate: '', active: true };

/** Add / edit item (legacy openItemModal). The sq m factor follows width × length unless typed. */
function ItemForm({ open, item, onClose }: { open: boolean; item: SalesItem | null; onClose: () => void }) {
  const toast = useToast();
  const s = useSalesMeta().data?.settings;
  const save = useSaveItem();
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      item
        ? { name: item.name, brand: item.brand, grade: item.grade, subType: item.subType ?? '', hsn: item.hsn ?? '', thic: String(item.thic), width: String(item.width), length: String(item.length), sqmFactor: String(item.sqmFactor), rate: rupeesText(item.defaultRatePaise), active: item.active }
        : { ...EMPTY, brand: s?.brands[0] ?? 'Strandply' },
    );
  }, [open, item]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => {
      const next = { ...x, [k]: v };
      // Width or length changes: the factor follows (legacy autoFactor).
      if ((k === 'width' || k === 'length') && Number(next.width) && Number(next.length)) next.sqmFactor = String(sqmFactorOf(Number(next.width), Number(next.length)));
      return next;
    });
    setErrors((e) => ({ ...e, [k]: '' }));
  };
  const opt = (xs: string[] | undefined, cur: string) => [...new Set([...(xs ?? []), cur].filter(Boolean))].map((x) => ({ value: x, label: x }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const input = {
      name: f.name.trim(),
      brand: f.brand,
      grade: f.grade,
      subType: f.subType.trim() || null,
      hsn: f.hsn.trim() || null,
      thic: Number(f.thic),
      width: Number(f.width),
      length: Number(f.length),
      sqmFactor: f.sqmFactor ? Number(f.sqmFactor) : null,
      defaultRatePaise: toPaise(f.rate),
      active: f.active,
    };
    try {
      const saved = await save.mutateAsync({ id: item?.id, input });
      toast({ tone: 'success', title: `${saved.name} saved` });
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={item ? `Edit ${item.name}` : 'Add item'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="item-form" loading={save.isPending}>
            Save item
          </Button>
        </>
      }
    >
      <form id="item-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
        <Input label="Item name" value={f.name} onChange={(e) => set('name', e.target.value)} error={errors.name} containerClassName="sm:col-span-3" />
        <Select label="Brand" options={opt(s?.brands, f.brand)} value={f.brand} onChange={(e) => set('brand', e.target.value)} error={errors.brand} />
        <Select label="Grade" options={opt(s?.grades, f.grade)} value={f.grade} onChange={(e) => set('grade', e.target.value)} error={errors.grade} />
        <Input label="Sub type" value={f.subType} onChange={(e) => set('subType', e.target.value)} placeholder="MDO, CALIBRATED…" />
        <Input label="Thickness (mm)" inputMode="decimal" value={f.thic} onChange={(e) => set('thic', e.target.value)} error={errors.thic} />
        <Input label="Width (mm)" inputMode="decimal" value={f.width} onChange={(e) => set('width', e.target.value)} error={errors.width} />
        <Input label="Length (mm)" inputMode="decimal" value={f.length} onChange={(e) => set('length', e.target.value)} error={errors.length} />
        <Input label="Sq m factor" inputMode="decimal" value={f.sqmFactor} onChange={(e) => set('sqmFactor', e.target.value)} hint="Width × length; editable" error={errors.sqmFactor} />
        <Input label="Default rate / sq m (₹)" inputMode="decimal" value={f.rate} onChange={(e) => set('rate', e.target.value)} hint={f.rate ? `${inr(rateSqftOf(toPaise(f.rate)))}/sq ft` : 'Used when the price list has no rate'} />
        <Input label="HSN code" value={f.hsn} onChange={(e) => set('hsn', e.target.value)} />
        <label className="flex items-center gap-2 text-base sm:col-span-3">
          <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Active (inactive items can’t be picked on new documents)
        </label>
      </form>
    </Modal>
  );
}

/** Item Master (legacy item_master). Brands and grades are kept in Sales settings. */
export function ItemsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const s = useSalesMeta().data?.settings;
  const url = useUrlState(['brand', 'grade'] as const);
  const [search, setSearch] = useSearchParam(url);
  const list = useItems({ q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE, filters: { brand: url.values.brand || undefined, grade: url.values.grade || undefined } });
  const remove = useDeleteRecord('items');
  const [form, setForm] = useState<SalesItem | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<SalesItem | null>(null);

  const columns: Column<SalesItem>[] = [
    {
      id: 'name',
      header: 'Item',
      cell: (i) => (
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{i.name}</span>
          <span className="text-caption text-faint">{i.brand}</span>
        </span>
      ),
    },
    { id: 'grade', header: 'Grade', width: '120px', cell: (i) => i.grade },
    { id: 'sub', header: 'Sub type', width: '170px', className: 'text-sm', cell: (i) => i.subType ?? '—' },
    { id: 'size', header: 'Thickness · size', width: '170px', className: 'text-sm tabular-nums', cell: (i) => `${i.thic} mm · ${i.width} × ${i.length}` },
    { id: 'factor', header: 'Sq m / board', width: '110px', align: 'right', className: 'tabular-nums', cell: (i) => i.sqmFactor },
    { id: 'rate', header: 'Default rate / sq m', width: '150px', align: 'right', className: 'tabular-nums', cell: (i) => (i.defaultRatePaise ? inr(i.defaultRatePaise) : '—') },
    { id: 'hsn', header: 'HSN', width: '90px', className: 'text-sm tabular-nums', cell: (i) => i.hsn ?? '—' },
    { id: 'active', header: 'Status', width: '90px', cell: (i) => (i.active ? <Pill tone="green">Active</Pill> : <Pill>Inactive</Pill>) },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (i) =>
        (canDo('edit') || canDo('delete')) && (
          <RowMenu label={`Actions for ${i.name}`}>
            {(close) => (
              <>
                {canDo('edit') && (
                  <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(i))}>
                    Edit
                  </MenuItem>
                )}
                {canDo('delete') && (
                  <>
                    <MenuSeparator />
                    <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(i))}>
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
        title="Item master"
        description={`${list.data?.total ?? 0} items. Rates by date are in the price list, board weights in the weight chart.`}
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => void exportSales('items').catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                Add item
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search" icon={Search} placeholder="Item name, sub type, HSN" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[260px]" />
        <Select aria-label="Brand" placeholder="All brands" options={(s?.brands ?? []).map((b) => ({ value: b, label: b }))} value={url.values.brand} onChange={(e) => url.set({ brand: e.target.value })} containerClassName="w-[160px]" />
        <Select aria-label="Grade" placeholder="All grades" options={(s?.grades ?? []).map((g) => ({ value: g, label: g }))} value={url.values.grade} onChange={(e) => url.set({ grade: e.target.value })} containerClassName="w-[160px]" />
        {(url.q || url.values.brand || url.values.grade) && (
          <Button variant="ghost" size="sm" icon={X} onClick={() => url.set({ q: null, brand: null, grade: null })}>
            Clear
          </Button>
        )}
      </div>
      <DataTable
        label="Item master"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(i) => i.id}
        minWidth={1100}
        loading={list.isLoading}
        onRowClick={canDo('edit') ? (i) => setForm(i) : undefined}
        empty={<EmptyState icon={Package} title="No items found" />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <ItemForm open={form !== null} item={form === 'new' ? null : form} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.name ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: `${toDelete!.name} deleted` }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        Its price-list and weight-chart rows go with it. Items on documents can’t be deleted; mark them inactive.
      </ConfirmDialog>
    </div>
  );
}
