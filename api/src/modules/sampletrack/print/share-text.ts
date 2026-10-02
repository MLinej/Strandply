import type { CompanyBlock, DispatchView } from '../../../contracts/sampletrack';

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "2026-10-01" → "01 Oct 2026". */
export const shareDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));

/**
 * The WhatsApp dispatch update (legacy shareWhatsApp wording). Optional parts:
 * - the delay apology appears only when the status is Delayed;
 * - the tracking block appears only when there is both a courier and a tracking number.
 *   It holds the resolved link, or the "Contact courier with tracking number" hint.
 */
export function whatsappText(d: DispatchView, company: CompanyBlock): string {
  const lines: string[] = [
    `🚚 *Dispatch Update — ${company.name}*`,
    '',
    `📦 *Dispatch ID:* ${d.dspNo}`,
    `📅 *Dispatch Date:* ${shareDate(d.date)}`,
    `🏭 *Party:* ${d.partyName}${d.partyCity ? `, ${d.partyCity}` : ''}`,
    '',
    `📮 *Courier:* ${d.courierName ?? d.mode}`,
    `🔢 *Tracking No:* ${d.trackingNo ?? 'Not assigned yet'}`,
    `🚗 *Mode:* ${d.mode}`,
    `📅 *Expected Delivery:* ${d.expectedDeliveryDate ? shareDate(d.expectedDeliveryDate) : 'TBD'}`,
    '',
    `📦 *Contents:* ${d.productDescription ?? 'As per order'}`,
    '',
    `✅ *Current Status:* ${d.status}`,
  ];
  if (d.status === 'Delayed') lines.push('⚠️ This shipment is currently delayed. We apologize for the inconvenience.');
  if (d.courierName && d.trackingNo && d.tracking) {
    lines.push('', '🔍 Track your shipment:', d.tracking.kind === 'url' ? d.tracking.url : d.tracking.text);
  }
  lines.push('', 'For any queries, please contact us.', `— *${company.name}* Dispatch Team`);
  return lines.join('\n');
}

/** "ID:DSP-0001|Party:…|Track:…|Status:…". A "|" or line break inside a value becomes "/" or a space, so the fields stay separable. */
export function qrPayload(d: Pick<DispatchView, 'dspNo' | 'partyName' | 'trackingNo' | 'status'>): string {
  const clean = (s: string) => s.replace(/\|/g, '/').replace(/[\r\n]+/g, ' ').trim();
  return `ID:${clean(d.dspNo)}|Party:${clean(d.partyName)}|Track:${clean(d.trackingNo ?? '') || 'NA'}|Status:${d.status}`;
}
