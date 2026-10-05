import type { Context } from 'hono';
import { z } from 'zod';
import { CP_CATEGORIES, CP_MATERIALS, CP_PRIORITIES, CP_STATUSES, type Complaint } from '../../contracts/complaints';
import { policy, requireAuthContext } from '../../auth/guards';
import { SecureRouter } from '../../auth/secure-router';
import type { PageKey } from '../../domain/access';
import { isIsoDate } from '../../lib/dates';
import { xlsxResponse } from '../../lib/spreadsheet';
import { paging, parseJson, parseQuery } from '../../lib/validate';
import { actorOf, type Actor } from '../sampletrack/actor';
import { idParam } from '../sampletrack/routes/params';
import type { Upload } from './complaint-service';
import * as v from './validation';

const actor = (c: Context): Actor => actorOf(requireAuthContext(c as never).user);
const date = z.string().refine(isIsoDate, 'Use a date like 2026-04-01').optional();
const text = z.string().trim().max(160).optional();
const reportQuery = z.object({ from: date, to: date, fy: z.string().regex(/^\d{4}-\d{2}$/).optional() });

const ALL: PageKey[] = ['complaints_dashboard', 'complaints_register', 'complaints_reports', 'complaints_masters'];
const READ: PageKey[] = ['complaints_register', 'complaints_dashboard', 'complaints_reports'];

/** Files from a multipart body (field "file", repeatable). */
async function uploads(c: Context): Promise<{ files: Upload[]; fields: Record<string, unknown> }> {
  const form = await c.req.parseBody({ all: true }).catch(() => ({}) as Record<string, unknown>);
  const raw = form['file'];
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((f): f is File => f instanceof File);
  return { files: await Promise.all(list.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))), fields: form };
}

/** Complaints module endpoints, mounted at /api/complaints. */
export function complaintsRoutes(): SecureRouter {
  const r = new SecureRouter();
  const s = (c: Context) => c.var.services;
  const view = (c: Context, x: Complaint) => s(c).complaintReports.view(x);

  r.get('/meta', policy.anyPage(ALL), async (c) => c.json(await s(c).complaintReports.meta()));
  r.get('/party-invoices', policy.page('complaints_register'), async (c) => c.json(await s(c).complaintReports.partyInvoices(parseQuery(c, z.object({ customerId: z.string().min(1).max(64) })).customerId)));

  // ── Recipients ─────────────────────────────────────────────────────
  r.get('/recipients', policy.anyPage(ALL), async (c) => c.json(await s(c).complaints.recipients()));
  r.post('/recipients', policy.page('complaints_masters', 'edit'), async (c) => c.json(await s(c).complaints.saveRecipient(actor(c), null, await parseJson(c, v.recipientCreateBody)), 201));
  r.patch('/recipients/:id', policy.page('complaints_masters', 'edit'), async (c) => c.json(await s(c).complaints.saveRecipient(actor(c), idParam(c), await parseJson(c, v.recipientUpdateBody))));
  r.delete('/recipients/:id', policy.page('complaints_masters', 'delete'), async (c) => {
    await s(c).complaints.removeRecipient(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Complaints ─────────────────────────────────────────────────────
  const listQuery = z.object({
    ...paging,
    sort: z.string().max(30).optional(),
    status: z.enum(CP_STATUSES).optional(),
    priority: z.enum(CP_PRIORITIES).optional(),
    category: z.enum(CP_CATEGORIES).optional(),
    material: z.enum(CP_MATERIALS).optional(),
    customerName: text,
    salesman: text,
    open: z.enum(['true', 'false']).transform((x) => x === 'true').optional(),
    from: date,
    to: date,
  });
  r.get('/complaints', policy.anyPage(READ), async (c) => {
    const { q, sort, page, pageSize, ...filters } = parseQuery(c, listQuery);
    const res = await s(c).complaints.list({ q, sort, page, pageSize, filters });
    return c.json({ rows: res.rows.map((x: Complaint) => view(c, x)), total: res.total });
  });
  r.get('/complaints/:id', policy.anyPage(READ), async (c) => c.json(view(c, await s(c).complaints.get(idParam(c)))));
  r.get('/complaints/:id/print', policy.page('complaints_register', 'print'), async (c) => c.json(await s(c).complaintReports.print(actor(c), idParam(c))));
  r.post('/complaints', policy.page('complaints_register', 'edit'), async (c) => c.json(view(c, await s(c).complaints.create(actor(c), await parseJson(c, v.complaintCreateBody))), 201));
  r.patch('/complaints/:id', policy.page('complaints_register', 'edit'), async (c) => c.json(view(c, await s(c).complaints.update(actor(c), idParam(c), await parseJson(c, v.complaintUpdateBody)))));
  r.post('/complaints/:id/status', policy.page('complaints_register', 'edit'), async (c) => {
    const b = await parseJson(c, v.statusBody);
    return c.json(view(c, await s(c).complaints.setStatus(actor(c), idParam(c), b.status, b.note)));
  });
  // multipart/form-data: file (repeatable).
  r.post('/complaints/:id/photos', policy.page('complaints_register', 'edit'), async (c) => c.json(view(c, await s(c).complaints.addPhotos(actor(c), idParam(c), (await uploads(c)).files))));
  r.delete('/complaints/:id/photos/:fileId', policy.page('complaints_register', 'edit'), async (c) => c.json(view(c, await s(c).complaints.removePhoto(actor(c), idParam(c), c.req.param('fileId')))));
  // multipart/form-data: text, file (repeatable photos / videos).
  r.post('/complaints/:id/comments', policy.page('complaints_register', 'edit'), async (c) => {
    const { files, fields } = await uploads(c);
    const t = fields['text'];
    return c.json(view(c, await s(c).complaints.comment(actor(c), idParam(c), String((Array.isArray(t) ? t[0] : t) ?? '').slice(0, 4000), files)));
  });
  r.get('/complaints/:id/files/:fileId', policy.anyPage(READ), async (c) => {
    const { file, blob } = await s(c).complaints.file(idParam(c), c.req.param('fileId'));
    return c.body(blob.bytes as Uint8Array<ArrayBuffer>, 200, {
      'Content-Type': blob.mime,
      'Content-Disposition': `inline; filename="${file.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    });
  });
  r.delete('/complaints/:id', policy.page('complaints_register', 'delete'), async (c) => {
    await s(c).complaints.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Dashboard, reports, export, audit ──────────────────────────────
  r.get('/dashboard', policy.page('complaints_dashboard'), async (c) => c.json(await s(c).complaintReports.dashboard()));
  r.get('/reports', policy.page('complaints_reports'), async (c) => c.json(await s(c).complaintReports.reports(parseQuery(c, reportQuery))));
  r.get('/export', policy.anyPage(['complaints_register', 'complaints_reports'], 'export'), async (c) => xlsxResponse(c, await s(c).complaintReports.exportXlsx(actor(c), parseQuery(c, reportQuery)), 'Complaints', s(c).clock()));
  r.get('/audit', policy.page('complaints_dashboard'), async (c) => {
    const q = parseQuery(c, z.object({ ...paging }));
    return c.json(await s(c).activity.list({ q: q.q, page: q.page, pageSize: q.pageSize ?? 50, filters: { entityPrefix: 'complaint' } }));
  });

  return r;
}
