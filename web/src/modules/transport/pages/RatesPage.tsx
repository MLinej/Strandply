import { ArrowLeft, Check, FileText, Package, Plus, Printer, Save, Search, Send, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { rcCheck, RC_STATUSES, RC_STATUS_LABEL, routeOf, TRANSIT_TIMES, type InquiryView, type RateComparisonView, type RcStatus } from '@contracts/transport';
import { useSession } from '@/app/session';
import { Button, Card, Combo, DataTable, EmptyState, Input, Modal, Pagination, Pill, Select, Skeleton, Tabs, Textarea, useToast, type Column } from '@/components/ui';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { useCreateOrder, useDecideRc, useInquiry, usePastQuotes, useRc, useRcs, useSaveRc, useSubmitRc, useTransportMeta } from '../api';
import { printOrder } from '../print';
import { d, FlowChain, inr, InquiryPill, placeText, RcPill, rupeesText, stamp, stars, toPaise, weight } from '../ui';

const PAGE_SIZE = 25;
interface Row {
  transporterId: string | null;
  rate: string;
  transit: string;
  mg: string;
}
const blank = (transporterId: string | null = null): Row => ({ transporterId, rate: '', transit: '2 Days', mg: '' });
const TRAIL: Record<string, string> = { submitted: 'Submitted for approval', approved: 'Approved', exception_approved: 'Approved as an exception', rejected: 'Rejected', reopened: 'Reworked after rejection', ordered: 'Order form issued' };

/** Approve / reject with a note (a note is required to reject). */
function DecisionDialog({ rc, decision, onClose }: { rc: RateComparisonView; decision: 'approve' | 'reject' | null; onClose: () => void }) {
  const toast = useToast();
  const decide = useDecideRc();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  useEffect(() => {
    setNote('');
    setError(undefined);
  }, [decision]);
  const run = async () => {
    if (decision === 'reject' && !note.trim()) return setError('Give a reason');
    try {
      await decide.mutateAsync({ id: rc.id, decision: decision!, note: note.trim() || null });
      toast({ tone: 'success', title: decision === 'approve' ? `${rc.approvalNo} approved` : `${rc.approvalNo} rejected` });
      onClose();
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t record the decision', description: errorMessage(err) });
    }
  };
  return (
    <Modal
      open={decision !== null}
      onClose={onClose}
      size="sm"
      title={decision === 'approve' ? `Approve ${rc.approvalNo}?` : `Reject ${rc.approvalNo}?`}
      description={decision === 'approve' ? (rc.needsJustification ? 'This is an exception: the chosen rate is not the lowest or is over budget.' : 'The lowest rate, within budget.') : 'Dispatch can rework the comparison and submit again.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={decide.isPending} onClick={() => void run()}>
            {decision === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </>
      }
    >
      <Textarea label={decision === 'reject' ? 'Reason' : 'Note (optional)'} rows={3} value={note} onChange={(e) => setNote(e.target.value)} error={error} />
    </Modal>
  );
}

/**
 * One inquiry's rate comparison and its approval (legacy Rate Comparison + Freight Approval + Generate Order Form):
 * quotes per transporter, the lowest marked, a reason when another or an over-budget rate is chosen, then the
 * approval trail and the order form.
 */
function Workspace({ inquiry, rc, onBack }: { inquiry: InquiryView; rc: RateComparisonView | null; onBack: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { canDo } = useSession();
  const meta = useTransportMeta().data;
  const past = usePastQuotes(inquiry.id).data ?? [];
  const save = useSaveRc();
  const submit = useSubmitRc();
  const createOrder = useCreateOrder();
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [justification, setJustification] = useState('');
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const transporters = meta?.transporters ?? [];

  // Start from the saved quotes, or suggest active transporters that run this vehicle (those serving the route first).
  useEffect(() => {
    if (!meta) return;
    if (rc) {
      setRows(rc.quotes.map((q) => ({ transporterId: q.transporterId, rate: rupeesText(q.ratePaise), transit: q.transit, mg: q.mgWeightMt?.toString() ?? '' })));
      setSelected(rc.selected);
      setJustification(rc.justification ?? '');
      return;
    }
    const serves = (t: (typeof transporters)[number]) => t.cities.some((c) => [inquiry.from.city, inquiry.to.city].some((x) => x.toLowerCase() === c.toLowerCase()));
    const fit = transporters.filter((t) => t.vehicles.includes(inquiry.vehicle)).sort((a, b) => Number(serves(b)) - Number(serves(a)) || b.rating - a.rating);
    setRows(fit.length ? fit.slice(0, 4).map((t) => blank(t.id)) : [blank(), blank(), blank()]);
    setSelected(null);
    setJustification('');
  }, [rc?.id, rc?.updatedAt, meta, inquiry.id]);

  const editable = canDo('edit') && inquiry.status !== 'cancelled' && (!rc || rc.status === 'draft' || rc.status === 'rejected');
  const quotes = rows.map((r) => ({ ratePaise: toPaise(r.rate) }));
  const check = rcCheck(quotes, selected, inquiry.budgetPaise);
  const highest = Math.max(0, ...quotes.map((q) => q.ratePaise));
  const options = useMemo(() => transporters.map((t) => ({ id: t.id, label: t.name, hint: t.vehicles.includes(inquiry.vehicle) ? stars(t.rating) : `${stars(t.rating)} · other vehicles` })), [transporters, inquiry.vehicle]);
  const name = (id: string | null) => transporters.find((t) => t.id === id)?.name ?? rc?.quotes.find((q) => q.transporterId === id)?.transporterName ?? '—';
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const body = () => ({
    quotes: rows.filter((r) => r.transporterId).map((r) => ({ transporterId: r.transporterId, ratePaise: toPaise(r.rate), transit: r.transit, mgWeightMt: r.mg || null })),
    // indexes shift when blank rows are dropped
    selected: selected === null || !rows[selected]?.transporterId ? null : rows.slice(0, selected).filter((r) => r.transporterId).length,
    justification: justification.trim() || null,
  });
  const saveDraft = async (quiet = false) => {
    const saved = await save.mutateAsync({ inquiryId: inquiry.id, input: body() });
    if (!quiet) toast({ tone: 'success', title: `${saved.rcNo} saved as draft` });
    if (!rc) navigate(`/transport/rates?open=${saved.id}`, { replace: true });
    return saved;
  };
  const run = (fn: () => Promise<unknown>, failTitle: string) => void fn().catch((err) => toast({ tone: 'error', title: failTitle, description: errorMessage(err) }));

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title={rc ? `${rc.rcNo} · ${routeOf(inquiry.from, inquiry.to)}` : `Compare rates · ${routeOf(inquiry.from, inquiry.to)}`}
        description={[inquiry.inqNo, inquiry.material, inquiry.weightMt !== null && weight(inquiry.weightMt), inquiry.vehicle].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button icon={ArrowLeft} onClick={onBack}>
              All comparisons
            </Button>
            {editable && (
              <>
                <Button icon={Save} loading={save.isPending} onClick={() => run(() => saveDraft(), 'Couldn’t save')}>
                  Save draft
                </Button>
                <Button
                  variant="primary"
                  icon={Send}
                  loading={submit.isPending}
                  onClick={() =>
                    run(async () => {
                      const saved = await saveDraft(true);
                      const sent = await submit.mutateAsync(saved.id);
                      toast({ tone: 'success', title: `Sent for approval as ${sent.approvalNo}` });
                    }, 'Can’t submit')
                  }
                >
                  Submit for approval
                </Button>
              </>
            )}
            {rc?.status === 'pending' && canDo('transport_approve') && (
              <>
                <Button icon={X} onClick={() => setDecision('reject')}>
                  Reject
                </Button>
                <Button variant="primary" icon={Check} onClick={() => setDecision('approve')}>
                  Approve
                </Button>
              </>
            )}
            {rc?.status === 'approved' && !rc.orderId && canDo('edit') && (
              <Button
                variant="primary"
                icon={Package}
                loading={createOrder.isPending}
                onClick={() =>
                  run(async () => {
                    const o = await createOrder.mutateAsync(rc.id);
                    toast({ tone: 'success', title: `Order form ${o.orderNo} issued` });
                    if (canDo('print')) await printOrder(o.id);
                  }, 'Couldn’t issue the order form')
                }
              >
                Issue order form
              </Button>
            )}
            {rc?.orderId && canDo('print') && (
              <Button icon={Printer} onClick={() => run(() => printOrder(rc.orderId!), 'Couldn’t print')}>
                Print order form
              </Button>
            )}
          </>
        }
      />
      <FlowChain inq={{ id: inquiry.id, no: inquiry.inqNo }} rc={rc ? { id: rc.id, no: rc.rcNo } : null} fra={rc?.approvalNo} order={rc?.orderNo ? { no: rc.orderNo } : null} />
      <div className="grid gap-3.5 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <Card
            title="Transporter quotes"
            description={editable ? 'Enter each transporter’s rate for the full load and pick the one to go with. Leave a rate blank if they didn’t quote.' : undefined}
            actions={rc && <RcPill s={rc.status} />}
            flush
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] table-fixed text-sm" aria-label="Transporter quotes">
                <colgroup>
                  <col className="w-12" />
                  <col />
                  <col className="w-[120px]" />
                  <col className="w-[115px]" />
                  <col className="w-[105px]" />
                  <col className="w-[95px]" />
                  {editable && <col className="w-11" />}
                </colgroup>
                <thead className="bg-page text-label font-semibold uppercase tracking-label text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Pick</th>
                    <th className="px-3 py-2 text-left">Transporter</th>
                    <th className="px-3 py-2 text-right">Rate (₹)</th>
                    <th className="px-3 py-2 text-left">Transit</th>
                    <th className="px-3 py-2 text-right">Min. weight</th>
                    <th className="px-3 py-2 text-right">vs lowest</th>
                    {editable && <th />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const p = toPaise(r.rate);
                    const lowest = p > 0 && p === check.lowestPaise;
                    return (
                      <tr key={i} className={`border-t border-divider align-top ${selected === i ? 'bg-primary-tint' : ''}`}>
                        <td className="px-3 py-2">
                          <input type="radio" name="pick" aria-label={`Pick ${name(r.transporterId)}`} checked={selected === i} disabled={!editable || !p} onChange={() => setSelected(i)} className="mt-2.5 accent-primary" />
                        </td>
                        <td className="px-3 py-2">
                          {editable ? (
                            <Combo ariaLabel={`Transporter ${i + 1}`} value={r.transporterId} options={options.filter((o) => o.id === r.transporterId || !rows.some((x) => x.transporterId === o.id))} onChange={(id) => setRow(i, { transporterId: id })} placeholder="Pick a transporter" />
                          ) : (
                            <span className="font-medium">{name(r.transporterId)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {editable ? <Input aria-label={`Rate ${i + 1}`} inputMode="decimal" className="text-right" value={r.rate} onChange={(e) => setRow(i, { rate: e.target.value })} /> : <span className="tabular-nums">{p ? inr(p) : '—'}</span>}
                        </td>
                        <td className="px-3 py-2">
                          {editable ? <Select aria-label={`Transit ${i + 1}`} options={TRANSIT_TIMES.map((t) => ({ value: t, label: t }))} value={r.transit} onChange={(e) => setRow(i, { transit: e.target.value })} /> : r.transit}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {editable ? <Input aria-label={`Minimum weight ${i + 1}`} inputMode="decimal" suffix="MT" value={r.mg} onChange={(e) => setRow(i, { mg: e.target.value })} /> : r.mg ? `${r.mg} MT` : '—'}
                        </td>
                        <td className="px-3 py-2 pt-3.5 text-right tabular-nums">{lowest ? <Pill tone="green">Lowest</Pill> : p && check.lowestPaise ? `+${inr(p - check.lowestPaise)}` : '—'}</td>
                        {editable && (
                          <td className="px-1 py-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={Trash2}
                              aria-label={`Remove row ${i + 1}`}
                              onClick={() => {
                                setRows((rs) => rs.filter((_, j) => j !== i));
                                setSelected((s) => (s === null || s === i ? null : s > i ? s - 1 : s));
                              }}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {editable && (
              <div className="border-t border-divider px-3 py-2">
                <Button size="sm" icon={Plus} onClick={() => setRows((rs) => [...rs, blank()])} disabled={rows.length >= 20}>
                  Add transporter
                </Button>
              </div>
            )}
          </Card>
          <Card title="Decision">
            <div className="flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-base sm:grid-cols-[1fr_2fr_1fr_1fr]">
                {[
                  ['Lowest quote', check.lowestPaise ? inr(check.lowestPaise) : '—'],
                  ['Selected', check.selectedPaise ? `${inr(check.selectedPaise)} · ${name(rows[selected!]?.transporterId ?? null)}` : 'Not picked'],
                  ['Budget', inquiry.budgetPaise ? inr(inquiry.budgetPaise) : 'Not set'],
                  ['Saving vs highest', check.selectedPaise && highest ? inr(highest - check.selectedPaise) : '—'],
                ].map(([k, val]) => (
                  <div key={k} className="flex min-w-0 flex-col gap-0.5">
                    <dt className="text-label font-semibold uppercase tracking-label text-faint">{k}</dt>
                    <dd className="text-ink">{val}</dd>
                  </div>
                ))}
              </dl>
              {check.needsJustification && (
                <p className="rounded-md bg-amber-light px-3 py-2 text-sm text-amber" role="status">
                  {check.exceedsBudget ? 'The selected rate is over the budget.' : 'The selected rate is not the lowest.'} Give a reason; the approval is recorded as an exception.
                </p>
              )}
              {(editable || justification) && (
                <Textarea label="Justification" rows={2} value={justification} onChange={(e) => setJustification(e.target.value)} disabled={!editable} hint={editable ? 'Why this transporter (availability, reliability, transit time…).' : undefined} />
              )}
            </div>
          </Card>
          {rc && rc.trail.length > 0 && (
            <Card title="Approval trail">
              <ol className="flex flex-col gap-2" aria-label="Approval trail">
                {rc.trail.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium">{TRAIL[s.action] ?? s.action}</span>
                    <span className="text-muted">
                      by {s.byName ?? 'System'} · {stamp(s.at)}
                    </span>
                    {s.note && <span className="w-full text-muted">“{s.note}”</span>}
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-3.5">
          <Card title="Shipment" actions={<InquiryPill s={inquiry.status} />}>
            <DetailList
              items={[
                { label: 'From', value: placeText(inquiry.from), wide: true },
                { label: 'To', value: placeText(inquiry.to), wide: true },
                { label: 'Loading date', value: d(inquiry.pickupDate) },
                { label: 'Weight', value: weight(inquiry.weightMt) },
                { label: 'Delivery', value: inquiry.deliveryType },
                { label: 'Freight paid by', value: inquiry.freightPaidBy },
                { label: 'Remarks', value: inquiry.remarks, wide: true },
              ]}
            />
          </Card>
          <Card title="Past rates on this route" description={`${routeOf(inquiry.from, inquiry.to)} · ${inquiry.vehicle}`}>
            {past.length ? (
              <ul className="flex flex-col divide-y divide-divider" aria-label="Past rates">
                {past.map((q) => (
                  <li key={q.transporterId} className="flex justify-between gap-2 py-1.5 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{q.transporterName}</span>
                      <span className="text-caption text-faint">
                        {q.rcNo} · {d(q.date)} · {q.transit}
                      </span>
                    </span>
                    <span className="tabular-nums">{inr(q.ratePaise)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No earlier quotes for this route and vehicle.</p>
            )}
          </Card>
        </div>
      </div>
      {rc && <DecisionDialog rc={rc} decision={decision} onClose={() => setDecision(null)} />}
    </div>
  );
}

/** Opens the workspace for `?open=<comparison>` or `?inquiry=<inquiry>` (a comparison not yet saved). */
function WorkspaceRoute({ rcId, inquiryId, onBack }: { rcId: string | null; inquiryId: string | null; onBack: () => void }) {
  const rc = useRc(rcId);
  const inquiry = useInquiry(rc.data?.inquiryId ?? inquiryId);
  const navigate = useNavigate();
  // An inquiry that already has a comparison opens it.
  useEffect(() => {
    if (!rcId && inquiry.data?.rcId) navigate(`/transport/rates?open=${inquiry.data.rcId}`, { replace: true });
  }, [rcId, inquiry.data?.rcId]);
  if (rc.error || inquiry.error) return <EmptyState icon={FileText} title="Not found" description={errorMessage(rc.error ?? inquiry.error)} action={<Button onClick={onBack}>Back</Button>} />;
  if (!inquiry.data || (rcId && !rc.data)) return <Skeleton className="m-6 h-96" />;
  return <Workspace inquiry={inquiry.data} rc={rc.data ?? null} onBack={onBack} />;
}

function RcList({ title, description, tabs }: { title: string; description: string; tabs?: boolean }) {
  const navigate = useNavigate();
  const url = useUrlState(['status'] as const);
  const [search, setSearch] = useSearchParam(url);
  const status = (url.values.status || (tabs ? 'pending' : '')) as RcStatus | '';
  const list = useRcs({ q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE, filters: { status: status || undefined } });
  const columns: Column<RateComparisonView>[] = [
    {
      id: 'no',
      header: 'Comparison',
      width: '140px',
      cell: (r) => (
        <span className="flex flex-col leading-tight">
          <span className="font-mono text-sm font-semibold">{r.rcNo}</span>
          <span className="text-caption text-faint">
            {r.inqNo}
            {r.approvalNo ? ` · ${r.approvalNo}` : ''}
          </span>
        </span>
      ),
    },
    {
      id: 'route',
      header: 'Route',
      cell: (r) => (
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{routeOf(r.inquiry.from, r.inquiry.to)}</span>
          <span className="text-caption text-faint">
            {r.inquiry.material} · {r.inquiry.vehicle}
          </span>
        </span>
      ),
    },
    { id: 'quotes', header: 'Quotes', width: '80px', align: 'right', className: 'tabular-nums', cell: (r) => r.quotes.filter((q) => q.ratePaise > 0).length },
    { id: 'low', header: 'Lowest', width: '120px', align: 'right', className: 'tabular-nums', cell: (r) => inr(r.lowestPaise) },
    {
      id: 'sel',
      header: 'Selected',
      width: '210px',
      cell: (r) =>
        r.selected === null ? (
          <span className="text-faint">—</span>
        ) : (
          <span className="flex flex-col leading-tight">
            <span className="tabular-nums">{inr(r.selectedPaise)}</span>
            <span className="text-caption text-faint">{r.quotes[r.selected]?.transporterName}</span>
          </span>
        ),
    },
    { id: 'flag', header: 'Check', width: '120px', cell: (r) => (r.needsJustification ? <Pill tone="amber">{r.exceedsBudget ? 'Over budget' : 'Not lowest'}</Pill> : r.selected !== null ? <Pill tone="green">Lowest</Pill> : null) },
    { id: 'status', header: 'Status', width: '140px', cell: (r) => <RcPill s={r.status} /> },
    { id: 'order', header: 'Order', width: '110px', className: 'font-mono text-caption', cell: (r) => r.orderNo ?? '—' },
  ];
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title={title} description={description} />
      {tabs && <Tabs<RcStatus> aria-label="Approval status" items={(['pending', 'approved', 'rejected'] as const).map((s) => ({ value: s, label: RC_STATUS_LABEL[s] }))} value={status as RcStatus} onChange={(s) => url.set({ status: s })} />}
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search" icon={Search} placeholder="RC or FRA number" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[240px]" />
        {!tabs && <Select aria-label="Status" placeholder="All statuses" options={RC_STATUSES.map((s) => ({ value: s, label: RC_STATUS_LABEL[s] }))} value={status} onChange={(e) => url.set({ status: e.target.value })} containerClassName="w-[180px]" />}
      </div>
      <DataTable
        label={title}
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(r) => r.id}
        minWidth={1100}
        loading={list.isLoading}
        onRowClick={(r) => navigate(`/transport/rates?open=${r.id}`)}
        empty={<EmptyState icon={FileText} title={tabs && status === 'pending' ? 'Nothing waiting for approval' : 'No rate comparisons'} description="Rate comparisons start from a freight inquiry." />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
    </div>
  );
}

/** Rate comparisons (legacy Rate Comparison). `?open=` / `?inquiry=` opens one. */
export function RatesPage() {
  const url = useUrlState(['inquiry'] as const);
  const navigate = useNavigate();
  if (url.open || url.values.inquiry) return <WorkspaceRoute key={url.open ?? url.values.inquiry} rcId={url.open} inquiryId={url.values.inquiry || null} onBack={() => navigate('/transport/rates')} />;
  return <RcList title="Rate comparison" description="Quotes per inquiry, the lowest marked. Submitting sends the pick for freight approval." />;
}

/** Freight approvals (legacy Freight Approval): comparisons waiting for a decision, and past decisions. */
export function ApprovalsPage() {
  return <RcList title="Freight approvals" description="Approve the chosen transporter and rate. A pick that isn’t the lowest or is over budget comes with a reason and is approved as an exception." tabs />;
}
