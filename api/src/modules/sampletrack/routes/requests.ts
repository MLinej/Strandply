import type { Context } from 'hono';
import { policy, requireAuthContext } from '../../../auth/guards';
import { SecureRouter } from '../../../auth/secure-router';
import { xlsxResponse } from '../../../lib/spreadsheet';
import { parseJson, parseQuery } from '../../../lib/validate';
import { actorOf } from '../actor';
import { requestCreateBody, requestListQuery, requestUpdateBody } from '../requests/validation';
import { idParam } from './params';

const actor = (c: Context) => actorOf(requireAuthContext(c as never).user);

function listQuery(c: Context) {
  const { q, sort, page, pageSize, ...filters } = parseQuery(c, requestListQuery);
  return { q, sort, page, pageSize, filters };
}

export function requestRoutes(r: SecureRouter) {
  r.get('/requests', policy.page('requests'), async (c) => c.json(await c.var.services.requests.list(listQuery(c))));

  // Sidebar badge on the Requests nav item.
  r.get('/requests/pending-count', policy.page('requests'), async (c) => c.json(await c.var.services.requests.pendingCount()));

  r.get('/requests/export', policy.page('requests', 'export'), async (c) => {
    const { page: _p, pageSize: _s, ...query } = listQuery(c);
    const bytes = await c.var.services.requests.exportXlsx(actor(c), query);
    return xlsxResponse(c, bytes, 'SampleRequests', c.var.services.clock());
  });

  r.get('/requests/:id', policy.page('requests'), async (c) => c.json(await c.var.services.requests.get(idParam(c))));

  // Prefills the dispatch form, so it needs what creating a dispatch needs (the dispatch page + edit).
  r.get('/requests/:id/dispatch-draft', policy.page('dispatch', 'edit'), async (c) =>
    c.json(await c.var.services.requests.dispatchDraft(idParam(c))),
  );

  r.post('/requests', policy.page('requests', 'edit'), async (c) => {
    const body = await parseJson(c, requestCreateBody);
    return c.json(await c.var.services.requests.create(actor(c), body), 201);
  });

  r.patch('/requests/:id', policy.page('requests', 'edit'), async (c) => {
    const body = await parseJson(c, requestUpdateBody);
    return c.json(await c.var.services.requests.update(actor(c), idParam(c), body));
  });

  r.post('/requests/:id/approve', policy.page('requests', 'approve'), async (c) =>
    c.json(await c.var.services.requests.approve(actor(c), idParam(c))),
  );

  r.delete('/requests/:id', policy.page('requests', 'delete'), async (c) => {
    await c.var.services.requests.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });
}
