/** wa.me link with the message pre-filled. With a phone (e.g. "919876543210"), it opens that chat directly. */
export function whatsAppUrl(text: string, phone?: string | null): string {
  const digits = phone?.replace(/\D/g, '') ?? '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Opens WhatsApp (app or web) in a new tab. Call it from a click handler so it isn't blocked. */
export function openWhatsApp(text: string, phone?: string | null) {
  window.open(whatsAppUrl(text, phone), '_blank', 'noopener,noreferrer');
}
