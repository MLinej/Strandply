import { Download, Pencil, Plus, Scale, Tags, Trash2 } from 'lucide-react';
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
import { exportSales, useDeleteRecord, useEntries, useSalesMeta, useSalesOptions, useSaveEntry, type EntryKind, type PriceRow, type WeightRow } from '../api';
import { Combo } from '@/components/ui';
import { inr, qtyFmt, rupeesText, toPaise } from '../ui';

type Row = PriceRow | WeightRow;
const isPrice = (r: Row): r is PriceRow => 'ratePaise' in r;

const TEXT: Record<EntryKind, { title: string; description: string; value: string; add: string; empty: string }> = {
  prices: {
    title: 'Price list',
    description: 'Rate per sq m by item, from an effective date. New documents take the latest rate on or before their date.',
    value: 'Rate / sq m (₹)',
    add: 'Add price',
    empty: 'No prices yet. Until there are, forms use the item’s default rate.',
  },
  weights: {
    title: 'Weight chart',
    description: 'Weight per board by item, from an effective date. Orders and proformas show total weight from it.',
    value: 'Weight per board (kg)',
    add: 'Add weight',
    empty: 'No board weights yet.',
  },
};

function EntryForm({ kind, open, row, onClose }: { kind: EntryKind; open: boolean; row: Row | null; onClose: () => void }) {
  const toast = useToast();
  const today = useSalesMeta().data?.today ?? '';
  const items = useSalesOptions({ enabled: open }).data?.items ?? [];
  const save = useSaveEntry(kind);
  const [itemId, setItemId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [value, setValue] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setItemId(row?.itemId ?? null);
    setDate(row?.effectiveDate ?? today);
    setValue(row ? (isPrice(row) ? rupeesText(row.ratePaise) : String(row.weightKg)) : '');
  }, [open, row]);
  const options = useMemo(() => items.map((i) => ({ id: i.id, label: i.name })), [items]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!itemId) return setErrors({ itemId: 'Pick an item' });
    const input = { itemId, effectiveDate: date, ...(kind === 'prices' ? { ratePaise: toPaise(value) } : { weightKg: Number(value) }) };
    try {
      await save.mutateAsync({ id: row?.id, input });
      toast({ tone: 'success', title: 'Saved' });
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }

  const t = TEXT[kind];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row ? `Edit ${t.title.toLowerCase()} entry` : t.add}
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
            label={t.value}
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={errors.ratePaise ?? errors.weightKg}
            hint={kind === 'prices' && value ? `${inr(rateSqftOf(toPaise(value)))}/sq ft` : undefined}
          />
        </div>
      </form>
    </Modal>
  );
}

/** Price List or Weight Chart (legacy price_list / weight_chart): effective-dated values per item. */
function EntriesPage({ kind }: { kind: EntryKind }) {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['item'] as const);
  const rows = (useEntries(kind, url.values.item || undefined).data ?? []) as Row[];
  const items = useSalesOptions().data?.items ?? [];
  const remove = useDeleteRecord(kind);
  const [form, setForm] = useState<Row | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const t = TEXT[kind];
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
    ...(kind === 'prices'
      ? [
          { id: 'rate', header: 'Rate / sq m', width: '130px', align: 'right' as const, className: 'font-semibold tabular-nums', cell: (r: Row) => inr((r as PriceRow).ratePaise) },
          { id: 'sqft', header: 'Rate / sq ft', width: '120px', align: 'right' as const, className: 'tabular-nums text-muted', cell: (r: Row) => inr(rateSqftOf((r as PriceRow).ratePaise)) },
        ]
      : [{ id: 'kg', header: 'Weight per board', width: '150px', align: 'right' as const, className: 'font-semibold tabular-nums', cell: (r: Row) => `${qtyFmt((r as WeightRow).weightKg)} kg` }]),
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
        title={t.title}
        description={t.description}
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => void exportSales(kind).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                {t.add}
              </Button>
            )}
          </>
        }
      />
      <Select aria-label="Item" placeholder="All items" options={items.map((i) => ({ value: i.id, label: i.name }))} value={url.values.item} onChange={(e) => url.set({ item: e.target.value })} containerClassName="w-[380px]" />
      <DataTable label={t.title} columns={columns} rows={rows} getRowId={(r) => r.id} minWidth={760} empty={<EmptyState icon={kind === 'prices' ? Tags : Scale} title={t.empty} />} />
      <EntryForm kind={kind} open={form !== null} row={form === 'new' ? null : form} onClose={() => setForm(null)} />
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

export const PriceListPage = () => <EntriesPage kind="prices" />;
export const WeightChartPage = () => <EntriesPage kind="weights" />;
