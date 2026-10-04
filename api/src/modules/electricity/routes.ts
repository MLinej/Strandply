import type { Context } from 'hono';
import { z } from 'zod';
import { SHIFTS } from '../../contracts/electricity';
import { policy, requireAuthContext } from '../../auth/guards';
import { SecureRouter } from '../../auth/secure-router';
import type { PageKey } from '../../domain/access';
import { isIsoDate } from '../../lib/dates';
import { validationFailed } from '../../lib/errors';
import { xlsxResponse } from '../../lib/spreadsheet';
import { paging, parseJson, parseQuery } from '../../lib/validate';
import { actorOf, type Actor } from '../sampletrack/actor';
import { idParam } from '../sampletrack/routes/params';
import { MAX_INVOICE_BYTES } from './electricity-service';
import * as v from './validation';

const actor = (c: Context): Actor => actorOf(requireAuthContext(c as never).user);
const date = z.string().refine(isIsoDate, 'Use a date like 2026-04-01').optional();
const range = z.object({ from: date, to: date });

const ALL: PageKey[] = ['electricity_dashboard', 'electricity_readings', 'electricity_reports', 'electricity_bills', 'electricity_settings'];
const COSTS: PageKey[] = ['electricity_readings', 'electricity_reports', 'electricity_dashboard'];

/** Electricity module endpoints, mounted at /api/electricity. */
export function electricityRoutes(): SecureRouter {
  const r = new SecureRouter();
  const s = (c: Context) => c.var.services;

  r.get('/meta', policy.anyPage(ALL), async (c) => c.json(await s(c).electricityReports.meta()));

  // ── Meter and rate histories ───────────────────────────────────────
  r.get('/settings', policy.anyPage(ALL), async (c) => c.json({ meter: await s(c).electricity.meter(), rates: await s(c).electricity.rates() }));
  r.patch('/settings/meter', policy.page('electricity_settings', 'edit'), async (c) => c.json(await s(c).electricity.saveMeter(actor(c), await parseJson(c, v.meterBody))));
  r.post('/rates', policy.page('electricity_settings', 'edit'), async (c) => c.json(await s(c).electricity.addRate(actor(c), await parseJson(c, v.rateBody)), 201));
  r.delete('/rates/:id', policy.page('electricity_settings', 'delete'), async (c) => {
    await s(c).electricity.removeRate(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Readings ───────────────────────────────────────────────────────
  const readingQuery = z.object({ ...paging, sort: z.string().max(20).optional(), shift: z.enum(SHIFTS).optional(), from: date, to: date });
  r.get('/readings', policy.anyPage(COSTS), async (c) => {
    const { q, sort, page, pageSize, ...filters } = parseQuery(c, readingQuery);
    return c.json(await s(c).electricityReports.readingViews({ q, sort, page, pageSize, filters }));
  });
  r.get('/readings/preview', policy.page('electricity_readings'), async (c) => c.json(await s(c).electricityReports.preview(parseQuery(c, v.previewQuery))));
  r.post('/readings', policy.page('electricity_readings', 'edit'), async (c) => c.json(await s(c).electricity.addReading(actor(c), await parseJson(c, v.readingBody)), 201));
  r.delete('/readings/:id', policy.page('electricity_readings', 'delete'), async (c) => {
    await s(c).electricity.removeReading(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Views ──────────────────────────────────────────────────────────
  r.get('/daily', policy.anyPage(['electricity_reports', 'electricity_dashboard']), async (c) => c.json(await s(c).electricityReports.daily(parseQuery(c, range))));
  r.get('/dashboard', policy.page('electricity_dashboard'), async (c) => c.json(await s(c).electricityReports.dashboard(parseQuery(c, range))));

  // ── PGVCL bills ────────────────────────────────────────────────────
  r.get('/bills', policy.page('electricity_bills'), async (c) => c.json(await s(c).electricityReports.bills(parseQuery(c, range))));
  r.get('/bills/:id', policy.page('electricity_bills'), async (c) => c.json(await s(c).electricityReports.bill(idParam(c))));
  r.post('/bills', policy.page('electricity_bills', 'edit'), async (c) => c.json(await s(c).electricity.createBill(actor(c), await parseJson(c, v.billCreateBody)), 201));
  r.patch('/bills/:id', policy.page('electricity_bills', 'edit'), async (c) => c.json(await s(c).electricity.updateBill(actor(c), idParam(c), await parseJson(c, v.billUpdateBody))));
  r.delete('/bills/:id', policy.page('electricity_bills', 'delete'), async (c) => {
    await s(c).electricity.removeBill(actor(c), idParam(c));
    return c.body(null, 204);
  });
  // multipart/form-data: file (PDF).
  r.post('/bills/:id/invoice', policy.page('electricity_bills', 'edit'), async (c) => {
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const file = form['file'];
    if (!(file instanceof File)) throw validationFailed('Attach the invoice as a "file" form field');
    if (file.size > MAX_INVOICE_BYTES) throw validationFailed('The PDF can be up to 10 MB');
    return c.json(await s(c).electricity.attachInvoice(actor(c), idParam(c), { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }));
  });
  r.get('/bills/:id/invoice', policy.page('electricity_bills'), async (c) => {
    const { bill, blob } = await s(c).electricity.invoice(idParam(c));
    const name = bill.invoice!.name;
    return c.body(blob.bytes as Uint8Array<ArrayBuffer>, 200, {
      'Content-Type': blob.mime,
      'Content-Disposition': `inline; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
  });
  r.delete('/bills/:id/invoice', policy.page('electricity_bills', 'edit'), async (c) => c.json(await s(c).electricity.removeInvoice(actor(c), idParam(c))));

  // ── Exports, audit ─────────────────────────────────────────────────
  r.get('/export/readings', policy.anyPage(COSTS, 'export'), async (c) => xlsxResponse(c, await s(c).electricityReports.exportXlsx(actor(c), 'readings', parseQuery(c, range)), 'Meter-readings', s(c).clock()));
  r.get('/export/daily', policy.anyPage(['electricity_reports', 'electricity_dashboard'], 'export'), async (c) => xlsxResponse(c, await s(c).electricityReports.exportXlsx(actor(c), 'daily', parseQuery(c, range)), 'Electricity-daily', s(c).clock()));
  r.get('/export/bills', policy.page('electricity_bills', 'export'), async (c) => xlsxResponse(c, await s(c).electricityReports.exportXlsx(actor(c), 'bills', parseQuery(c, range)), 'PGVCL-bills', s(c).clock()));
  r.get('/audit', policy.page('electricity_dashboard'), async (c) => {
    const q = parseQuery(c, z.object({ ...paging }));
    return c.json(await s(c).activity.list({ q: q.q, page: q.page, pageSize: q.pageSize ?? 50, filters: { entityPrefix: 'electricity_' } }));
  });

  return r;
}
