import { useEffect, useState, type FormEvent } from 'react';
import {
  DISPATCH_MODES,
  DISPATCH_STATUSES,
  type DispatchDraft,
  type DispatchInput,
  type DispatchMode,
  type DispatchStatus,
  type DispatchView,
} from '@contracts/sampletrack';
import { Button, Input, Modal, Select, useToast } from '@/components/ui';
import { useCourierOptions, useCreateDispatch, useLinkableRequests, useUpdateDispatch } from '../api';
import { errorMessage, fieldErrors } from '../ui/errors';
import { PartyPicker, type PickedParty } from '../ui/PartyPicker';

const MANUAL = '__manual';
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const rupees = (paise: number) => (paise ? String(paise / 100) : '');

/**
 * New / edit dispatch (legacy openDispModal / editDisp / saveDispatch).
 * The courier list follows the mode (Hand Delivery lists every active courier); "Other" takes a typed name.
 * A changed status is saved through the same path as a quick update, so it lands in the history.
 */
export function DispatchForm({
  open,
  dispatch,
  draft,
  onClose,
  onSaved,
}: {
  open: boolean;
  dispatch: DispatchView | null;
  /** Prefill from "Create dispatch from request". */
  draft?: DispatchDraft | null;
  onClose: () => void;
  onSaved: (d: DispatchView) => void;
}) {
  const toast = useToast();
  const create = useCreateDispatch();
  const update = useUpdateDispatch();

  const [date, setDate] = useState(todayIso());
  const [party, setParty] = useState<PickedParty | null>(null);
  const [mode, setMode] = useState<DispatchMode>('Courier');
  const [courierChoice, setCourierChoice] = useState('');
  const [courierManual, setCourierManual] = useState('');
  const [trackingNo, setTrackingNo] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [driver, setDriver] = useState('');
  const [expected, setExpected] = useState('');
  const [freight, setFreight] = useState('');
  const [weight, setWeight] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [contents, setContents] = useState('');
  const [linkedRequestId, setLinkedRequestId] = useState('');
  const [status, setStatus] = useState<DispatchStatus>('Pending');
  const [statusNote, setStatusNote] = useState('');
  const [remarks, setRemarks] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const couriers = useCourierOptions(mode).data ?? [];
  const requests = useLinkableRequests(party?.id).data ?? [];

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setStatusNote('');
    const d = dispatch;
    setDate(d?.date ?? todayIso());
    setParty(d ? { id: d.partyId, name: d.partyName, city: d.partyCity } : draft ? { id: draft.partyId, name: draft.partyName, city: null } : null);
    setMode(d?.mode ?? 'Courier');
    setCourierChoice(d?.courierId ?? (d?.courierNameManual ? MANUAL : ''));
    setCourierManual(d?.courierNameManual ?? '');
    setTrackingNo(d?.trackingNo ?? '');
    setVehicleNo(d?.vehicleNo ?? '');
    setDriver(d?.driverDetails ?? '');
    setExpected(d?.expectedDeliveryDate ?? '');
    setFreight(d ? rupees(d.freightPaise) : '');
    setWeight(d?.weightKg ? String(d.weightKg) : '');
    setDimensions(d?.dimensions ?? '');
    setContents(d?.productDescription ?? draft?.productDescription ?? '');
    setLinkedRequestId(d?.linkedRequestId ?? draft?.linkedRequestId ?? '');
    setStatus(d?.status ?? 'Pending');
    setRemarks(d?.remarks ?? '');
  }, [open, dispatch, draft]);

  function onModeChange(m: DispatchMode) {
    setMode(m);
    // A master courier of another type no longer fits; keep a typed name.
    if (courierChoice !== MANUAL) setCourierChoice('');
  }

  function onRequestChange(id: string) {
    setLinkedRequestId(id);
    const r = requests.find((x) => x.id === id);
    if (r && !contents.trim()) setContents(r.productSummary);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    const kg = Number(weight);
    if (!party) local.partyId = 'Select a party';
    if (!weight || !Number.isFinite(kg) || kg <= 0) local.weightKg = 'Weight must be more than 0 kg';
    if (courierChoice === MANUAL && !courierManual.trim()) local.courierNameManual = 'Type the courier or transporter name';
    if (!courierChoice && mode !== 'Hand Delivery') local.courierId = `Select a ${mode.toLowerCase()} or choose “Other”`;
    const rs = freight.trim() ? Number(freight) : 0;
    if (!Number.isFinite(rs) || rs < 0) local.freightPaise = 'Enter the freight in rupees';
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    const input: DispatchInput = {
      date,
      partyId: party!.id,
      mode,
      courierId: courierChoice && courierChoice !== MANUAL ? courierChoice : null,
      courierNameManual: courierChoice === MANUAL ? courierManual.trim() : null,
      trackingNo: trackingNo || null,
      vehicleNo: vehicleNo || null,
      driverDetails: driver || null,
      expectedDeliveryDate: expected || null,
      freightPaise: Math.round(rs * 100),
      weightKg: kg,
      dimensions: dimensions || null,
      productDescription: contents || null,
      linkedRequestId: linkedRequestId || null,
      remarks: remarks || null,
      status,
    };
    try {
      const saved = dispatch
        ? await update.mutateAsync({ id: dispatch.id, input: { ...input, statusNote: status !== dispatch.status ? statusNote || null : undefined } })
        : await create.mutateAsync(input);
      toast({ tone: 'success', title: dispatch ? `${saved.dspNo} updated` : `Dispatch ${saved.dspNo} created` });
      onSaved(saved);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save the dispatch', description: errorMessage(err) });
    }
  }

  const courierOptions = [
    ...couriers.map((c) => ({ value: c.id, label: c.type === mode || mode === 'Hand Delivery' ? c.name : `${c.name} (${c.type})` })),
    { value: MANUAL, label: 'Other (type the name)…' },
  ];
  // When editing, the saved courier may have become inactive and dropped out of the list: keep it visible.
  if (dispatch?.courierId && courierChoice === dispatch.courierId && !couriers.some((c) => c.id === dispatch.courierId)) {
    courierOptions.unshift({ value: dispatch.courierId, label: dispatch.courierName ?? 'Saved courier' });
  }
  const requestOptions = requests.map((r) => ({ value: r.id, label: `${r.reqNo} · ${r.status} · ${r.productSummary}`.slice(0, 90) }));
  if (linkedRequestId && !requests.some((r) => r.id === linkedRequestId)) {
    requestOptions.unshift({ value: linkedRequestId, label: dispatch?.linkedRequestNo ?? draft?.linkedRequestNo ?? 'Linked request' });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={dispatch ? `Edit ${dispatch.dspNo}` : 'New dispatch'}
      description={
        dispatch
          ? 'A status change is recorded in the history, and a linked request follows it.'
          : draft
            ? `From ${draft.linkedRequestNo} (${draft.requestStatus}). The dispatch number is given when you save.`
            : 'The dispatch number is given when you save.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="dispatch-form" loading={create.isPending || update.isPending}>
            {dispatch ? 'Save changes' : 'Create dispatch'}
          </Button>
        </>
      }
    >
      <form id="dispatch-form" onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3" noValidate>
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        <div className="sm:col-span-2">
          <PartyPicker
            value={party}
            onChange={(p) => {
              setParty(p);
              if (!p || p.id !== party?.id) setLinkedRequestId('');
            }}
            error={errors.partyId}
          />
        </div>

        <Select label="Mode" options={DISPATCH_MODES.map((m) => ({ value: m, label: m }))} value={mode} onChange={(e) => onModeChange(e.target.value as DispatchMode)} />
        <Select
          label={mode === 'Hand Delivery' ? 'Courier (optional)' : mode === 'Courier' ? 'Courier' : mode === 'Bus' ? 'Bus service' : 'Transporter'}
          placeholder={mode === 'Hand Delivery' ? 'None' : 'Select…'}
          options={courierOptions}
          value={courierChoice}
          onChange={(e) => setCourierChoice(e.target.value)}
          error={errors.courierId}
        />
        {courierChoice === MANUAL ? (
          <Input label="Courier name" placeholder="Courier / transport name" value={courierManual} onChange={(e) => setCourierManual(e.target.value)} error={errors.courierNameManual} />
        ) : (
          <Input label="Tracking no." placeholder="AWB / docket number" value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} />
        )}
        {courierChoice === MANUAL && (
          <Input label="Tracking no." placeholder="AWB / docket number" value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} />
        )}
        <Input label="Vehicle no." placeholder="GJ-03-AB-1234" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
        <Input label="Driver" placeholder="Name / mobile" value={driver} onChange={(e) => setDriver(e.target.value)} />

        <Input label="Expected delivery" type="date" min={date} value={expected} onChange={(e) => setExpected(e.target.value)} error={errors.expectedDeliveryDate} />
        <Input label="Weight" type="number" inputMode="decimal" min="0" step="0.1" placeholder="0.0" suffix="kg" value={weight} onChange={(e) => setWeight(e.target.value)} error={errors.weightKg} />
        <Input label="Freight" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0" suffix="₹" value={freight} onChange={(e) => setFreight(e.target.value)} error={errors.freightPaise} />

        <Input label="Dimensions" placeholder="120×90×20 cm" value={dimensions} onChange={(e) => setDimensions(e.target.value)} />
        <Input label="Contents" placeholder="OSB 18mm 8x4 — 5 sheets" value={contents} onChange={(e) => setContents(e.target.value)} containerClassName="sm:col-span-2" />

        <Select
          label="Linked request"
          placeholder={party ? (requests.length ? 'None' : 'No open requests for this party') : 'Pick a party first'}
          options={requestOptions}
          value={linkedRequestId}
          onChange={(e) => onRequestChange(e.target.value)}
          disabled={!party}
          error={errors.linkedRequestId}
          containerClassName="sm:col-span-2"
        />
        <Select label="Status" options={DISPATCH_STATUSES.map((s) => ({ value: s, label: s }))} value={status} onChange={(e) => setStatus(e.target.value as DispatchStatus)} />
        {dispatch && status !== dispatch.status && (
          <Input label="Status note" placeholder="Why it changed (goes in the history)" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} containerClassName="sm:col-span-3" />
        )}
        <Input label="Remarks" placeholder="Internal notes" value={remarks} onChange={(e) => setRemarks(e.target.value)} containerClassName="sm:col-span-3" />
      </form>
    </Modal>
  );
}
