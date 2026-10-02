import { ArrowRight, CheckCircle2, ClipboardCheck, Pencil, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import type { GrnView, MrnView } from '@contracts/stores';
import { useSession } from '@/app/session';
import { Button, Modal, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage } from '../../samples/ui/errors';
import { useGrn, useGrnStep, useMrn } from '../api';
import { printGrn, printMrn } from '../print';
import { AccountedPill, dateTime, DaysPill, materialLabel, MrnStatusPill, QualityPill, qtyFmt, stamp, StatusFlow } from '../ui';

function ItemsTable({ label, head, rows }: { label: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full min-w-[560px] text-sm" aria-label={label}>
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
            <tr key={i} className="border-t border-divider">
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

function useGuard() {
  const toast = useToast();
  return (title: string, fn: () => Promise<unknown>) => void fn().catch((err) => toast({ tone: 'error', title, description: errorMessage(err) }));
}

/** One gate entry (legacy openMrnViewModal). */
export function MrnDetail({
  id,
  onClose,
  onEdit,
  onReceive,
  onViewGrn,
}: {
  id: string | null;
  onClose: () => void;
  onEdit?: (m: MrnView) => void;
  onReceive?: (m: MrnView) => void;
  onViewGrn?: (grnId: string) => void;
}) {
  const { canDo } = useSession();
  const guard = useGuard();
  const m = useMrn(id).data;
  return (
    <Modal
      open={!!id}
      onClose={onClose}
      size="lg"
      title={m ? `Gate entry ${m.mrnNo}` : 'Gate entry'}
      description={m ? `${m.vendorName} · ${m.vehicleNo}` : undefined}
      footer={
        m && (
          <>
            {canDo('print') && (
              <Button icon={Printer} onClick={() => guard('Couldn’t print', () => printMrn(m.id))}>
                Print slip
              </Button>
            )}
            {canDo('edit') && onEdit && m.status === 'pending_grn' && (
              <Button icon={Pencil} onClick={() => onEdit(m)}>
                Edit
              </Button>
            )}
            {m.status === 'pending_grn' && onReceive && (
              <Button variant="primary" icon={ArrowRight} onClick={() => onReceive(m)}>
                Make GRN
              </Button>
            )}
            {m.grnId && onViewGrn && (
              <Button variant="primary" onClick={() => onViewGrn(m.grnId!)}>
                View {m.grnNo}
              </Button>
            )}
          </>
        )
      }
    >
      {!m ? (
        <p className="text-base text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <DetailList
            cols={3}
            items={[
              { label: 'Gate entry', value: dateTime(m.date, m.time) },
              { label: 'Status', value: <span className="flex items-center gap-2"><MrnStatusPill status={m.status} />{m.status === 'pending_grn' && <DaysPill days={m.daysPending} />}</span> },
              { label: 'GRN', value: m.grnNo },
              { label: 'Vendor', value: m.vendorName },
              { label: 'Invoice / challan', value: m.invoiceNo ?? 'Not available at gate' },
              { label: 'Vehicle', value: m.vehicleNo },
              { label: 'Security guard', value: m.securityName },
              { label: 'Driver', value: [m.driverName, m.driverPhone].filter(Boolean).join(' · ') || null },
              { label: 'Entered by', value: m.createdByName },
              { label: 'Gate remarks', value: m.remarks, wide: true },
            ]}
          />
          <ItemsTable
            label="MRN items"
            head={['#', 'Material', 'Approx qty', 'Packages', 'Remarks']}
            rows={m.items.map((it, i) => [i + 1, materialLabel(it.material), <span key="q" className="tabular-nums">{`${qtyFmt(it.approxQty)} ${it.unit}`}</span>, it.packages ?? '—', it.remarks ?? '—'])}
          />
        </div>
      )}
    </Modal>
  );
}

/** One GRN with its sign-off trail (legacy openGrnViewModal). Review and approve happen here too. */
export function GrnDetail({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit?: (g: GrnView) => void }) {
  const toast = useToast();
  const { canDo } = useSession();
  const guard = useGuard();
  const g = useGrn(id).data;
  const step = useGrnStep();
  const run = (s: 'review' | 'approve') =>
    void step.mutateAsync({ id: g!.id, step: s }).then(
      (r) => toast({ tone: 'success', title: `${r.grnNo} ${s === 'review' ? 'reviewed' : 'approved'}` }),
      (err) => toast({ tone: 'error', title: s === 'review' ? 'Couldn’t review' : 'Couldn’t approve', description: errorMessage(err) }),
    );
  return (
    <Modal
      open={!!id}
      onClose={onClose}
      size="lg"
      title={g ? `GRN ${g.grnNo}` : 'GRN'}
      description={g ? `${g.vendorName} · against ${g.mrnNo}` : undefined}
      footer={
        g && (
          <>
            {canDo('print') && (
              <Button icon={Printer} onClick={() => guard('Couldn’t print', () => printGrn(g.id))}>
                Print GRN
              </Button>
            )}
            {canDo('edit') && onEdit && g.status !== 'approved' && (
              <Button icon={Pencil} onClick={() => onEdit(g)}>
                Edit
              </Button>
            )}
            {canDo('stores_review') && g.status === 'draft' && (
              <Button variant="primary" icon={ClipboardCheck} loading={step.isPending} onClick={() => run('review')}>
                Mark reviewed
              </Button>
            )}
            {canDo('stores_approve') && g.status === 'reviewed' && (
              <Button variant="primary" icon={CheckCircle2} loading={step.isPending} onClick={() => run('approve')}>
                Approve
              </Button>
            )}
          </>
        )
      }
    >
      {!g ? (
        <p className="text-base text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <StatusFlow status={g.status} />
          <DetailList
            cols={3}
            items={[
              { label: 'Received', value: dateTime(g.date, g.time) },
              { label: 'Received by', value: g.receivedByName },
              { label: 'Vehicle', value: g.vehicleNo },
              { label: 'Vendor', value: g.vendorName },
              {
                label: 'Invoice',
                value: (
                  <span className="flex flex-col">
                    <span>{g.invoiceNo}</span>
                    <span className="text-caption text-faint">
                      {g.purchaseEntry ? `Purchase ${materialLabel(g.purchaseEntry.material)} lot ${g.purchaseEntry.lotNo}, ${formatDate(g.purchaseEntry.date)}` : 'Manual reference (not in Purchase)'}
                    </span>
                  </span>
                ),
              },
              { label: 'Quality', value: <QualityPill quality={g.worstQuality} /> },
              { label: 'Reviewed', value: g.reviewedAt ? `${g.reviewedByName ?? '—'}, ${stamp(g.reviewedAt)}` : null },
              { label: 'Approved', value: g.approvedAt ? `${g.approvedByName ?? '—'}, ${stamp(g.approvedAt)}` : null },
              {
                label: 'Accounting',
                value: g.accounted ? `Voucher ${g.voucherNo}, ${g.accountedByName ?? '—'}, ${stamp(g.accountedAt)}` : <AccountedPill grn={g} />,
              },
              { label: 'Remarks', value: g.remarks, wide: true },
            ]}
          />
          <ItemsTable
            label="GRN items"
            head={['#', 'Material', 'Approx (gate)', 'Actual', 'Quality', 'Remarks']}
            rows={g.items.map((it, i) => [
              i + 1,
              <span key="m">
                {materialLabel(it.material)}
                {!it.mrnItemId && <span className="text-caption text-faint"> (unlisted)</span>}
              </span>,
              it.approxQty ? `${qtyFmt(it.approxQty)} ${it.unit}` : '—',
              <strong key="a" className="tabular-nums">{`${qtyFmt(it.actualQty)} ${it.unit}`}</strong>,
              <QualityPill key="ql" quality={it.quality} />,
              it.qualityRemarks ?? '—',
            ])}
          />
          <p className="text-caption text-faint">Review, approval and accounting times are stamped when each step happens and can’t be edited.</p>
        </div>
      )}
    </Modal>
  );
}
