import { CheckCircle2, Plus, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { MATERIAL_BY_ID, MATERIALS, rateUnitOf, type MaterialId, type PurchaseReturnView } from '@contracts/purchase';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, Modal, Pagination, Select, Textarea, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { rupeesToPaise, useApproveReturn, useDeleteReturn, useEntries, usePurchaseMeta, useReturns, useSaveReturn } from '../api';
import { EntryStatusPill, inr, materialLabel, qtyWithUnit } from '../ui';

const PAGE_SIZE = 20;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

type Form = { date: string; material: MaterialId; entryId: string; species: string; vendorName: string; originalInvoiceNo: string; qty: string; rate: string; reason: string };
const blank = (): Form => ({ date: today(), material: 'nilgiri', entryId: '', species: '', vendorName: '', originalInvoiceNo: '', qty: '', rate: '', reason: '' });

function ReturnForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveReturn();
  const [f, setF] = useState<Form>(blank());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const entries = useEntries({ filters: { material: f.material, posted: true }, pageSize: 100 }, { enabled: open }).data?.rows ?? [];
  const species = (usePurchaseMeta().data?.types ?? []).filter((t) => t.kind === 'nilgiri_species');
  useEffect(() => {
    if (open) {
      setF(blank());
      setErrors({});
    }
  }, [open]);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const mat = MATERIAL_BY_ID[f.material];

  function pickEntry(id: string) {
    const e = entries.find((x) => x.id === id);
    setF((x) => ({ ...x, entryId: id, vendorName: e?.vendorName ?? x.vendorName, originalInvoiceNo: e?.invoiceNo ?? x.originalInvoiceNo, rate: e ? String(e.ratePaise / 100) : x.rate, species: e?.species ?? x.species }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!(Number(f.qty) > 0)) local.qty = 'Enter the quantity returned';
    if (!f.entryId && !f.vendorName.trim()) local.vendorName = 'Vendor is required';
    if (Object.keys(local).length) return setErrors(local);
    try {
      const r = await save.mutateAsync({
        date: f.date,
        material: f.material,
        entryId: f.entryId || null,
        species: f.material === 'nilgiri' ? f.species || null : null,
        vendorName: f.vendorName.trim() || null,
        originalInvoiceNo: f.originalInvoiceNo.trim() || null,
        qty: Number(f.qty),
        ratePaise: rupeesToPaise(f.rate || '0'),
        reason: f.reason.trim() || null,
      });
      toast({ tone: 'success', title: `${r.returnNo} saved`, description: 'Stock is reduced now; approval records the sign-off.' });
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save the return', description: errorMessage(err) });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title="Purchase return"
      description="Material sent back to the vendor. It comes off stock as soon as it’s saved."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="return-form" loading={save.isPending}>
            Save return
          </Button>
        </>
      }
    >
      <form id="return-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3">
        <Select label="Material" options={MATERIALS.map((m) => ({ value: m.id, label: m.label }))} value={f.material} onChange={(e) => setF({ ...blank(), date: f.date, material: e.target.value as MaterialId })} />
        <Input label="Return date" type="date" value={f.date} onChange={(e) => set('date')(e.target.value)} error={errors.date} />
        <Select
          label="Original entry"
          placeholder="Not linked"
          options={entries.map((e) => ({ value: e.id, label: `${e.lotNo} · ${e.invoiceNo} · ${e.vendorName.slice(0, 20)}` }))}
          value={f.entryId}
          onChange={(e) => pickEntry(e.target.value)}
          error={errors.entryId ?? errors.material}
        />
        <Input label="Vendor" value={f.vendorName} onChange={(e) => set('vendorName')(e.target.value)} error={errors.vendorName} containerClassName="sm:col-span-2" />
        <Input label="Original invoice no." value={f.originalInvoiceNo} onChange={(e) => set('originalInvoiceNo')(e.target.value)} />
        {f.material === 'nilgiri' && <Select label="Species" placeholder="Select species" options={species.map((t) => ({ value: t.name, label: t.name }))} value={f.species} onChange={(e) => set('species')(e.target.value)} />}
        <Input label="Quantity returned" inputMode="decimal" suffix={mat.unit} value={f.qty} onChange={(e) => set('qty')(e.target.value)} error={errors.qty} />
        <Input label={`Rate per ${rateUnitOf(mat)}`} inputMode="decimal" suffix="₹" value={f.rate} onChange={(e) => set('rate')(e.target.value)} error={errors.ratePaise} />
        <Textarea label="Reason" rows={2} placeholder="Quality rejection, excess supply…" value={f.reason} onChange={(e) => set('reason')(e.target.value)} containerClassName="sm:col-span-3" />
      </form>
    </Modal>
  );
}

/** Purchase returns (legacy returnModal / renderPurchaseReturn). */
export function ReturnsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['material'] as const);
  const list = useReturns({ page: url.page, pageSize: PAGE_SIZE, filters: { material: (url.values.material || undefined) as MaterialId | undefined } });
  const approve = useApproveReturn();
  const remove = useDeleteReturn();
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<PurchaseReturnView | null>(null);

  const columns: Column<PurchaseReturnView>[] = [
    {
      id: 'no',
      header: 'Return',
      width: '130px',
      cell: (r) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold">{r.returnNo}</span>
          <span className="text-caption text-faint">{formatDate(r.date)}</span>
        </span>
      ),
    },
    { id: 'material', header: 'Material', width: '150px', cell: (r) => `${materialLabel(r.material)}${r.species ? ` — ${r.species}` : ''}` },
    {
      id: 'vendor',
      header: 'Vendor',
      cell: (r) => (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate">{r.vendorName}</span>
          {r.originalInvoiceNo && <span className="text-caption text-faint">Invoice {r.originalInvoiceNo}</span>}
        </span>
      ),
    },
    { id: 'qty', header: 'Quantity', width: '120px', align: 'right', className: 'tabular-nums', cell: (r) => qtyWithUnit(r.material, r.qty) },
    { id: 'amount', header: 'Amount', width: '120px', align: 'right', className: 'tabular-nums font-semibold', cell: (r) => `−${inr(r.amount.total)}` },
    { id: 'reason', header: 'Reason', width: '200px', className: 'text-sm text-muted', cell: (r) => <span className="block truncate">{r.reason ?? '—'}</span> },
    { id: 'approval', header: 'Approval', width: '140px', cell: (r) => <EntryStatusPill status={r.status} /> },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '96px',
      align: 'right',
      cell: (r) => (
        <span className="flex justify-end gap-1">
          {canDo('purchase_approve') && r.status === 'pending' && (
            <Button
              size="sm"
              variant="ghost"
              icon={CheckCircle2}
              aria-label={`Approve ${r.returnNo}`}
              onClick={() => void approve.mutateAsync(r.id).then(() => toast({ tone: 'success', title: `${r.returnNo} approved` }), (err) => toast({ tone: 'error', title: 'Couldn’t approve', description: errorMessage(err) }))}
            />
          )}
          {canDo('delete') && <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete ${r.returnNo}`} onClick={() => setToDelete(r)} />}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Purchase returns"
        description="Material returned to vendors. Returns reduce raw material stock."
        actions={
          canDo('edit') && (
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
              New return
            </Button>
          )
        }
      />
      <Select aria-label="Material" placeholder="All materials" options={MATERIALS.map((m) => ({ value: m.id, label: m.label }))} value={url.values.material} onChange={(e) => url.set({ material: e.target.value })} containerClassName="w-[170px]" />
      <DataTable
        label="Purchase returns"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(r) => r.id}
        minWidth={1020}
        loading={list.isLoading}
        empty={<EmptyState icon={Undo2} title="No returns" />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <ReturnForm open={adding} onClose={() => setAdding(false)} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.returnNo ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: `${toDelete!.returnNo} deleted` }))
            .catch((err) => toast({ tone: 'error', title: 'Couldn’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        The quantity goes back into stock.
      </ConfirmDialog>
    </div>
  );
}
