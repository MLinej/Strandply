import { Pencil, Plus, Search, Star, Trash2, Truck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { COURIER_STATUSES, COURIER_TYPES, type Courier, type CourierInput, type CourierStatus, type CourierType } from '@contracts/sampletrack';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, MenuItem, MenuSeparator, Modal, Pagination, Select, StatusPill, useToast, type Column } from '@/components/ui';
import { inUseOf, useCouriers, useCreateCourier, useDeleteCourier, useUpdateCourier } from '../api';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../ui/errors';
import { useSearchParam, useUrlState } from '../ui/list-state';
import { PageHeader } from '../ui/PageHeader';
import { RowMenu, runAndClose } from '../ui/RowMenu';
import { sortMapping } from '../ui/table-sort';

const PAGE_SIZE = 10;
const SORT = sortMapping({ name: 'name', type: 'type', rating: 'rating', status: 'status' });

function Stars({ n }: { n: number | null }) {
  if (!n) return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex" aria-label={`${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={13} strokeWidth={1.8} className={i <= n ? 'fill-amber text-amber' : 'text-border'} aria-hidden />
      ))}
    </span>
  );
}

type Form = { name: string; type: CourierType; contact: string; mobile: string; email: string; coverage: string; trackingUrlTemplate: string; rating: string; status: CourierStatus; remarks: string };
const EMPTY: Form = { name: '', type: 'Courier', contact: '', mobile: '', email: '', coverage: '', trackingUrlTemplate: '', rating: '', status: 'Active', remarks: '' };

function CourierForm({ open, courier, onClose }: { open: boolean; courier: Courier | null; onClose: () => void }) {
  const toast = useToast();
  const create = useCreateCourier();
  const update = useUpdateCourier();
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      courier
        ? {
            name: courier.name,
            type: courier.type,
            contact: courier.contact ?? '',
            mobile: courier.mobile ?? '',
            email: courier.email ?? '',
            coverage: courier.coverage ?? '',
            trackingUrlTemplate: courier.trackingUrlTemplate ?? '',
            rating: courier.rating ? String(courier.rating) : '',
            status: courier.status,
            remarks: courier.remarks ?? '',
          }
        : EMPTY,
    );
  }, [open, courier]);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) {
      setErrors({ name: 'Name is required' });
      return;
    }
    const blank = (s: string) => (s.trim() ? s.trim() : null);
    const input: CourierInput = {
      name: f.name.trim(),
      type: f.type,
      contact: blank(f.contact),
      mobile: blank(f.mobile),
      email: blank(f.email),
      coverage: blank(f.coverage),
      trackingUrlTemplate: blank(f.trackingUrlTemplate),
      rating: f.rating ? Number(f.rating) : null,
      status: f.status,
      remarks: blank(f.remarks),
    };
    try {
      const saved = courier ? await update.mutateAsync({ id: courier.id, input }) : await create.mutateAsync(input);
      toast({ tone: 'success', title: courier ? `${saved.name} updated` : `${saved.name} added` });
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      title={courier ? `Edit ${courier.name}` : 'Add courier / transporter'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="courier-form" loading={create.isPending || update.isPending}>
            {courier ? 'Save changes' : 'Add'}
          </Button>
        </>
      }
    >
      <form id="courier-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <Input label="Company name" placeholder="Blue Dart, DTDC…" value={f.name} onChange={(e) => set('name')(e.target.value)} error={errors.name} />
        <Select label="Type" options={COURIER_TYPES.map((t) => ({ value: t, label: t }))} value={f.type} onChange={(e) => set('type')(e.target.value as CourierType)} />
        <Input label="Contact person" value={f.contact} onChange={(e) => set('contact')(e.target.value)} />
        <Input label="Phone" value={f.mobile} onChange={(e) => set('mobile')(e.target.value)} error={errors.mobile} />
        <Input label="Email" type="email" value={f.email} onChange={(e) => set('email')(e.target.value)} error={errors.email} />
        <Input label="Coverage" placeholder="Pan India, Gujarat…" value={f.coverage} onChange={(e) => set('coverage')(e.target.value)} />
        <Input
          label="Tracking link"
          placeholder="https://courier.example/track?no={tracking}"
          hint="{tracking} is replaced by the tracking number."
          value={f.trackingUrlTemplate}
          onChange={(e) => set('trackingUrlTemplate')(e.target.value)}
          error={errors.trackingUrlTemplate}
          containerClassName="sm:col-span-2"
        />
        <Select label="Rating" placeholder="Not rated" options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: '★'.repeat(n) }))} value={f.rating} onChange={(e) => set('rating')(e.target.value)} error={errors.rating} />
        <Select label="Status" options={COURIER_STATUSES.map((s) => ({ value: s, label: s }))} value={f.status} onChange={(e) => set('status')(e.target.value as CourierStatus)} />
        <Input label="Remarks" value={f.remarks} onChange={(e) => set('remarks')(e.target.value)} containerClassName="sm:col-span-2" />
      </form>
    </Modal>
  );
}

/** Courier database (legacy renderCourierTable / saveCourier / delCourier). */
export function CouriersPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['type', 'status'] as const);
  const [search, setSearch] = useSearchParam(url);
  const list = useCouriers({
    q: url.q || undefined,
    sort: url.sort || undefined,
    page: url.page,
    pageSize: PAGE_SIZE,
    filters: { type: (url.values.type || undefined) as CourierType | undefined, status: (url.values.status || undefined) as CourierStatus | undefined },
  });
  const [form, setForm] = useState<Courier | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<Courier | null>(null);
  const remove = useDeleteCourier();
  const canEdit = canDo('edit');

  async function onDelete() {
    if (!toDelete) return;
    try {
      await remove.mutateAsync(toDelete.id);
      toast({ tone: 'success', title: `${toDelete.name} deleted` });
    } catch (err) {
      const used = inUseOf(err);
      toast({ tone: 'error', title: 'Can’t delete', description: used ? `${used.dispatches} dispatch(es) use this courier. Mark it Inactive instead.` : errorMessage(err) });
    }
    setToDelete(null);
  }

  const columns: Column<Courier>[] = [
    { id: 'name', header: 'Name', sortValue: (c) => c.name, cell: (c) => <span className="font-semibold">{c.name}</span> },
    { id: 'type', header: 'Type', width: '100px', sortValue: (c) => c.type, cell: (c) => c.type },
    { id: 'contact', header: 'Contact', width: '150px', cell: (c) => (
      <span className="flex flex-col leading-tight">
        <span>{c.contact ?? '—'}</span>
        {c.mobile && <span className="text-caption text-faint">{c.mobile}</span>}
      </span>
    ) },
    { id: 'coverage', header: 'Coverage', width: '170px', className: 'text-muted', cell: (c) => c.coverage ?? '—' },
    { id: 'link', header: 'Tracking link', width: '120px', cell: (c) => (c.trackingUrlTemplate ? <span className="text-sm text-green">Set</span> : <span className="text-faint">—</span>) },
    { id: 'rating', header: 'Rating', width: '100px', sortValue: (c) => c.rating, cell: (c) => <Stars n={c.rating} /> },
    { id: 'status', header: 'Status', width: '92px', sortValue: (c) => c.status, cell: (c) => <StatusPill status={c.status} /> },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (c) =>
        (canEdit || canDo('delete')) && (
          <RowMenu label={`Actions for ${c.name}`}>
            {(close) => (
              <>
                {canEdit && (
                  <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(c))}>
                    Edit
                  </MenuItem>
                )}
                {canDo('delete') && (
                  <>
                    <MenuSeparator />
                    <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(c))}>
                      Delete
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </RowMenu>
        ),
    },
  ];

  const filtered = !!(url.q || url.values.type || url.values.status);
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Couriers"
        description="Couriers, transporters and bus services used for dispatch."
        actions={
          canEdit && (
            <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
              Add courier
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search couriers" icon={Search} placeholder="Name, contact, phone or coverage" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[300px]" />
        <Select aria-label="Type" placeholder="All types" options={COURIER_TYPES.map((t) => ({ value: t, label: t }))} value={url.values.type} onChange={(e) => url.set({ type: e.target.value })} containerClassName="w-[160px]" />
        <Select aria-label="Status" placeholder="Any status" options={COURIER_STATUSES.map((s) => ({ value: s, label: s }))} value={url.values.status} onChange={(e) => url.set({ status: e.target.value })} containerClassName="w-[160px]" />
      </div>
      <DataTable
        label="Couriers"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(r) => r.id}
        minWidth={980}
        loading={list.isLoading}
        sort={SORT.fromApi(url.sort)}
        onSortChange={(s) => url.set({ sort: SORT.toApi(s) ?? null })}
        manualSort
        onRowClick={canEdit ? (c) => setForm(c) : undefined}
        empty={<EmptyState icon={Truck} title={filtered ? 'No courier matches' : 'No couriers yet'} />}
        footer={(list.data?.total ?? 0) > 0 && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <CourierForm open={form !== null} courier={form === 'new' ? null : form} onClose={() => setForm(null)} />
      <ConfirmDialog open={!!toDelete} title={`Delete ${toDelete?.name ?? ''}?`} confirmLabel="Delete" danger busy={remove.isPending} onConfirm={onDelete} onClose={() => setToDelete(null)}>
        A courier used by a dispatch can’t be deleted; mark it Inactive instead.
      </ConfirmDialog>
    </div>
  );
}
