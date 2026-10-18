import { Plus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { GATE_CONDITIONS, STORE_UNITS, type GateCondition, type MrnView, type StoreMaterial, type StoreUnit } from '@contracts/stores';
import { useSession } from '@/app/session';
import { Button, Combo, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useDebounced } from '../../samples/ui/list-state';
import { useSaveMrn, useStoresMeta, useStoresProducts, useStoresVendors } from '../api';
import { printMrn } from '../print';
import { productComboOptions, storeUnitFor } from '../ui';

/** A line names a product; `material` is kept only for lines saved before products were picked. */
type Line = { key: string; id: string | null; itemId: string | null; material: StoreMaterial | null; approxQty: string; challanQty: string; unit: StoreUnit; packages: string; condition: GateCondition | ''; remarks: string };
type Form = {
  date: string;
  time: string;
  vehicleNo: string;
  securityName: string;
  driverName: string;
  driverPhone: string;
  vendorId: string | null;
  vendorName: string;
  invoiceNo: string;
  challanDate: string;
  poNo: string;
  timeOut: string;
  transporter: string;
  lrNo: string;
  ewayBill: string;
  remarks: string;
  lines: Line[];
};

let seq = 0;
const line = (over: Partial<Line> = {}): Line => ({ key: `l${++seq}`, id: null, itemId: null, material: null, approxQty: '', challanQty: '', unit: 'Kg', packages: '', condition: '', remarks: '', ...over });

function fromMrn(m: MrnView | null, today: string, now: string): Form {
  if (!m) return { date: today, time: now, vehicleNo: '', securityName: '', driverName: '', driverPhone: '', vendorId: null, vendorName: '', invoiceNo: '', challanDate: '', poNo: '', timeOut: '', transporter: '', lrNo: '', ewayBill: '', remarks: '', lines: [line()] };
  return {
    date: m.date,
    time: m.time,
    vehicleNo: m.vehicleNo,
    securityName: m.securityName,
    driverName: m.driverName ?? '',
    driverPhone: m.driverPhone ?? '',
    vendorId: m.vendorId,
    vendorName: m.vendorName,
    invoiceNo: m.invoiceNo ?? '',
    challanDate: m.challanDate ?? '',
    poNo: m.poNo ?? '',
    timeOut: m.timeOut ?? '',
    transporter: m.transporter ?? '',
    lrNo: m.lrNo ?? '',
    ewayBill: m.ewayBill ?? '',
    remarks: m.remarks ?? '',
    lines: m.items.map((it) => line({ id: it.id, itemId: it.itemId, material: it.itemId ? null : it.material, approxQty: String(it.approxQty), challanQty: it.challanQty === null ? '' : String(it.challanQty), unit: it.unit, packages: it.packages ?? '', condition: it.condition ?? '', remarks: it.remarks ?? '' })),
  };
}

/** Gate entry by Security (legacy renderMrnForm). Saving a new MRN prints its slip. */
export function MrnForm({ open, mrn, onClose }: { open: boolean; mrn: MrnView | null; onClose: () => void }) {
  const toast = useToast();
  const { canDo } = useSession();
  const meta = useStoresMeta().data;
  const save = useSaveMrn();
  const [f, setF] = useState<Form>(() => fromMrn(null, '', ''));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const vendors = useStoresVendors(useDebounced(f.vendorName.trim()), { enabled: open }).data ?? [];
  const auto = meta?.settings.autoPunchMrn ?? true;
  const products = useStoresProducts({ enabled: open }).data ?? [];
  const productOptions = productComboOptions(products, f.lines);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(fromMrn(mrn, meta?.today ?? '', meta?.now ?? ''));
    // Only on open: the meta clock refreshing mustn't wipe what Security typed.
  }, [open, mrn]);

  /** Editing a field clears its error. */
  const clear = (...keys: string[]) => setErrors((e) => (keys.some((k) => k in e) ? Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))) : e));
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => {
    clear(k, ...(k === 'vendorName' ? ['vendorId'] : []));
    setF((x) => ({ ...x, [k]: v }));
  };
  const setLine = (key: string, patch: Partial<Line>, errorKey?: string) => {
    if (errorKey) clear(errorKey, 'items');
    setF((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.vehicleNo.trim()) local.vehicleNo = 'Vehicle number is required';
    if (!f.securityName.trim()) local.securityName = 'Security guard name is required';
    if (!f.vendorName.trim()) local.vendorName = 'Vendor is required';
    const lines = f.lines.filter((l) => l.itemId || l.material || l.approxQty);
    if (!lines.length) local.items = 'Add at least one product';
    lines.forEach((l) => {
      const i = f.lines.indexOf(l);
      if (!l.itemId && !l.material) local[`items.${i}.itemId`] = 'Pick a product';
      if (!(Number(l.approxQty) > 0)) local[`items.${i}.approxQty`] = 'Enter the quantity counted at the gate';
    });
    if (Object.keys(local).length) return setErrors(local);
    try {
      const saved = await save.mutateAsync({
        id: mrn?.id,
        input: {
          ...(auto ? {} : { date: f.date, time: f.time }),
          vehicleNo: f.vehicleNo.trim(),
          securityName: f.securityName.trim(),
          driverName: f.driverName.trim() || null,
          driverPhone: f.driverPhone.trim() || null,
          vendorId: f.vendorId,
          vendorName: f.vendorName.trim(),
          invoiceNo: f.invoiceNo.trim() || null,
          challanDate: f.challanDate || null,
          poNo: f.poNo.trim() || null,
          timeOut: f.timeOut || null,
          transporter: f.transporter.trim() || null,
          lrNo: f.lrNo.trim() || null,
          ewayBill: f.ewayBill.trim() || null,
          remarks: f.remarks.trim() || null,
          items: lines.map((l) => ({ id: l.id, ...(l.itemId ? { itemId: l.itemId } : { material: l.material! }), approxQty: Number(l.approxQty), challanQty: l.challanQty === '' ? null : Number(l.challanQty), unit: l.unit, packages: l.packages.trim() || null, condition: l.condition || null, remarks: l.remarks.trim() || null })),
        },
      });
      toast({ tone: 'success', title: mrn ? `${saved.mrnNo} updated` : `${saved.mrnNo} saved`, description: mrn ? undefined : `${saved.items.length} item(s). Stores can now make the GRN.` });
      onClose();
      if (!mrn && canDo('print')) await printMrn(saved.id).catch((err) => toast({ tone: 'error', title: 'Couldn’t print the slip', description: errorMessage(err) }));
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save the gate entry', description: errorMessage(err) });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={mrn ? `Edit ${mrn.mrnNo}` : 'New gate entry (MRN)'}
      description={mrn ? undefined : meta ? `Next number ${meta.nextMrnNo}. One row per product on the vehicle.` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="mrn-form" loading={save.isPending}>
            {mrn ? 'Save changes' : canDo('print') ? 'Save and print slip' : 'Save gate entry'}
          </Button>
        </>
      }
    >
      <form id="mrn-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <fieldset className="grid gap-3 sm:grid-cols-4">
          <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">Gate and vehicle</legend>
          <Input label="Date" type="date" value={f.date} onChange={(e) => set('date')(e.target.value)} readOnly={auto} hint={auto ? 'Auto-punched' : undefined} error={errors.date} />
          <Input label="Time" type="time" value={f.time} onChange={(e) => set('time')(e.target.value)} readOnly={auto} error={errors.time} />
          <Input label="Vehicle no." placeholder="GJ01HT0324" value={f.vehicleNo} onChange={(e) => set('vehicleNo')(e.target.value.toUpperCase())} error={errors.vehicleNo} />
          <Input label="Security guard" placeholder="Guard on duty" value={f.securityName} onChange={(e) => set('securityName')(e.target.value)} error={errors.securityName} />
          <Input label="Driver name" value={f.driverName} onChange={(e) => set('driverName')(e.target.value)} containerClassName="sm:col-span-2" />
          <Input label="Driver phone" type="tel" inputMode="tel" placeholder="10-digit mobile" value={f.driverPhone} onChange={(e) => set('driverPhone')(e.target.value)} error={errors.driverPhone} containerClassName="sm:col-span-2" />
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">Vendor and invoice</legend>
          <div className="sm:col-span-2">
            <Input
              label="Vendor"
              list="mrn-vendor-list"
              placeholder="Search the vendor directory or type a name"
              value={f.vendorName}
              error={errors.vendorName ?? errors.vendorId}
              hint={f.vendorId ? 'From the vendor directory' : f.vendorName.trim() ? 'Not in the directory: saved as typed' : undefined}
              onChange={(e) => {
                const v = vendors.find((x) => x.name === e.target.value);
                clear('vendorName', 'vendorId');
                setF((x) => ({ ...x, vendorName: e.target.value, vendorId: v?.id ?? null }));
              }}
            />
            <datalist id="mrn-vendor-list">
              {vendors.map((v) => (
                <option key={v.id} value={v.name}>
                  {[v.code, v.city].filter(Boolean).join(' · ')}
                </option>
              ))}
            </datalist>
          </div>
          <Input label="Invoice / challan no." placeholder="If the driver has it" value={f.invoiceNo} onChange={(e) => set('invoiceNo')(e.target.value)} />
          <Input label="Challan date" type="date" value={f.challanDate} onChange={(e) => set('challanDate')(e.target.value)} error={errors.challanDate} />
          <Input label="Purchase order" placeholder="PO no. on the challan" value={f.poNo} onChange={(e) => set('poNo')(e.target.value.toUpperCase())} />
          <Input label="Time out" type="time" value={f.timeOut} onChange={(e) => set('timeOut')(e.target.value)} error={errors.timeOut} hint="When the vehicle leaves" />
          <Input label="Transporter" value={f.transporter} onChange={(e) => set('transporter')(e.target.value)} />
          <Input label="LR no." value={f.lrNo} onChange={(e) => set('lrNo')(e.target.value)} />
          <Input label="E-way bill" inputMode="numeric" value={f.ewayBill} onChange={(e) => set('ewayBill')(e.target.value)} error={errors.ewayBill} />
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">Products on this vehicle</legend>
          {errors.items && <p className="text-sm text-primary">{errors.items}</p>}
          {f.lines.map((l, i) => (
            <div key={l.key} className="flex flex-col gap-2 rounded border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">Item {i + 1}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={X}
                  aria-label={`Remove item ${i + 1}`}
                  disabled={f.lines.length === 1}
                  onClick={() => setF((x) => ({ ...x, lines: x.lines.filter((y) => y.key !== l.key) }))}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-[1.6fr_0.9fr_0.9fr_0.8fr] [&>*]:min-w-0">
                <Combo
                  label="Product"
                  ariaLabel={`Product, item ${i + 1}`}
                  placeholder="Search the product master"
                  options={productOptions}
                  value={l.itemId ?? (l.material ? `mat:${l.material}` : null)}
                  onChange={(id) => {
                    if (id?.startsWith('mat:')) return;
                    const p = products.find((x) => x.id === id);
                    setLine(l.key, { itemId: id, material: null, unit: p ? storeUnitFor(p.unit) : l.unit }, `items.${i}.itemId`);
                  }}
                  error={errors[`items.${i}.itemId`]}
                />
                <Input label="Challan qty" aria-label={`Challan quantity, item ${i + 1}`} inputMode="decimal" value={l.challanQty} onChange={(e) => setLine(l.key, { challanQty: e.target.value }, `items.${i}.challanQty`)} error={errors[`items.${i}.challanQty`]} />
                <Input label="Counted at gate" inputMode="decimal" value={l.approxQty} onChange={(e) => setLine(l.key, { approxQty: e.target.value }, `items.${i}.approxQty`)} error={errors[`items.${i}.approxQty`]} />
                <Select label="Unit" options={STORE_UNITS.map((u) => ({ value: u, label: u }))} value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value as StoreUnit })} />
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr] [&>*]:min-w-0">
                <Input label="Packages" placeholder="e.g. 2 drums" value={l.packages} onChange={(e) => setLine(l.key, { packages: e.target.value })} />
                <Select label="Condition" placeholder="—" options={GATE_CONDITIONS.map((c) => ({ value: c, label: c }))} value={l.condition} onChange={(e) => setLine(l.key, { condition: e.target.value as GateCondition | '' })} />
                <Input label="Item remarks" value={l.remarks} onChange={(e) => setLine(l.key, { remarks: e.target.value })} />
              </div>
            </div>
          ))}
          <div>
            <Button size="sm" icon={Plus} onClick={() => setF((x) => ({ ...x, lines: [...x.lines, line()] }))} disabled={f.lines.length >= 20}>
              Add another item
            </Button>
          </div>
        </fieldset>

        <Textarea label="Gate remarks" rows={2} placeholder="Seal intact, visible damage, etc." value={f.remarks} onChange={(e) => set('remarks')(e.target.value)} />
      </form>
    </Modal>
  );
}
