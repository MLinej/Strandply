import { Check, Printer, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { OPP_STAGES, QUOTE_STATUSES, quoteTotals, TASK_STATUSES, type CrmTask, type OpportunityView, type OrderLostView, type OrderWonView, type QuotationView, type TaskView } from '@contracts/crm';
import { useSession } from '@/app/session';
import { Card, KpiTile, MenuItem, Select, useToast, type Column } from '@/components/ui';
import { errorMessage } from '../../samples/ui/errors';
import { BarList } from '../../purchase/ui';
import { useCloseOpportunity, useCrmMeta, useReactivate, useRecords, useSaveRecord } from '../api';
import { RecordForm } from '../components/RecordForm';
import { RecordList } from '../components/RecordList';
import { LOST_FIELDS, OPP_FIELDS, QUOTE_FIELDS, TASK_FIELDS, WON_FIELDS } from '../fields';
import { printQuotation } from '../print';
import { d, inr, lakh, PriorityPill, QuotePill, StagePill, TaskPill, toPaise } from '../ui';

const customerCell = (r: { customerId: string; customerName: string; city: string | null }) => (
  <span className="flex flex-col leading-tight">
    <Link to={`/crm/customers?open=${r.customerId}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
      {r.customerName}
    </Link>
    {r.city && <span className="text-caption text-faint">{r.city}</span>}
  </span>
);

function useSalespersonSelect() {
  const meta = useCrmMeta().data;
  return (value: string, onChange: (v: string) => void) => (
    <Select aria-label="Salesperson" placeholder="All salespersons" options={(meta?.salespersons ?? []).map((s) => ({ value: s, label: s }))} value={value} onChange={(e) => onChange(e.target.value)} containerClassName="w-[170px]" />
  );
}

/** Opportunity management (legacy opportunities): several per customer; close as won or lost. */
export function OpportunitiesPage() {
  const { canDo } = useSession();
  const close = useCloseOpportunity();
  const sp = useSalespersonSelect();
  const [closing, setClosing] = useState<{ o: OpportunityView; outcome: 'won' | 'lost' } | null>(null);
  const columns: Column<OpportunityView>[] = [
    { id: 'cust', header: 'Customer', cell: customerCell },
    { id: 'product', header: 'Product', width: '170px', cell: (o) => `${o.product}${o.thickness ? ` · ${o.thickness}` : ''}` },
    { id: 'qty', header: 'Quantity', width: '130px', className: 'text-sm', cell: (o) => o.quantity ?? '—' },
    { id: 'value', header: 'Est. value', width: '120px', align: 'right', className: 'font-semibold tabular-nums', cell: (o) => inr(o.estValuePaise) },
    { id: 'stage', header: 'Stage', width: '150px', cell: (o) => <StagePill s={o.stage} /> },
    { id: 'prob', header: 'Prob.', width: '70px', align: 'right', className: 'tabular-nums', cell: (o) => `${o.probability}%` },
    { id: 'sp', header: 'Salesperson', width: '130px', className: 'text-sm', cell: (o) => o.salesperson ?? '—' },
    { id: 'close', header: 'Expected close', width: '120px', className: 'tabular-nums text-sm', cell: (o) => d(o.expectedClosingDate) },
  ];
  return (
    <>
      <RecordList
        kind="opportunities"
        title="Opportunities"
        description="A customer can have several at once. Mark one won or lost to close it."
        noun="opportunity"
        columns={columns}
        fields={OPP_FIELDS}
        newInitial={{ stage: 'Qualification', probability: 25 }}
        filterKeys={['stage', 'salesperson']}
        filters={(v, set) => (
          <>
            <Select aria-label="Stage" placeholder="All stages" options={OPP_STAGES.map((s) => ({ value: s, label: s }))} value={v.stage} onChange={(e) => set({ stage: e.target.value })} containerClassName="w-[170px]" />
            {sp(v.salesperson, (x) => set({ salesperson: x }))}
          </>
        )}
        toQuery={(v) => ({ stage: v.stage || undefined, salesperson: v.salesperson || undefined })}
        exportKind="opportunities"
        searchPlaceholder="Product, competitor, notes"
        minWidth={1150}
        rowActions={(o, c) =>
          canDo('edit') &&
          o.stage !== 'Order Won' &&
          o.stage !== 'Order Lost' && (
            <>
              <MenuItem icon={ThumbsUp} onClick={() => (c(), setClosing({ o, outcome: 'won' }))}>
                Mark won
              </MenuItem>
              <MenuItem icon={ThumbsDown} onClick={() => (c(), setClosing({ o, outcome: 'lost' }))}>
                Mark lost
              </MenuItem>
            </>
          )
        }
      />
      <RecordForm
        kind="opportunities"
        open={!!closing}
        record={null}
        initial={closing?.outcome === 'won' ? { orderValuePaise: closing.o.estValuePaise } : { competitor: closing?.o.competitor }}
        title={closing ? `${closing.outcome === 'won' ? 'Order won' : 'Order lost'} · ${closing.o.customerName}, ${closing.o.product}` : ''}
        fields={closing?.outcome === 'won' ? WON_FIELDS : LOST_FIELDS}
        submitLabel={closing?.outcome === 'won' ? 'Mark won' : 'Mark lost'}
        onClose={() => setClosing(null)}
        submit={(input) => close.mutateAsync({ id: closing!.o.id, outcome: closing!.outcome, input })}
      />
    </>
  );
}

/** Quotation management (legacy quotations): QT/26-27/0001, printable. */
export function QuotationsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const columns: Column<QuotationView>[] = [
    {
      id: 'no',
      header: 'Quotation',
      width: '140px',
      cell: (q) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold tabular-nums">{q.quoteNo}</span>
          <span className="text-caption text-faint">{d(q.date)}</span>
        </span>
      ),
    },
    { id: 'cust', header: 'Customer', cell: customerCell },
    { id: 'product', header: 'Product', width: '140px', cell: (q) => q.product },
    { id: 'qty', header: 'Qty', width: '80px', align: 'right', className: 'tabular-nums', cell: (q) => q.quantity },
    { id: 'rate', header: 'Rate', width: '100px', align: 'right', className: 'tabular-nums text-sm', cell: (q) => inr(q.ratePaise) },
    { id: 'final', header: 'Final value', width: '130px', align: 'right', className: 'font-semibold tabular-nums', cell: (q) => inr(q.finalPaise) },
    { id: 'valid', header: 'Valid until', width: '110px', className: 'tabular-nums text-sm', cell: (q) => d(q.validUntil) },
    { id: 'st', header: 'Status', width: '140px', cell: (q) => <QuotePill s={q.status} /> },
  ];
  return (
    <RecordList
      kind="quotations"
      title="Quotations"
      description="From draft to acceptance. Totals add GST on quantity × rate."
      noun="quotation"
      columns={columns}
      fields={QUOTE_FIELDS}
      newInitial={{ gstPct: 18, status: 'Draft' }}
      formExtra={(v) => {
        const t = quoteTotals({ quantity: Number(v.quantity) || 0, ratePaise: toPaise(String(v.ratePaise ?? '')), gstPct: Number(v.gstPct) || 0 });
        return (
          <p className="text-right text-base tabular-nums" aria-label="Quotation total">
            {inr(t.totalPaise)} + GST {inr(t.gstPaise)} = <strong>{inr(t.finalPaise)}</strong>
          </p>
        );
      }}
      filterKeys={['status']}
      filters={(v, set) => <Select aria-label="Status" placeholder="All statuses" options={QUOTE_STATUSES.map((s) => ({ value: s, label: s }))} value={v.status} onChange={(e) => set({ status: e.target.value })} containerClassName="w-[170px]" />}
      toQuery={(v) => ({ status: v.status || undefined })}
      exportKind="quotations"
      searchPlaceholder="Quotation no., product"
      minWidth={1150}
      rowActions={(q, c) =>
        canDo('print') && (
          <MenuItem icon={Printer} onClick={() => (c(), void printQuotation(q.id).catch((err) => toast({ tone: 'error', title: 'Couldn’t print', description: errorMessage(err) })))}>
            Print
          </MenuItem>
        )
      }
    />
  );
}

/** Orders won (legacy won): converted opportunities, kept for history. */
export function WonPage() {
  const all = useRecords('won', { pageSize: 100 }).data?.rows ?? [];
  const columns: Column<OrderWonView>[] = [
    {
      id: 'no',
      header: 'Order',
      width: '140px',
      cell: (o) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold tabular-nums">{o.orderNo}</span>
          <span className="text-caption text-faint">{d(o.orderDate)}</span>
        </span>
      ),
    },
    { id: 'cust', header: 'Customer', cell: customerCell },
    { id: 'product', header: 'Product', width: '150px', cell: (o) => `${o.product}${o.quantity ? ` · ${o.quantity}` : ''}` },
    { id: 'value', header: 'Value', width: '130px', align: 'right', className: 'font-semibold tabular-nums', cell: (o) => inr(o.orderValuePaise) },
    { id: 'sp', header: 'Salesperson', width: '130px', className: 'text-sm', cell: (o) => o.salesperson ?? '—' },
    { id: 'days', header: 'Lead → order', width: '110px', align: 'right', className: 'tabular-nums text-sm', cell: (o) => (o.leadToOrderDays === null ? '—' : `${o.leadToOrderDays} days`) },
    { id: 'disp', header: 'Dispatch', width: '110px', className: 'tabular-nums text-sm', cell: (o) => d(o.dispatchDate) },
  ];
  return (
    <RecordList
      kind="won"
      title="Orders won"
      description="Opportunities marked won. Deleting one reopens its opportunity."
      noun="order"
      canAdd={false}
      columns={columns}
      fields={WON_FIELDS}
      exportKind="won"
      searchPlaceholder="Order no., product"
      above={
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiTile label="Orders won" value={String(all.length)} meta="All time" />
          <KpiTile label="Value" value={lakh(all.reduce((s, o) => s + o.orderValuePaise, 0))} meta="Order value" />
          <KpiTile label="Average lead → order" value={all.some((o) => o.leadToOrderDays !== null) ? `${Math.round(all.reduce((s, o) => s + (o.leadToOrderDays ?? 0), 0) / all.filter((o) => o.leadToOrderDays !== null).length)} days` : '—'} meta="From first contact" />
        </div>
      }
    />
  );
}

/** Orders lost (legacy lost): every lost order with its reason; reactivate into a new opportunity. */
export function LostPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const today = useCrmMeta().data?.today ?? '';
  const all = useRecords('lost', { pageSize: 100 }).data?.rows ?? [];
  const reactivate = useReactivate();
  const due = all.filter((l) => l.reactivationDate && l.reactivationDate <= today && !l.reactivatedOppId);
  const total = all.reduce((s, o) => s + o.estValuePaise, 0);
  const count = (key: (l: OrderLostView) => string) => {
    const m = new Map<string, number>();
    for (const l of all) m.set(key(l), (m.get(key(l)) ?? 0) + 1);
    return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const columns: Column<OrderLostView>[] = [
    { id: 'date', header: 'Lost', width: '100px', className: 'tabular-nums text-sm', cell: (o) => d(o.lostDate) },
    { id: 'cust', header: 'Customer', cell: customerCell },
    { id: 'product', header: 'Product', width: '130px', cell: (o) => o.product },
    { id: 'value', header: 'Est. value', width: '120px', align: 'right', className: 'tabular-nums', cell: (o) => inr(o.estValuePaise) },
    { id: 'comp', header: 'Competitor', width: '140px', className: 'text-sm', cell: (o) => o.competitor ?? '—' },
    { id: 'reason', header: 'Reason', width: '190px', className: 'text-sm', cell: (o) => o.lostReason },
    { id: 'sp', header: 'Salesperson', width: '130px', className: 'text-sm', cell: (o) => o.salesperson ?? '—' },
    { id: 'react', header: 'Reactivate', width: '120px', className: 'tabular-nums text-sm', cell: (o) => (o.reactivatedOppId ? 'Reactivated' : d(o.reactivationDate)) },
  ];
  const run = (l: OrderLostView) =>
    void reactivate
      .mutateAsync(l.id)
      .then(() => toast({ tone: 'success', title: `New opportunity for ${l.customerName}` }))
      .catch((err) => toast({ tone: 'error', title: 'Couldn’t reactivate', description: errorMessage(err) }));
  return (
    <RecordList
      kind="lost"
      title="Orders lost"
      description="Every lost order with its reason. Reactivate one to put it back in the pipeline."
      noun="lost order"
      canAdd={false}
      columns={columns}
      fields={LOST_FIELDS}
      exportKind="lost"
      searchPlaceholder="Product, competitor, reason"
      minWidth={1150}
      rowActions={(l, c) =>
        canDo('edit') &&
        !l.reactivatedOppId && (
          <MenuItem icon={RotateCcw} onClick={() => (c(), run(l))}>
            Reactivate
          </MenuItem>
        )
      }
      above={
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <KpiTile label="Orders lost" value={String(all.length)} meta="All time" />
            <KpiTile label="Lost value" value={lakh(total)} meta="Estimated" />
            <KpiTile label="Average lost value" value={lakh(all.length ? Math.round(total / all.length) : 0)} meta="Per order" />
            <KpiTile label="Due for reactivation" value={String(due.length)} meta="Reactivation date reached" />
          </div>
          <div className="grid gap-3.5 lg:grid-cols-2">
            <Card title="By reason">
              <BarList rows={count((l) => l.lostReason)} format={String} empty="No lost orders" />
            </Card>
            <Card title="By salesperson">
              <BarList rows={count((l) => l.salesperson ?? 'Unassigned')} format={String} empty="No lost orders" />
            </Card>
          </div>
        </>
      }
    />
  );
}

/** Tasks & reminders (legacy tasks). */
export function TasksPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const save = useSaveRecord('tasks');
  const sp = useSalespersonSelect();
  const columns: Column<TaskView>[] = [
    { id: 'type', header: 'Task', width: '170px', className: 'font-medium', cell: (t) => t.type },
    {
      id: 'cust',
      header: 'Customer',
      cell: (t) =>
        t.customerId ? (
          <Link to={`/crm/customers?open=${t.customerId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
            {t.customerName}
          </Link>
        ) : (
          '—'
        ),
    },
    { id: 'to', header: 'Assigned to', width: '140px', className: 'text-sm', cell: (t) => t.assignedTo ?? '—' },
    { id: 'due', header: 'Due', width: '110px', className: 'tabular-nums text-sm', cell: (t) => <span className={t.overdue ? 'font-semibold text-primary' : ''}>{d(t.dueDate)}</span> },
    { id: 'pri', header: 'Priority', width: '90px', cell: (t) => <PriorityPill p={t.priority} /> },
    { id: 'st', header: 'Status', width: '120px', cell: (t) => <TaskPill s={t.status} /> },
    { id: 'rem', header: 'Remarks', className: 'text-sm', cell: (t) => t.remarks ?? '—' },
  ];
  return (
    <RecordList
      kind="tasks"
      title="Tasks & reminders"
      description="Action items for the sales and marketing team, soonest first. Overdue dates are in red."
      noun="task"
      columns={columns}
      fields={TASK_FIELDS}
      newInitial={{ priority: 'Warm', status: 'Pending' }}
      filterKeys={['status', 'assignedTo']}
      filters={(v, set) => (
        <>
          <Select aria-label="Status" placeholder="All statuses" options={TASK_STATUSES.map((s) => ({ value: s, label: s }))} value={v.status} onChange={(e) => set({ status: e.target.value })} containerClassName="w-[150px]" />
          {sp(v.assignedTo, (x) => set({ assignedTo: x }))}
        </>
      )}
      toQuery={(v) => ({ status: v.status || undefined, assignedTo: v.assignedTo || undefined })}
      searchPlaceholder="Task, remarks"
      rowActions={(t: CrmTask, c) =>
        canDo('edit') &&
        t.status !== 'Completed' && (
          <MenuItem
            icon={Check}
            onClick={() => {
              c();
              void save
                .mutateAsync({ id: t.id, input: { status: 'Completed' } })
                .then(() => toast({ tone: 'success', title: 'Task done' }))
                .catch((err) => toast({ tone: 'error', title: 'Couldn’t update', description: errorMessage(err) }));
            }}
          >
            Mark done
          </MenuItem>
        )
      }
    />
  );
}
