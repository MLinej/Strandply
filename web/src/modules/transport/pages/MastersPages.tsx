import { Download, Pencil, Plus, Printer, Search, Trash2, Truck, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CREDIT_TERMS, type Place, type Transporter, type TransporterImportResult, type VehicleType } from '@contracts/transport';
import { useSession } from '@/app/session';
import { Button, Combo, DataTable, EmptyState, Input, MenuItem, MenuSeparator, Modal, Pagination, Pill, Select, Textarea, useToast, type Column } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportTransport, useDeleteTransporter, useDeleteVehicle, useImportTransporters, useSaveTransporter, useSaveVehicle, useTransportMeta, useTransporters, useVehicles } from '../api';
import { printTransporter } from '../print';
import { stars } from '../ui';

const PAGE_SIZE = 25;
const TEXT_FIELDS = ['name', 'contactPerson', 'phone', 'phone2', 'email', 'address', 'city', 'state', 'pincode', 'gstin', 'pan', 'creditTerms', 'ifsc', 'bankName', 'bankBranch', 'accountName', 'accountNo'] as const;

/** Add / edit a transporter (legacy openAddTp / saveTp). */
function TransporterForm({ open, transporter, onClose }: { open: boolean; transporter: Transporter | null; onClose: () => void }) {
  const toast = useToast();
  const meta = useTransportMeta().data;
  const save = useSaveTransporter();
  const [v, setV] = useState<Record<string, string>>({});
  const [vehicles, setVehicles] = useState<string[]>([]);
  const [cities, setCities] = useState<Place[]>([]);
  const [rating, setRating] = useState(3);
  const [tds, setTds] = useState(false);
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    const t = transporter;
    setV(Object.fromEntries(TEXT_FIELDS.map((k) => [k, (t?.[k] as string | null) ?? (k === 'creditTerms' ? 'Against Delivery' : '')])));
    setVehicles(t?.vehicles ?? []);
    setCities(t?.operatingCities ?? []);
    setRating(t?.rating ?? 3);
    setTds(t?.tds ?? false);
    setActive(t?.active ?? true);
    setErrors({});
  }, [open, transporter]);
  const cityOptions = useMemo(() => (meta?.cities ?? []).map((c) => ({ id: c.city, label: c.city, hint: c.state })), [meta?.cities]);
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const field = (k: (typeof TEXT_FIELDS)[number], label: string, extra: Record<string, unknown> = {}) => <Input label={label} value={v[k] ?? ''} onChange={set(k)} error={errors[k]} {...extra} />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input: Record<string, unknown> = Object.fromEntries(TEXT_FIELDS.map((k) => [k, v[k]?.trim() || null]));
    Object.assign(input, { vehicles, operatingCities: cities, rating, tds, active });
    try {
      const saved = await save.mutateAsync({ id: transporter?.id, input });
      toast({ tone: 'success', title: transporter ? 'Transporter saved' : `${saved.code} added` });
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }

  const allVehicles = [...new Set([...(meta?.vehicles ?? []), ...vehicles])];
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      closeOnBackdrop={false}
      title={transporter ? `Edit ${transporter.code}` : 'Add transporter'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="tr-transporter-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="tr-transporter-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <div className="grid grid-cols-3 items-start gap-3">
          <div className="col-span-2">{field('name', 'Name')}</div>
          {field('contactPerson', 'Contact person')}
          {field('phone', 'Mobile', { inputMode: 'tel' })}
          {field('phone2', 'Mobile 2', { inputMode: 'tel' })}
          {field('email', 'Email', { type: 'email' })}
          <div className="col-span-3">
            <Textarea label="Address" rows={2} value={v.address ?? ''} onChange={set('address')} error={errors.address} />
          </div>
          <Combo
            label="City"
            value={v.city || null}
            options={v.city && !cityOptions.some((o) => o.id === v.city) ? [{ id: v.city, label: v.city }, ...cityOptions] : cityOptions}
            error={errors.city}
            onChange={(city) => {
              const c = meta?.cities.find((x) => x.city === city);
              setV((x) => ({ ...x, city: city ?? '', state: c?.state ?? x.state ?? '', pincode: c?.pincode ?? x.pincode ?? '' }));
            }}
          />
          {field('state', 'State')}
          {field('pincode', 'Pincode', { inputMode: 'numeric', maxLength: 6 })}
        </div>
        <div className="grid grid-cols-4 items-start gap-3">
          {field('gstin', 'GSTIN', { className: 'uppercase' })}
          {field('pan', 'PAN', { className: 'uppercase' })}
          <Select label="Credit terms" options={CREDIT_TERMS.map((x) => ({ value: x, label: x }))} value={v.creditTerms ?? ''} onChange={set('creditTerms')} />
          <Select label="Rating" options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${stars(n)} (${n})` }))} value={String(rating)} onChange={(e) => setRating(Number(e.target.value))} />
          {field('bankName', 'Bank')}
          {field('bankBranch', 'Branch')}
          {field('accountName', 'Account name')}
          {field('accountNo', 'Account no.', { inputMode: 'numeric' })}
          {field('ifsc', 'IFSC', { className: 'uppercase' })}
          <label className="col-span-3 flex items-center gap-2 self-end pb-2 text-base">
            <input type="checkbox" checked={tds} onChange={(e) => setTds(e.target.checked)} className="accent-primary" />
            TDS declaration received
          </label>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Vehicles they run</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {allVehicles.map((x) => (
              <label key={x} className="flex items-center gap-1.5 text-base">
                <input type="checkbox" checked={vehicles.includes(x)} onChange={(e) => setVehicles((vs) => (e.target.checked ? [...vs, x] : vs.filter((y) => y !== x)))} className="accent-primary" />
                {x}
              </label>
            ))}
          </div>
          {errors.vehicles && <p className="mt-1 text-sm text-primary">{errors.vehicles}</p>}
        </fieldset>
        <div>
          <p className="mb-1.5 text-sm font-medium">Operating cities</p>
          <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Operating cities">
            {cities.map((c) => (
              <span key={c.city} className="inline-flex items-center gap-1 rounded-full border border-border bg-page px-2.5 py-0.5 text-sm">
                {c.city}
                <button type="button" aria-label={`Remove ${c.city}`} className="text-faint hover:text-primary" onClick={() => setCities((cs) => cs.filter((x) => x.city !== c.city))}>
                  <X size={12} aria-hidden />
                </button>
              </span>
            ))}
            {!cities.length && <span className="text-sm text-muted">Only their own city.</span>}
          </div>
          <div className="w-[320px]">
            <Combo
              ariaLabel="Add operating city"
              placeholder="Add a city"
              value={null}
              options={cityOptions.filter((o) => !cities.some((c) => c.city === o.id))}
              onChange={(city) => {
                const c = meta?.cities.find((x) => x.city === city);
                if (c) setCities((cs) => [...cs, c]);
              }}
            />
          </div>
        </div>
        {transporter && (
          <label className="flex items-center gap-2 text-base">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" />
            Active (inactive ones aren’t offered on new rate comparisons)
          </label>
        )}
      </form>
    </Modal>
  );
}

/** Excel / CSV transporter import with a preview (legacy handleXlsxUpload). */
function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const imp = useImportTransporters();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TransporterImportResult | null>(null);
  useEffect(() => {
    if (open) {
      setFile(null);
      setPreview(null);
    }
  }, [open]);
  async function pick(f: File | null) {
    setFile(f);
    setPreview(null);
    if (!f) return;
    try {
      setPreview(await imp.mutateAsync({ file: f, commit: false }));
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t read the file', description: errorMessage(err) });
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Import transporters"
      description="Columns: Name, Mobile, City (required); Contact, Mobile2, Email, Address, State, Pincode, GST, PAN, TDS (Yes / No), Credit, Vehicles and OpCities (comma-separated)."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!preview?.valid}
            loading={imp.isPending}
            onClick={() =>
              void imp
                .mutateAsync({ file: file!, commit: true })
                .then((r) => {
                  toast({ tone: 'success', title: `${r.imported} transporters imported` });
                  onClose();
                })
                .catch((err) => toast({ tone: 'error', title: 'Import failed', description: errorMessage(err) }))
            }
          >
            Import {preview?.valid ?? 0} transporters
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <input type="file" accept=".xlsx,.xls,.csv" aria-label="Transporter sheet" className="text-sm" onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
        {preview && (
          <>
            <p className="text-base">
              {preview.total} rows · <strong>{preview.valid} valid</strong>
            </p>
            <div className="max-h-80 overflow-auto rounded border border-border">
              <table className="w-full text-sm" aria-label="Import preview">
                <thead className="sticky top-0 bg-page text-label font-semibold uppercase tracking-label text-muted">
                  <tr>
                    <th className="px-3 py-1.5 text-left">Row</th>
                    <th className="px-3 py-1.5 text-left">Name</th>
                    <th className="px-3 py-1.5 text-left">Mobile</th>
                    <th className="px-3 py-1.5 text-left">City</th>
                    <th className="px-3 py-1.5 text-left">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.row} className="border-t border-divider">
                      <td className="px-3 py-1.5 tabular-nums text-muted">{r.row}</td>
                      <td className="px-3 py-1.5">{r.name || '—'}</td>
                      <td className="px-3 py-1.5 tabular-nums">{r.phone || '—'}</td>
                      <td className="px-3 py-1.5">{[r.city, r.state].filter(Boolean).join(', ') || '—'}</td>
                      <td className="px-3 py-1.5">{r.error ? <Pill tone="red">{r.error}</Pill> : <Pill tone="green">OK</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Transporter master (legacy Transporters): search, state / vehicle / operating-city filters, import and export. */
export function TransportersPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const meta = useTransportMeta().data;
  const url = useUrlState(['state', 'vehicle', 'city', 'active', 'new'] as const);
  const [search, setSearch] = useSearchParam(url);
  const v = url.values;
  const list = useTransporters({ q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE, filters: { state: v.state || undefined, vehicle: v.vehicle || undefined, operatesIn: v.city || undefined, active: v.active || undefined } });
  const remove = useDeleteTransporter();
  const [form, setForm] = useState<Transporter | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [toDelete, setToDelete] = useState<Transporter | null>(null);
  const states = useMemo(() => [...new Set((meta?.cities ?? []).map((c) => c.state).filter((s): s is string => !!s))].sort(), [meta?.cities]);
  useEffect(() => {
    if (v.new && canDo('edit')) {
      setForm('new');
      url.set({ new: null });
    }
  }, [v.new]);

  const columns: Column<Transporter>[] = [
    {
      id: 'name',
      header: 'Transporter',
      cell: (t) => (
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{t.name}</span>
          <span className="font-mono text-caption text-faint">{t.code}</span>
        </span>
      ),
    },
    {
      id: 'contact',
      header: 'Contact',
      width: '170px',
      cell: (t) => (
        <span className="flex flex-col leading-tight">
          <span className="text-sm">{t.contactPerson ?? '—'}</span>
          <span className="text-caption tabular-nums text-faint">{t.phone}</span>
        </span>
      ),
    },
    { id: 'city', header: 'City', width: '170px', className: 'text-sm', cell: (t) => [t.city, t.state].filter(Boolean).join(', ') },
    { id: 'veh', header: 'Vehicles', width: '220px', className: 'text-sm', cell: (t) => t.vehicles.join(', ') },
    { id: 'op', header: 'Operating cities', width: '200px', className: 'text-sm text-muted', cell: (t) => t.operatingCities.map((c) => c.city).join(', ') || '—' },
    { id: 'credit', header: 'Credit', width: '120px', className: 'text-sm', cell: (t) => t.creditTerms },
    { id: 'rating', header: 'Rating', width: '100px', className: 'text-amber', cell: (t) => <span aria-label={`${t.rating} of 5`}>{stars(t.rating)}</span> },
    { id: 'st', header: 'Status', width: '90px', cell: (t) => (t.active ? <Pill tone="green">Active</Pill> : <Pill>Inactive</Pill>) },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (t) => (
        <span onClick={(e) => e.stopPropagation()}>
          <RowMenu label={`Actions for ${t.name}`}>
            {(close) => (
              <>
                {canDo('print') && (
                  <MenuItem icon={Printer} onClick={runAndClose(close, () => void printTransporter(t))}>
                    Print profile
                  </MenuItem>
                )}
                {canDo('edit') && (
                  <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(t))}>
                    Edit
                  </MenuItem>
                )}
                {canDo('delete') && (
                  <>
                    <MenuSeparator />
                    <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(t))}>
                      Delete
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </RowMenu>
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Transporters"
        description="Who can carry what, where. Rate comparisons offer the active ones that run the inquiry’s vehicle."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => void exportTransport('transporters').catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <>
                <Button icon={Upload} onClick={() => setImporting(true)}>
                  Import
                </Button>
                <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                  Add transporter
                </Button>
              </>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search" icon={Search} placeholder="Name, code, phone, city, GST" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[260px]" />
        <Input aria-label="Operating city" placeholder="Operates in (city)" value={v.city} onChange={(e) => url.set({ city: e.target.value })} containerClassName="w-[180px]" />
        <Select aria-label="State" placeholder="All states" options={states.map((s) => ({ value: s, label: s }))} value={v.state} onChange={(e) => url.set({ state: e.target.value })} containerClassName="w-[170px]" />
        <Select aria-label="Vehicle" placeholder="All vehicles" options={(meta?.vehicles ?? []).map((x) => ({ value: x, label: x }))} value={v.vehicle} onChange={(e) => url.set({ vehicle: e.target.value })} containerClassName="w-[170px]" />
        <Select
          aria-label="Active"
          placeholder="Active and inactive"
          options={[
            { value: 'true', label: 'Active' },
            { value: 'false', label: 'Inactive' },
          ]}
          value={v.active}
          onChange={(e) => url.set({ active: e.target.value })}
          containerClassName="w-[180px]"
        />
      </div>
      <DataTable
        label="Transporters"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(t) => t.id}
        minWidth={1300}
        loading={list.isLoading}
        onRowClick={canDo('edit') ? (t) => setForm(t) : undefined}
        empty={<EmptyState icon={Truck} title="No transporters" description="Add them one by one or import a sheet." />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <TransporterForm open={form !== null} transporter={form === 'new' ? null : form} onClose={() => setForm(null)} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.name ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: 'Deleted' }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        Transporters who have quoted can only be marked inactive.
      </ConfirmDialog>
    </div>
  );
}

/** Vehicle type master (legacy VEHICLES): names offered on inquiries and transporters. */
export function VehiclesPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const list = useVehicles();
  const save = useSaveVehicle();
  const remove = useDeleteVehicle();
  const [form, setForm] = useState<VehicleType | 'new' | null>(null);
  const [v, setV] = useState({ name: '', description: '', capacity: '', active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<VehicleType | null>(null);
  useEffect(() => {
    const x = form === 'new' ? null : form;
    setV({ name: x?.name ?? '', description: x?.description ?? '', capacity: x?.capacity ?? '', active: x?.active ?? true });
    setErrors({});
  }, [form]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await save.mutateAsync({ id: form === 'new' ? null : form?.id, input: { name: v.name, description: v.description || null, capacity: v.capacity || null, active: v.active } });
      toast({ tone: 'success', title: 'Vehicle type saved' });
      setForm(null);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  };
  const columns: Column<VehicleType>[] = [
    { id: 'name', header: 'Vehicle type', className: 'font-medium', cell: (x) => x.name },
    { id: 'desc', header: 'Description', className: 'text-sm', cell: (x) => x.description ?? '—' },
    { id: 'cap', header: 'Capacity', width: '130px', className: 'text-sm', cell: (x) => x.capacity ?? '—' },
    { id: 'st', header: 'Status', width: '100px', cell: (x) => (x.active ? <Pill tone="green">Active</Pill> : <Pill>Inactive</Pill>) },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (x) =>
        (canDo('edit') || canDo('delete')) && (
          <span onClick={(e) => e.stopPropagation()}>
            <RowMenu label={`Actions for ${x.name}`}>
              {(close) => (
                <>
                  {canDo('edit') && (
                    <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(x))}>
                      Edit
                    </MenuItem>
                  )}
                  {canDo('delete') && (
                    <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(x))}>
                      Delete
                    </MenuItem>
                  )}
                </>
              )}
            </RowMenu>
          </span>
        ),
    },
  ];
  return (
    <div className="flex max-w-4xl flex-col gap-3.5 p-6">
      <PageHeader
        title="Vehicle types"
        description="Offered on inquiries and transporters. Renaming one renames it on transporters; types used on inquiries can only be deactivated."
        actions={
          canDo('edit') && (
            <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
              Add vehicle type
            </Button>
          )
        }
      />
      <DataTable label="Vehicle types" columns={columns} rows={(list.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name))} getRowId={(x) => x.id} minWidth={640} loading={list.isLoading} onRowClick={canDo('edit') ? (x) => setForm(x) : undefined} empty={<EmptyState icon={Truck} title="No vehicle types" />} />
      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        size="sm"
        title={form === 'new' ? 'Add vehicle type' : 'Edit vehicle type'}
        footer={
          <>
            <Button onClick={() => setForm(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="tr-vehicle-form" loading={save.isPending}>
              Save
            </Button>
          </>
        }
      >
        <form id="tr-vehicle-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <Input label="Name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={errors.name} placeholder="32FT (10T)" />
          <Input label="Description" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} error={errors.description} />
          <Input label="Capacity" value={v.capacity} onChange={(e) => setV({ ...v, capacity: e.target.value })} error={errors.capacity} placeholder="10 Ton" />
          <label className="flex items-center gap-2 text-base">
            <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} className="accent-primary" />
            Active
          </label>
        </form>
      </Modal>
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.name ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: 'Deleted' }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        This can’t be undone.
      </ConfirmDialog>
    </div>
  );
}
