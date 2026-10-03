import { PackagePlus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { skuCode, type OpeningView } from '@contracts/stock';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, KpiTile, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { PageHeader } from '../../samples/ui/PageHeader';
import { useCreateOpening, useDeleteOpening, useOpening, useStockMeta, type Side } from '../api';
import { SkuPicker } from '../components/SkuPicker';
import { qtyFmt, skuDetail } from '../ui';

/** Opening stock entries (legacy renderOpeningStock / saveOpening / deleteOpening). */
export function OpeningPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const meta = useStockMeta().data;
  const list = useOpening();
  const save = useCreateOpening();
  const remove = useDeleteOpening();
  const [item, setItem] = useState<Side | null>(null);
  const [qty, setQty] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<OpeningView | null>(null);
  const groups = meta?.groups ?? [];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const g = groups.find((x) => x.id === item?.groupId);
    const local: Record<string, string> = {};
    if (!g) local['item.groupId'] = 'Pick the item';
    else if (g.thicknesses.length && !item?.thick) local['item.thick'] = 'Pick the thickness';
    if (!(Number(qty) > 0)) local.qty = 'Enter the opening quantity';
    if (Object.keys(local).length) return setErrors(local);
    try {
      const o = await save.mutateAsync({ item: item!, qty: Number(qty), date: date || undefined, note: note.trim() || null });
      toast({ tone: 'success', title: `Opening ${skuCode(g!, item!.thick)} + ${qtyFmt(o.qty)}` });
      setQty('');
      setNote('');
      setItem(null);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save the opening entry', description: errorMessage(err) });
    }
  }

  const total = (list.data ?? []).reduce((s, o) => s + o.qty, 0);
  const columns: Column<OpeningView>[] = [
    { id: 'date', header: 'Date', width: '110px', cell: (o) => formatDate(o.date) },
    {
      id: 'sku',
      header: 'SKU',
      cell: (o) => (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="font-semibold tabular-nums">{o.item.sku}</span>
          <span className="truncate text-caption text-faint">{o.info ? `${skuDetail(o.info)} · ${o.info.dept}` : '—'}</span>
        </span>
      ),
    },
    { id: 'qty', header: 'Qty', width: '120px', align: 'right', className: 'font-semibold tabular-nums', cell: (o) => `${qtyFmt(o.qty)} ${o.info?.unit ?? ''}` },
    { id: 'note', header: 'Note', width: '220px', cell: (o) => <span className="block truncate">{o.note ?? '—'}</span> },
    { id: 'by', header: 'Entered by', width: '140px', cell: (o) => o.createdByName ?? '—' },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '56px',
      align: 'right',
      cell: (o) => canDo('delete') && <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Reverse opening ${o.item.sku}`} onClick={() => setToDelete(o)} />,
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Opening stock" description="Starting quantities per SKU. Each entry adds to stock; it can be reversed while that stock is still there." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile variant="compact" label="Opening entries" value={list.data?.length ?? '—'} />
        <KpiTile variant="compact" label="Total entered" value={qtyFmt(total)} meta="All units added together" />
      </div>
      {canDo('edit') && (
        <Card title="Add opening stock">
          <form noValidate onSubmit={onSubmit} className="grid gap-3 md:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
            <SkuPicker
              idPrefix="op"
              title="Item"
              tone="in"
              groups={groups}
              value={item}
              onChange={(v) => {
                setItem(v);
                setErrors({});
              }}
              errors={{ groupId: errors['item.groupId'], thick: errors['item.thick'] }}
            />
            <div className="flex flex-col gap-3">
              <Input label="Opening quantity" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} error={errors.qty} />
              <Input label="As on date" type="date" value={date || meta?.today || ''} max={meta?.today} onChange={(e) => setDate(e.target.value)} error={errors.date} />
              <Input label="Note" placeholder="Physical count, etc." value={note} onChange={(e) => setNote(e.target.value)} />
              <div>
                <Button variant="primary" type="submit" icon={PackagePlus} loading={save.isPending}>
                  Add to stock
                </Button>
              </div>
            </div>
          </form>
        </Card>
      )}
      <DataTable label="Opening entries" columns={columns} rows={list.data ?? []} getRowId={(o) => o.id} minWidth={900} loading={list.isLoading} empty={<EmptyState icon={PackagePlus} title="No opening stock entered" />} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Reverse opening ${toDelete?.item.sku ?? ''}?`}
        confirmLabel="Reverse"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: 'Opening entry reversed' }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t reverse', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        {toDelete && `${qtyFmt(toDelete.qty)} comes off ${toDelete.item.sku}. Not possible once that stock has been issued.`}
      </ConfirmDialog>
    </div>
  );
}
