import { Download, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { rateSqftOf } from '@contracts/sales';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, MenuItem, MenuSeparator, Modal, Select, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportSales, useDeleteRecord, usePrices, useSalesMeta, useSalesOptions, useSavePrice, type PriceRow } from '../api';
import { Combo } from '@/components/ui';
import { inr, rupeesText, toPaise } from '../ui';

type Row = PriceRow;

function PriceForm({ open, row, onClose }: { open: boolean; row: Row | null; onClose: () => void }) {
  const toast = useToast();
  const today = useSalesMeta().data?.today ?? '';
  const items = useSalesOptions({ enabled: open }).data?.items ?? [];
  const save = useSavePrice();
  const [itemId, setItemId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [value, setValue] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setItemId(row?.itemId ?? null);
    setDate(row?.effectiveDate ?? today);
    setValue(row ? rupeesText(row.ratePaise) : '');
  }, [open, row]);
  const options = useMemo(() => items.map((i) => ({ id: i.id, label: i.name })), [items]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!itemId) return setErrors({ itemId: 'Pick an item' });
    const input = { itemId, effectiveDate: date, ratePaise: toPaise(value) };
    try {
      await save.mutateAsync({ id: row?.id, input });
      toast({ tone: 'success', title: 'Saved' });
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
      title={row ? 'Edit price list entry' : 'Add price'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="entry-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="entry-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
        <Combo label="Item" value={itemId} options={options} onChange={setItemId} error={errors.itemId} placeholder="Search item" />
        <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <Input label="Effective from" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.effectiveDate} />
          <Input
            label="Rate / sq m (₹)"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={errors.ratePaise}
            hint={value ? `${inr(rateSqftOf(toPaise(value)))}/sq ft` : undefined}
          />
        </div>
      </form>
    </Modal>
  );
}

/** Price List (legacy price_list): effective-dated rates per item. Board weights are on the item master. */
export function PriceListPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['item'] as const);
  const rows = usePrices(url.values.item || undefined).data ?? [];
  const items = useSalesOptions().data?.items ?? [];
  const remove = useDeleteRecord('prices');
  const [form, setForm] = useState<Row | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<Row | null>(null);
  // Rows that are in force today: the newest per item on or before today.
  const today = useSalesMeta().data?.today ?? '';
  const current = useMemo(() => {
    const best = new Map<string, Row>();
    for (const r of rows) if (r.effectiveDate <= today && (!best.has(r.itemId) || r.effectiveDate > best.get(r.itemId)!.effectiveDate)) best.set(r.itemId, r);
    return new Set([...best.values()].map((r) => r.id));
  }, [rows, today]);

  const columns: Column<Row>[] = [
    { id: 'item', header: 'Item', cell: (r) => <span className="font-medium">{r.itemName}</span> },
    { id: 'date', header: 'Effective from', width: '140px', className: 'tabular-nums', cell: (r) => formatDate(r.effectiveDate) },
    { id: 'rate', header: 'Rate / sq m', width: '130px', align: 'right', className: 'font-semibold tabular-nums', cell: (r) => inr(r.ratePaise) },
    { id: 'sqft', header: 'Rate / sq ft', width: '120px', align: 'right', className: 'tabular-nums text-muted', cell: (r) => inr(rateSqftOf(r.ratePaise)) },
    { id: 'now', header: 'In force', width: '100px', className: 'text-sm', cell: (r) => (current.has(r.id) ? 'Current' : r.effectiveDate > today ? 'Upcoming' : 'Superseded') },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (r) =>
        (canDo('edit') || canDo('delete')) && (
          <RowMenu label={`Actions for ${r.itemName}, ${r.effectiveDate}`}>
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
        title="Price list"
        description="Rate per sq m by item, from an effective date. New documents take the latest rate on or before their date."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => void exportSales('prices').catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                Add price
              </Button>
            )}
          </>
        }
      />
      <Select aria-label="Item" placeholder="All items" options={items.map((i) => ({ value: i.id, label: i.name }))} value={url.values.item} onChange={(e) => url.set({ item: e.target.value })} containerClassName="w-[380px]" />
      <DataTable label="Price list" columns={columns} rows={rows} getRowId={(r) => r.id} minWidth={760} empty={<EmptyState icon={Tags} title="No prices yet. Until there are, forms use the item’s default rate." />} />
      <PriceForm open={form !== null} row={form === 'new' ? null : form} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete this entry?"
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: 'Entry deleted' }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        {toDelete?.itemName}, effective {toDelete ? formatDate(toDelete.effectiveDate) : ''}. Saved documents keep their rates.
      </ConfirmDialog>
    </div>
  );
}
