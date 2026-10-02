import { clsx } from 'clsx';
import { Paperclip, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  calcEntry,
  DOCUMENT_TYPES,
  MATERIAL_BY_ID,
  MATERIALS,
  PURCHASE_GST_RATES,
  rateUnitOf,
  TAX_TYPES,
  type DocumentType,
  type MaterialId,
  type PurchaseEntryView,
  type PurchaseVendorOption,
  type TaxType,
} from '@contracts/purchase';
import { Button, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useDebounced } from '../../samples/ui/list-state';
import { duplicateEntryOf, rupeesToPaise, useNextLot, usePoOptions, usePurchaseMeta, usePurchaseVendors, useSaveEntry, useUploadDocument, type DuplicateEntryDetails, type EntryBody } from '../api';
import { CalcTable } from './CalcTable';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const TEXT = [
  'date', 'lotNo', 'poId', 'vendorName', 'vendorCode', 'gstin', 'pan', 'city', 'state', 'mobile', 'invoiceNo', 'invoiceDate',
  'vehicleNo', 'driver', 'transporter', 'rstNo', 'mrnNo', 'grnNo', 'remarks', 'itemId', 'itemName', 'hsn', 'species', 'veneerType',
] as const;
type Text = (typeof TEXT)[number];
type Form = Record<Text, string> & {
  material: MaterialId;
  vendorId: string | null;
  taxType: TaxType;
  gstPct: string;
  invQty: string;
  splQty: string;
  rate: string;
  rateDiff: string;
  other: string;
  altQtyPcs: string;
};

const blank = (material: MaterialId): Form => ({
  ...(Object.fromEntries(TEXT.map((k) => [k, ''])) as Record<Text, string>),
  date: today(),
  material,
  vendorId: null,
  taxType: 'SG+CG',
  gstPct: '18',
  invQty: '',
  splQty: '',
  rate: '',
  rateDiff: '',
  other: '',
  altQtyPcs: '',
});
const p2r = (p: number) => (p ? String(p / 100) : '');
const fromEntry = (e: PurchaseEntryView): Form => ({
  ...(Object.fromEntries(TEXT.map((k) => [k, e[k] ?? ''])) as Record<Text, string>),
  material: e.material,
  vendorId: e.vendorId,
  taxType: e.taxType,
  gstPct: String(e.gstPct),
  invQty: String(e.invQty),
  splQty: String(e.splQty),
  rate: p2r(e.ratePaise),
  rateDiff: p2r(e.rateDiffPaise),
  other: p2r(e.otherChargesPaise),
  altQtyPcs: e.altQtyPcs === null ? '' : String(e.altQtyPcs),
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="contents">
      <legend className="col-span-full mt-2 border-b border-divider pb-1 text-label font-semibold uppercase tracking-label text-primary">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Vendor search over the Vendors module; free text is kept as a typed-in vendor. */
function VendorPicker({ value, onType, onPick, error }: { value: string; onType: (v: string) => void; onPick: (v: PurchaseVendorOption) => void; error?: string }) {
  const [open, setOpen] = useState(false);
  const q = useDebounced(value.trim());
  const options = usePurchaseVendors(q).data ?? [];
  return (
    <div className="relative sm:col-span-2">
      <Input
        label="Vendor"
        icon={Search}
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-autocomplete="list"
        placeholder="Type to search the vendor master, or enter a name"
        autoComplete="off"
        value={value}
        error={error}
        onChange={(e) => {
          onType(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && options.length > 0 && (
        <ul role="listbox" aria-label="Vendors" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded border border-border bg-card shadow-overlay">
          {options.map((v) => (
            <li key={v.id} role="option" aria-selected={false}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-page"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(v);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{v.name}</span>
                  <span className="block truncate text-caption text-faint">{[v.code, v.city, v.gstin].filter(Boolean).join(' · ')}</span>
                </span>
                {v.status !== 'active' && <span className="text-caption text-amber">{v.status}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Add / edit a purchase entry (legacy openAddForm / calcEntry / saveEntry / saveDraft / editEntry).
 * Amounts are previewed with the same calcEntry the server stores.
 */
export function EntryForm({
  open,
  entry,
  material: initialMaterial,
  onClose,
  onSaved,
}: {
  open: boolean;
  entry: PurchaseEntryView | null;
  material: MaterialId;
  onClose: () => void;
  onSaved: (e: PurchaseEntryView) => void;
}) {
  const toast = useToast();
  const save = useSaveEntry();
  const upload = useUploadDocument();
  const meta = usePurchaseMeta().data;
  const [f, setF] = useState<Form>(blank(initialMaterial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [vendor, setVendor] = useState<PurchaseVendorOption | null>(null);
  const [files, setFiles] = useState<{ file: File; type: DocumentType }[]>([]);
  const [duplicate, setDuplicate] = useState<{ details: DuplicateEntryDetails; post: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFiles([]);
    setDuplicate(null);
    setVendor(null);
    setF(entry ? fromEntry(entry) : blank(initialMaterial));
  }, [open, entry, initialMaterial]);

  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const mat = MATERIAL_BY_ID[f.material];
  const pos = usePoOptions(f.material).data ?? [];
  const lot = useNextLot(f.material, f.date, open && !entry);
  const species = (meta?.types ?? []).filter((t) => t.kind === 'nilgiri_species');
  const veneers = (meta?.types ?? []).filter((t) => t.kind === 'face_veneer');

  const calc = useMemo(() => {
    const n = (s: string) => Number(s) || 0;
    return calcEntry({
      material: f.material,
      invQty: n(f.invQty),
      splQty: n(f.splQty || f.invQty), // blank SPL = same as invoice
      ratePaise: rupeesToPaise(f.rate || '0'),
      rateDiffPaise: rupeesToPaise(f.rateDiff || '0'),
      otherChargesPaise: rupeesToPaise(f.other || '0'),
      taxType: f.taxType,
      gstPct: n(f.gstPct),
    });
  }, [f.material, f.invQty, f.splQty, f.rate, f.rateDiff, f.other, f.taxType, f.gstPct]);

  function pickVendor(v: PurchaseVendorOption) {
    setVendor(v);
    setF((x) => ({
      ...x,
      vendorId: v.id,
      vendorName: v.name,
      vendorCode: v.code,
      gstin: v.gstin ?? '',
      pan: v.pan ?? '',
      city: v.city ?? '',
      state: v.state ?? '',
      mobile: v.mobile ?? '',
      taxType: v.suggestedTaxType,
      itemId: '',
      itemName: '',
      hsn: '',
    }));
  }

  function pickPo(id: string) {
    const po = pos.find((p) => p.id === id);
    // Legacy detectVendorFromPO: a PO fills in its vendor and rate when they are still empty.
    setF((x) => ({ ...x, poId: id, vendorName: x.vendorName || po?.vendorName || '', vendorId: x.vendorName ? x.vendorId : (po?.vendorId ?? null), rate: x.rate || (po ? p2r(po.ratePaise) : '') }));
  }

  function pickItem(id: string) {
    const item = vendor?.items.find((i) => i.id === id);
    setF((x) => ({ ...x, itemId: id, itemName: item?.name ?? '', hsn: item?.hsn ?? '', gstPct: item?.gstRate !== null && item?.gstRate !== undefined ? String(item.gstRate) : x.gstPct }));
  }

  async function submit(post: boolean, force = false) {
    const local: Record<string, string> = {};
    if (!f.vendorName.trim()) local.vendorName = 'Vendor is required';
    if (!f.invoiceNo.trim()) local.invoiceNo = 'Invoice number is required';
    if (!(Number(f.invQty) > 0)) local.invQty = 'Enter the invoice quantity';
    if (!(Number(f.rate) > 0)) local.rate = 'Enter the rate';
    if (Object.keys(local).length) return setErrors(local);
    const txt = (k: Text) => (f[k].trim() === '' ? null : f[k].trim());
    const body: EntryBody = {
      ...(Object.fromEntries(TEXT.map((k) => [k, txt(k)])) as Record<Text, string | null>),
      date: f.date,
      vendorName: f.vendorName.trim(),
      invoiceNo: f.invoiceNo.trim(),
      material: f.material,
      vendorId: f.vendorId,
      taxType: f.taxType,
      gstPct: Number(f.gstPct),
      invQty: Number(f.invQty),
      splQty: Number(f.splQty || f.invQty),
      ratePaise: rupeesToPaise(f.rate),
      rateDiffPaise: rupeesToPaise(f.rateDiff || '0'),
      otherChargesPaise: rupeesToPaise(f.other || '0'),
      altQtyPcs: f.altQtyPcs ? Number(f.altQtyPcs) : null,
      species: mat.hasSpecies ? txt('species') : null,
      veneerType: mat.hasVeneerType ? txt('veneerType') : null,
      post,
    };
    try {
      const saved = await save.mutateAsync({ id: entry?.id, input: body, force });
      for (const d of files) {
        try {
          await upload.mutateAsync({ file: d.file, type: d.type, entryId: saved.id });
        } catch (err) {
          toast({ tone: 'error', title: `Couldn’t attach ${d.file.name}`, description: errorMessage(err) });
        }
      }
      toast({
        tone: 'success',
        title: entry ? `${saved.lotNo} updated` : `${saved.lotNo} ${post ? 'saved' : 'saved as draft'}`,
        description: entry?.status === 'approved' && saved.status === 'pending' ? 'It needs approval again.' : undefined,
      });
      onSaved(saved);
    } catch (err) {
      const dup = duplicateEntryOf(err);
      if (dup) return setDuplicate({ details: dup, post });
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save the entry', description: errorMessage(err) });
    }
  }

  const busy = save.isPending || upload.isPending;
  const unit = mat.unit;
  const isDraft = !entry || entry.status === 'draft';
  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        closeOnBackdrop={false}
        title={entry ? `Edit ${mat.label} ${entry.lotNo}` : `Add ${mat.label} entry`}
        description={entry?.status === 'approved' ? 'This entry is approved. Saving a change sends it back for approval.' : 'Material inward against a vendor invoice.'}
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            {isDraft && (
              <Button loading={busy} onClick={() => void submit(false)}>
                Save draft
              </Button>
            )}
            <Button variant="primary" type="submit" form="pu-entry-form" loading={busy}>
              {entry && !isDraft ? 'Save changes' : 'Save entry'}
            </Button>
          </>
        }
      >
        <form
          id="pu-entry-form"
          noValidate
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void submit(true);
          }}
        >
          <Section title="Material">
            <Select label="Material" options={MATERIALS.map((m) => ({ value: m.id, label: m.label }))} value={f.material} onChange={(e) => setF((x) => ({ ...x, material: e.target.value as MaterialId, poId: '', species: '', veneerType: '' }))} disabled={!!entry} />
            <Input label="Inward date" type="date" value={f.date} onChange={(e) => set('date')(e.target.value)} error={errors.date} />
            <Input label="Lot no." placeholder={lot.data ? `${lot.data} (next)` : 'Auto'} value={f.lotNo} onChange={(e) => set('lotNo')(e.target.value.toUpperCase())} hint={!entry && !f.lotNo ? 'Left blank, the next lot number is used.' : undefined} />
            <Select
              label="Purchase order"
              placeholder="No PO"
              options={pos.map((p) => ({ value: p.id, label: `${p.poNo} · ${p.vendorName.slice(0, 22)} (bal ${p.balanceQty.toLocaleString('en-IN')} ${unit})` }))}
              value={f.poId}
              onChange={(e) => pickPo(e.target.value)}
              error={errors.poId}
            />
            {mat.hasSpecies && <Select label="Nilgiri species" placeholder="Select species" options={species.map((t) => ({ value: t.name, label: t.name }))} value={f.species} onChange={(e) => set('species')(e.target.value)} />}
            {mat.hasVeneerType && <Select label="Veneer type" placeholder="Select type" options={veneers.map((t) => ({ value: t.name, label: t.name }))} value={f.veneerType} onChange={(e) => set('veneerType')(e.target.value)} />}
          </Section>

          <Section title="Vendor">
            <VendorPicker
              value={f.vendorName}
              error={errors.vendorName}
              onType={(v) => {
                setVendor(null);
                setF((x) => ({ ...x, vendorName: v, vendorId: null }));
              }}
              onPick={pickVendor}
            />
            <Input label="Vendor code" value={f.vendorCode} onChange={(e) => set('vendorCode')(e.target.value)} />
            <Input label="GSTIN" value={f.gstin} onChange={(e) => set('gstin')(e.target.value.toUpperCase())} />
            <Input label="PAN" value={f.pan} onChange={(e) => set('pan')(e.target.value.toUpperCase())} />
            <Input label="Mobile" value={f.mobile} onChange={(e) => set('mobile')(e.target.value)} />
            <Input label="City" value={f.city} onChange={(e) => set('city')(e.target.value)} />
            <Input label="State" value={f.state} onChange={(e) => set('state')(e.target.value)} />
            {vendor && vendor.items.length > 0 && (
              <Select label="Item" placeholder="Select item" options={vendor.items.map((i) => ({ value: i.id, label: `${i.name}${i.hsn ? ` · HSN ${i.hsn}` : ''}` }))} value={f.itemId} onChange={(e) => pickItem(e.target.value)} hint={vendor.status !== 'active' ? `Vendor is ${vendor.status}` : undefined} />
            )}
          </Section>

          <Section title="Invoice and logistics">
            <Input label="Invoice no." value={f.invoiceNo} onChange={(e) => set('invoiceNo')(e.target.value)} error={errors.invoiceNo} />
            <Input label="Invoice date" type="date" value={f.invoiceDate} onChange={(e) => set('invoiceDate')(e.target.value)} />
            <Select label="Tax type" options={TAX_TYPES.map((t) => ({ value: t, label: t === 'SG+CG' ? 'SG+CG (within Gujarat)' : t === 'IGST' ? 'IGST (interstate)' : 'URD (unregistered)' }))} value={f.taxType} onChange={(e) => set('taxType')(e.target.value as TaxType)} />
            <Select label="GST rate" options={PURCHASE_GST_RATES.map((g) => ({ value: String(g), label: `${g}%` }))} value={f.gstPct} onChange={(e) => set('gstPct')(e.target.value)} disabled={f.taxType === 'URD'} />
            <Input label="Vehicle no." placeholder="GJ01XX1234" value={f.vehicleNo} onChange={(e) => set('vehicleNo')(e.target.value.toUpperCase())} />
            <Input label="Driver" value={f.driver} onChange={(e) => set('driver')(e.target.value)} />
            <Input label="Transporter" value={f.transporter} onChange={(e) => set('transporter')(e.target.value)} />
            <Input label="RST no." value={f.rstNo} onChange={(e) => set('rstNo')(e.target.value)} />
            <Input label="MRN no." value={f.mrnNo} onChange={(e) => set('mrnNo')(e.target.value)} />
            <Input label="GRN no." value={f.grnNo} onChange={(e) => set('grnNo')(e.target.value)} />
          </Section>

          <Section title="Quantity and rate">
            <Input label="Invoice qty" inputMode="decimal" suffix={unit} value={f.invQty} onChange={(e) => set('invQty')(e.target.value)} error={errors.invQty} />
            <Input label="Strandply qty" inputMode="decimal" suffix={unit} placeholder={f.invQty || 'Our weighbridge'} value={f.splQty} onChange={(e) => set('splQty')(e.target.value)} error={errors.splQty} hint={f.splQty ? undefined : 'Blank = same as invoice'} />
            <Input label={`Rate per ${rateUnitOf(mat)}`} inputMode="decimal" suffix="₹" value={f.rate} onChange={(e) => set('rate')(e.target.value)} error={errors.rate ?? errors.ratePaise} />
            <Input label="Other charges" inputMode="decimal" suffix="₹" placeholder="Freight etc." value={f.other} onChange={(e) => set('other')(e.target.value)} />
            <Input
              label={`Rate difference per ${rateUnitOf(mat)}`}
              inputMode="decimal"
              suffix="₹"
              placeholder="0"
              value={f.rateDiff}
              onChange={(e) => set('rateDiff')(e.target.value)}
              hint="Invoice rate above the agreed rate: positive (rate DN). Below: negative (rate CN)."
            />
            {mat.hasVeneerType && <Input label="Alternate qty" inputMode="numeric" suffix="Pcs" value={f.altQtyPcs} onChange={(e) => set('altQtyPcs')(e.target.value)} hint="Piece count, for reference only." />}
            <div className="sm:col-span-3">
              <CalcTable material={f.material} invQty={Number(f.invQty) || 0} splQty={Number(f.splQty || f.invQty) || 0} ratePaise={rupeesToPaise(f.rate || '0')} rateDiffPaise={rupeesToPaise(f.rateDiff || '0')} taxType={f.taxType} calc={calc} />
            </div>
          </Section>

          <Section title="Remarks and documents">
            <Textarea label="Remarks" rows={2} value={f.remarks} onChange={(e) => set('remarks')(e.target.value)} containerClassName="sm:col-span-3" />
            <div className="flex flex-col gap-2 sm:col-span-3">
              <input
                ref={fileInput}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                className="sr-only"
                aria-label="Attach documents"
                onChange={(e) => {
                  const picked = [...(e.target.files ?? [])].map((file) => ({ file, type: (/\.pdf$/i.test(file.name) ? 'Invoice' : 'Photo') as DocumentType }));
                  setFiles((x) => [...x, ...picked]);
                  e.target.value = '';
                }}
              />
              <div className="flex items-center gap-3">
                <Button icon={Paperclip} onClick={() => fileInput.current?.click()}>
                  Attach invoice, weighment slip or photos
                </Button>
                <span className="text-caption text-faint">PDF, JPG or PNG up to 10 MB. Uploaded when you save.</span>
              </div>
              {files.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {files.map((d, i) => (
                    <li key={i} className={clsx('flex items-center gap-2 rounded border border-border px-2.5 py-1')}>
                      <span className="min-w-0 flex-1 truncate text-sm">{d.file.name}</span>
                      <Select
                        aria-label={`Type of ${d.file.name}`}
                        size="md"
                        options={DOCUMENT_TYPES.map((t) => ({ value: t, label: t }))}
                        value={d.type}
                        onChange={(e) => setFiles((x) => x.map((y, j) => (j === i ? { ...y, type: e.target.value as DocumentType } : y)))}
                        containerClassName="w-[170px]"
                      />
                      <Button size="sm" variant="ghost" icon={X} aria-label={`Remove ${d.file.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>
        </form>
      </Modal>
      <ConfirmDialog
        open={!!duplicate}
        title="This invoice is already entered"
        confirmLabel="Save anyway"
        busy={busy}
        onClose={() => setDuplicate(null)}
        onConfirm={() => {
          const d = duplicate;
          setDuplicate(null);
          void submit(d?.post ?? true, true);
        }}
      >
        {duplicate?.details.similar.map((s) => (
          <p key={s.id}>
            {MATERIAL_BY_ID[s.material].label} <strong className="text-ink">{s.lotNo}</strong> · {s.date}
          </p>
        ))}
        <p className="mt-2">Invoice {f.invoiceNo} from {f.vendorName} was already entered. Save another entry for it anyway?</p>
      </ConfirmDialog>
    </>
  );
}
