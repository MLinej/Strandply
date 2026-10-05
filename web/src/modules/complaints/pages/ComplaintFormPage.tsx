import { CheckCircle2, ImagePlus, Mail, Printer, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { CP_CATEGORIES, CP_MATERIALS, CP_PRIORITIES, MAX_COMPLAINT_PHOTOS, type ComplaintView } from '@contracts/complaints';
import { useSession } from '@/app/session';
import { Button, Card, Combo, EmptyState, Input, Select, Skeleton, Textarea, useToast } from '@/components/ui';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { useAddPhotos, useComplaint, useComplaintsMeta, usePartyInvoices, useSaveComplaint } from '../api';
import { printComplaint } from '../print';
import { d, mailtoLink } from '../ui';

type Values = Record<string, string>;
const OTHER = '__other__';

/** After registering: email the recipient and print the report (legacy downloaded the PDF and opened mailto). */
function Registered({ c, onAnother }: { c: ComplaintView; onAnother: () => void }) {
  const navigate = useNavigate();
  const { canDo } = useSession();
  return (
    <div className="flex max-w-3xl flex-col gap-3.5 p-6">
      <Card>
        <div className="flex flex-col items-start gap-3" role="status">
          <span className="flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="text-green" aria-hidden /> {c.complaintNo} registered
          </span>
          <p className="text-sm text-muted">
            {c.customerName} · {c.category} · {c.priority}. Notify {c.recipientName}
            {c.recipientEmail ? ` (${c.recipientEmail})` : ''}: print the report as a PDF and attach it to the email.
          </p>
          <div className="flex flex-wrap gap-2">
            {canDo('print') && (
              <Button icon={Printer} onClick={() => void printComplaint(c.id)}>
                Print report
              </Button>
            )}
            {c.recipientEmail && (
              <a href={mailtoLink(c)} className="inline-flex h-ctl items-center gap-1.5 rounded-md border border-border bg-card px-3.5 text-base font-medium hover:bg-page">
                <Mail size={15} aria-hidden /> Email {c.recipientName}
              </a>
            )}
            <Button onClick={() => navigate(`/complaints/register?open=${c.id}`)}>Open in register</Button>
            <Button variant="primary" onClick={onAnother}>
              Register another
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/** New / edit complaint (legacy New Complaint page): customer, complaint, photo evidence, who to notify. */
export function ComplaintFormPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const url = useUrlState(['edit'] as const);
  const editId = url.values.edit || null;
  const editing = useComplaint(editId);
  const meta = useComplaintsMeta().data;
  const save = useSaveComplaint();
  const addPhotos = useAddPhotos();
  const [v, setV] = useState<Values>({});
  const [newParty, setNewParty] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<ComplaintView | null>(null);
  const existing = editing.data;

  const reset = () => {
    setV({ date: meta?.today ?? '', salesman: '', customerId: '', customerName: '', customerPhone: '', customerLocation: '', invoiceId: '', material: '', category: '', priority: 'Medium', description: '', recipientId: '', recipientEmail: '' });
    setNewParty(false);
    setPhotos([]);
    setErrors({});
  };
  useEffect(() => {
    if (!meta) return;
    if (!editId) return reset();
    const c = existing;
    if (!c) return;
    const recipient = meta.recipients.find((r) => r.name === c.recipientName && r.email === c.recipientEmail);
    setV({
      date: c.date, salesman: c.salesman, customerId: c.customerId ?? '', customerName: c.customerName, customerPhone: c.customerPhone ?? '', customerLocation: c.customerLocation ?? '', invoiceId: c.invoiceId ?? '',
      material: c.material, category: c.category, priority: c.priority, description: c.description, recipientId: recipient?.id ?? OTHER, recipientEmail: recipient ? '' : (c.recipientEmail ?? ''),
    });
    setNewParty(!c.customerId && !meta.parties.some((p) => p.name === c.customerName));
    setPhotos([]);
  }, [meta, editId, existing?.id]);

  const parties = useMemo(() => (meta?.parties ?? []).map((p) => ({ id: p.id ?? `name:${p.name}`, label: p.name, hint: p.city })), [meta?.parties]);
  const invoices = usePartyInvoices(v.customerId || null).data ?? [];
  const set = (k: string) => (e: { target: { value: string } }) => {
    setV((x) => ({ ...x, [k]: e.target.value }));
    if (errors[k]) setErrors(({ [k]: _, ...rest }) => rest);
  };
  const pickParty = (id: string | null) => {
    if (errors.customerName) setErrors(({ customerName: _, ...rest }) => rest);
    const p = meta?.parties.find((x) => (x.id ?? `name:${x.name}`) === id);
    setV((x) => ({ ...x, customerId: p?.id ?? '', customerName: p?.name ?? '', customerPhone: x.customerPhone || p?.phone || '', customerLocation: x.customerLocation || p?.city || '', invoiceId: '' }));
  };
  const room = MAX_COMPLAINT_PHOTOS - (existing?.photos.length ?? 0) - photos.length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input = {
      date: v.date || null,
      salesman: v.salesman,
      customerId: v.customerId || null,
      customerName: v.customerName,
      customerPhone: v.customerPhone || null,
      customerLocation: v.customerLocation || null,
      invoiceId: v.invoiceId || null,
      material: v.material || undefined,
      category: v.category || undefined,
      priority: v.priority,
      description: v.description,
      recipientId: v.recipientId && v.recipientId !== OTHER ? v.recipientId : null,
      recipientEmail: v.recipientId === OTHER ? v.recipientEmail || null : null,
    };
    try {
      let c = await save.mutateAsync({ id: editId, input });
      if (photos.length) c = await addPhotos.mutateAsync({ id: c.id, files: photos });
      setErrors({});
      if (editId) {
        toast({ tone: 'success', title: `${c.complaintNo} updated` });
        navigate(`/complaints/register?open=${c.id}`);
      } else setDone(c);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }

  if (done)
    return (
      <Registered
        c={done}
        onAnother={() => {
          setDone(null);
          reset();
        }}
      />
    );
  if (!meta || (editId && !existing)) return editing.error ? <EmptyState title="Complaint not found" /> : <Skeleton className="m-6 h-96" />;
  return (
    <div className="flex max-w-5xl flex-col gap-3.5 p-6">
      <PageHeader title={existing ? `Edit complaint ${existing.complaintNo}` : 'New complaint'} description={existing ? 'Changes are recorded on the case timeline.' : 'Raise a customer complaint. It gets the next CMP number for the financial year of its date.'} />
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3.5" aria-label="Complaint">
        <Card title="Customer">
          <div className="grid grid-cols-2 items-start gap-3 md:grid-cols-4">
            <Input label="Date" type="date" value={v.date ?? ''} max={meta.today} onChange={set('date')} error={errors.date} />
            <Input label="Salesman" value={v.salesman ?? ''} onChange={set('salesman')} error={errors.salesman} list="cp-salesmen" placeholder="Your name" />
            <datalist id="cp-salesmen">
              {meta.salesmen.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <div className="col-span-2">
              {newParty ? (
                <Input label="Customer (new party)" value={v.customerName ?? ''} onChange={(e) => setV((x) => ({ ...x, customerName: e.target.value, customerId: '', invoiceId: '' }))} error={errors.customerName} />
              ) : (
                <Combo label="Customer" value={v.customerId || (v.customerName ? `name:${v.customerName}` : null)} options={parties} onChange={pickParty} error={errors.customerName ?? errors.customerId} placeholder="Search the party master" />
              )}
              <button type="button" className="mt-1 text-caption font-medium text-primary hover:underline" onClick={() => setNewParty((x) => !x)}>
                {newParty ? 'Pick from the party master' : '+ Type a new party name'}
              </button>
            </div>
            <Input label="Contact no." inputMode="tel" value={v.customerPhone ?? ''} onChange={set('customerPhone')} error={errors.customerPhone} />
            <Input label="Location / city" value={v.customerLocation ?? ''} onChange={set('customerLocation')} error={errors.customerLocation} />
            {v.customerId && (
              <div className="col-span-2">
                <Select label="Invoice (optional)" placeholder="Not about one invoice" options={invoices.map((i) => ({ value: i.id, label: `${i.invNo} · ${d(i.date)}` }))} value={v.invoiceId ?? ''} onChange={set('invoiceId')} error={errors.invoiceId} />
              </div>
            )}
          </div>
        </Card>
        <Card title="Complaint">
          <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-3">
            <Select label="Material / product" placeholder="Select material" options={CP_MATERIALS.map((x) => ({ value: x, label: x }))} value={v.material ?? ''} onChange={set('material')} error={errors.material} />
            <Select label="Category" placeholder="Select category" options={CP_CATEGORIES.map((x) => ({ value: x, label: x }))} value={v.category ?? ''} onChange={set('category')} error={errors.category} />
            <Select label="Priority" options={CP_PRIORITIES.map((x) => ({ value: x, label: x }))} value={v.priority ?? 'Medium'} onChange={set('priority')} />
            <div className="md:col-span-3">
              <Textarea label="Description" rows={4} value={v.description ?? ''} onChange={set('description')} error={errors.description} placeholder="What the customer reported: quantity, lot, what is wrong" />
            </div>
          </div>
        </Card>
        <Card title="Photo evidence" description={`Up to ${MAX_COMPLAINT_PHOTOS} photos (JPG, PNG or WebP, 5 MB each).`}>
          <div className="flex flex-wrap items-center gap-2" aria-label="Photos">
            {existing?.photos.map((p) => (
              <span key={p.id} className="rounded-md border border-border px-2 py-1 text-caption text-muted">
                {p.name}
              </span>
            ))}
            {photos.map((f, i) => (
              <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-md border border-border bg-page px-2 py-1 text-caption">
                {f.name}
                <button type="button" aria-label={`Remove ${f.name}`} className="text-faint hover:text-primary" onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}>
                  <X size={12} aria-hidden />
                </button>
              </span>
            ))}
            {room > 0 && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-sm font-medium hover:bg-page">
                <ImagePlus size={15} aria-hidden /> Add photos
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" aria-label="Add photos" onChange={(e) => setPhotos((ps) => [...ps, ...Array.from(e.target.files ?? [])].slice(0, MAX_COMPLAINT_PHOTOS - (existing?.photos.length ?? 0)))} />
              </label>
            )}
          </div>
        </Card>
        <Card title="Notify">
          <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
            <Select
              label="Recipient"
              placeholder="Select recipient"
              options={[...meta.recipients.map((r) => ({ value: r.id, label: `${r.name}${r.role ? ` — ${r.role}` : ''}${r.email ? '' : ' (no email)'}` })), { value: OTHER, label: 'Other (enter email)' }]}
              value={v.recipientId ?? ''}
              onChange={set('recipientId')}
              error={errors.recipientId}
            />
            {v.recipientId === OTHER && <Input label="Email address" type="email" value={v.recipientEmail ?? ''} onChange={set('recipientEmail')} error={errors.recipientEmail} />}
          </div>
        </Card>
        <div className="flex justify-end gap-2">
          {existing && <Button onClick={() => navigate(`/complaints/register?open=${existing.id}`)}>Cancel</Button>}
          <Button variant="primary" type="submit" loading={save.isPending || addPhotos.isPending}>
            {existing ? 'Save changes' : 'Register complaint'}
          </Button>
        </div>
      </form>
    </div>
  );
}
