import { Save } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { CompanySettings } from '@contracts/sampletrack';
import { useSession } from '@/app/session';
import { Button, Card, Input, Skeleton, useToast } from '@/components/ui';
import { useCompanySettings, useUpdateCompanySettings } from '../samples/api';
import { errorMessage, fieldErrors } from '../samples/ui/errors';
import { PageHeader } from '../samples/ui/PageHeader';

type Form = Record<keyof CompanySettings, string>;
const toForm = (c: CompanySettings): Form => ({ name: c.name, llpin: c.llpin ?? '', city: c.city ?? '', phone: c.phone ?? '', gst: c.gst ?? '' });

/** Company details printed on slips, labels and reports, and used in WhatsApp messages (legacy saveCompanySettings). */
export function CompanySettingsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const company = useCompanySettings();
  const update = useUpdateCompanySettings();
  const [f, setF] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (company.data) setF(toForm(company.data));
  }, [company.data]);
  const canEdit = canDo('edit');
  const saved = company.data ? toForm(company.data) : null;
  const changed = f && saved ? (Object.keys(f) as (keyof Form)[]).filter((k) => f[k].trim() !== saved[k]) : [];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!f) return;
    if (!f.name.trim()) {
      setErrors({ name: 'Company name is required' });
      return;
    }
    setErrors({});
    try {
      await update.mutateAsync(Object.fromEntries(changed.map((k) => [k, f[k].trim() || null])));
      toast({ tone: 'success', title: 'Company details saved' });
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }
  const set = (k: keyof Form) => (v: string) => setF((x) => (x ? { ...x, [k]: v } : x));

  return (
    <div className="flex max-w-3xl flex-col gap-3.5 p-6">
      <PageHeader title="Company settings" description="Shown on request slips, courier labels, printed reports and shared messages." />
      <Card>
        {!f ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <form noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
            <Input label="Company name" value={f.name} onChange={(e) => set('name')(e.target.value)} error={errors.name} disabled={!canEdit} containerClassName="sm:col-span-2" />
            <Input label="LLPIN / CIN" value={f.llpin} onChange={(e) => set('llpin')(e.target.value)} error={errors.llpin} disabled={!canEdit} />
            <Input label="GSTIN" placeholder="24ABCDE1234F1Z5" autoCapitalize="characters" value={f.gst} onChange={(e) => set('gst')(e.target.value.toUpperCase())} error={errors.gst} disabled={!canEdit} />
            <Input label="City / State" placeholder="Wankaner, Morbi, Gujarat" value={f.city} onChange={(e) => set('city')(e.target.value)} error={errors.city} disabled={!canEdit} />
            <Input label="Phone" value={f.phone} onChange={(e) => set('phone')(e.target.value)} error={errors.phone} disabled={!canEdit} />
            {canEdit && (
              <div className="flex justify-end gap-2 sm:col-span-2">
                {changed.length > 0 && (
                  <Button type="button" onClick={() => saved && setF(saved)}>
                    Discard
                  </Button>
                )}
                <Button variant="primary" type="submit" icon={Save} disabled={changed.length === 0} loading={update.isPending}>
                  Save
                </Button>
              </div>
            )}
          </form>
        )}
      </Card>
    </div>
  );
}
