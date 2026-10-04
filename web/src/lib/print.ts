import type { PageSpec } from '@contracts/sampletrack';

/** A5 landscape (courier label), A4 portrait (request slip) and A4 landscape (wide registers), matching the API's page specs. */
export const PAGES = {
  courierLabel: { size: 'A5', orientation: 'landscape', widthMm: 210, heightMm: 148 },
  requestSlip: { size: 'A4', orientation: 'portrait', widthMm: 210, heightMm: 297 },
  register: { size: 'A4', orientation: 'landscape', widthMm: 297, heightMm: 210 },
} satisfies Record<string, PageSpec>;

/**
 * Print CSS for a page: exact paper size via @page (in mm, so the browser doesn't
 * pick a default margin), and exact colour printing so brand colours and fills survive.
 */
export function pageCss(page: PageSpec, marginMm = 0): string {
  return [
    `@page { size: ${page.widthMm}mm ${page.heightMm}mm; margin: ${marginMm}mm; }`,
    `html, body { margin: 0; padding: 0; width: ${page.widthMm}mm; min-height: ${page.heightMm}mm; background: #fff; }`,
    '* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }',
  ].join('\n');
}

export interface PrintOptions {
  title: string;
  /** Rendered markup for the page body (the layout comes from the design system). */
  bodyHtml: string;
  page: PageSpec;
  marginMm?: number;
  /** Extra CSS for the layout. */
  css?: string;
}

/** Builds the full HTML document that gets printed. Exported so it can be tested without printing. */
export function printDocumentHtml({ title, bodyHtml, page, marginMm = 0, css = '' }: PrintOptions): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${pageCss(page, marginMm)}\n${css}</style></head><body>${bodyHtml}</body></html>`;
}

/**
 * Prints through a hidden iframe: no popup window (so popup blockers can't stop it), and the
 * app page keeps its own styles. Resolves once the print dialog has closed.
 */
export function printHtml(opts: PrintOptions): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const win = frame.contentWindow!;
    const done = () => {
      frame.remove();
      resolve();
    };
    win.document.open();
    win.document.write(printDocumentHtml(opts));
    win.document.close();
    win.addEventListener('afterprint', done, { once: true });
    // Wait one frame so fonts and layout settle before the dialog opens.
    requestAnimationFrame(() => {
      win.focus();
      win.print();
      // Some browsers never fire afterprint for iframes; clean up anyway.
      setTimeout(done, 60_000);
    });
  });
}
