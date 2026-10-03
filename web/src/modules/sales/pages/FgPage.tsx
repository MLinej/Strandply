import { Download, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { FgStockView, Firm } from '@contracts/sales';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, KpiTile, MenuItem, MenuSeparator, Modal, Pill, Select, useToast, type Column } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportSales, useDeleteRecord, useFg, useFirmFilter, useSalesMeta, useSaveFg } from '../api';
import { FirmPill, FirmSelect, qtyFmt, useDefaultFirm, useShowFirm } from '../ui';

type Form = { firm: Firm; grade: string; thic: string; width: string; length: string; qty: string; reorder: string };

function FgForm({ open, row, onClose }: { open: boolean; row: FgStockView | null; onClose: () => void }) {
  const toast = useToast();
  const grades = useSalesMeta().data?.settings.grades ?? [];
  const firm = useDefaultFirm();
  const save = useSaveFg();
  const [f, setF] = useState<Form>({ firm, grade: 'S-OSB', thic: '12', width: '1220', length: '2440', qty: '', reorder: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(row ? { firm: row.firm, grade: row.grade, thic: String(row.thic), width: String(row.width), length: String(row.length), qty: String(row.qtyOnHandSqm), reorder: row.reorderSqm ? String(row.reorderSqm) : '' } : { firm, grade: grades[0] ?? 'S-OSB', thic: '12', width: '1220', length: '2440', qty: '', reorder: '' });
  }, [open, row]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync({ id: row?.id, input: { firm: f.firm, grade: f.grade, thic: Number(f.thic), width: Number(f.width), length: Number(f.length), qtyOnHandSqm: Number(f.qty) || 0, reorderSqm: Number(f.reorder) || 0 } });
      toast({ tone: 'success', title: 'Stock saved' });
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
      title={row ? 'Edit stock entry' : 'Add stock entry'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="fg-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="fg-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <FirmSelect value={f.firm} onChange={(v) => set('firm', v)} disabled={!!row} />
        <Select label="Grade" options={[...new Set([...grades, f.grade])].map((g) => ({ value: g, label: g }))} value={f.grade} onChange={(e) => set('grade', e.target.value)} />
        <Input label="Thickness (mm)" inputMode="decimal" value={f.thic} onChange={(e) => set('thic', e.target.value)} error={errors.thic} />
        <Input label="Width (mm)" inputMode="decimal" value={f.width} onChange={(e) => set('width', e.target.value)} error={errors.width} />
        <Input label="Length (mm)" inputMode="decimal" value={f.length} onChange={(e) => set('length', e.target.value)} error={errors.length} />
        <Input label="On hand (sq m)" inputMode="decimal" value={f.qty} onChange={(e) => set('qty', e.target.value)} error={errors.qtyOnHandSqm} />
        <Input label="Reorder level (sq m)" inputMode="decimal" value={f.reorder} onChange={(e) => set('reorder', e.target.value)} hint="Low stock below this" />
      </form>
    </Modal>
  );
}

/** FG Inventory (legacy fg_inventory): stock by specification less what pending orders reserve. */
export function FgPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const showFirm = useShowFirm();
  const firm = useFirmFilter();
  const grades = useSalesMeta().data?.settings.grades ?? [];
  const url = useUrlState(['grade'] as const);
  const rows = useFg({ firm, grade: url.values.grade || undefined }).data;
  const remove = useDeleteRecord('fg');
  const [form, setForm] = useState<FgStockView | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<FgStockView | null>(null);
  const sum = (k: 'qtyOnHandSqm' | 'reservedSqm' | 'availableSqm') => Math.round((rows ?? []).reduce((s, r) => s + r[k], 0) * 100) / 100;

  const columns: Column<FgStockView>[] = [
    ...(showFirm ? [{ id: 'firm', header: 'Firm', width: '64px', cell: (r: FgStockView) => <FirmPill firm={r.firm} /> }] : []),
    { id: 'grade', header: 'Grade', width: '140px', className: 'font-medium', cell: (r) => r.grade },
    { id: 'thic', header: 'Thickness', width: '100px', align: 'right', className: 'tabular-nums', cell: (r) => `${r.thic} mm` },
    { id: 'size', header: 'Size', width: '140px', className: 'tabular-nums', cell: (r) => `${r.width} × ${r.length} mm` },
    { id: 'hand', header: 'On hand', width: '120px', align: 'right', className: 'tabular-nums', cell: (r) => `${qtyFmt(r.qtyOnHandSqm)} sq m` },
    { id: 'res', header: 'Reserved', width: '120px', align: 'right', className: 'tabular-nums text-muted', cell: (r) => `${qtyFmt(r.reservedSqm)} sq m` },
    { id: 'avail', header: 'Available', width: '120px', align: 'right', className: 'font-semibold tabular-nums', cell: (r) => `${qtyFmt(r.availableSqm)} sq m` },
    { id: 'status', header: 'Status', width: '110px', cell: (r) => (r.low ? <Pill tone="amber">Low stock</Pill> : <Pill tone="green">OK</Pill>) },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (r) =>
        (canDo('edit') || canDo('delete')) && (
          <RowMenu label={`Actions for ${r.grade} ${r.thic} mm`}>
            {(close) => (
              <>
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
        ),
    },
  ];
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="FG inventory"
        description="Finished-goods stock by specification. Reserved = sq m on pending orders of the same grade, thickness and size."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => void exportSales('fg', { firm }).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                Add stock entry
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="On hand" value={`${qtyFmt(sum('qtyOnHandSqm'))} sq m`} meta={`${rows?.length ?? 0} specifications`} />
        <KpiTile label="Reserved" value={`${qtyFmt(sum('reservedSqm'))} sq m`} meta="On pending orders" />
        <KpiTile label="Available" value={`${qtyFmt(sum('availableSqm'))} sq m`} meta="Free to allocate" />
      </div>
      <Select aria-label="Grade" placeholder="All grades" options={grades.map((g) => ({ value: g, label: g }))} value={url.values.grade} onChange={(e) => url.set({ grade: e.target.value })} containerClassName="w-[180px]" />
      <DataTable label="FG inventory" columns={columns} rows={rows ?? []} getRowId={(r) => r.id} minWidth={900} loading={!rows} empty={<EmptyState icon={Package} title="No stock entries" description="Add finished-goods stock by specification." />} />
      <FgForm open={form !== null} row={form === 'new' ? null : form} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete this stock entry?"
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: 'Stock entry deleted' }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        {toDelete ? `${toDelete.grade} ${toDelete.thic} mm ${toDelete.width} × ${toDelete.length}` : ''}
      </ConfirmDialog>
    </div>
  );
}
