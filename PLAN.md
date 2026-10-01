# Strandply ERP — build plan

Status: **plan only, nothing built yet.** Review the "Open questions" section at the bottom first. Some answers there change later phases.

Sources: `design-reference/project/*.dc.html` (8 screens + shared Sidebar/Topbar), `DESIGN_NOTES.md`, `canvas.json`, and the two screenshots in `design-reference/current-ui/` (the app being replaced).

---

## 1. What we're building (from the mockups)

- **One system for two firms**: *Strandply LLP* and *OSB Unit*. You pick a firm at sign-in. Admins can also view "Both firms" (topbar). Figures are always shown **per firm** and are never summed across firms (Sales dashboard, Home "At a glance").
- **18 modules** in the sidebar, in this order: Home, Purchase, Vendors, Stores, Stock (SKU), Production, Sales, Samples, Transport, Complaints, Maintenance, Electricity, DWPAS, HR, Payroll, Accounts, Reports, Admin. Each module has sub-pages. The mockups spell out sub-pages for Stores, Sales, Accounts and Reports only.
- **Workflow documents** with FY-scoped numbering: `LLP/26-27/0096`, `LLP/SO/26-27/0052`, `GRN/26-27/0043`, `MRN/26-27/0041`, `VB/26-27/0107`. A document moves through statuses, and a step can be applied in bulk (GRN: Draft → Reviewed → Approved → Accounted / Rejected). In a bulk action each row is checked on its own: rows that can move do, and rows that can't are skipped and listed.
- **Cross-module reporting**: Cost per board joins production shifts, material consumption at weighted-average purchase cost, main-meter power × tariff, the PGVCL bill, labour, maintenance and other costs.
- **GST-heavy accounts**: tax invoices with IRN/e-way bill, e-Invoice JSON, and GSTR-2B import and matching (same GSTIN + normalised invoice no.).
- **Home work list**: a "Pending my action" list for the user's role (with a Module column and overdue items flagged), alerts, Go-to shortcuts, and an "At a glance" card per module.
- **Global search (Ctrl K)**: grouped results, type filters (All, Invoices, Sales orders, GRNs, Customers, Vendors, Employees), keyboard navigation and a result count.

### Design system (taken from the mockups)
| Token | Value | Use |
|---|---|---|
| `brand` | `#D71920` | **Scarce.** One primary button per screen, active nav, the single "bad" KPI, current-month bar |
| `brand-soft` / `brand-tint` | `#FFF1F2` / `#FFF7F7` | Active nav bg, selected table rows |
| `ink` | `#172033` | Primary text, doc numbers (not red) |
| `muted` / `subtle` | `#667085` / `#98A2B3` | Secondary text, meta |
| `line` / `line-soft` | `#E6E8EC` / `#EEF0F3` | Borders, dividers |
| `page` / `surface-2` / `surface` | `#F8F9FA` / `#F5F6F8` / `#FFFFFF` | App bg, neutral icon circles, cards |
| `ok` | `#16A34A` on `#F0FDF4` | Accounted, Active, Completed, Matched |
| `warn` | `#D97706` on `#FFFBEB` | Reviewed, Open, flagged, low stock |
| `info` | `#7C3AED` on `#F5F3FF` | Approved, Partial. **No blue anywhere** |
| `neutral` | `#667085` on `#F5F6F8` | Draft, Cancelled |
| `bad` | `#D71920` on `#FFF1F2` | Rejected, overdue, ITC at risk |

Font: Inter at 400/500/600/700. Type scale: 11 / 12 / 13 (body) / 14 / 15 / 24 (h1). Radii: 8 for controls and cards, 12 for large cards, 20 for pills. Icons: outline, 1.5px stroke, Lucide-style. Buttons come in four variants: `primary` (red, one per view), `secondary`, `danger-outline` (Cancel/Reject) and `ghost`. Dark mode swaps the same tokens (Sales dashboard note). Tokens are CSS variables so the swap is free.

Status → pill tone mapping lives in **one** place (`web/src/lib/status.ts`) so "red stays scarce" is enforced by code, not by discipline.

---

## 2. Folder structure

```
strandply-new/
├─ package.json              # npm workspaces: web, api, db, shared
├─ .env.example
├─ README.md
├─ PLAN.md
├─ tsconfig.base.json
├─ shared/                   # (proposed 4th workspace, see note)
│  └─ src/
│     ├─ schemas/            # zod schemas per module (grn.ts, invoice.ts …)
│     ├─ enums.ts            # statuses, doc types, firm codes, permissions
│     ├─ money.ts            # paise <-> rupees, Indian grouping (1,10,719.40), amount-in-words
│     └─ fy.ts               # financial-year helpers ("26-27"), date formats
├─ db/
│  ├─ wrangler.toml          # D1 binding "DB", migrations_dir, local persist path
│  ├─ migrations/            # 0001_core.sql, 0002_masters.sql, 0003_stores.sql … (wrangler-managed)
│  ├─ seed/
│  │  ├─ seed.ts             # generates SQL from fixtures → wrangler d1 execute
│  │  └─ fixtures/           # firms, admin user, roles, sample masters (mockup data)
│  └─ scripts/               # reset-local.sh, new-migration.sh
├─ api/
│  ├─ src/
│  │  ├─ app.ts              # createApp(): builds Hono app — runtime-agnostic
│  │  ├─ entry.node.ts       # @hono/node-server + picks DB adapter
│  │  ├─ entry.worker.ts     # export default { fetch } for Cloudflare Workers
│  │  ├─ db/
│  │  │  ├─ types.ts         # Db interface (D1-shaped subset)
│  │  │  ├─ d1-binding.ts    # wraps native D1Database (Workers, and local dev via getPlatformProxy)
│  │  │  ├─ d1-rest.ts       # implements Db over Cloudflare D1 HTTP API (prod Node)
│  │  │  └─ sql.ts           # tiny query helpers (no ORM), row mappers
│  │  ├─ auth/               # session middleware, pin hashing (WebCrypto), permissions
│  │  ├─ lib/                # doc numbering, audit log, errors, pagination, bulk-action runner
│  │  └─ modules/
│  │     ├─ <module>/routes.ts     # Hono sub-router, zod-validated
│  │     ├─ <module>/service.ts    # business rules, workflow transitions
│  │     ├─ <module>/repo.ts       # SQL
│  │     └─ <module>/pending.ts    # contributes rows to Home "Pending my action" / glance
│  └─ test/
├─ web/
│  ├─ index.html, vite.config.ts   # dev proxy /api → :8787
│  └─ src/
│     ├─ main.tsx, router.tsx      # React Router (data routers), lazy per module
│     ├─ api/client.ts             # Hono RPC client (hc<AppType>) + TanStack Query keys
│     ├─ styles/tokens.css         # Tailwind v4 @theme tokens from §1
│     ├─ components/
│     │  ├─ shell/                 # Sidebar, Topbar, FirmSwitch, CommandPalette (Ctrl K)
│     │  └─ ui/                    # Button, Pill, KpiTile, Card, DataTable (tabs, select,
│     │                            #   bulk bar, pagination), FilterBar, Tabs, Field, Money, EmptyState
│     ├─ lib/                      # status.ts (tone map), format.ts, permissions.ts, useHotkeys
│     └─ modules/<module>/         # pages + module-specific components
└─ design-reference/               # untouched
```

**Note on `/shared`**: you asked for three packages. I'm proposing a small fourth one so the zod schemas, enums and money/FY helpers are written once and used by both the API (validation) and the web app (forms, formatting). If you'd rather not add it, the fallback is for `web` to import types from `api` through Hono RPC and duplicate the helpers.

---

## 3. How `/api` talks to D1

### Principle
The app code only sees a small **`Db` interface that mirrors D1's own API**: `prepare(sql).bind(...).first/all/run` plus `batch([...])`. Nothing in `app.ts` or `modules/` imports Node built-ins, `fs`, native addons or `process.env` directly. Config comes in through `createApp({ db, config })`. The same bundle can then run on Node or Workers.

```ts
// api/src/db/types.ts
export interface Db {
  prepare(sql: string): Stmt;
  batch(stmts: Stmt[]): Promise<Result[]>;   // atomic: D1 batch = one implicit transaction
}
```

### Three runtimes, one interface
| Where | Adapter | How |
|---|---|---|
| **Dev (Node)** | `d1-binding.ts` | `entry.node.ts` calls wrangler's `getPlatformProxy({ configPath: '../db/wrangler.toml' })` to get a **real local D1 binding** (Miniflare/workerd SQLite). It uses the same `.wrangler/state` as `wrangler d1 migrations apply --local`, so migrations, seeds and the API all hit one local DB. Hot reload runs through `tsx watch`. |
| **Prod (Node)** | `d1-rest.ts` | `fetch` to `https://api.cloudflare.com/client/v4/accounts/{acct}/d1/database/{id}/query` with `{ sql, params }`, authenticated by `CF_API_TOKEN` (D1:Edit scope only). `batch()` maps to the multi-statement / batch body so a batch stays atomic. |
| **Future (Workers)** | `d1-binding.ts` | `entry.worker.ts`: `export default { fetch: (req, env) => createApp({ db: env.DB }).fetch(req) }`. There's no code change, just a new entry file and a `wrangler deploy`. |

`DB_DRIVER=local|rest` selects the adapter in `entry.node.ts` only.

### Consequences we design for now
- **No interactive transactions** (D1 has none, and the REST API makes each call a round trip). A multi-write operation such as "approve GRN + post stock ledger + bump doc number" is built as **one `batch()`**. Guards use conditional SQL (`UPDATE … WHERE status = 'reviewed'`, `INSERT … SELECT … WHERE EXISTS`), and the changed-row counts are checked afterwards.
- **REST latency** (~50–200 ms per call from a non-Cloudflare host): list endpoints do **one query** with window functions/`COUNT(*) OVER()` for totals. Dashboard endpoints combine their reads into a single `batch()`. There are no N+1 loops.
- **Doc numbering**: a `doc_series(firm_id, doc_type, fy, next_no)` table is incremented with `UPDATE … RETURNING` inside the same batch as the insert.
- **Money is stored as INTEGER paise** and quantities as INTEGER in the smallest unit (or REAL only where the unit really is fractional, e.g. kg with 3 dp). Formatting happens in `shared/money.ts`.
- **Dates** are ISO `TEXT` (`YYYY-MM-DD`, timestamps UTC). FY is derived, not stored.
- **Every business table has `firm_id`**. Repos take `firmScope` as a required argument, so a query can't forget it.
- **Search** uses a D1-supported **FTS5** virtual table, `search_index(doc_type, ref_id, firm_id, title, body)`, maintained by each module's repo on write.
- **Audit** goes to an `audit_log` row appended in the same batch as every state transition. That table feeds "Files & history".
- **Hashing** uses WebCrypto PBKDF2-SHA256 (runs on Node 20+ and Workers; bcrypt/argon2 native don't run on Workers).
- **Tests**: `vitest` against a throwaway local D1 via `getPlatformProxy` with its own persist dir. The REST adapter gets a small contract test that runs only when the CF env vars are set.

### Migrations
Plain SQL files in `db/migrations`, created and applied by wrangler:
`npm run db:migrate:local` → `wrangler d1 migrations apply strandply --local`
`npm run db:migrate:remote` → same with `--remote`.
Seeds are SQL generated from TypeScript fixtures and applied with `wrangler d1 execute --file`.

---

## 4. Auth approach

Following the Sign-in mockup: **Firm switch + User code + PIN**. No self-signup; "Forgotten your PIN? Ask the administrator."

- **Credentials**: `users(code UNIQUE, name, pin_hash, pin_salt, is_active, must_change_pin)`. PINs are hashed with PBKDF2 (WebCrypto, per-user salt, iteration count stored alongside so it can be raised). An admin reset sets a temporary PIN plus `must_change_pin`.
- **Sessions**: opaque random token in an **httpOnly, Secure, SameSite=Lax cookie**. D1 stores only `sha256(token)` in `sessions(user_id, active_firm, expires_at, last_seen_at, ip, ua)`. The expiry slides (e.g. 12 h idle, 7 d absolute). Server-side sessions mean logout, PIN reset and deactivation take effect at once, which matters on a shared factory PC. JWTs can't do that without a revocation list, and that list would be the same table anyway.
- **Firm scope**: `user_firms(user_id, firm_id)`. The login firm becomes `sessions.active_firm`. Users with both firms can switch in the topbar (`POST /auth/firm`) or choose "Both" on read-only views. Middleware resolves `c.var.firmScope` on every request.
- **Authorization**: RBAC with `roles`, `role_permissions(role_id, perm)` and `user_roles`. Permissions are string constants in `shared/enums.ts`, shaped `module.action` (`grn.review`, `grn.approve`, `grn.account`, `invoice.cancel`, `gstr2b.import`, …). Routes declare `requirePerm('grn.approve')`. `GET /auth/me` returns permissions so the web app can hide nav items and disable buttons. The server remains the authority.
- **Hardening**: login attempts are throttled per user code and IP (a `login_attempts` table, with lockout after N failures). Every mutation requires `Content-Type: application/json` plus an `X-Requested-With` header as a CSRF guard alongside SameSite. The same-origin cookie works because Vite proxies `/api` in dev and one host serves both in prod.
- **Web**: `AuthProvider` + TanStack Query `['me']`. Route loaders redirect to `/sign-in` on 401.

---

## 5. Build order

Each phase ends with something usable and demoable, and I'll stop for your review at the end of each one. The order follows data dependencies: masters → documents that create stock and payables → documents that consume them → reports that join them.

**Phase 0 — Foundation** (no business features)
Workspaces, TS config, lint/format. The `Db` interface plus both adapters, a REST adapter spike against a real D1 (to confirm batch atomicity and latency), wrangler config, and the `0001_core` migration (firms, users, roles, sessions, doc_series, audit_log, search_index). Auth end to end with the Sign-in page. App shell: Sidebar (permission-filtered), Topbar with breadcrumb, firm switch and Ctrl K stub. Design tokens plus the UI kit (Button, Pill, KpiTile, DataTable with status tabs, multi-select, bulk-action bar and pagination, FilterBar). An empty Home.

**Phase 1 — Admin & masters**
Users/roles/permissions admin, firms, items (store items + finished SKUs, sizes for sqm), UOM, HSN/GST rates, vendors, customers, warehouses, doc series settings. Global search indexes masters.

**Phase 2 — Purchase → Stores**
Purchase requisitions/POs, Store POs, **Gate entry (MRN)**, **Goods receipt (GRN)** with the full workflow and bulk actions (reference screen), item issues, item stock ledger plus minimum-stock alerts.

**Phase 3 — Accounts: payables**
Vendor bills (created by GRN "Account"), payments, payables ageing, the "Payables due" KPI.

**Phase 4 — Production + Electricity**
Shift register (good boards, rejects, submit/approve), material consumption, main-meter readings, tariff, PGVCL bills. Finished stock (Stock SKU) ledger and stock slips.

**Phase 5 — Sales**
Sales orders (credit hold), **GST tax invoices** (reference screen: A4 print view, "Rs." in the PDF, IGST/CGST+SGST by place of supply, amount in words), receipts, credit notes, customers' outstanding and ageing, e-Invoice JSON export, **Sales dashboard** per firm.

**Phase 6 — Transport, Samples, Complaints**
Trips/dispatch (vehicle, transporter, LR, e-way bill link to invoices), sample requests → approve → dispatch, complaint register with resolution dates.

**Phase 7 — Accounts: GST**
GST returns summaries, **GSTR-2B import & match** (JSON/CSV, re-import replaces the period, the four mismatch tabs, Remind supplier).

**Phase 8 — Reports**
Reports hub, daily and monthly reports, **Cost per board** (reference screen, including the Inputs flag per month), purchase analysis, vendor ranking.

**Phase 9 — People & plant**
HR (employees), Payroll runs, Maintenance, DWPAS.

**Cross-cutting, done incrementally:** each module ships a `pending.ts` (Home "Pending my action" rows plus the "At a glance" card) and registers its search types when it lands. Home fills up phase by phase instead of being built last.

---

## 6. Env & scripts (preview)

`.env.example`:
```
API_PORT=8787
WEB_ORIGIN=http://localhost:5173
DB_DRIVER=local              # local | rest
CF_ACCOUNT_ID=
CF_D1_DATABASE_ID=
CF_API_TOKEN=                # D1:Edit only
SESSION_IDLE_HOURS=12
SESSION_MAX_DAYS=7
```
Root scripts: `dev` (api + web concurrently), `db:migrate:local`, `db:seed:local`, `db:reset:local`, `db:migrate:remote`, `build`, `test`, `typecheck`.

---

## 7. Open questions (please answer before or during Phase 0)

1. **Existing data.** The current app shows "Cloudflare D1 Active". Is there an existing D1 database with real data we must migrate or import, or is this a clean start with seed data?
2. **Prod host for Node.** Where will the Node API run (VPS, Render, Railway, on-prem)? This decides whether we serve the built `web/` from the same Node process (my default: yes, one origin, simplest cookies).
3. **`/shared` workspace.** OK to add it (§2)?
4. **DWPAS.** What is it? The mockups only give it a clipboard icon.
5. **e-Invoice / e-way bill.** Export JSON for manual upload only (my default), or integrate with a GSP/IRP API to generate IRN directly?
6. **PDF.** Is browser print-to-PDF from the A4 view enough for now, or do you need server-generated PDFs (e.g. emailed invoices)? Server PDFs on a Workers-portable stack means `pdf-lib`, hence the "Rs." note.
7. **Modules in the old app not in the mockups**: "SampleTrack Pro", "Vendor Portal" (external vendor logins?), "CRM Lead". Do these map onto Samples, Vendors and Sales, or are any of them separate features we must keep?
8. **Dark mode.** Include it in Phase 0 tokens (cheap), or defer?
