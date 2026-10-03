import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EMAIL_DOC_LABEL, EMAIL_DOCS, EMAIL_TOKENS, FIRM_LABEL, type EmailDoc } from '@contracts/sales';
import { useSession } from '@/app/session';
import { Button, Card, Input, Skeleton, Textarea, useToast } from '@/components/ui';
import { errorMessage } from '../../samples/ui/errors';
import { PageHeader } from '../../samples/ui/PageHeader';
import { useSalesMeta, useSaveSalesSettings, type SettingsPatch } from '../api';

/** A dropdown master edited as chips (legacy renderDropdownManager). */
function ListMaster({ title, hint, items, onSave, editable, canEmpty }: { title: string; hint: string; items: string[]; onSave: (next: string[]) => Promise<void>; editable: boolean; canEmpty?: boolean }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  async function add() {
    const v = value.trim();
    if (!v) return;
    if (items.some((x) => x.toLowerCase() === v.toLowerCase())) return setError('Already in the list');
    await onSave([...items, v]);
    setValue('');
    setError(undefined);
  }
  return (
    <Card title={title} description={hint}>
      <div className="mb-3 flex flex-wrap gap-1.5" aria-label={title}>
        {items.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full border border-border bg-page px-2.5 py-0.5 text-sm">
            {t}
            {editable && (canEmpty || items.length > 1) && (
              <button type="button" aria-label={`Remove ${t}`} className="text-faint hover:text-primary" onClick={() => void onSave(items.filter((x) => x !== t))}>
                <X size={12} aria-hidden />
              </button>
            )}
          </span>
        ))}
        {!items.length && <span className="text-sm text-muted">None yet</span>}
      </div>
      {editable && (
        <form
          className="flex items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input aria-label={`New ${title.toLowerCase()}`} value={value} onChange={(e) => setValue(e.target.value)} error={error} containerClassName="flex-1" />
          <Button type="submit" icon={Plus}>
            Add
          </Button>
        </form>
      )}
    </Card>
  );
}

/** Recipients and template for one document's Email button. */
function EmailCard({ doc, to, subject, body, editable, onSave }: { doc: EmailDoc; to: string[]; subject: string; body: string; editable: boolean; onSave: (p: SettingsPatch) => Promise<void> }) {
  const [f, setF] = useState({ to: to.join(', '), subject, body });
  useEffect(() => setF({ to: to.join(', '), subject, body }), [to.join(','), subject, body]);
  return (
    <Card title={`${EMAIL_DOC_LABEL[doc]} email`} description={`Tokens: ${EMAIL_TOKENS[doc].map((t) => `{{${t}}}`).join(' ')}`}>
      <div className="flex flex-col gap-3">
        <Input label="Default recipients" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} hint="Separate with commas" disabled={!editable} />
        <Input label="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} disabled={!editable} />
        <Textarea label="Body" rows={8} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} disabled={!editable} />
        {editable && (
          <Button
            className="self-end"
            onClick={() =>
              void onSave({
                emailRecipients: { [doc]: f.to.split(',').map((s) => s.trim()).filter(Boolean) },
                emailTemplates: { [doc]: { subject: f.subject, body: f.body } },
              })
            }
          >
            Save {EMAIL_DOC_LABEL[doc].toLowerCase()} email
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Sales settings (legacy Settings: dropdown masters, brands, email recipients and templates; plus grades and firm GST states). */
export function SettingsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const meta = useSalesMeta().data;
  const save = useSaveSalesSettings();
  const [codes, setCodes] = useState({ llp: '', osb: '' });
  useEffect(() => {
    if (meta) setCodes(meta.settings.firmStateCodes);
  }, [meta?.settings.firmStateCodes.llp, meta?.settings.firmStateCodes.osb]);
  const editable = canDo('edit');
  const run = async (input: SettingsPatch) => {
    try {
      await save.mutateAsync(input);
      toast({ tone: 'success', title: 'Settings saved' });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  };
  if (!meta) return <Skeleton className="m-6 h-96" />;
  const s = meta.settings;
  return (
    <div className="flex max-w-5xl flex-col gap-3.5 p-6">
      <PageHeader title="Sales settings" description="Dropdown lists, brands and grades, each firm’s GST state, and the email templates. Common to both firms." />
      <div className="grid gap-3.5 lg:grid-cols-2">
        <ListMaster title="Payment terms" hint="Order and proforma dropdown." items={s.paymentTerms} onSave={(paymentTerms) => run({ paymentTerms })} editable={editable} />
        <ListMaster title="Delivery terms" hint="Order and proforma dropdown." items={s.deliveryTerms} onSave={(deliveryTerms) => run({ deliveryTerms })} editable={editable} />
        <ListMaster title="Sales persons" hint="Who handles the order." items={s.salesPersons} onSave={(salesPersons) => run({ salesPersons })} editable={editable} canEmpty />
        <ListMaster title="Brands" hint="Item master and order lines." items={s.brands} onSave={(brands) => run({ brands })} editable={editable} />
        <ListMaster title="Grades" hint="Item master and FG inventory." items={s.grades} onSave={(grades) => run({ grades })} editable={editable} />
        <Card title="Firm GST states" description="A party whose GSTIN starts with the firm’s state code is billed SG+CG; others IGST.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={`${FIRM_LABEL.llp} state code`} value={codes.llp} onChange={(e) => setCodes({ ...codes, llp: e.target.value })} disabled={!editable} hint="Gujarat = 24" />
            <Input label={`${FIRM_LABEL.osb} state code`} value={codes.osb} onChange={(e) => setCodes({ ...codes, osb: e.target.value })} disabled={!editable} hint="Maharashtra = 27" />
          </div>
          {editable && (
            <Button className="mt-3" onClick={() => void run({ firmStateCodes: codes })}>
              Save state codes
            </Button>
          )}
        </Card>
      </div>
      {EMAIL_DOCS.map((d) => (
        <EmailCard key={d} doc={d} to={s.emailRecipients[d]} subject={s.emailTemplates[d].subject} body={s.emailTemplates[d].body} editable={editable} onSave={run} />
      ))}
    </div>
  );
}
