import type { Context } from 'hono';
import { z } from 'zod';
import { DOCUMENT_TYPES, ENTRY_STATUSES, isFy, MATERIAL_IDS, NOTE_KINDS, NOTE_STATUSES, type NoteKind } from '../../contracts/purchase';
import { policy, requireAuthContext } from '../../auth/guards';
import { SecureRouter } from '../../auth/secure-router';
import type { PageKey } from '../../domain/access';
import { notFound, validationFailed } from '../../lib/errors';
import { xlsxResponse } from '../../lib/spreadsheet';
import { paging, parseJson, parseQuery } from '../../lib/validate';
import { actorOf, type Actor } from '../sampletrack/actor';
import { idParam } from '../sampletrack/routes/params';
import { currentFy } from './common';
import { MAX_DOCUMENT_BYTES } from './document-service';
import {
  consumptionBody,
  documentMeta,
  entryCreateBody,
  entryUpdateBody,
  noteStatusBody,
  openingStockBody,
  poCreateBody,
  poUpdateBody,
  returnCreateBody,
  typeCreateBody,
} from './validation';

const actor = (c: Context): Actor => actorOf(requireAuthContext(c as never).user);
const flag = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');
const forceOf = (c: Context) => flag.parse(c.req.query('force'));
const sort = z.string().max(30).optional();
const fy = z.string().refine(isFy, 'Use a financial year like 2026-27').optional();
const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-04')
  .optional();
const material = z.enum(MATERIAL_IDS).optional();

const entryQuery = z.object({
  ...paging,
  sort,
  material,
  status: z.enum(ENTRY_STATUSES).optional(),
  posted: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  fy,
  month,
  poId: z.string().max(64).optional(),
  vendorId: z.string().max(64).optional(),
});
const scopeQuery = z.object({ fy, month, material });

function toListQuery<T extends { q?: string; sort?: string; page?: number; pageSize?: number }>(parsed: T) {
  const { q, sort, page, pageSize, ...filters } = parsed;
  return { q, sort, page, pageSize, filters };
}
const noPaging = <T extends { page?: number; pageSize?: number }>({ page: _p, pageSize: _s, ...rest }: T) => rest;

const ALL: PageKey[] = ['purchase_dashboard', 'purchase_entries', 'purchase_orders', 'purchase_notes', 'purchase_inventory'];

/** Purchase module endpoints, mounted at /api/purchase. Fixed paths are registered before /:id. */
export function purchaseRoutes(): SecureRouter {
  const r = new SecureRouter();
  const s = (c: Context) => c.var.services;
  const fyOf = (c: Context, v: string | undefined) => v ?? currentFy(s(c).clock);

  // ── Meta, masters, vendor picker ───────────────────────────────────
  r.get('/meta', policy.anyPage(ALL), async (c) => c.json(await s(c).purchaseMasters.meta()));
  r.post('/types', policy.page('purchase_entries', 'edit'), async (c) => c.json(await s(c).purchaseMasters.addType(actor(c), await parseJson(c, typeCreateBody)), 201));
  r.delete('/types/:id', policy.page('purchase_entries', 'delete'), async (c) => {
    await s(c).purchaseMasters.removeType(actor(c), idParam(c));
    return c.body(null, 204);
  });
  r.get('/vendor-options', policy.anyPage(['purchase_entries', 'purchase_orders']), async (c) => {
    const { q } = parseQuery(c, z.object({ q: z.string().trim().max(100).optional() }));
    return c.json(await s(c).purchaseMasters.vendorOptions(q));
  });

  // ── Entries ────────────────────────────────────────────────────────
  r.get('/entries', policy.page('purchase_entries'), async (c) => c.json(await s(c).purchaseEntries.list(toListQuery(parseQuery(c, entryQuery)))));
  r.get('/entries/stats', policy.page('purchase_entries'), async (c) => c.json(await s(c).purchaseEntries.stats(noPaging(toListQuery(parseQuery(c, entryQuery))))));
  r.get('/entries/next-lot', policy.page('purchase_entries'), async (c) => {
    const q = parseQuery(c, z.object({ material: z.enum(MATERIAL_IDS), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }));
    return c.json({ lotNo: await s(c).purchaseEntries.nextLot(q.material, q.date) });
  });
  r.get('/entries/export', policy.page('purchase_entries', 'export'), async (c) => {
    const query = noPaging(toListQuery(parseQuery(c, entryQuery)));
    return xlsxResponse(c, await s(c).purchaseEntries.exportXlsx(actor(c), query), 'PurchaseRegister', s(c).clock());
  });
  r.get('/entries/:id', policy.page('purchase_entries'), async (c) => c.json(await s(c).purchaseEntries.get(idParam(c))));
  r.get('/entries/:id/print', policy.page('purchase_entries', 'print'), async (c) => {
    const { kind } = parseQuery(c, z.object({ kind: z.enum(['slip', 'label']).default('slip') }));
    return c.json(await s(c).purchaseEntries.printPayload(actor(c), idParam(c), kind));
  });
  r.post('/entries', policy.page('purchase_entries', 'edit'), async (c) =>
    c.json(await s(c).purchaseEntries.create(actor(c), await parseJson(c, entryCreateBody), { force: forceOf(c) }), 201),
  );
  r.patch('/entries/:id', policy.page('purchase_entries', 'edit'), async (c) =>
    c.json(await s(c).purchaseEntries.update(actor(c), idParam(c), await parseJson(c, entryUpdateBody), { force: forceOf(c) })),
  );
  r.post('/entries/:id/approve', policy.page('purchase_entries', 'purchase_approve'), async (c) => c.json(await s(c).purchaseEntries.approve(actor(c), idParam(c))));
  r.delete('/entries/:id', policy.page('purchase_entries', 'delete'), async (c) => {
    await s(c).purchaseEntries.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Debit / credit notes ───────────────────────────────────────────
  r.get('/notes', policy.page('purchase_notes'), async (c) => {
    const q = parseQuery(
      c,
      z.object({ q: z.string().trim().max(100).optional(), type: z.enum(['dn', 'cn', 'rd']).optional(), material, status: z.enum(NOTE_STATUSES).optional(), fy }),
    );
    const { q: text, ...filters } = q;
    return c.json(await s(c).purchaseEntries.notes({ q: text, filters: { ...filters, fy: fyOf(c, filters.fy) } }));
  });
  r.patch('/notes/:entryId/:kind', policy.page('purchase_notes', 'edit'), async (c) => {
    const kind = c.req.param('kind') as NoteKind;
    if (!(NOTE_KINDS as readonly string[]).includes(kind)) throw notFound('Note');
    const { status } = await parseJson(c, noteStatusBody);
    await s(c).purchaseEntries.setNoteStatus(actor(c), c.req.param('entryId') ?? '', kind, status);
    return c.body(null, 204);
  });

  // ── Purchase orders ────────────────────────────────────────────────
  r.get('/pos', policy.page('purchase_orders'), async (c) => {
    const q = parseQuery(
      c,
      z.object({ ...paging, material, progress: z.enum(['Open', 'Partial', 'Closed']).optional(), status: z.enum(['pending', 'approved']).optional(), fy }),
    );
    return c.json(await s(c).purchaseOrders.list(toListQuery(q)));
  });
  r.get('/pos/options', policy.anyPage(['purchase_entries', 'purchase_orders']), async (c) => {
    const { material: m } = parseQuery(c, z.object({ material: z.enum(MATERIAL_IDS) }));
    return c.json(await s(c).purchaseOrders.options(m));
  });
  // Active T&C clauses that apply to POs (from the Vendors T&C master).
  r.get('/pos/tnc-options', policy.page('purchase_orders'), async (c) => {
    const all = await c.var.services.tnc.list({ filters: { status: 'active' }, pageSize: 100 });
    return c.json(all.rows.filter((t) => t.appliesTo === 'all' || t.appliesTo === 'po').map(({ id, title, category, summary }) => ({ id, title, category, summary })));
  });
  r.get('/pos/export', policy.page('purchase_orders', 'export'), async (c) => xlsxResponse(c, await s(c).purchaseOrders.exportXlsx(actor(c)), 'PurchaseOrders', s(c).clock()));
  r.get('/pos/:id', policy.page('purchase_orders'), async (c) => c.json(await s(c).purchaseOrders.get(idParam(c))));
  r.get('/pos/:id/print', policy.page('purchase_orders', 'print'), async (c) => c.json(await s(c).purchaseOrders.printPayload(actor(c), idParam(c))));
  r.post('/pos', policy.page('purchase_orders', 'edit'), async (c) => c.json(await s(c).purchaseOrders.create(actor(c), await parseJson(c, poCreateBody)), 201));
  r.patch('/pos/:id', policy.page('purchase_orders', 'edit'), async (c) => c.json(await s(c).purchaseOrders.update(actor(c), idParam(c), await parseJson(c, poUpdateBody))));
  r.post('/pos/:id/approve', policy.page('purchase_orders', 'purchase_approve'), async (c) => c.json(await s(c).purchaseOrders.approve(actor(c), idParam(c))));
  r.delete('/pos/:id', policy.page('purchase_orders', 'delete'), async (c) => {
    await s(c).purchaseOrders.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Returns ────────────────────────────────────────────────────────
  r.get('/returns', policy.page('purchase_entries'), async (c) => {
    const q = parseQuery(c, z.object({ ...paging, sort, material, status: z.enum(['pending', 'approved']).optional(), fy }));
    return c.json(await s(c).purchaseReturns.list(toListQuery(q)));
  });
  r.post('/returns', policy.page('purchase_entries', 'edit'), async (c) => c.json(await s(c).purchaseReturns.create(actor(c), await parseJson(c, returnCreateBody)), 201));
  r.post('/returns/:id/approve', policy.page('purchase_entries', 'purchase_approve'), async (c) => c.json(await s(c).purchaseReturns.approve(actor(c), idParam(c))));
  r.delete('/returns/:id', policy.page('purchase_entries', 'delete'), async (c) => {
    await s(c).purchaseReturns.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Inventory ──────────────────────────────────────────────────────
  const fyParam = (c: Context) => {
    const v = c.req.param('fy') ?? '';
    if (!isFy(v)) throw validationFailed('Use a financial year like 2026-27');
    return v;
  };
  r.get('/inventory', policy.page('purchase_inventory'), async (c) => {
    const q = parseQuery(c, z.object({ fy }));
    return c.json(await s(c).inventory.view(fyOf(c, q.fy)));
  });
  r.get('/inventory/export', policy.page('purchase_inventory', 'export'), async (c) => {
    const q = parseQuery(c, z.object({ fy }));
    const f = fyOf(c, q.fy);
    return xlsxResponse(c, await s(c).inventory.exportXlsx(actor(c), f), `StockLedger-FY${f}`, s(c).clock());
  });
  r.put('/opening-stock/:fy', policy.page('purchase_inventory', 'edit'), async (c) => c.json(await s(c).inventory.saveOpening(actor(c), fyParam(c), await parseJson(c, openingStockBody))));
  r.post('/opening-stock/:fy/approve', policy.page('purchase_inventory', 'purchase_approve'), async (c) => c.json(await s(c).inventory.setOpeningApproval(actor(c), fyParam(c), 'approve')));
  r.post('/opening-stock/:fy/unlock', policy.page('purchase_inventory', 'purchase_approve'), async (c) => c.json(await s(c).inventory.setOpeningApproval(actor(c), fyParam(c), 'unlock')));
  r.put('/consumption/:fy', policy.page('purchase_inventory', 'edit'), async (c) => {
    const body = await parseJson(c, consumptionBody);
    await s(c).inventory.setConsumption(actor(c), fyParam(c), body.key, body.qty);
    return c.body(null, 204);
  });

  // ── Dashboard, reports, audit ──────────────────────────────────────
  r.get('/dashboard', policy.page('purchase_dashboard'), async (c) => {
    const q = parseQuery(c, scopeQuery);
    return c.json(await s(c).purchaseReports.dashboard({ fy: fyOf(c, q.fy), month: q.month }));
  });
  r.get('/reports', policy.page('purchase_dashboard'), async (c) => {
    const q = parseQuery(c, scopeQuery);
    return c.json(await s(c).purchaseReports.reports({ ...q, fy: fyOf(c, q.fy) }));
  });
  r.get('/reports/export', policy.page('purchase_dashboard', 'export'), async (c) => {
    const q = parseQuery(c, scopeQuery.extend({ kind: z.enum(['daywise', 'product-day']) }));
    const { kind, ...scope } = q;
    return xlsxResponse(c, await s(c).purchaseReports.exportXlsx(actor(c), { ...scope, fy: fyOf(c, scope.fy) }, kind), kind === 'daywise' ? 'DaywisePurchase' : 'ProductDayReport', s(c).clock());
  });
  r.get('/audit', policy.page('purchase_dashboard'), async (c) => {
    const q = parseQuery(c, z.object({ ...paging }));
    return c.json(await s(c).activity.list({ q: q.q, page: q.page, pageSize: q.pageSize ?? 50, filters: { entityPrefix: 'purchase_' } }));
  });

  // ── Documents ──────────────────────────────────────────────────────
  r.get('/documents', policy.page('purchase_entries'), async (c) => {
    const q = parseQuery(c, z.object({ ...paging, type: z.enum(DOCUMENT_TYPES).optional(), entryId: z.string().max(64).optional() }));
    return c.json(await s(c).purchaseDocuments.list(toListQuery(q)));
  });
  // multipart/form-data: file, type, entryId (optional).
  r.post('/documents', policy.page('purchase_entries', 'edit'), async (c) => {
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const file = form['file'];
    if (!(file instanceof File)) throw validationFailed('Attach the document as a "file" form field');
    if (file.size > MAX_DOCUMENT_BYTES) throw validationFailed('Files can be up to 10 MB');
    const meta = documentMeta.safeParse({ type: form['type'] || undefined, entryId: form['entryId'] || null });
    if (!meta.success) throw validationFailed('Invalid input', meta.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    const doc = await s(c).purchaseDocuments.upload(actor(c), { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, { type: meta.data.type, entryId: meta.data.entryId ?? null });
    return c.json(doc, 201);
  });
  r.get('/documents/:id/file', policy.page('purchase_entries'), async (c) => {
    const { doc, blob } = await s(c).purchaseDocuments.file(idParam(c));
    const ascii = doc.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
    return c.body(blob.bytes as Uint8Array<ArrayBuffer>, 200, {
      'Content-Type': blob.mime,
      'Content-Disposition': `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
  });
  r.delete('/documents/:id', policy.page('purchase_entries', 'delete'), async (c) => {
    await s(c).purchaseDocuments.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });

  return r;
}
