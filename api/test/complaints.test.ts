import { describe, expect, it } from 'vitest';
import { isOpenStatus } from '../src/contracts/complaints';
import { buildSeed } from '../src/seed';
import { upgradeSnapshot } from '../src/seed/upgrades';
import { makeTestApp, T0 } from './helpers';

const CP = '/api/complaints';
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10];
const MP4 = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32];

async function as(role = 'admin') {
  const t = await makeTestApp();
  const cookie = await t.login(role);
  const call = (method: string, path: string, body?: unknown) => t.request(method, `${CP}${path}`, { cookie, body });
  const json = async (method: string, path: string, body?: unknown) => (await call(method, path, body)).json();
  const form = (path: string, files: [number[], string][], text?: string) => {
    const f = new FormData();
    for (const [bytes, name] of files) f.append('file', new File([new Uint8Array(bytes)], name));
    if (text !== undefined) f.append('text', text);
    return t.request('POST', `${CP}${path}`, { cookie, form: f });
  };
  return { t, cookie, call, json, form };
}
const paths = async (res: Response) => ((await res.json()) as { error: { details: { path: string }[] } }).error.details.map((d) => d.path);
const ids = (r: { rows: { id: string }[] }) => r.rows.map((x) => x.id);
const base = { salesman: 'Suresh Kumar', customerName: 'Delta Traders', material: 'Plywood', category: 'Quality Issue', description: 'Boards warped', recipientId: 'cpr-jimit' };

describe('rules', () => {
  it('Open and In Progress still need action', () => {
    expect(['Open', 'In Progress', 'Resolved', 'Closed'].map((s) => isOpenStatus(s as never))).toEqual([true, true, false, false]);
  });
});

describe('register', () => {
  it('new complaint: required fields, CMP number per FY of its date, the recipient snapshot and the first timeline entry', async () => {
    const { call, json } = await as('marketing');
    expect(await paths(await call('POST', '/complaints', {}))).toEqual(['salesman', 'customerName', 'material', 'category', 'description']);
    expect(await paths(await call('POST', '/complaints', { ...base, recipientId: null }))).toEqual(['recipientId']);
    expect(await paths(await call('POST', '/complaints', { ...base, recipientId: 'cpr-old' }))).toEqual(['recipientId']);
    expect(await paths(await call('POST', '/complaints', { ...base, date: '2026-10-02' }))).toEqual(['date']);
    const c = await json('POST', '/complaints', base);
    expect(c).toMatchObject({ complaintNo: 'CMP/26-27/0004', date: '2026-10-01', priority: 'Medium', status: 'Open', recipientName: 'Jimit Mehta', recipientEmail: 'jimit@strandply.in', customerId: null, photos: [] });
    expect(c.timeline).toEqual([expect.objectContaining({ type: 'created', byName: 'Marketing User', text: 'Complaint registered · notified Jimit Mehta (jimit@strandply.in)' })]);
    const old = await json('POST', '/complaints', { ...base, date: '2026-03-31', recipientId: null, recipientEmail: 'qa@party.in' });
    expect(old).toMatchObject({ complaintNo: 'CMP/25-26/0002', recipientName: 'Other recipient', recipientEmail: 'qa@party.in' });
  });

  it('links to a Sales party and one of its invoices', async () => {
    const { call, json } = await as();
    expect((await json('POST', '/complaints', { ...base, customerId: 'slc-g', customerName: 'GUJARAT TRADERS', invoiceId: 'inv-1' })).invoiceNo).toBe('SPL/01/26-27');
    expect(await paths(await call('POST', '/complaints', { ...base, customerId: 'slc-m', invoiceId: 'inv-1' }))).toEqual(['invoiceId']);
    expect(await paths(await call('POST', '/complaints', { ...base, customerId: 'nope' }))).toEqual(['customerId']);
    expect(await json('PATCH', '/complaints/cmp-a', { invoiceId: null })).toMatchObject({ invoiceId: null, invoiceNo: null });
    expect((await json('GET', '/party-invoices?customerId=slc-g')).map((i: { invNo: string }) => i.invNo)).toEqual(expect.arrayContaining(['SPL/01/26-27', 'SPL/02/26-27']));
    expect(await json('GET', '/party-invoices?customerId=slc-x')).toEqual([]);
  });

  it('edits are logged by what changed; a no-op adds nothing', async () => {
    const { json } = await as('marketing');
    const c = await json('PATCH', '/complaints/cmp-c', { priority: 'High', description: 'Only 116 of 120 sheets', recipientId: 'cpr-sinha' });
    expect(c.timeline.at(-1)).toMatchObject({ type: 'edited', text: 'Edited priority, description, recipient.' });
    expect(c).toMatchObject({ recipientName: 'P K Sinha', recipientEmail: null });
    expect((await json('PATCH', '/complaints/cmp-c', { priority: 'High' })).timeline).toHaveLength(2);
  });

  it('status with a note; resolving stamps the date, closing keeps it, reopening clears it', async () => {
    const { call, json } = await as('marketing');
    expect((await call('POST', '/complaints/cmp-c/status', { status: 'Open' })).status).toBe(409);
    const r = await json('POST', '/complaints/cmp-c/status', { status: 'Resolved', note: 'Short sheets sent.' });
    expect(r).toMatchObject({ status: 'Resolved', resolvedOn: '2026-10-01' });
    expect(r.timeline.at(-1).text).toBe('Status changed from Open to Resolved. Short sheets sent.');
    expect((await json('POST', '/complaints/cmp-a/status', { status: 'Closed' })).resolvedOn).toBe('2026-09-14');
    expect((await json('POST', '/complaints/cmp-a/status', { status: 'In Progress' })).resolvedOn).toBeNull();
  });

  it('photos: images only, up to six, served back and removable', async () => {
    const { call, form, json } = await as('marketing');
    expect((await form('/complaints/cmp-c/photos', [[MP4, 'clip.mp4']])).status).toBe(422);
    expect((await form('/complaints/cmp-c/photos', [[[1, 2, 3, 4], 'fake.jpg']])).status).toBe(422);
    const up = await (await form('/complaints/cmp-c/photos', Array.from({ length: 5 }, (_, i): [number[], string] => [JPG, `p${i}.jpg`]))).json();
    expect(up.photos).toHaveLength(5);
    expect(up.photos[0]).not.toHaveProperty('blobKey');
    expect((await form('/complaints/cmp-c/photos', [[JPG, 'a.jpg'], [JPG, 'b.jpg']])).status).toBe(422);
    const file = await call('GET', `/complaints/cmp-c/files/${up.photos[0].id}`);
    expect([file.status, file.headers.get('content-type')]).toEqual([200, 'image/jpeg']);
    expect((await json('DELETE', `/complaints/cmp-c/photos/${up.photos[0].id}`)).photos).toHaveLength(4);
  });

  it('comments carry text, photos and videos on the timeline', async () => {
    const { call, form } = await as('marketing');
    expect((await form('/complaints/cmp-b/comments', [], ' ')).status).toBe(422);
    const c = await (await form('/complaints/cmp-b/comments', [[JPG, 'site.jpg'], [MP4, 'walkround.mp4']], 'Visited the site with QA')).json();
    const e = c.timeline.at(-1);
    expect(e).toMatchObject({ type: 'comment', text: 'Visited the site with QA', byName: 'Marketing User' });
    expect(e.files.map((f: { kind: string; mime: string }) => [f.kind, f.mime])).toEqual([['photo', 'image/jpeg'], ['video', 'video/mp4']]);
    expect((await call('GET', `/complaints/cmp-b/files/${e.files[1].id}`)).headers.get('content-type')).toBe('video/mp4');
  });

  it('list filters and search; delete hides it', async () => {
    const { call, json } = await as();
    expect(ids(await json('GET', '/complaints'))).toEqual(['cmp-c', 'cmp-b', 'cmp-a', 'cmp-d']);
    expect(ids(await json('GET', '/complaints?open=true'))).toEqual(['cmp-c', 'cmp-b']);
    expect(ids(await json('GET', '/complaints?q=patel'))).toEqual(['cmp-b', 'cmp-d']);
    expect(ids(await json('GET', '/complaints?priority=Critical'))).toEqual(['cmp-b']);
    expect(ids(await json('GET', '/complaints?from=2026-09-15&material=OSB%20Board'))).toEqual(['cmp-c']);
    expect((await call('DELETE', '/complaints/cmp-d')).status).toBe(204);
    expect((await call('GET', '/complaints/cmp-d')).status).toBe(404);
  });
});

describe('meta, recipients, dashboard and reports', () => {
  it('meta: Sales parties then names typed on complaints; salesmen; active recipients', async () => {
    const { json } = await as('marketing');
    const m = await json('GET', '/meta');
    expect(m.parties.map((p: { id: string | null; name: string }) => [p.id, p.name])).toEqual([['slc-g', 'GUJARAT TRADERS'], ['slc-m', 'MAHARASHTRA BOARDS'], ['slc-x', 'UNUSED PARTY'], [null, 'Patel Plywood']]);
    expect(m.salesmen).toEqual(expect.arrayContaining(['Kaushik Kothari', 'Suresh Kumar']));
    expect(m.recipients.map((r: { id: string }) => r.id)).toEqual(['cpr-jimit', 'cpr-sinha']);
  });

  it('recipients: unique names', async () => {
    const { call, json } = await as();
    expect((await call('POST', '/recipients', { name: ' jimit mehta ' })).status).toBe(409);
    expect(await json('POST', '/recipients', { name: 'Q A Head', role: 'Quality', email: 'qa@strandply.in' })).toMatchObject({ name: 'Q A Head', active: true });
    expect(await paths(await call('POST', '/recipients', { name: 'X', email: 'not-an-email' }))).toEqual(['email']);
  });

  it('dashboard: counts by status, open criticals, recent complaints, categories', async () => {
    const { json } = await as('marketing');
    const d = await json('GET', '/dashboard');
    expect(d).toMatchObject({ total: 4, open: 1, inProgress: 1, resolved: 1, closed: 1, critical: 1 });
    expect(d.recent.map((c: { id: string }) => c.id)).toEqual(['cmp-c', 'cmp-b', 'cmp-a', 'cmp-d']);
  });

  it('reports: party-, issue-, material-, salesman- and month-wise for a FY or dates; average days to resolve', async () => {
    const { json } = await as('management');
    const r = await json('GET', '/reports?fy=2026-27');
    expect(r).toMatchObject({ total: 3, open: 2, resolved: 1, avgDaysToResolve: 4, years: ['2026-27', '2025-26'] });
    expect(r.byParty).toEqual([{ name: 'GUJARAT TRADERS', total: 2, open: 1, resolved: 1 }, { name: 'Patel Plywood', total: 1, open: 1, resolved: 0 }]);
    expect(r.byCategory.map((x: { name: string; share: number }) => [x.name, x.share])).toEqual([['Damage in Transit', 33.3], ['Quality Issue', 33.3], ['Quantity Shortage', 33.3]]);
    expect(r.byMonth).toEqual([{ name: '2026-09', value: 3 }]);
    expect((await json('GET', '/reports')).avgDaysToResolve).toBe(4.5);
    expect((await json('GET', '/reports?from=2026-09-15')).total).toBe(2);
  });

  it('print carries the company block and is logged', async () => {
    const { json } = await as('marketing');
    const p = await json('GET', '/complaints/cmp-a/print');
    expect(p.complaint.complaintNo).toBe('CMP/26-27/0001');
    expect(p.company.name).toBeTruthy();
    expect((await json('GET', '/audit')).rows[0]).toMatchObject({ action: 'Print', details: 'Printed CMP/26-27/0001' });
  });
});

describe('seed and upgrade', () => {
  it('the legacy recipients everywhere; demo complaints in dev', () => {
    const prod = buildSeed({ devUsers: false, at: T0.toISOString() });
    expect(prod.cpRecipients.map((r) => r.name)).toEqual(['Jimit Mehta', 'P K Sinha']);
    expect(prod.complaints).toEqual([]);
    const dev = buildSeed({ devUsers: true, at: T0.toISOString() });
    expect(dev.complaints).toHaveLength(3);
    expect(dev.counters.find((c) => c.name === 'CP-2026-27')?.lastValue).toBe(3);
  });

  it('0015 grants the complaints pages (marketing raises them) and adds the recipients once', () => {
    const seed = buildSeed({ devUsers: false, at: T0.toISOString() });
    const old = structuredClone(seed) as Partial<typeof seed>;
    old.upgrades = seed.upgrades.filter((u) => u.name !== '0015_complaints');
    for (const r of old.rolePermissions!) r.permissions.pages = r.permissions.pages.filter((p) => !p.startsWith('complaints_'));
    delete old.cpRecipients;
    const up = upgradeSnapshot(old, seed, T0.toISOString());
    const pages = (role: string) => up.rolePermissions!.find((r) => r.role === role)!.permissions.pages.filter((p) => p.startsWith('complaints_'));
    expect(pages('marketing')).toEqual(['complaints_dashboard', 'complaints_register']);
    expect(pages('management')).toEqual(['complaints_dashboard', 'complaints_register', 'complaints_reports']);
    expect(pages('dispatch')).toEqual([]);
    expect(up.cpRecipients).toHaveLength(2);
    expect(upgradeSnapshot(up, seed, T0.toISOString()).cpRecipients).toHaveLength(2);
  });
});
