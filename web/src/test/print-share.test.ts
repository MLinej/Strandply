import { afterEach, describe, expect, it, vi } from 'vitest';
import { PAGES, pageCss, printDocumentHtml } from '@/lib/print';
import { qrSvg } from '@/lib/qr';
import { whatsAppUrl } from '@/lib/share';

afterEach(() => vi.unstubAllGlobals());

describe('print CSS', () => {
  it('sets the exact paper size with @page and turns on exact colour printing', () => {
    const css = pageCss(PAGES.courierLabel);
    expect(css).toContain('@page { size: 210mm 148mm; margin: 0mm; }');
    expect(css).toContain('-webkit-print-color-adjust: exact; print-color-adjust: exact;');
    expect(pageCss(PAGES.requestSlip, 12)).toContain('@page { size: 210mm 297mm; margin: 12mm; }');
  });

  it('wraps the body in a full document and escapes the title', () => {
    const html = printDocumentHtml({ title: 'Label <DSP-0001>', bodyHtml: '<main>x</main>', page: PAGES.courierLabel, css: '.a{}' });
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<title>Label &lt;DSP-0001&gt;</title>');
    expect(html).toContain('<body><main>x</main></body>');
    expect(html).toContain('.a{}');
  });
});

describe('WhatsApp link', () => {
  it('encodes the text, and adds the phone when given', () => {
    const text = '🚚 *Dispatch Update*\nTrack: https://x.example/?a=1&b=2';
    expect(whatsAppUrl(text)).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`);
    expect(whatsAppUrl('hi', '+91 98765-43210')).toBe('https://wa.me/919876543210?text=hi');
  });
});

describe('QR code', () => {
  it('renders SVG locally without any network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const xhrSpy = vi.fn();
    vi.stubGlobal('XMLHttpRequest', xhrSpy);
    const svg = await qrSvg('ID:DSP-0001|Party:Used Party|Track:NA|Status:Pending');
    expect(svg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });

  it('different payloads give different codes', async () => {
    expect(await qrSvg('ID:DSP-0001|Status:Pending')).not.toBe(await qrSvg('ID:DSP-0001|Status:Delivered'));
  });
});
