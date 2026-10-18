import { clsx } from 'clsx';
import { Check, FileUp, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { MAX_VENDOR_DOC_BYTES, PAYMENT_TERMS, VENDOR_DOC_TYPES, VENDOR_TYPES, type VendorCreateStatus, type VendorDocType, type VendorInput, type VendorView } from '@contracts/vendors';
import { Button, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { lookupIfsc } from '@/lib/ifsc';
import { useCityOptions, useStates } from '../../samples/api';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import {
  duplicateVendorOf,
  lookupPincode,
  useAllVendorProducts,
  useNextVendorCode,
  useRemoveVendorDocument,
  useSaveVendor,
  useUploadVendorDocuments,
  useVendorCategories,
  vendorDocumentUrl,
  type DuplicateVendorDetails,
} from '../api';
import { CATEGORY_STYLE, StarInput } from '../ui';

const TEXT_FIELDS = [
  'name', 'code', 'type', 'yearEstablished', 'contact', 'designation', 'phone', 'email', 'address', 'pincode', 'city', 'state',
  'website', 'gst', 'pan', 'msme', 'paymentTerms', 'bank', 'branch', 'accountNo', 'ifsc', 'notes',
] as const;
type TextField = (typeof TEXT_FIELDS)[number];
type Form = Record<TextField, string> & { categoryIds: string[]; productIds: string[]; rating: number | null };

const empty = (): Form => ({ ...(Object.fromEntries(TEXT_FIELDS.map((k) => [k, ''])) as Record<TextField, string>), categoryIds: [], productIds: [], rating: null });
const fromVendor = (v: VendorView): Form => ({
  ...(Object.fromEntries(TEXT_FIELDS.map((k) => [k, v[k] === null || v[k] === undefined ? '' : String(v[k])])) as Record<TextField, string>),
  categoryIds: [...v.categoryIds],
  productIds: [...v.productIds],
  rating: v.rating,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="contents">
      <legend className="col-span-full mt-2 border-b border-divider pb-1 text-label font-semibold uppercase tracking-label text-primary">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Products supplied: search + checklist, chips for what's picked (legacy msw multi-select). */
function ProductPicker({ value, onChange, categoryIds }: { value: string[]; onChange: (ids: string[]) => void; categoryIds: string[] }) {
  const products = useAllVendorProducts().data ?? [];
  const [q, setQ] = useState('');
  const [onlyMine, setOnlyMine] = useState(true);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const needle = q.trim().toLowerCase();
  const shown = products.filter(
    (p) =>
      (!needle || p.name.toLowerCase().includes(needle) || p.code.toLowerCase().includes(needle)) &&
      (!onlyMine || !categoryIds.length || categoryIds.includes(p.categoryId) || value.includes(p.id)),
  );
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="col-span-full flex flex-col gap-2">
      <span className="text-sm font-semibold text-ink">Products supplied</span>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span key={id} className="inline-flex h-6 items-center gap-1 rounded-full bg-subtle pl-2.5 pr-1 text-sm font-medium">
              {byId.get(id)?.name ?? id}
              <button type="button" aria-label={`Remove ${byId.get(id)?.name ?? id}`} onClick={() => toggle(id)} className="rounded-full p-0.5 text-muted hover:bg-border hover:text-ink">
                <X size={12} strokeWidth={2} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label="Search products" icon={Search} placeholder="Type to search…" value={q} onChange={(e) => setQ(e.target.value)} containerClassName="w-[260px]" />
        {categoryIds.length > 0 && (
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            Only the selected categories
          </label>
        )}
      </div>
      <div className="max-h-44 overflow-y-auto rounded border border-border" role="group" aria-label="Products">
        {shown.length === 0 ? (
          <p className="px-3 py-2.5 text-sm text-muted">No products match.</p>
        ) : (
          shown.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2.5 border-b border-divider px-3 py-1.5 last:border-0 hover:bg-page">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={value.includes(p.id)} onChange={() => toggle(p.id)} />
              <span className="min-w-0 flex-1 truncate text-base">{p.name}</span>
              <span className="shrink-0 text-caption text-faint">
                {p.unit} · {p.categoryName}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

type PendingDoc = { type: VendorDocType; file: File };
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Supporting documents: files already on the vendor, plus ones picked here that upload when the form is saved. */
function DocumentsPicker({ vendor, pending, onChange }: { vendor: VendorView | null; pending: PendingDoc[]; onChange: (d: PendingDoc[]) => void }) {
  const toast = useToast();
  const remove = useRemoveVendorDocument();
  const [type, setType] = useState<VendorDocType>('GSTIN certificate');
  // Removing a file returns the updated vendor; the `vendor` prop stays as it was when the form opened.
  const [existing, setExisting] = useState(vendor?.documents ?? []);
  useEffect(() => setExisting(vendor?.documents ?? []), [vendor]);
  function add(files: FileList | null) {
    const picked = Array.from(files ?? []);
    const tooBig = picked.filter((f) => f.size > MAX_VENDOR_DOC_BYTES);
    if (tooBig.length) toast({ tone: 'error', title: 'Files can be up to 10 MB', description: tooBig.map((f) => f.name).join(', ') });
    onChange([...pending, ...picked.filter((f) => f.size <= MAX_VENDOR_DOC_BYTES).map((file) => ({ type, file }))]);
  }
  return (
    <div className="col-span-full flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2.5">
        <Select label="Document type" options={VENDOR_DOC_TYPES.map((t) => ({ value: t, label: t }))} value={type} onChange={(e) => setType(e.target.value as VendorDocType)} containerClassName="w-[220px]" />
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded border border-border bg-card px-3 text-sm font-semibold text-ink hover:bg-page focus-within:ring-2 focus-within:ring-primary/30">
          <FileUp size={15} aria-hidden /> Attach files
          <input type="file" accept="application/pdf,image/jpeg,image/png" multiple className="sr-only" aria-label="Attach documents" onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
        </label>
        <span className="pb-2 text-caption text-faint">PDF, JPG or PNG, up to 10 MB each</span>
      </div>
      {existing.length + pending.length > 0 ? (
        <ul className="divide-y divide-divider rounded border border-border" aria-label="Documents">
          {existing.map((d) => (
            <li key={d.id} className="flex items-center gap-2.5 px-3 py-1.5 text-sm">
              <span className="w-[150px] shrink-0 font-semibold">{d.type}</span>
              <a href={vendorDocumentUrl(vendor!.id, d.id)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-ink underline-offset-2 hover:underline">
                {d.name}
              </a>
              <span className="text-caption text-faint">{kb(d.sizeBytes)}</span>
              <button
                type="button"
                aria-label={`Remove ${d.name}`}
                className="rounded p-0.5 text-faint hover:text-primary"
                onClick={() =>
                  remove.mutate(
                    { id: vendor!.id, docId: d.id },
                    { onSuccess: (v) => setExisting(v.documents), onError: (err) => toast({ tone: 'error', title: 'Couldn’t remove the document', description: errorMessage(err) }) },
                  )
                }
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
          {pending.map((d, i) => (
            <li key={`p${i}`} className="flex items-center gap-2.5 px-3 py-1.5 text-sm">
              <span className="w-[150px] shrink-0 font-semibold">{d.type}</span>
              <span className="min-w-0 flex-1 truncate">{d.file.name}</span>
              <span className="text-caption text-amber">Uploads on save</span>
              <button type="button" aria-label={`Remove ${d.file.name}`} className="rounded p-0.5 text-faint hover:text-primary" onClick={() => onChange(pending.filter((_, j) => j !== i))}>
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No documents yet: attach the GSTIN certificate, bank details or cancelled cheque, Udyam certificate…</p>
      )}
    </div>
  );
}

/**
 * Add / edit vendor (legacy buildVModal + saveV). A new vendor is either submitted for review (pending)
 * or saved inactive; an edit never changes the status.
 */
export function VendorForm({ open, vendor, onClose, onSaved }: { open: boolean; vendor: VendorView | null; onClose: () => void; onSaved: (v: VendorView) => void }) {
  const toast = useToast();
  const save = useSaveVendor();
  const upload = useUploadVendorDocuments();
  const nextCode = useNextVendorCode(open && !vendor);
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [ifscHint, setIfscHint] = useState<{ ok: boolean; text: string } | null>(null);
  const categories = useVendorCategories().data ?? [];
  const states = useStates().data ?? [];
  const cities = useCityOptions().data ?? [];
  const cityList = useId();
  const [f, setF] = useState<Form>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pinHint, setPinHint] = useState<{ ok: boolean; text: string } | null>(null);
  const [duplicate, setDuplicate] = useState<{ details: DuplicateVendorDetails; status?: VendorCreateStatus } | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setPinHint(null);
    setIfscHint(null);
    setDocs([]);
    setDuplicate(null);
    setF(vendor ? fromVendor(vendor) : empty());
  }, [open, vendor]);

  const set = (k: TextField) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  // Inactive categories stay visible when already assigned, so editing doesn't silently drop them.
  const shownCategories = categories.filter((c) => c.status === 'active' || f.categoryIds.includes(c.id));

  async function onPincode(raw: string) {
    const pin = raw.replace(/\D/g, '').slice(0, 6);
    set('pincode')(pin);
    if (pin.length !== 6) return setPinHint(null);
    try {
      const m = await lookupPincode(pin);
      setF((x) => ({ ...x, city: m.city, state: m.state }));
      setPinHint({ ok: true, text: `${m.city}, ${m.state}` });
    } catch {
      setPinHint({ ok: false, text: 'Not in the city master. Enter the city and state.' });
    }
  }

  async function onIfsc(raw: string) {
    const ifsc = raw.toUpperCase().replace(/\s/g, '').slice(0, 11);
    set('ifsc')(ifsc);
    if (ifsc.length !== 11) return setIfscHint(null);
    setIfscHint({ ok: true, text: 'Looking up…' });
    const m = await lookupIfsc(ifsc);
    if (!m) return setIfscHint({ ok: false, text: 'IFSC not found. Enter the bank and branch.' });
    setF((x) => (x.ifsc === ifsc ? { ...x, bank: m.bank, branch: m.branch } : x));
    setIfscHint({ ok: true, text: `${m.bank}, ${m.branch}` });
  }

  function onCity(city: string) {
    // Picking a known city fills its state (legacy selCity).
    const match = cities.filter((c) => c.city.toLowerCase() === city.trim().toLowerCase() && c.state);
    setF((x) => ({ ...x, city, state: match.length === 1 ? match[0]!.state! : x.state }));
  }

  async function submit(status?: VendorCreateStatus, force = false) {
    const local: Record<string, string> = {};
    if (!f.name.trim()) local.name = 'Vendor name is required';
    if (!f.categoryIds.length) local.categoryIds = 'Select at least one category';
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    const input = {
      ...Object.fromEntries(TEXT_FIELDS.filter((k) => k !== 'code').map((k) => [k, f[k].trim() === '' ? null : f[k].trim()])),
      categoryIds: f.categoryIds,
      productIds: f.productIds,
      rating: f.rating,
    } as unknown as VendorInput;
    try {
      let saved = await save.mutateAsync({ id: vendor?.id, input, status, force });
      for (const type of VENDOR_DOC_TYPES) {
        const files = docs.filter((d) => d.type === type).map((d) => d.file);
        if (!files.length) continue;
        try {
          saved = await upload.mutateAsync({ id: saved.id, type, files });
        } catch (err) {
          toast({ tone: 'error', title: `${type} didn’t upload`, description: `${errorMessage(err)} Open the vendor and attach it again.` });
        }
      }
      toast({
        tone: 'success',
        title: vendor ? `${saved.name} updated` : `${saved.name} added`,
        description: vendor ? undefined : status === 'inactive' ? `${saved.code}, saved inactive` : `${saved.code}, waiting for approval`,
      });
      onSaved(saved);
    } catch (err) {
      const dup = duplicateVendorOf(err);
      if (dup) return setDuplicate({ details: dup, status });
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save the vendor', description: errorMessage(err) });
    }
  }

  const busy = save.isPending || upload.isPending;
  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        closeOnBackdrop={false}
        title={vendor ? `Edit ${vendor.name}` : 'Add vendor'}
        description={vendor ? `${vendor.code} · status doesn’t change here` : 'Register a new supplier.'}
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            {vendor ? (
              <Button variant="primary" type="submit" form="vendor-form" loading={busy}>
                Save changes
              </Button>
            ) : (
              <>
                <Button loading={busy} onClick={() => void submit('inactive')}>
                  Save inactive
                </Button>
                <Button variant="primary" type="submit" form="vendor-form" loading={busy}>
                  Submit for review
                </Button>
              </>
            )}
          </>
        }
      >
        <form
          id="vendor-form"
          noValidate
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void submit(vendor ? undefined : 'pending');
          }}
        >
          <Section title="Basic info">
            <Input label="Vendor name" value={f.name} onChange={(e) => set('name')(e.target.value)} error={errors.name} containerClassName="sm:col-span-2" />
            <Input label="Code" readOnly value={vendor ? f.code : (nextCode.data?.code ?? '')} placeholder="Assigned automatically" hint={vendor ? undefined : 'Assigned automatically on save'} className="font-mono" />
            <Select label="Type" placeholder="Select type" options={VENDOR_TYPES.map((t) => ({ value: t, label: t }))} value={f.type} onChange={(e) => set('type')(e.target.value)} />
            <Input label="Year established" inputMode="numeric" placeholder="e.g. 2008" maxLength={4} value={f.yearEstablished} onChange={(e) => set('yearEstablished')(e.target.value.replace(/\D/g, ''))} error={errors.yearEstablished} />
          </Section>

          <Section title="Categories">
            <div className="col-span-full flex flex-col gap-1.5">
              <div role="group" aria-label="Categories" className="flex flex-wrap gap-2">
                {shownCategories.map((c) => {
                  const on = f.categoryIds.includes(c.id);
                  const s = CATEGORY_STYLE[c.color];
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setF((x) => ({ ...x, categoryIds: on ? x.categoryIds.filter((id) => id !== c.id) : [...x.categoryIds, c.id] }))}
                      className={clsx('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors', on ? 'border-transparent' : 'border-border bg-card text-muted hover:text-ink')}
                      style={on ? { background: s.bg, color: s.fg } : undefined}
                    >
                      {on ? <Check size={13} strokeWidth={2.4} aria-hidden /> : c.icon && <span aria-hidden>{c.icon}</span>}
                      {c.name}
                    </button>
                  );
                })}
              </div>
              {errors.categoryIds && <p className="text-meta text-primary">{errors.categoryIds}</p>}
            </div>
            <ProductPicker value={f.productIds} onChange={(productIds) => setF((x) => ({ ...x, productIds }))} categoryIds={f.categoryIds} />
          </Section>

          <Section title="Contact">
            <Input label="Contact person" value={f.contact} onChange={(e) => set('contact')(e.target.value)} />
            <Input label="Designation" value={f.designation} onChange={(e) => set('designation')(e.target.value)} />
            <Input label="Phone" inputMode="tel" value={f.phone} onChange={(e) => set('phone')(e.target.value)} error={errors.phone} />
            <Input label="Email" type="email" value={f.email} onChange={(e) => set('email')(e.target.value)} error={errors.email} />
            <Textarea label="Address" rows={2} value={f.address} onChange={(e) => set('address')(e.target.value)} containerClassName="sm:col-span-2" />
            <Input
              label="Pincode"
              inputMode="numeric"
              maxLength={6}
              placeholder="Fills city and state"
              value={f.pincode}
              onChange={(e) => void onPincode(e.target.value)}
              error={errors.pincode}
              hint={pinHint && <span className={pinHint.ok ? 'text-green' : 'text-amber'}>{pinHint.ok ? `✓ ${pinHint.text}` : pinHint.text}</span>}
            />
            <div>
              <Input label="City" list={cityList} placeholder="Type or pick" value={f.city} onChange={(e) => onCity(e.target.value)} />
              <datalist id={cityList}>
                {cities.map((c) => (
                  <option key={`${c.city}|${c.state}`} value={c.city}>
                    {c.state ?? ''}
                  </option>
                ))}
              </datalist>
            </div>
            <Select label="State" placeholder="Select state" options={states.map((s) => ({ value: s.name, label: s.name }))} value={f.state} onChange={(e) => set('state')(e.target.value)} />
            <Input label="Website" placeholder="https://…" value={f.website} onChange={(e) => set('website')(e.target.value)} error={errors.website} />
          </Section>

          <Section title="Finance">
            <Input label="GSTIN" placeholder="24AAAAA0000A1Z5" maxLength={15} value={f.gst} onChange={(e) => set('gst')(e.target.value.toUpperCase())} error={errors.gst} />
            <Input label="PAN" placeholder="AAAAA0000A" maxLength={10} value={f.pan} onChange={(e) => set('pan')(e.target.value.toUpperCase())} error={errors.pan} />
            <Input label="MSME / Udyam" placeholder="UDYAM-GJ-00-…" value={f.msme} onChange={(e) => set('msme')(e.target.value)} />
            <Select label="Payment terms" placeholder="Select terms" options={PAYMENT_TERMS.map((t) => ({ value: t, label: t }))} value={f.paymentTerms} onChange={(e) => set('paymentTerms')(e.target.value)} />
            <Input label="Account number" inputMode="numeric" value={f.accountNo} onChange={(e) => set('accountNo')(e.target.value.replace(/\s/g, ''))} error={errors.accountNo} />
            <Input
              label="IFSC"
              placeholder="SBIN0001234"
              maxLength={11}
              value={f.ifsc}
              onChange={(e) => void onIfsc(e.target.value)}
              error={errors.ifsc}
              hint={ifscHint ? <span className={ifscHint.ok ? 'text-green' : 'text-amber'}>{ifscHint.text}</span> : 'Fills the bank and branch'}
            />
            <Input label="Bank" value={f.bank} onChange={(e) => set('bank')(e.target.value)} />
            <Input label="Branch" value={f.branch} onChange={(e) => set('branch')(e.target.value)} />
          </Section>

          <Section title="Documents">
            <DocumentsPicker vendor={vendor} pending={docs} onChange={setDocs} />
          </Section>

          <Section title="Rating & notes">
            <StarInput value={f.rating} onChange={(rating) => setF((x) => ({ ...x, rating }))} />
            <Textarea label="Notes" rows={2} value={f.notes} onChange={(e) => set('notes')(e.target.value)} containerClassName="sm:col-span-2" />
          </Section>
        </form>
      </Modal>
      <ConfirmDialog
        open={!!duplicate}
        title="A vendor with this name already exists"
        confirmLabel="Save anyway"
        busy={busy}
        onClose={() => setDuplicate(null)}
        onConfirm={() => {
          const d = duplicate;
          setDuplicate(null);
          void submit(d?.status, true);
        }}
      >
        {duplicate?.details.similar.map((s) => (
          <p key={s.id}>
            <strong className="text-ink">{s.name}</strong> · {s.code}
            {s.city ? ` · ${s.city}` : ''}
          </p>
        ))}
        <p className="mt-2">Save this one as a separate vendor anyway?</p>
      </ConfirmDialog>
    </>
  );
}
