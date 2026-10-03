import { Ban, Download, FileText, IndianRupee, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { DELIVERY_TYPES, FREIGHT_PAID_BY, INQUIRY_STATUSES, INQUIRY_STATUS_LABEL, routeOf, type InquiryView, type Place } from '@contracts/transport';
import { useSession } from '@/app/session';
import { Button, Combo, DataTable, EmptyState, Input, MenuItem, Modal, Pagination, Select, Textarea, useToast, type Column } from '@/components/ui';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportTransport, useCancelInquiry, useInquiries, useInquiry, useSaveInquiry, useTransportMeta } from '../api';
import { d, inr, InquiryPill, rupeesText, toPaise, weight } from '../ui';

const PAGE_SIZE = 25;
type Values = Record<string, string>;
const EMPTY_PLACE = { city: '', state: '', pincode: '' };

/** City from the city master (fills state and the first pincode); the pincode stays editable (legacy city / pincode pickers). */
function PlaceField({ label, value, onChange, error }: { label: string; value: typeof EMPTY_PLACE; onChange: (p: typeof EMPTY_PLACE) => void; error?: string }) {
  const cities = useTransportMeta().data?.cities ?? [];
  const options = useMemo(() => cities.map((c) => ({ id: c.city, label: c.city, hint: c.state })), [cities]);
  return (
    <div className="grid grid-cols-[1fr_120px] items-start gap-2">
      <Combo
        label={label}
        value={value.city || null}
        options={value.city && !options.some((o) => o.id === value.city) ? [{ id: value.city, label: value.city, hint: value.state }, ...options] : options}
        placeholder="Search city"
        error={error}
        onChange={(city) => {
          const c = cities.find((x) => x.city === city);
          onChange({ city: city ?? '', state: c?.state ?? '', pincode: c?.pincode ?? '' });
        }}
      />
      <Input label="Pincode" inputMode="numeric" maxLength={6} value={value.pincode} onChange={(e) => onChange({ ...value, pincode: e.target.value.replace(/\D/g, '') })} />
    </div>
  );
}

const toPlace = (p: Place | undefined) => (p ? { city: p.city, state: p.state ?? '', pincode: p.pincode ?? '' } : { ...EMPTY_PLACE });
const fromPlace = (p: typeof EMPTY_PLACE) => ({ city: p.city, state: p.state || null, pincode: p.pincode || null });

/** New / edit inquiry (legacy openNewInquiry). */
export function InquiryForm({ open, inquiry, onClose, onSaved }: { open: boolean; inquiry: InquiryView | null; onClose: () => void; onSaved?: (i: InquiryView) => void }) {
  const toast = useToast();
  const meta = useTransportMeta().data;
  const save = useSaveInquiry();
  const [v, setV] = useState<Values>({});
  const [from, setFrom] = useState(EMPTY_PLACE);
  const [to, setTo] = useState(EMPTY_PLACE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    const i = inquiry;
    setV({
      date: i?.date ?? meta?.today ?? '',
      material: i?.material ?? '',
      weightMt: i?.weightMt?.toString() ?? '',
      vehicle: i?.vehicle ?? '',
      pickupDate: i?.pickupDate ?? '',
      deliveryType: i?.deliveryType ?? 'Door Delivery',
      freightPaidBy: i?.freightPaidBy ?? 'Strandply',
      budget: rupeesText(i?.budgetPaise),
      remarks: i?.remarks ?? '',
    });
    setFrom(toPlace(i?.from));
    setTo(toPlace(i?.to));
    setErrors({});
  }, [open, inquiry, meta?.today]);
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input = {
      date: v.date || null,
      from: fromPlace(from),
      to: fromPlace(to),
      material: v.material,
      weightMt: v.weightMt || null,
      vehicle: v.vehicle,
      pickupDate: v.pickupDate || null,
      deliveryType: v.deliveryType,
      freightPaidBy: v.freightPaidBy,
      budgetPaise: toPaise(v.budget ?? ''),
      remarks: v.remarks || null,
    };
    try {
      const saved = await save.mutateAsync({ id: inquiry?.id, input });
      toast({ tone: 'success', title: inquiry ? 'Inquiry saved' : `${saved.inqNo} created` });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }

  const vehicles = [...new Set([...(meta?.vehicles ?? []), ...(v.vehicle ? [v.vehicle] : [])])];
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={inquiry ? `Edit ${inquiry.inqNo}` : 'New freight inquiry'}
      description="Route, material and vehicle to ask transporters for rates."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="tr-inquiry-form" loading={save.isPending}>
            {inquiry ? 'Save' : 'Create inquiry'}
          </Button>
        </>
      }
    >
      <form id="tr-inquiry-form" onSubmit={(e) => void submit(e)} className="grid grid-cols-2 items-start gap-3">
        <Input label="Date" type="date" value={v.date ?? ''} onChange={set('date')} error={errors.date} />
        <Input label="Loading date" type="date" value={v.pickupDate ?? ''} onChange={set('pickupDate')} error={errors.pickupDate} />
        <PlaceField label="From" value={from} onChange={setFrom} error={errors['from.city'] ?? errors.from} />
        <PlaceField label="To" value={to} onChange={setTo} error={errors['to.city'] ?? errors.to} />
        <Input label="Material" value={v.material ?? ''} onChange={set('material')} error={errors.material} placeholder="OSB 18mm, 8x4" />
        <Input label="Weight" inputMode="decimal" suffix="MT" value={v.weightMt ?? ''} onChange={set('weightMt')} error={errors.weightMt} />
        <Select label="Vehicle type" placeholder="Pick a vehicle" options={vehicles.map((x) => ({ value: x, label: x }))} value={v.vehicle ?? ''} onChange={set('vehicle')} error={errors.vehicle} />
        <Input label="Budget" inputMode="decimal" suffix="₹" value={v.budget ?? ''} onChange={set('budget')} error={errors.budgetPaise} hint="Optional. Picking a rate above it needs a reason." />
        <Select label="Delivery" options={DELIVERY_TYPES.map((x) => ({ value: x, label: x }))} value={v.deliveryType ?? ''} onChange={set('deliveryType')} />
        <Select label="Freight paid by" options={FREIGHT_PAID_BY.map((x) => ({ value: x, label: x }))} value={v.freightPaidBy ?? ''} onChange={set('freightPaidBy')} />
        <div className="col-span-2">
          <Textarea label="Remarks" rows={2} value={v.remarks ?? ''} onChange={set('remarks')} error={errors.remarks} />
        </div>
      </form>
    </Modal>
  );
}

/** Freight inquiries (legacy Inquiries): the start of the flow. */
export function InquiriesPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { canDo } = useSession();
  const url = useUrlState(['status', 'from', 'to', 'new'] as const);
  const [search, setSearch] = useSearchParam(url);
  const v = url.values;
  const list = useInquiries({ q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE, filters: { status: v.status || undefined, from: v.from || undefined, to: v.to || undefined } });
  const opened = useInquiry(url.open);
  const cancel = useCancelInquiry();
  const [form, setForm] = useState<InquiryView | 'new' | null>(null);

  useEffect(() => {
    if (v.new && canDo('edit')) {
      setForm('new');
      url.set({ new: null });
    }
  }, [v.new]);
  const editable = (i: InquiryView) => i.status !== 'cancelled' && (!i.rcStatus || i.rcStatus === 'draft' || i.rcStatus === 'rejected');
  const rates = (i: InquiryView) => navigate(i.rcId ? `/transport/rates?open=${i.rcId}` : `/transport/rates?inquiry=${i.id}`);
  // ?open= (from the flow chain): edit it while its details are open, otherwise go to its comparison.
  useEffect(() => {
    if (!url.open || !opened.data) return;
    if (canDo('edit') && editable(opened.data)) setForm(opened.data);
    else rates(opened.data);
    url.set({ open: null });
  }, [url.open, opened.data]);
  const toggle = (i: InquiryView, c: boolean) =>
    void cancel
      .mutateAsync({ id: i.id, cancel: c })
      .then(() => toast({ tone: 'success', title: `${i.inqNo} ${c ? 'cancelled' : 'reopened'}` }))
      .catch((err) => toast({ tone: 'error', title: 'Couldn’t change', description: errorMessage(err) }));

  const columns: Column<InquiryView>[] = [
    {
      id: 'no',
      header: 'Inquiry',
      width: '130px',
      cell: (i) => (
        <span className="flex flex-col leading-tight">
          <span className="font-mono text-sm font-semibold">{i.inqNo}</span>
          <span className="text-caption text-faint">{d(i.date)}</span>
        </span>
      ),
    },
    {
      id: 'route',
      header: 'Route',
      cell: (i) => (
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{routeOf(i.from, i.to)}</span>
          <span className="text-caption text-faint">
            {i.from.pincode ?? '—'} → {i.to.pincode ?? '—'}
          </span>
        </span>
      ),
    },
    { id: 'mat', header: 'Material', width: '170px', className: 'text-sm', cell: (i) => `${i.material} · ${weight(i.weightMt)}` },
    { id: 'veh', header: 'Vehicle', width: '140px', className: 'text-sm', cell: (i) => i.vehicle },
    { id: 'pick', header: 'Loading', width: '110px', className: 'text-sm tabular-nums', cell: (i) => d(i.pickupDate) },
    { id: 'budget', header: 'Budget', width: '110px', align: 'right', className: 'tabular-nums', cell: (i) => (i.budgetPaise ? inr(i.budgetPaise) : '—') },
    { id: 'status', header: 'Status', width: '130px', cell: (i) => <InquiryPill s={i.status} /> },
    { id: 'link', header: 'Rates / order', width: '130px', className: 'font-mono text-caption', cell: (i) => i.orderNo ?? i.rcNo ?? '—' },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (i) => (
        <span onClick={(e) => e.stopPropagation()}>
          <RowMenu label={`Actions for ${i.inqNo}`}>
            {(close) => (
              <>
                {i.status !== 'cancelled' && (
                  <MenuItem icon={IndianRupee} onClick={runAndClose(close, () => rates(i))}>
                    {i.rcId ? 'Open rate comparison' : 'Compare rates'}
                  </MenuItem>
                )}
                {canDo('edit') && editable(i) && (
                  <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(i))}>
                    Edit
                  </MenuItem>
                )}
                {canDo('edit') && i.status === 'cancelled' && (
                  <MenuItem icon={RotateCcw} onClick={runAndClose(close, () => toggle(i, false))}>
                    Reopen
                  </MenuItem>
                )}
                {canDo('edit') && i.status !== 'cancelled' && i.status !== 'ordered' && i.rcStatus !== 'pending' && (
                  <MenuItem icon={Ban} className="text-primary" onClick={runAndClose(close, () => toggle(i, true))}>
                    Cancel inquiry
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
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Freight inquiries"
        description="Inquiry → rate comparison → approval → order form. Each inquiry gets one rate comparison."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => void exportTransport('inquiries', { from: v.from || undefined, to: v.to || undefined }).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                New inquiry
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search" icon={Search} placeholder="Inquiry no., material" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[240px]" />
        <Select aria-label="Status" placeholder="All statuses" options={INQUIRY_STATUSES.map((s) => ({ value: s, label: INQUIRY_STATUS_LABEL[s] }))} value={v.status} onChange={(e) => url.set({ status: e.target.value })} containerClassName="w-[170px]" />
        <Input aria-label="From date" type="date" value={v.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={v.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
      </div>
      <DataTable
        label="Freight inquiries"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(i) => i.id}
        minWidth={1150}
        loading={list.isLoading}
        onRowClick={(i) => i.status !== 'cancelled' && rates(i)}
        empty={<EmptyState icon={FileText} title="No inquiries yet" description="Create one to start comparing transporter rates." />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <InquiryForm open={form !== null} inquiry={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={(i) => form === 'new' && navigate(`/transport/rates?inquiry=${i.id}`)} />
    </div>
  );
}
