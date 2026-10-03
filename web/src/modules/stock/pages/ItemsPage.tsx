import { Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { DEPARTMENTS, FAMILIES, GRADES, SIZES, type Department, type Family, type SkuGroup } from '@contracts/stock';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, MenuItem, MenuSeparator, Modal, Select, useToast, type Column } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { useDeleteGroup, useSaveGroup, useStockMeta } from '../api';
import { FamilyPill } from '../ui';

type Form = { prefix: string; label: string; family: Family; dept: Department | ''; size: string; grade: string; unit: string; thicknesses: string };
const fromGroup = (g: SkuGroup | null): Form =>
  g
    ? { prefix: g.prefix, label: g.label, family: g.family, dept: g.dept, size: g.size ?? '', grade: g.grade ?? '', unit: g.unit, thicknesses: g.thicknesses.join(', ') }
    : { prefix: '', label: '', family: 'OB', dept: '', size: '', grade: '', unit: 'pcs', thicknesses: '' };

function ItemForm({ open, group, onClose }: { open: boolean; group: SkuGroup | null; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveGroup();
  const [f, setF] = useState<Form>(fromGroup(null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setF(fromGroup(group));
      setErrors({});
    }
  }, [open, group]);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([key]) => key !== k)));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.prefix.trim()) local.prefix = 'Prefix is required';
    if (!f.label.trim()) local.label = 'Description is required';
    if (!f.dept) local.dept = 'Pick a department';
    const thick = f.thicknesses.split(/[\s,]+/).filter(Boolean).map((t) => (/^\d$/.test(t) ? `0${t}` : t));
    if (thick.some((t) => !/^\d{2}$/.test(t))) local.thicknesses = 'Two-digit thicknesses separated by commas, like 09, 12, 18';
    if (Object.keys(local).length) return setErrors(local);
    try {
      const g = await save.mutateAsync({
        id: group?.id,
        input: { prefix: f.prefix.trim(), label: f.label.trim(), family: f.family, dept: f.dept as Department, size: f.size || null, grade: f.grade || null, unit: f.unit.trim() || 'pcs', thicknesses: thick },
      });
      toast({ tone: 'success', title: group ? `${g.prefix} updated` : `${g.prefix} added` });
      onClose();
    } catch (err) {
      const fe = fieldErrors(err);
      if ((err as { code?: string }).code === 'prefix_taken') fe.prefix = 'Already in the item master';
      setErrors(fe);
      toast({ tone: 'error', title: 'Couldn’t save the item', description: errorMessage(err) });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={group ? `Edit ${group.prefix}` : 'Add item'}
      description="A SKU code is the prefix plus a two-digit thickness, or just the prefix when there are no thicknesses."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="item-form" loading={save.isPending}>
            {group ? 'Save changes' : 'Add item'}
          </Button>
        </>
      }
    >
      <form id="item-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
        <Input label="SKU prefix" placeholder="OC-611" value={f.prefix} onChange={(e) => set('prefix')(e.target.value.toUpperCase())} error={errors.prefix} />
        <Select label="Family" options={FAMILIES.map((x) => ({ value: x.id, label: `${x.id} · ${x.label}` }))} value={f.family} onChange={(e) => set('family')(e.target.value as Family)} />
        <Input label="Unit" placeholder="pcs / kg / sh" value={f.unit} onChange={(e) => set('unit')(e.target.value)} />
        <Input label="Description" placeholder="OSB-CAL Graded A – 2590×1320" value={f.label} onChange={(e) => set('label')(e.target.value)} error={errors.label} containerClassName="sm:col-span-3" />
        <Select label="Department" placeholder="Select" options={DEPARTMENTS.map((x) => ({ value: x, label: x }))} value={f.dept} onChange={(e) => set('dept')(e.target.value as Department)} error={errors.dept} />
        <Select label="Size" placeholder="—" options={SIZES.map((x) => ({ value: x, label: x }))} value={f.size} onChange={(e) => set('size')(e.target.value)} />
        <Select label="Grade" placeholder="—" options={GRADES.map((x) => ({ value: x, label: x }))} value={f.grade} onChange={(e) => set('grade')(e.target.value)} />
        <Input
          label="Thicknesses (mm)"
          placeholder="09, 10, 12, 14 — blank = fixed code"
          value={f.thicknesses}
          onChange={(e) => set('thicknesses')(e.target.value)}
          error={errors.thicknesses}
          hint="A thickness or prefix with stock movements can’t be removed or changed."
          containerClassName="sm:col-span-3"
        />
      </form>
    </Modal>
  );
}

/** Item (SKU group) master (legacy renderItemMaster). Unlike legacy, changes are saved. */
export function ItemsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const groups = useStockMeta().data?.groups;
  const url = useUrlState(['family', 'dept'] as const);
  const [search, setSearch] = useSearchParam(url);
  const remove = useDeleteGroup();
  const [form, setForm] = useState<SkuGroup | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<SkuGroup | null>(null);
  const rows = useMemo(() => {
    const q = url.q.toLowerCase();
    return (groups ?? []).filter(
      (g) => (!url.values.family || g.family === url.values.family) && (!url.values.dept || g.dept === url.values.dept) && (!q || [g.prefix, g.label, g.dept].some((s) => s.toLowerCase().includes(q))),
    );
  }, [groups, url.q, url.values.family, url.values.dept]);

  const columns: Column<SkuGroup>[] = [
    { id: 'prefix', header: 'Prefix', width: '120px', className: 'font-semibold tabular-nums', cell: (g) => g.prefix },
    { id: 'label', header: 'Description', cell: (g) => <span className="block truncate">{g.label}</span> },
    { id: 'family', header: 'Family', width: '110px', cell: (g) => <FamilyPill family={g.family} /> },
    { id: 'dept', header: 'Department', width: '210px', cell: (g) => <span className="block truncate text-sm">{g.dept}</span> },
    { id: 'size', header: 'Size / gr.', width: '120px', cell: (g) => [g.size, g.grade && `Gr. ${g.grade}`].filter(Boolean).join(' · ') || '—' },
    { id: 'thick', header: 'Thicknesses', width: '220px', cell: (g) => <span className="block truncate text-sm tabular-nums">{g.thicknesses.length ? g.thicknesses.join(', ') : 'Fixed code'}</span> },
    { id: 'unit', header: 'Unit', width: '60px', cell: (g) => g.unit },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (g) =>
        (canDo('edit') || canDo('delete')) && (
          <RowMenu label={`Actions for ${g.prefix}`}>
            {(close) => (
              <>
                {canDo('edit') && (
                  <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(g))}>
                    Edit
                  </MenuItem>
                )}
                {canDo('delete') && (
                  <>
                    <MenuSeparator />
                    <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(g))}>
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
        description={`SKU groups by department${groups ? `: ${groups.length} items` : ''}.`}
        actions={
          canDo('edit') && (
            <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
              Add item
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search items" icon={Search} placeholder="Prefix, description, department" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[260px]" />
        <Select aria-label="Family" placeholder="All families" options={FAMILIES.map((f) => ({ value: f.id, label: f.label }))} value={url.values.family} onChange={(e) => url.set({ family: e.target.value })} containerClassName="w-[150px]" />
        <Select aria-label="Department" placeholder="All departments" options={DEPARTMENTS.map((x) => ({ value: x, label: x }))} value={url.values.dept} onChange={(e) => url.set({ dept: e.target.value })} containerClassName="w-[220px]" />
      </div>
      <DataTable
        label="Item master"
        columns={columns}
        rows={rows}
        getRowId={(g) => g.id}
        minWidth={1100}
        loading={!groups}
        onRowClick={canDo('edit') ? (g) => setForm(g) : undefined}
        empty={<EmptyState icon={Tags} title="No items match" />}
      />
      <ItemForm open={form !== null} group={form === 'new' ? null : form} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.prefix ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: `${toDelete!.prefix} deleted` }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete this item', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        An item that has any stock movement can’t be deleted.
      </ConfirmDialog>
    </div>
  );
}
