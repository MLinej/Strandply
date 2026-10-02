import type { Context } from 'hono';
import { z } from 'zod';
import { isFy } from '../../contracts/purchase';
import { GRN_STATUSES, MRN_STATUSES, STORE_MATERIAL_IDS } from '../../contracts/stores';
import { policy, requireAuthContext } from '../../auth/guards';
import { SecureRouter } from '../../auth/secure-router';
import type { PageKey } from '../../domain/access';
import { isIsoDate } from '../../lib/dates';
import { xlsxResponse } from '../../lib/spreadsheet';
import { paging, parseJson, parseQuery } from '../../lib/validate';
import { actorOf, type Actor } from '../sampletrack/actor';
import { idParam } from '../sampletrack/routes/params';
import { accountBody, grnCreateBody, grnUpdateBody, mrnCreateBody, mrnUpdateBody, settingsBody } from './validation';

const actor = (c: Context): Actor => actorOf(requireAuthContext(c as never).user);
const sort = z.string().max(30).optional();
const fy = z.string().refine(isFy, 'Use a financial year like 2026-27').optional();
const date = z.string().refine(isIsoDate, 'Use a date like 2026-04-01').optional();
const material = z.enum(STORE_MATERIAL_IDS).optional();

const mrnQuery = z.object({ ...paging, sort, material, status: z.enum(MRN_STATUSES).optional(), from: date, to: date, fy });
const grnQuery = z.object({
  ...paging,
  sort,
  status: z.enum(GRN_STATUSES).optional(),
  fy,
  accounted: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
const pendingQuery = z.object({
  vendor: z.string().trim().max(100).optional(),
  material,
  minDays: z.coerce.number().int().min(0).max(3650).optional(),
});

function toListQuery<T extends { q?: string; sort?: string; page?: number; pageSize?: number }>(parsed: T) {
  const { q, sort, page, pageSize, ...filters } = parsed;
  return { q, sort, page, pageSize, filters };
}
const noPaging = <T extends { page?: number; pageSize?: number }>({ page: _p, pageSize: _s, ...rest }: T) => rest;

const ALL: PageKey[] = ['stores_dashboard', 'stores_gate', 'stores_grn', 'stores_accounting', 'stores_reports', 'stores_settings'];
/** The GRN form lists pending MRNs, and the MRN register opens the linked GRN. */
const MRN_READERS: PageKey[] = ['stores_gate', 'stores_grn'];
const GRN_READERS: PageKey[] = ['stores_gate', 'stores_grn', 'stores_accounting', 'stores_reports'];

/** Stores module endpoints, mounted at /api/stores. Fixed paths are registered before /:id. */
export function storesRoutes(): SecureRouter {
  const r = new SecureRouter();
  const s = (c: Context) => c.var.services;

  // ── Meta and settings ──────────────────────────────────────────────
  r.get('/meta', policy.anyPage(ALL), async (c) => c.json(await s(c).storesReports.meta()));
  r.patch('/settings', policy.page('stores_settings', 'edit'), async (c) => c.json(await s(c).storesReports.updateSettings(actor(c), await parseJson(c, settingsBody))));
  r.get('/vendor-options', policy.page('stores_gate'), async (c) => {
    const { q } = parseQuery(c, z.object({ q: z.string().trim().max(100).optional() }));
    return c.json(await s(c).mrns.vendorOptions(q));
  });

  // ── MRN (gate entry) ───────────────────────────────────────────────
  r.get('/mrns', policy.anyPage(MRN_READERS), async (c) => c.json(await s(c).mrns.list(toListQuery(parseQuery(c, mrnQuery)))));
  r.get('/mrns/export', policy.page('stores_gate', 'export'), async (c) =>
    xlsxResponse(c, await s(c).mrns.exportXlsx(actor(c), noPaging(toListQuery(parseQuery(c, mrnQuery)))), 'MRNRegister', s(c).clock()),
  );
  r.get('/mrns/:id', policy.anyPage(MRN_READERS), async (c) => c.json(await s(c).mrns.get(idParam(c))));
  r.get('/mrns/:id/print', policy.page('stores_gate', 'print'), async (c) => c.json(await s(c).mrns.printPayload(actor(c), idParam(c))));
  r.post('/mrns', policy.page('stores_gate', 'edit'), async (c) => c.json(await s(c).mrns.create(actor(c), await parseJson(c, mrnCreateBody)), 201));
  r.patch('/mrns/:id', policy.page('stores_gate', 'edit'), async (c) => c.json(await s(c).mrns.update(actor(c), idParam(c), await parseJson(c, mrnUpdateBody))));
  r.delete('/mrns/:id', policy.page('stores_gate', 'delete'), async (c) => {
    await s(c).mrns.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── GRN (receiving) ────────────────────────────────────────────────
  r.get('/grns', policy.anyPage(GRN_READERS), async (c) => c.json(await s(c).grns.list(toListQuery(parseQuery(c, grnQuery)))));
  r.get('/grns/export', policy.page('stores_grn', 'export'), async (c) =>
    xlsxResponse(c, await s(c).grns.exportXlsx(actor(c), noPaging(toListQuery(parseQuery(c, grnQuery)))), 'GRNRegister', s(c).clock()),
  );
  r.get('/grns/invoice-link', policy.page('stores_grn'), async (c) => {
    const q = parseQuery(c, z.object({ invoiceNo: z.string().trim().min(1).max(60), vendorName: z.string().trim().max(200).optional() }));
    return c.json({ match: await s(c).grns.invoiceLink(q.invoiceNo, q.vendorName) });
  });
  r.get('/grns/:id', policy.anyPage(GRN_READERS), async (c) => c.json(await s(c).grns.get(idParam(c))));
  r.get('/grns/:id/print', policy.anyPage(GRN_READERS, 'print'), async (c) => c.json(await s(c).grns.printPayload(actor(c), idParam(c))));
  r.post('/grns', policy.page('stores_grn', 'edit'), async (c) => c.json(await s(c).grns.create(actor(c), await parseJson(c, grnCreateBody)), 201));
  r.patch('/grns/:id', policy.page('stores_grn', 'edit'), async (c) => c.json(await s(c).grns.update(actor(c), idParam(c), await parseJson(c, grnUpdateBody))));
  r.delete('/grns/:id', policy.page('stores_grn', 'delete'), async (c) => {
    await s(c).grns.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });
  r.post('/grns/:id/review', policy.page('stores_grn', 'stores_review'), async (c) => c.json(await s(c).grns.review(actor(c), idParam(c))));
  r.post('/grns/:id/approve', policy.page('stores_grn', 'stores_approve'), async (c) => c.json(await s(c).grns.approve(actor(c), idParam(c))));
  r.post('/grns/:id/account', policy.page('stores_accounting', 'stores_account'), async (c) => {
    const { voucherNo } = await parseJson(c, accountBody);
    return c.json(await s(c).grns.markAccounted(actor(c), idParam(c), voucherNo));
  });
  r.delete('/grns/:id/account', policy.page('stores_accounting', 'stores_account'), async (c) => c.json(await s(c).grns.undoAccounted(actor(c), idParam(c))));

  // ── Dashboard and reports ──────────────────────────────────────────
  r.get('/dashboard', policy.page('stores_dashboard'), async (c) => c.json(await s(c).storesReports.dashboard()));
  r.get('/reports/pending', policy.page('stores_reports'), async (c) => c.json(await s(c).storesReports.pending(parseQuery(c, pendingQuery))));
  r.get('/reports/pending/export', policy.page('stores_reports', 'export'), async (c) =>
    xlsxResponse(c, await s(c).storesReports.exportPendingXlsx(actor(c), parseQuery(c, pendingQuery)), 'MRNPendingGRN', s(c).clock()),
  );
  r.get('/accounting', policy.anyPage(['stores_accounting', 'stores_reports']), async (c) => {
    const q = parseQuery(c, grnQuery.omit({ status: true }));
    return c.json(await s(c).storesReports.accounting(noPaging(toListQuery(q))));
  });
  r.get('/accounting/export', policy.anyPage(['stores_accounting', 'stores_reports'], 'export'), async (c) => {
    const q = parseQuery(c, grnQuery.omit({ status: true }));
    return xlsxResponse(c, await s(c).grns.exportAccountingXlsx(actor(c), noPaging(toListQuery(q))), 'AccountingStatus', s(c).clock());
  });
  r.get('/audit', policy.page('stores_dashboard'), async (c) => {
    const q = parseQuery(c, z.object({ ...paging }));
    return c.json(await s(c).activity.list({ q: q.q, page: q.page, pageSize: q.pageSize ?? 50, filters: { entityPrefix: 'stores_' } }));
  });

  return r;
}
