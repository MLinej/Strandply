import { FileMinus, Search } from 'lucide-react';
import { MATERIALS, NOTE_STATUSES, type MaterialId, type NoteRow, type NoteStatus } from '@contracts/purchase';
import { useSession } from '@/app/session';
import { DataTable, EmptyState, Input, KpiTile, Pill, Select, Tabs, useToast, type Column } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { errorMessage } from '../../samples/ui/errors';
import { useSearchParam, useUrlState } from '../../samples/ui/list-state';
import { PageHeader } from '../../samples/ui/PageHeader';
import { useNotes, useSetNoteStatus } from '../api';
import { FySelect, inr, inrShort, materialLabel, NOTE_STATUS_TONE, NotePill, qtyFmt, useFy } from '../ui';

type Tab = 'all' | 'dn' | 'cn' | 'rd';

/** Debit / credit note register, worked out from quantity and rate differences (legacy renderDNCNPage). */
export function NotesPage() {
  const toast = useToast();
  const { canDo } = useSession();
  const url = useUrlState(['type', 'material', 'status', 'fy'] as const);
  const [search, setSearch] = useSearchParam(url);
  const { fy, fys } = useFy(url.values.fy);
  const tab: Tab = (['dn', 'cn', 'rd'] as const).find((t) => t === url.values.type) ?? 'all';
  const notes = useNotes({
    q: url.q || undefined,
    filters: { type: tab === 'all' ? undefined : tab, material: (url.values.material || undefined) as MaterialId | undefined, status: (url.values.status || undefined) as NoteStatus | undefined, fy: fy || undefined },
  });
  const setStatus = useSetNoteStatus();
  const stats = notes.data?.stats;

  const columns: Column<NoteRow>[] = [
    {
      id: 'entry',
      header: 'Entry',
      width: '150px',
      cell: (n) => (
        <span className="flex flex-col leading-tight">
          <span className="font-semibold">
            {materialLabel(n.material)} {n.lotNo}
          </span>
          <span className="text-caption text-faint">{formatDate(n.date)}</span>
        </span>
      ),
    },
    {
      id: 'vendor',
      header: 'Vendor',
      cell: (n) => (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate">{n.vendorName}</span>
          <span className="text-caption text-faint">Invoice {n.invoiceNo}</span>
        </span>
      ),
    },
    { id: 'type', header: 'Type', width: '110px', cell: (n) => <NotePill kind={n.kind} type={n.type} /> },
    {
      id: 'basis',
      header: 'Basis',
      width: '200px',
      className: 'text-sm',
      cell: (n) =>
        n.kind === 'qty' ? (
          <span className="tabular-nums">
            Inv {qtyFmt(n.invQty)} · SPL {qtyFmt(n.splQty)} → <strong>{qtyFmt(n.qty)}</strong>
          </span>
        ) : (
          <span className="tabular-nums">
            {qtyFmt(n.qty)} × {inr(Math.abs(n.rateDiffPaise ?? 0))}
          </span>
        ),
    },
    { id: 'basic', header: 'Basic', width: '110px', align: 'right', className: 'tabular-nums', cell: (n) => inr(n.note.basic) },
    { id: 'gst', header: 'GST', width: '100px', align: 'right', className: 'tabular-nums', cell: (n) => inr(n.note.cgst + n.note.sgst + n.note.igst) },
    {
      id: 'total',
      header: 'Total',
      width: '120px',
      align: 'right',
      cell: (n) => <span className={`font-semibold tabular-nums ${n.type === 'dn' ? 'text-primary' : 'text-green'}`}>{n.type === 'dn' ? '−' : '+'}{inr(n.note.total)}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      width: '160px',
      cell: (n) =>
        canDo('edit') ? (
          <Select
            aria-label={`Status of ${n.kind === 'qty' ? 'quantity' : 'rate'} note for ${n.lotNo}`}
            options={NOTE_STATUSES.map((s) => ({ value: s, label: s }))}
            value={n.status}
            onChange={(e) =>
              void setStatus
                .mutateAsync({ entryId: n.entryId, kind: n.kind, status: e.target.value as NoteStatus })
                .catch((err) => toast({ tone: 'error', title: 'Couldn’t change the status', description: errorMessage(err) }))
            }
          />
        ) : (
          <Pill tone={NOTE_STATUS_TONE[n.status]}>{n.status}</Pill>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-6">
      <PageHeader title="Debit / credit notes" description="Raised automatically from quantity differences (invoice vs our weighbridge) and rate differences. Track each until it is issued and settled." />
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile variant="compact" label="Debit notes" value={stats.debit.count} meta={inrShort(stats.debit.paise)} />
          <KpiTile variant="compact" label="Credit notes" value={stats.credit.count} meta={inrShort(stats.credit.paise)} />
          <KpiTile variant="compact" label="Rate difference" value={stats.rate.count} meta={inrShort(stats.rate.paise)} />
          <KpiTile variant="compact" label="Net (DN − CN)" value={inrShort(stats.netPaise)} meta="Quantity notes" />
        </div>
      )}
      <Tabs
        aria-label="Note type"
        value={tab}
        onChange={(t) => url.set({ type: t === 'all' ? null : t })}
        items={[
          { value: 'all', label: 'All notes' },
          { value: 'dn', label: 'Debit notes', count: stats?.debit.count },
          { value: 'cn', label: 'Credit notes', count: stats?.credit.count },
          { value: 'rd', label: 'Rate difference', count: stats?.rate.count },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input aria-label="Search notes" icon={Search} placeholder="Vendor, invoice or lot" value={search} onChange={(e) => setSearch(e.target.value)} containerClassName="w-[240px]" />
        <FySelect value={fy} fys={fys} onChange={(v) => url.set({ fy: v })} />
        <Select aria-label="Material" placeholder="All materials" options={MATERIALS.map((m) => ({ value: m.id, label: m.label }))} value={url.values.material} onChange={(e) => url.set({ material: e.target.value })} containerClassName="w-[170px]" />
        <Select aria-label="Status filter" placeholder="Any status" options={NOTE_STATUSES.map((s) => ({ value: s, label: s }))} value={url.values.status} onChange={(e) => url.set({ status: e.target.value })} containerClassName="w-[160px]" />
      </div>
      <DataTable label="Debit and credit notes" columns={columns} rows={notes.data?.rows ?? []} getRowId={(n) => n.id} minWidth={1160} loading={notes.isLoading} empty={<EmptyState icon={FileMinus} title="No notes" />} />
    </div>
  );
}
