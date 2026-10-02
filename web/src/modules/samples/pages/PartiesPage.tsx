import { Building2, Download, Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { INDUSTRIES, PARTY_TYPES, type DuplicatePartyDetails, type PartyInput, type PartyType, type PartyView } from '@contracts/sampletrack';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, MenuItem, MenuSeparator, Modal, Pagination, Select, useToast, type Column } from '@/components/ui';
import {
  duplicateOf,
  exportParties,
  inUseOf,
  stateForCity,
  useCityOptions,
  useCreateParty,
  useDeleteParty,
  useParty,
  useParties,
  usePartyAssignees,
  useStates,
  useUpdateParty,
} from '../api';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { DetailList } from '../ui/DetailList';
import { errorMessage, fieldErrors } from '../ui/errors';
import { useSearchParam, useUrlState } from '../ui/list-state';
import { PageHeader } from '../ui/PageHeader';
import { RowMenu, runAndClose } from '../ui/RowMenu';
import { sortMapping } from '../ui/table-sort';

const PAGE_SIZE = 10;
const SORT = sortMapping({ name: 'name', city: 'city', type: 'type' });
type Form = Required<{ [K in keyof PartyInput]: string }>;
const EMPTY: Form = { name: '', contact: '', mobile: '', email: '', gst: '', address: '', city: '', state: '', pin: '', industry: 'Furniture', type: 'Existing Customer', assignedUserId: '', remarks: '' };

const typeTone = (t: PartyType) => (t === 'New Lead' ? <span className="rounded-full bg-purple-light px-2 text-label font-semibold text-purple">New lead</span> : <span className="rounded-full bg-green-light px-2 text-label font-semibold text-green">Customer</span>);

function PartyForm({ open, party, onClose, onSaved }: { open: boolean; party: PartyView | null; onClose: () => void; onSaved: (p: PartyView) => void }) {
  const toast = useToast();
  const create = useCreateParty();
  const update = useUpdateParty();
  const states = useStates().data ?? [];
  const cities = useCityOptions().data;
  const assignees = usePartyAssignees().data ?? [];
  const cityList = useId();
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicate, setDuplicate] = useState<DuplicatePartyDetails | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setDuplicate(null);
    setF(
      party
        ? (Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (party as unknown as Record<string, string | null>)[k] ?? ''])) as Form)
        : EMPTY,
    );
  }, [open, party]);

  const set = (k: keyof Form) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  function onCity(city: string) {
    // Legacy onCityChange: picking a known city fills its state.
    setF((x) => ({ ...x, city, state: stateForCity(cities, city) ?? x.state }));
  }

  async function save(force = false) {
    if (!f.name.trim()) {
      setErrors({ name: 'Party name is required' });
      return;
    }
    const input = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()])) as unknown as PartyInput;
    input.type = f.type as PartyType;
    try {
      const saved = party ? await update.mutateAsync({ id: party.id, input, force }) : await create.mutateAsync({ input, force });
      toast({ tone: 'success', title: party ? `${saved.name} updated` : `${saved.name} added` });
      onSaved(saved);
    } catch (err) {
      const dup = duplicateOf(err);
      if (dup) {
        setDuplicate(dup);
        return;
      }
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save the party', description: errorMessage(err) });
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        closeOnBackdrop={false}
        title={party ? `Edit ${party.name}` : 'Add party'}
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" form="party-form" loading={create.isPending || update.isPending}>
              {party ? 'Save changes' : 'Add party'}
            </Button>
          </>
        }
      >
        <form
          id="party-form"
          noValidate
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input label="Company / party name" value={f.name} onChange={(e) => set('name')(e.target.value)} error={errors.name} containerClassName="sm:col-span-2" />
          <Input label="Contact person" value={f.contact} onChange={(e) => set('contact')(e.target.value)} />
          <Input label="Mobile" inputMode="tel" placeholder="98765 43210" value={f.mobile} onChange={(e) => set('mobile')(e.target.value)} error={errors.mobile} />
          <Input label="Email" type="email" value={f.email} onChange={(e) => set('email')(e.target.value)} error={errors.email} />
          <Input label="GST number" placeholder="24AAACG1234F1Z5" value={f.gst} onChange={(e) => set('gst')(e.target.value.toUpperCase())} error={errors.gst} />
          <Input label="Address" placeholder="Plot / building, street, area" value={f.address} onChange={(e) => set('address')(e.target.value)} containerClassName="sm:col-span-2" />
          <div>
            <Input label="City" list={cityList} placeholder="Type or pick" value={f.city} onChange={(e) => onCity(e.target.value)} />
            <datalist id={cityList}>
              {(cities ?? []).map((c) => (
                <option key={`${c.city}|${c.state}`} value={c.city}>
                  {c.state ?? ''}
                </option>
              ))}
            </datalist>
          </div>
          <Select label="State" placeholder="Select state" options={states.map((s) => ({ value: s.name, label: s.name }))} value={f.state} onChange={(e) => set('state')(e.target.value)} error={errors.state} />
          <Input label="Pincode" inputMode="numeric" maxLength={6} value={f.pin} onChange={(e) => set('pin')(e.target.value)} error={errors.pin} />
          <Select label="Industry" options={INDUSTRIES.map((i) => ({ value: i, label: i }))} value={f.industry} onChange={(e) => set('industry')(e.target.value)} />
          <Select label="Type" options={PARTY_TYPES.map((t) => ({ value: t, label: t }))} value={f.type} onChange={(e) => set('type')(e.target.value)} />
          <Select
            label="Assigned to"
            placeholder="Nobody"
            options={assignees.map((a) => ({ value: a.id, label: `${a.name} · ${a.role}` }))}
            value={f.assignedUserId}
            onChange={(e) => set('assignedUserId')(e.target.value)}
            error={errors.assignedUserId}
          />
          <Input label="Remarks" value={f.remarks} onChange={(e) => set('remarks')(e.target.value)} containerClassName="sm:col-span-2" />
        </form>
      </Modal>
      <ConfirmDialog
        open={!!duplicate}
        title="A similar party already exists"
        confirmLabel="Save anyway"
        busy={create.isPending || update.isPending}
        onClose={() => setDuplicate(null)}
        onConfirm={() => {
          setDuplicate(null);
          void save(true);
        }}
      >
        {duplicate?.similar.map((s) => (
          <p key={s.id}>
            <strong className="text-ink">{s.name}</strong>
            {[s.city, s.state].filter(Boolean).length ? ` · ${[s.city, s.state].filter(Boolean).join(', ')}` : ''}
            {s.mobile ? ` · ${s.mobile}` : ''}
          </p>
        ))}
        <p className="mt-2">Save this one as a separate party anyway?</p>
      </ConfirmDialog>
    </>
  );
}

/** Party database (legacy renderPartyTable / saveParty / delParty / exportParties). */
export function PartiesPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['type'] as const);
  const [search, setSearch] = useSearchParam(url);
  const query = { q: url.q || undefined, sort: url.sort || undefined, page: url.page, pageSize: PAGE_SIZE, filters: { type: (url.values.type || undefined) as PartyType | undefined } };
  const list = useParties(query);
  const [form, setForm] = useState<PartyView | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<PartyView | null>(null);
  const remove = useDeleteParty();
  const opened = useParty(url.open ?? undefined);
  const canEdit = canDo('edit');

  async function onDelete() {
    if (!toDelete) return;
    try {
      await remove.mutateAsync(toDelete.id);
      toast({ tone: 'success', title: `${toDelete.name} deleted` });
      if (url.open === toDelete.id) url.set({ open: null });
    } catch (err) {
      const used = inUseOf(err);
      toast({
        tone: 'error',
        title: 'Can’t delete this party',
        description: used ? `It is used by ${used.requests} request(s) and ${used.dispatches} dispatch(es).` : errorMessage(err),
      });
    }
    setToDelete(null);
  }

  const columns: Column<PartyView>[] = [
    { id: 'name', header: 'Party', sortValue: (p) => p.name, cell: (p) => <span className="font-semibold">{p.name}</span> },
    { id: 'contact', header: 'Contact', width: '150px', cell: (p) => p.contact ?? '—' },
    { id: 'mobile', header: 'Mobile', width: '118px', className: 'font-mono text-sm', cell: (p) => p.mobile ?? '—' },
    { id: 'city', header: 'City', width: '170px', sortValue: (p) => p.city, cell: (p) => [p.city, p.state].filter(Boolean).join(', ') || '—' },
    { id: 'industry', header: 'Industry', width: '130px', className: 'text-muted', cell: (p) => p.industry ?? '—' },
    { id: 'type', header: 'Type', width: '96px', sortValue: (p) => p.type, cell: (p) => typeTone(p.type) },
    { id: 'assigned', header: 'Assigned to', width: '140px', className: 'text-muted', cell: (p) => p.assignedUserName ?? '—' },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (p) => (
        <RowMenu label={`Actions for ${p.name}`}>
          {(close) => (
            <>
              <MenuItem icon={Eye} onClick={runAndClose(close, () => url.set({ open: p.id, page: url.page }))}>
                View
              </MenuItem>
              {canEdit && (
                <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(p))}>
                  Edit
                </MenuItem>
              )}
              {canDo('delete') && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(p))}>
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

  const p = opened.data;
  const filtered = !!(url.q || url.values.type);

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Parties"
        description="Customers and leads that samples are sent to."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => exportParties({ q: query.q, sort: query.sort, filters: query.filters }).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Export Excel
              </Button>
            )}
            {canEdit && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                Add party
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search parties" icon={Search} placeholder="Name, contact, mobile, GST or city" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[320px]" />
        <Select aria-label="Type" placeholder="All types" options={PARTY_TYPES.map((t) => ({ value: t, label: t }))} value={url.values.type} onChange={(e) => url.set({ type: e.target.value })} containerClassName="w-[200px]" />
      </div>
      <DataTable
        label="Parties"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(r) => r.id}
        minWidth={1080}
        loading={list.isLoading}
        sort={SORT.fromApi(url.sort)}
        onSortChange={(s) => url.set({ sort: SORT.toApi(s) ?? null })}
        manualSort
        onRowClick={(r) => url.set({ open: r.id, page: url.page })}
        empty={
          <EmptyState
            icon={Building2}
            title={filtered ? 'No parties match' : 'No parties yet'}
            action={
              filtered && (
                <Button
                  onClick={() => {
                    setSearch('');
                    url.set({ q: null, type: null });
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        }
        footer={(list.data?.total ?? 0) > 0 && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />

      <Modal
        open={!!url.open}
        onClose={() => url.set({ open: null, page: url.page })}
        title={p?.name ?? 'Party'}
        description={p ? `${p.type}${p.industry ? ` · ${p.industry}` : ''}` : undefined}
        footer={
          p &&
          canEdit && (
            <Button icon={Pencil} onClick={() => setForm(p)}>
              Edit
            </Button>
          )
        }
      >
        {p ? (
          <DetailList
            items={[
              { label: 'Contact', value: p.contact },
              { label: 'Mobile', value: p.mobile },
              { label: 'Email', value: p.email },
              { label: 'GST', value: p.gst },
              { label: 'Address', value: [p.address, p.city, p.state].filter(Boolean).join(', ') + (p.pin ? ` — ${p.pin}` : '') || '—', wide: true },
              { label: 'Type', value: typeTone(p.type) },
              { label: 'Assigned to', value: p.assignedUserName },
              { label: 'Remarks', value: p.remarks, wide: true },
            ]}
          />
        ) : (
          <p className="text-base text-muted">{opened.isError ? errorMessage(opened.error) : 'Loading…'}</p>
        )}
      </Modal>

      <PartyForm open={form !== null} party={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={(saved) => { setForm(null); url.set({ open: saved.id, page: url.page }); }} />
      <ConfirmDialog open={!!toDelete} title={`Delete ${toDelete?.name ?? ''}?`} confirmLabel="Delete" danger busy={remove.isPending} onConfirm={onDelete} onClose={() => setToDelete(null)}>
        A party used by a request or dispatch can’t be deleted.
      </ConfirmDialog>
    </div>
  );
}
