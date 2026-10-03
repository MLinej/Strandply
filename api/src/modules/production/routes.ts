import type { Context } from 'hono';
import { z } from 'zod';
import { DOC_KIND_IDS, WF_STATES, type DocKind } from '../../contracts/production';
import { isFy } from '../../contracts/purchase';
import { policy, requireAuthContext } from '../../auth/guards';
import { SecureRouter } from '../../auth/secure-router';
import type { PageKey } from '../../domain/access';
import { isIsoDate } from '../../lib/dates';
import { validationFailed } from '../../lib/errors';
import { xlsxResponse } from '../../lib/spreadsheet';
import { paging, parseJson, parseQuery } from '../../lib/validate';
import { actorOf, type Actor } from '../sampletrack/actor';
import { idParam } from '../sampletrack/routes/params';
import {
  chippingCreateBody,
  chippingUpdateBody,
  cuttingCreateBody,
  cuttingUpdateBody,
  hotpressCreateBody,
  hotpressUpdateBody,
  mattCreateBody,
  mattUpdateBody,
  mdoCreateBody,
  mdoUpdateBody,
  planCreateBody,
  planUpdateBody,
  resinCreateBody,
  resinUpdateBody,
  settingsBody,
  summaryCreateBody,
  summaryUpdateBody,
  weightBody,
  wipAdjustBody,
} from './validation';

const actor = (c: Context): Actor => actorOf(requireAuthContext(c as never).user);
const date = z.string().refine(isIsoDate, 'Use a date like 2026-04-01').optional();
const fy = z.string().refine(isFy, 'Use a financial year like 2026-27').optional();
const range = z.object({ from: date, to: date, fy });
const docQuery = z.object({ ...paging, sort: z.string().max(30).optional(), from: date, to: date, fy, wfState: z.enum(WF_STATES).optional() });
const note = z.object({ note: z.string().trim().max(500).nullish().transform((v) => v || null) });

/** The note is optional, and so is the body that carries it. */
async function noteOf(c: Context) {
  const raw = await c.req.text();
  let body: unknown = {};
  try {
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    throw validationFailed('Request body must be JSON');
  }
  const r = note.safeParse(body);
  if (!r.success) throw validationFailed('Invalid note');
  return r.data.note;
}

function toListQuery<T extends { q?: string; sort?: string; page?: number; pageSize?: number }>(parsed: T) {
  const { q, sort, page, pageSize, ...filters } = parsed;
  return { q, sort, page, pageSize, filters };
}

/** URL segment, page that guards it, and body schemas, per document kind. */
const KIND_ROUTES: Record<DocKind, { path: string; page: PageKey; create: z.ZodType; update: z.ZodType }> = {
  plan: { path: 'plans', page: 'production_planning', create: planCreateBody, update: planUpdateBody },
  summary: { path: 'summaries', page: 'production_planning', create: summaryCreateBody, update: summaryUpdateBody },
  hotpress: { path: 'hotpress', page: 'production_press', create: hotpressCreateBody, update: hotpressUpdateBody },
  cutting: { path: 'cutting', page: 'production_press', create: cuttingCreateBody, update: cuttingUpdateBody },
  mdo: { path: 'mdo', page: 'production_press', create: mdoCreateBody, update: mdoUpdateBody },
  chipping: { path: 'chipping', page: 'production_materials', create: chippingCreateBody, update: chippingUpdateBody },
  resin: { path: 'resin', page: 'production_materials', create: resinCreateBody, update: resinUpdateBody },
};

const ALL: PageKey[] = ['production_dashboard', 'production_planning', 'production_press', 'production_matt', 'production_materials', 'production_settings'];
/** Pages whose forms link other documents (plans and summaries pick hot press, cutting, resin…). */
const READERS: PageKey[] = ['production_dashboard', 'production_planning', 'production_press', 'production_matt', 'production_materials'];

/** Production module endpoints, mounted at /api/production. Fixed paths are registered before /:id. */
export function productionRoutes(): SecureRouter {
  const r = new SecureRouter();
  const s = (c: Context) => c.var.services;

  // ── Meta, settings, financial year ─────────────────────────────────
  r.get('/meta', policy.anyPage(ALL), async (c) => c.json(await s(c).productionReports.meta()));
  r.patch('/settings', policy.page('production_settings', 'edit'), async (c) => c.json(await s(c).productionReports.updateSettings(actor(c), await parseJson(c, settingsBody))));
  r.post('/fy/:fy/close', policy.page('production_settings', 'production_approve'), async (c) => c.json(await s(c).productionReports.setFyClosed(actor(c), c.req.param('fy') ?? '', true)));
  r.post('/fy/:fy/reopen', policy.page('production_settings', 'production_approve'), async (c) => c.json(await s(c).productionReports.setFyClosed(actor(c), c.req.param('fy') ?? '', false)));

  // ── Purchase lots (chipping / resin pickers, plan availability) ────
  r.get('/lots', policy.anyPage(READERS), async (c) => {
    const q = parseQuery(c, z.object({ material: z.enum(['nilgiri', 'resin']), except: z.string().max(64).optional() }));
    return c.json(await s(c).productionReports.lots(q.material, q.except));
  });

  // ── Workflow documents ─────────────────────────────────────────────
  for (const kind of DOC_KIND_IDS) {
    const k = KIND_ROUTES[kind];
    const base = `/${k.path}`;
    // Readable by its own page, by planning (plans and summaries link every kind) and by the dashboard (reports).
    r.get(base, policy.anyPage([...new Set<PageKey>([k.page, 'production_planning', 'production_dashboard'])]), async (c) =>
      c.json(await s(c).productionDocs.list(kind, toListQuery(parseQuery(c, docQuery)))),
    );
    r.get(`${base}/:id`, policy.anyPage(READERS), async (c) => c.json(await s(c).productionDocs.get(kind, idParam(c))));
    r.get(`${base}/:id/print`, policy.anyPage(READERS, 'print'), async (c) => c.json(await s(c).productionReports.printPayload(actor(c), kind, idParam(c))));
    r.post(base, policy.page(k.page, 'edit'), async (c) => c.json(await s(c).productionDocs.create(kind, actor(c), (await parseJson(c, k.create)) as Record<string, unknown>), 201));
    r.patch(`${base}/:id`, policy.page(k.page, 'edit'), async (c) => c.json(await s(c).productionDocs.update(kind, actor(c), idParam(c), (await parseJson(c, k.update)) as Record<string, unknown>)));
    r.delete(`${base}/:id`, policy.page(k.page, 'delete'), async (c) => {
      await s(c).productionDocs.remove(kind, actor(c), idParam(c));
      return c.body(null, 204);
    });
    r.post(`${base}/:id/send`, policy.page(k.page, 'edit'), async (c) => c.json(await s(c).productionDocs.workflow(kind, actor(c), idParam(c), 'send', await noteOf(c))));
    r.post(`${base}/:id/review`, policy.page(k.page, 'production_review'), async (c) => {
      const b = await parseJson(c, note.extend({ decision: z.enum(['review', 'return']) }));
      return c.json(await s(c).productionDocs.workflow(kind, actor(c), idParam(c), b.decision, b.note));
    });
    r.post(`${base}/:id/approve`, policy.page(k.page, 'production_approve'), async (c) => {
      const b = await parseJson(c, note.extend({ decision: z.enum(['approve', 'reject']) }));
      return c.json(await s(c).productionDocs.workflow(kind, actor(c), idParam(c), b.decision, b.note));
    });
  }
  r.get('/plans/:id/compare', policy.anyPage(READERS), async (c) => c.json(await s(c).productionReports.comparePlan(idParam(c))));
  r.get('/summaries/:id/compare', policy.anyPage(READERS), async (c) => c.json(await s(c).productionReports.compareSummary(idParam(c))));

  // ── Matt weight ────────────────────────────────────────────────────
  const mattQuery = z.object({ ...paging, sort: z.string().max(30).optional(), from: date, to: date, fy, status: z.enum(['open', 'closed']).optional() });
  r.get('/matt', policy.anyPage(['production_matt', 'production_planning', 'production_dashboard']), async (c) => c.json(await s(c).mattBatches.list(toListQuery(parseQuery(c, mattQuery)))));
  r.get('/matt/:id', policy.anyPage(READERS), async (c) => c.json(await s(c).mattBatches.get(idParam(c))));
  r.get('/matt/:id/print', policy.anyPage(['production_matt', 'production_dashboard'], 'print'), async (c) => c.json(await s(c).productionReports.printPayload(actor(c), 'matt', idParam(c))));
  r.post('/matt', policy.page('production_matt', 'edit'), async (c) => c.json(await s(c).mattBatches.create(actor(c), await parseJson(c, mattCreateBody)), 201));
  r.patch('/matt/:id', policy.page('production_matt', 'edit'), async (c) => c.json(await s(c).mattBatches.update(actor(c), idParam(c), await parseJson(c, mattUpdateBody))));
  r.delete('/matt/:id', policy.page('production_matt', 'delete'), async (c) => {
    await s(c).mattBatches.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });
  r.post('/matt/:id/close', policy.page('production_matt', 'edit'), async (c) => c.json(await s(c).mattBatches.close(actor(c), idParam(c))));
  r.post('/matt/:id/weights', policy.page('production_matt', 'edit'), async (c) => c.json(await s(c).mattBatches.punch(actor(c), idParam(c), (await parseJson(c, weightBody)).weight), 201));
  const nParam = (c: Context) => {
    const n = Number(c.req.param('n'));
    if (!Number.isInteger(n) || n < 1) throw validationFailed('Use a matt number like 12');
    return n;
  };
  r.patch('/matt/:id/weights/:n', policy.page('production_matt', 'production_approve'), async (c) => c.json(await s(c).mattBatches.editWeight(actor(c), idParam(c), nParam(c), (await parseJson(c, weightBody)).weight)));
  r.delete('/matt/:id/weights/:n', policy.page('production_matt', 'production_approve'), async (c) => c.json(await s(c).mattBatches.deleteWeight(actor(c), idParam(c), nParam(c))));

  // ── WIP Nilgiri ────────────────────────────────────────────────────
  r.get('/wip', policy.anyPage(['production_materials', 'production_planning']), async (c) => c.json(await s(c).wipBatches.list()));
  r.get('/wip/ledger', policy.page('production_materials'), async (c) => {
    const q = parseQuery(c, z.object({ wipId: z.string().max(64).optional() }));
    return c.json(await s(c).wipBatches.ledger(q.wipId));
  });
  r.post('/wip', policy.page('production_materials', 'edit'), async (c) => {
    const b = await parseJson(c, z.object({ chippingId: z.string().trim().min(1).max(64) }));
    return c.json(await s(c).wipBatches.createFromChipping(actor(c), b.chippingId), 201);
  });
  r.post('/wip/:id/adjust', policy.page('production_materials', 'edit'), async (c) => c.json(await s(c).wipBatches.adjust(actor(c), idParam(c), await parseJson(c, wipAdjustBody))));
  r.delete('/wip/:id', policy.page('production_materials', 'delete'), async (c) => {
    await s(c).wipBatches.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Dashboard, export, audit ───────────────────────────────────────
  r.get('/dashboard', policy.page('production_dashboard'), async (c) => c.json(await s(c).productionReports.dashboard(parseQuery(c, range))));
  r.get('/export', policy.anyPage(READERS, 'export'), async (c) => {
    const q = parseQuery(c, range.extend({ kind: z.enum([...DOC_KIND_IDS, 'matt', 'wip', 'wip-ledger']) }));
    const { kind, ...rg } = q;
    return xlsxResponse(c, await s(c).productionReports.exportXlsx(actor(c), kind, rg), `Production-${kind}`, s(c).clock());
  });
  r.get('/audit', policy.page('production_dashboard'), async (c) => {
    const q = parseQuery(c, z.object({ ...paging }));
    return c.json(await s(c).activity.list({ q: q.q, page: q.page, pageSize: q.pageSize ?? 50, filters: { entityPrefix: 'production_' } }));
  });

  return r;
}
