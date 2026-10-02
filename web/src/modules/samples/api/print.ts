import type { CourierLabel, QrPayload, RequestSlip, WhatsAppShare } from '@contracts/sampletrack';
import { api } from '@/api/client';
import { openWhatsApp, whatsAppUrl } from '@/lib/share';

// Fetched on demand, not cached: each fetch is a logged print/share on the server.

/** Courier label data (A5 landscape). Needs the print permission. */
export const fetchCourierLabel = (dispatchId: string) => api<CourierLabel>(`/sampletrack/dispatches/${dispatchId}/label`);

/** Request slip data (A4). */
export const fetchRequestSlip = (requestId: string) => api<RequestSlip>(`/sampletrack/requests/${requestId}/slip`);

/** QR text for a dispatch. Render it with qrSvg()/qrDataUrl() from '@/lib/qr'. */
export const fetchQrPayload = (dispatchId: string) => api<QrPayload>(`/sampletrack/dispatches/${dispatchId}/qr`).then((r) => r.payload);

export const fetchWhatsAppShare = (dispatchId: string) => api<WhatsAppShare>(`/sampletrack/dispatches/${dispatchId}/whatsapp`);

/**
 * "Share on WhatsApp": opens a blank tab first (inside the click, so popup blockers allow it),
 * then fills in wa.me once the server has built the message.
 * `toParty` sends it to the party's mobile when it has one.
 */
export async function shareDispatchOnWhatsApp(dispatchId: string, { toParty = false } = {}) {
  const tab = window.open('', '_blank');
  try {
    const share = await fetchWhatsAppShare(dispatchId);
    if (tab) {
      tab.opener = null;
      tab.location.href = whatsAppUrl(share.text, toParty ? share.phone : null);
    } else {
      openWhatsApp(share.text, toParty ? share.phone : null);
    }
    return share;
  } catch (err) {
    tab?.close();
    throw err;
  }
}
