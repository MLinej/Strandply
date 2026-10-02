import type { Context } from 'hono';
import { z } from 'zod';
import { policy, requireAuthContext } from '../../../auth/guards';
import { SecureRouter } from '../../../auth/secure-router';
import { xlsxResponse } from '../../../lib/spreadsheet';
import { paging, parseJson, parseQuery } from '../../../lib/validate';
import { actorOf } from '../actor';
import { dispatchCreateBody, dispatchListQuery, dispatchUpdateBody, statusChangeBody } from '../dispatches/validation';
import { idParam } from './params';

const actor = (c: Context) => actorOf(requireAuthContext(c as never).user);

function listQuery(c: Context) {
  const { q, sort, page, pageSize, ...filters } = parseQuery(c, dispatchListQuery);
  return { q, sort, page, pageSize, filters };
}

export function dispatchRoutes(r: SecureRouter) {
  r.get('/dispatches', policy.page('dispatch'), async (c) => c.json(await c.var.services.dispatches.list(listQuery(c))));

  r.get('/dispatches/export', policy.page('dispatch', 'export'), async (c) => {
    const { page: _p, pageSize: _s, ...query } = listQuery(c);
    const bytes = await c.var.services.dispatches.exportXlsx(actor(c), query);
    return xlsxResponse(c, bytes, 'DispatchRegister', c.var.services.clock());
  });

  // Pickers for the dispatch form. The dispatch role has neither the Parties nor the Requests page.
  r.get('/dispatches/party-options', policy.page('dispatch', 'edit'), async (c) => {
    const { q } = parseQuery(c, z.object({ q: paging.q }));
    return c.json(await c.var.services.dispatches.partyOptions(q));
  });
  r.get('/dispatches/request-options', policy.page('dispatch', 'edit'), async (c) => {
    const { partyId } = parseQuery(c, z.object({ partyId: z.string().max(64).optional() }));
    return c.json(await c.var.services.dispatches.linkableRequests(partyId));
  });

  r.get('/dispatches/:id', policy.page('dispatch'), async (c) => c.json(await c.var.services.dispatches.get(idParam(c))));

  r.post('/dispatches', policy.page('dispatch', 'edit'), async (c) => {
    const body = await parseJson(c, dispatchCreateBody);
    return c.json(await c.var.services.dispatches.create(actor(c), body), 201);
  });

  r.patch('/dispatches/:id', policy.page('dispatch', 'edit'), async (c) => {
    const body = await parseJson(c, dispatchUpdateBody);
    return c.json(await c.var.services.dispatches.update(actor(c), idParam(c), body));
  });

  // Quick status update.
  r.post('/dispatches/:id/status', policy.page('dispatch', 'edit'), async (c) => {
    const { status, note } = await parseJson(c, statusChangeBody);
    return c.json(await c.var.services.dispatches.changeStatus(actor(c), idParam(c), status, note ?? null));
  });

  r.delete('/dispatches/:id', policy.page('dispatch', 'delete'), async (c) => {
    await c.var.services.dispatches.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // Live tracking. Read-only, so marketing (who has the tracking page) can follow shipments.
  r.get('/tracking', policy.page('tracking'), async (c) => {
    const { q, page, pageSize } = parseQuery(c, z.object({ ...paging }));
    return c.json(await c.var.services.dispatches.list({ q, page, pageSize }));
  });
  r.get('/tracking/:id', policy.page('tracking'), async (c) => c.json(await c.var.services.dispatches.tracking(idParam(c))));
}
