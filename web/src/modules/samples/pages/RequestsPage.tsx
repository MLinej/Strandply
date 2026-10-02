import { CheckCircle2, ClipboardList, Download, Eye, MoreHorizontal, Pencil, Plus, Printer, Search, Trash2, Truck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { REQUEST_STATUSES, type RequestStatus, type RequestView } from '@contracts/sampletrack';
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
  Popover,
  Select,
  StatusPill,
  Tabs,
  useToast,
  type Column,
} from '@/components/ui';
import { formatDate } from '@/lib/format';
import { exportRequests, useApproveRequest, useDeleteRequest, useParties, useRequest, useRequests } from '../api';
import { RequestForm } from '../components/RequestForm';
import { printRequestSlip } from '../print/documents';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { errorMessage } from '../ui/errors';
import { useSearchParam, useUrlState } from '../ui/list-state';
import { sortMapping } from '../ui/table-sort';

const PAGE_SIZE = 10;
type Tab = 'All' | RequestStatus;
const TABS: Tab[] = ['All', ...REQUEST_STATUSES];

const SORT = sortMapping({ reqNo: 'reqNo', date: 'date', party: 'partyName', required: 'requiredDispatchDate', status: 'status' });

function Products({ r }: { r: RequestView }) {
  return (
    <span className="flex flex-wrap gap-1">
      {r.items.map((i) => (
        <span key={i.id} className="rounded-sm border border-border bg-page px-1.5 text-caption text-ink">
          {i.productName}
          {i.qtyRaw ? <span className="text-muted"> · {i.qtyRaw}</span> : null}
        </span>
      ))}
    </span>
  );
}

/** Sample requests (legacy renderReqTable / openReqModal / approveReq / delReq / reqToDispatch / exportReqs / previewRequestSlip). */
export function RequestsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can, canDo } = useSession();
  const url = useUrlState(['status', 'partyId'] as const);
  const tab = (url.values.status || 'All') as Tab;
  const [search, setSearch] = useSearchParam(url);

  const query = {
    q: url.q || undefined,
    sort: url.sort || undefined,
    page: url.page,
    pageSize: PAGE_SIZE,
    filters: { status: tab === 'All' ? undefined : tab, partyId: url.values.partyId || undefined },
  };
  const list = useRequests(query);
  const parties = useParties({ pageSize: 100, sort: 'name' }, { enabled: can('samples.parties') });

  const [formFor, setFormFor] = useState<RequestView | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<RequestView | null>(null);
  const opened = useRequest(url.open ?? undefined);
  const approve = useApproveRequest();
  const remove = useDeleteRequest();

  const canEdit = canDo('edit');
  const canDispatch = can('samples.dispatch') && canEdit;

  async function onApprove(r: RequestView) {
    try {
      await approve.mutateAsync(r.id);
      toast({ tone: 'success', title: `${r.reqNo} approved` });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t approve', description: errorMessage(err) });
    }
  }

  async function onDelete() {
    if (!toDelete) return;
    try {
      await remove.mutateAsync(toDelete.id);
      toast({ tone: 'success', title: `${toDelete.reqNo} deleted` });
      setToDelete(null);
      if (url.open === toDelete.id) url.set({ open: null });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t delete', description: errorMessage(err) });
      setToDelete(null);
    }
  }

  async function onPrint(r: RequestView) {
    try {
      await printRequestSlip(r.id);
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t print the slip', description: errorMessage(err) });
    }
  }

  async function onExport() {
    try {
      await exportRequests({ q: query.q, sort: query.sort, filters: query.filters });
    } catch (err) {
      toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) });
    }
  }

  function actionsFor(r: RequestView, close: () => void) {
    const run = (fn: () => void) => () => {
      close();
      fn();
    };
    return (
      <>
        <MenuItem icon={Eye} onClick={run(() => url.set({ open: r.id, page: url.page }))}>
          View
        </MenuItem>
        {canEdit && (
          <MenuItem icon={Pencil} onClick={run(() => setFormFor(r))}>
            Edit
          </MenuItem>
        )}
        {canDo('approve') && r.status === 'Pending' && (
          <MenuItem icon={CheckCircle2} onClick={run(() => void onApprove(r))}>
            Approve
          </MenuItem>
        )}
        {canDispatch && r.status !== 'Delivered' && (
          <MenuItem icon={Truck} onClick={run(() => navigate(`/samples/dispatch?fromRequest=${r.id}`))}>
            Create dispatch
          </MenuItem>
        )}
        {canDo('print') && (
          <MenuItem icon={Printer} onClick={run(() => void onPrint(r))}>
            Print slip (A4)
          </MenuItem>
        )}
        {canDo('delete') && (
          <>
            <MenuSeparator />
            <MenuItem icon={Trash2} className="text-primary" onClick={run(() => setToDelete(r))}>
              Delete
            </MenuItem>
          </>
        )}
      </>
    );
  }

  const columns: Column<RequestView>[] = [
    { id: 'reqNo', header: 'Request', width: '108px', sortValue: (r) => r.reqNo, className: 'font-semibold', cell: (r) => r.reqNo },
    { id: 'date', header: 'Date', width: '104px', sortValue: (r) => r.date, className: 'text-muted', cell: (r) => formatDate(r.date) },
    { id: 'party', header: 'Party', width: '200px', sortValue: (r) => r.partyName, cell: (r) => r.partyName },
    { id: 'products', header: 'Products', cell: (r) => <Products r={r} /> },
    { id: 'priority', header: 'Priority', width: '88px', cell: (r) => <StatusPill status={r.priority} /> },
    { id: 'required', header: 'Required by', width: '108px', sortValue: (r) => r.requiredDispatchDate, className: 'text-muted', cell: (r) => (r.requiredDispatchDate ? formatDate(r.requiredDispatchDate) : '—') },
    { id: 'status', header: 'Status', width: '104px', sortValue: (r) => r.status, cell: (r) => <StatusPill status={r.status} /> },
    { id: 'by', header: 'Requested by', width: '140px', className: 'text-muted', cell: (r) => r.requestedByName ?? '—' },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '48px',
      align: 'right',
      cell: (r) => (
        <Popover
          aria-label={`Actions for ${r.reqNo}`}
          widthClass="w-56"
          trigger={(props) => (
            <button {...props} type="button" aria-label={`Actions for ${r.reqNo}`} onClick={(e) => { e.stopPropagation(); props.onClick(); }} className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-page hover:text-ink">
              <MoreHorizontal size={16} strokeWidth={1.8} aria-hidden />
            </button>
          )}
        >
          {(close) => actionsFor(r, close)}
        </Popover>
      ),
    },
  ];

  const counts = list.data?.counts;
  const detail = opened.data;

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1 font-bold tracking-tight">Sample requests</h1>
          <p className="text-base text-muted">Marketing raises them, a manager approves, dispatch sends them out.</p>
        </div>
        <div className="flex gap-2">
          {canDo('export') && (
            <Button icon={Download} onClick={onExport}>
              Export Excel
            </Button>
          )}
          {canEdit && (
            <Button variant="primary" icon={Plus} onClick={() => setFormFor('new')}>
              New request
            </Button>
          )}
        </div>
      </div>

      <Tabs
        aria-label="Request status"
        value={tab}
        onChange={(t) => url.set({ status: t === 'All' ? null : t })}
        items={TABS.map((t) => ({ value: t, label: t, count: counts ? (t === 'All' ? counts.all : counts[t]) : undefined }))}
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          aria-label="Search requests"
          icon={Search}
          placeholder="Request no., party, product or requester"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          containerClassName="w-[320px]"
        />
        {can('samples.parties') && (
        <Select
          aria-label="Party"
          placeholder="All parties"
          options={(parties.data?.rows ?? []).map((p) => ({ value: p.id, label: p.name }))}
          value={url.values.partyId}
          onChange={(e) => url.set({ partyId: e.target.value })}
          containerClassName="w-[240px]"
        />
        )}
      </div>

      <DataTable
        label="Sample requests"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(r) => r.id}
        minWidth={1180}
        loading={list.isLoading}
        sort={SORT.fromApi(url.sort)}
        onSortChange={(s) => url.set({ sort: SORT.toApi(s) ?? null })}
        manualSort
        onRowClick={(r) => url.set({ open: r.id, page: url.page })}
        empty={
          <EmptyState
            icon={ClipboardList}
            title={url.q || url.values.partyId || tab !== 'All' ? 'No requests match these filters' : 'No sample requests yet'}
            description={url.q || url.values.partyId || tab !== 'All' ? 'Try another tab, or clear the search and party filter.' : canEdit ? 'Raise the first one with “New request”.' : undefined}
            action={
              (url.q || url.values.partyId || tab !== 'All') && (
                <Button
                  onClick={() => {
                    setSearch('');
                    url.set({ q: null, partyId: null, status: null });
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

      <RequestForm
        open={formFor !== null}
        request={formFor === 'new' ? null : formFor}
        onClose={() => setFormFor(null)}
        onSaved={(r) => {
          setFormFor(null);
          url.set({ open: r.id, page: url.page });
        }}
      />

      <Modal
        open={!!url.open}
        onClose={() => url.set({ open: null, page: url.page })}
        size="lg"
        title={detail ? `${detail.reqNo} · ${detail.partyName}` : 'Sample request'}
        description={detail ? `${formatDate(detail.date)} · requested by ${detail.requestedByName ?? '—'}` : undefined}
        footer={
          detail && (
            <>
              {canDo('print') && (
                <Button icon={Printer} onClick={() => onPrint(detail)}>
                  Print slip
                </Button>
              )}
              {canEdit && (
                <Button icon={Pencil} onClick={() => setFormFor(detail)}>
                  Edit
                </Button>
              )}
              {canDispatch && detail.status !== 'Delivered' && (
                <Button icon={Truck} onClick={() => navigate(`/samples/dispatch?fromRequest=${detail.id}`)}>
                  Create dispatch
                </Button>
              )}
              {canDo('approve') && detail.status === 'Pending' && (
                <Button variant="primary" icon={CheckCircle2} loading={approve.isPending} onClick={() => onApprove(detail)}>
                  Approve
                </Button>
              )}
            </>
          )
        }
      >
        {opened.isError ? (
          <p className="text-base text-muted">{errorMessage(opened.error, 'This request could not be loaded.')}</p>
        ) : !detail ? (
          <p className="text-base text-muted">Loading…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-base sm:grid-cols-3">
              {[
                ['Status', <StatusPill key="s" status={detail.status} />],
                ['Priority', <StatusPill key="p" status={detail.priority} />],
                ['Required by', detail.requiredDispatchDate ? formatDate(detail.requiredDispatchDate) : '—'],
                ['Purpose', detail.purpose ?? '—'],
                ['Approved by', detail.approvedByName ?? (detail.approvedAt ? '—' : detail.status === 'Pending' ? 'Not yet' : 'Not recorded')],
                ['Remarks', detail.remarks ?? '—'],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex flex-col gap-0.5">
                  <dt className="text-label font-semibold uppercase tracking-label text-faint">{k}</dt>
                  <dd className="text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <table className="w-full text-base">
              <thead>
                <tr className="h-row-head border-y border-divider bg-page text-left text-label font-semibold uppercase tracking-label text-muted">
                  <th className="px-3 font-semibold">#</th>
                  <th className="px-3 font-semibold">Product</th>
                  <th className="px-3 font-semibold">Board</th>
                  <th className="px-3 font-semibold">Thickness</th>
                  <th className="px-3 font-semibold">Size</th>
                  <th className="px-3 text-right font-semibold">Qty</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((i) => (
                  <tr key={i.id} className="h-row border-b border-divider">
                    <td className="px-3 text-faint">{i.lineNo}</td>
                    <td className="px-3 font-medium">
                      {i.productName}
                      {!i.productId && <span className="ml-1.5 text-caption text-faint">(free text)</span>}
                    </td>
                    <td className="px-3 text-muted">{i.board ?? '—'}</td>
                    <td className="px-3 text-muted">{i.thickness ?? '—'}</td>
                    <td className="px-3 text-muted">{i.size ?? '—'}</td>
                    <td className="px-3 text-right font-semibold">{i.qtyRaw ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canDo('delete') && (
              <div>
                <Button size="sm" variant="danger-outline" icon={Trash2} onClick={() => setToDelete(detail)}>
                  Delete request
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.reqNo ?? ''}?`}
        confirmLabel="Delete"
        danger
        busy={remove.isPending}
        onConfirm={onDelete}
        onClose={() => setToDelete(null)}
      >
        A request with a linked dispatch can’t be deleted. Its number won’t be reused.
      </ConfirmDialog>
    </div>
  );
}
