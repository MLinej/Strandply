import { BarChart3, Download } from 'lucide-react';
import type { CountRow, VendorView } from '@contracts/vendors';
import { useSession } from '@/app/session';
import { Button, Card, DataTable, EmptyState, KpiTile, Skeleton, useToast, type Column } from '@/components/ui';
import { errorMessage } from '../../samples/ui/errors';
import { PageHeader } from '../../samples/ui/PageHeader';
import { exportVendorReport, useVendorReport } from '../api';
import { CategoryPill, Stars, VendorStatusPill } from '../ui';

/** One "top 6" breakdown as labelled bars; the numbers are always printed, so colour carries nothing alone. */
function Breakdown({ title, rows }: { title: string; rows: CountRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No data</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
              <span className="truncate text-base">{r.label}</span>
              <span className="text-base font-semibold tabular-nums">{r.count}</span>
              <span className="col-span-2 h-1.5 rounded-full bg-subtle">
                <span className="block h-full rounded-full bg-chart-s1" style={{ width: `${(r.count / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Vendor analytics (legacy renderReports / exportCSV), computed on the server. */
export function VendorReportsPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const report = useVendorReport();
  const r = report.data;

  const exp = (format: 'xlsx' | 'csv') => exportVendorReport(format).catch((err) => toast({ tone: 'error', title: 'Export failed', description: errorMessage(err) }));

  const columns: Column<VendorView>[] = [
    { id: 'code', header: 'Code', width: '140px', className: 'text-sm text-muted', cell: (v) => v.code },
    { id: 'name', header: 'Vendor', cell: (v) => <span className="font-semibold">{v.name}</span> },
    { id: 'category', header: 'Category', width: '170px', cell: (v) => (v.categories[0] ? <CategoryPill name={v.categories[0].name} color={v.categories[0].color} /> : '—') },
    { id: 'city', header: 'City', width: '120px', cell: (v) => v.city ?? '—' },
    { id: 'status', header: 'Status', width: '110px', cell: (v) => <VendorStatusPill status={v.status} /> },
    { id: 'rating', header: 'Rating', width: '120px', cell: (v) => <Stars rating={v.rating} /> },
    { id: 'products', header: 'Products', width: '260px', className: 'text-sm text-muted', cell: (v) => v.products.slice(0, 3).map((p) => p.name).join(', ') || '—' },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader
        title="Vendor reports"
        description="Across your whole supplier base."
        actions={
          canDo('export') && (
            <>
              <Button icon={Download} onClick={() => void exp('csv')}>
                CSV
              </Button>
              <Button icon={Download} onClick={() => void exp('xlsx')}>
                Excel
              </Button>
            </>
          )
        }
      />
      {report.isError ? (
        <Card>
          <EmptyState icon={BarChart3} title="Couldn’t build the report" description={errorMessage(report.error)} />
        </Card>
      ) : !r ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <KpiTile variant="compact" label="Vendors" value={r.overview.total} />
            <KpiTile variant="compact" label="Active" value={r.overview.active} />
            <KpiTile variant="compact" label="Pending" value={r.overview.pending} />
            <KpiTile variant="compact" label="Blacklisted" value={r.overview.blacklisted} />
            <KpiTile variant="compact" label="Average rating" value={r.overview.averageRating === null ? '—' : `${r.overview.averageRating.toFixed(1)} ★`} meta={`${r.overview.ratedCount} rated`} />
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Breakdown title="By category" rows={r.byCategory} />
            <Breakdown title="By state" rows={r.byState} />
            <Breakdown title="By payment terms" rows={r.byPaymentTerms} />
          </div>
          <DataTable label="All vendors" columns={columns} rows={r.rows} getRowId={(v) => v.id} minWidth={980} />
        </>
      )}
    </div>
  );
}
