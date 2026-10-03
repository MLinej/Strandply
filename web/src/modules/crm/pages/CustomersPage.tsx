import { ArrowLeft, CalendarPlus, ClipboardList, Link2, MessageCircle, Pencil, Phone, Target } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CUSTOMER_TYPES, PRIORITIES, type CrmCustomer } from '@contracts/crm';
import { useSession } from '@/app/session';
import { Button, Card, Combo, Select, Skeleton, Tabs, useToast, type Column } from '@/components/ui';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage } from '../../samples/ui/errors';
import { useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { useSalesOptions } from '../../sales/api';
import { useCrmMeta, useCustomer360, useSaveRecord } from '../api';
import { RecordForm } from '../components/RecordForm';
import { RecordList } from '../components/RecordList';
import { CUSTOMER_FIELDS, FOLLOWUP_FIELDS, OPP_FIELDS, TASK_FIELDS } from '../fields';
import { CustomerPill, d, FollowupPill, inr, PriorityPill, QuotePill, StagePill, TaskPill, telLink, waLink } from '../ui';

type Tab = 'overview' | 'opps' | 'fu' | 'quotes' | 'orders' | 'tasks' | 'timeline';

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="py-4 text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-1.5 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-divider align-top">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-1.5">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Link the CRM customer to the Sales party master (only for people who can see it). */
function SalesLink({ c }: { c: CrmCustomer }) {
  const toast = useToast();
  const save = useSaveRecord('customers');
  const parties = useSalesOptions().data?.customers ?? [];
  const options = useMemo(() => parties.map((p) => ({ id: p.id, label: p.name, hint: p.city })), [parties]);
  return (
    <Combo
      label="Sales party"
      value={c.salesCustomerId}
      options={options}
      placeholder="Link to a Sales party"
      onChange={(id) =>
        void save
          .mutateAsync({ id: c.id, input: { salesCustomerId: id } })
          .then(() => toast({ tone: 'success', title: id ? 'Linked to Sales party' : 'Unlinked' }))
          .catch((err) => toast({ tone: 'error', title: 'Couldn’t link', description: errorMessage(err) }))
      }
    />
  );
}

/** One customer (legacy renderCustomer360). */
function Customer360({ id, onBack }: { id: string; onBack: () => void }) {
  const { canDo, user } = useSession();
  const v = useCustomer360(id).data;
  const [tab, setTab] = useState<Tab>('overview');
  const [form, setForm] = useState<'edit' | 'fu' | 'opp' | 'task' | null>(null);
  const salesAccess = user.permissions.includes('*') || user.permissions.includes('sales.masters');
  if (!v) return <Skeleton className="m-6 h-96" />;
  const c = v.customer;
  const tabs: { value: Tab; label: string }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'opps', label: `Opportunities (${v.opportunities.length})` },
    { value: 'fu', label: `Follow-ups (${v.followups.length})` },
    { value: 'quotes', label: `Quotations (${v.quotations.length})` },
    { value: 'orders', label: `Orders (${v.won.length + v.lost.length})` },
    { value: 'tasks', label: `Tasks (${v.tasks.length})` },
    { value: 'timeline', label: 'Timeline' },
  ];
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title={c.companyName}
        description={[c.city, c.state, c.customerType].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button icon={ArrowLeft} onClick={onBack}>
              All customers
            </Button>
            {canDo('edit') && (
              <>
                <Button icon={Pencil} onClick={() => setForm('edit')}>
                  Edit
                </Button>
                <Button icon={ClipboardList} onClick={() => setForm('task')}>
                  Task
                </Button>
                <Button icon={Target} onClick={() => setForm('opp')}>
                  Opportunity
                </Button>
                <Button variant="primary" icon={CalendarPlus} onClick={() => setForm('fu')}>
                  Log follow-up
                </Button>
              </>
            )}
          </>
        }
      />
      <div className="grid gap-3.5 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-3">
          <Tabs<Tab> aria-label="Customer views" items={tabs} value={tab} onChange={setTab} />
          {tab === 'overview' && (
            <Card>
              <DetailList
                cols={3}
                items={[
                  { label: 'Contact 1', value: [c.contactPerson, c.designation].filter(Boolean).join(', ') || null },
                  { label: 'Mobile', value: c.mobile },
                  { label: 'WhatsApp', value: c.whatsapp },
                  { label: 'Contact 2', value: [c.contactPerson2, c.mobile2].filter(Boolean).join(' · ') || null },
                  { label: 'Email', value: c.email },
                  { label: 'Website', value: c.website },
                  { label: 'GSTIN', value: c.gstin },
                  { label: 'PAN', value: c.pan },
                  { label: 'Territory', value: c.territory },
                  { label: 'Address', value: c.address, wide: true },
                  { label: 'Monthly requirement', value: c.estMonthlyReq },
                  { label: 'Products used', value: c.productsUsed },
                  { label: 'Current supplier', value: c.currentSupplier },
                  { label: 'Purchase value', value: c.approxPurchaseValue },
                  { label: 'Preferred thickness / size', value: [c.preferredThickness, c.preferredSize].filter(Boolean).join(' · ') || null },
                  { label: 'Application', value: c.application },
                  { label: 'Existing / competitor brand', value: [c.existingBrand, c.competitorBrand].filter(Boolean).join(' / ') || null },
                  { label: 'Payment / credit', value: [c.paymentPreference, c.creditRequirement].filter(Boolean).join(' · ') || null },
                  { label: 'Lead source', value: c.leadSource },
                  { label: 'Salesperson', value: c.salesperson },
                  { label: 'First / last contact', value: `${d(c.firstContactDate)} / ${d(c.lastContactDate)}` },
                  { label: 'Remarks', value: c.remarks, wide: true },
                ]}
              />
            </Card>
          )}
          {tab === 'opps' && (
            <Table
              head={['Product', 'Quantity', 'Est. value', 'Stage', 'Probability', 'Expected close']}
              rows={v.opportunities.map((o) => [o.product, o.quantity ?? '—', inr(o.estValuePaise), <StagePill s={o.stage} />, `${o.probability}%`, d(o.expectedClosingDate)])}
              empty="No opportunities yet."
            />
          )}
          {tab === 'fu' && (
            <Table
              head={['Date', 'Type', 'Discussion', 'Next action', 'Next date', 'Status']}
              rows={v.followups.map((f) => [d(f.date), f.type, f.discussion ?? '—', f.nextAction ?? '—', d(f.nextFollowUpDate), <FollowupPill s={f.status} />])}
              empty="No follow-ups logged yet."
            />
          )}
          {tab === 'quotes' && (
            <Table
              head={['Quote', 'Date', 'Product', 'Qty', 'Final value', 'Status']}
              rows={v.quotations.map((q) => [
                <Link to={`/crm/quotations?q=${encodeURIComponent(q.quoteNo)}`} className="font-medium hover:underline">
                  {q.quoteNo}
                </Link>,
                d(q.date),
                q.product,
                q.quantity,
                inr(q.finalPaise),
                <QuotePill s={q.status} />,
              ])}
              empty="No quotations yet."
            />
          )}
          {tab === 'orders' && (
            <>
              <h3 className="text-label font-semibold uppercase tracking-label text-faint">Orders won</h3>
              <Table head={['Order', 'Date', 'Product', 'Qty', 'Value']} rows={v.won.map((o) => [o.orderNo, d(o.orderDate), o.product, o.quantity ?? '—', inr(o.orderValuePaise)])} empty="None yet." />
              <h3 className="text-label font-semibold uppercase tracking-label text-faint">Orders lost</h3>
              <Table head={['Date', 'Product', 'Est. value', 'Reason', 'Competitor']} rows={v.lost.map((o) => [d(o.lostDate), o.product, inr(o.estValuePaise), o.lostReason, o.competitor ?? '—'])} empty="None yet." />
            </>
          )}
          {tab === 'tasks' && (
            <Table head={['Task', 'Assigned to', 'Due', 'Priority', 'Status']} rows={v.tasks.map((t) => [t.type, t.assignedTo ?? '—', <span className={t.overdue ? 'font-semibold text-primary' : ''}>{d(t.dueDate)}</span>, <PriorityPill p={t.priority} />, <TaskPill s={t.status} />])} empty="No tasks." />
          )}
          {tab === 'timeline' && (
            <ol className="flex flex-col gap-2" aria-label="Timeline">
              {v.timeline.length ? (
                v.timeline.map((e, i) => (
                  <li key={i} className="grid grid-cols-[100px_130px_1fr] gap-2 border-b border-divider pb-2 text-sm">
                    <span className="tabular-nums text-muted">{d(e.date)}</span>
                    <span className="font-medium">{e.kind}</span>
                    <span>{e.text}</span>
                  </li>
                ))
              ) : (
                <p className="text-sm text-muted">No activity recorded yet.</p>
              )}
            </ol>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <Card title="Lead score">
            <div className="flex items-center gap-2">
              <PriorityPill p={c.priority} />
              <CustomerPill s={c.status} />
            </div>
          </Card>
          <Card title="Next action">
            <p className="text-sm">{c.nextFollowUp ? `Follow up on ${d(c.nextFollowUp)}` : 'No next follow-up scheduled'}</p>
            <div className="mt-2 flex gap-2">
              {telLink(c.mobile) && (
                <a href={telLink(c.mobile)!} className="inline-flex items-center gap-1 text-sm font-medium hover:underline">
                  <Phone size={14} aria-hidden /> Call
                </a>
              )}
              {waLink(c.whatsapp ?? c.mobile) && (
                <a href={waLink(c.whatsapp ?? c.mobile)!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium hover:underline">
                  <MessageCircle size={14} aria-hidden /> WhatsApp
                </a>
              )}
            </div>
          </Card>
          <Card title="Sales" description={v.salesParty ? undefined : 'Link a Sales party to see their orders and invoices.'}>
            {v.sales && (
              <p className="mb-2 text-sm">
                <strong className="tabular-nums">{inr(v.sales.invoicedPaise)}</strong> invoiced in {v.sales.invoices} invoice{v.sales.invoices === 1 ? '' : 's'} · {v.sales.orders} order{v.sales.orders === 1 ? '' : 's'}
                {v.sales.lastInvoice && <span className="text-muted"> · last {d(v.sales.lastInvoice)}</span>}
              </p>
            )}
            {salesAccess && canDo('edit') ? (
              <SalesLink c={c} />
            ) : (
              v.salesParty && (
                <p className="flex items-center gap-1 text-sm">
                  <Link2 size={14} aria-hidden /> {v.salesParty.name}
                </p>
              )
            )}
          </Card>
        </div>
      </div>
      <RecordForm kind="customers" open={form === 'edit'} record={c} title={`Edit ${c.companyName}`} fields={CUSTOMER_FIELDS} size="xl" onClose={() => setForm(null)} />
      <RecordForm kind="followups" open={form === 'fu'} record={null} title={`Follow-up · ${c.companyName}`} fields={FOLLOWUP_FIELDS} initial={{ customerId: c.id, type: 'Call', status: 'Pending' }} onClose={() => setForm(null)} />
      <RecordForm kind="opportunities" open={form === 'opp'} record={null} title={`Opportunity · ${c.companyName}`} fields={OPP_FIELDS} initial={{ customerId: c.id, stage: 'Qualification', probability: 25, salesperson: c.salesperson }} onClose={() => setForm(null)} />
      <RecordForm kind="tasks" open={form === 'task'} record={null} title={`Task · ${c.companyName}`} fields={TASK_FIELDS} initial={{ customerId: c.id, priority: c.priority, status: 'Pending', assignedTo: c.salesperson }} onClose={() => setForm(null)} />
    </div>
  );
}

const columns: Column<CrmCustomer>[] = [
  {
    id: 'name',
    header: 'Company',
    cell: (c) => (
      <span className="flex flex-col leading-tight">
        <span className="font-medium">{c.companyName}</span>
        <span className="text-caption text-faint">{[c.contactPerson, c.customerType].filter(Boolean).join(' · ')}</span>
      </span>
    ),
  },
  { id: 'mobile', header: 'Mobile', width: '120px', className: 'tabular-nums text-sm', cell: (c) => c.mobile },
  { id: 'city', header: 'City', width: '130px', className: 'text-sm', cell: (c) => c.city ?? '—' },
  { id: 'sp', header: 'Salesperson', width: '140px', className: 'text-sm', cell: (c) => c.salesperson ?? '—' },
  { id: 'pri', header: 'Priority', width: '90px', cell: (c) => <PriorityPill p={c.priority} /> },
  { id: 'st', header: 'Status', width: '100px', cell: (c) => <CustomerPill s={c.status} /> },
  { id: 'last', header: 'Last contact', width: '110px', className: 'tabular-nums text-sm', cell: (c) => d(c.lastContactDate) },
  { id: 'next', header: 'Next follow-up', width: '120px', className: 'tabular-nums text-sm', cell: (c) => d(c.nextFollowUp) },
];

/** Customer / Party Master (legacy customers): every qualified lead as a full profile, with a 360° view. */
export function CustomersPage() {
  const url = useUrlState([] as const);
  const meta = useCrmMeta().data;
  if (url.open) return <Customer360 id={url.open} onBack={() => url.set({ open: null })} />;
  return (
    <RecordList
      kind="customers"
      title="Customers"
      description="Every qualified lead lives here as a full profile. Open one for its 360° view."
      noun="customer"
      columns={columns}
      fields={CUSTOMER_FIELDS}
      newInitial={{ status: 'Active', priority: 'Warm' }}
      filterKeys={['type', 'priority', 'status', 'salesperson']}
      filters={(v, set) => (
        <>
          <Select aria-label="Type" placeholder="All types" options={CUSTOMER_TYPES.map((s) => ({ value: s, label: s }))} value={v.type} onChange={(e) => set({ type: e.target.value })} containerClassName="w-[170px]" />
          <Select aria-label="Priority" placeholder="All priorities" options={PRIORITIES.map((s) => ({ value: s, label: s }))} value={v.priority} onChange={(e) => set({ priority: e.target.value })} containerClassName="w-[140px]" />
          <Select
            aria-label="Status"
            options={[
              { value: '', label: 'Active' },
              { value: 'Inactive', label: 'Inactive' },
              { value: 'Archived', label: 'Archived' },
              { value: 'all', label: 'All' },
            ]}
            value={v.status}
            onChange={(e) => set({ status: e.target.value })}
            containerClassName="w-[120px]"
          />
          <Select aria-label="Salesperson" placeholder="All salespersons" options={(meta?.salespersons ?? []).map((s) => ({ value: s, label: s }))} value={v.salesperson} onChange={(e) => set({ salesperson: e.target.value })} containerClassName="w-[170px]" />
        </>
      )}
      toQuery={(v) => ({ customerType: v.type || undefined, priority: v.priority || undefined, status: v.status === 'all' ? undefined : v.status || 'Active', salesperson: v.salesperson || undefined })}
      exportKind="customers"
      searchPlaceholder="Company, contact, mobile, city, GSTIN"
      onRowClick={(c) => url.set({ open: c.id })}
      minWidth={1100}
    />
  );
}
