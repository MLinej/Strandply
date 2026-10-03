import type { Context } from 'hono';
import { z } from 'zod';
import { DEPARTMENTS, FAMILY_IDS, SLIP_TYPES } from '../../contracts/stock';
import { policy, requireAuthContext } from '../../auth/guards';
import { SecureRouter } from '../../auth/secure-router';
import type { PageKey } from '../../domain/access';
import { isIsoDate } from '../../lib/dates';
import { xlsxResponse } from '../../lib/spreadsheet';
import { paging, parseJson, parseQuery } from '../../lib/validate';
import { actorOf, type Actor } from '../sampletrack/actor';
import { idParam } from '../sampletrack/routes/params';
import { groupCreateBody, groupUpdateBody, openingCreateBody, reclassCreateBody, slipCreateBody } from './validation';

const actor = (c: Context): Actor => actorOf(requireAuthContext(c as never).user);
const date = z.string().refine(isIsoDate, 'Use a date like 2026-04-01').optional();
const sku = z.string().trim().max(30).optional();
const dept = z.enum(DEPARTMENTS).optional();
const family = z.enum(FAMILY_IDS).optional();
const range = { from: date, to: date };
const slipQuery = z.object({ ...paging, sort: z.string().max(30).optional(), type: z.enum(SLIP_TYPES).optional(), ...range, sku });

function toListQuery<T extends { q?: string; sort?: string; page?: number; pageSize?: number }>(parsed: T) {
  const { q, sort, page, pageSize, ...filters } = parsed;
  return { q, sort, page, pageSize, filters };
}

const ALL: PageKey[] = ['stock_dashboard', 'stock_slips', 'stock_ledger', 'stock_reclass', 'stock_masters'];
/** Forms that move stock show the balance of the picked SKU. */
const MOVERS: PageKey[] = ['stock_slips', 'stock_reclass', 'stock_masters'];

/** Stock module endpoints, mounted at /api/stock. Fixed paths are registered before /:id. */
export function stockRoutes(): SecureRouter {
  const r = new SecureRouter();
  const s = (c: Context) => c.var.services;

  // ── Meta, item master, balance lookup ──────────────────────────────
  r.get('/meta', policy.anyPage(ALL), async (c) => c.json(await s(c).stockMasters.meta()));
  r.post('/items', policy.page('stock_masters', 'edit'), async (c) => c.json(await s(c).stockMasters.create(actor(c), await parseJson(c, groupCreateBody)), 201));
  r.patch('/items/:id', policy.page('stock_masters', 'edit'), async (c) => c.json(await s(c).stockMasters.update(actor(c), idParam(c), await parseJson(c, groupUpdateBody))));
  r.delete('/items/:id', policy.page('stock_masters', 'delete'), async (c) => {
    await s(c).stockMasters.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });
  r.get('/balance', policy.anyPage(MOVERS), async (c) => {
    const q = parseQuery(c, z.object({ sku: z.string().trim().min(1).max(30) }));
    const { rows } = await s(c).stock.liveStock({ q: q.sku });
    return c.json({ sku: q.sku, qty: rows.find((x: { sku: string }) => x.sku === q.sku)?.qty ?? 0 });
  });

  // ── Slips (SIS / SRS) ──────────────────────────────────────────────
  r.get('/slips', policy.page('stock_slips'), async (c) => c.json(await s(c).stock.listSlips(toListQuery(parseQuery(c, slipQuery)))));
  r.get('/slips/:id', policy.anyPage(['stock_dashboard', 'stock_slips', 'stock_ledger']), async (c) => c.json(await s(c).stock.getSlip(idParam(c))));
  r.get('/slips/:id/print', policy.anyPage(['stock_slips', 'stock_ledger'], 'print'), async (c) => c.json(await s(c).stock.slipPrint(actor(c), idParam(c))));
  r.post('/slips', policy.page('stock_slips', 'edit'), async (c) => c.json(await s(c).stock.createSlip(actor(c), await parseJson(c, slipCreateBody)), 201));
  r.delete('/slips/:id', policy.page('stock_slips', 'delete'), async (c) => {
    await s(c).stock.removeSlip(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Opening stock ──────────────────────────────────────────────────
  r.get('/opening', policy.page('stock_masters'), async (c) => c.json(await s(c).stock.listOpening()));
  r.post('/opening', policy.page('stock_masters', 'edit'), async (c) => c.json(await s(c).stock.createOpening(actor(c), await parseJson(c, openingCreateBody)), 201));
  r.delete('/opening/:id', policy.page('stock_masters', 'delete'), async (c) => {
    await s(c).stock.removeOpening(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Reclassification (STR) ─────────────────────────────────────────
  r.get('/reclass', policy.page('stock_reclass'), async (c) => c.json(await s(c).stock.listReclass()));
  r.post('/reclass', policy.page('stock_reclass', 'edit'), async (c) => c.json(await s(c).stock.createReclass(actor(c), await parseJson(c, reclassCreateBody)), 201));
  r.delete('/reclass/:id', policy.page('stock_reclass', 'delete'), async (c) => {
    await s(c).stock.removeReclass(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Live stock, ledgers, dashboard ─────────────────────────────────
  r.get('/live', policy.page('stock_ledger'), async (c) => {
    const q = parseQuery(c, z.object({ family, dept, q: z.string().trim().max(100).optional() }));
    return c.json(await s(c).stock.liveStock(q));
  });
  r.get('/ledger/sku', policy.page('stock_ledger'), async (c) => {
    const q = parseQuery(c, z.object({ sku, ...range }));
    return c.json(await s(c).stock.skuLedger(q.sku, q));
  });
  r.get('/ledger/dept', policy.page('stock_ledger'), async (c) => {
    const q = parseQuery(c, z.object({ dept, ...range }));
    return c.json(await s(c).stock.deptLedger(q.dept, q));
  });
  r.get('/movements', policy.page('stock_ledger'), async (c) => c.json(await s(c).stock.movements(parseQuery(c, z.object(range)))));
  r.get('/export', policy.anyPage(['stock_slips', 'stock_ledger'], 'export'), async (c) => {
    const q = parseQuery(c, z.object({ kind: z.enum(['slips', 'stock', 'sku-ledger', 'dept-ledger', 'movements']), sku, dept, family, ...range, type: z.enum(SLIP_TYPES).optional(), q: z.string().trim().max(100).optional() }));
    const names = { slips: 'StockSlips', stock: 'LiveStock', 'sku-ledger': 'SkuLedger', 'dept-ledger': 'DeptLedger', movements: 'DailyMovement' } as const;
    const bytes = await s(c).stock.exportXlsx(actor(c), q.kind, {
      range: { from: q.from, to: q.to },
      sku: q.sku,
      dept: q.dept,
      family: q.family,
      slips: { q: q.q, filters: { type: q.type, from: q.from, to: q.to, sku: q.sku } },
    });
    return xlsxResponse(c, bytes, names[q.kind], s(c).clock());
  });
  r.get('/dashboard', policy.page('stock_dashboard'), async (c) => c.json(await s(c).stock.dashboard(parseQuery(c, z.object(range)))));
  r.get('/audit', policy.page('stock_dashboard'), async (c) => {
    const q = parseQuery(c, z.object({ ...paging }));
    return c.json(await s(c).activity.list({ q: q.q, page: q.page, pageSize: q.pageSize ?? 50, filters: { entityPrefix: 'stock_' } }));
  });

  return r;
}
