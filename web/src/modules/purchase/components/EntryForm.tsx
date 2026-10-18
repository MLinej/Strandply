import { clsx } from 'clsx';
import { Paperclip, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  amountFor,
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
  type PurchaseProductOption,
  type PurchaseVendorOption,
  type TaxType,
} from '@contracts/purchase';
import { api } from '@/api/client';
import { Button, Combo, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useDebounced } from '../../samples/ui/list-state';
import {
  duplicateEntryOf,
  rupeesToPaise,
  useNextLot,
  usePoOptions,
  usePurchaseMeta,
  usePurchaseProducts,
  usePurchaseVendors,
  useSaveEntry,
  useUploadDocument,
  type DuplicateEntryDetails,
  type EntryBody,
} from '../api';
import { inr } from '../ui';
import { CalcTable } from './CalcTable';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const TEXT = [
  'date', 'lotNo', 'poId', 'vendorName', 'vendorCode', 'gstin', 'pan', 'city', 'state', 'mobile', 'invoiceNo', 'invoiceDate',
  'vehicleNo', 'driver', 'transporter', 'rstNo', 'mrnNo', 'grnNo', 'remarks', 'itemId', 'itemName', 'hsn', 'species', 'veneerType',
] as const;
type Text = (typeof TEXT)[number];
/** One invoice line (itemized materials). */
type Line = { key: number; itemId: string | null; itemName: string; hsn: string; invQty: string; splQty: string; rate: string };
type Form = Record<Text, string> & {
  lines: Line[];
  raiseNotes: boolean;
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

let seq = 0;
const blankLine = (o: Partial<Line> = {}): Line => ({ key: ++seq, itemId: null, itemName: '', hsn: '', invQty: '', splQty: '', rate: '', ...o });
const blank = (material: MaterialId): Form => ({
  ...(Object.fromEntries(TEXT.map((k) => [k, ''])) as Record<Text, string>),
  lines: [blankLine()],
  raiseNotes: MATERIAL_BY_ID[material].notes !== 'none',
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
  // Entries saved before invoice lines show as one line.
  lines: e.lines.length
    ? e.lines.map((l) => blankLine({ itemId: l.itemId, itemName: l.itemName, hsn: l.hsn ?? '', invQty: String(l.invQty), splQty: String(l.splQty), rate: p2r(l.ratePaise) }))
    : [blankLine({ itemId: e.itemId, itemName: e.itemName ?? MATERIAL_BY_ID[e.material].label, hsn: e.hsn ?? '', invQty: String(e.invQty), splQty: String(e.splQty), rate: p2r(e.ratePaise) })],
  raiseNotes: e.raiseNotes,
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

/** Invoice-wise total (no weighbridge reconciliation): items, GST, other charges, what is owed. */
function InvoiceTotals({ calc, otherPaise, gstPct, taxType }: { calc: ReturnType<typeof calcEntry>; otherPaise: number; gstPct: number; taxType: TaxType }) {
  const t = calc.invoice;
  const rows: [string, number][] = [['Items (basic)', t.basic]];
  if (taxType === 'IGST') rows.push([`IGST @ ${gstPct}%`, t.igst]);
  else if (t.cgst) rows.push([`CGST @ ${gstPct / 2}%`, t.cgst], [`SGST @ ${gstPct / 2}%`, t.sgst]);
  if (otherPaise) rows.push(['Other charges', otherPaise]);
  return (
    <div className="ml-auto flex w-full max-w-[340px] flex-col gap-1 rounded border border-border bg-page p-3 text-sm" aria-label="Invoice total">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between">
          <span className="text-muted">{k}</span>
          <span className="tabular-nums">{inr(v)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t border-border pt-1.5 text-base font-semibold">
        <span>Payable</span>
        <span className="tabular-nums">{inr(calc.payable)}</span>
      </div>
    </div>
  );
}

/** Product master options; a name saved without a product id (older entries) stays pickable. */
function productOptions(products: PurchaseProductOption[], keep: { itemId: string | null; itemName: string }[]) {
  const opts = products.map((p) => ({ id: p.id, label: p.name, hint: [p.categoryName, p.hsn && `HSN ${p.hsn}`].filter(Boolean).join(' · ') || null }));
  for (const k of keep) if (!k.itemId && k.itemName && !opts.some((o) => o.id === `name:${k.itemName}`)) opts.push({ id: `name:${k.itemName}`, label: k.itemName, hint: 'not in the product master' });
  return opts;
}
const comboValue = (l: { itemId: string | null; itemName: string }) => l.itemId ?? (l.itemName ? `name:${l.itemName}` : null);

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
  const [files, setFiles] = useState<{ file: File; type: DocumentType }[]>([]);
  const [duplicate, setDuplicate] = useState<{ details: DuplicateEntryDetails; post: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFiles([]);
    setDuplicate(null);
    setF(entry ? fromEntry(entry) : blank(initialMaterial));
  }, [open, entry, initialMaterial]);

  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const mat = MATERIAL_BY_ID[f.material];
  const pos = usePoOptions(f.material).data ?? [];
  const lot = useNextLot(f.material, f.date, open && !entry);
  const species = (meta?.types ?? []).filter((t) => t.kind === 'nilgiri_species');
  const veneers = (meta?.types ?? []).filter((t) => t.kind === 'face_veneer');
  const products = usePurchaseProducts({ enabled: open }).data ?? [];
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const lineOptions = useMemo(() => productOptions(products, [...f.lines, { itemId: f.itemId || null, itemName: f.itemName }]), [products, f.lines, f.itemId, f.itemName]);
  /** Notes: always (Nilgiri, fire wood), the entry's choice (resin, kraft), never (veneers). */
  const notes = mat.notes === 'always' || (mat.notes === 'optional' && f.raiseNotes);

  const n = (s: string) => Number(s) || 0;
  const calcLines = mat.itemized ? f.lines.map((l) => ({ invQty: n(l.invQty), splQty: notes ? n(l.splQty || l.invQty) : n(l.invQty), ratePaise: rupeesToPaise(l.rate || '0') })) : undefined;
  const calc = calcEntry({
    material: f.material,
    invQty: n(f.invQty),
    splQty: n(f.splQty || f.invQty), // blank SPL = same as invoice
    ratePaise: rupeesToPaise(f.rate || '0'),
    lines: calcLines,
    raiseNotes: notes,
    rateDiffPaise: notes ? rupeesToPaise(f.rateDiff || '0') : 0,
    otherChargesPaise: rupeesToPaise(f.other || '0'),
    taxType: f.taxType,
    gstPct: n(f.gstPct),
  });
  const totalInv = calcLines ? calcLines.reduce((t, l) => t + l.invQty, 0) : n(f.invQty);
  const totalSpl = calcLines ? calcLines.reduce((t, l) => t + l.splQty, 0) : n(f.splQty || f.invQty);
  const headRate = calcLines && totalInv ? Math.round((calc.invoice.basic * (mat.rateBasis === 'ton' ? 1000 : 1)) / totalInv) : rupeesToPaise(f.rate || '0');

  const setLine = (key: number, p: Partial<Line>) => setF((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...p } : l)) }));
  function pickLineProduct(l: Line, id: string | null) {
    const p = id ? productById.get(id) : null;
    if (!id) return setLine(l.key, { itemId: null, itemName: '', hsn: '' });
    if (!p) return; // a kept name
    setLine(l.key, { itemId: p.id, itemName: p.name, hsn: p.hsn ?? '' });
    if (p.gstRate !== null && f.lines.length === 1) setF((x) => ({ ...x, gstPct: String(p.gstRate) }));
  }
  function pickProduct(id: string | null) {
    const p = id ? productById.get(id) : null;
    if (id && !p) return;
    setF((x) => ({ ...x, itemId: p?.id ?? '', itemName: p?.name ?? '', hsn: p?.hsn ?? '', gstPct: p && p.gstRate !== null ? String(p.gstRate) : x.gstPct }));
  }

  function pickVendor(v: PurchaseVendorOption) {
    // Notes are vendor by vendor: start from what this vendor's last entry of the material did.
    if (mat.notes === 'optional' && !entry)
      void api<{ rows: PurchaseEntryView[] }>('/purchase/entries', { query: { pageSize: 1, filters: { vendorId: v.id, material: f.material, posted: true } } })
        .then((r) => r.rows[0] && setF((x) => (x.vendorId === v.id ? { ...x, raiseNotes: r.rows[0]!.raiseNotes } : x)))
        .catch(() => undefined);
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
    }));
  }

  function pickPo(id: string) {
    const po = pos.find((p) => p.id === id);
    // Legacy detectVendorFromPO: a PO fills in its vendor and rate when they are still empty.
    setF((x) => ({ ...x, poId: id, vendorName: x.vendorName || po?.vendorName || '', vendorId: x.vendorName ? x.vendorId : (po?.vendorId ?? null), rate: x.rate || (po ? p2r(po.ratePaise) : '') }));
  }


  async function submit(post: boolean, force = false) {
    const local: Record<string, string> = {};
    if (!f.vendorName.trim()) local.vendorName = 'Vendor is required';
    if (!f.invoiceNo.trim()) local.invoiceNo = 'Invoice number is required';
    // Fully blank item rows are ignored; `at[k]` is the form row of the k-th line sent.
    const at = f.lines.map((l, i) => (l.itemName || l.invQty || l.rate ? i : -1)).filter((i) => i >= 0);
    if (mat.itemized) {
      if (!at.length) local.lines = 'Add at least one item';
      for (const i of at) {
        const l = f.lines[i]!;
        if (!l.itemName) local[`lines.${i}.itemName`] = 'Pick a product';
        if (!(Number(l.invQty) > 0)) local[`lines.${i}.invQty`] = 'Enter the quantity';
        if (!(Number(l.rate) > 0)) local[`lines.${i}.ratePaise`] = 'Enter the rate';
      }
    } else {
      if (!(Number(f.invQty) > 0)) local.invQty = 'Enter the invoice quantity';
      if (!(Number(f.rate) > 0)) local.rate = 'Enter the rate';
    }
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
      ...(mat.itemized
        ? {
            lines: at.map((i) => {
              const l = f.lines[i]!;
              return { itemId: l.itemId, itemName: l.itemName, hsn: l.hsn.trim() || null, invQty: Number(l.invQty), splQty: notes ? Number(l.splQty || l.invQty) : Number(l.invQty), ratePaise: rupeesToPaise(l.rate) };
            }),
          }
        : { invQty: Number(f.invQty), splQty: Number(f.splQty || f.invQty), ratePaise: rupeesToPaise(f.rate) }),
      raiseNotes: notes,
      rateDiffPaise: notes ? rupeesToPaise(f.rateDiff || '0') : 0,
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
      // Server paths count only the lines sent; point them back at the form rows.
      setErrors(Object.fromEntries(Object.entries(fieldErrors(err)).map(([k, v]) => [k.replace(/^lines\.(\d+)\./, (_m, d: string) => `lines.${at[Number(d)] ?? d}.`), v])));
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
            <Select label="Material" options={MATERIALS.map((m) => ({ value: m.id, label: m.label }))} value={f.material} onChange={(e) => setF((x) => ({ ...x, material: e.target.value as MaterialId, poId: '', species: '', veneerType: '', lines: [blankLine()], raiseNotes: MATERIAL_BY_ID[e.target.value as MaterialId].notes !== 'none' }))} disabled={!!entry} />
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
            {!mat.itemized && (
              <Combo
                label="Product"
                value={comboValue({ itemId: f.itemId || null, itemName: f.itemName })}
                options={lineOptions}
                onChange={pickProduct}
                placeholder="Search the product master"
              />
            )}
          </Section>

          <Section title="Vendor">
            <VendorPicker
              value={f.vendorName}
              error={errors.vendorName}
              onType={(v) => {
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

          <Section title={mat.itemized ? 'Invoice items' : 'Quantity and rate'}>
            {mat.notes === 'optional' && (
              <label className="flex items-start gap-2 sm:col-span-3">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={f.raiseNotes} onChange={(e) => set('raiseNotes')(e.target.checked)} />
                <span className="text-sm">
                  <span className="font-semibold text-ink">Raise debit / credit notes</span>
                  <span className="block text-caption text-muted">Some vendors issue them for short or excess quantity and rate differences, some don’t. Untick to pay the invoice as billed.</span>
                </span>
              </label>
            )}
            {mat.itemized ? (
              <div className="flex flex-col gap-2 sm:col-span-3">
                {errors.lines && <p className="text-sm text-primary">{errors.lines}</p>}
                {f.lines.map((l, i) => (
                  <div key={l.key} className={clsx('grid items-start gap-2 rounded border border-border p-2 [&>*]:min-w-0', notes ? 'sm:grid-cols-[2.4fr_0.8fr_1fr_1fr_1fr_auto]' : 'sm:grid-cols-[2.6fr_0.8fr_1fr_1fr_auto]')}>
                    <Combo label="Product" ariaLabel={`Product, line ${i + 1}`} value={comboValue(l)} options={lineOptions} onChange={(id) => pickLineProduct(l, id)} error={errors[`lines.${i}.itemName`]} placeholder="Search the product master" />
                    <Input label="HSN" aria-label={`HSN, line ${i + 1}`} value={l.hsn} onChange={(e) => setLine(l.key, { hsn: e.target.value })} />
                    <Input label={notes ? 'Invoice qty' : 'Qty'} aria-label={`Quantity, line ${i + 1}`} inputMode="decimal" suffix={unit} value={l.invQty} onChange={(e) => setLine(l.key, { invQty: e.target.value })} error={errors[`lines.${i}.invQty`]} />
                    {notes && <Input label="Strandply qty" aria-label={`Strandply quantity, line ${i + 1}`} inputMode="decimal" suffix={unit} placeholder={l.invQty || 'Same'} value={l.splQty} onChange={(e) => setLine(l.key, { splQty: e.target.value })} error={errors[`lines.${i}.splQty`]} />}
                    <Input
                      label={`Rate / ${rateUnitOf(mat)}`}
                      aria-label={`Rate, line ${i + 1}`}
                      inputMode="decimal"
                      suffix="₹"
                      value={l.rate}
                      onChange={(e) => setLine(l.key, { rate: e.target.value })}
                      error={errors[`lines.${i}.ratePaise`]}
                      hint={<span className="tabular-nums">{inr(amountFor(f.material, n(l.invQty), rupeesToPaise(l.rate || '0')))}</span>}
                    />
                    <Button variant="ghost" size="sm" icon={X} className="sm:mt-6" aria-label={`Remove line ${i + 1}`} disabled={f.lines.length === 1} onClick={() => setF((x) => ({ ...x, lines: x.lines.filter((y) => y.key !== l.key) }))} />
                  </div>
                ))}
                <Button size="sm" icon={Plus} className="self-start" onClick={() => setF((x) => ({ ...x, lines: [...x.lines, blankLine()] }))}>
                  Add item
                </Button>
              </div>
            ) : (
              <>
                <Input label="Invoice qty" inputMode="decimal" suffix={unit} value={f.invQty} onChange={(e) => set('invQty')(e.target.value)} error={errors.invQty} />
                <Input label="Strandply qty" inputMode="decimal" suffix={unit} placeholder={f.invQty || 'Our weighbridge'} value={f.splQty} onChange={(e) => set('splQty')(e.target.value)} error={errors.splQty} hint={f.splQty ? undefined : 'Blank = same as invoice'} />
                <Input label={`Rate per ${rateUnitOf(mat)}`} inputMode="decimal" suffix="₹" value={f.rate} onChange={(e) => set('rate')(e.target.value)} error={errors.rate ?? errors.ratePaise} />
              </>
            )}
            <Input label="Other charges" inputMode="decimal" suffix="₹" placeholder="Freight etc." value={f.other} onChange={(e) => set('other')(e.target.value)} />
            {notes && (
              <Input
                label={`Rate difference per ${rateUnitOf(mat)}`}
                inputMode="decimal"
                suffix="₹"
                placeholder="0"
                value={f.rateDiff}
                onChange={(e) => set('rateDiff')(e.target.value)}
                hint="Invoice rate above the agreed rate: positive (rate DN). Below: negative (rate CN)."
              />
            )}
            {mat.hasVeneerType && <Input label="Alternate qty" inputMode="numeric" suffix="Pcs" value={f.altQtyPcs} onChange={(e) => set('altQtyPcs')(e.target.value)} hint="Piece count, for reference only." />}
            <div className="sm:col-span-3">
              {notes ? (
                <CalcTable material={f.material} invQty={totalInv} splQty={totalSpl} ratePaise={headRate} rateDiffPaise={rupeesToPaise(f.rateDiff || '0')} taxType={f.taxType} calc={calc} />
              ) : (
                <InvoiceTotals calc={calc} otherPaise={rupeesToPaise(f.other || '0')} gstPct={n(f.gstPct)} taxType={f.taxType} />
              )}
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
