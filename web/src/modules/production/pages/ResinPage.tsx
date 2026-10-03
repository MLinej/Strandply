import { useEffect, useState, type FormEvent } from 'react';
import { PRODUCTS, SHIFTS, type Product, type ResinUseView, type Shift } from '@contracts/production';
import { Button, Card, Input, Modal, Select, Textarea, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useLots, useProductionMeta, useSaveDoc } from '../api';
import { DocRegister, type FormProps } from '../components/DocRegister';
import { LotSelect } from '../components/LotSelect';
import { inr, kg, perKg } from '../ui';

type Form = { date: string; shift: Shift; purchaseEntryId: string; qty: string; product: Product | ''; operator: string; remarks: string };

/** Resin consumption from a Purchase resin lot; the oldest lot with stock is offered first (legacy openResinForm / saveResinEntry). */
export function ResinForm({ open, doc, onClose, onSaved }: FormProps<ResinUseView>) {
  const toast = useToast();
  const meta = useProductionMeta().data;
  const save = useSaveDoc('resin');
  const lots = useLots('resin', { except: doc?.id, enabled: open }).data ?? [];
  const [f, setF] = useState<Form>({ date: '', shift: 'Day', purchaseEntryId: '', qty: '', product: '', operator: '', remarks: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      doc
        ? { date: doc.date, shift: doc.shift, purchaseEntryId: doc.lot.purchaseEntryId, qty: String(doc.lot.qty), product: doc.product ?? '', operator: doc.operator ?? '', remarks: doc.remarks ?? '' }
        : { date: meta?.today ?? '', shift: 'Day', purchaseEntryId: '', qty: '', product: '', operator: '', remarks: '' },
    );
  }, [open, doc]);
  // FIFO: preselect the oldest lot that still has resin.
  useEffect(() => {
    if (open && !doc && !f.purchaseEntryId && lots.length) {
      const first = lots.find((l) => l.availKg > 0);
      if (first) setF((x) => ({ ...x, purchaseEntryId: first.purchaseEntryId }));
    }
  }, [open, doc, lots, f.purchaseEntryId]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors({});
  };
  const lot = lots.find((l) => l.purchaseEntryId === f.purchaseEntryId);
  const amount = lot && Number(f.qty) > 0 ? Math.round((Number(f.qty) * lot.netRatePaise) / 1000) : 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.purchaseEntryId) local['lot.purchaseEntryId'] = 'Pick the resin lot';
    if (!(Number(f.qty) > 0)) local['lot.qty'] = 'Enter the quantity';
    else if (lot && Number(f.qty) > lot.availKg) local['lot.qty'] = `Only ${kg(lot.availKg)} left`;
    if (Object.keys(local).length) return setErrors(local);
    try {
      const saved = await save.mutateAsync({
        id: doc?.id,
        input: { date: f.date, shift: f.shift, lot: { purchaseEntryId: f.purchaseEntryId, qty: Number(f.qty) }, product: f.product || null, operator: f.operator.trim() || null, remarks: f.remarks.trim() || null },
      });
      toast({ tone: 'success', title: `${saved.docNo} saved`, description: `${kg(saved.lot.qty)} · ${inr(saved.lot.amountPaise)}` });
      onSaved(saved);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save the entry', description: errorMessage(err) });
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      title={doc ? `Edit ${doc.docNo}` : 'New resin consumption'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="rc-form" loading={save.isPending}>
            Save entry
          </Button>
        </>
      }
    >
      <form id="rc-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Input label="Date" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} error={errors.date} />
        <Select label="Shift" options={SHIFTS.map((s) => ({ value: s, label: s }))} value={f.shift} onChange={(e) => set('shift', e.target.value as Shift)} />
        <div className="sm:col-span-2">
          <LotSelect label="Resin lot" lots={lots} value={f.purchaseEntryId} onChange={(id) => set('purchaseEntryId', id)} error={errors['lot.purchaseEntryId']} />
        </div>
        <Input label="Qty (kg)" inputMode="decimal" value={f.qty} onChange={(e) => set('qty', e.target.value)} error={errors['lot.qty']} hint={amount ? `Amount ${inr(amount)}` : undefined} />
        <Select label="Product" placeholder="—" options={PRODUCTS.map((p) => ({ value: p, label: p }))} value={f.product} onChange={(e) => set('product', e.target.value as Product)} />
        <Input label="Operator" value={f.operator} onChange={(e) => set('operator', e.target.value)} containerClassName="sm:col-span-2" />
        <Textarea label="Remarks" rows={2} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} containerClassName="sm:col-span-2" />
      </form>
    </Modal>
  );
}

export function ResinDetail({ doc: r }: { doc: ResinUseView }) {
  return (
    <DetailList
      cols={3}
      items={[
        { label: 'Lot', value: r.lot.lotNo },
        { label: 'Vendor', value: r.vendorName },
        { label: 'Invoice', value: r.invoiceNo },
        { label: 'Quantity', value: kg(r.lot.qty) },
        { label: 'Rate', value: perKg(r.lot.ratePaise) },
        { label: 'Amount', value: inr(r.lot.amountPaise) },
        { label: 'Shift', value: r.shift },
        { label: 'Product', value: r.product },
        { label: 'Operator', value: r.operator },
        { label: 'Remarks', value: r.remarks, wide: true },
      ]}
    />
  );
}

export const columns: Column<ResinUseView>[] = [
  { id: 'lot', header: 'Lot', width: '80px', className: 'font-medium', cell: (r) => r.lot.lotNo },
  { id: 'vendor', header: 'Vendor', cell: (r) => <span className="block truncate">{r.vendorName ?? '—'}</span> },
  { id: 'qty', header: 'Qty', width: '110px', align: 'right', className: 'font-semibold tabular-nums', cell: (r) => kg(r.lot.qty) },
  { id: 'amt', header: 'Amount', width: '120px', align: 'right', className: 'tabular-nums', cell: (r) => inr(r.lot.amountPaise) },
  { id: 'product', header: 'Product', width: '100px', cell: (r) => r.product ?? '—' },
];

/** Resin lot stock (legacy renderResinStock). */
function ResinStock() {
  const lots = useLots('resin').data ?? [];
  return (
    <Card flush title="Resin lot stock" description="Purchase resin lots and what production has used.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm" aria-label="Resin lot stock">
          <thead className="border-y border-divider bg-page text-label font-semibold uppercase tracking-label text-muted">
            <tr>
              {['Lot', 'Vendor', 'Invoice', 'Date', 'Received', 'Used', 'Left', 'Rate'].map((h, i) => (
                <th key={h} className={i >= 4 ? 'px-4 py-2 text-right' : 'px-4 py-2 text-left'}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => (
              <tr key={l.purchaseEntryId} className="border-b border-divider tabular-nums last:border-0">
                <td className="px-4 py-2 font-semibold">{l.lotNo}</td>
                <td className="px-4 py-2">{l.vendorName}</td>
                <td className="px-4 py-2">{l.invoiceNo}</td>
                <td className="px-4 py-2">{formatDate(l.date)}</td>
                <td className="px-4 py-2 text-right">{kg(l.receivedKg)}</td>
                <td className="px-4 py-2 text-right">{kg(l.usedKg)}</td>
                <td className={l.availKg / (l.receivedKg || 1) < 0.1 ? 'px-4 py-2 text-right font-semibold text-primary' : 'px-4 py-2 text-right font-semibold'}>{kg(l.availKg)}</td>
                <td className="px-4 py-2 text-right">{perKg(l.netRatePaise)}</td>
              </tr>
            ))}
            {lots.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-3 text-muted">
                  No posted resin purchases.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Resin consumption register (legacy renderResinList) with lot stock. */
export function ResinPage() {
  return (
    <DocRegister kind="resin" title="Resin consumption" description="Resin used in production, drawn from Purchase resin lots." newLabel="New entry" searchPlaceholder="Entry no., product, operator" columns={columns} minWidth={960} Form={ResinForm} Detail={ResinDetail}>
      <ResinStock />
    </DocRegister>
  );
}
