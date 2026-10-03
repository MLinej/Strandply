import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { INQUIRY_STATUS_LABEL, ORDER_STATUS_LABEL, RC_STATUS_LABEL, type InquiryStatus, type OrderStatus, type Place, type RcStatus } from '@contracts/transport';
import { Pill } from '@/components/ui';
import type { Tone } from '@/lib/status';

export { d, inr, rupeesText, stamp, toPaise } from '../crm/ui';

export const placeText = (p: Place) => [p.city, p.state].filter(Boolean).join(', ') + (p.pincode ? ` – ${p.pincode}` : '');
export const weight = (mt: number | null) => (mt === null ? '—' : `${mt} MT`);
export const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

const INQ: Record<InquiryStatus, Tone> = { open: 'neutral', rate_compared: 'purple', approved: 'green', rejected: 'red', ordered: 'green', cancelled: 'neutral' };
export const InquiryPill = ({ s }: { s: InquiryStatus }) => <Pill tone={INQ[s]}>{INQUIRY_STATUS_LABEL[s]}</Pill>;
const RC: Record<RcStatus, Tone> = { draft: 'neutral', pending: 'amber', approved: 'green', rejected: 'red' };
export const RcPill = ({ s }: { s: RcStatus }) => <Pill tone={RC[s]}>{RC_STATUS_LABEL[s]}</Pill>;
const ORDER: Record<OrderStatus, Tone> = { issued: 'purple', delivered: 'green', cancelled: 'neutral' };
export const OrderPill = ({ s }: { s: OrderStatus }) => <Pill tone={ORDER[s]}>{ORDER_STATUS_LABEL[s]}</Pill>;

/** Inquiry → comparison (with its approval number) → order, each a link once it exists (legacy flowChain). */
export function FlowChain({ inq, rc, fra, order }: { inq: { id: string; no: string }; rc?: { id: string; no: string } | null; fra?: string | null; order?: { no: string } | null }) {
  const step = (label: string, no: string | null | undefined, to: string | null) => (
    <span className={no ? 'text-ink' : 'text-faint'}>
      {label}{' '}
      {no && to ? (
        <Link to={to} className="font-mono text-caption font-semibold hover:underline">
          {no}
        </Link>
      ) : (
        <span className="font-mono text-caption">{no ?? '—'}</span>
      )}
    </span>
  );
  const arrow = <ArrowRight size={12} className="text-faint" aria-hidden />;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" aria-label="Freight flow">
      {step('Inquiry', inq.no, `/transport/inquiries?open=${inq.id}`)}
      {arrow}
      {step('Rates', rc?.no, rc ? `/transport/rates?open=${rc.id}` : null)}
      {arrow}
      {step('Approval', fra, rc ? `/transport/rates?open=${rc.id}` : null)}
      {arrow}
      {step('Order', order?.no, order ? `/transport/orders?q=${order.no}` : null)}
    </div>
  );
}
