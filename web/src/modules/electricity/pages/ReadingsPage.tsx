import { Download, Gauge, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { shiftOfTime, type ReadingView, type Shift } from '@contracts/electricity';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, KpiTile, Pagination, Pill, SegmentedControl, useToast, type Column } from '@/components/ui';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { useDebounced, useUrlState } from '../../samples/ui/list-state';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportElectricity, useAddReading, useDeleteReading, useElectricityMeta, useReadingPreview, useReadings } from '../api';
import { d, inr, kwh, PfCell, PfPill, perUnit } from '../ui';

const PAGE_SIZE = 25;
const nowTime = () => new Date().toTimeString().slice(0, 5);

/** Today's AM and PM readings and what the day has cost (legacy top status bar). */
function StatusStrip() {
  const m = useElectricityMeta().data;
  if (!m) return null;
  const s = m.status;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Today">
      <KpiTile variant="compact" label="AM reading" value={s.am ? kwh(s.am.kwh) : '—'} meta={s.am ? `at ${s.am.time}` : 'Not punched'} />
      <KpiTile variant="compact" label="PM reading" value={s.pm ? kwh(s.pm.kwh) : '—'} meta={s.pm ? `at ${s.pm.time}` : 'Not punched'} />
      <KpiTile variant="compact" label="Today PM − AM" value={s.diff === null ? '—' : `${kwh(s.diff)} kWh`} meta={s.net === null ? '' : `Net ${kwh(s.net)} kWh (×${m.rates.mf})`} />
      <KpiTile variant="compact" label="Today’s cost" value={s.costPaise === null ? '—' : inr(s.costPaise)} meta="Energy + fuel + fixed" />
      <KpiTile variant="compact" label="Latest PF" value={s.pf === null ? '—' : s.pf.toFixed(3)} />
      <KpiTile variant="compact" label="Rates today" value={`×${m.rates.mf}`} meta={`${perUnit(m.rates.energyPaise)} + ${perUnit(m.rates.fuelPaise)} fuel`} />
    </div>
  );
}

/** Punch a reading (legacy Meter Reading Punch), with the cost preview before saving. */
function PunchForm() {
  const toast = useToast();
  const meta = useElectricityMeta().data;
  const add = useAddReading();
  const [v, setV] = useState({ date: '', time: nowTime(), kwh: '', pf: '', nightKwh: '', remarks: '' });
  const [shift, setShift] = useState<Shift>(shiftOfTime(nowTime()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (meta && !v.date) setV((x) => ({ ...x, date: meta.today }));
  }, [meta?.today]);
  const q = useDebounced({ date: v.date, time: v.time, kwh: v.kwh }, 250);
  const preview = useReadingPreview(q).data;
  const showPreview = Number(v.kwh) > 0 && !!preview;
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setV((x) => ({ ...x, [k]: value }));
    if (k === 'time' && /^\d\d:\d\d$/.test(value)) setShift(shiftOfTime(value));
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await add.mutateAsync({ ...v, shift, pf: v.pf || null, nightKwh: v.nightKwh || null, remarks: v.remarks || null });
      toast({ tone: 'success', title: `Saved — ${r.shift} ${d(r.date)}` });
      setV((x) => ({ ...x, kwh: '', pf: '', nightKwh: '', remarks: '' }));
      setErrors({});
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }
  const pf = Number(v.pf);
  return (
    <Card title="Punch a reading" description="The meter is cumulative: each reading is compared with the one before it.">
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" aria-label="Punch a reading">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl<Shift>
            aria-label="Shift"
            options={[
              { value: 'AM', label: 'AM shift' },
              { value: 'PM', label: 'PM shift' },
            ]}
            value={shift}
            onChange={setShift}
          />
          <span className="text-caption text-muted">{shift === 'AM' ? 'AM: 00:00–11:59' : 'PM: 12:00–23:59'}</span>
        </div>
        <div className="grid grid-cols-2 items-start gap-3 md:grid-cols-5">
          <Input label="Date" type="date" value={v.date} max={meta?.today} onChange={set('date')} error={errors.date} />
          <Input label="Punch time" type="time" value={v.time} onChange={set('time')} error={errors.time} />
          <Input label="kWh reading" inputMode="decimal" value={v.kwh} onChange={set('kwh')} error={errors.kwh} placeholder="e.g. 110301" />
          <Input label="Power factor" inputMode="decimal" value={v.pf} onChange={set('pf')} error={errors.pf} placeholder="e.g. 0.975" />
          <Input label="Night units" inputMode="decimal" suffix="kWh" value={v.nightKwh} onChange={set('nightKwh')} error={errors.nightKwh} />
          <div className="col-span-2 md:col-span-4">
            <Input label="Remarks" value={v.remarks} onChange={set('remarks')} error={errors.remarks} placeholder="Normal reading / anomaly note" />
          </div>
          <Button variant="primary" type="submit" className="self-end" loading={add.isPending}>
            Save reading
          </Button>
        </div>
        {v.pf !== '' && pf >= 0 && pf <= 1 && (
          <div>
            <PfPill pf={pf} />
          </div>
        )}
        {showPreview && (
          <div className="rounded-lg border border-border bg-page p-3" role="status" aria-label="Cost preview">
            {preview.prev && preview.diff !== null && preview.diff < 0 ? (
              <p className="text-sm font-medium text-primary">
                Lower than the previous reading ({kwh(preview.prev.kwh)} on {d(preview.prev.date)} {preview.prev.time}). The meter only counts up.
              </p>
            ) : preview.prev ? (
              <dl className="grid grid-cols-3 gap-3 text-sm md:grid-cols-6">
                {[
                  ['kWh diff', kwh(preview.diff), `since ${kwh(preview.prev.kwh)} (${d(preview.prev.date)} ${preview.prev.time})`],
                  ['Net units', `${kwh(preview.net)} kWh`, `× MF ${preview.mf}`],
                  ['Energy', inr(preview.energyPaise), `@ ${perUnit(preview.energyRatePaise)}`],
                  ['Fuel', inr(preview.fuelPaise), `@ ${perUnit(preview.fuelRatePaise)}`],
                  ['Fixed (½ day)', inr(preview.shiftFixedPaise), 'Month ÷ 30 ÷ 2'],
                  ['Total est.', inr(preview.totalPaise), ''],
                ].map(([k, val, note]) => (
                  <div key={k}>
                    <dt className="text-label font-semibold uppercase tracking-label text-faint">{k}</dt>
                    <dd className="font-semibold tabular-nums">{val}</dd>
                    <dd className="text-caption text-muted">{note}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-amber">No earlier reading: this one starts the series.</p>
            )}
          </div>
        )}
      </form>
    </Card>
  );
}

/** Meter reading punch and the reading log (legacy Meter Reading Punch tab). */
export function ReadingsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['shift', 'from', 'to'] as const);
  const v = url.values;
  const list = useReadings({ page: url.page, pageSize: PAGE_SIZE, filters: { shift: v.shift || undefined, from: v.from || undefined, to: v.to || undefined } });
  const remove = useDeleteReading();
  const [toDelete, setToDelete] = useState<ReadingView | null>(null);
  const columns: Column<ReadingView>[] = [
    { id: 'date', header: 'Date', width: '110px', className: 'tabular-nums', cell: (r) => d(r.date) },
    { id: 'shift', header: 'Shift', width: '70px', cell: (r) => <Pill tone={r.shift === 'AM' ? 'purple' : 'amber'}>{r.shift}</Pill> },
    { id: 'time', header: 'Time', width: '70px', className: 'tabular-nums', cell: (r) => r.time },
    { id: 'kwh', header: 'kWh reading', width: '110px', align: 'right', className: 'font-semibold tabular-nums', cell: (r) => kwh(r.kwh) },
    { id: 'diff', header: 'Diff', width: '80px', align: 'right', className: 'tabular-nums text-primary', cell: (r) => kwh(r.diff) },
    { id: 'mf', header: 'MF', width: '50px', align: 'right', className: 'text-caption text-muted', cell: (r) => `×${r.mf}` },
    { id: 'net', header: 'Net kWh', width: '100px', align: 'right', className: 'font-semibold tabular-nums', cell: (r) => kwh(r.net) },
    { id: 'energy', header: 'Energy', width: '100px', align: 'right', className: 'tabular-nums', cell: (r) => inr(r.energyPaise) },
    { id: 'fuel', header: 'Fuel', width: '90px', align: 'right', className: 'tabular-nums', cell: (r) => inr(r.fuelPaise) },
    { id: 'fixed', header: 'Fixed (½ day)', width: '110px', align: 'right', className: 'tabular-nums text-muted', cell: (r) => inr(r.shiftFixedPaise) },
    { id: 'total', header: 'Total', width: '110px', align: 'right', className: 'font-semibold tabular-nums', cell: (r) => inr(r.totalPaise) },
    { id: 'pf', header: 'PF', width: '70px', align: 'right', cell: (r) => <PfCell pf={r.pf} /> },
    { id: 'remarks', header: 'Remarks', className: 'text-sm text-muted', cell: (r) => r.remarks ?? '' },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (r) => canDo('delete') && <Button variant="ghost" size="sm" icon={Trash2} aria-label={`Delete ${r.shift} reading ${r.date} ${r.time}`} onClick={() => setToDelete(r)} />,
    },
  ];
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Meter readings"
        description="Twice-daily kWh readings from the HT meter, costed with the MF and rates in force on each date."
        actions={
          canDo('export') && (
            <Button icon={Download} onClick={() => void exportElectricity('readings', { from: v.from || undefined, to: v.to || undefined }).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
              Excel
            </Button>
          )
        }
      />
      <StatusStrip />
      {canDo('edit') && <PunchForm />}
      <div className="flex flex-wrap items-center gap-2.5">
        <SegmentedControl<'' | Shift>
          aria-label="Shift filter"
          options={[
            { value: '', label: 'Both shifts' },
            { value: 'AM', label: 'AM' },
            { value: 'PM', label: 'PM' },
          ]}
          value={(v.shift || '') as '' | Shift}
          onChange={(x) => url.set({ shift: x || null })}
        />
        <Input aria-label="From date" type="date" value={v.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={v.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
      </div>
      <DataTable
        label="Meter readings"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(r) => r.id}
        minWidth={1300}
        loading={list.isLoading}
        empty={<EmptyState icon={Gauge} title="No readings yet" />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete this reading?"
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: 'Reading deleted' }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        {toDelete && `${toDelete.shift} ${d(toDelete.date)} ${toDelete.time}: ${kwh(toDelete.kwh)} kWh. The next reading will be compared with the one before it.`}
      </ConfirmDialog>
    </div>
  );
}
