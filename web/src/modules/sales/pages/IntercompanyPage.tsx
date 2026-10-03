import { ArrowLeftRight, Download, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { IntercompanyView } from '@contracts/sales';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, Input, KpiTile, MenuItem, MenuSeparator, Modal, Pagination, Pill, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportSales, useDeleteRecord, useIntercompany, useSalesMeta, useSaveIntercompany } from '../api';
import { inr, lakh, qtyFmt, rupeesText, sqmFmt, toPaise } from '../ui';

const PAGE_SIZE = 20;
const FIELDS = ['billingDoc', 'billingDate', 'materialDesc', 'grade', 'thic', 'width', 'length', 'pcs', 'qtySqm', 'rate', 'cgst', 'sgst', 'igst', 'freight', 'vehicleNo'] as const;
type Form = Record<(typeof FIELDS)[number], string>;

function IcForm({ open, row, onClose }: { open: boolean; row: IntercompanyView | null; onClose: () => void }) {
  const toast = useToast();
  const today = useSalesMeta().data?.today ?? '';
  const save = useSaveIntercompany();
  const [f, setF] = useState<Form>(() => Object.fromEntries(FIELDS.map((k) => [k, ''])) as Form);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    const r = row;
    setF({
      billingDoc: r?.billingDoc ?? '',
      billingDate: r?.billingDate ?? today,
      materialDesc: r?.materialDesc ?? '',
      grade: r?.grade ?? '',
      thic: r?.thic ? String(r.thic) : '',
      width: r?.width ? String(r.width) : '',
      length: r?.length ? String(r.length) : '',
      pcs: r?.pcs ? String(r.pcs) : '',
      qtySqm: r?.qtySqm ? String(r.qtySqm) : '',
      rate: rupeesText(r?.ratePaise ?? 0),
      cgst: rupeesText(r?.cgstPaise ?? 0),
      sgst: rupeesText(r?.sgstPaise ?? 0),
      igst: rupeesText(r?.igstPaise ?? 0),
      freight: rupeesText(r?.freightPaise ?? 0),
      vehicleNo: r?.vehicleNo ?? '',
    });
  }, [open, row]);
  const set = (k: keyof Form, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };
  const material = Math.round((Number(f.qtySqm) || 0) * toPaise(f.rate));
  const total = material + toPaise(f.cgst) + toPaise(f.sgst) + toPaise(f.igst) + toPaise(f.freight);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = (s: string) => (s ? Number(s) : null);
    const input = {
      billingDoc: f.billingDoc.trim(),
      billingDate: f.billingDate,
      materialDesc: f.materialDesc.trim(),
      grade: f.grade.trim() || null,
      thic: n(f.thic),
      width: n(f.width),
      length: n(f.length),
      pcs: Number(f.pcs) || 0,
      qtySqm: Number(f.qtySqm) || 0,
      ratePaise: toPaise(f.rate),
      cgstPaise: toPaise(f.cgst),
      sgstPaise: toPaise(f.sgst),
      igstPaise: toPaise(f.igst),
      freightPaise: toPaise(f.freight),
      vehicleNo: f.vehicleNo.trim() || null,
    };
    try {
      const saved = await save.mutateAsync({ id: row?.id, input });
      toast({ tone: 'success', title: `${saved.billingDoc} saved`, description: saved.matched ? 'Matches an LLP invoice' : 'No LLP invoice with this number yet' });
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
      size="lg"
      closeOnBackdrop={false}
      title={row ? `Edit ${row.billingDoc}` : 'Add inter-company transfer'}
      description="An LLP billing document as it appears in OSB’s purchase register."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="ic-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="ic-form" noValidate onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-4 [&>*]:min-w-0">
        <Input label="Billing doc (LLP invoice no.)" value={f.billingDoc} onChange={(e) => set('billingDoc', e.target.value)} error={errors.billingDoc} containerClassName="sm:col-span-2" />
        <Input label="Billing date" type="date" value={f.billingDate} onChange={(e) => set('billingDate', e.target.value)} error={errors.billingDate} />
        <Input label="Vehicle no." value={f.vehicleNo} onChange={(e) => set('vehicleNo', e.target.value.toUpperCase())} />
        <Input label="Material" value={f.materialDesc} onChange={(e) => set('materialDesc', e.target.value)} error={errors.materialDesc} containerClassName="sm:col-span-4" />
        <Input label="Grade" value={f.grade} onChange={(e) => set('grade', e.target.value)} />
        <Input label="Thickness (mm)" inputMode="decimal" value={f.thic} onChange={(e) => set('thic', e.target.value)} />
        <Input label="Width (mm)" inputMode="decimal" value={f.width} onChange={(e) => set('width', e.target.value)} />
        <Input label="Length (mm)" inputMode="decimal" value={f.length} onChange={(e) => set('length', e.target.value)} />
        <Input label="Pcs" inputMode="numeric" value={f.pcs} onChange={(e) => set('pcs', e.target.value)} />
        <Input label="Qty (sq m)" inputMode="decimal" value={f.qtySqm} onChange={(e) => set('qtySqm', e.target.value)} error={errors.qtySqm} />
        <Input label="Rate / sq m (₹)" inputMode="decimal" value={f.rate} onChange={(e) => set('rate', e.target.value)} hint={material ? `Material ${inr(material)}` : undefined} />
        <Input label="Freight (₹)" inputMode="decimal" value={f.freight} onChange={(e) => set('freight', e.target.value)} />
        <Input label="CGST (₹)" inputMode="decimal" value={f.cgst} onChange={(e) => set('cgst', e.target.value)} />
        <Input label="SGST (₹)" inputMode="decimal" value={f.sgst} onChange={(e) => set('sgst', e.target.value)} />
        <Input label="IGST (₹)" inputMode="decimal" value={f.igst} onChange={(e) => set('igst', e.target.value)} />
        <p className="self-end pb-2 text-right text-md font-bold tabular-nums">{inr(total)}</p>
      </form>
    </Modal>
  );
}

/** Inter-Company View (legacy intercompany_dashboard): LLP → OSB transfers, reconciled against LLP invoices. */
export function IntercompanyPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['from', 'to'] as const);
  const [search, setSearch] = useSearchParam(url);
  const list = useIntercompany({ q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE, filters: { from: url.values.from || undefined, to: url.values.to || undefined } }).data;
  const remove = useDeleteRecord('intercompany');
  const [form, setForm] = useState<IntercompanyView | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<IntercompanyView | null>(null);
  const k = list?.kpis;
  const unmatched = k ? k.count - k.matched : 0;

  const columns: Column<IntercompanyView>[] = [
    {
      id: 'doc',
      header: 'Billing doc',
      width: '140px',
      cell: (r) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold tabular-nums">{r.billingDoc}</span>
          <span className="text-caption text-faint">{formatDate(r.billingDate)}</span>
        </span>
      ),
    },
    { id: 'material', header: 'Material', cell: (r) => r.materialDesc },
    { id: 'qty', header: 'Qty', width: '120px', align: 'right', className: 'tabular-nums', cell: (r) => `${sqmFmt(r.qtySqm)} sq m` },
    { id: 'rate', header: 'Rate', width: '100px', align: 'right', className: 'tabular-nums text-sm', cell: (r) => inr(r.ratePaise) },
    { id: 'value', header: 'Material value', width: '130px', align: 'right', className: 'tabular-nums text-sm', cell: (r) => inr(r.materialPaise) },
    { id: 'tax', header: 'Tax', width: '110px', align: 'right', className: 'tabular-nums text-sm', cell: (r) => inr(r.taxPaise) },
    { id: 'total', header: 'Total', width: '130px', align: 'right', className: 'font-semibold tabular-nums', cell: (r) => inr(r.totalPaise) },
    { id: 'match', header: 'LLP invoice', width: '110px', cell: (r) => (r.matched ? <Pill tone="green">Matched</Pill> : <Pill tone="amber">Check</Pill>) },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (r) =>
        (canDo('edit') || canDo('delete')) && (
          <RowMenu label={`Actions for ${r.billingDoc}`}>
            {(close) => (
              <>
                {canDo('edit') && (
                  <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(r))}>
                    Edit
                  </MenuItem>
                )}
                {canDo('delete') && (
                  <>
                    <MenuSeparator />
                    <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(r))}>
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

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Inter-company"
        description="Strandply LLP → Strandply OSB transfers. OSB resells LLP’s boards under its own GST registration."
        actions={
          <>
            {canDo('export') && (
              <Button icon={Download} onClick={() => void exportSales('intercompany', { from: url.values.from || undefined, to: url.values.to || undefined }).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                Add transfer
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <KpiTile label="Transfers" value={String(k?.count ?? 0)} meta="Inter-company billing documents" />
        <KpiTile label="Quantity" value={`${qtyFmt(Math.round(k?.qtySqm ?? 0))} sq m`} meta="LLP → OSB" />
        <KpiTile label="Value" value={lakh(k?.totalPaise ?? 0)} meta={`${lakh(k?.taxPaise ?? 0)} tax`} />
        <KpiTile label="Reconciliation" value={`${k?.matched ?? 0} / ${k?.count ?? 0}`} meta={unmatched ? `${unmatched} without a matching LLP invoice` : 'All matched'} />
      </div>
      <Card>
        <p className="text-sm text-muted">Each row is a billing document where LLP supplied finished goods to OSB. “Matched” means an LLP sales invoice with the same number exists; “Check” ones need a look.</p>
      </Card>
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search" icon={Search} placeholder="Billing doc, material, vehicle" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[260px]" />
        <Input aria-label="From date" type="date" value={url.values.from} onChange={(e) => url.set({ from: e.target.value })} containerClassName="w-[150px]" />
        <span className="text-sm text-muted">to</span>
        <Input aria-label="To date" type="date" value={url.values.to} onChange={(e) => url.set({ to: e.target.value })} containerClassName="w-[150px]" />
      </div>
      <DataTable
        label="Inter-company transfers"
        columns={columns}
        rows={list?.rows ?? []}
        getRowId={(r) => r.id}
        minWidth={1100}
        loading={!list}
        empty={<EmptyState icon={ArrowLeftRight} title="No inter-company transfers recorded" />}
        footer={(list?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <IcForm open={form !== null} row={form === 'new' ? null : form} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.billingDoc ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: `${toDelete!.billingDoc} deleted` }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        This removes the transfer from the register.
      </ConfirmDialog>
    </div>
  );
}
