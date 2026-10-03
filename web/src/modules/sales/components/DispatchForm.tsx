import { useEffect, useState, type FormEvent } from 'react';
import type { DispatchInfo } from '@contracts/sales';
import { Button, Input, Modal, useToast } from '@/components/ui';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useRecordDispatch } from '../api';

type Form = Record<keyof DispatchInfo, string>;
const KEYS: (keyof DispatchInfo)[] = ['date', 'vehicleNo', 'transporter', 'transporterGstin', 'lrNo', 'driverName', 'driverMobile'];

/** Vehicle, transporter, LR and driver for an order (the Dispatch Register's source). */
export function DispatchForm({ order, onClose }: { order: { id: string; soNo: string; dispatch: DispatchInfo } | null; onClose: () => void }) {
  const toast = useToast();
  const save = useRecordDispatch();
  const [f, setF] = useState<Form>(() => Object.fromEntries(KEYS.map((k) => [k, ''])) as Form);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!order) return;
    setErrors({});
    setF(Object.fromEntries(KEYS.map((k) => [k, order.dispatch[k] ?? ''])) as Form);
  }, [order]);
  const set = (k: keyof DispatchInfo, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync({ id: order!.id, input: Object.fromEntries(KEYS.map((k) => [k, f[k].trim() || null])) });
      toast({ tone: 'success', title: `Dispatch saved for ${order!.soNo}` });
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }

  return (
    <Modal
      open={!!order}
      onClose={onClose}
      title={`Dispatch · ${order?.soNo ?? ''}`}
      description="Shown in the Dispatch Register."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="dispatch-form" loading={save.isPending}>
            Save dispatch
          </Button>
        </>
      }
    >
      <form id="dispatch-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Input label="Dispatch date" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} error={errors.date} />
        <Input label="Vehicle no." value={f.vehicleNo} onChange={(e) => set('vehicleNo', e.target.value.toUpperCase())} />
        <Input label="Transporter" value={f.transporter} onChange={(e) => set('transporter', e.target.value)} containerClassName="sm:col-span-2" />
        <Input label="Transporter GSTIN" value={f.transporterGstin} onChange={(e) => set('transporterGstin', e.target.value.toUpperCase())} error={errors.transporterGstin} />
        <Input label="LR no." value={f.lrNo} onChange={(e) => set('lrNo', e.target.value)} />
        <Input label="Driver" value={f.driverName} onChange={(e) => set('driverName', e.target.value)} />
        <Input label="Driver mobile" inputMode="tel" value={f.driverMobile} onChange={(e) => set('driverMobile', e.target.value)} />
      </form>
    </Modal>
  );
}
