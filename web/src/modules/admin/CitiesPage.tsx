import { Download, MapPin, Plus, Search, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { CityView } from '@contracts/sampletrack';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, Modal, Pagination, Pill, Select, useToast, type Column } from '@/components/ui';
import { exportCities, useAddCity, useCities, useRemoveCity, useStates } from '../samples/api';
import { ConfirmDialog } from '../samples/ui/ConfirmDialog';
import { errorMessage } from '../samples/ui/errors';
import { useSearchParam, useUrlState } from '../samples/ui/list-state';
import { PageHeader } from '../samples/ui/PageHeader';

const PAGE_SIZE = 25;

function AddCityDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const states = useStates();
  const add = useAddCity();
  const [city, setCity] = useState('');
  const [stateId, setStateId] = useState('');
  const [errors, setErrors] = useState<{ city?: string; stateId?: string }>({});
  function close() {
    setCity('');
    setStateId('');
    setErrors({});
    onClose();
  }
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local = { city: city.trim() ? undefined : 'Enter the city name', stateId: stateId ? undefined : 'Pick a state' };
    if (local.city || local.stateId) {
      setErrors(local);
      return;
    }
    try {
      const r = await add.mutateAsync({ city: city.trim(), stateId });
      toast({ tone: 'success', title: `${r.city}, ${r.stateName} added` });
      close();
    } catch (err) {
      if ((err as { code?: string }).code === 'city_exists') setErrors({ city: 'That city is already listed for this state' });
      else toast({ tone: 'error', title: 'Couldn’t add the city', description: errorMessage(err) });
    }
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title="Add city"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" type="submit" form="city-form" loading={add.isPending}>
            Add city
          </Button>
        </>
      }
    >
      <form id="city-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} error={errors.city} />
        <Select label="State / UT" placeholder="Pick a state" options={(states.data ?? []).map((s) => ({ value: s.id, label: s.name }))} value={stateId} onChange={(e) => setStateId(e.target.value)} error={errors.stateId} />
      </form>
    </Modal>
  );
}

/** City master (legacy renderCityMaster / addCustomCity / removeCustomCity / exportCityMaster). */
export function CitiesPage() {
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
  const [adding, setAdding] = useState(false);
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
    { id: 'city', header: 'City', className: 'font-medium', cell: (c) => c.city },
    { id: 'state', header: 'State / UT', cell: (c) => c.stateName },
    { id: 'kind', header: 'Source', width: '120px', cell: (c) => (c.isCustom ? <Pill tone="purple">Custom</Pill> : <Pill>Built-in</Pill>) },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '56px',
      align: 'right',
      cell: (c) =>
        c.isCustom &&
        canDo('delete') && (
          <Button variant="ghost" size="sm" icon={Trash2} aria-label={`Remove ${c.city}`} onClick={() => setToRemove(c)} />
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="City master"
        description="Cities offered in the party form. Built-in cities can’t be removed; add your own for anywhere missing."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={onExport}>
                Export
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
                Add city
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search cities" icon={Search} placeholder="City name" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[260px]" />
        <Select aria-label="State" placeholder="All states" options={(states.data ?? []).map((s) => ({ value: s.id, label: s.name }))} value={url.values.stateId} onChange={(e) => url.set({ stateId: e.target.value })} containerClassName="w-[220px]" />
        <Select aria-label="Source" placeholder="Built-in and custom" options={[{ value: 'custom', label: 'Custom only' }, { value: 'builtin', label: 'Built-in only' }]} value={url.values.kind} onChange={(e) => url.set({ kind: e.target.value })} containerClassName="w-[190px]" />
      </div>
      <DataTable
        label="Cities"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(c) => c.id}
        minWidth={640}
        loading={list.isLoading}
        empty={<EmptyState icon={MapPin} title="No cities match" />}
        footer={(list.data?.total ?? 0) > 0 && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <AddCityDialog open={adding} onClose={() => setAdding(false)} />
      <ConfirmDialog open={!!toRemove} title={`Remove ${toRemove?.city ?? ''}?`} confirmLabel="Remove" danger busy={remove.isPending} onConfirm={onRemove} onClose={() => setToRemove(null)}>
        Parties already using this city keep it; it just stops being offered in the list.
      </ConfirmDialog>
    </div>
  );
}
