import type { Context } from 'hono';
import { z } from 'zod';
import { MT_CATEGORIES, MT_PRIORITIES, MT_STATUSES } from '../../contracts/maintenance';
import { policy, requireAuthContext } from '../../auth/guards';
import { SecureRouter } from '../../auth/secure-router';
import type { PageKey } from '../../domain/access';
import { isIsoDate } from '../../lib/dates';
import { xlsxResponse } from '../../lib/spreadsheet';
import { paging, parseJson, parseQuery } from '../../lib/validate';
import { actorOf, type Actor } from '../sampletrack/actor';
import { idParam } from '../sampletrack/routes/params';
import * as v from './validation';

const actor = (c: Context): Actor => actorOf(requireAuthContext(c as never).user);
const date = z.string().refine(isIsoDate, 'Use a date like 2026-04-01').optional();
const text = z.string().trim().max(120).optional();
const range = z.object({ from: date, to: date });

const ALL: PageKey[] = ['maintenance_dashboard', 'maintenance_orders', 'maintenance_masters', 'maintenance_reports'];
const READ: PageKey[] = ['maintenance_orders', 'maintenance_dashboard', 'maintenance_reports'];

/** Maintenance module endpoints, mounted at /api/maintenance. */
export function maintenanceRoutes(): SecureRouter {
  const r = new SecureRouter();
  const s = (c: Context) => c.var.services;

  r.get('/meta', policy.anyPage(ALL), async (c) => c.json(await s(c).maintenanceReports.meta()));

  // ── Plant areas ────────────────────────────────────────────────────
  r.get('/areas', policy.anyPage(ALL), async (c) => c.json(await s(c).workOrders.areas()));
  r.post('/areas', policy.page('maintenance_masters', 'edit'), async (c) => c.json(await s(c).workOrders.saveArea(actor(c), null, await parseJson(c, v.areaCreateBody)), 201));
  r.patch('/areas/:id', policy.page('maintenance_masters', 'edit'), async (c) => c.json(await s(c).workOrders.saveArea(actor(c), idParam(c), await parseJson(c, v.areaUpdateBody))));
  r.delete('/areas/:id', policy.page('maintenance_masters', 'delete'), async (c) => {
    await s(c).workOrders.removeArea(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Assignees ("Assigned to" master): anyone raising work orders may add a name ──
  r.get('/assignees', policy.anyPage(ALL), async (c) => c.json(await s(c).workOrders.assignees()));
  r.post('/assignees', policy.anyPage(['maintenance_masters', 'maintenance_orders'], 'edit'), async (c) => c.json(await s(c).workOrders.saveAssignee(actor(c), null, await parseJson(c, v.assigneeCreateBody)), 201));
  r.patch('/assignees/:id', policy.page('maintenance_masters', 'edit'), async (c) => c.json(await s(c).workOrders.saveAssignee(actor(c), idParam(c), await parseJson(c, v.assigneeUpdateBody))));
  r.delete('/assignees/:id', policy.page('maintenance_masters', 'delete'), async (c) => {
    await s(c).workOrders.removeAssignee(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Work orders ────────────────────────────────────────────────────
  const listQuery = z.object({
    ...paging,
    sort: z.string().max(30).optional(),
    status: z.enum(MT_STATUSES).optional(),
    priority: z.enum(MT_PRIORITIES).optional(),
    category: z.enum(MT_CATEGORIES).optional(),
    area: text,
    assignee: text,
    overdue: z.enum(['true', 'false']).transform((x) => x === 'true').optional(),
    from: date,
    to: date,
  });
  r.get('/work-orders', policy.anyPage(READ), async (c) => {
    const { q, sort, page, pageSize, ...filters } = parseQuery(c, listQuery);
    return c.json(await s(c).workOrders.list({ q, sort, page, pageSize, filters }));
  });
  r.get('/work-orders/:id', policy.anyPage(READ), async (c) => c.json(await s(c).workOrders.get(idParam(c))));
  r.get('/work-orders/:id/print', policy.page('maintenance_orders', 'print'), async (c) => c.json(await s(c).maintenanceReports.print(actor(c), idParam(c))));
  r.post('/work-orders', policy.page('maintenance_orders', 'edit'), async (c) => c.json(await s(c).workOrders.create(actor(c), await parseJson(c, v.workOrderCreateBody)), 201));
  r.patch('/work-orders/:id', policy.page('maintenance_orders', 'edit'), async (c) => c.json(await s(c).workOrders.update(actor(c), idParam(c), await parseJson(c, v.workOrderUpdateBody))));
  r.post('/work-orders/:id/status', policy.page('maintenance_orders', 'edit'), async (c) => {
    const b = await parseJson(c, v.statusBody);
    return c.json(await s(c).workOrders.setStatus(actor(c), idParam(c), b.status, b.note));
  });
  r.post('/work-orders/:id/notes', policy.page('maintenance_orders', 'edit'), async (c) => c.json(await s(c).workOrders.addNote(actor(c), idParam(c), (await parseJson(c, v.noteBody)).text)));
  // multipart/form-data: file (repeatable photos).
  r.post('/work-orders/:id/photos', policy.page('maintenance_orders', 'edit'), async (c) => {
    const form = await c.req.parseBody({ all: true }).catch(() => ({}) as Record<string, unknown>);
    const raw = form['file'];
    const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((f): f is File => f instanceof File);
    const files = await Promise.all(list.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    return c.json(await s(c).workOrders.addPhotos(actor(c), idParam(c), files));
  });
  r.delete('/work-orders/:id/photos/:photoId', policy.page('maintenance_orders', 'edit'), async (c) => c.json(await s(c).workOrders.removePhoto(actor(c), idParam(c), c.req.param('photoId'))));
  r.get('/work-orders/:id/photos/:photoId', policy.anyPage(READ), async (c) => {
    const { photo, blob } = await s(c).workOrders.photoFile(idParam(c), c.req.param('photoId'));
    return c.body(blob.bytes as Uint8Array<ArrayBuffer>, 200, {
      'Content-Type': blob.mime,
      'Content-Disposition': `inline; filename="${photo.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    });
  });
  r.delete('/work-orders/:id', policy.page('maintenance_orders', 'delete'), async (c) => {
    await s(c).workOrders.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Dashboard, reports, export, audit ──────────────────────────────
  r.get('/dashboard', policy.page('maintenance_dashboard'), async (c) => c.json(await s(c).maintenanceReports.dashboard()));
  r.get('/reports', policy.page('maintenance_reports'), async (c) => c.json(await s(c).maintenanceReports.reports(parseQuery(c, range))));
  r.get('/export/work-orders', policy.anyPage(['maintenance_orders', 'maintenance_reports'], 'export'), async (c) => xlsxResponse(c, await s(c).maintenanceReports.exportXlsx(actor(c), parseQuery(c, range)), 'Work-orders', s(c).clock()));
  r.get('/audit', policy.page('maintenance_dashboard'), async (c) => {
    const q = parseQuery(c, z.object({ ...paging }));
    return c.json(await s(c).activity.list({ q: q.q, page: q.page, pageSize: q.pageSize ?? 50, filters: { entityPrefix: 'maintenance_' } }));
  });

  return r;
}
