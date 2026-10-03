import { History, Search } from 'lucide-react';
import type { ActivityEntryView } from '@contracts/admin';
import { DataTable, EmptyState, Input, Pagination, Pill, type Column } from '@/components/ui';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { useStockAudit } from '../api';
const stamp = (iso: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

const PAGE_SIZE = 50;
const AREA: Record<string, string> = { stock_slip: 'Slip', stock_opening: 'Opening', stock_reclass: 'Reclass', stock_item: 'Item master', stock_report: 'Report' };

/** Every Stock change, export and print, newest first. */
export function AuditPage() {
  const url = useUrlState([] as const);
  const [search, setSearch] = useSearchParam(url);
  const list = useStockAudit({ q: url.q || undefined, page: url.page });
  const columns: Column<ActivityEntryView>[] = [
    { id: 'when', header: 'When', width: '170px', className: 'text-muted tabular-nums', cell: (a) => stamp(a.createdAt) },
    {
      id: 'who',
      header: 'By',
      width: '170px',
      cell: (a) => (
        <span className="flex flex-col leading-tight">
          <span className="font-medium">{a.userName ?? 'System'}</span>
          {a.userRole && <span className="text-caption text-faint">{a.userRole}</span>}
        </span>
      ),
    },
    { id: 'area', header: 'Area', width: '120px', cell: (a) => <Pill>{AREA[a.entityType ?? ''] ?? a.entityType}</Pill> },
    { id: 'action', header: 'Action', width: '120px', cell: (a) => a.action },
    { id: 'details', header: 'Details', cell: (a) => a.details },
  ];
  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Stock audit trail" description="Every slip, opening entry, reclassification, item change, export and print, newest first." />
      <Input aria-label="Search audit trail" icon={Search} placeholder="User or details" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[280px]" />
      <DataTable
        label="Stock audit trail"
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(a) => a.id}
        minWidth={900}
        loading={list.isLoading}
        empty={<EmptyState icon={History} title="Nothing recorded yet" />}
        footer={(list.data?.total ?? 0) > PAGE_SIZE && <Pagination page={url.page} pageSize={PAGE_SIZE} total={list.data!.total} onPageChange={(n) => url.set({ page: n })} />}
      />
    </div>
  );
}
