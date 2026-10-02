import type { Context } from 'hono';
import { z } from 'zod';
import { validationFailed } from './errors';

function fail(err: z.ZodError): never {
  throw validationFailed(
    'Invalid input',
    err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  );
}

export async function parseJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw validationFailed('Request body must be JSON');
  }
  const r = schema.safeParse(body);
  if (!r.success) fail(r.error);
  return r.data;
}

export function parseQuery<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  const r = schema.safeParse(c.req.query());
  if (!r.success) fail(r.error);
  return r.data;
}

/** Optional free text: trimmed, and '' becomes null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const paging = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().max(200).optional(),
};
