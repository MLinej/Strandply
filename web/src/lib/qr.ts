import QRCode from 'qrcode';

/**
 * Renders a QR code as SVG markup, entirely in the browser. Shipment data never goes to a
 * third-party QR service (the legacy app sent it to api.qrserver.com).
 */
export function qrSvg(payload: string, { margin = 1 }: { margin?: number } = {}): Promise<string> {
  return QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin });
}

/** PNG data URL, for an <img> or for embedding in a printed page. */
export function qrDataUrl(payload: string, { width = 300, margin = 1 }: { width?: number; margin?: number } = {}): Promise<string> {
  return QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', width, margin });
}
