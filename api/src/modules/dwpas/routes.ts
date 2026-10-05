import type { Context } from 'hono';
import { z } from 'zod';
import { PLAN_STATUSES } from '../../contracts/dwpas';
import { policy, requireAuthContext } from '../../auth/guards';
import { SecureRouter } from '../../auth/secure-router';
import type { PageKey } from '../../domain/access';
import { isIsoDate } from '../../lib/dates';
import { notFound } from '../../lib/errors';
import { xlsxResponse } from '../../lib/spreadsheet';
import { paging, parseJson, parseQuery } from '../../lib/validate';
import { actorOf, type Actor } from '../sampletrack/actor';
import { idParam } from '../sampletrack/routes/params';
import * as v from './validation';

const actor = (c: Context): Actor => actorOf(requireAuthContext(c as never).user);
const date = z.string().refine(isIsoDate, 'Use a date like 2026-04-01').optional();
const range = z.object({ from: date, to: date, department: z.string().trim().max(80).optional() });

const ALL: PageKey[] = ['dwpas_dashboard', 'dwpas_plans', 'dwpas_reports', 'dwpas_masters'];
const READ: PageKey[] = ['dwpas_plans', 'dwpas_dashboard', 'dwpas_reports'];

/** DWPAS endpoints, mounted at /api/dwpas. */
export function dwpasRoutes(): SecureRouter {
  const r = new SecureRouter();
  const s = (c: Context) => c.var.services;

  r.get('/meta', policy.anyPage(ALL), async (c) => c.json(await s(c).dwpasReports.meta()));

  // ── Masters ────────────────────────────────────────────────────────
  r.get('/departments', policy.anyPage(ALL), async (c) => c.json(await s(c).dwpas.departments()));
  r.post('/departments', policy.page('dwpas_masters', 'edit'), async (c) => c.json(await s(c).dwpas.saveDepartment(actor(c), null, await parseJson(c, v.departmentCreateBody)), 201));
  r.patch('/departments/:id', policy.page('dwpas_masters', 'edit'), async (c) => c.json(await s(c).dwpas.saveDepartment(actor(c), idParam(c), await parseJson(c, v.departmentUpdateBody))));
  r.delete('/departments/:id', policy.page('dwpas_masters', 'delete'), async (c) => {
    await s(c).dwpas.removeDepartment(actor(c), idParam(c));
    return c.body(null, 204);
  });
  r.get('/employees', policy.anyPage(ALL), async (c) => c.json(await s(c).dwpas.employees()));
  r.post('/employees', policy.page('dwpas_masters', 'edit'), async (c) => c.json(await s(c).dwpas.saveEmployee(actor(c), null, await parseJson(c, v.employeeCreateBody)), 201));
  r.patch('/employees/:id', policy.page('dwpas_masters', 'edit'), async (c) => c.json(await s(c).dwpas.saveEmployee(actor(c), idParam(c), await parseJson(c, v.employeeUpdateBody))));
  r.delete('/employees/:id', policy.page('dwpas_masters', 'delete'), async (c) => {
    await s(c).dwpas.removeEmployee(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Plans ──────────────────────────────────────────────────────────
  const listQuery = z.object({ ...paging, status: z.enum(PLAN_STATUSES).optional(), from: date, to: date });
  r.get('/plans', policy.anyPage(READ), async (c) => {
    const { q, page, pageSize, ...filters } = parseQuery(c, listQuery);
    return c.json(await s(c).dwpas.list({ q, page, pageSize, filters }));
  });
  /** The plan for a date ("check date" in legacy): 404 when there is none. */
  r.get('/plans/by-date/:date', policy.anyPage(READ), async (c) => {
    const d = c.req.param('date') ?? '';
    const p = isIsoDate(d) ? await s(c).dwpas.byDate(d) : null;
    if (!p) throw notFound('Plan');
    return c.json(p);
  });
  r.get('/plans/:id/print', policy.page('dwpas_plans', 'print'), async (c) => {
    const kind = parseQuery(c, z.object({ kind: z.enum(['plan', 'achievement', 'manpower']).default('plan') })).kind;
    return c.json(await s(c).dwpasReports.print(actor(c), idParam(c), kind));
  });
  /** Create or replace the plan for its date. */
  r.put('/plans', policy.page('dwpas_plans', 'edit'), async (c) => c.json(await s(c).dwpas.save(actor(c), await parseJson(c, v.planBody))));
  r.post('/plans/:id/submit', policy.page('dwpas_plans', 'edit'), async (c) => c.json(await s(c).dwpas.submit(actor(c), idParam(c))));
  r.post('/plans/:id/approve', policy.page('dwpas_plans', 'dwpas_approve'), async (c) => c.json(await s(c).dwpas.decide(actor(c), idParam(c), true, (await parseJson(c, v.decisionBody)).note)));
  r.post('/plans/:id/reopen', policy.page('dwpas_plans', 'dwpas_approve'), async (c) => c.json(await s(c).dwpas.decide(actor(c), idParam(c), false, (await parseJson(c, v.decisionBody)).note)));
  r.put('/plans/:id/achievement', policy.page('dwpas_plans', 'edit'), async (c) => c.json(await s(c).dwpas.achievement(actor(c), idParam(c), await parseJson(c, v.achievementBody))));
  r.delete('/plans/:id', policy.page('dwpas_plans', 'delete'), async (c) => {
    await s(c).dwpas.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Dashboard, reports, export, audit ──────────────────────────────
  r.get('/dashboard', policy.page('dwpas_dashboard'), async (c) => c.json(await s(c).dwpasReports.day(parseQuery(c, z.object({ date })).date)));
  r.get('/manpower', policy.anyPage(['dwpas_reports', 'dwpas_dashboard']), async (c) => c.json(await s(c).dwpasReports.manpower(parseQuery(c, z.object({ date })).date)));
  r.get('/variance', policy.page('dwpas_reports'), async (c) => c.json(await s(c).dwpasReports.variance(parseQuery(c, range))));
  r.get('/export', policy.anyPage(['dwpas_plans', 'dwpas_reports'], 'export'), async (c) => xlsxResponse(c, await s(c).dwpasReports.exportXlsx(actor(c), parseQuery(c, range)), 'Work-plans', s(c).clock()));
  r.get('/audit', policy.page('dwpas_dashboard'), async (c) => {
    const q = parseQuery(c, z.object({ ...paging }));
    return c.json(await s(c).activity.list({ q: q.q, page: q.page, pageSize: q.pageSize ?? 50, filters: { entityPrefix: 'dwpas_' } }));
  });

  return r;
}
