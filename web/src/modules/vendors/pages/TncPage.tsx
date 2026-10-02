import { clsx } from 'clsx';
import { FileText, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { TNC_APPLIES, TNC_CATEGORIES, type MasterStatus, type TncApplies, type TncCategory, type TncClause, type TncInput } from '@contracts/vendors';
import { useSession } from '@/app/session';
import { Button, Card, EmptyState, Input, KpiTile, Modal, Pagination, Pill, Select, Skeleton, Textarea, useToast } from '@/components/ui';
import type { Tone } from '@/lib/status';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { useDeleteTnc, useSaveTnc, useTnc, useTncStats } from '../api';

const PAGE_SIZE = 12;
export const APPLIES_LABEL: Record<TncApplies, string> = { all: 'All documents', po: 'Purchase orders', vendor: 'Vendor agreements', quote: 'Quotations' };
const CATEGORY_TONE: Record<TncCategory, Tone> = { Payment: 'purple', Delivery: 'green', Quality: 'amber', Legal: 'red', Warranty: 'amber', General: 'neutral' };

type Form = { title: string; category: string; version: string; body: string; summary: string; status: MasterStatus; appliesTo: TncApplies; notes: string };
const EMPTY: Form = { title: '', category: '', version: '1.0', body: '', summary: '', status: 'active', appliesTo: 'all', notes: '' };

function TncForm({ open, clause, onClose }: { open: boolean; clause: TncClause | null; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveTnc();
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(clause ? { title: clause.title, category: clause.category ?? '', version: clause.version, body: clause.body, summary: clause.summary ?? '', status: clause.status, appliesTo: clause.appliesTo, notes: clause.notes ?? '' } : EMPTY);
  }, [open, clause]);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!f.title.trim()) local.title = 'Title is required';
    if (!f.body.trim()) local.body = 'Clause text is required';
    if (Object.keys(local).length) return setErrors(local);
    const input: TncInput = {
      title: f.title.trim(),
      category: (f.category || null) as TncCategory | null,
      version: f.version.trim() || '1.0',
      body: f.body.trim(),
      summary: f.summary.trim() || null,
      status: f.status,
      appliesTo: f.appliesTo,
      notes: f.notes.trim() || null,
    };
    try {
      const saved = await save.mutateAsync({ id: clause?.id, input });
      toast({ tone: 'success', title: clause ? `${saved.title} updated` : `${saved.title} added` });
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save the clause', description: errorMessage(err) });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={clause ? `Edit ${clause.title}` : 'Add T&C clause'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="tnc-form" loading={save.isPending}>
            {clause ? 'Save changes' : 'Add clause'}
          </Button>
        </>
      }
    >
      <form id="tnc-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3">
        <Input label="Title" placeholder="e.g. Payment terms" value={f.title} onChange={(e) => set('title')(e.target.value)} error={errors.title} containerClassName="sm:col-span-3" />
        <Select label="Category" placeholder="Select category" options={TNC_CATEGORIES.map((c) => ({ value: c, label: c }))} value={f.category} onChange={(e) => set('category')(e.target.value)} />
        <Select label="Applies to" options={TNC_APPLIES.map((a) => ({ value: a, label: APPLIES_LABEL[a] }))} value={f.appliesTo} onChange={(e) => set('appliesTo')(e.target.value as TncApplies)} />
        <Input label="Version" value={f.version} onChange={(e) => set('version')(e.target.value)} error={errors.version} />
        <Textarea label="Clause text" rows={7} placeholder="The full text of this term or condition" value={f.body} onChange={(e) => set('body')(e.target.value)} error={errors.body} containerClassName="sm:col-span-3" />
        <Input label="Short summary" placeholder="One line for quick reference" value={f.summary} onChange={(e) => set('summary')(e.target.value)} containerClassName="sm:col-span-2" />
        <Select
          label="Status"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          value={f.status}
          onChange={(e) => set('status')(e.target.value as MasterStatus)}
        />
        <Textarea label="Internal notes" rows={2} placeholder="Legal reference, who approved it…" value={f.notes} onChange={(e) => set('notes')(e.target.value)} containerClassName="sm:col-span-3" />
      </form>
    </Modal>
  );
}

/** Standard terms and conditions for POs, vendor agreements and quotations (legacy T&C Master). */
export function TncPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['category', 'appliesTo'] as const);
  const [search, setSearch] = useSearchParam(url);
  const list = useTnc({
    q: url.q || undefined,
    page: url.page,
    pageSize: PAGE_SIZE,
    filters: { category: (url.values.category || undefined) as TncCategory | undefined, appliesTo: (url.values.appliesTo || undefined) as TncApplies | undefined },
  });
  const stats = useTncStats().data;
  const remove = useDeleteTnc();
  const [form, setForm] = useState<TncClause | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<TncClause | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function onDelete() {
    if (!toDelete) return;
    try {
      await remove.mutateAsync(toDelete.id);
      toast({ tone: 'success', title: `${toDelete.title} deleted` });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t delete', description: errorMessage(err) });
    }
    setToDelete(null);
  }

  const rows = list.data?.rows ?? [];
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="T&C master"
        description="Standard terms and conditions to attach to purchase orders, vendor agreements and quotations."
        actions={
          canDo('edit') && (
            <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
              Add clause
            </Button>
          )
        }
      />
      {stats && (
        <div className="grid grid-cols-3 gap-3 md:max-w-xl">
          <KpiTile variant="compact" label="Clauses" value={stats.total} />
          <KpiTile variant="compact" label="Categories" value={stats.categories} />
          <KpiTile variant="compact" label="Active" value={stats.active} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search clauses" icon={Search} placeholder="Search terms…" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[280px]" />
        <Select aria-label="Category" placeholder="All categories" options={TNC_CATEGORIES.map((c) => ({ value: c, label: c }))} value={url.values.category} onChange={(e) => url.set({ category: e.target.value })} containerClassName="w-[180px]" />
        <Select aria-label="Applies to" placeholder="Any document" options={TNC_APPLIES.map((a) => ({ value: a, label: APPLIES_LABEL[a] }))} value={url.values.appliesTo} onChange={(e) => url.set({ appliesTo: e.target.value })} containerClassName="w-[190px]" />
      </div>
      {list.isLoading ? (
        <Skeleton className="h-60 w-full" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={FileText} title="No clauses match" description="Add your first term or change the filters." />
        </Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((t) => {
            const open = expanded === t.id;
            return (
              <li key={t.id} className={clsx('flex flex-col rounded-lg border border-border bg-card', t.status === 'inactive' && 'opacity-70')}>
                <div className="flex flex-1 flex-col gap-1.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{t.title}</p>
                    {t.category && <Pill tone={CATEGORY_TONE[t.category]}>{t.category}</Pill>}
                  </div>
                  {t.summary && <p className="text-sm font-medium text-ink">{t.summary}</p>}
                  <p className={clsx('whitespace-pre-line text-sm text-muted', !open && 'line-clamp-3')}>{t.body}</p>
                  {t.body.length > 180 && (
                    <button type="button" className="self-start text-sm font-semibold text-muted hover:text-ink" aria-expanded={open} onClick={() => setExpanded(open ? null : t.id)}>
                      {open ? 'Show less' : 'Show full text'}
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-divider px-4 py-2">
                  <span className="text-caption text-faint">
                    v{t.version} · {APPLIES_LABEL[t.appliesTo]}
                    {t.status === 'inactive' && ' · Inactive'}
                  </span>
                  <span className="flex gap-1">
                    {canDo('edit') && <Button size="sm" variant="ghost" icon={Pencil} aria-label={`Edit ${t.title}`} onClick={() => setForm(t)} />}
                    {canDo('delete') && <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete ${t.title}`} onClick={() => setToDelete(t)} />}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      <TncForm open={form !== null} clause={form === 'new' ? null : form} onClose={() => setForm(null)} />
      <ConfirmDialog open={!!toDelete} title={`Delete “${toDelete?.title ?? ''}”?`} confirmLabel="Delete" danger busy={remove.isPending} onConfirm={onDelete} onClose={() => setToDelete(null)}>
        Documents already issued keep their text. To stop offering it but keep it on file, mark it inactive instead.
      </ConfirmDialog>
    </div>
  );
}
