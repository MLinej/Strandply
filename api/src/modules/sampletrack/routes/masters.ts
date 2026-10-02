import type { Context } from 'hono';
import { z } from 'zod';
import {
  BOARD_TYPES,
  COURIER_STATUSES,
  COURIER_TYPES,
  DISPATCH_MODES,
  PARTY_TYPES,
  STOCK_STATUSES,
} from '../../../contracts/sampletrack';
import { policy, requireAuthContext } from '../../../auth/guards';
import { SecureRouter } from '../../../auth/secure-router';
import type { PageKey } from '../../../domain/access';
import { validationFailed } from '../../../lib/errors';
import { MAX_UPLOAD_BYTES, xlsxResponse } from '../../../lib/spreadsheet';
import { paging, parseJson, parseQuery } from '../../../lib/validate';
import { actorOf, type Actor } from '../actor';
import {
  cityCreateBody,
  cityUpdateBody,
  courierCreateBody,
  courierUpdateBody,
  partyCreateBody,
  partyUpdateBody,
  productCreateBody,
  productUpdateBody,
} from '../masters/validation';
import { idParam } from './params';

const sort = z.string().max(30).optional();
const flag = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const partyQuery = z.object({
  ...paging,
  sort,
  type: z.enum(PARTY_TYPES).optional(),
  assignedUserId: z.string().max(64).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
});
const courierQuery = z.object({ ...paging, sort, type: z.enum(COURIER_TYPES).optional(), status: z.enum(COURIER_STATUSES).optional() });
const productQuery = z.object({
  ...paging,
  sort,
  boardType: z.enum(BOARD_TYPES).optional(),
  stockStatus: z.enum(STOCK_STATUSES).optional(),
});
const cityQuery = z.object({
  ...paging,
  sort,
  stateId: z.string().max(40).optional(),
  isCustom: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

const actor = (c: Context): Actor => actorOf(requireAuthContext(c as never).user);
const forceOf = (c: Context) => flag.parse(c.req.query('force'));

/** Splits list query params into ListQuery { q, sort, page, pageSize, filters }. */
function toListQuery<T extends { q?: string; sort?: string; page?: number; pageSize?: number }>(parsed: T) {
  const { q, sort, page, pageSize, ...filters } = parsed;
  return { q, sort, page, pageSize, filters };
}

export function partyRoutes(r: SecureRouter) {
  r.get('/parties', policy.page('parties'), async (c) =>
    c.json(await c.var.services.parties.list(toListQuery(parseQuery(c, partyQuery)))),
  );
  r.get('/parties/export', policy.page('parties', 'export'), async (c) => {
    const { page: _p, pageSize: _s, ...query } = toListQuery(parseQuery(c, partyQuery));
    const bytes = await c.var.services.parties.exportXlsx(actor(c), query);
    return xlsxResponse(c, bytes, 'PartyDatabase', c.var.services.clock());
  });
  r.get('/parties/assignees', policy.page('parties'), async (c) => c.json(await c.var.services.parties.assignees()));
  r.get('/parties/:id', policy.page('parties'), async (c) => c.json(await c.var.services.parties.get(idParam(c))));
  r.post('/parties', policy.page('parties', 'edit'), async (c) => {
    const body = await parseJson(c, partyCreateBody);
    return c.json(await c.var.services.parties.create(actor(c), body, { force: forceOf(c) }), 201);
  });
  r.patch('/parties/:id', policy.page('parties', 'edit'), async (c) => {
    const body = await parseJson(c, partyUpdateBody);
    return c.json(await c.var.services.parties.update(actor(c), idParam(c), body, { force: forceOf(c) }));
  });
  r.delete('/parties/:id', policy.page('parties', 'delete'), async (c) => {
    await c.var.services.parties.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });
}

export function courierRoutes(r: SecureRouter) {
  r.get('/couriers', policy.page('couriers'), async (c) =>
    c.json(await c.var.services.couriers.list(toListQuery(parseQuery(c, courierQuery)))),
  );
  // The dispatch form's dropdown. Users of the dispatch screen need it even without the couriers page.
  r.get('/couriers/options', policy.anyPage(['dispatch', 'couriers']), async (c) => {
    const { mode } = parseQuery(c, z.object({ mode: z.enum(DISPATCH_MODES) }));
    return c.json(await c.var.services.couriers.optionsForMode(mode));
  });
  r.get('/couriers/:id', policy.page('couriers'), async (c) => c.json(await c.var.services.couriers.get(idParam(c))));
  r.post('/couriers', policy.page('couriers', 'edit'), async (c) => {
    const body = await parseJson(c, courierCreateBody);
    return c.json(await c.var.services.couriers.create(actor(c), body), 201);
  });
  r.patch('/couriers/:id', policy.page('couriers', 'edit'), async (c) => {
    const body = await parseJson(c, courierUpdateBody);
    return c.json(await c.var.services.couriers.update(actor(c), idParam(c), body));
  });
  r.delete('/couriers/:id', policy.page('couriers', 'delete'), async (c) => {
    await c.var.services.couriers.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });
}

export function productRoutes(r: SecureRouter) {
  r.get('/products', policy.page('products'), async (c) =>
    c.json(await c.var.services.products.list(toListQuery(parseQuery(c, productQuery)))),
  );
  r.get('/products/summary', policy.page('products'), async (c) => c.json(await c.var.services.products.summary()));
  r.get('/products/export', policy.page('products', 'export'), async (c) => {
    const { page: _p, pageSize: _s, ...query } = toListQuery(parseQuery(c, productQuery));
    const bytes = await c.var.services.products.exportXlsx(actor(c), query);
    return xlsxResponse(c, bytes, 'ProductMaster', c.var.services.clock());
  });
  r.get('/products/import-template', policy.page('products'), (c) =>
    xlsxResponse(c, c.var.services.products.template(), 'ProductImportTemplate', c.var.services.clock()),
  );
  // multipart/form-data with a "file" field. ?commit=true writes; anything else is a dry-run preview.
  r.post('/products/import', policy.page('products', 'edit'), async (c) => {
    const commit = flag.parse(c.req.query('commit'));
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const file = form['file'];
    if (!(file instanceof File)) throw validationFailed('Attach the spreadsheet as a "file" form field');
    if (file.size === 0) throw validationFailed('The file is empty');
    if (file.size > MAX_UPLOAD_BYTES) throw validationFailed(`File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw validationFailed('Upload an .xlsx, .xls or .csv file');
    const bytes = new Uint8Array(await file.arrayBuffer());
    return c.json(await c.var.services.products.import(actor(c), bytes, { commit, fileName: file.name }));
  });
  r.get('/products/:id', policy.page('products'), async (c) => c.json(await c.var.services.products.get(idParam(c))));
  r.post('/products', policy.page('products', 'edit'), async (c) => {
    const body = await parseJson(c, productCreateBody);
    return c.json(await c.var.services.products.create(actor(c), body), 201);
  });
  r.patch('/products/:id', policy.page('products', 'edit'), async (c) => {
    const body = await parseJson(c, productUpdateBody);
    return c.json(await c.var.services.products.update(actor(c), idParam(c), body));
  });
  r.delete('/products/:id', policy.page('products', 'delete'), async (c) => {
    await c.var.services.products.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });
}

export function cityRoutes(r: SecureRouter) {
  // The city master is shared: Settings (SampleTrack) and the Vendors masters both manage it.
  const MASTER: PageKey[] = ['settings', 'vendor_masters'];
  // The party and vendor forms need states and city options; the city masters need them too.
  r.get('/states', policy.anyPage(['parties', 'vendors', ...MASTER]), async (c) => c.json(await c.var.services.cities.states()));
  r.get('/cities/options', policy.anyPage(['parties', 'vendors', ...MASTER]), async (c) => c.json(await c.var.services.cities.options()));
  // Vendor form: pincode → city and state.
  r.get('/cities/pincode/:pincode', policy.anyPage(['vendors', ...MASTER]), async (c) => {
    const pincode = c.req.param('pincode') ?? '';
    if (!/^[1-9][0-9]{5}$/.test(pincode)) throw validationFailed('Pincode must be 6 digits');
    return c.json(await c.var.services.cities.lookupPincode(pincode));
  });
  r.get('/cities', policy.anyPage(MASTER), async (c) =>
    c.json(await c.var.services.cities.list(toListQuery(parseQuery(c, cityQuery)))),
  );
  r.get('/cities/export', policy.anyPage(MASTER, 'export'), async (c) =>
    xlsxResponse(c, await c.var.services.cities.exportXlsx(actor(c)), 'CityStateMaster', c.var.services.clock()),
  );
  r.post('/cities', policy.anyPage(MASTER, 'edit'), async (c) => {
    const body = await parseJson(c, cityCreateBody);
    return c.json(await c.var.services.cities.add(actor(c), body), 201);
  });
  r.patch('/cities/:id', policy.anyPage(MASTER, 'edit'), async (c) => {
    const body = await parseJson(c, cityUpdateBody);
    return c.json(await c.var.services.cities.update(actor(c), idParam(c), body));
  });
  r.delete('/cities/:id', policy.anyPage(MASTER, 'delete'), async (c) => {
    await c.var.services.cities.remove(actor(c), idParam(c));
    return c.body(null, 204);
  });
}
