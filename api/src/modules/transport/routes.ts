import type { Context } from 'hono';
import { z } from 'zod';
import { INQUIRY_STATUSES, ORDER_STATUSES, RC_STATUSES } from '../../contracts/transport';
import { policy, requireAuthContext } from '../../auth/guards';
import { SecureRouter } from '../../auth/secure-router';
import type { PageKey } from '../../domain/access';
import { isIsoDate } from '../../lib/dates';
import { validationFailed } from '../../lib/errors';
import { MAX_UPLOAD_BYTES, xlsxResponse } from '../../lib/spreadsheet';
import { paging, parseJson, parseQuery } from '../../lib/validate';
import { actorOf, type Actor } from '../sampletrack/actor';
import { idParam } from '../sampletrack/routes/params';
import * as v from './validation';

const actor = (c: Context): Actor => actorOf(requireAuthContext(c as never).user);
const date = z.string().refine(isIsoDate, 'Use a date like 2026-04-01').optional();
const text = z.string().trim().max(120).optional();
const sort = z.string().max(30).optional();
const range = z.object({ from: date, to: date });

function toListQuery<T extends { q?: string; sort?: string; page?: number; pageSize?: number }>(parsed: T) {
  const { q, sort, page, pageSize, ...filters } = parsed;
  return { q, sort, page, pageSize, filters };
}

const ALL: PageKey[] = ['transport_dashboard', 'transport_freight', 'transport_masters', 'transport_reports'];
const FLOW: PageKey[] = ['transport_freight', 'transport_dashboard', 'transport_reports'];

/** Transport module endpoints, mounted at /api/transport. Fixed paths are registered before /:id. */
export function transportRoutes(): SecureRouter {
  const r = new SecureRouter();
  const s = (c: Context) => c.var.services;
  const noContent = (fn: (c: Context) => Promise<void>) => async (c: Context) => {
    await fn(c);
    return c.body(null, 204);
  };

  r.get('/meta', policy.anyPage(ALL), async (c) => c.json(await s(c).transportReports.meta()));

  // ── Vehicle types ──────────────────────────────────────────────────
  r.get('/vehicles', policy.anyPage(ALL), async (c) => c.json(await s(c).transportMasters.vehicles()));
  r.post('/vehicles', policy.page('transport_masters', 'edit'), async (c) => c.json(await s(c).transportMasters.saveVehicle(actor(c), null, await parseJson(c, v.vehicleCreateBody)), 201));
  r.patch('/vehicles/:id', policy.page('transport_masters', 'edit'), async (c) => c.json(await s(c).transportMasters.saveVehicle(actor(c), idParam(c), await parseJson(c, v.vehicleUpdateBody))));
  r.delete('/vehicles/:id', policy.page('transport_masters', 'delete'), noContent((c) => s(c).transportMasters.removeVehicle(actor(c), idParam(c))));

  // ── Transporters ───────────────────────────────────────────────────
  const tpQuery = z.object({ ...paging, sort, state: text, vehicle: text, operatesIn: text, active: z.enum(['true', 'false']).transform((x) => x === 'true').optional() });
  r.get('/transporters', policy.anyPage(['transport_masters', 'transport_freight']), async (c) => c.json(await s(c).transportMasters.listTransporters(toListQuery(parseQuery(c, tpQuery)))));
  r.post('/transporters/import', policy.page('transport_masters', 'edit'), async (c) => {
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const file = form['file'];
    if (!(file instanceof File)) throw validationFailed('Attach the spreadsheet as a "file" form field');
    if (file.size === 0) throw validationFailed('The file is empty');
    if (file.size > MAX_UPLOAD_BYTES) throw validationFailed(`File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw validationFailed('Upload an .xlsx, .xls or .csv file');
    return c.json(await s(c).transportMasters.importTransporters(actor(c), new Uint8Array(await file.arrayBuffer()), c.req.query('commit') === 'true'));
  });
  r.get('/transporters/:id', policy.anyPage(['transport_masters', 'transport_freight']), async (c) => c.json(await s(c).transportMasters.getTransporter(idParam(c))));
  r.post('/transporters', policy.page('transport_masters', 'edit'), async (c) => c.json(await s(c).transportMasters.createTransporter(actor(c), await parseJson(c, v.transporterCreateBody)), 201));
  r.patch('/transporters/:id', policy.page('transport_masters', 'edit'), async (c) => c.json(await s(c).transportMasters.updateTransporter(actor(c), idParam(c), await parseJson(c, v.transporterUpdateBody))));
  r.delete('/transporters/:id', policy.page('transport_masters', 'delete'), noContent((c) => s(c).transportMasters.removeTransporter(actor(c), idParam(c))));

  // ── Inquiries ──────────────────────────────────────────────────────
  const inqQuery = z.object({ ...paging, sort, status: z.enum(INQUIRY_STATUSES).optional(), vehicle: text, from: date, to: date });
  r.get('/inquiries', policy.anyPage(FLOW), async (c) => c.json(await s(c).freight.listInquiries(toListQuery(parseQuery(c, inqQuery)))));
  r.get('/inquiries/:id', policy.anyPage(FLOW), async (c) => c.json(await s(c).freight.getInquiry(idParam(c))));
  r.get('/inquiries/:id/past-quotes', policy.page('transport_freight'), async (c) => c.json(await s(c).freight.pastQuotes(idParam(c))));
  r.post('/inquiries', policy.page('transport_freight', 'edit'), async (c) => c.json(await s(c).freight.createInquiry(actor(c), await parseJson(c, v.inquiryCreateBody)), 201));
  r.patch('/inquiries/:id', policy.page('transport_freight', 'edit'), async (c) => c.json(await s(c).freight.updateInquiry(actor(c), idParam(c), await parseJson(c, v.inquiryUpdateBody))));
  r.post('/inquiries/:id/cancel', policy.page('transport_freight', 'edit'), async (c) => c.json(await s(c).freight.setInquiryCancelled(actor(c), idParam(c), true)));
  r.post('/inquiries/:id/reopen', policy.page('transport_freight', 'edit'), async (c) => c.json(await s(c).freight.setInquiryCancelled(actor(c), idParam(c), false)));
  /** Save (create or update) the inquiry's rate comparison as a draft. */
  r.put('/inquiries/:id/rates', policy.page('transport_freight', 'edit'), async (c) => c.json(await s(c).freight.saveRc(actor(c), idParam(c), await parseJson(c, v.rcSaveBody))));

  // ── Rate comparisons and approval ──────────────────────────────────
  const rcQuery = z.object({ ...paging, sort, status: z.enum(RC_STATUSES).optional(), inquiryId: text });
  r.get('/rates', policy.anyPage(FLOW), async (c) => c.json(await s(c).freight.listRcs(toListQuery(parseQuery(c, rcQuery)))));
  r.get('/rates/:id', policy.anyPage(FLOW), async (c) => c.json(await s(c).freight.getRc(idParam(c))));
  r.post('/rates/:id/submit', policy.page('transport_freight', 'edit'), async (c) => c.json(await s(c).freight.submitRc(actor(c), idParam(c))));
  r.post('/rates/:id/decision', policy.page('transport_freight', 'transport_approve'), async (c) => {
    const b = await parseJson(c, v.decisionBody);
    return c.json(await s(c).freight.decideRc(actor(c), idParam(c), b.decision, b.note));
  });
  r.post('/rates/:id/order', policy.page('transport_freight', 'edit'), async (c) => c.json(await s(c).freight.createOrder(actor(c), idParam(c)), 201));

  // ── Order forms ────────────────────────────────────────────────────
  const orderQuery = z.object({ ...paging, sort, status: z.enum(ORDER_STATUSES).optional(), transporterId: text, from: date, to: date });
  r.get('/orders', policy.anyPage(FLOW), async (c) => c.json(await s(c).freight.listOrders(toListQuery(parseQuery(c, orderQuery)))));
  r.get('/orders/:id', policy.anyPage(FLOW), async (c) => c.json(await s(c).freight.getOrder(idParam(c))));
  r.get('/orders/:id/print', policy.page('transport_freight', 'print'), async (c) => c.json(await s(c).transportReports.orderPrint(actor(c), idParam(c))));
  r.patch('/orders/:id', policy.page('transport_freight', 'edit'), async (c) => c.json(await s(c).freight.updateOrder(actor(c), idParam(c), await parseJson(c, v.orderUpdateBody))));

  // ── Dashboard, reports, exports, audit ─────────────────────────────
  r.get('/dashboard', policy.page('transport_dashboard'), async (c) => c.json(await s(c).transportReports.dashboard()));
  r.get('/reports', policy.page('transport_reports'), async (c) => c.json(await s(c).transportReports.reports(parseQuery(c, range))));
  r.get('/export/transporters', policy.page('transport_masters', 'export'), async (c) => xlsxResponse(c, await s(c).transportReports.exportXlsx(actor(c), 'transporters', {}), 'Transporters', s(c).clock()));
  r.get('/export/inquiries', policy.anyPage(['transport_freight', 'transport_reports'], 'export'), async (c) => xlsxResponse(c, await s(c).transportReports.exportXlsx(actor(c), 'inquiries', parseQuery(c, range)), 'Transport-inquiries', s(c).clock()));
  r.get('/export/orders', policy.anyPage(['transport_freight', 'transport_reports'], 'export'), async (c) => xlsxResponse(c, await s(c).transportReports.exportXlsx(actor(c), 'orders', parseQuery(c, range)), 'Transport-orders', s(c).clock()));
  r.get('/audit', policy.page('transport_dashboard'), async (c) => {
    const q = parseQuery(c, z.object({ ...paging }));
    return c.json(await s(c).activity.list({ q: q.q, page: q.page, pageSize: q.pageSize ?? 50, filters: { entityPrefix: 'transport_' } }));
  });

  return r;
}
