import type { Context } from 'hono';
import { notFound } from '../../../lib/errors';

export function idParam(c: Context): string {
  const id = c.req.param('id');
  if (!id) throw notFound('Record');
  return id;
}
