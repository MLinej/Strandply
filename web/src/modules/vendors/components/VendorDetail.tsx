import { clsx } from 'clsx';
import { Ban, CheckCircle2, Pencil, Power, Printer, RotateCcw, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { VendorAction, VendorView } from '@contracts/vendors';
import { useSession } from '@/app/session';
import { Button, Modal, Tabs, Textarea, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { DetailList } from '../../samples/ui/DetailList';
import { errorMessage } from '../../samples/ui/errors';
import { useVendorAction } from '../api';
import { printVendors } from '../print';
import { CategoryPill, STEP_DONE, STEP_LABEL, Stars, stepsFor, VendorStatusPill } from '../ui';

type Tab = 'overview' | 'products' | 'finance' | 'history';
const STEP_ICON = { submit: Send, approve: CheckCircle2, activate: Power, blacklist: Ban, reinstate: RotateCcw } as const;
const day = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10)) : null);

/** Blacklist with a required reason (legacy openBL / confBL). */
export function BlacklistDialog({ vendor, onClose, onDone }: { vendor: VendorView | null; onClose: () => void; onDone?: (v: VendorView) => void }) {
  const toast = useToast();
  const act = useVendorAction();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setReason('');
    setError('');
  }, [vendor]);
  async function confirm() {
    if (!vendor) return;
    if (!reason.trim()) return setError('Give a reason for blacklisting');
    try {
      const v = await act.mutateAsync({ id: vendor.id, action: 'blacklist', reason: reason.trim() });
      toast({ tone: 'success', title: `${v.name} blacklisted` });
      onDone?.(v);
      onClose();
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t blacklist', description: errorMessage(err) });
    }
  }
  return (
    <Modal
      open={!!vendor}
      onClose={onClose}
      size="sm"
      title={`Blacklist ${vendor?.name ?? ''}?`}
      description="Marks the vendor as Do Not Use. No POs can be raised until it is reinstated."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Ban} loading={act.isPending} onClick={confirm}>
            Blacklist
          </Button>
        </>
      }
    >
      <Textarea label="Reason" placeholder="Quality issues, delays, refused refund…" value={reason} onChange={(e) => setReason(e.target.value)} error={error} autoFocus />
    </Modal>
  );
}

function HistoryTimeline({ v }: { v: VendorView }) {
  type Step = { title: string; at: string | null; by?: string | null; state: 'done' | 'current' | 'todo' | 'bad' };
  const steps: Step[] = [{ title: 'Vendor added', at: v.createdAt, by: v.createdByName, state: 'done' }];
  if (v.status === 'inactive') steps.push({ title: 'Saved inactive, not submitted yet', at: null, state: 'current' });
  else steps.push({ title: 'Submitted for review', at: v.submittedAt ?? v.createdAt, state: 'done' });
  if (v.approvedAt) steps.push({ title: 'Approved', at: v.approvedAt, by: v.approvedByName, state: 'done' });
  else if (v.status !== 'inactive') steps.push({ title: 'Approval', at: null, state: v.status === 'pending' ? 'current' : 'todo' });
  if (v.activatedAt || v.status === 'active') steps.push({ title: 'Activated', at: v.activatedAt, by: v.activatedByName, state: 'done' });
  else if (v.status === 'approved') steps.push({ title: 'Activation', at: null, state: 'current' });
  if (v.status === 'blacklisted') steps.push({ title: `Blacklisted${v.blacklistReason ? `: ${v.blacklistReason}` : ''}`, at: v.blacklistedAt, by: v.blacklistedByName, state: 'bad' });
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => (
        <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
          {i < steps.length - 1 && <span className="absolute left-[7px] top-5 h-[calc(100%-12px)] w-px bg-border" aria-hidden />}
          <span
            className={clsx(
              'mt-1 h-4 w-4 shrink-0 rounded-full border-2',
              s.state === 'done' && 'border-green bg-green',
              s.state === 'bad' && 'border-primary bg-primary',
              s.state === 'current' && 'border-amber bg-card',
              s.state === 'todo' && 'border-border bg-card',
            )}
            aria-hidden
          />
          <div>
            <p className={clsx('text-base font-semibold', s.state === 'todo' && 'text-faint', s.state === 'bad' && 'text-primary')}>{s.title}</p>
            {(s.at || s.by) && <p className="text-caption text-muted">{[day(s.at), s.by].filter(Boolean).join(' · ')}</p>}
            {s.state === 'current' && <p className="text-caption text-amber">Waiting</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Vendor detail with Overview / Products / Finance / History tabs and the workflow steps (legacy openDet). */
export function VendorDetail({
  vendor,
  loadingText,
  onClose,
  onEdit,
  onBlacklist,
}: {
  vendor: VendorView | undefined;
  loadingText: string;
  onClose: () => void;
  onEdit: (v: VendorView) => void;
  onBlacklist: (v: VendorView) => void;
}) {
  const toast = useToast();
  const { canDo } = useSession();
  const act = useVendorAction();
  const [tab, setTab] = useState<Tab>('overview');
  useEffect(() => setTab('overview'), [vendor?.id]);
  const v = vendor;

  async function step(a: VendorAction) {
    if (!v) return;
    if (a === 'blacklist') return onBlacklist(v);
    try {
      const done = await act.mutateAsync({ id: v.id, action: a });
      toast({ tone: 'success', title: `${done.name} ${STEP_DONE[a]}` });
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t ${STEP_LABEL[a].toLowerCase()}`, description: errorMessage(err) });
    }
  }

  const steps = v ? stepsFor(v.status, { edit: canDo('edit'), approval: canDo('vendor_approve') }) : [];
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        v ? (
          <span className="flex items-center gap-2">
            {v.name} <VendorStatusPill status={v.status} />
          </span>
        ) : (
          'Vendor'
        )
      }
      description={v ? [v.code, v.type, v.categories.map((c) => c.name).join(', ')].filter(Boolean).join(' · ') : undefined}
      footer={
        v && (
          <>
            {canDo('print') && (
              <Button icon={Printer} onClick={() => printVendors({ id: v.id }).catch((err) => toast({ tone: 'error', title: 'Couldn’t print', description: errorMessage(err) }))}>
                Print card
              </Button>
            )}
            {canDo('edit') && (
              <Button icon={Pencil} onClick={() => onEdit(v)}>
                Edit
              </Button>
            )}
            {steps.map((a) => (
              <Button key={a} variant={a === 'blacklist' ? 'secondary' : 'primary'} icon={STEP_ICON[a]} loading={act.isPending && act.variables?.action === a} onClick={() => void step(a)}>
                {STEP_LABEL[a]}
              </Button>
            ))}
          </>
        )
      }
    >
      {!v ? (
        <p className="text-base text-muted">{loadingText}</p>
      ) : (
        <Tabs
          aria-label="Vendor details"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'overview', label: 'Overview' },
            { value: 'products', label: 'Products', count: v.products.length },
            { value: 'finance', label: 'Finance' },
            { value: 'history', label: 'History' },
          ]}
        >
          <div className="pt-4">
            {tab === 'overview' && (
              <DetailList
                items={[
                  { label: 'Categories', value: <span className="flex flex-wrap gap-1">{v.categories.map((c) => <CategoryPill key={c.id} name={c.name} icon={c.icon} color={c.color} />)}</span>, wide: true },
                  { label: 'Rating', value: <Stars rating={v.rating} /> },
                  { label: 'Year established', value: v.yearEstablished },
                  { label: 'Contact person', value: [v.contact, v.designation].filter(Boolean).join(', ') || null },
                  { label: 'Phone', value: v.phone && <a className="text-ink underline-offset-2 hover:underline" href={`tel:${v.phone}`}>{v.phone}</a> },
                  { label: 'Email', value: v.email && <a className="text-ink underline-offset-2 hover:underline" href={`mailto:${v.email}`}>{v.email}</a> },
                  { label: 'Website', value: v.website && <a className="text-ink underline-offset-2 hover:underline" href={v.website} target="_blank" rel="noreferrer">{v.website.replace(/^https?:\/\//, '')}</a> },
                  { label: 'Address', value: [v.address, v.city, v.state].filter(Boolean).join(', ') + (v.pincode ? ` — ${v.pincode}` : '') || null, wide: true },
                  ...(v.status === 'blacklisted' ? [{ label: 'Blacklist reason', value: <span className="text-primary">{v.blacklistReason}</span>, wide: true }] : []),
                  { label: 'Notes', value: v.notes && <span className="whitespace-pre-line">{v.notes}</span>, wide: true },
                ]}
              />
            )}
            {tab === 'products' &&
              (v.products.length ? (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {v.products.map((p) => (
                    <li key={p.id} className="rounded border border-border bg-page px-3 py-2">
                      <p className="text-base font-semibold">{p.name}</p>
                      <p className="text-caption text-muted">
                        {p.code} · {p.unit} · {p.categoryName}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-base text-muted">No products registered.</p>
              ))}
            {tab === 'finance' && (
              <DetailList
                items={[
                  { label: 'GSTIN', value: v.gst && <span className="font-mono">{v.gst}</span> },
                  { label: 'PAN', value: v.pan && <span className="font-mono">{v.pan}</span> },
                  { label: 'MSME / Udyam', value: v.msme },
                  { label: 'Payment terms', value: v.paymentTerms },
                  { label: 'Bank', value: v.bank },
                  { label: 'Account number', value: v.accountNo && <span className="font-mono">{v.accountNo}</span> },
                  { label: 'IFSC', value: v.ifsc && <span className="font-mono">{v.ifsc}</span> },
                ]}
              />
            )}
            {tab === 'history' && <HistoryTimeline v={v} />}
          </div>
        </Tabs>
      )}
    </Modal>
  );
}
