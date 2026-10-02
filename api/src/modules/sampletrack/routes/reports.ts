import type { Context } from 'hono';
import { z } from 'zod';
import { REPORT_KEYS } from '../../../contracts/sampletrack';
import { policy, requireAuthContext } from '../../../auth/guards';
import { SecureRouter } from '../../../auth/secure-router';
import { notFound } from '../../../lib/errors';
import { parseQuery } from '../../../lib/validate';
import { actorOf } from '../actor';
import { isoDate } from '../requests/validation';

const filterQuery = z.object({
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  partyId: z.string().max(64).optional(),
  courierId: z.string().max(64).optional(),
});

const exportQuery = filterQuery.extend({
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
  table: z.string().max(40).optional(),
});

const actor = (c: Context) => actorOf(requireAuthContext(c as never).user);

function reportKey(c: Context) {
  const key = c.req.param('key');
  const parsed = z.enum(REPORT_KEYS).safeParse(key);
  if (!parsed.success) throw notFound('Report');
  return parsed.data;
}

export function reportRoutes(r: SecureRouter) {
  r.get('/dashboard', policy.page('dashboard'), async (c) =>
    c.json(await c.var.services.dashboard.get(requireAuthContext(c as never).permissions)),
  );

  r.get('/reports/:key', policy.page('reports'), async (c) =>
    c.json(await c.var.services.reports.build(reportKey(c), parseQuery(c, filterQuery))),
  );

  r.get('/reports/:key/export', policy.page('reports', 'export'), async (c) => {
    const key = reportKey(c);
    const { format, table, ...filters } = parseQuery(c, exportQuery);
    const file = await c.var.services.reports.export(actor(c), key, filters, format, table);
    return c.body(file.bytes as Uint8Array<ArrayBuffer>, 200, {
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
      'Cache-Control': 'no-store',
    });
  });

  r.get('/reports/:key/print', policy.page('reports', 'print'), async (c) =>
    c.json(await c.var.services.reports.printPayload(actor(c), reportKey(c), parseQuery(c, filterQuery))),
  );
}
