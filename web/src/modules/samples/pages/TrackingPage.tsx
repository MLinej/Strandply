import { clsx } from 'clsx';
import { ExternalLink, MapPinned, MessageCircle, Printer, QrCode, RefreshCw, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { DispatchView } from '@contracts/sampletrack';
import { useSession } from '@/app/session';
import { Button, Card, EmptyState, Input, Pagination, Pill, Skeleton, StatusPill, useToast } from '@/components/ui';
import { formatAmount, formatDate } from '@/lib/format';
import { shareDispatchOnWhatsApp, useShipments, useTrackingDetail } from '../api';
import { QrDialog, StatusUpdateDialog } from '../components/DispatchDialogs';
import { StatusTimeline } from '../components/StatusTimeline';
import { printCourierLabel } from '../print/documents';
import { DetailList } from '../ui/DetailList';
import { errorMessage } from '../ui/errors';
import { useSearchParam, useUrlState } from '../ui/list-state';
import { PageHeader } from '../ui/PageHeader';

const PAGE_SIZE = 12;

/** Live tracking (legacy renderTrackList / viewTrackDetail / updateDispStatus): every shipment, newest first, with its timeline. */
export function TrackingPage() {
  const toast = useToast();
  const { can, canDo } = useSession();
  const url = useUrlState([] as const);
  const [search, setSearch] = useSearchParam(url);
  const list = useShipments({ q: url.q || undefined, page: url.page, pageSize: PAGE_SIZE });
  const rows = list.data?.rows ?? [];
  const selectedId = url.open ?? rows[0]?.id;
  const detail = useTrackingDetail(selectedId);
  const [statusFor, setStatusFor] = useState<DispatchView | null>(null);
  const [qrFor, setQrFor] = useState<DispatchView | null>(null);
  const canUpdate = can('samples.dispatch') && canDo('edit');

  async function guard(title: string, fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (err) {
      toast({ tone: 'error', title, description: errorMessage(err) });
    }
  }

  const d = detail.data?.dispatch;

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Live tracking" description="Where every sample shipment is, from packing to delivery." />
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card flush className="flex flex-col">
          <div className="border-b border-divider p-3">
            <Input aria-label="Search shipments" icon={Search} placeholder="Dispatch no., party or tracking no." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {list.isLoading ? (
            <div className="flex flex-col gap-3 p-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState icon={MapPinned} title={url.q ? 'No shipment matches' : 'No shipments yet'} />
          ) : (
            <ul aria-label="Shipments" className="flex-1">
              {rows.map((s) => {
                const active = s.id === selectedId;
                return (
                  <li key={s.id} className="border-b border-divider last:border-b-0">
                    <button
                      type="button"
                      aria-current={active ? 'true' : undefined}
                      onClick={() => url.set({ open: s.id, page: url.page })}
                      className={clsx('flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors', active ? 'bg-primary-tint' : 'hover:bg-page')}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{s.dspNo}</span>
                        <span className="flex gap-1">
                          {s.overdue && <Pill tone="red">Overdue</Pill>}
                          <StatusPill status={s.status} />
                        </span>
                      </span>
                      <span className="truncate text-base text-ink">{s.partyName}</span>
                      <span className="truncate text-caption text-faint">
                        {s.courierName ?? s.mode} · {s.trackingNo ?? 'No tracking no.'} · {formatDate(s.date)} → {s.expectedDeliveryDate ? formatDate(s.expectedDeliveryDate) : 'TBD'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {(list.data?.total ?? 0) > PAGE_SIZE && (
            <div className="border-t border-divider">
              <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(p) => url.set({ page: p, open: url.open })} />
            </div>
          )}
        </Card>

        <Card
          title={d ? `${d.dspNo} · ${d.partyName}` : 'Shipment'}
          description={d ? d.productDescription ?? undefined : undefined}
          actions={d && <span className="flex gap-1">{d.overdue && <Pill tone="red">Overdue</Pill>}<StatusPill status={d.status} /></span>}
        >
          {!selectedId ? (
            <EmptyState icon={MapPinned} title="Pick a shipment" description="Its timeline and courier details appear here." />
          ) : detail.isError ? (
            <p className="text-base text-muted">{errorMessage(detail.error, 'This shipment could not be loaded.')}</p>
          ) : !d || !detail.data ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="flex flex-col gap-5">
              <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
                <DetailList
                  items={[
                    { label: 'Courier', value: d.courierName ?? '—' },
                    { label: 'Mode', value: d.mode },
                    {
                      label: 'Tracking',
                      value: d.trackingNo ? (
                        d.tracking?.kind === 'url' ? (
                          <a href={d.tracking.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono hover:underline">
                            {d.trackingNo}
                            <ExternalLink size={12} strokeWidth={1.8} aria-hidden />
                          </a>
                        ) : (
                          <span className="font-mono">{d.trackingNo}</span>
                        )
                      ) : (
                        '—'
                      ),
                    },
                    { label: 'Vehicle', value: d.vehicleNo ?? '—' },
                    { label: 'Dispatched', value: formatDate(d.date) },
                    { label: 'Expected', value: d.expectedDeliveryDate ? <span className={d.overdue ? 'font-semibold text-primary' : undefined}>{formatDate(d.expectedDeliveryDate)}</span> : '—' },
                    { label: 'Freight', value: d.freightPaise ? formatAmount(d.freightPaise / 100, { symbol: true }) : '—' },
                    { label: 'City', value: [d.partyCity, d.partyState].filter(Boolean).join(', ') || '—' },
                    {
                      label: 'Linked request',
                      value: d.linkedRequestNo ? (
                        can('samples.requests') ? (
                          <Link className="font-semibold hover:underline" to={`/samples/requests?open=${d.linkedRequestId}`}>
                            {d.linkedRequestNo}
                          </Link>
                        ) : (
                          d.linkedRequestNo
                        )
                      ) : (
                        '—'
                      ),
                    },
                    ...(d.tracking?.kind === 'text' ? [{ label: 'Track it', value: d.tracking.text, wide: true }] : []),
                  ]}
                />
                <section aria-label="Status timeline">
                  <h3 className="mb-3 text-sm font-semibold">Status timeline</h3>
                  <StatusTimeline timeline={detail.data.timeline} offPath={detail.data.offPath} />
                </section>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-divider pt-4">
                {canUpdate && (
                  <Button variant="primary" icon={RefreshCw} onClick={() => setStatusFor(d)}>
                    Update status
                  </Button>
                )}
                {canDo('print') && (
                  <>
                    <Button icon={Printer} onClick={() => guard('Couldn’t print the label', () => printCourierLabel(d.id))}>
                      Print label
                    </Button>
                    <Button icon={QrCode} onClick={() => setQrFor(d)}>
                      QR code
                    </Button>
                    <Button icon={MessageCircle} onClick={() => guard('Couldn’t prepare the message', () => shareDispatchOnWhatsApp(d.id))}>
                      Share on WhatsApp
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
      <StatusUpdateDialog dispatch={statusFor} onClose={() => setStatusFor(null)} />
      <QrDialog dispatch={qrFor} onClose={() => setQrFor(null)} />
    </div>
  );
}
