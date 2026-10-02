import { Download, MapPin, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { CityView } from '@contracts/sampletrack';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, Modal, Pagination, Pill, Select, useToast, type Column } from '@/components/ui';
import { exportCities, useAddCity, useCities, useRemoveCity, useStates, useUpdateCity } from '../samples/api';
import { ConfirmDialog } from '../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../samples/ui/errors';
import { useSearchParam, useUrlState } from '../samples/ui/list-state';
import { PageHeader } from '../samples/ui/PageHeader';

const PAGE_SIZE = 25;
const splitPins = (s: string) => [...new Set(s.split(/[\s,;|]+/).map((p) => p.trim()).filter(Boolean))];

/** Add a city, or edit one: pincodes on any city, name and state only on custom cities. */
function CityDialog({ open, city, onClose }: { open: boolean; city: CityView | null; onClose: () => void }) {
  const toast = useToast();
  const states = useStates();
  const add = useAddCity();
  const update = useUpdateCity();
  const [name, setName] = useState('');
  const [stateId, setStateId] = useState('');
  const [pins, setPins] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const builtin = !!city && !city.isCustom;
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setName(city?.city ?? '');
    setStateId(city?.stateId ?? '');
    setPins(city?.pincodes.join(', ') ?? '');
  }, [open, city]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!name.trim()) local.city = 'Enter the city name';
    if (!stateId) local.stateId = 'Pick a state';
    const bad = splitPins(pins).filter((p) => !/^[1-9][0-9]{5}$/.test(p));
    if (bad.length) local.pincodes = `Not a 6-digit pincode: ${bad.join(', ')}`;
    if (Object.keys(local).length) return setErrors(local);
    const pincodes = splitPins(pins);
    try {
      const r = city
        ? await update.mutateAsync({ id: city.id, input: builtin ? { pincodes } : { city: name.trim(), stateId, pincodes } })
        : await add.mutateAsync({ city: name.trim(), stateId, pincodes });
      toast({ tone: 'success', title: city ? `${r.city} updated` : `${r.city}, ${r.stateName} added` });
      onClose();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'city_exists') setErrors({ city: 'That city is already listed for this state' });
      else if (code === 'pincode_taken') setErrors({ pincodes: errorMessage(err) });
      else {
        setErrors(fieldErrors(err));
        toast({ tone: 'error', title: 'Couldn’t save the city', description: errorMessage(err) });
      }
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={city ? `Edit ${city.city}` : 'Add city'}
      description={builtin ? 'A built-in city: only its pincodes can change.' : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="city-form" loading={add.isPending || update.isPending}>
            {city ? 'Save changes' : 'Add city'}
          </Button>
        </>
      }
    >
      <form id="city-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <Input label="City" value={name} onChange={(e) => setName(e.target.value)} error={errors.city} disabled={builtin} />
        <Select label="State / UT" placeholder="Pick a state" options={(states.data ?? []).map((s) => ({ value: s.id, label: s.name }))} value={stateId} onChange={(e) => setStateId(e.target.value)} error={errors.stateId} disabled={builtin} />
        <Input
          label="Pincodes"
          placeholder="363621, 363622"
          value={pins}
          onChange={(e) => setPins(e.target.value)}
          error={errors.pincodes}
          hint="Separate with commas or spaces. Typing one in the vendor form fills this city and state."
          containerClassName="sm:col-span-2"
        />
      </form>
    </Modal>
  );
}

/**
 * City master, shared by Admin (SampleTrack) and Vendors: built-in and custom cities with their pincodes
 * (legacy renderCityMaster / addCustomCity / removeCustomCity / exportCityMaster, and the vendor
 * portal's City / State master with pincodes).
 */
export function CitiesPage({ title = 'City master', description = 'Cities offered in the party and vendor forms, with their pincodes. Built-in cities can’t be removed or renamed.' }: { title?: string; description?: string }) {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['stateId', 'kind'] as const);
  const [search, setSearch] = useSearchParam(url);
  const states = useStates();
  const list = useCities({
    q: url.q || undefined,
    page: url.page,
    pageSize: PAGE_SIZE,
    filters: { stateId: url.values.stateId || undefined, isCustom: url.values.kind ? url.values.kind === 'custom' : undefined },
  });
  const remove = useRemoveCity();
  const [editing, setEditing] = useState<CityView | 'new' | null>(null);
  const [toRemove, setToRemove] = useState<CityView | null>(null);

  async function onRemove() {
    if (!toRemove) return;
    try {
      await remove.mutateAsync(toRemove.id);
      toast({ tone: 'success', title: `${toRemove.city} removed` });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t remove', description: errorMessage(err) });
    }
    setToRemove(null);
  }
  async function onExport() {
    try {
      await exportCities();
    } catch (err) {
      toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) });
    }
  }

  const columns: Column<CityView>[] = [
    { id: 'city', header: 'City', width: '200px', className: 'font-medium', cell: (c) => c.city },
    { id: 'state', header: 'State / UT', width: '200px', cell: (c) => c.stateName },
    { id: 'pincodes', header: 'Pincodes', className: 'text-sm text-muted tabular-nums', cell: (c) => c.pincodes.join(', ') || '—' },
    { id: 'kind', header: 'Source', width: '110px', cell: (c) => (c.isCustom ? <Pill tone="purple">Custom</Pill> : <Pill>Built-in</Pill>) },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '88px',
      align: 'right',
      cell: (c) => (
        <span className="flex justify-end gap-1">
          {canDo('edit') && <Button variant="ghost" size="sm" icon={Pencil} aria-label={`Edit ${c.city}`} onClick={() => setEditing(c)} />}
          {c.isCustom && canDo('delete') && <Button variant="ghost" size="sm" icon={Trash2} aria-label={`Remove ${c.city}`} onClick={() => setToRemove(c)} />}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={onExport}>
                Export
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
                Add city
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search cities" icon={Search} placeholder="City name or pincode" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[260px]" />
        <Select aria-label="State" placeholder="All states" options={(states.data ?? []).map((s) => ({ value: s.id, label: s.name }))} value={url.values.stateId} onChange={(e) => url.set({ stateId: e.target.value })} containerClassName="w-[220px]" />
        <Select aria-label="Source" placeholder="Built-in and custom" options={[{ value: 'custom', label: 'Custom only' }, { value: 'builtin', label: 'Built-in only' }]} value={url.values.kind} onChange={(e) => url.set({ kind: e.target.value })} containerClassName="w-[190px]" />
      </div>
      <DataTable
        label="Cities"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(c) => c.id}
        minWidth={760}
        loading={list.isLoading}
        empty={<EmptyState icon={MapPin} title="No cities match" />}
        footer={(list.data?.total ?? 0) > 0 && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <CityDialog open={editing !== null} city={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!toRemove} title={`Remove ${toRemove?.city ?? ''}?`} confirmLabel="Remove" danger busy={remove.isPending} onConfirm={onRemove} onClose={() => setToRemove(null)}>
        Parties and vendors already using this city keep it; it just stops being offered in the list.
      </ConfirmDialog>
    </div>
  );
}
