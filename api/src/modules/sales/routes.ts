import type { Context } from 'hono';
import { z } from 'zod';
import { isFy } from '../../contracts/purchase';
import { DEALER_TYPES, FIRM_IDS, REPORT_IDS } from '../../contracts/sales';
import { policy, requireAuthContext } from '../../auth/guards';
import { SecureRouter } from '../../auth/secure-router';
import type { PageKey } from '../../domain/access';
import { isIsoDate } from '../../lib/dates';
import { notFound } from '../../lib/errors';
import { xlsxResponse } from '../../lib/spreadsheet';
import { paging, parseJson, parseQuery } from '../../lib/validate';
import { actorOf, type Actor } from '../sampletrack/actor';
import { idParam } from '../sampletrack/routes/params';
import {
  customerCreateBody,
  customerUpdateBody,
  dispatchBody,
  fgCreateBody,
  fgUpdateBody,
  icCreateBody,
  icUpdateBody,
  invoiceCreateBody,
  invoiceUpdateBody,
  itemCreateBody,
  itemUpdateBody,
  orderCreateBody,
  orderUpdateBody,
  priceCreateBody,
  priceUpdateBody,
  proformaCreateBody,
  proformaUpdateBody,
  settingsBody,
  statusBody,
  weightCreateBody,
  weightUpdateBody,
} from './validation';

const actor = (c: Context): Actor => actorOf(requireAuthContext(c as never).user);
const date = z.string().refine(isIsoDate, 'Use a date like 2026-04-01').optional();
const firm = z.enum(FIRM_IDS).optional();
const text = z.string().trim().max(160).optional();
const range = z.object({ firm, from: date, to: date });
const docQuery = z.object({
  ...paging,
  sort: z.string().max(30).optional(),
  firm,
  status: z.string().max(20).optional(),
  billTo: text,
  shipTo: text,
  state: text,
  city: text,
  from: date,
  to: date,
  fy: z.string().refine(isFy, 'Use a financial year like 2026-27').optional(),
});
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const note = z.string().trim().max(500).nullish().transform((v) => v || null);

function toListQuery<T extends { q?: string; sort?: string; page?: number; pageSize?: number }>(parsed: T) {
  const { q, sort, page, pageSize, ...filters } = parsed;
  return { q, sort, page, pageSize, filters };
}

const ALL: PageKey[] = ['sales_dashboard', 'sales_masters', 'sales_proforma', 'sales_orders', 'sales_invoices', 'sales_dispatch', 'sales_reports', 'sales_settings'];
/** Pages whose forms pick parties and items. */
const FORMS: PageKey[] = ['sales_masters', 'sales_proforma', 'sales_orders', 'sales_invoices', 'sales_dispatch'];
const ORDER_READERS: PageKey[] = ['sales_orders', 'sales_invoices', 'sales_dispatch', 'sales_dashboard', 'sales_reports'];
const INVOICE_READERS: PageKey[] = ['sales_invoices', 'sales_dashboard', 'sales_reports'];

/** Export kind → pages allowed to download it. */
const EXPORTS: Record<string, PageKey[]> = {
  customers: ['sales_masters'],
  items: ['sales_masters'],
  prices: ['sales_masters'],
  weights: ['sales_masters'],
  proformas: ['sales_proforma'],
  orders: ['sales_orders'],
  invoices: ['sales_invoices'],
  dispatch: ['sales_dispatch'],
  fg: ['sales_dispatch'],
  intercompany: ['sales_invoices', 'sales_reports'],
};

/** Sales module endpoints, mounted at /api/sales. Fixed paths are registered before /:id. */
export function salesRoutes(): SecureRouter {
  const r = new SecureRouter();
  const s = (c: Context) => c.var.services;
  const del = (fn: (c: Context) => Promise<void>) => async (c: Context) => {
    await fn(c);
    return c.body(null, 204);
  };

  // ── Meta, options, settings ────────────────────────────────────────
  r.get('/meta', policy.anyPage(ALL), async (c) => c.json(await s(c).salesReports.meta()));
  r.get('/options', policy.anyPage(FORMS), async (c) => c.json(await s(c).salesReports.options()));
  r.patch('/settings', policy.page('sales_settings', 'edit'), async (c) => c.json(await s(c).salesMasters.updateSettings(actor(c), await parseJson(c, settingsBody))));

  // ── Party master ───────────────────────────────────────────────────
  const customerQuery = z.object({ ...paging, sort: z.string().max(30).optional(), state: text, city: text, group: text, dealerType: z.enum(DEALER_TYPES).optional(), active: bool.optional() });
  r.get('/customers', policy.anyPage([...FORMS, 'sales_reports']), async (c) => c.json(await s(c).salesMasters.listCustomers(toListQuery(parseQuery(c, customerQuery)))));
  r.get('/customers/:id', policy.anyPage([...FORMS, 'sales_reports']), async (c) => c.json(await s(c).salesMasters.getCustomer(idParam(c))));
  r.get('/customers/:id/ledger', policy.anyPage(['sales_masters', 'sales_invoices', 'sales_reports']), async (c) =>
    c.json(await s(c).salesReports.ledger(idParam(c), parseQuery(c, z.object({ firm })).firm)),
  );
  r.post('/customers', policy.page('sales_masters', 'edit'), async (c) => c.json(await s(c).salesMasters.createCustomer(actor(c), await parseJson(c, customerCreateBody)), 201));
  r.patch('/customers/:id', policy.page('sales_masters', 'edit'), async (c) => c.json(await s(c).salesMasters.updateCustomer(actor(c), idParam(c), await parseJson(c, customerUpdateBody))));
  r.delete('/customers/:id', policy.page('sales_masters', 'delete'), del((c) => s(c).salesMasters.removeCustomer(actor(c), idParam(c))));

  // ── Item master, price list, weight chart ──────────────────────────
  const itemQuery = z.object({ ...paging, sort: z.string().max(30).optional(), brand: text, grade: text, active: bool.optional() });
  r.get('/items', policy.anyPage(FORMS), async (c) => c.json(await s(c).salesMasters.listItems(toListQuery(parseQuery(c, itemQuery)))));
  r.post('/items', policy.page('sales_masters', 'edit'), async (c) => c.json(await s(c).salesMasters.createItem(actor(c), await parseJson(c, itemCreateBody)), 201));
  r.patch('/items/:id', policy.page('sales_masters', 'edit'), async (c) => c.json(await s(c).salesMasters.updateItem(actor(c), idParam(c), await parseJson(c, itemUpdateBody))));
  r.delete('/items/:id', policy.page('sales_masters', 'delete'), del((c) => s(c).salesMasters.removeItem(actor(c), idParam(c))));

  const itemFilter = z.object({ itemId: z.string().max(64).optional() });
  r.get('/prices', policy.anyPage(FORMS), async (c) => c.json(await s(c).salesMasters.listPrices(parseQuery(c, itemFilter).itemId)));
  r.post('/prices', policy.page('sales_masters', 'edit'), async (c) => c.json(await s(c).salesMasters.savePrice(actor(c), null, await parseJson(c, priceCreateBody)), 201));
  r.patch('/prices/:id', policy.page('sales_masters', 'edit'), async (c) => c.json(await s(c).salesMasters.savePrice(actor(c), idParam(c), await parseJson(c, priceUpdateBody))));
  r.delete('/prices/:id', policy.page('sales_masters', 'delete'), del((c) => s(c).salesMasters.removeEntry(actor(c), 'price', idParam(c))));
  r.get('/weights', policy.anyPage(FORMS), async (c) => c.json(await s(c).salesMasters.listWeights(parseQuery(c, itemFilter).itemId)));
  r.post('/weights', policy.page('sales_masters', 'edit'), async (c) => c.json(await s(c).salesMasters.saveWeight(actor(c), null, await parseJson(c, weightCreateBody)), 201));
  r.patch('/weights/:id', policy.page('sales_masters', 'edit'), async (c) => c.json(await s(c).salesMasters.saveWeight(actor(c), idParam(c), await parseJson(c, weightUpdateBody))));
  r.delete('/weights/:id', policy.page('sales_masters', 'delete'), del((c) => s(c).salesMasters.removeEntry(actor(c), 'weight', idParam(c))));

  // ── Proforma invoices ──────────────────────────────────────────────
  r.get('/proformas', policy.anyPage(['sales_proforma', 'sales_dashboard', 'sales_reports']), async (c) => c.json(await s(c).salesDocs.listProformas(toListQuery(parseQuery(c, docQuery)))));
  r.get('/proformas/:id', policy.anyPage(['sales_proforma', 'sales_orders']), async (c) => c.json(await s(c).salesDocs.getProforma(idParam(c))));
  r.get('/proformas/:id/print', policy.page('sales_proforma', 'print'), async (c) => c.json(await s(c).salesReports.printPayload(actor(c), 'proforma', idParam(c))));
  r.get('/proformas/:id/email', policy.page('sales_proforma'), async (c) => c.json(await s(c).salesReports.emailDraft('proforma', idParam(c))));
  r.post('/proformas', policy.page('sales_proforma', 'edit'), async (c) => c.json(await s(c).salesDocs.createProforma(actor(c), await parseJson(c, proformaCreateBody)), 201));
  r.patch('/proformas/:id', policy.page('sales_proforma', 'edit'), async (c) => c.json(await s(c).salesDocs.updateProforma(actor(c), idParam(c), await parseJson(c, proformaUpdateBody))));
  r.post('/proformas/:id/status', policy.page('sales_proforma', 'edit'), async (c) => c.json(await s(c).salesDocs.setProformaStatus(actor(c), idParam(c), (await parseJson(c, statusBody)).status)));
  r.post('/proformas/:id/confirm', policy.page('sales_proforma', 'edit'), async (c) => c.json(await s(c).salesDocs.confirmProforma(actor(c), idParam(c))));
  r.delete('/proformas/:id', policy.page('sales_proforma', 'delete'), del((c) => s(c).salesDocs.removeProforma(actor(c), idParam(c))));

  // ── Sales orders ───────────────────────────────────────────────────
  r.get('/orders', policy.anyPage(ORDER_READERS), async (c) => c.json(await s(c).salesDocs.listOrders(toListQuery(parseQuery(c, docQuery)))));
  r.get('/orders/:id', policy.anyPage(ORDER_READERS), async (c) => c.json(await s(c).salesDocs.getOrder(idParam(c))));
  r.get('/orders/:id/print', policy.page('sales_orders', 'print'), async (c) => c.json(await s(c).salesReports.printPayload(actor(c), 'order', idParam(c))));
  r.get('/orders/:id/email', policy.page('sales_orders'), async (c) => c.json(await s(c).salesReports.emailDraft('order', idParam(c))));
  r.post('/orders', policy.page('sales_orders', 'edit'), async (c) => c.json(await s(c).salesDocs.createOrder(actor(c), await parseJson(c, orderCreateBody)), 201));
  r.patch('/orders/:id', policy.page('sales_orders', 'edit'), async (c) => c.json(await s(c).salesDocs.updateOrder(actor(c), idParam(c), await parseJson(c, orderUpdateBody))));
  r.post('/orders/:id/status', policy.page('sales_orders', 'edit'), async (c) => c.json(await s(c).salesDocs.setOrderStatus(actor(c), idParam(c), (await parseJson(c, statusBody)).status)));
  r.post('/orders/:id/dispatch', policy.anyPage(['sales_orders', 'sales_dispatch'], 'edit'), async (c) => c.json(await s(c).salesDocs.recordDispatch(actor(c), idParam(c), await parseJson(c, dispatchBody))));
  r.delete('/orders/:id', policy.page('sales_orders', 'delete'), del((c) => s(c).salesDocs.removeOrder(actor(c), idParam(c))));

  // ── Sales invoices ─────────────────────────────────────────────────
  r.get('/invoices', policy.anyPage(INVOICE_READERS), async (c) => c.json(await s(c).salesDocs.listInvoices(toListQuery(parseQuery(c, docQuery)))));
  r.get('/invoices/:id', policy.anyPage(INVOICE_READERS), async (c) => c.json(await s(c).salesDocs.getInvoice(idParam(c))));
  r.get('/invoices/:id/print', policy.page('sales_invoices', 'print'), async (c) => c.json(await s(c).salesReports.printPayload(actor(c), 'invoice', idParam(c))));
  r.get('/invoices/:id/email', policy.page('sales_invoices'), async (c) => c.json(await s(c).salesReports.emailDraft('invoice', idParam(c))));
  r.post('/invoices', policy.page('sales_invoices', 'edit'), async (c) => c.json(await s(c).salesDocs.createInvoice(actor(c), await parseJson(c, invoiceCreateBody)), 201));
  r.patch('/invoices/:id', policy.page('sales_invoices', 'edit'), async (c) => c.json(await s(c).salesDocs.updateInvoice(actor(c), idParam(c), await parseJson(c, invoiceUpdateBody))));
  r.post('/invoices/:id/approve', policy.page('sales_invoices', 'sales_approve'), async (c) => {
    const b = await parseJson(c, z.object({ decision: z.enum(['approve', 'reject', 'reopen']), note }));
    return c.json(await s(c).salesDocs.decideInvoice(actor(c), idParam(c), b.decision, b.note));
  });
  r.delete('/invoices/:id', policy.page('sales_invoices', 'delete'), del((c) => s(c).salesDocs.removeInvoice(actor(c), idParam(c))));

  // ── Dispatch register, FG inventory, inter-company ─────────────────
  r.get('/dispatch', policy.anyPage(['sales_dispatch', 'sales_orders']), async (c) => {
    const q = parseQuery(c, range.extend({ ...paging, shipTo: text, state: text, city: text }));
    return c.json(await s(c).salesReports.dispatchRegister(q));
  });
  r.get('/fg', policy.anyPage(['sales_dispatch', 'sales_orders']), async (c) => {
    const q = parseQuery(c, z.object({ firm, grade: text }));
    return c.json(await s(c).salesMasters.listFg(q.firm, q.grade));
  });
  r.post('/fg', policy.page('sales_dispatch', 'edit'), async (c) => c.json(await s(c).salesMasters.saveFg(actor(c), null, await parseJson(c, fgCreateBody)), 201));
  r.patch('/fg/:id', policy.page('sales_dispatch', 'edit'), async (c) => c.json(await s(c).salesMasters.saveFg(actor(c), idParam(c), await parseJson(c, fgUpdateBody))));
  r.delete('/fg/:id', policy.page('sales_dispatch', 'delete'), del((c) => s(c).salesMasters.removeFg(actor(c), idParam(c))));

  r.get('/intercompany', policy.anyPage(['sales_invoices', 'sales_reports']), async (c) =>
    c.json(await s(c).salesMasters.listIntercompany(toListQuery(parseQuery(c, z.object({ ...paging, sort: z.string().max(30).optional(), from: date, to: date }))))),
  );
  r.post('/intercompany', policy.page('sales_invoices', 'edit'), async (c) => c.json(await s(c).salesMasters.saveIntercompany(actor(c), null, await parseJson(c, icCreateBody)), 201));
  r.patch('/intercompany/:id', policy.page('sales_invoices', 'edit'), async (c) => c.json(await s(c).salesMasters.saveIntercompany(actor(c), idParam(c), await parseJson(c, icUpdateBody))));
  r.delete('/intercompany/:id', policy.page('sales_invoices', 'delete'), del((c) => s(c).salesMasters.removeIntercompany(actor(c), idParam(c))));

  // ── Dashboard, reports, exports, audit ─────────────────────────────
  r.get('/dashboard', policy.page('sales_dashboard'), async (c) => c.json(await s(c).salesReports.dashboard(parseQuery(c, range))));
  const reportId = (c: Context) => {
    const id = z.enum(REPORT_IDS).safeParse(c.req.param('id'));
    if (!id.success) throw notFound('Report');
    return id.data;
  };
  r.get('/reports/:id', policy.anyPage(['sales_reports', 'sales_dashboard']), async (c) => c.json(await s(c).salesReports.report(reportId(c), parseQuery(c, range))));
  r.get('/reports/:id/export', policy.page('sales_reports', 'export'), async (c) => {
    const id = reportId(c);
    return xlsxResponse(c, await s(c).salesReports.exportXlsx(actor(c), `report:${id}`, parseQuery(c, range)), `Sales-${id}`, s(c).clock());
  });
  for (const [kind, pages] of Object.entries(EXPORTS))
    r.get(`/export/${kind}`, policy.anyPage(pages, 'export'), async (c) => xlsxResponse(c, await s(c).salesReports.exportXlsx(actor(c), kind, parseQuery(c, range)), `Sales-${kind}`, s(c).clock()));
  r.get('/audit', policy.page('sales_dashboard'), async (c) => {
    const q = parseQuery(c, z.object({ ...paging }));
    return c.json(await s(c).activity.list({ q: q.q, page: q.page, pageSize: q.pageSize ?? 50, filters: { entityPrefix: 'sales_' } }));
  });

  return r;
}
