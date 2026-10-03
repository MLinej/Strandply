import { BookOpen, Download, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { DEALER_TYPES, FIRM_LABEL, gstinStateCode, SALES_TAX_TYPES, taxTypeFor, type Customer, type DealerType, type SalesTaxType } from '@contracts/sales';
import { useSession } from '@/app/session';
import { Button, DataTable, EmptyState, Input, MenuItem, MenuSeparator, Modal, Pagination, Pill, Select, Textarea, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ConfirmDialog } from '../../samples/ui/ConfirmDialog';
import { errorMessage, fieldErrors } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { RowMenu, runAndClose } from '../../samples/ui/RowMenu';
import { exportSales, useCustomers, useDeleteRecord, useFirmFilter, useLedger, useSalesMeta, useSalesOptions, useSaveCustomer } from '../api';
import { inr, lakh, rupeesText, sqmFmt, toPaise } from '../ui';

const PAGE_SIZE = 25;
const FIELDS = ['name', 'code', 'dealerType', 'gstin', 'pan', 'group', 'address', 'city', 'state', 'country', 'pincode', 'contactPerson', 'mobile1', 'mobile2', 'email', 'creditDays', 'creditLimit', 'transportPref', 'paymentTerms'] as const;
type Form = Record<(typeof FIELDS)[number], string> & { taxLlp: SalesTaxType; taxOsb: SalesTaxType; active: boolean };
const EMPTY: Form = { ...(Object.fromEntries(FIELDS.map((k) => [k, ''])) as Record<(typeof FIELDS)[number], string>), dealerType: 'Dealer', group: 'SUNDRY DEBTORS', country: 'India', taxLlp: 'SG+CG', taxOsb: 'SG+CG', active: true };

/** Add / edit party (legacy openCustomerModal). The tax type follows the GSTIN's state code; without a GSTIN it's set by hand. */
function CustomerForm({ open, customer, onClose }: { open: boolean; customer: Customer | null; onClose: () => void }) {
  const toast = useToast();
  const meta = useSalesMeta().data;
  const save = useSaveCustomer();
  const [f, setF] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      customer
        ? {
            ...(Object.fromEntries(FIELDS.map((k) => [k, String((customer as unknown as Record<string, unknown>)[k] ?? '')])) as Record<(typeof FIELDS)[number], string>),
            creditDays: customer.creditDays ? String(customer.creditDays) : '',
            creditLimit: rupeesText(customer.creditLimitPaise),
            taxLlp: customer.taxTypes.llp,
            taxOsb: customer.taxTypes.osb,
            active: customer.active,
          }
        : EMPTY,
    );
  }, [open, customer]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k === 'creditLimit' ? 'creditLimitPaise' : k]: '' }));
  };
  const codes = meta?.settings.firmStateCodes ?? { llp: '24', osb: '27' };
  const hasGstin = !!gstinStateCode(f.gstin);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setErrors({ name: 'Customer name is required' });
    const input: Record<string, unknown> = Object.fromEntries(FIELDS.filter((k) => k !== 'creditLimit').map((k) => [k, f[k].trim() || null]));
    Object.assign(input, {
      dealerType: f.dealerType,
      group: f.group.trim() || 'SUNDRY DEBTORS',
      country: f.country.trim() || 'India',
      creditDays: Number(f.creditDays) || 0,
      creditLimitPaise: toPaise(f.creditLimit),
      taxTypes: { llp: f.taxLlp, osb: f.taxOsb },
      active: f.active,
    });
    try {
      const saved = await save.mutateAsync({ id: customer?.id, input });
      toast({ tone: 'success', title: `${saved.name} saved`, description: `Tax: LLP ${saved.taxTypes.llp}, OSB ${saved.taxTypes.osb}` });
      onClose();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Couldn’t save', description: errorMessage(err) });
    }
  }

  const terms = meta?.settings.paymentTerms ?? [];
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={customer ? `Edit ${customer.name}` : 'Add party'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="customer-form" loading={save.isPending}>
            Save party
          </Button>
        </>
      }
    >
      <form id="customer-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
          <Input label="Customer name" value={f.name} onChange={(e) => set('name', e.target.value)} error={errors.name} containerClassName="sm:col-span-2" />
          <Input label="Customer code" value={f.code} onChange={(e) => set('code', e.target.value)} />
          <Select label="Type" options={DEALER_TYPES.map((d) => ({ value: d, label: d }))} value={f.dealerType} onChange={(e) => set('dealerType', e.target.value as DealerType)} />
          <Input label="GSTIN" value={f.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} error={errors.gstin} />
          <Input label="PAN" value={f.pan} onChange={(e) => set('pan', e.target.value.toUpperCase())} error={errors.pan} />
          <Input label="Account group" value={f.group} onChange={(e) => set('group', e.target.value)} />
          {hasGstin ? (
            <p className="text-sm text-muted sm:col-span-2 sm:self-end sm:pb-2">
              Tax type from GSTIN: LLP <strong>{taxTypeFor(f.gstin, codes.llp)}</strong>, OSB <strong>{taxTypeFor(f.gstin, codes.osb)}</strong>
            </p>
          ) : (
            <>
              <Select label={`Tax type, ${FIRM_LABEL.llp}`} options={SALES_TAX_TYPES.map((t) => ({ value: t, label: t }))} value={f.taxLlp} onChange={(e) => set('taxLlp', e.target.value as SalesTaxType)} hint="No GSTIN: set by hand" />
              <Select label={`Tax type, ${FIRM_LABEL.osb}`} options={SALES_TAX_TYPES.map((t) => ({ value: t, label: t }))} value={f.taxOsb} onChange={(e) => set('taxOsb', e.target.value as SalesTaxType)} />
            </>
          )}
        </div>
        <Textarea label="Address" rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-4 [&>*]:min-w-0">
          <Input label="City" value={f.city} onChange={(e) => set('city', e.target.value)} />
          <Input label="State" value={f.state} onChange={(e) => set('state', e.target.value)} />
          <Input label="Country" value={f.country} onChange={(e) => set('country', e.target.value)} />
          <Input label="Pincode" inputMode="numeric" value={f.pincode} onChange={(e) => set('pincode', e.target.value)} error={errors.pincode} />
          <Input label="Contact person" value={f.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} />
          <Input label="Mobile" inputMode="tel" value={f.mobile1} onChange={(e) => set('mobile1', e.target.value)} />
          <Input label="Mobile 2" inputMode="tel" value={f.mobile2} onChange={(e) => set('mobile2', e.target.value)} />
          <Input label="Email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} error={errors.email} />
          <Input label="Credit days" inputMode="numeric" value={f.creditDays} onChange={(e) => set('creditDays', e.target.value)} error={errors.creditDays} />
          <Input label="Credit limit (₹)" inputMode="decimal" value={f.creditLimit} onChange={(e) => set('creditLimit', e.target.value)} error={errors.creditLimitPaise} />
          <Input label="Transport preference" value={f.transportPref} onChange={(e) => set('transportPref', e.target.value)} />
          <Select label="Payment terms" placeholder="—" options={[...new Set([...terms, ...(f.paymentTerms ? [f.paymentTerms] : [])])].map((t) => ({ value: t, label: t }))} value={f.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-base">
          <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Active (inactive parties can’t be picked on new documents)
        </label>
      </form>
    </Modal>
  );
}

/** Invoices shipped to the party (legacy openCustomerLedger: keyed on ship-to). */
function LedgerDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const firm = useFirmFilter();
  const l = useLedger(customer?.id ?? null, firm).data;
  return (
    <Modal open={!!customer} onClose={onClose} size="lg" title={`Ledger · ${customer?.name ?? ''}`} description="Invoices shipped to this party.">
      {!l ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-base">
            <strong className="tabular-nums">{inr(l.totalPaise)}</strong> invoiced in {l.count} invoice{l.count === 1 ? '' : 's'}
            {customer?.creditLimitPaise ? <span className="text-muted"> · credit limit {inr(customer.creditLimitPaise)} ({Math.round((l.totalPaise / customer.creditLimitPaise) * 100)}% used)</span> : null}
          </p>
          <table className="w-full text-sm" aria-label="Ledger">
            <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
              <tr>
                <th className="px-3 py-1.5 text-left">Date</th>
                <th className="px-3 py-1.5 text-left">Invoice</th>
                <th className="px-3 py-1.5 text-left">Items</th>
                <th className="px-3 py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {l.invoices.map((i) => (
                <tr key={i.id} className="border-t border-divider align-top">
                  <td className="px-3 py-1.5 tabular-nums">{formatDate(i.date)}</td>
                  <td className="px-3 py-1.5">
                    <Link to={`/sales/invoices?open=${i.id}`} className="font-medium text-primary hover:underline">
                      {i.invNo}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-muted">
                    {i.lines.map((x, n) => (
                      <span key={n} className="block">
                        {x.itemName} · {sqmFmt(x.qtySqm)} sq m
                      </span>
                    ))}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{inr(i.totalPaise)}</td>
                </tr>
              ))}
              {!l.invoices.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-muted">
                    No invoices for this party yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/** Party Master (legacy party_master): shared by both firms. */
export function CustomersPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['state', 'city', 'type', 'active'] as const);
  const [search, setSearch] = useSearchParam(url);
  const v = url.values;
  const list = useCustomers({ q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE, filters: { state: v.state || undefined, city: v.city || undefined, dealerType: (v.type || undefined) as DealerType | undefined, active: v.active === 'no' ? false : v.active === 'all' ? undefined : true } });
  const all = useSalesOptions().data?.customers ?? [];
  const states = useMemo(() => [...new Set(all.map((c) => c.state).filter((s): s is string => !!s))].sort(), [all]);
  const cities = useMemo(() => [...new Set(all.filter((c) => !v.state || c.state === v.state).map((c) => c.city).filter((s): s is string => !!s))].sort(), [all, v.state]);
  const remove = useDeleteRecord('customers');
  const [form, setForm] = useState<Customer | 'new' | null>(null);
  const [ledger, setLedger] = useState<Customer | null>(null);
  const [toDelete, setToDelete] = useState<Customer | null>(null);

  const columns: Column<Customer>[] = [
    {
      id: 'name',
      header: 'Party',
      cell: (c) => (
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{c.name}</span>
          <span className="text-caption text-faint">{[c.dealerType, c.code].filter(Boolean).join(' · ')}</span>
        </span>
      ),
    },
    { id: 'place', header: 'City / state', width: '200px', className: 'text-sm', cell: (c) => [c.city, c.state].filter(Boolean).join(', ') || '—' },
    { id: 'gstin', header: 'GSTIN', width: '160px', className: 'text-sm tabular-nums', cell: (c) => c.gstin ?? '—' },
    { id: 'mobile', header: 'Mobile', width: '130px', className: 'text-sm tabular-nums', cell: (c) => c.mobile1 ?? '—' },
    { id: 'tax', header: 'Tax LLP / OSB', width: '140px', className: 'text-sm', cell: (c) => `${c.taxTypes.llp} / ${c.taxTypes.osb}` },
    { id: 'credit', header: 'Credit', width: '140px', align: 'right', className: 'text-sm tabular-nums', cell: (c) => (c.creditDays || c.creditLimitPaise ? `${c.creditDays} d · ${lakh(c.creditLimitPaise)}` : '—') },
    { id: 'active', header: 'Status', width: '90px', cell: (c) => (c.active ? <Pill tone="green">Active</Pill> : <Pill>Inactive</Pill>) },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (c) => (
        <RowMenu label={`Actions for ${c.name}`}>
          {(close) => (
            <>
              <MenuItem icon={BookOpen} onClick={runAndClose(close, () => setLedger(c))}>
                Ledger
              </MenuItem>
              {canDo('edit') && (
                <MenuItem icon={Pencil} onClick={runAndClose(close, () => setForm(c))}>
                  Edit
                </MenuItem>
              )}
              {canDo('delete') && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={Trash2} className="text-primary" onClick={runAndClose(close, () => setToDelete(c))}>
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

  const any = !!(url.q || v.state || v.city || v.type || v.active);
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Party master"
        description={`${list.data?.total ?? 0} parties, shared by both firms. Credit use and outstanding are in Sales reports.`}
        actions={
          <>
            <Link to="/sales/reports?report=customer_credit" className="inline-flex h-9 items-center rounded border border-border px-3 text-base font-medium hover:bg-page">
              Credit utilisation
            </Link>
            {canDo('export') && (
              <Button icon={Download} onClick={() => void exportSales('customers').catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }))}>
                Excel
              </Button>
            )}
            {canDo('edit') && (
              <Button variant="primary" icon={Plus} onClick={() => setForm('new')}>
                Add party
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search" icon={Search} placeholder="Name, GSTIN, city, mobile" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[260px]" />
        <Select aria-label="State" placeholder="All states" options={states.map((s) => ({ value: s, label: s }))} value={v.state} onChange={(e) => url.set({ state: e.target.value, city: null })} containerClassName="w-[160px]" />
        <Select aria-label="City" placeholder="All cities" options={cities.map((s) => ({ value: s, label: s }))} value={v.city} onChange={(e) => url.set({ city: e.target.value })} containerClassName="w-[160px]" />
        <Select aria-label="Type" placeholder="All types" options={DEALER_TYPES.map((d) => ({ value: d, label: d }))} value={v.type} onChange={(e) => url.set({ type: e.target.value })} containerClassName="w-[160px]" />
        <Select
          aria-label="Active"
          options={[
            { value: '', label: 'Active' },
            { value: 'no', label: 'Inactive' },
            { value: 'all', label: 'All' },
          ]}
          value={v.active}
          onChange={(e) => url.set({ active: e.target.value })}
          containerClassName="w-[120px]"
        />
        {any && (
          <Button variant="ghost" size="sm" icon={X} onClick={() => url.set({ q: null, state: null, city: null, type: null, active: null })}>
            Clear
          </Button>
        )}
      </div>
      <DataTable
        label="Party master"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(c) => c.id}
        minWidth={1100}
        loading={list.isLoading}
        onRowClick={(c) => setLedger(c)}
        empty={<EmptyState icon={Users} title="No parties found" />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
      <CustomerForm open={form !== null} customer={form === 'new' ? null : form} onClose={() => setForm(null)} />
      <LedgerDialog customer={ledger} onClose={() => setLedger(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.name ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={() =>
          void remove
            .mutateAsync(toDelete!.id)
            .then(() => toast({ tone: 'success', title: `${toDelete!.name} deleted` }))
            .catch((err) => toast({ tone: 'error', title: 'Can’t delete', description: errorMessage(err) }))
            .finally(() => setToDelete(null))
        }
        onClose={() => setToDelete(null)}
      >
        A party on any proforma, order or invoice can’t be deleted; mark it inactive instead.
      </ConfirmDialog>
    </div>
  );
}
