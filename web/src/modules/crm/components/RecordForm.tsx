import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Combo, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useCrmMeta, useSaveRecord, type CrmKind, type CrmViews } from '../api';
import { rupeesText, toPaise } from '../ui';

/**
 * One field of a record form (legacy openModal field defs). `money` is typed in rupees and sent as paise;
 * `customer` is a searchable CRM customer picker; `list` options come from a CRM master by name.
 */
export interface FieldDef {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'date' | 'time' | 'number' | 'money' | 'select' | 'customer' | 'checkbox' | 'section';
  options?: readonly string[] | 'sources' | 'lostReasons' | 'products' | 'salespersons' | 'campaigns';
  /** Option shown for "none". */
  placeholder?: string;
  required?: boolean;
  wide?: boolean;
  hint?: string;
  /** Uppercase as typed (GSTIN, PAN). */
  upper?: boolean;
}

type Values = Record<string, string | boolean>;

const toText = (f: FieldDef, v: unknown): string | boolean => {
  if (f.type === 'checkbox') return v === undefined ? true : !!v;
  if (f.type === 'money') return rupeesText(v as number | null);
  return v === null || v === undefined ? '' : String(v);
};
const fromText = (f: FieldDef, v: string | boolean): unknown => {
  if (f.type === 'checkbox') return v;
  const s = String(v).trim();
  if (f.type === 'money') return s ? toPaise(s) : f.required ? 0 : null;
  if (f.type === 'number') return s === '' ? undefined : Number(s);
  return s === '' ? null : s;
};

/**
 * A modal form for one CRM record kind, built from field definitions. Saves with POST / PATCH and shows the
 * API's field errors next to the fields. `initial` fills a new record (e.g. the customer when opened from one).
 */
export function RecordForm<K extends CrmKind>({
  kind,
  open,
  record,
  title,
  fields,
  initial,
  extra,
  onClose,
  onSaved,
  submitLabel = 'Save',
  size = 'lg',
  submit,
}: {
  kind: K;
  open: boolean;
  record: CrmViews[K] | null;
  title: string;
  fields: FieldDef[];
  initial?: Record<string, unknown>;
  /** Shown under the fields (e.g. a duplicate warning or a total). */
  extra?: (values: Values) => ReactNode;
  onClose: () => void;
  onSaved?: (r: CrmViews[K]) => void;
  submitLabel?: string;
  size?: 'md' | 'lg' | 'xl';
  /** Send somewhere other than the kind's POST / PATCH (e.g. mark an opportunity won). */
  submit?: (input: Record<string, unknown>) => Promise<unknown>;
}) {
  const toast = useToast();
  const meta = useCrmMeta().data;
  const save = useSaveRecord(kind);
  const [v, setV] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const inputs = fields.filter((f) => f.type !== 'section');

  useEffect(() => {
    if (!open) return;
    setErrors({});
    const src = (record ?? initial ?? {}) as Record<string, unknown>;
    setV(Object.fromEntries(inputs.map((f) => [f.key, toText(f, src[f.key])])));
    // Only on open.
  }, [open, record]);

  const customers = useMemo(() => (meta?.customers ?? []).map((c) => ({ id: c.id, label: c.name, hint: c.city })), [meta?.customers]);
  const optionsOf = (f: FieldDef): string[] => {
    const o = f.options;
    if (!o) return [];
    if (typeof o === 'string') return meta ? meta[o] : [];
    return [...o];
  };
  const set = (k: string, x: string | boolean) => {
    setV((p) => ({ ...p, [k]: x }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    for (const f of inputs) if (f.required && f.type !== 'checkbox' && !String(v[f.key] ?? '').trim()) local[f.key] = `${f.label} is required`;
    if (Object.keys(local).length) return setErrors(local);
    const input = Object.fromEntries(inputs.map((f) => [f.key, fromText(f, v[f.key] ?? '')]).filter(([, x]) => x !== undefined));
    setBusy(true);
    try {
      if (submit) await submit(input);
      else {
        // Not onSaved?.(await …): an optional call skips evaluating its argument when onSaved is missing.
        const saved = await save.mutateAsync({ id: (record as { id?: string } | null)?.id, input });
        onSaved?.(saved);
      }
      toast({ tone: 'success', title: submit ? `${title}: done` : `${title.replace(/^(Add|New|Edit)\s+/, '')} saved` });
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const id = `crm-form-${kind}`;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size={size}
      closeOnBackdrop={false}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={id} loading={save.isPending || busy}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={id} noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
        {fields.map((f) => {
          const span = f.wide ? 'sm:col-span-3' : '';
          const label = f.required ? `${f.label} *` : f.label;
          const val = v[f.key];
          const err = errors[f.key];
          switch (f.type) {
            case 'section':
              return (
                <h3 key={f.key} className="mt-2 text-label font-semibold uppercase tracking-label text-faint sm:col-span-3">
                  {f.label}
                </h3>
              );
            case 'textarea':
              return <Textarea key={f.key} label={label} rows={2} value={String(val ?? '')} onChange={(e) => set(f.key, e.target.value)} error={err} hint={f.hint} containerClassName="sm:col-span-3" />;
            case 'select': {
              const opts = optionsOf(f);
              const cur = String(val ?? '');
              return (
                <Select
                  key={f.key}
                  label={label}
                  placeholder={f.required ? undefined : (f.placeholder ?? '—')}
                  options={[...new Set([...opts, ...(cur ? [cur] : [])])].map((o) => ({ value: o, label: o }))}
                  value={cur}
                  onChange={(e) => set(f.key, e.target.value)}
                  error={err}
                  hint={f.hint}
                  containerClassName={span}
                />
              );
            }
            case 'customer':
              return (
                <div key={f.key} className="sm:col-span-2">
                  <Combo label={label} value={String(val ?? '') || null} options={customers} onChange={(x) => set(f.key, x ?? '')} error={err} placeholder="Search customer" />
                </div>
              );
            case 'checkbox':
              return (
                <label key={f.key} className="flex items-center gap-2 self-end pb-2 text-base">
                  <input type="checkbox" checked={!!val} onChange={(e) => set(f.key, e.target.checked)} /> {f.label}
                </label>
              );
            default:
              return (
                <Input
                  key={f.key}
                  label={f.type === 'money' ? `${label} (₹)` : label}
                  type={f.type === 'date' || f.type === 'time' ? f.type : 'text'}
                  inputMode={f.type === 'number' || f.type === 'money' ? 'decimal' : undefined}
                  value={String(val ?? '')}
                  onChange={(e) => set(f.key, f.upper ? e.target.value.toUpperCase() : e.target.value)}
                  error={err}
                  hint={f.hint}
                  containerClassName={span}
                />
              );
          }
        })}
        {extra && <div className="sm:col-span-3">{extra(v)}</div>}
      </form>
    </Modal>
  );
}
