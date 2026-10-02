// Shared repo contract. Any DataLayer implementation must pass it.
// Today: memory (repo-contract.memory.test.ts). TODO(d1): add repo-contract.d1.test.ts against a local D1.
import { describe, expect, it } from 'vitest';
import type { Courier, Dispatch, Party, Product, SampleRequest, SampleRequestItem, State } from '../src/contracts/sampletrack';
import type { TncClause, Vendor, VendorCategory, VendorProduct } from '../src/contracts/vendors';
import type { PurchaseDocument, PurchaseOrder } from '../src/contracts/purchase';
import { purchaseEntry } from './helpers';
import { DEFAULT_ROLE_PERMISSIONS } from '../src/domain/access';
import { UniqueViolationError, type ActivityEntry, type DataLayer, type NewUser, type Session } from '../src/repos';

/** Returns an EMPTY data layer (no users, sessions, permissions or activity). */
export type DataLayerFactory = () => Promise<DataLayer>;

const at = (n: number) => new Date(Date.UTC(2026, 9, 1, 0, 0, n)).toISOString();

const user = (id: string, over: Partial<NewUser> = {}): NewUser => ({
  id,
  username: id,
  name: `Name ${id}`,
  email: null,
  phone: null,
  department: null,
  role: 'dispatch',
  status: 'Active',
  passwordHash: null,
  createdBy: null,
  createdAt: at(0),
  updatedAt: at(0),
  ...over,
});

const session = (id: string, userId: string, over: Partial<Session> = {}): Session => ({
  id,
  userId,
  tokenHash: `hash-${id}`,
  createdAt: at(0),
  lastSeenAt: at(0),
  expiresAt: at(9999),
  ip: null,
  userAgent: null,
  ...over,
});

const entry = (id: string, createdAt: string, over: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id,
  userId: null,
  userName: null,
  userRole: null,
  action: 'Login',
  entityType: null,
  entityId: null,
  details: `entry ${id}`,
  createdAt,
  ...over,
});

export function runRepoContract(name: string, makeEmpty: DataLayerFactory) {
  describe(`repo contract: ${name}`, () => {
    describe('users', () => {
      it('creates and reads back by id and by username (case-insensitive)', async () => {
        const { repos } = await makeEmpty();
        await repos.users.create(user('a', { username: 'Alice', email: 'a@x' }));
        expect(await repos.users.getById('a')).toMatchObject({ username: 'Alice', email: 'a@x', deletedAt: null });
        expect((await repos.users.getByUsername('aLiCe'))?.id).toBe('a');
        expect(await repos.users.getById('missing')).toBeNull();
      });

      it('enforces a unique username among live users, case-insensitively', async () => {
        const { repos } = await makeEmpty();
        await repos.users.create(user('a', { username: 'alice' }));
        await expect(repos.users.create(user('b', { username: 'ALICE' }))).rejects.toBeInstanceOf(UniqueViolationError);
        await repos.users.create(user('c', { username: 'carol' }));
        await expect(repos.users.update('c', { username: 'Alice', updatedAt: at(1) })).rejects.toBeInstanceOf(UniqueViolationError);
      });

      it('update merges fields and returns null for missing users', async () => {
        const { repos } = await makeEmpty();
        await repos.users.create(user('a'));
        const u = await repos.users.update('a', { name: 'New', status: 'Inactive', updatedAt: at(5) });
        expect(u).toMatchObject({ name: 'New', status: 'Inactive', username: 'a', updatedAt: at(5) });
        expect(await repos.users.update('nope', { name: 'x', updatedAt: at(5) })).toBeNull();
      });

      it('soft delete hides the user and frees the username', async () => {
        const { repos } = await makeEmpty();
        await repos.users.create(user('a', { username: 'alice' }));
        expect(await repos.users.softDelete('a', at(3))).toBe(true);
        expect(await repos.users.softDelete('a', at(4))).toBe(false);
        expect(await repos.users.getById('a')).toBeNull();
        expect(await repos.users.getByUsername('alice')).toBeNull();
        expect((await repos.users.list({})).total).toBe(0);
        await expect(repos.users.create(user('b', { username: 'alice' }))).resolves.toBeTruthy();
      });

      it('list: search, filters, sort and pagination', async () => {
        const { repos } = await makeEmpty();
        await repos.users.create(user('u1', { username: 'zed', name: 'Zed', role: 'admin', department: 'Ops' }));
        await repos.users.create(user('u2', { username: 'amy', name: 'Amy', role: 'marketing', email: 'amy@ops.in' }));
        await repos.users.create(user('u3', { username: 'bob', name: 'Bob', role: 'marketing', status: 'Inactive' }));

        expect((await repos.users.list({})).rows.map((u) => u.username)).toEqual(['amy', 'bob', 'zed']); // default: name
        expect((await repos.users.list({ q: 'OPS' })).rows.map((u) => u.id).sort()).toEqual(['u1', 'u2']);
        expect((await repos.users.list({ filters: { role: 'marketing', status: 'Active' } })).rows.map((u) => u.id)).toEqual(['u2']);
        expect((await repos.users.list({ sort: '-username' })).rows.map((u) => u.username)).toEqual(['zed', 'bob', 'amy']);
        expect((await repos.users.list({ sort: 'passwordHash' })).rows.map((u) => u.username)).toEqual(['amy', 'bob', 'zed']);
        const p2 = await repos.users.list({ page: 2, pageSize: 2 });
        expect(p2).toMatchObject({ total: 3 });
        expect(p2.rows.map((u) => u.username)).toEqual(['zed']);
      });

      it('returned rows are copies (callers cannot mutate storage)', async () => {
        const { repos } = await makeEmpty();
        const created = await repos.users.create(user('a'));
        created.name = 'mutated';
        (await repos.users.list({})).rows[0]!.name = 'mutated';
        expect((await repos.users.getById('a'))?.name).toBe('Name a');
      });

      it('counts by role and status, ignoring deleted users', async () => {
        const { repos } = await makeEmpty();
        await repos.users.create(user('a', { role: 'admin' }));
        await repos.users.create(user('b', { role: 'admin', status: 'Inactive' }));
        await repos.users.create(user('c', { role: 'admin' }));
        await repos.users.softDelete('c', at(1));
        const counts = await repos.users.countByRoleAndStatus();
        expect(counts.sort((x, y) => x.status.localeCompare(y.status))).toEqual([
          { role: 'admin', status: 'Active', count: 1 },
          { role: 'admin', status: 'Inactive', count: 1 },
        ]);
      });
    });

    describe('sessions', () => {
      it('create, get by hash, touch, delete, deleteByUser', async () => {
        const { repos } = await makeEmpty();
        await repos.sessions.create(session('s1', 'u1'));
        await repos.sessions.create(session('s2', 'u1'));
        await repos.sessions.create(session('s3', 'u2'));
        await expect(repos.sessions.create(session('s4', 'u2', { tokenHash: 'hash-s1' }))).rejects.toBeInstanceOf(UniqueViolationError);

        await repos.sessions.touch('s1', at(50));
        expect((await repos.sessions.getByTokenHash('hash-s1'))?.lastSeenAt).toBe(at(50));
        await repos.sessions.delete('s1');
        expect(await repos.sessions.getByTokenHash('hash-s1')).toBeNull();
        expect(await repos.sessions.deleteByUser('u1')).toBe(1);
        expect(await repos.sessions.getByTokenHash('hash-s3')).not.toBeNull();
      });
    });

    describe('role permissions', () => {
      it('upsert inserts, replaces (keeping createdAt), and listAll returns ROLES order', async () => {
        const { repos } = await makeEmpty();
        const row = (role: 'admin' | 'dispatch', ts: string) => ({
          role,
          permissions: DEFAULT_ROLE_PERMISSIONS[role],
          locked: false,
          createdAt: ts,
          updatedAt: ts,
          updatedBy: null,
        });
        await repos.rolePermissions.upsert(row('dispatch', at(1)));
        await repos.rolePermissions.upsert(row('admin', at(1)));
        await repos.rolePermissions.upsert({
          ...row('dispatch', at(9)),
          permissions: { pages: ['dashboard'], actions: [], widgets: [] },
          updatedBy: 'u1',
        });
        expect((await repos.rolePermissions.listAll()).map((r) => r.role)).toEqual(['admin', 'dispatch']);
        expect(await repos.rolePermissions.get('dispatch')).toMatchObject({
          createdAt: at(1),
          updatedAt: at(9),
          updatedBy: 'u1',
          permissions: { pages: ['dashboard'], actions: [], widgets: [] },
        });
        expect(await repos.rolePermissions.get('marketing')).toBeNull();
      });
    });

    describe('activity', () => {
      it('lists newest first with filters and a [from, to) range', async () => {
        const { repos } = await makeEmpty();
        await repos.activity.append(entry('e1', '2026-10-01T10:00:00.000Z', { userId: 'u1', userName: 'Asha' }));
        await repos.activity.append(entry('e2', '2026-10-02T10:00:00.000Z', { action: 'Edit', entityType: 'user' }));
        await repos.activity.append(entry('e3', '2026-10-03T10:00:00.000Z', { details: 'special thing' }));

        expect((await repos.activity.list({})).rows.map((e) => e.id)).toEqual(['e3', 'e2', 'e1']);
        expect((await repos.activity.list({ filters: { action: 'Edit' } })).rows.map((e) => e.id)).toEqual(['e2']);
        expect((await repos.activity.list({ filters: { userId: 'u1' } })).rows.map((e) => e.id)).toEqual(['e1']);
        expect((await repos.activity.list({ filters: { entityType: 'user' } })).rows.map((e) => e.id)).toEqual(['e2']);
        expect((await repos.activity.list({ filters: { from: '2026-10-02', to: '2026-10-03' } })).rows.map((e) => e.id)).toEqual(['e2']);
        expect((await repos.activity.list({ q: 'SPECIAL' })).rows.map((e) => e.id)).toEqual(['e3']);
        expect((await repos.activity.list({ q: 'asha' })).rows.map((e) => e.id)).toEqual(['e1']);
      });

      it('purgeBefore removes strictly older entries and reports the count', async () => {
        const { repos } = await makeEmpty();
        await repos.activity.append(entry('old', at(1)));
        await repos.activity.append(entry('edge', at(2)));
        await repos.activity.append(entry('new', at(3)));
        expect(await repos.activity.purgeBefore(at(2))).toBe(1);
        expect((await repos.activity.list({})).rows.map((e) => e.id)).toEqual(['new', 'edge']);
      });
    });

    describe('unit of work', () => {
      it('commits every write across repos', async () => {
        const { repos, uow } = await makeEmpty();
        await uow.run(async (tx) => {
          await tx.users.create(user('a'));
          await tx.activity.append(entry('e1', at(1)));
        });
        expect(await repos.users.getById('a')).not.toBeNull();
        expect((await repos.activity.list({})).total).toBe(1);
      });

      it('rolls back every write when the work throws', async () => {
        const { repos, uow } = await makeEmpty();
        await repos.users.create(user('keep'));
        await expect(
          uow.run(async (tx) => {
            await tx.users.create(user('a'));
            await tx.users.update('keep', { name: 'changed', updatedAt: at(1) });
            await tx.sessions.create(session('s1', 'a'));
            await tx.activity.append(entry('e1', at(1)));
            throw new Error('boom');
          }),
        ).rejects.toThrow('boom');
        expect(await repos.users.getById('a')).toBeNull();
        expect((await repos.users.getById('keep'))?.name).toBe('Name keep');
        expect(await repos.sessions.getByTokenHash('hash-s1')).toBeNull();
        expect((await repos.activity.list({})).total).toBe(0);
      });

      it('a unique violation inside the work rolls back the earlier writes', async () => {
        const { repos, uow } = await makeEmpty();
        await repos.users.create(user('a', { username: 'taken' }));
        await expect(
          uow.run(async (tx) => {
            await tx.activity.append(entry('e1', at(1)));
            await tx.users.create(user('b', { username: 'taken' }));
          }),
        ).rejects.toBeInstanceOf(UniqueViolationError);
        expect((await repos.activity.list({})).total).toBe(0);
      });

      it('returns the work’s result, and a nested run joins the outer one', async () => {
        const { repos, uow } = await makeEmpty();
        await expect(
          uow.run(async (tx) => {
            await tx.users.create(user('outer'));
            await uow.run(async (tx2) => tx2.users.create(user('inner')));
            throw new Error('outer fails');
          }),
        ).rejects.toThrow();
        expect(await repos.users.getById('inner')).toBeNull();
        expect(await uow.run(async () => 42)).toBe(42);
      });

      it('runs started at the same time each commit or roll back on their own', async () => {
        const { repos, uow } = await makeEmpty();
        const slow = uow.run(async (tx) => {
          await tx.users.create(user('slow'));
          await new Promise((r) => setTimeout(r, 5));
          throw new Error('slow fails');
        });
        const fast = uow.run(async (tx) => tx.users.create(user('fast')));
        await expect(slow).rejects.toThrow();
        await fast;
        expect(await repos.users.getById('fast')).not.toBeNull();
        expect(await repos.users.getById('slow')).toBeNull();
      });
    });
  });
}

/**
 * Contract for the master repos. `makeEmpty` must return an empty data layer.
 * States are seeded through the factory's `states` argument, because there is no StateRepo.create
 * (states come only from the migration).
 */
export interface MasterSeed {
  states: State[];
  requests?: SampleRequest[];
  requestItems?: SampleRequestItem[];
  dispatches?: Dispatch[];
}

export function runMasterRepoContract(name: string, makeWith: (seed: MasterSeed) => Promise<DataLayer>) {
  const audit = { createdBy: null, createdAt: at(0), updatedAt: at(0) };
  const party = (id: string, over: Partial<Party> = {}): Omit<Party, 'deletedAt'> => ({
    id,
    name: `Party ${id}`,
    contact: null,
    mobile: null,
    email: null,
    gst: null,
    address: null,
    city: null,
    state: null,
    pin: null,
    industry: null,
    type: 'Existing Customer',
    assignedUserId: null,
    remarks: null,
    ...audit,
    ...over,
  });
  const product = (id: string, over: Partial<Product> = {}): Omit<Product, 'deletedAt'> => ({
    id,
    code: id.toUpperCase(),
    name: `Product ${id}`,
    boardType: 'OSB',
    thicknessMm: null,
    size: null,
    category: null,
    unitPricePaise: 0,
    stockStatus: 'Available',
    description: null,
    ...audit,
    ...over,
  });
  const courier = (id: string, over: Partial<Courier> = {}): Omit<Courier, 'deletedAt'> => ({
    id,
    name: `Courier ${id}`,
    type: 'Courier',
    contact: null,
    mobile: null,
    email: null,
    coverage: null,
    trackingUrlTemplate: null,
    rating: null,
    status: 'Active',
    remarks: null,
    ...audit,
    ...over,
  });
  const states: State[] = [
    { id: 'st-gj', name: 'Gujarat', gstCode: '24', kind: 'State' },
    { id: 'st-mh', name: 'Maharashtra', gstCode: '27', kind: 'State' },
  ];
  const make = () => makeWith({ states });

  describe(`repo contract (masters): ${name}`, () => {
    it('parties: findByName ignores case/extra spaces and soft-deleted rows; filters by city/state ignore case', async () => {
      const { repos } = await make();
      await repos.parties.create(party('a', { name: 'Shree  Ganesh Ply', city: 'Rajkot', state: 'Gujarat', type: 'New Lead' }));
      await repos.parties.create(party('b', { name: 'Other', city: 'Pune', state: 'Maharashtra' }));
      expect((await repos.parties.findByName(' shree ganesh PLY')).map((p) => p.id)).toEqual(['a']);
      expect(await repos.parties.findByName('shree ganesh ply', 'a')).toEqual([]);
      expect((await repos.parties.list({ filters: { city: 'RAJKOT' } })).rows.map((p) => p.id)).toEqual(['a']);
      expect((await repos.parties.list({ filters: { type: 'New Lead' } })).total).toBe(1);
      expect((await repos.parties.list({ q: 'pune' })).rows.map((p) => p.id)).toEqual(['b']);
      await repos.parties.softDelete('a', at(1));
      expect(await repos.parties.findByName('shree ganesh ply')).toEqual([]);
    });

    it('parties: usedCities is distinct per (city, state), skips blanks and deleted rows', async () => {
      const { repos } = await make();
      await repos.parties.create(party('a', { city: 'Rajkot', state: 'Gujarat' }));
      await repos.parties.create(party('b', { city: ' rajkot ', state: 'gujarat' }));
      await repos.parties.create(party('c', { city: 'Rajkot', state: null }));
      await repos.parties.create(party('d', { city: '  ' }));
      await repos.parties.create(party('e', { city: 'Gone', state: 'Gujarat' }));
      await repos.parties.softDelete('e', at(1));
      const used = (await repos.parties.usedCities()).map((u) => `${u.city}|${u.state}`).sort();
      expect(used).toEqual(['Rajkot|Gujarat', 'Rajkot|null']);
    });

    it('couriers: listActive by type, sorted by name', async () => {
      const { repos } = await make();
      await repos.couriers.create(courier('z', { name: 'Zed', type: 'Transport' }));
      await repos.couriers.create(courier('a', { name: 'alpha', type: 'Transport' }));
      await repos.couriers.create(courier('x', { name: 'Off', type: 'Transport', status: 'Inactive' }));
      await repos.couriers.create(courier('b', { name: 'Bus', type: 'Bus' }));
      expect((await repos.couriers.listActive('Transport')).map((c) => c.id)).toEqual(['a', 'z']);
      expect((await repos.couriers.listActive()).map((c) => c.id)).toEqual(['a', 'b', 'z']);
    });

    it('products: unique code (case-insensitive, live only), getByCode, keys and board counts', async () => {
      const { repos } = await make();
      await repos.products.create(product('p1', { code: 'OSB-1', boardType: 'OSB' }));
      await repos.products.create(product('p2', { code: 'MDO-1', boardType: 'MDO' }));
      await expect(repos.products.create(product('p3', { code: 'osb-1' }))).rejects.toBeInstanceOf(UniqueViolationError);
      await expect(repos.products.update('p2', { code: 'OSB-1', updatedAt: at(1) })).rejects.toBeInstanceOf(UniqueViolationError);
      expect((await repos.products.getByCode('mdo-1'))?.id).toBe('p2');
      expect((await repos.products.countByBoardType()).sort((a, b) => a.boardType.localeCompare(b.boardType))).toEqual([
        { boardType: 'MDO', count: 1 },
        { boardType: 'OSB', count: 1 },
      ]);
      await repos.products.softDelete('p1', at(2));
      expect((await repos.products.listKeys()).map((k) => k.code)).toEqual(['MDO-1']);
      await expect(repos.products.create(product('p4', { code: 'OSB-1' }))).resolves.toBeTruthy();
    });

    it('states: listAll by name, lookup by id and case-insensitive name', async () => {
      const { repos } = await make();
      expect((await repos.states.listAll()).map((s) => s.name)).toEqual(['Gujarat', 'Maharashtra']);
      expect((await repos.states.getByName('GUJARAT'))?.id).toBe('st-gj');
      expect(await repos.states.getById('nope')).toBeNull();
    });

    it('cities: unique per (city, state) ignoring case; soft delete frees the name', async () => {
      const { repos } = await make();
      const city = (id: string, name: string, stateId: string) => ({ id, city: name, stateId, isCustom: true, pincodes: [] as string[], ...audit });
      await repos.cities.create(city('c1', 'Morbi', 'st-gj'));
      await expect(repos.cities.create(city('c2', 'MORBI', 'st-gj'))).rejects.toBeInstanceOf(UniqueViolationError);
      await repos.cities.create(city('c3', 'Morbi', 'st-mh'));
      expect((await repos.cities.find('morbi', 'st-gj'))?.id).toBe('c1');
      expect((await repos.cities.list({ filters: { stateId: 'st-mh' } })).rows.map((c) => c.id)).toEqual(['c3']);
      await repos.cities.softDelete('c1', at(1));
      expect((await repos.cities.listAll()).map((c) => c.id)).toEqual(['c3']);
      await expect(repos.cities.create(city('c4', 'Morbi', 'st-gj'))).resolves.toBeTruthy();
    });

    it('cities: pincode lookup ignores deleted cities; update keeps (city, state) unique', async () => {
      const { repos } = await make();
      const city = (id: string, name: string, pincodes: string[]) => ({ id, city: name, stateId: 'st-gj', isCustom: true, pincodes, ...audit });
      await repos.cities.create(city('c1', 'Morbi', ['363641']));
      await repos.cities.create(city('c2', 'Rajkot', ['360001']));
      expect((await repos.cities.findByPincode('363641'))?.id).toBe('c1');
      expect((await repos.cities.list({ q: '3600' })).rows.map((c) => c.id)).toEqual(['c2']);
      await expect(repos.cities.update('c2', { city: 'morbi', updatedAt: at(1) })).rejects.toBeInstanceOf(UniqueViolationError);
      expect((await repos.cities.update('c2', { pincodes: ['360001', '360002'], updatedAt: at(1) }))?.pincodes).toEqual(['360001', '360002']);
      await repos.cities.softDelete('c1', at(2));
      expect(await repos.cities.findByPincode('363641')).toBeNull();
    });

    it('usage: counts only live requests/dispatches (and live request items for products)', async () => {
      const del = at(5);
      const request = (id: string, partyId: string, deletedAt: string | null = null): SampleRequest => ({
        id,
        reqNo: id.toUpperCase(),
        date: '2026-10-01',
        partyId,
        purpose: null,
        priority: 'Normal',
        requiredDispatchDate: null,
        requestedByUserId: null,
        remarks: null,
        status: 'Pending',
        approvedBy: null,
        approvedAt: null,
        ...audit,
        deletedAt,
      });
      const line = (id: string, requestId: string, productId: string, deletedAt: string | null = null): SampleRequestItem => ({
        id,
        requestId,
        lineNo: Number(id.slice(-1)),
        productId,
        productName: 'x',
        board: null,
        thickness: null,
        size: null,
        qtyValue: null,
        qtyUnit: null,
        qtyRaw: null,
        ...audit,
        deletedAt,
      });
      const dispatch = (id: string, partyId: string, courierId: string | null, deletedAt: string | null = null): Dispatch => ({
        id,
        dspNo: id.toUpperCase(),
        date: '2026-10-01',
        partyId,
        mode: 'Courier',
        courierId,
        courierNameManual: null,
        trackingNo: null,
        vehicleNo: null,
        driverDetails: null,
        expectedDeliveryDate: null,
        freightPaise: 0,
        weightKg: null,
        dimensions: null,
        productDescription: null,
        linkedRequestId: null,
        remarks: null,
        status: 'Pending',
        ...audit,
        deletedAt,
      });
      const { repos } = await makeWith({
        states,
        requests: [request('r1', 'pa'), request('r2', 'pa'), request('r3', 'pa', del), request('r4', 'pb')],
        requestItems: [
          line('r1-1', 'r1', 'prod'),
          line('r1-2', 'r1', 'prod'), // same request twice: counts once
          line('r3-1', 'r3', 'prod'), // request deleted
          line('r4-1', 'r4', 'prod', del), // line deleted
        ],
        dispatches: [dispatch('d1', 'pa', 'cx'), dispatch('d2', 'pb', 'cx', del), dispatch('d3', 'pb', null)],
      });
      expect(await repos.usage.party('pa')).toEqual({ requests: 2, dispatches: 1 });
      expect(await repos.usage.party('pb')).toEqual({ requests: 1, dispatches: 1 });
      expect(await repos.usage.courier('cx')).toEqual({ requests: 0, dispatches: 1 });
      expect(await repos.usage.product('prod')).toEqual({ requests: 1, dispatches: 0 });
      expect(await repos.usage.party('none')).toEqual({ requests: 0, dispatches: 0 });
    });
  });
}

/** Contract for counters, requests and notifications. `makeEmpty` must return an empty data layer. */
export function runWorkflowRepoContract(name: string, makeEmpty: DataLayerFactory) {
  const audit = { createdBy: null, createdAt: at(0), updatedAt: at(0) };
  const party = (id: string, partyName: string): Omit<Party, 'deletedAt'> => ({
    id,
    name: partyName,
    contact: null,
    mobile: null,
    email: null,
    gst: null,
    address: null,
    city: null,
    state: null,
    pin: null,
    industry: null,
    type: 'Existing Customer',
    assignedUserId: null,
    remarks: null,
    ...audit,
  });
  const req = (id: string, reqNo: string, partyId: string, over: Partial<SampleRequest> = {}): Omit<SampleRequest, 'deletedAt'> => ({
    id,
    reqNo,
    date: '2026-10-01',
    partyId,
    purpose: null,
    priority: 'Normal',
    requiredDispatchDate: null,
    requestedByUserId: null,
    remarks: null,
    status: 'Pending',
    approvedBy: null,
    approvedAt: null,
    ...audit,
    ...over,
  });
  const item = (id: string, requestId: string, lineNo: number, productName: string): Omit<SampleRequestItem, 'deletedAt'> => ({
    id,
    requestId,
    lineNo,
    productId: null,
    productName,
    board: null,
    thickness: null,
    size: null,
    qtyValue: null,
    qtyUnit: null,
    qtyRaw: null,
    ...audit,
  });

  async function seeded() {
    const dl = await makeEmpty();
    const { repos } = dl;
    await repos.users.create(user('u1', { name: 'Asha Marketing', role: 'marketing' }));
    await repos.parties.create(party('pa', 'Alpha Ply'));
    await repos.parties.create(party('pb', 'Beta Boards'));
    await repos.requests.create(req('r1', 'REQ-0001', 'pa', { requestedByUserId: 'u1', createdAt: at(1) }), [
      item('i1', 'r1', 2, 'Teak'),
      item('i2', 'r1', 1, 'OSB 12'),
    ]);
    await repos.requests.create(req('r2', 'REQ-0002', 'pb', { status: 'Approved', date: '2026-10-05', createdAt: at(2) }), [
      item('i3', 'r2', 1, 'MDO'),
    ]);
    await repos.requests.create(req('r3', 'REQ-0010', 'pb', { createdAt: at(3) }), [item('i4', 'r3', 1, 'Teak')]);
    return dl;
  }

  describe(`repo contract (workflow): ${name}`, () => {
    it('counters: next increments from 0, per name; rolled back with the unit of work', async () => {
      const { repos, uow } = await makeEmpty();
      expect(await repos.counters.current('REQ')).toBe(0);
      expect(await repos.counters.next('REQ', at(1))).toBe(1);
      expect(await repos.counters.next('REQ', at(2))).toBe(2);
      expect(await repos.counters.next('DSP', at(2))).toBe(1);
      await expect(
        uow.run(async (tx) => {
          await tx.counters.next('REQ', at(3));
          throw new Error('insert failed');
        }),
      ).rejects.toThrow();
      expect(await repos.counters.current('REQ')).toBe(2);
    });

    it('requests: views join party, requester and ordered live lines', async () => {
      const { repos } = await seeded();
      const v = await repos.requests.getView('r1');
      expect(v).toMatchObject({ reqNo: 'REQ-0001', partyName: 'Alpha Ply', requestedByName: 'Asha Marketing' });
      expect(v!.items.map((i) => i.productName)).toEqual(['OSB 12', 'Teak']);
      await expect(repos.requests.create(req('rx', 'REQ-0001', 'pa'), [])).rejects.toBeInstanceOf(UniqueViolationError);
    });

    it('requests: search over number, party, products and requester; filters; numeric reqNo sort', async () => {
      const { repos } = await seeded();
      const ids = async (q: Parameters<typeof repos.requests.list>[0]) => (await repos.requests.list(q)).rows.map((r) => r.id);
      expect(await ids({})).toEqual(['r3', 'r2', 'r1']); // -createdAt
      expect(await ids({ q: 'req-0002' })).toEqual(['r2']);
      expect(await ids({ q: 'beta', sort: 'reqNo' })).toEqual(['r2', 'r3']);
      expect(await ids({ q: 'teak', sort: 'reqNo' })).toEqual(['r1', 'r3']);
      expect(await ids({ q: 'asha' })).toEqual(['r1']);
      expect(await ids({ sort: '-reqNo' })).toEqual(['r3', 'r2', 'r1']); // REQ-0010 > REQ-0002
      expect(await ids({ filters: { status: 'Approved' } })).toEqual(['r2']);
      expect(await ids({ filters: { dateFrom: '2026-10-02', dateTo: '2026-10-05' } })).toEqual(['r2']);
      expect(await repos.requests.countByStatus({ q: 'beta', filters: { status: 'Pending' } })).toEqual({
        Pending: 1,
        Approved: 1,
        Dispatched: 0,
        Delivered: 0,
      });
    });

    it('requests: update, replaceItems, guarded setStatus, soft delete', async () => {
      const { repos } = await seeded();
      expect(await repos.requests.update('r1', { purpose: 'Expo', updatedAt: at(9) })).toMatchObject({ purpose: 'Expo', status: 'Pending' });
      await repos.requests.replaceItems('r1', [item('i9', 'r1', 1, 'Hybrid')], at(9));
      expect((await repos.requests.getView('r1'))!.items.map((i) => i.productName)).toEqual(['Hybrid']);
      expect((await repos.requests.list({ q: 'teak' })).rows.map((r) => r.id)).toEqual(['r3']); // replaced lines no longer match

      expect(await repos.requests.setStatus('r1', ['Pending'], 'Approved', at(10))).toBe(true);
      expect(await repos.requests.setStatus('r1', ['Pending'], 'Approved', at(11))).toBe(false);
      expect((await repos.requests.getById('r1'))?.status).toBe('Approved');

      expect(await repos.requests.softDelete('r1', at(12))).toBe(true);
      expect(await repos.requests.getView('r1')).toBeNull();
      expect(await repos.requests.setStatus('r1', ['Approved'], 'Dispatched', at(13))).toBe(false);
      expect((await repos.requests.countByStatus({})).Approved).toBe(1);
    });

    it('dispatches: joined row, search, overdue filter, guarded setStatus, history order', async () => {
      const { repos } = await seeded();
      const d = (id: string, dspNo: string, over: Partial<Dispatch> = {}): Omit<Dispatch, 'deletedAt'> => ({
        id,
        dspNo,
        date: '2026-10-01',
        partyId: 'pa',
        mode: 'Courier',
        courierId: null,
        courierNameManual: 'Manual Co',
        trackingNo: null,
        vehicleNo: null,
        driverDetails: null,
        expectedDeliveryDate: null,
        freightPaise: 0,
        weightKg: 1,
        dimensions: null,
        productDescription: null,
        linkedRequestId: null,
        remarks: null,
        status: 'Pending',
        ...audit,
        ...over,
      });
      await repos.dispatches.create(d('d1', 'DSP-0001', { trackingNo: 'BD-77', linkedRequestId: 'r1', expectedDeliveryDate: '2026-10-03' }));
      await repos.dispatches.create(d('d2', 'DSP-0010', { partyId: 'pb', expectedDeliveryDate: '2026-10-03', status: 'Delivered' }));
      await expect(repos.dispatches.create(d('dx', 'DSP-0001'))).rejects.toBeInstanceOf(UniqueViolationError);

      expect(await repos.dispatches.getRow('d1')).toMatchObject({ partyName: 'Alpha Ply', courierName: 'Manual Co', courierTemplate: null, linkedRequestNo: 'REQ-0001' });
      const ids = async (q: Parameters<typeof repos.dispatches.list>[0]) => (await repos.dispatches.list(q)).rows.map((r) => r.id);
      expect(await ids({ q: 'bd-77' })).toEqual(['d1']);
      expect(await ids({ q: 'beta' })).toEqual(['d2']);
      expect(await ids({ sort: '-dspNo' })).toEqual(['d2', 'd1']);
      expect(await ids({ filters: { overdueBefore: '2026-10-04' } })).toEqual(['d1']); // d2 is Delivered
      expect(await ids({ filters: { overdueBefore: '2026-10-03' } })).toEqual([]);

      expect(await repos.dispatches.setStatus('d1', 'Packed', 'Dispatched', at(5))).toBe(false);
      expect(await repos.dispatches.setStatus('d1', 'Pending', 'Dispatched', at(5))).toBe(true);
      const h = (id: string, status: Dispatch['status'], changedAt: string) => ({
        id,
        dispatchId: 'd1',
        status,
        changedBy: 'u1',
        changedAt,
        note: null,
        ...audit,
      });
      await repos.dispatches.appendHistory(h('h2', 'Dispatched', at(5)));
      await repos.dispatches.appendHistory(h('h1', 'Pending', at(1)));
      expect((await repos.dispatches.history('d1')).map((x) => [x.id, x.changedByName])).toEqual([
        ['h1', 'Asha Marketing'],
        ['h2', 'Asha Marketing'],
      ]);
      expect(await repos.usage.requestDispatches('r1')).toBe(1);

      expect(await repos.dispatches.countByStatus({ filters: { status: 'Pending', partyId: 'pa' } })).toMatchObject({
        Pending: 0,
        Dispatched: 1,
        Delivered: 0,
      });
      expect((await repos.dispatches.countByStatus({})).Delivered).toBe(1);
      await repos.dispatches.appendHistory(h('h3', 'Dispatched', at(2)));
      expect(await repos.dispatches.latestStatusAt('Dispatched', ['d1', 'd2'])).toEqual({ d1: at(5) });
      expect(await repos.dispatches.latestStatusAt('Delivered', ['d1'])).toEqual({});

      await repos.dispatches.softDelete('d1', at(9));
      expect(await repos.dispatches.getRow('d1')).toBeNull();
      expect(await repos.usage.requestDispatches('r1')).toBe(0);
    });

    it('settings: getMany returns only existing keys; set inserts then replaces, keeping created*', async () => {
      const { repos } = await makeEmpty();
      await repos.settings.set('company.name', 'Acme', 'u1', at(1));
      await repos.settings.set('sheets.interval_min', 15, null, at(1));
      const replaced = await repos.settings.set('company.name', 'Acme LLP', 'u2', at(2));
      expect(replaced).toMatchObject({ value: 'Acme LLP', createdBy: 'u1', createdAt: at(1), updatedAt: at(2) });
      expect(await repos.settings.getMany(['company.name', 'sheets.interval_min', 'missing'])).toEqual({
        'company.name': 'Acme LLP',
        'sheets.interval_min': 15,
      });
    });

    it('notifications: create and list newest first with filters', async () => {
      const { repos } = await makeEmpty();
      const n = (id: string, createdAt: string, entityId: string | null) => ({
        id,
        type: 'info' as const,
        title: 'T',
        message: `m ${id}`,
        entityType: entityId ? ('request' as const) : null,
        entityId,
        targetUserId: null,
        createdBy: null,
        createdAt,
        updatedAt: createdAt,
      });
      await repos.notifications.create(n('n1', at(1), 'r1'));
      await repos.notifications.create(n('n2', at(2), null));
      expect((await repos.notifications.list({})).rows.map((x) => x.id)).toEqual(['n2', 'n1']);
      expect((await repos.notifications.list({ filters: { entityId: 'r1' } })).rows.map((x) => x.id)).toEqual(['n1']);

      // Per-user state.
      await repos.notifications.create({ ...n('n3', at(3), null), targetUserId: 'u2' });
      const ids = async (u: string, q = {}) => (await repos.notifications.listForUser(u, q)).rows.map((x) => [x.id, x.read]);
      expect(await ids('u1')).toEqual([['n2', false], ['n1', false]]);
      expect(await ids('u2')).toEqual([['n3', false], ['n2', false], ['n1', false]]);
      expect(await repos.notifications.markRead('u1', ['n1', 'n3'], at(5))).toBe(1); // n3 isn't visible to u1
      expect(await ids('u1')).toEqual([['n2', false], ['n1', true]]);
      expect(await repos.notifications.unreadCount('u1')).toBe(1);
      expect(await repos.notifications.unreadCount('u2')).toBe(3);
      expect(await ids('u1', { filters: { unread: true } })).toEqual([['n2', false]]);

      expect(await repos.notifications.markAllRead('u2', at(6), at(2))).toBe(2); // n1, n2; n3 is newer
      expect(await repos.notifications.unreadCount('u2')).toBe(1);

      expect(await repos.notifications.dismiss('u2', at(7), { ids: ['n3'] })).toBe(1);
      expect(await ids('u2')).toEqual([['n2', true], ['n1', true]]);
      expect(await repos.notifications.unreadCount('u2')).toBe(0);
      expect(await repos.notifications.dismiss('u1', at(8), {})).toBe(2);
      expect(await ids('u1')).toEqual([]);
      expect(await ids('u2')).toHaveLength(2); // u1's clear doesn't touch u2
      expect((await repos.notifications.list({})).total).toBe(3);
    });
  });
}

/** Vendors module repos. `make` returns an EMPTY data layer. */
export function runVendorRepoContract(name: string, make: DataLayerFactory) {
  const audit = { createdBy: null, createdAt: at(0), updatedAt: at(0) };
  const cat = (id: string, name: string, sortOrder: number): Omit<VendorCategory, 'deletedAt'> => ({
    id, name, icon: null, color: 'grey', description: null, sortOrder, status: 'active', notes: null, ...audit,
  });
  const product = (id: string, code: string, name: string, categoryId: string): Omit<VendorProduct, 'deletedAt'> => ({
    id, code, name, categoryId, unit: 'MT', altUnit: null, convFactor: null, hsn: null, gstRate: null, moq: null, leadTimeDays: null,
    description: null, notes: null, ...audit,
  });
  const vendor = (id: string, over: Partial<Vendor> = {}): Omit<Vendor, 'deletedAt'> => ({
    id, code: id.toUpperCase(), name: `Vendor ${id}`, type: null, yearEstablished: null, categoryIds: [], productIds: [],
    contact: null, designation: null, phone: null, email: null, address: null, pincode: null, city: null, state: null,
    website: null, gst: null, pan: null, msme: null, paymentTerms: null, bank: null, accountNo: null, ifsc: null, rating: null,
    notes: null, status: 'pending', submittedAt: null, approvedAt: null, approvedBy: null, activatedAt: null, activatedBy: null,
    blacklistReason: null, blacklistedAt: null, blacklistedBy: null, ...audit, ...over,
  });

  describe(`repo contract (vendors): ${name}`, () => {
    it('categories: listAll by sortOrder then name; names unique ignoring case among live rows', async () => {
      const { repos } = await make();
      await repos.vendorCategories.create(cat('b', 'Resin', 2));
      await repos.vendorCategories.create(cat('a', 'Timber', 1));
      await repos.vendorCategories.create(cat('c', 'Packaging', 2));
      expect((await repos.vendorCategories.listAll()).map((c) => c.id)).toEqual(['a', 'c', 'b']);
      await expect(repos.vendorCategories.create(cat('d', 'TIMBER', 3))).rejects.toBeInstanceOf(UniqueViolationError);
      expect((await repos.vendorCategories.getByName(' resin '))?.id).toBe('b');
      await repos.vendorCategories.softDelete('a', at(1));
      await expect(repos.vendorCategories.create(cat('e', 'Timber', 3))).resolves.toBeTruthy();
    });

    it('products: code and name unique; filter by category; count per category', async () => {
      const { repos } = await make();
      await repos.vendorProducts.create(product('p1', 'P-1', 'MDI Resin', 'c1'));
      await repos.vendorProducts.create(product('p2', 'P-2', 'Dry Strands', 'c2'));
      await expect(repos.vendorProducts.create(product('p3', 'p-1', 'Other', 'c1'))).rejects.toBeInstanceOf(UniqueViolationError);
      await expect(repos.vendorProducts.create(product('p4', 'P-4', 'mdi resin', 'c1'))).rejects.toBeInstanceOf(UniqueViolationError);
      expect((await repos.vendorProducts.list({ filters: { categoryId: 'c2' } })).rows.map((p) => p.id)).toEqual(['p2']);
      expect((await repos.vendorProducts.listAll()).map((p) => p.id)).toEqual(['p2', 'p1']);
      expect(Object.fromEntries(await repos.vendorProducts.countByCategory())).toEqual({ c1: 1, c2: 1 });
    });

    it('vendors: filters (status, categoryId, state ignoring case), code unique, counts', async () => {
      const { repos } = await make();
      await repos.vendors.create(vendor('v1', { status: 'active', categoryIds: ['c1'], productIds: ['p1'], state: 'Gujarat', rating: 4 }));
      await repos.vendors.create(vendor('v2', { categoryIds: ['c1', 'c2'], productIds: ['p1', 'p2'], state: 'Maharashtra', rating: 5 }));
      await repos.vendors.create(vendor('v3', { status: 'blacklisted', categoryIds: ['c2'] }));
      await expect(repos.vendors.create(vendor('v4', { code: 'v1' }))).rejects.toBeInstanceOf(UniqueViolationError);
      const ids = async (filters: object, sort?: string) => (await repos.vendors.list({ filters, sort })).rows.map((v) => v.id);
      expect(await ids({ status: 'active' })).toEqual(['v1']);
      expect(await ids({ categoryId: 'c1' }, '-rating')).toEqual(['v2', 'v1']);
      expect(await ids({ state: 'gujarat' })).toEqual(['v1']);
      expect(await repos.vendors.countByStatus()).toEqual({ pending: 1, approved: 0, active: 1, inactive: 0, blacklisted: 1 });
      expect(await repos.vendors.countUsingCategory('c2')).toBe(2);
      expect(await repos.vendors.countUsingProduct('p1')).toBe(2);
      expect((await repos.vendors.findByName('VENDOR  v2')).map((v) => v.id)).toEqual(['v2']);
      // Link lists round-trip in the order given.
      expect((await repos.vendors.update('v2', { productIds: ['p2', 'p1'], updatedAt: at(1) }))?.productIds).toEqual(['p2', 'p1']);
      await repos.vendors.softDelete('v2', at(2));
      expect(await repos.vendors.countUsingProduct('p1')).toBe(1);
      expect((await repos.vendors.listAll()).map((v) => v.id).sort()).toEqual(['v1', 'v3']);
    });

    it('tnc: search title and body; filter category', async () => {
      const { repos } = await make();
      const tnc = (id: string, title: string, category: TncClause['category'], body: string): Omit<TncClause, 'deletedAt'> => ({
        id, title, category, version: '1.0', body, summary: null, status: 'active', appliesTo: 'all', notes: null, ...audit,
      });
      await repos.tnc.create(tnc('t1', 'Payment', 'Payment', 'Pay in 30 days'));
      await repos.tnc.create(tnc('t2', 'Warranty', 'Warranty', 'Twelve months'));
      expect((await repos.tnc.list({ q: 'twelve' })).rows.map((t) => t.id)).toEqual(['t2']);
      expect((await repos.tnc.list({ filters: { category: 'Payment' } })).rows.map((t) => t.id)).toEqual(['t1']);
    });
  });
}

/** Purchase module repos. `make` returns an EMPTY data layer. */
export function runPurchaseRepoContract(name: string, make: DataLayerFactory) {
  const audit = { createdBy: null, createdAt: at(0), updatedAt: at(0) };
  const { deletedAt: _d, ...e } = purchaseEntry('x');
  const entry = (id: string, over: Partial<typeof e> = {}) => ({ ...e, id, ...over });

  describe(`repo contract (purchase): ${name}`, () => {
    it('entries: FY and month filters, date range oldest first, invoice lookup ignoring case and spaces, lot numbers', async () => {
      const { repos } = await make();
      await repos.purchaseEntries.create(entry('a', { date: '2026-03-31', lotNo: 'N09' }));
      await repos.purchaseEntries.create(entry('b', { date: '2026-04-01', lotNo: 'N01', invoiceNo: 'GT/1/26-27' }));
      await repos.purchaseEntries.create(entry('c', { date: '2026-05-10', lotNo: 'N02', material: 'resin' }));
      const ids = async (filters: object) => (await repos.purchaseEntries.list({ filters })).rows.map((r) => r.id);
      expect(await ids({ fy: '2026-27' })).toEqual(['c', 'b']);
      expect(await ids({ month: '2026-03' })).toEqual(['a']);
      expect((await repos.purchaseEntries.listBetween('2026-03-01', '2026-04-30')).map((r) => r.id)).toEqual(['a', 'b']);
      expect((await repos.purchaseEntries.findByInvoice('TM  nilgiri supplier', 'gt/1/ 26-27')).map((r) => r.id)).toEqual(['b']);
      expect(await repos.purchaseEntries.lotNos('nilgiri', '2026-04-01', '2027-03-31')).toEqual(['N01']);
      await repos.purchaseEntries.softDelete('b', at(1));
      expect(await ids({ fy: '2026-27' })).toEqual(['c']);
    });

    it('orders: PO number unique ignoring case; listAll newest first by material', async () => {
      const { repos } = await make();
      const po = (id: string, poNo: string, date: string, material: PurchaseOrder['material'] = 'nilgiri'): Omit<PurchaseOrder, 'deletedAt'> => ({
        id, poNo, date, material, vendorId: null, vendorName: 'V', qty: 1, ratePaise: 1, remarks: null, tncIds: [], status: 'pending', approvedBy: null, approvedAt: null, ...audit,
      });
      await repos.purchaseOrders.create(po('p1', 'PO-1', '2026-04-01'));
      await repos.purchaseOrders.create(po('p2', 'PO-2', '2026-05-01'));
      await repos.purchaseOrders.create(po('p3', 'PO-3', '2026-06-01', 'resin'));
      await expect(repos.purchaseOrders.create(po('p4', 'po-1', '2026-04-01'))).rejects.toBeInstanceOf(UniqueViolationError);
      expect((await repos.purchaseOrders.listAll({ material: 'nilgiri' })).map((p) => p.id)).toEqual(['p2', 'p1']);
      expect((await repos.purchaseOrders.getByPoNo('po-3'))?.id).toBe('p3');
    });

    it('opening stock put keeps createdAt; consumption per FY and key', async () => {
      const { repos } = await make();
      const os = { fy: '2026-27', asOnDate: '2026-03-31', items: [], status: 'draft' as const, approvedBy: null, approvedAt: null, ...audit };
      await repos.openingStock.put(os);
      const again = await repos.openingStock.put({ ...os, status: 'pending', createdAt: at(5), updatedAt: at(5) });
      expect(again).toMatchObject({ status: 'pending', createdAt: at(0), updatedAt: at(5) });
      await repos.consumption.set('2026-27', 'resin', 10, null, at(1));
      await repos.consumption.set('2026-27', 'resin', 12, null, at(2));
      await repos.consumption.set('2025-26', 'resin', 99, null, at(2));
      expect(await repos.consumption.forFy('2026-27')).toEqual({ resin: 12 });
    });

    it('documents: counts per entry and type ignore deleted rows', async () => {
      const { repos } = await make();
      const doc = (id: string, entryId: string | null, type: PurchaseDocument['type']): Omit<PurchaseDocument, 'deletedAt'> => ({
        id, name: `${id}.pdf`, type, mime: 'application/pdf', sizeBytes: 1, blobKey: id, entryId, ...audit,
      });
      await repos.purchaseDocuments.create(doc('d1', 'e1', 'Invoice'));
      await repos.purchaseDocuments.create(doc('d2', 'e1', 'Photo'));
      await repos.purchaseDocuments.create(doc('d3', null, 'Invoice'));
      await repos.purchaseDocuments.softDelete('d2', at(1));
      expect(Object.fromEntries(await repos.purchaseDocuments.countByEntry(['e1', 'e2']))).toEqual({ e1: 1 });
      expect(await repos.purchaseDocuments.countByType()).toEqual({ Invoice: 2 });
    });

    it('types: unique per kind ignoring case', async () => {
      const { repos } = await make();
      const t = (id: string, kind: 'nilgiri_species' | 'face_veneer', n: string) => ({ id, kind, name: n, sortOrder: 1, ...audit });
      await repos.purchaseTypes.create(t('t1', 'face_veneer', 'Other'));
      await repos.purchaseTypes.create(t('t2', 'nilgiri_species', 'Other'));
      await expect(repos.purchaseTypes.create(t('t3', 'face_veneer', 'OTHER'))).rejects.toBeInstanceOf(UniqueViolationError);
      expect((await repos.purchaseTypes.listAll('face_veneer')).map((x) => x.id)).toEqual(['t1']);
    });
  });
}
