import { clsx } from 'clsx';
import { Check, Download, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { CATEGORY_COLORS, type CategoryColor, type MasterStatus, type VendorCategoryInput, type VendorCategoryView } from '@contracts/vendors';
import { useSession } from '@/app/session';
import { Button, Card, EmptyState, Input, KpiTile, Modal, Select, Skeleton, Textarea, useToast } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportCategories, useDeleteCategory, useSaveCategory, useVendorCategories } from '../api';
import { CATEGORY_STYLE, CategoryPill } from '../ui';

/** The legacy icon palette (CAT_ICONS). Any emoji can also be typed in. */
const ICONS = ['🪵', '🧪', '📦', '🚛', '🔧', '🛠️', '⚡', '🔩', '🏭', '🧲', '💡', '🌿', '💧', '🔥', '❄️', '🧱', '🏗️', '📋', '⚙️', '🔬', '🧴', '📐', '🔨', '🪚', '🧰', '🛢️', '🎁', '🔑', '🪣', '🧹', '🏷️'];

type Form = { name: string; icon: string; color: CategoryColor; description: string; sortOrder: string; status: MasterStatus; notes: string };
const EMPTY: Form = { name: '', icon: '🏷️', color: 'grey', description: '', sortOrder: '', status: 'active', notes: '' };

function CategoryForm({ open, category, onClose }: { open: boolean; category: VendorCategoryView | null; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveCategory();
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      category
        ? { name: category.name, icon: category.icon ?? '', color: category.color, description: category.description ?? '', sortOrder: String(category.sortOrder), status: category.status, notes: category.notes ?? '' }
        : EMPTY,
    );
  }, [open, category]);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setErrors({ name: 'Category name is required' });
    const input: VendorCategoryInput = {
      name: f.name.trim(),
      icon: f.icon.trim() || null,
      color: f.color,
      description: f.description.trim() || null,
      status: f.status,
      notes: f.notes.trim() || null,
      ...(f.sortOrder.trim() ? { sortOrder: Number(f.sortOrder) } : {}),
    };
    try {
      const saved = await save.mutateAsync({ id: category?.id, input });
      toast({ tone: 'success', title: category ? `${saved.name} updated` : `${saved.name} added` });
      onClose();
    } catch (err) {
      const fe = fieldErrors(err);
      if ((err as { code?: string }).code === 'name_taken') fe.name = 'Another category already has that name';
      setErrors(fe);
      toast({ tone: 'error', title: 'Couldn’t save the category', description: errorMessage(err) });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      title={category ? `Edit ${category.name}` : 'Add category'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="vcat-form" loading={save.isPending}>
            {category ? 'Save changes' : 'Add category'}
          </Button>
        </>
      }
    >
      <form id="vcat-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <Input label="Category name" placeholder="e.g. Raw Material" value={f.name} onChange={(e) => set('name')(e.target.value)} error={errors.name} containerClassName="sm:col-span-2" />
        <Textarea label="Description" rows={2} placeholder="What vendors and products belong here" value={f.description} onChange={(e) => set('description')(e.target.value)} containerClassName="sm:col-span-2" />
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-semibold text-ink">Icon</span>
          <div role="radiogroup" aria-label="Icon" className="flex max-h-24 flex-wrap gap-1 overflow-y-auto rounded border border-border bg-page p-1.5">
            {ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                role="radio"
                aria-checked={f.icon === ic}
                aria-label={ic}
                onClick={() => set('icon')(ic)}
                className={clsx('flex h-8 w-8 items-center justify-center rounded border text-base', f.icon === ic ? 'border-primary bg-primary-light' : 'border-transparent hover:bg-card')}
              >
                {ic}
              </button>
            ))}
          </div>
          <Input aria-label="Or type any emoji" placeholder="Or type any emoji" maxLength={8} value={f.icon} onChange={(e) => set('icon')(e.target.value)} containerClassName="w-[180px]" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-semibold text-ink">Colour</span>
          <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-1.5">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={f.color === c}
                aria-label={CATEGORY_STYLE[c].label}
                title={CATEGORY_STYLE[c].label}
                onClick={() => set('color')(c)}
                className={clsx('flex h-7 w-7 items-center justify-center rounded border-2', f.color === c ? 'border-ink' : 'border-transparent')}
                style={{ background: CATEGORY_STYLE[c].bg, color: CATEGORY_STYLE[c].fg }}
              >
                {f.color === c && <Check size={13} strokeWidth={2.4} aria-hidden />}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 rounded border border-border bg-page px-3 py-2.5 sm:col-span-2">
          <CategoryPill name={f.name.trim() || 'Category'} icon={f.icon || null} color={f.color} className="h-6 text-sm" />
          <span className="text-caption text-faint">Preview</span>
        </div>
        <Input label="Sort order" inputMode="numeric" placeholder="1 = first" value={f.sortOrder} onChange={(e) => set('sortOrder')(e.target.value.replace(/\D/g, ''))} error={errors.sortOrder} />
        <Select
          label="Status"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          value={f.status}
          onChange={(e) => set('status')(e.target.value as MasterStatus)}
          hint={f.status === 'inactive' ? 'Not offered for new vendors' : undefined}
        />
        <Textarea label="Notes" rows={2} placeholder="Internal guidelines" value={f.notes} onChange={(e) => set('notes')(e.target.value)} containerClassName="sm:col-span-2" />
      </form>
    </Modal>
  );
}

/** Vendor categories (legacy renderCats / openAddC / saveC / delC, plus the products-per-category table). */
export function CategoriesPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const list = useVendorCategories();
  const remove = useDeleteCategory();
  const [form, setForm] = useState<VendorCategoryView | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<VendorCategoryView | null>(null);
  const cats = list.data ?? [];

  async function onDelete() {
    if (!toDelete) return;
    try {
      await remove.mutateAsync(toDelete.id);
      toast({ tone: 'success', title: `${toDelete.name} deleted` });
    } catch (err) {
      toast({ tone: 'error', title: 'Can’t delete this category', description: errorMessage(err) });
    }
    setToDelete(null);
  }

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Vendor categories"
        description="Supply categories. Each one groups products and tags vendors."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => exportCategories().catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Export Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                Add category
              </Button>
            )}
          </>
        }
      />
      {list.isLoading ? (
        <Skeleton className="h-60 w-full" />
      ) : cats.length === 0 ? (
        <Card>
          <EmptyState icon={Tags} title="No categories yet" />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiTile variant="compact" label="Categories" value={cats.length} />
            <KpiTile variant="compact" label="Active" value={cats.filter((c) => c.status === 'active').length} />
            <KpiTile variant="compact" label="Products" value={cats.reduce((s, c) => s + c.productCount, 0)} />
            <KpiTile variant="compact" label="Vendor links" value={cats.reduce((s, c) => s + c.vendorCount, 0)} meta="A vendor can be in several" />
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cats.map((c) => (
              <li key={c.id} className={clsx('flex items-start gap-3 rounded-lg border border-border bg-card p-4', c.status === 'inactive' && 'opacity-70')}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg" style={{ background: CATEGORY_STYLE[c.color].bg }} aria-hidden>
                  {c.icon ?? '🏷️'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    {c.name}
                    {c.status === 'inactive' && <span className="text-caption font-normal text-faint">Inactive</span>}
                  </p>
                  <p className="truncate text-sm text-muted">{c.description ?? 'No description'}</p>
                  <p className="mt-1 text-caption text-faint">
                    <Link to={`/vendors/products?categoryId=${c.id}`} className="hover:text-ink hover:underline">
                      {c.productCount} product{c.productCount === 1 ? '' : 's'}
                    </Link>
                    {' · '}
                    <Link to={`/vendors/directory?categoryId=${c.id}`} className="hover:text-ink hover:underline">
                      {c.vendorCount} vendor{c.vendorCount === 1 ? '' : 's'}
                    </Link>
                    {` · order ${c.sortOrder}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {canDo('edit') && <Button size="sm" variant="ghost" icon={Pencil} aria-label={`Edit ${c.name}`} onClick={() => setForm(c)} />}
                  {canDo('delete') && <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete ${c.name}`} onClick={() => setToDelete(c)} />}
                </div>
              </li>
            ))}
          </ul>
          <Card flush title="Products per category">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-base">
                <thead>
                  <tr className="h-row-head border-y border-divider bg-page text-left text-label font-semibold uppercase tracking-label text-muted">
                    <th className="px-4 font-semibold">Category</th>
                    <th className="px-4 text-right font-semibold">Products</th>
                    <th className="px-4 text-right font-semibold">Vendors</th>
                    <th className="px-4 font-semibold">Sample products</th>
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c) => (
                    <tr key={c.id} className="h-row border-b border-divider last:border-0">
                      <td className="px-4">
                        <CategoryPill name={c.name} icon={c.icon} color={c.color} />
                      </td>
                      <td className="px-4 text-right tabular-nums">{c.productCount}</td>
                      <td className="px-4 text-right tabular-nums">{c.vendorCount}</td>
                      <td className="px-4 text-sm text-muted">{c.sampleProducts.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
      <CategoryForm open={form !== null} category={form === 'new' ? null : form} onClose={() => setForm(null)} />
      <ConfirmDialog open={!!toDelete} title={`Delete ${toDelete?.name ?? ''}?`} confirmLabel="Delete" danger busy={remove.isPending} onConfirm={onDelete} onClose={() => setToDelete(null)}>
        A category that products or vendors use can’t be deleted. Mark it inactive instead to stop offering it.
      </ConfirmDialog>
    </div>
  );
}
