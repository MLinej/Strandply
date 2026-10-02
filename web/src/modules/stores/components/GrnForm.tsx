import { CircleAlert, CircleCheck, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { QUALITY_STATUSES, STORE_MATERIALS, STORE_UNITS, type GrnView, type MrnView, type QualityStatus, type StoreMaterial, type StoreUnit } from '@contracts/stores';
import { useSession } from '@/app/session';
import { Button, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useDebounced } from '../../samples/ui/list-state';
import { useInvoiceLink, useMrn, useMrns, useSaveGrn, useStoresMeta } from '../api';
import { printGrn } from '../print';
import { dateTime, itemsSummary, materialLabel, qtyFmt } from '../ui';

type Line = {
  key: string;
  id: string | null;
  mrnItemId: string | null;
  material: StoreMaterial | '';
  approxQty: number;
  approxUnit: StoreUnit | null;
  actualQty: string;
  unit: StoreUnit;
  quality: QualityStatus;
  qualityRemarks: string;
};
type Form = { mrnId: string; date: string; time: string; vendorName: string; invoiceNo: string; receivedByName: string; remarks: string; lines: Line[] };

let seq = 0;
const line = (over: Partial<Line> = {}): Line => ({
  key: `g${++seq}`,
  id: null,
  mrnItemId: null,
  material: '',
  approxQty: 0,
  approxUnit: null,
  actualQty: '',
  unit: 'Kg',
  quality: 'ok',
  qualityRemarks: '',
  ...over,
});
const linesFromMrn = (m: MrnView) => m.items.map((it) => line({ mrnItemId: it.id, material: it.material, approxQty: it.approxQty, approxUnit: it.unit, unit: it.unit }));

function InvoiceBadge({ invoiceNo, vendorName }: { invoiceNo: string; vendorName: string }) {
  const match = useInvoiceLink(useDebounced(invoiceNo.trim()), useDebounced(vendorName.trim())).data;
  if (!invoiceNo.trim() || match === undefined) return null;
  return match ? (
    <p className="mt-1 flex items-start gap-1.5 text-caption text-green">
      <CircleCheck size={13} className="mt-px shrink-0" aria-hidden /> Matches Purchase entry {match.lotNo} ({materialLabel(match.material)}, {match.vendorName}, {formatDate(match.date)})
    </p>
  ) : (
    <p className="mt-1 flex items-start gap-1.5 text-caption text-amber">
      <CircleAlert size={13} className="mt-px shrink-0" aria-hidden /> Not in Purchase yet. Saved as a manual reference.
    </p>
  );
}

/**
 * Receiving against an MRN (legacy renderGrnForm). Lines start from the MRN; Stores enters what
 * actually came and its condition, and can add items that weren't on the gate entry.
 */
export function GrnForm({ open, grn, mrnId, onClose }: { open: boolean; grn: GrnView | null; mrnId?: string | null; onClose: () => void }) {
  const toast = useToast();
  const { canDo } = useSession();
  const meta = useStoresMeta().data;
  const save = useSaveGrn();
  const pending = useMrns({ filters: { status: 'pending_grn' }, sort: 'date', pageSize: 100 }, { enabled: open && !grn }).data?.rows ?? [];
  const [f, setF] = useState<Form>({ mrnId: '', date: '', time: '', vendorName: '', invoiceNo: '', receivedByName: '', remarks: '', lines: [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const auto = meta?.settings.autoPunchGrn ?? true;
  const mrn = useMrn(open ? (grn?.mrnId ?? (f.mrnId || null)) : null).data ?? null;
  /** The MRN whose lines are on screen, so a refetch doesn't wipe what was typed. */
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    loadedFor.current = grn?.mrnId ?? null;
    if (grn) {
      setF({
        mrnId: grn.mrnId,
        date: grn.date,
        time: grn.time,
        vendorName: grn.vendorName,
        invoiceNo: grn.invoiceNo,
        receivedByName: grn.receivedByName,
        remarks: grn.remarks ?? '',
        lines: grn.items.map((it) =>
          line({ id: it.id, mrnItemId: it.mrnItemId, material: it.material, approxQty: it.approxQty, approxUnit: it.mrnItemId ? it.unit : null, actualQty: String(it.actualQty), unit: it.unit, quality: it.quality, qualityRemarks: it.qualityRemarks ?? '' }),
        ),
      });
    } else {
      setF({ mrnId: mrnId ?? '', date: meta?.today ?? '', time: meta?.now ?? '', vendorName: '', invoiceNo: '', receivedByName: '', remarks: '', lines: [] });
    }
    // Only on open (see MrnForm).
  }, [open, grn, mrnId]);

  // A newly picked MRN (or the one passed in) fills the vendor, invoice and lines.
  useEffect(() => {
    if (!open || grn || !mrn || mrn.id !== f.mrnId || loadedFor.current === mrn.id) return;
    loadedFor.current = mrn.id;
    setF((x) => ({ ...x, vendorName: mrn.vendorName, invoiceNo: mrn.invoiceNo ?? '', lines: linesFromMrn(mrn) }));
  }, [open, grn, mrn, f.mrnId]);

  /** Editing a field clears its error. */
  const clear = (...keys: string[]) => setErrors((e) => (keys.some((k) => k in e) ? Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))) : e));
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => {
    clear(k);
    setF((x) => ({ ...x, [k]: v }));
  };
  const setLine = (key: string, patch: Partial<Line>, errorKey?: string) => {
    if (errorKey) clear(errorKey, 'items');
    setF((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!grn && !f.mrnId) local.mrnId = 'Pick the MRN this delivery came in on';
    if (!f.invoiceNo.trim()) local.invoiceNo = 'Invoice / bill number is required';
    if (!f.receivedByName.trim()) local.receivedByName = 'Received by is required';
    const lines = f.lines.filter((l) => Number(l.actualQty) > 0);
    if (f.mrnId && !lines.length) local.items = 'Enter the actual quantity for at least one item';
    f.lines.forEach((l, i) => {
      if (!l.mrnItemId && Number(l.actualQty) > 0 && !l.material) local[`items.${i}.material`] = 'Pick the material';
    });
    if (Object.keys(local).length) return setErrors(local);
    // Server paths index the lines sent, so map them back to the rows on screen.
    const rowOf = lines.map((l) => f.lines.indexOf(l));
    try {
      const saved = await save.mutateAsync({
        id: grn?.id,
        input: {
          ...(grn ? {} : { mrnId: f.mrnId }),
          ...(auto ? {} : { date: f.date, time: f.time }),
          vendorName: f.vendorName.trim(),
          invoiceNo: f.invoiceNo.trim(),
          receivedByName: f.receivedByName.trim(),
          remarks: f.remarks.trim() || null,
          items: lines.map((l) => ({
            id: l.id,
            mrnItemId: l.mrnItemId,
            material: l.mrnItemId ? null : (l.material as StoreMaterial),
            actualQty: Number(l.actualQty),
            unit: l.unit,
            quality: l.quality,
            qualityRemarks: l.qualityRemarks.trim() || null,
          })),
        },
      });
      toast({
        tone: 'success',
        title: grn ? `${saved.grnNo} updated` : `${saved.grnNo} saved as Draft`,
        description: grn?.status === 'reviewed' ? 'It needs review again.' : grn ? undefined : `${saved.items.length} item(s). It now goes for review and approval.`,
      });
      onClose();
      if (!grn && canDo('print')) await printGrn(saved.id).catch((err) => toast({ tone: 'error', title: 'Couldn’t print the GRN', description: errorMessage(err) }));
    } catch (err) {
      const fe = fieldErrors(err);
      for (const [k, v] of Object.entries(fe)) {
        const m = /^items\.(\d+)\.(.+)$/.exec(k);
        if (m) {
          delete fe[k];
          fe[`items.${rowOf[Number(m[1])]}.${m[2]}`] = v;
        }
      }
      setErrors(fe);
      toast({ tone: 'error', title: 'Couldn’t save the GRN', description: errorMessage(err) });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={grn ? `Edit ${grn.grnNo}` : 'New goods receipt (GRN)'}
      description={grn ? (grn.status === 'reviewed' ? 'Saving sends it back to Draft for review again.' : undefined) : meta ? `Next number ${meta.nextGrnNo}. Saved as Draft, then reviewed and approved.` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="grn-form" loading={save.isPending}>
            {grn ? 'Save changes' : 'Save GRN'}
          </Button>
        </>
      }
    >
      <form id="grn-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-4">
          {grn ? (
            <Input label="MRN" value={grn.mrnNo} readOnly containerClassName="sm:col-span-2" />
          ) : (
            <Select
              label="Pending MRN"
              placeholder={pending.length ? 'Select the MRN awaiting receiving' : 'No MRN is waiting: make a gate entry first'}
              options={pending.map((m) => ({ value: m.id, label: `${m.mrnNo} · ${m.vendorName} · ${itemsSummary(m.items)} (${formatDate(m.date)})` }))}
              value={f.mrnId}
              onChange={(e) => {
                clear('mrnId', 'items');
                setF((x) => ({ ...x, mrnId: e.target.value, lines: [] }));
              }}
              error={errors.mrnId}
              containerClassName="sm:col-span-2"
            />
          )}
          <Input label="Date" type="date" value={f.date} onChange={(e) => set('date')(e.target.value)} readOnly={auto} hint={auto ? 'Auto-punched' : undefined} error={errors.date} />
          <Input label="Time" type="time" value={f.time} onChange={(e) => set('time')(e.target.value)} readOnly={auto} error={errors.time} />
        </div>

        {mrn && (
          <div className="grid gap-x-6 gap-y-1 rounded bg-page px-3 py-2 text-sm sm:grid-cols-4">
            <span>
              <span className="text-faint">Gate entry </span>
              {dateTime(mrn.date, mrn.time)}
            </span>
            <span>
              <span className="text-faint">Vehicle </span>
              {mrn.vehicleNo}
            </span>
            <span>
              <span className="text-faint">Security </span>
              {mrn.securityName}
            </span>
            <span>
              <span className="text-faint">Driver </span>
              {mrn.driverName ?? '—'}
            </span>
            {mrn.remarks && <span className="sm:col-span-4 text-muted">Gate remarks: {mrn.remarks}</span>}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Vendor" value={f.vendorName} onChange={(e) => set('vendorName')(e.target.value)} error={errors.vendorName} />
          <div>
            <Input label="Invoice / bill no." placeholder="e.g. GT/1/26-27" value={f.invoiceNo} onChange={(e) => set('invoiceNo')(e.target.value)} error={errors.invoiceNo} hint="Covers every item on this GRN" />
            <InvoiceBadge invoiceNo={f.invoiceNo} vendorName={f.vendorName} />
          </div>
          <Input label="Received by" placeholder="Stores person" value={f.receivedByName} onChange={(e) => set('receivedByName')(e.target.value)} error={errors.receivedByName} />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label font-semibold uppercase tracking-label text-faint">Items received</legend>
          {errors.items && <p className="text-sm text-primary">{errors.items}</p>}
          {!f.mrnId && !grn && <p className="text-sm text-muted">Pick an MRN to load its items.</p>}
          {f.lines.map((l, i) => (
            <div key={l.key} className="flex flex-col gap-2 rounded border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">
                  Item {i + 1}
                  <span className="font-normal text-faint">{l.mrnItemId ? ' · from the MRN' : ' · unlisted, not on the MRN'}</span>
                </span>
                <Button variant="ghost" size="sm" icon={X} aria-label={`Remove item ${i + 1}`} onClick={() => setF((x) => ({ ...x, lines: x.lines.filter((y) => y.key !== l.key) }))} />
              </div>
              <div className="grid gap-2 sm:grid-cols-[1.3fr_1fr_1fr_0.8fr] [&>*]:min-w-0">
                {l.mrnItemId ? (
                  <Input label="Material" value={materialLabel(l.material)} readOnly />
                ) : (
                  <Select
                    label="Material (unlisted)"
                    placeholder="Select"
                    options={STORE_MATERIALS.map((m) => ({ value: m.id, label: m.label }))}
                    value={l.material}
                    onChange={(e) => setLine(l.key, { material: e.target.value as StoreMaterial }, `items.${i}.material`)}
                    error={errors[`items.${i}.material`]}
                  />
                )}
                <Input label="Approx (gate)" value={l.approxUnit ? `${qtyFmt(l.approxQty)} ${l.approxUnit}` : '—'} readOnly tabIndex={-1} />
                <Input
                  label="Actual qty"
                  aria-label={`Actual quantity, item ${i + 1}`}
                  inputMode="decimal"
                  value={l.actualQty}
                  onChange={(e) => setLine(l.key, { actualQty: e.target.value }, `items.${i}.actualQty`)}
                  error={errors[`items.${i}.actualQty`]}
                />
                <Select label="Unit" options={STORE_UNITS.map((u) => ({ value: u, label: u }))} value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value as StoreUnit })} />
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr] [&>*]:min-w-0">
                <Select label="Quality" options={QUALITY_STATUSES.map((q) => ({ value: q.id, label: q.label }))} value={l.quality} onChange={(e) => setLine(l.key, { quality: e.target.value as QualityStatus })} />
                <Input label="Quality remarks" placeholder="Shortage, damage…" value={l.qualityRemarks} onChange={(e) => setLine(l.key, { qualityRemarks: e.target.value })} />
              </div>
            </div>
          ))}
          {(f.mrnId || grn) && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" icon={Plus} onClick={() => setF((x) => ({ ...x, lines: [...x.lines, line({ unit: 'Nos' })] }))}>
                Add unlisted item
              </Button>
              {mrn && f.lines.filter((l) => l.mrnItemId).length < mrn.items.length && (
                <Button size="sm" variant="ghost" onClick={() => setF((x) => ({ ...x, lines: [...linesFromMrn(mrn).filter((n) => !x.lines.some((l) => l.mrnItemId === n.mrnItemId)), ...x.lines] }))}>
                  Restore MRN items
                </Button>
              )}
              <span className="text-caption text-faint">Rows left without an actual quantity are not saved.</span>
            </div>
          )}
        </fieldset>

        <Textarea label="Overall receiving remarks" rows={2} placeholder="Condition on opening, overall shortage or damage" value={f.remarks} onChange={(e) => set('remarks')(e.target.value)} />
      </form>
    </Modal>
  );
}
