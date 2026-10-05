import type { Context } from 'hono';
import { z } from 'zod';
import { MATERIAL_IDS } from '../../contracts/purchase';
import { policy, requireAuthContext } from '../../auth/guards';
import { SecureRouter } from '../../auth/secure-router';
import type { PageKey } from '../../domain/access';
import { isIsoDate } from '../../lib/dates';
import { validationFailed } from '../../lib/errors';
import { xlsxResponse } from '../../lib/spreadsheet';
import { parseQuery } from '../../lib/validate';
import { actorOf, type Actor } from '../sampletrack/actor';

const actor = (c: Context): Actor => actorOf(requireAuthContext(c as never).user);
const date = z.string().refine(isIsoDate, 'Use a date like 2026-04-01').optional();
const fy = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Use a year like 2026-27')
  .optional();
const rangeQuery = z.object({ from: date, to: date, fy });

const ALL: PageKey[] = ['hub_dashboard', 'hub_modules', 'hub_periodic', 'hub_sources'];

/** Reports Hub endpoints, mounted at /api/hub. Every view is read-only; ranges default to the current FY to date. */
export function hubRoutes(): SecureRouter {
  const r = new SecureRouter();
  const s = (c: Context) => c.var.services.hub;
  /** from / to, or a financial year; from must not be after to. */
  const range = (c: Context, extra: z.ZodRawShape = {}) => {
    const q = parseQuery(c, rangeQuery.extend(extra)) as { from?: string; to?: string; fy?: string } & Record<string, unknown>;
    const rg = q.fy ? s(c).fyRange(q.fy) : s(c).range(q.from, q.to);
    if (rg.from > rg.to) throw validationFailed('Invalid input', [{ path: 'from', message: 'From is after to' }]);
    return { rg, q };
  };

  r.get('/years', policy.anyPage(ALL), async (c) => c.json(await s(c).years()));
  r.get('/overview', policy.page('hub_dashboard'), async (c) => c.json(await s(c).overview(range(c).rg)));

  // ── Module reports ─────────────────────────────────────────────────
  r.get('/purchase', policy.page('hub_modules'), async (c) => {
    const { rg, q } = range(c, { material: z.enum(MATERIAL_IDS).optional() });
    return c.json(await s(c).purchase(rg, q.material as string | undefined));
  });
  r.get('/production', policy.page('hub_modules'), async (c) => c.json(await s(c).production(range(c).rg)));
  r.get('/stock', policy.page('hub_modules'), async (c) => c.json(await s(c).stockView(parseQuery(c, z.object({ fy })).fy)));
  r.get('/electricity', policy.page('hub_modules'), async (c) => c.json(await s(c).power(range(c).rg)));
  r.get('/sales', policy.page('hub_modules'), async (c) => {
    const { rg, q } = range(c, { firm: z.enum(['llp', 'osb']).optional() });
    return c.json(await s(c).sales(rg, q.firm as string | undefined));
  });
  r.get('/maintenance', policy.page('hub_modules'), async (c) => c.json(await s(c).maintenance(range(c).rg)));
  r.get('/analytics', policy.page('hub_modules'), async (c) => c.json(await s(c).analytics(range(c).rg)));

  // ── Daily / monthly / FY ───────────────────────────────────────────
  r.get('/period', policy.page('hub_periodic'), async (c) => c.json(await s(c).period(range(c).rg)));
  r.get('/export', policy.anyPage(['hub_periodic', 'hub_dashboard'], 'export'), async (c) => {
    const { rg } = range(c);
    return xlsxResponse(c, await s(c).exportXlsx(actor(c), rg), `Strandply-report-${rg.from}-to-${rg.to}`, c.var.services.clock());
  });
  r.get('/sources', policy.page('hub_sources'), async (c) => c.json(await s(c).sources()));

  return r;
}
