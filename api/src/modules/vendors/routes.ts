import type { Context } from 'hono';
import { z } from 'zod';
import {
  MASTER_STATUSES,
  TNC_APPLIES,
  TNC_CATEGORIES,
  VENDOR_IMPORT_KINDS,
  VENDOR_STATUSES,
  type VendorAction,
  type VendorImportKind,
} from '../../contracts/vendors';
import { policy, requireAuthContext } from '../../auth/guards';
import { SecureRouter } from '../../auth/secure-router';
import { notFound, validationFailed } from '../../lib/errors';
import { fileResponse, MAX_UPLOAD_BYTES, xlsxResponse } from '../../lib/spreadsheet';
import { paging, parseJson, parseQuery } from '../../lib/validate';
import { actorOf, type Actor } from '../sampletrack/actor';
import { idParam } from '../sampletrack/routes/params';
import { importTemplate } from './import-service';
import {
  categoryCreateBody,
  categoryUpdateBody,
  emailSettingsBody,
  productCreateBody,
  productUpdateBody,
  tncCreateBody,
  tncUpdateBody,
  vendorCreateBody,
  vendorUpdateBody,
} from './validation';

const actor = (c: Context): Actor => actorOf(requireAuthContext(c as never).user);
const flag = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');
const forceOf = (c: Context) => flag.parse(c.req.query('force'));
const sort = z.string().max(30).optional();
const format = z.enum(['xlsx', 'csv']).default('xlsx');

const vendorQuery = z.object({
  ...paging,
  sort,
  status: z.enum(VENDOR_STATUSES).optional(),
  categoryId: z.string().max(64).optional(),
  state: z.string().max(100).optional(),
});
const productQuery = z.object({ ...paging, sort, categoryId: z.string().max(64).optional() });
const tncQuery = z.object({
  ...paging,
  sort,
  category: z.enum(TNC_CATEGORIES).optional(),
  status: z.enum(MASTER_STATUSES).optional(),
  appliesTo: z.enum(TNC_APPLIES).optional(),
});

function toListQuery<T extends { q?: string; sort?: string; page?: number; pageSize?: number }>(parsed: T) {
  const { q, sort, page, pageSize, ...filters } = parsed;
  return { q, sort, page, pageSize, filters };
}
const noPaging = <T extends { page?: number; pageSize?: number }>({ page: _p, pageSize: _s, ...rest }: T) => rest;

async function uploadedFile(c: Context): Promise<{ bytes: Uint8Array; name: string }> {
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const file = form['file'];
  if (!(file instanceof File)) throw validationFailed('Attach the spreadsheet as a "file" form field');
  if (file.size === 0) throw validationFailed('The file is empty');
  if (file.size > MAX_UPLOAD_BYTES) throw validationFailed(`File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw validationFailed('Upload an .xlsx, .xls or .csv file');
  return { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name };
}

function importKind(c: Context): VendorImportKind {
  const k = c.req.param('kind');
  if (!(VENDOR_IMPORT_KINDS as readonly string[]).includes(k ?? '')) throw notFound('Import type');
  return k as VendorImportKind;
}

/** Vendors module endpoints, mounted at /api/vendors. Fixed paths are registered before /:id. */
export function vendorRoutes(): SecureRouter {
  const r = new SecureRouter();
  const s = (c: Context) => c.var.services;

  // ── Categories (the vendor form needs them too) ────────────────────
  r.get('/categories', policy.anyPage(['vendors', 'vendor_masters']), async (c) => c.json(await s(c).vendorCategories.list()));
  r.get('/categories/export', policy.page('vendor_masters', 'export'), async (c) =>
    xlsxResponse(c, await s(c).vendorCategories.exportXlsx(actor(c)), 'VendorCategories', s(c).clock()),
  );
  r.post('/categories', policy.page('vendor_masters', 'edit'), async (c) =>
    c.json(await s(c).vendorCategories.create(actor(c), await parseJson(c, categoryCreateBody)), 201),
  );
  r.patch('/categories/:id', policy.page('vendor_masters', 'edit'), async (c) =>
    c.json(await s(c).vendorCategories.update(actor(c), idParam(c), await parseJson(c, categoryUpdateBody))),
  );
  r.delete('/categories/:id', policy.page('vendor_masters', 'delete'), async (c) => {
    await s(c).vendorCategories.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Products ───────────────────────────────────────────────────────
  r.get('/products', policy.anyPage(['vendors', 'vendor_masters']), async (c) =>
    c.json(await s(c).vendorProducts.list(toListQuery(parseQuery(c, productQuery)))),
  );
  // Every product, for the vendor form's picker and the find-by-product filter.
  r.get('/products/all', policy.anyPage(['vendors', 'vendor_masters']), async (c) => c.json(await s(c).vendorProducts.all()));
  r.get('/products/summary', policy.page('vendor_masters'), async (c) => c.json(await s(c).vendorProducts.summary()));
  r.get('/products/export', policy.page('vendor_masters', 'export'), async (c) => {
    const query = noPaging(toListQuery(parseQuery(c, productQuery)));
    return xlsxResponse(c, await s(c).vendorProducts.exportXlsx(actor(c), query), 'VendorProducts', s(c).clock());
  });
  r.get('/products/:id', policy.anyPage(['vendors', 'vendor_masters']), async (c) => c.json(await s(c).vendorProducts.get(idParam(c))));
  r.post('/products', policy.page('vendor_masters', 'edit'), async (c) =>
    c.json(await s(c).vendorProducts.create(actor(c), await parseJson(c, productCreateBody)), 201),
  );
  r.patch('/products/:id', policy.page('vendor_masters', 'edit'), async (c) =>
    c.json(await s(c).vendorProducts.update(actor(c), idParam(c), await parseJson(c, productUpdateBody))),
  );
  r.delete('/products/:id', policy.page('vendor_masters', 'delete'), async (c) => {
    await s(c).vendorProducts.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── T&C master ─────────────────────────────────────────────────────
  r.get('/tnc', policy.page('vendor_masters'), async (c) => c.json(await s(c).tnc.list(toListQuery(parseQuery(c, tncQuery)))));
  r.get('/tnc/stats', policy.page('vendor_masters'), async (c) => c.json(await s(c).tnc.stats()));
  r.get('/tnc/:id', policy.page('vendor_masters'), async (c) => c.json(await s(c).tnc.get(idParam(c))));
  r.post('/tnc', policy.page('vendor_masters', 'edit'), async (c) => c.json(await s(c).tnc.create(actor(c), await parseJson(c, tncCreateBody)), 201));
  r.patch('/tnc/:id', policy.page('vendor_masters', 'edit'), async (c) =>
    c.json(await s(c).tnc.update(actor(c), idParam(c), await parseJson(c, tncUpdateBody))),
  );
  r.delete('/tnc/:id', policy.page('vendor_masters', 'delete'), async (c) => {
    await s(c).tnc.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });

  // ── Reports ────────────────────────────────────────────────────────
  r.get('/reports', policy.page('vendor_reports'), async (c) => c.json(await s(c).vendors.report()));
  r.get('/reports/export', policy.page('vendor_reports', 'export'), async (c) => {
    const { format: f } = parseQuery(c, z.object({ format }));
    return fileResponse(c, await s(c).vendors.export(actor(c), {}, f), 'VendorReport', s(c).clock(), f);
  });

  // ── Settings, import ───────────────────────────────────────────────
  r.get('/settings/email', policy.page('vendor_settings'), async (c) => c.json(await s(c).vendorSettings.email()));
  r.put('/settings/email', policy.page('vendor_settings', 'edit'), async (c) =>
    c.json(await s(c).vendorSettings.updateEmail(actor(c), await parseJson(c, emailSettingsBody))),
  );
  r.get('/import/:kind/template', policy.page('vendor_settings'), (c) => {
    const kind = importKind(c);
    return xlsxResponse(c, importTemplate(kind), `Vendor-${kind}-ImportTemplate`, s(c).clock());
  });
  // multipart/form-data with a "file" field. ?commit=true writes; anything else is a dry-run preview.
  r.post('/import/:kind', policy.page('vendor_settings', 'edit'), async (c) => {
    const kind = importKind(c);
    const commit = flag.parse(c.req.query('commit'));
    const file = await uploadedFile(c);
    return c.json(await s(c).vendorImport.run(actor(c), kind, file.bytes, { commit, fileName: file.name }));
  });

  // ── Vendors ────────────────────────────────────────────────────────
  r.get('', policy.page('vendors'), async (c) => c.json(await s(c).vendors.list(toListQuery(parseQuery(c, vendorQuery)))));
  r.get('/stats', policy.page('vendors'), async (c) => c.json(await s(c).vendors.stats()));
  r.get('/options', policy.page('vendors'), async (c) => {
    const { q, status } = parseQuery(c, z.object({ q: z.string().trim().max(100).optional(), status: z.string().max(100).optional() }));
    const statuses = status?.split(',').filter((x) => (VENDOR_STATUSES as readonly string[]).includes(x)) as (typeof VENDOR_STATUSES)[number][] | undefined;
    return c.json(await s(c).vendors.options(q, statuses));
  });
  r.get('/compare', policy.page('vendors'), async (c) => {
    const { ids } = parseQuery(c, z.object({ ids: z.string().max(400) }));
    const list = [...new Set(ids.split(',').map((x) => x.trim()).filter(Boolean))];
    if (list.length < 2 || list.length > 4) throw validationFailed('Compare 2 to 4 vendors');
    return c.json(await s(c).vendors.getMany(list));
  });
  r.get('/by-product', policy.page('vendors'), async (c) => {
    const q = parseQuery(c, z.object({ q: z.string().trim().max(100).optional(), categoryId: z.string().max(64).optional(), sort: z.enum(['rating', 'lead']).optional() }));
    return c.json(await s(c).vendors.byProduct(q));
  });
  r.get('/export', policy.page('vendors', 'export'), async (c) => {
    const { format: f, ...rest } = parseQuery(c, vendorQuery.extend({ format }));
    return fileResponse(c, await s(c).vendors.export(actor(c), noPaging(toListQuery(rest)), f), 'Vendors', s(c).clock(), f);
  });
  r.get('/print', policy.page('vendors', 'print'), async (c) =>
    c.json(await s(c).vendorSettings.print(actor(c), { query: noPaging(toListQuery(parseQuery(c, vendorQuery))) })),
  );
  r.post('', policy.page('vendors', 'edit'), async (c) => {
    const body = await parseJson(c, vendorCreateBody);
    return c.json(await s(c).vendors.create(actor(c), body, { force: forceOf(c) }), 201);
  });

  r.get('/:id', policy.page('vendors'), async (c) => c.json(await s(c).vendors.get(idParam(c))));
  r.get('/:id/print', policy.page('vendors', 'print'), async (c) => c.json(await s(c).vendorSettings.print(actor(c), { id: idParam(c) })));
  r.patch('/:id', policy.page('vendors', 'edit'), async (c) => {
    const body = await parseJson(c, vendorUpdateBody);
    return c.json(await s(c).vendors.update(actor(c), idParam(c), body, { force: forceOf(c) }));
  });
  const step = (action: VendorAction) => async (c: Context) => c.json(await s(c).vendors.act(actor(c), idParam(c), action));
  r.post('/:id/submit', policy.page('vendors', 'edit'), step('submit'));
  r.post('/:id/approve', policy.page('vendors', 'vendor_approve'), step('approve'));
  r.post('/:id/activate', policy.page('vendors', 'vendor_approve'), step('activate'));
  r.post('/:id/reinstate', policy.page('vendors', 'vendor_approve'), step('reinstate'));
  r.post('/:id/blacklist', policy.page('vendors', 'vendor_approve'), async (c) => {
    const { reason } = await parseJson(c, z.object({ reason: z.string().trim().min(1, 'Give a reason for blacklisting').max(500) }));
    return c.json(await s(c).vendors.act(actor(c), idParam(c), 'blacklist', reason));
  });
  r.delete('/:id', policy.page('vendors', 'delete'), async (c) => {
    await s(c).vendors.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });

  return r;
}
