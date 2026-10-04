import { Download, FileText, History, Paperclip, Pencil, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BILL_CHARGE_LABEL, BILL_CHARGES, RATE_KINDS, RATE_LABEL, type BillView, type ElRate, type RateKind } from '@contracts/electricity';
import type { ActivityEntryView } from '@contracts/admin';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, KpiTile, MenuItem, MenuSeparator, Modal, Pagination, Pill, Select, Skeleton, useToast, type Column } from '@/components/ui';
import { PAGES, printHtml } from '@/lib/print';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportElectricity, invoiceUrl, useAddRate, useAttachInvoice, useBills, useDeleteBill, useElectricityAudit, useElectricityMeta, useElectricitySettings, useRemoveInvoice, useRemoveRate, useSaveBill, useSaveMeter } from '../api';
import { d, inr, kwh, PfCell, PfPill, perUnit, stamp } from '../ui';

const toPaise = (s: string) => (s.trim() === '' ? null : Math.round(Number(s) * 100));
const rupeesText = (p: number | null | undefined) => (p === null || p === undefined ? '' : String(p / 100));
/** The value in force on a date: latest entry from on or before it, else the earliest (as the API does). */
const rateOn = (rates: ElRate[], kind: RateKind, date: string) => {
  const list = rates.filter((r) => r.kind === kind).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return [...list].reverse().find((r) => r.effectiveFrom <= date)?.value ?? list[0]?.value ?? null;
};

/** PGVCL bill entry (legacy bill modal, every field). Differences from the previous bill are worked out as you type. */
function BillForm({ open, bill, bills, onClose }: { open: boolean; bill: BillView | null; bills: BillView[]; onClose: () => void }) {
  const toast = useToast();
  const rates = useElectricitySettings().data?.rates ?? [];
  const save = useSaveBill();
  const attach = useAttachInvoice();
  const removeInvoice = useRemoveInvoice();
  const [v, setV] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    const b = bill;
    setV({
      billDate: b?.billDate ?? '',
      dueDate: b?.dueDate ?? '',
      paidDate: b?.paidDate ?? '',
      advance: rupeesText(b?.advancePaymentPaise),
      kwhReading: b?.kwhReading?.toString() ?? '',
      kvarhReading: b?.kvarhReading?.toString() ?? '',
      pf: b?.pf?.toString() ?? '',
      nightUnits: b?.nightUnits?.toString() ?? '',
      ...Object.fromEntries(BILL_CHARGES.map((k) => [k, rupeesText(b?.charges[k])])),
      netPayable: rupeesText(b?.netPayablePaise),
      totalPayable: rupeesText(b?.totalPayablePaise),
      remarks: b?.remarks ?? '',
    });
    setFile(null);
    setErrors({});
  }, [open, bill]);
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const prev = v.billDate ? bills.filter((b) => b.id !== bill?.id && b.billDate < v.billDate).sort((a, b) => b.billDate.localeCompare(a.billDate))[0] : undefined;
  const mf = v.billDate ? rateOn(rates, 'mf', v.billDate) : null;
  const diff = (curr: string, before: number | null | undefined) => (curr !== '' && before !== null && before !== undefined ? Math.round((Number(curr) - before) * 100) / 100 : null);
  const kwhDiff = diff(v.kwhReading ?? '', prev?.kwhReading);
  const kvarhDiff = diff(v.kvarhReading ?? '', prev?.kvarhReading);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input = {
      billDate: v.billDate,
      dueDate: v.dueDate || null,
      paidDate: v.paidDate || null,
      advancePaymentPaise: toPaise(v.advance ?? ''),
      kwhReading: v.kwhReading === '' ? undefined : v.kwhReading,
      kvarhReading: v.kvarhReading || null,
      pf: v.pf || null,
      nightUnits: v.nightUnits || null,
      charges: Object.fromEntries(BILL_CHARGES.map((k) => [k, toPaise(v[k] ?? '')])),
      netPayablePaise: toPaise(v.netPayable ?? ''),
      totalPayablePaise: toPaise(v.totalPayable ?? '') ?? 0,
      remarks: v.remarks || null,
    };
    try {
      const saved = await save.mutateAsync({ id: bill?.id, input });
      if (file) await attach.mutateAsync({ id: saved.id, file });
      toast({ tone: 'success', title: `${bill ? 'Bill updated' : 'Bill saved'} — ${d(saved.billDate)}` });
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }
  const money = (k: string, label: string) => <Input key={k} label={label} inputMode="decimal" suffix="₹" value={v[k] ?? ''} onChange={set(k)} error={errors[`charges.${k}`] ?? errors[k]} />;
  const pf = Number(v.pf);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      closeOnBackdrop={false}
      title={bill ? `Edit PGVCL bill · ${d(bill.billDate)}` : 'PGVCL bill entry'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="el-bill-form" loading={save.isPending || attach.isPending}>
            Save bill
          </Button>
        </>
      }
    >
      <form id="el-bill-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <section className="grid grid-cols-4 items-start gap-3" aria-label="Bill header">
          <Input label="Bill date" type="date" value={v.billDate ?? ''} onChange={set('billDate')} error={errors.billDate} />
          <Input label="Due date" type="date" value={v.dueDate ?? ''} onChange={set('dueDate')} error={errors.dueDate} />
          <Input label="Paid date" type="date" value={v.paidDate ?? ''} onChange={set('paidDate')} error={errors.paidDate} />
          <Input label="Advance payment adjusted" inputMode="decimal" suffix="₹" value={v.advance ?? ''} onChange={set('advance')} error={errors.advancePaymentPaise} />
        </section>
        <section className="grid grid-cols-4 items-start gap-3" aria-label="Meter">
          <Input label="kWh reading" inputMode="decimal" value={v.kwhReading ?? ''} onChange={set('kwhReading')} error={errors.kwhReading} hint={kwhDiff === null ? (prev ? undefined : 'First bill: no previous reading') : `Diff ${kwh(kwhDiff)} × MF ${mf} = ${kwh(kwhDiff * (mf ?? 1))}`} />
          <Input label="kVArh reading" inputMode="decimal" value={v.kvarhReading ?? ''} onChange={set('kvarhReading')} error={errors.kvarhReading} hint={kvarhDiff === null ? undefined : `Diff ${kwh(kvarhDiff)} × MF ${mf} = ${kwh(kvarhDiff * (mf ?? 1))}`} />
          <Input label="Average PF" inputMode="decimal" value={v.pf ?? ''} onChange={set('pf')} error={errors.pf} placeholder="0.000–1.000" />
          <Input label="Night units" inputMode="decimal" suffix="kWh" value={v.nightUnits ?? ''} onChange={set('nightUnits')} error={errors.nightUnits} />
          {v.pf !== '' && pf >= 0 && pf <= 1 && (
            <div className="col-span-4">
              <PfPill pf={pf} />
            </div>
          )}
        </section>
        <section aria-label="Charges">
          <p className="mb-2 text-label font-semibold uppercase tracking-label text-faint">Charges</p>
          <div className="grid grid-cols-4 items-start gap-3">{BILL_CHARGES.map((k) => money(k, BILL_CHARGE_LABEL[k]))}</div>
        </section>
        <section className="grid grid-cols-4 items-start gap-3" aria-label="Totals">
          {money('netPayable', 'Net payable')}
          <Input label="Total payable" inputMode="decimal" suffix="₹" value={v.totalPayable ?? ''} onChange={set('totalPayable')} error={errors.totalPayablePaise} />
          <div className="col-span-2">
            <Input label="Remarks" value={v.remarks ?? ''} onChange={set('remarks')} error={errors.remarks} placeholder="Payment note / anomaly" />
          </div>
        </section>
        <section aria-label="Invoice PDF" className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">Invoice PDF</span>
          {bill?.invoice && !file ? (
            <>
              <a href={invoiceUrl(bill.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline">
                <FileText size={14} aria-hidden /> {bill.invoice.name}
              </a>
              <Button size="sm" variant="ghost" icon={X} onClick={() => void removeInvoice.mutateAsync(bill.id).then(() => toast({ tone: 'success', title: 'Invoice removed' }))}>
                Remove
              </Button>
            </>
          ) : null}
          <input type="file" accept="application/pdf,.pdf" aria-label="Attach invoice PDF" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="text-caption text-muted">PDF, up to 10 MB</span>
        </section>
      </form>
    </Modal>
  );
}

async function printBills(rows: BillView[]) {
  const th = { padding: '1mm 1.2mm', borderBottom: '1px solid #ccc', fontSize: 6.5, textAlign: 'right' as const };
  const td = { padding: '0.8mm 1.2mm', borderBottom: '1px solid #eee', fontSize: 7, textAlign: 'right' as const };
  const cols: [string, (b: BillView) => string][] = [
    ['Bill date', (b) => d(b.billDate)],
    ['Paid', (b) => d(b.paidDate)],
    ['kWh', (b) => kwh(b.kwhReading)],
    ['× MF', (b) => kwh(b.kwhNet)],
    ['kVArh × MF', (b) => kwh(b.kvarhNet)],
    ['PF', (b) => (b.pf === null ? '—' : b.pf.toFixed(3))],
    ...BILL_CHARGES.filter((k) => rows.some((b) => b.charges[k] !== null)).map((k): [string, (b: BillView) => string] => [BILL_CHARGE_LABEL[k].replace(' (−)', ''), (b) => inr(b.charges[k])]),
    ['Total', (b) => inr(b.totalPayablePaise)],
  ];
  await printHtml({
    page: PAGES.register,
    marginMm: 10,
    css: 'html, body { width: auto; min-height: 0; }',
    title: 'PGVCL bill register',
    bodyHtml: renderToStaticMarkup(
      <div style={{ fontFamily: 'Inter, Arial, sans-serif', color: '#172033' }}>
        <div style={{ fontSize: 13, fontWeight: 800, borderBottom: '2px solid #D71920', paddingBottom: '1.5mm', marginBottom: '3mm' }}>PGVCL bill register</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {cols.map(([h], i) => (
                <th key={h} style={{ ...th, textAlign: i < 2 ? 'left' : 'right' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                {cols.map(([h, f], i) => (
                  <td key={h} style={{ ...td, textAlign: i < 2 ? 'left' : 'right' }}>
                    {f(b)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    ),
  });
}

/** PGVCL bill register (legacy PGVCL Bills): every bill field, the differences × MF, and the readings' estimate beside each bill. */
export function BillsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const bills = useBills();
  const remove = useDeleteBill();
  const [form, setForm] = useState<BillView | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<BillView | null>(null);
  const rows = bills.data?.rows ?? [];
  const s = bills.data?.summary;
  const rebates = (b: BillView) => (b.charges.pfRebate ?? 0) + (b.charges.nightRebate ?? 0) + (b.charges.ehvRebate ?? 0);
  const columns: Column<BillView>[] = [
    {
      id: 'date',
      header: 'Bill date',
      width: '120px',
      cell: (b) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold tabular-nums">{d(b.billDate)}</span>
          <span className="text-caption text-faint">{b.periodFrom ? `from ${d(b.periodFrom)}` : 'First bill'}</span>
        </span>
      ),
    },
    {
      id: 'paid',
      header: 'Due / paid',
      width: '130px',
      cell: (b) => (
        <span className="flex flex-col leading-tight text-sm">
          <span className="tabular-nums">{d(b.dueDate)}</span>
          {b.paidDate ? <span className="text-caption text-green">Paid {d(b.paidDate)}</span> : <Pill tone="amber">Unpaid</Pill>}
        </span>
      ),
    },
    { id: 'kwh', header: 'kWh', width: '100px', align: 'right', className: 'tabular-nums', cell: (b) => kwh(b.kwhReading) },
    {
      id: 'kwhNet',
      header: 'Net kWh',
      width: '130px',
      align: 'right',
      cell: (b) =>
        b.kwhNet === null ? (
          <span className="text-faint">—</span>
        ) : (
          <span className="flex flex-col leading-tight tabular-nums">
            <span className="font-medium">{kwh(b.kwhNet)}</span>
            <span className="text-caption text-muted">
              {kwh(b.kwhDiff)} × {b.mf}
            </span>
          </span>
        ),
    },
    { id: 'kvarh', header: 'kVArh × MF', width: '100px', align: 'right', className: 'tabular-nums', cell: (b) => kwh(b.kvarhNet) },
    { id: 'pf', header: 'PF', width: '70px', align: 'right', cell: (b) => <PfCell pf={b.pf} /> },
    { id: 'energy', header: 'Energy + fuel', width: '130px', align: 'right', className: 'tabular-nums', cell: (b) => inr((b.charges.energy ?? 0) + (b.charges.fuelSurcharge ?? 0)) },
    { id: 'demand', header: 'Demand', width: '110px', align: 'right', className: 'tabular-nums', cell: (b) => inr(b.charges.demand) },
    { id: 'rebates', header: 'Rebates', width: '100px', align: 'right', className: 'tabular-nums text-green', cell: (b) => (rebates(b) ? `−${inr(rebates(b))}` : '—') },
    { id: 'duty', header: 'Duty', width: '100px', align: 'right', className: 'tabular-nums', cell: (b) => inr(b.charges.electricityDuty) },
    { id: 'total', header: 'Total payable', width: '130px', align: 'right', className: 'font-semibold tabular-nums', cell: (b) => inr(b.totalPayablePaise) },
    {
      id: 'est',
      header: 'Readings estimate',
      width: '140px',
      align: 'right',
      cell: (b) =>
        b.estimatePaise === null ? (
          <span className="text-faint">—</span>
        ) : (
          <span className="flex flex-col leading-tight tabular-nums">
            <span>{inr(b.estimatePaise)}</span>
            <span className="text-caption text-muted">{`${b.totalPayablePaise >= b.estimatePaise ? '+' : '−'}${Math.abs(Math.round(((b.totalPayablePaise - b.estimatePaise) / b.estimatePaise) * 100))}% billed`}</span>
          </span>
        ),
    },
    {
      id: 'invoice',
      header: 'Invoice',
      width: '70px',
      cell: (b) =>
        b.invoice ? (
          <a href={invoiceUrl(b.id)} target="_blank" rel="noreferrer" aria-label={`Invoice for ${d(b.billDate)}`} onClick={(e) => e.stopPropagation()} className="inline-flex text-muted hover:text-ink">
            <Paperclip size={15} aria-hidden />
          </a>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (b) =>
        (canDo('edit') || canDo('delete')) && (
          <span onClick={(e) => e.stopPropagation()}>
            <RowMenu label={`Actions for bill ${d(b.billDate)}`}>
              {(close) => (
                <>
                  {canDo('edit') && (
                    <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(b))}>
                      Edit
                    </MenuItem>
                  )}
                  {canDo('delete') && (
                    <>
                      <MenuSeparator />
                      <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(b))}>
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
        title="PGVCL bills"
        description="HT consumer monthly bill register. Differences are from the previous bill, × the MF on the bill date; the estimate is what the meter readings cost for the same period."
        actions={
          <>
            {canDo('print') && rows.length > 0 && (
              <Button icon={Printer} onClick={() => void printBills([...rows].reverse())}>
                Print
              </Button>
            )}
            {canDo('export') && (
              <Button icon={Download} onClick={() => void exportElectricity('bills').catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                Add bill
              </Button>
            )}
          </>
        }
      />
      {s && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <KpiTile variant="compact" label="Bills entered" value={s.count} />
          <KpiTile variant="compact" label="Last bill" value={s.lastPaise === null ? '—' : inr(s.lastPaise)} />
          <KpiTile variant="compact" label="Average monthly" value={s.avgPaise === null ? '—' : inr(s.avgPaise)} />
          <KpiTile variant="compact" label="This financial year" value={inr(s.fyPaise)} />
          <KpiTile variant="compact" label="Average PF" value={s.avgPf === null ? '—' : s.avgPf.toFixed(3)} />
        </div>
      )}
      <DataTable
        label="PGVCL bills"
        columns={columns}
        rows={rows}
        getRowId={(b) => b.id}
        minWidth={1550}
        loading={bills.isLoading}
        onRowClick={canDo('edit') ? (b) => setForm(b) : undefined}
        empty={<EmptyState icon={FileText} title="No bills entered yet" />}
      />
      <BillForm open={form !== null} bill={form === 'new' ? null : form} bills={rows} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete the bill of ${toDelete ? d(toDelete.billDate) : ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: 'Bill deleted' }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        The next bill’s differences will be worked out from the one before.
      </ConfirmDialog>
    </div>
  );
}

const rateText = (kind: RateKind, value: number) => (kind === 'mf' ? `×${value}` : kind === 'fixed' ? `${inr(value)} / month` : perUnit(value));

/** One dated history: entries newest first with the one in force marked, an add row, remove (legacy MF / FC / ER / FR history). */
function RateHistory({ kind, rates, today }: { kind: RateKind; rates: ElRate[]; today: string }) {
  const toast = useToast();
  const { canDo } = useSession();
  const add = useAddRate();
  const remove = useRemoveRate();
  const [value, setValue] = useState('');
  const [from, setFrom] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const list = rates.filter((r) => r.kind === kind).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const current = list.find((r) => r.effectiveFrom <= today) ?? list.at(-1);
  const hint = { mf: 'Add a new MF when PGVCL changes the multiplier. Readings and bills use the MF in force on their date.', fixed: 'Per 30-day month. A day is ÷ 30, a 12-hour shift ÷ 60.', energy: 'Energy charge = net kWh × rate.', fuel: 'Fuel charge = net kWh × rate. Revised by PGVCL from time to time.' }[kind];
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(value);
    try {
      await add.mutateAsync({ kind, value: kind === 'mf' ? n : Math.round(n * 100), effectiveFrom: from });
      toast({ tone: 'success', title: `${RATE_LABEL[kind]} added` });
      setValue('');
      setFrom('');
      setErrors({});
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t add', description: errorMessage(err) });
    }
  };
  return (
    <Card title={RATE_LABEL[kind]} description={hint}>
      <ul className="mb-3 flex flex-col divide-y divide-divider" aria-label={RATE_LABEL[kind]}>
        {list.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-1.5 text-sm">
            <span className="w-40 font-semibold tabular-nums">{rateText(kind, r.value)}</span>
            <span className="text-muted">from {d(r.effectiveFrom)}</span>
            {r.id === current?.id && <Pill tone="green">In force</Pill>}
            {canDo('delete') && list.length > 1 && (
              <Button variant="ghost" size="sm" icon={X} aria-label={`Remove ${rateText(kind, r.value)} from ${r.effectiveFrom}`} className="ml-auto" onClick={() => void remove.mutateAsync(r.id).catch((err) => toast({ tone: 'error', title: 'Can’t remove', description: errorMessage(err) }))} />
            )}
          </li>
        ))}
      </ul>
      {canDo('edit') && (
        <form className="flex flex-wrap items-start gap-2" onSubmit={(e) => void submit(e)} aria-label={`Add ${RATE_LABEL[kind].toLowerCase()}`}>
          <Input aria-label={`New ${RATE_LABEL[kind].toLowerCase()}`} inputMode="decimal" suffix={kind === 'mf' ? '×' : '₹'} placeholder={kind === 'mf' ? '30' : kind === 'fixed' ? '638675' : '4.20'} value={value} onChange={(e) => setValue(e.target.value)} error={errors.value} containerClassName="w-[160px]" />
          <Input aria-label="Effective from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} error={errors.effectiveFrom} containerClassName="w-[160px]" />
          <Button type="submit" icon={Plus} loading={add.isPending}>
            Add
          </Button>
        </form>
      )}
    </Card>
  );
}

/** Meter details and the four dated histories (legacy Meter Configuration). */
export function MeterPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const settings = useElectricitySettings().data;
  const today = useElectricityMeta().data?.today ?? '';
  const save = useSaveMeter();
  const [v, setV] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const meter = settings?.meter;
  useEffect(() => {
    if (meter) setV(Object.fromEntries(Object.entries(meter).map(([k, x]) => [k, x === null ? '' : String(x)])));
  }, [meter]);
  const set = (k: string) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const fields = useMemo(
    () =>
      [
        ['meterNo', 'Meter number'],
        ['consumerNo', 'Consumer number'],
        ['category', 'Category'],
        ['sanctionedLoadKva', 'Sanctioned load (kVA)'],
        ['ctRatio', 'CT ratio'],
        ['ptRatio', 'PT ratio'],
        ['tariff', 'Tariff'],
      ] as const,
    [],
  );
  if (!settings) return <Skeleton className="m-6 h-96" />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await save.mutateAsync({ ...Object.fromEntries(fields.map(([k]) => [k, v[k] || null])), billingCycle: v.billingCycle });
      toast({ tone: 'success', title: 'Meter details saved' });
      setErrors({});
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  };
  return (
    <div className="flex max-w-6xl flex-col gap-3.5 p-6">
      <PageHeader title="Meter & tariff" description="The HT meter’s details and the dated MF, fixed charge, energy and fuel rates that cost the readings." />
      <Card title="Meter details">
        <form onSubmit={(e) => void submit(e)} className="grid grid-cols-2 items-start gap-3 md:grid-cols-4" aria-label="Meter details">
          {fields.map(([k, label]) => (
            <Input key={k} label={label} value={v[k] ?? ''} onChange={set(k)} error={errors[k]} disabled={!canDo('edit')} inputMode={k === 'sanctionedLoadKva' ? 'decimal' : undefined} />
          ))}
          <Select
            label="Billing cycle"
            options={[
              { value: 'Monthly', label: 'Monthly' },
              { value: 'Bi-monthly', label: 'Bi-monthly' },
            ]}
            value={v.billingCycle ?? 'Monthly'}
            onChange={set('billingCycle')}
            disabled={!canDo('edit')}
          />
          {canDo('edit') && (
            <div className="col-span-full flex justify-end">
              <Button variant="primary" type="submit" loading={save.isPending}>
                Save meter details
              </Button>
            </div>
          )}
        </form>
      </Card>
      <div className="grid gap-3.5 lg:grid-cols-2">
        {RATE_KINDS.map((k) => (
          <RateHistory key={k} kind={k} rates={settings.rates} today={today} />
        ))}
      </div>
    </div>
  );
}

const AREA: Record<string, string> = { electricity_reading: 'Reading', electricity_bill: 'Bill', electricity_rate: 'Rate', electricity_meter: 'Meter', electricity_export: 'Export' };

/** Every electricity change and export, newest first. */
export function AuditPage() {
  const url = useUrlState([] as const);
  const [search, setSearch] = useSearchParam(url);
  const list = useElectricityAudit({ q: url.q || undefined, page: url.page });
  const columns: Column<ActivityEntryView>[] = [
    { id: 'when', header: 'When', width: '170px', className: 'text-muted tabular-nums', cell: (a) => stamp(a.createdAt) },
    {
      id: 'who',
      header: 'By',
      width: '170px',
      cell: (a) => (
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{a.userName ?? 'System'}</span>
          {a.userRole && <span className="text-caption text-faint">{a.userRole}</span>}
        </span>
      ),
    },
    { id: 'area', header: 'Area', width: '110px', cell: (a) => <Pill>{AREA[a.entityType ?? ''] ?? a.entityType}</Pill> },
    { id: 'action', header: 'Action', width: '100px', cell: (a) => a.action },
    { id: 'details', header: 'Details', cell: (a) => a.details },
  ];
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Electricity audit trail" description="Every reading, bill, rate and meter change and export, newest first." />
      <Input aria-label="Search audit trail" icon={Search} placeholder="User or details" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[280px]" />
      <DataTable
        label="Electricity audit trail"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(a) => a.id}
        minWidth={900}
        loading={list.isLoading}
        empty={<EmptyState icon={History} title="Nothing recorded yet" />}
        footer={(list.data?.total ?? 0) > 50 && <Pagination page={url.page} pageSize={50} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
    </div>
  );
}
