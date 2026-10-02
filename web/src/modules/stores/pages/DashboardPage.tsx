import { ChevronRight, ClipboardCheck, PackageCheck, Truck } from 'lucide-react';
import { Link } from 'react-router';
import { useSession } from '@/app/session';
import { Card, KpiTile, Skeleton } from '@/components/ui';
import { PageHeader } from '../../samples/ui/PageHeader';
import { useStoresDashboard, useStoresMeta } from '../api';
import { dateTime, DaysPill, itemsSummary, MrnStatusPill, qtySummary } from '../ui';

/** Stores dashboard (legacy renderDashboard): today at the gate and in receiving, and what is waiting. */
export function DashboardPage() {
  const { can } = useSession();
  const d = useStoresDashboard().data;
  const fy = useStoresMeta().data?.currentFy;
  const link = (to: string, perm: string, label: string) =>
    can(perm) ? (
      <Link to={to} className="inline-flex items-center text-sm font-semibold text-muted hover:text-ink">
        {label} <ChevronRight size={13} strokeWidth={2} aria-hidden />
      </Link>
    ) : null;

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Stores dashboard" description={`Gate entries and goods receipts${fy ? `, FY ${fy}` : ''}.`} />
      {!d ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiTile icon={Truck} label="MRNs today" value={d.kpis.mrnToday} meta="Vehicles at the gate" />
            <KpiTile icon={ClipboardCheck} label="Pending GRN" value={d.kpis.pendingGrn} meta="Waiting for receiving" emphasis={d.kpis.pendingGrn ? 'warn' : undefined} />
            <KpiTile icon={PackageCheck} label="GRNs today" value={d.kpis.grnToday} meta="Received by Stores" />
            <KpiTile variant="compact" label="Awaiting review" value={d.kpis.awaitingReview} meta="Draft GRNs" />
            <KpiTile variant="compact" label="Awaiting approval" value={d.kpis.awaitingApproval} meta="Reviewed GRNs" />
            <KpiTile variant="compact" label="Pending accounting" value={d.kpis.pendingAccounting} meta="Approved, no voucher yet" />
          </div>
          <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
            <Card flush title="Recent gate entries" actions={link('/stores/gate-entry', 'stores.gate', 'All')}>
              <ul>
                {d.recentMrns.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 border-t border-divider px-5 py-2 text-sm first:border-0">
                    <span className="w-36 shrink-0 whitespace-nowrap">
                      <span className="block font-semibold tabular-nums">{m.mrnNo}</span>
                      <span className="text-caption text-faint">{dateTime(m.date, m.time)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{m.vendorName}</span>
                      <span className="block truncate text-caption text-faint">
                        {itemsSummary(m.items)} · {qtySummary(m.items.map((i) => ({ qty: i.approxQty, unit: i.unit })))}
                      </span>
                    </span>
                    <MrnStatusPill status={m.status} />
                  </li>
                ))}
                {d.recentMrns.length === 0 && <li className="px-5 py-3 text-sm text-muted">No gate entries yet.</li>}
              </ul>
            </Card>
            <Card flush title="Waiting longest for a GRN" actions={link('/stores/reports', 'stores.reports', 'Report')}>
              <ul>
                {d.ageing.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 border-t border-divider px-5 py-2 text-sm first:border-0">
                    <span className="w-36 shrink-0 whitespace-nowrap font-semibold tabular-nums">{m.mrnNo}</span>
                    <span className="min-w-0 flex-1 truncate">{m.vendorName}</span>
                    <DaysPill days={m.daysPending} />
                  </li>
                ))}
                {d.ageing.length === 0 && <li className="px-5 py-3 text-sm text-muted">Nothing is waiting. All caught up.</li>}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
