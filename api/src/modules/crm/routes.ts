import type { Context } from 'hono';
import { z } from 'zod';
import { CUSTOMER_STATUSES, CUSTOMER_TYPES, FOLLOWUP_STATUSES, FOLLOWUP_TYPES, LEAD_STAGES, PRIORITIES } from '../../contracts/crm';
import { policy, requireAuthContext } from '../../auth/guards';
import { SecureRouter } from '../../auth/secure-router';
import type { PageKey } from '../../domain/access';
import { isIsoDate } from '../../lib/dates';
import { validationFailed } from '../../lib/errors';
import { MAX_UPLOAD_BYTES, xlsxResponse } from '../../lib/spreadsheet';
import { paging, parseJson, parseQuery } from '../../lib/validate';
import { actorOf, type Actor } from '../sampletrack/actor';
import { idParam } from '../sampletrack/routes/params';
import type { CrmKind } from './record-service';
import * as v from './validation';

const actor = (c: Context): Actor => actorOf(requireAuthContext(c as never).user);
const date = z.string().refine(isIsoDate, 'Use a date like 2026-04-01').optional();
const text = z.string().trim().max(120).optional();
const bool = z.enum(['true', 'false']).transform((x) => x === 'true');
const sort = z.string().max(30).optional();

function toListQuery<T extends { q?: string; sort?: string; page?: number; pageSize?: number }>(parsed: T) {
  const { q, sort, page, pageSize, ...filters } = parsed;
  return { q, sort, page, pageSize, filters };
}

const ALL: PageKey[] = ['crm_dashboard', 'crm_leads', 'crm_followups', 'crm_customers', 'crm_pipeline', 'crm_masters', 'crm_reports'];
const PEOPLE: PageKey[] = ['crm_customers', 'crm_leads', 'crm_followups', 'crm_pipeline', 'crm_dashboard', 'crm_reports'];
const PIPELINE_READ: PageKey[] = ['crm_pipeline', 'crm_customers', 'crm_dashboard', 'crm_reports'];

/** URL, who reads, who writes, and the schemas for each record kind. */
const KINDS: { kind: CrmKind; path: string; read: PageKey[]; write: PageKey | PageKey[]; create?: z.ZodType; update: z.ZodType; query: z.ZodType }[] = [
  {
    kind: 'leads',
    path: 'leads',
    read: ['crm_leads', 'crm_dashboard', 'crm_reports'],
    write: 'crm_leads',
    create: v.leadCreateBody,
    update: v.leadUpdateBody,
    query: z.object({ ...paging, sort, stage: z.enum(LEAD_STAGES).optional(), salesperson: text, customerType: z.enum(CUSTOMER_TYPES).optional(), product: text, source: text, converted: bool.optional() }),
  },
  {
    kind: 'customers',
    path: 'customers',
    read: PEOPLE,
    write: 'crm_customers',
    create: v.customerCreateBody,
    update: v.customerUpdateBody,
    query: z.object({ ...paging, sort, customerType: z.enum(CUSTOMER_TYPES).optional(), priority: z.enum(PRIORITIES).optional(), status: z.enum(CUSTOMER_STATUSES).optional(), salesperson: text, city: text }),
  },
  {
    kind: 'followups',
    path: 'followups',
    read: ['crm_followups', 'crm_customers', 'crm_reports', 'crm_dashboard'],
    write: ['crm_followups', 'crm_customers'],
    create: v.followupCreateBody,
    update: v.followupUpdateBody,
    query: z.object({ ...paging, sort, customerId: text, from: date, to: date, city: text, salesperson: text, type: z.enum(FOLLOWUP_TYPES).optional(), status: z.enum(FOLLOWUP_STATUSES).optional() }),
  },
  { kind: 'tasks', path: 'tasks', read: ['crm_followups', 'crm_customers', 'crm_dashboard'], write: 'crm_followups', create: v.taskCreateBody, update: v.taskUpdateBody, query: z.object({ ...paging, sort, status: text, assignedTo: text, customerId: text }) },
  { kind: 'opportunities', path: 'opportunities', read: PIPELINE_READ, write: ['crm_pipeline', 'crm_customers'], create: v.oppCreateBody, update: v.oppUpdateBody, query: z.object({ ...paging, sort, stage: text, salesperson: text, customerId: text }) },
  { kind: 'quotations', path: 'quotations', read: PIPELINE_READ, write: 'crm_pipeline', create: v.quoteCreateBody, update: v.quoteUpdateBody, query: z.object({ ...paging, sort, status: text, customerId: text }) },
  { kind: 'won', path: 'won', read: PIPELINE_READ, write: 'crm_pipeline', update: v.wonUpdateBody, query: z.object({ ...paging, sort, customerId: text, salesperson: text }) },
  { kind: 'lost', path: 'lost', read: PIPELINE_READ, write: 'crm_pipeline', update: v.lostUpdateBody, query: z.object({ ...paging, sort, customerId: text, salesperson: text, lostReason: text }) },
  { kind: 'campaigns', path: 'campaigns', read: ['crm_masters', 'crm_leads', 'crm_reports'], write: 'crm_masters', create: v.campaignCreateBody, update: v.campaignUpdateBody, query: z.object({ ...paging, sort }) },
  { kind: 'products', path: 'products', read: ALL, write: 'crm_masters', create: v.productCreateBody, update: v.productUpdateBody, query: z.object({ ...paging, sort }) },
  { kind: 'salespersons', path: 'salespersons', read: ALL, write: 'crm_masters', create: v.salespersonCreateBody, update: v.salespersonUpdateBody, query: z.object({ ...paging, sort }) },
];

const EXPORTS: Record<string, PageKey[]> = {
  leads: ['crm_leads', 'crm_reports'],
  customers: ['crm_customers', 'crm_reports'],
  followups: ['crm_followups', 'crm_reports'],
  opportunities: ['crm_pipeline', 'crm_reports'],
  quotations: ['crm_pipeline'],
  won: ['crm_pipeline', 'crm_reports'],
  lost: ['crm_pipeline', 'crm_reports'],
};

async function sheetBytes(c: Context) {
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const file = form['file'];
  if (!(file instanceof File)) throw validationFailed('Attach the spreadsheet as a "file" form field');
  if (file.size === 0) throw validationFailed('The file is empty');
  if (file.size > MAX_UPLOAD_BYTES) throw validationFailed(`File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw validationFailed('Upload an .xlsx, .xls or .csv file');
  return new Uint8Array(await file.arrayBuffer());
}

/** CRM module endpoints, mounted at /api/crm. Fixed paths are registered before /:id. */
export function crmRoutes(): SecureRouter {
  const r = new SecureRouter();
  const s = (c: Context) => c.var.services;
  const writer = (w: PageKey | PageKey[], action: 'edit' | 'delete') => (Array.isArray(w) ? policy.anyPage(w, action) : policy.page(w, action));

  r.get('/meta', policy.anyPage(ALL), async (c) => c.json(await s(c).crmReports.meta()));
  r.patch('/settings', policy.page('crm_masters', 'edit'), async (c) => c.json(await s(c).crmReports.updateSettings(actor(c), await parseJson(c, v.settingsBody))));

  // ── Fixed paths before the per-kind /:id routes ────────────────────
  r.get('/leads/duplicates', policy.page('crm_leads'), async (c) => c.json(await s(c).crmFlow.duplicates(parseQuery(c, v.duplicateQuery))));
  r.post('/leads/import', policy.page('crm_leads', 'edit'), async (c) => {
    const commit = c.req.query('commit') === 'true';
    return c.json(await s(c).crmFlow.importLeads(actor(c), await sheetBytes(c), commit));
  });
  r.get('/leads/stages', policy.anyPage(['crm_leads', 'crm_dashboard']), async (c) => c.json(await s(c).crmReports.leadStages()));
  r.get('/followups/board', policy.anyPage(['crm_followups', 'crm_dashboard']), async (c) => c.json(await s(c).crmFlow.board(parseQuery(c, z.object({ salesperson: text })).salesperson)));
  r.get('/salespersons/stats', policy.anyPage(['crm_masters', 'crm_reports']), async (c) => c.json(await s(c).crmReports.salespersons()));
  r.get('/sources', policy.anyPage(['crm_masters', 'crm_reports']), async (c) => c.json(await s(c).crmReports.sources()));

  for (const k of KINDS) {
    const base = `/${k.path}`;
    r.get(base, policy.anyPage(k.read), async (c) => c.json(await s(c).crmRecords.list(k.kind, toListQuery(parseQuery(c, k.query) as { q?: string }))));
    r.get(`${base}/:id`, policy.anyPage(k.read), async (c) => c.json(await s(c).crmRecords.get(k.kind, idParam(c))));
    const create = k.create;
    if (create) r.post(base, writer(k.write, 'edit'), async (c) => c.json(await s(c).crmRecords.create(k.kind, actor(c), (await parseJson(c, create)) as Record<string, unknown>), 201));
    r.patch(`${base}/:id`, writer(k.write, 'edit'), async (c) => c.json(await s(c).crmRecords.update(k.kind, actor(c), idParam(c), (await parseJson(c, k.update)) as Record<string, unknown>)));
    r.delete(`${base}/:id`, writer(k.write, 'delete'), async (c) => {
      await s(c).crmRecords.remove(k.kind, actor(c), idParam(c));
      return c.body(null, 204);
    });
  }

  // ── Workflow steps ─────────────────────────────────────────────────
  r.post('/leads/:id/convert', policy.page('crm_leads', 'edit'), async (c) => c.json(await s(c).crmFlow.convert(actor(c), idParam(c)), 201));
  r.get('/customers/:id/360', policy.anyPage(PEOPLE), async (c) => c.json(await s(c).crmFlow.customer360(idParam(c))));
  r.post('/opportunities/:id/won', policy.page('crm_pipeline', 'edit'), async (c) => c.json(await s(c).crmFlow.markWon(actor(c), idParam(c), await parseJson(c, v.wonBody)), 201));
  r.post('/opportunities/:id/lost', policy.page('crm_pipeline', 'edit'), async (c) => c.json(await s(c).crmFlow.markLost(actor(c), idParam(c), await parseJson(c, v.lostBody)), 201));
  r.post('/lost/:id/reactivate', policy.page('crm_pipeline', 'edit'), async (c) => c.json(await s(c).crmFlow.reactivate(actor(c), idParam(c)), 201));
  r.get('/quotations/:id/print', policy.page('crm_pipeline', 'print'), async (c) => c.json(await s(c).crmReports.quotationPrint(actor(c), idParam(c))));

  // ── Dashboard, reports, exports, audit ─────────────────────────────
  r.get('/dashboard', policy.page('crm_dashboard'), async (c) => c.json(await s(c).crmReports.dashboard()));
  r.get('/reports', policy.page('crm_reports'), async (c) => c.json(await s(c).crmReports.reports(parseQuery(c, z.object({ from: date, to: date, salesperson: text })))));
  for (const [kind, pages] of Object.entries(EXPORTS))
    r.get(`/export/${kind}`, policy.anyPage(pages, 'export'), async (c) =>
      xlsxResponse(c, await s(c).crmReports.exportXlsx(actor(c), kind, parseQuery(c, z.object({ from: date, to: date, salesperson: text, city: text, status: text, type: text }))), `CRM-${kind}`, s(c).clock()),
    );
  r.get('/audit', policy.page('crm_dashboard'), async (c) => {
    const q = parseQuery(c, z.object({ ...paging }));
    return c.json(await s(c).activity.list({ q: q.q, page: q.page, pageSize: q.pageSize ?? 50, filters: { entityPrefix: 'crm_' } }));
  });

  return r;
}
