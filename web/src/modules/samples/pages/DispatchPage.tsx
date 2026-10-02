import { clsx } from 'clsx';
import {
  Download,
  ExternalLink,
  Eye,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  Truck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { DISPATCH_MODES, DISPATCH_STATUSES, type DispatchDraft, type DispatchView } from '@contracts/sampletrack';
import { useSession } from '@/app/session';
import {
  Button,
  DataTable,
  EmptyState,
  Input,
  MenuItem,
  MenuSeparator,
  Modal,
  Pagination,
  Pill,
  Popover,
  Select,
  StatusPill,
  useToast,
  type Column,
} from '@/components/ui';
import { formatAmount, formatDate } from '@/lib/format';
import { exportDispatches, fetchDispatchDraft, shareDispatchOnWhatsApp, useDeleteDispatch, useDispatch, useDispatches, useTrackingDetail } from '../api';
import { DispatchForm } from '../components/DispatchForm';
import { QrDialog, StatusUpdateDialog } from '../components/DispatchDialogs';
import { StatusTimeline } from '../components/StatusTimeline';
import { printCourierLabel } from '../print/documents';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { errorMessage } from '../ui/errors';
import { useSearchParam, useUrlState } from '../ui/list-state';
import { sortMapping } from '../ui/table-sort';

const PAGE_SIZE = 10;
const SORT = sortMapping({ dspNo: 'dspNo', date: 'date', party: 'partyName', expected: 'expectedDeliveryDate', status: 'status' });

function TrackingCell({ d }: { d: DispatchView }) {
  if (!d.trackingNo) return <span className="text-faint">—</span>;
  if (d.tracking?.kind === 'url') {
    return (
      <a
        href={d.tracking.url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 font-mono text-sm text-ink hover:underline"
        title="Open the courier’s tracking page"
      >
        {d.trackingNo}
        <ExternalLink size={12} strokeWidth={1.8} aria-hidden />
      </a>
    );
  }
  return <span className="font-mono text-sm" title={d.tracking?.kind === 'text' ? d.tracking.text : undefined}>{d.trackingNo}</span>;
}

/** Sample dispatch (legacy renderDispTable / saveDispatch / delDisp / exportDisp / printCourierLabel / showQR / shareWhatsApp). */
export function DispatchPage() {
  const toast = useToast();
  const { can, canDo } = useSession();
  const url = useUrlState(['status', 'mode', 'overdue', 'fromRequest'] as const);
  const [search, setSearch] = useSearchParam(url);
  const overdueOnly = url.values.overdue === 'true';

  const query = {
    q: url.q || undefined,
    sort: url.sort || undefined,
    page: url.page,
    pageSize: PAGE_SIZE,
    filters: {
      status: (url.values.status || undefined) as DispatchView['status'] | undefined,
      mode: (url.values.mode || undefined) as DispatchView['mode'] | undefined,
      overdue: overdueOnly || undefined,
    },
  };
  const list = useDispatches(query);

  const [form, setForm] = useState<{ dispatch: DispatchView | null; draft: DispatchDraft | null } | null>(null);
  const [statusFor, setStatusFor] = useState<DispatchView | null>(null);
  const [qrFor, setQrFor] = useState<DispatchView | null>(null);
  const [toDelete, setToDelete] = useState<DispatchView | null>(null);
  const remove = useDeleteDispatch();

  const opened = useDispatch(url.open ?? undefined);
  const canTrack = can('samples.tracking');
  const tracking = useTrackingDetail(url.open && canTrack ? url.open : undefined);
  const canEdit = canDo('edit');
  const canPrint = canDo('print');

  // "Create dispatch from request": open the form prefilled, then drop the parameter.
  const fromRequest = url.values.fromRequest;
  useEffect(() => {
    if (!fromRequest || !canEdit) return;
    let live = true;
    fetchDispatchDraft(fromRequest)
      .then((draft) => live && setForm({ dispatch: null, draft }))
      .catch((err) => toast({ tone: 'error', title: 'Couldn’t load that request', description: errorMessage(err) }))
      .finally(() => live && url.set({ fromRequest: null }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromRequest, canEdit]);

  async function guard(title: string, fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (err) {
      toast({ tone: 'error', title, description: errorMessage(err) });
    }
  }

  async function onDelete() {
    if (!toDelete) return;
    try {
      await remove.mutateAsync(toDelete.id);
      toast({ tone: 'success', title: `${toDelete.dspNo} deleted` });
      if (url.open === toDelete.id) url.set({ open: null });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t delete', description: errorMessage(err) });
    }
    setToDelete(null);
  }

  const view = (d: DispatchView) => url.set({ open: d.id, page: url.page });

  function menu(d: DispatchView, close: () => void) {
    const run = (fn: () => void) => () => {
      close();
      fn();
    };
    return (
      <>
        <MenuItem icon={Eye} onClick={run(() => view(d))}>
          View & track
        </MenuItem>
        {canEdit && (
          <>
            <MenuItem icon={RefreshCw} onClick={run(() => setStatusFor(d))}>
              Update status
            </MenuItem>
            <MenuItem icon={Pencil} onClick={run(() => setForm({ dispatch: d, draft: null }))}>
              Edit
            </MenuItem>
          </>
        )}
        {canPrint && (
          <>
            <MenuSeparator />
            <MenuItem icon={Printer} onClick={run(() => void guard('Couldn’t print the label', () => printCourierLabel(d.id)))}>
              Print label (A5)
            </MenuItem>
            <MenuItem icon={QrCode} onClick={run(() => setQrFor(d))}>
              QR code
            </MenuItem>
            <MenuItem icon={MessageCircle} onClick={run(() => void guard('Couldn’t prepare the message', () => shareDispatchOnWhatsApp(d.id)))}>
              Share on WhatsApp
            </MenuItem>
          </>
        )}
        {canDo('delete') && (
          <>
            <MenuSeparator />
            <MenuItem icon={Trash2} className="text-primary" onClick={run(() => setToDelete(d))}>
              Delete
            </MenuItem>
          </>
        )}
      </>
    );
  }

  const columns: Column<DispatchView>[] = [
    { id: 'dspNo', header: 'Dispatch', width: '104px', sortValue: (d) => d.dspNo, className: 'font-semibold', cell: (d) => d.dspNo },
    { id: 'date', header: 'Date', width: '100px', sortValue: (d) => d.date, className: 'text-muted', cell: (d) => formatDate(d.date) },
    {
      id: 'party',
      header: 'Party',
      sortValue: (d) => d.partyName,
      cell: (d) => (
        <span className="flex flex-col leading-tight">
          <span>{d.partyName}</span>
          {d.partyCity && <span className="text-caption text-faint">{d.partyCity}</span>}
        </span>
      ),
    },
    {
      id: 'courier',
      header: 'Courier',
      width: '170px',
      cell: (d) => (
        <span className="flex flex-col leading-tight">
          <span>{d.courierName ?? '—'}</span>
          <span className="text-caption text-faint">{d.mode}</span>
        </span>
      ),
    },
    { id: 'tracking', header: 'Tracking', width: '150px', cell: (d) => <TrackingCell d={d} /> },
    {
      id: 'expected',
      header: 'Expected',
      width: '128px',
      sortValue: (d) => d.expectedDeliveryDate,
      cell: (d) =>
        d.expectedDeliveryDate ? (
          <span className={clsx('flex items-center gap-1.5', d.overdue ? 'font-semibold text-primary' : 'text-muted')}>
            {formatDate(d.expectedDeliveryDate)}
            {d.overdue && <span className="sr-only"> (overdue)</span>}
          </span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    { id: 'weight', header: 'Weight', width: '76px', align: 'right', className: 'text-muted', cell: (d) => (d.weightKg ? `${d.weightKg} kg` : '—') },
    { id: 'freight', header: 'Freight', width: '96px', align: 'right', cell: (d) => (d.freightPaise ? formatAmount(d.freightPaise / 100, { symbol: true, decimals: 0 }) : '—') },
    {
      id: 'status',
      header: 'Status',
      width: '120px',
      sortValue: (d) => d.status,
      cell: (d) => (
        <span className="flex flex-wrap gap-1">
          <StatusPill status={d.status} />
          {d.overdue && <Pill tone="red">Overdue</Pill>}
        </span>
      ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (d) => (
        <Popover
          aria-label={`Actions for ${d.dspNo}`}
          widthClass="w-56"
          trigger={(props) => (
            <button
              {...props}
              type="button"
              aria-label={`Actions for ${d.dspNo}`}
              onClick={(e) => {
                e.stopPropagation();
                props.onClick();
              }}
              className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-page hover:text-ink"
            >
              <MoreHorizontal size={16} strokeWidth={1.8} aria-hidden />
            </button>
          )}
        >
          {(close) => menu(d, close)}
        </Popover>
      ),
    },
  ];

  const filtered = !!(url.q || url.values.status || url.values.mode || overdueOnly);
  const d = opened.data;

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1 font-bold tracking-tight">Sample dispatch</h1>
          <p className="text-base text-muted">Every sample sent out, its courier and tracking, and where it is now.</p>
        </div>
        <div className="flex gap-2">
          {canDo('export') && (
            <Button icon={Download} onClick={() => guard('Export failed', () => exportDispatches({ q: query.q, sort: query.sort, filters: query.filters }))}>
              Export register
            </Button>
          )}
          {canEdit && (
            <Button variant="primary" icon={Plus} onClick={() => setForm({ dispatch: null, draft: null })}>
              New dispatch
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          aria-label="Search dispatches"
          icon={Search}
          placeholder="Dispatch no., tracking no. or party"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          containerClassName="w-[300px]"
        />
        <Select
          aria-label="Status"
          placeholder="All statuses"
          options={DISPATCH_STATUSES.map((s) => ({ value: s, label: s }))}
          value={url.values.status}
          onChange={(e) => url.set({ status: e.target.value })}
          containerClassName="w-[170px]"
        />
        <Select
          aria-label="Mode"
          placeholder="All modes"
          options={DISPATCH_MODES.map((m) => ({ value: m, label: m }))}
          value={url.values.mode}
          onChange={(e) => url.set({ mode: e.target.value })}
          containerClassName="w-[170px]"
        />
        <button
          type="button"
          aria-pressed={overdueOnly}
          onClick={() => url.set({ overdue: overdueOnly ? null : 'true' })}
          className={clsx(
            'h-ctl rounded border px-3 text-base font-medium transition-colors',
            overdueOnly ? 'border-primary-border bg-primary-tint text-primary' : 'border-border bg-card text-muted hover:text-ink',
          )}
        >
          Overdue only
        </button>
      </div>

      <DataTable
        label="Dispatches"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(r) => r.id}
        minWidth={1180}
        loading={list.isLoading}
        sort={SORT.fromApi(url.sort)}
        onSortChange={(s) => url.set({ sort: SORT.toApi(s) ?? null })}
        manualSort
        onRowClick={view}
        empty={
          <EmptyState
            icon={Truck}
            title={filtered ? 'No dispatches match these filters' : 'Nothing dispatched yet'}
            description={filtered ? 'Change the status or mode, or clear the search.' : canEdit ? 'Send the first sample with “New dispatch”.' : undefined}
            action={
              filtered && (
                <Button
                  onClick={() => {
                    setSearch('');
                    url.set({ q: null, status: null, mode: null, overdue: null });
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        }
        footer={(list.data?.total ?? 0) > 0 && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(p) => url.set({ page: p })} />}
      />

      <Modal
        open={!!url.open}
        onClose={() => url.set({ open: null, page: url.page })}
        size="lg"
        title={d ? `${d.dspNo} · ${d.partyName}` : 'Dispatch'}
        description={d ? `${formatDate(d.date)} · ${d.mode}${d.courierName ? ` · ${d.courierName}` : ''}` : undefined}
        footer={
          d && (
            <>
              {canPrint && (
                <>
                  <Button icon={Printer} onClick={() => guard('Couldn’t print the label', () => printCourierLabel(d.id))}>
                    Label
                  </Button>
                  <Button icon={QrCode} onClick={() => setQrFor(d)}>
                    QR
                  </Button>
                  <Button icon={MessageCircle} onClick={() => guard('Couldn’t prepare the message', () => shareDispatchOnWhatsApp(d.id))}>
                    WhatsApp
                  </Button>
                </>
              )}
              {canEdit && (
                <>
                  <Button icon={Pencil} onClick={() => setForm({ dispatch: d, draft: null })}>
                    Edit
                  </Button>
                  <Button variant="primary" icon={RefreshCw} onClick={() => setStatusFor(d)}>
                    Update status
                  </Button>
                </>
              )}
            </>
          )
        }
      >
        {opened.isError ? (
          <p className="text-base text-muted">{errorMessage(opened.error, 'This dispatch could not be loaded.')}</p>
        ) : !d ? (
          <p className="text-base text-muted">Loading…</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_240px]">
            <dl className="grid grid-cols-2 content-start gap-x-6 gap-y-2.5 text-base">
              {(
                [
                  ['Status', <span key="s" className="flex gap-1"><StatusPill status={d.status} />{d.overdue && <Pill tone="red">Overdue</Pill>}</span>],
                  ['Expected delivery', d.expectedDeliveryDate ? formatDate(d.expectedDeliveryDate) : '—'],
                  ['Tracking', <TrackingCell key="t" d={d} />],
                  ['Vehicle', d.vehicleNo ?? '—'],
                  ['Driver', d.driverDetails ?? '—'],
                  ['Weight', d.weightKg ? `${d.weightKg} kg` : '—'],
                  ['Freight', d.freightPaise ? formatAmount(d.freightPaise / 100, { symbol: true }) : '—'],
                  ['Dimensions', d.dimensions ?? '—'],
                  [
                    'Linked request',
                    d.linkedRequestNo ? (
                      can('samples.requests') ? (
                        <Link key="r" className="font-semibold hover:underline" to={`/samples/requests?open=${d.linkedRequestId}`}>
                          {d.linkedRequestNo}
                        </Link>
                      ) : (
                        d.linkedRequestNo
                      )
                    ) : (
                      '—'
                    ),
                  ],
                  ['City', [d.partyCity, d.partyState].filter(Boolean).join(', ') || '—'],
                ] as [string, React.ReactNode][]
              ).map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5">
                  <dt className="text-label font-semibold uppercase tracking-label text-faint">{k}</dt>
                  <dd className="text-ink">{v}</dd>
                </div>
              ))}
              <div className="col-span-2 flex flex-col gap-0.5">
                <dt className="text-label font-semibold uppercase tracking-label text-faint">Contents</dt>
                <dd>{d.productDescription ?? '—'}</dd>
              </div>
              {d.remarks && (
                <div className="col-span-2 flex flex-col gap-0.5">
                  <dt className="text-label font-semibold uppercase tracking-label text-faint">Remarks</dt>
                  <dd>{d.remarks}</dd>
                </div>
              )}
              {canDo('delete') && (
                <div className="col-span-2 pt-1">
                  <Button size="sm" variant="danger-outline" icon={Trash2} onClick={() => setToDelete(d)}>
                    Delete dispatch
                  </Button>
                </div>
              )}
            </dl>
            {canTrack && (
              <section aria-label="Status timeline" className="rounded border border-divider p-3.5">
                <h3 className="mb-3 text-sm font-semibold">Status timeline</h3>
                {tracking.data ? <StatusTimeline timeline={tracking.data.timeline} offPath={tracking.data.offPath} /> : <p className="text-base text-muted">Loading…</p>}
              </section>
            )}
          </div>
        )}
      </Modal>

      <DispatchForm
        open={form !== null}
        dispatch={form?.dispatch ?? null}
        draft={form?.draft ?? null}
        onClose={() => setForm(null)}
        onSaved={(saved) => {
          setForm(null);
          url.set({ open: saved.id, page: url.page });
        }}
      />
      <StatusUpdateDialog dispatch={statusFor} onClose={() => setStatusFor(null)} />
      <QrDialog dispatch={qrFor} onClose={() => setQrFor(null)} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.dspNo ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={onDelete}
        onClose={() => setToDelete(null)}
      >
        The dispatch and its history are kept for the audit trail but hidden. A linked request keeps its current status.
      </ConfirmDialog>
    </div>
  );
}
