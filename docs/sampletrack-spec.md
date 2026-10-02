# SampleTrack: functional spec (from the legacy app)

Source: `legacy/sampletrack/index.html` ("SampleTrack Pro", the dispatch module, one 3,900-line HTML file with inline JS).
This document lists **what the old app does**, so the React + Hono rebuild covers every function. The old UI and CSS are out of scope.
Schema: `db/migrations/0002_sampletrack.sql`. Reference seed: `0003_sampletrack_seed.sql`.

How to read it: each section has the legacy behaviour (function names in `code`) and then a **Rebuild** note wherever the new app must behave differently. **Legacy defects** are listed in §14 so they don't get copied over.

---

## 1. Data model (legacy → new)

The legacy app kept everything in one JS object `S` and saved the **whole state** as one blob to `localStorage['stp_v2']`. Within 300 ms it also POSTed that blob to `/api/dispatch/state`. All references were **by name** (party name, courier name, marketing person name). The rebuild uses the normalised `st_*` tables with id foreign keys.

| Legacy (`S.*`) | New table | Notes |
|---|---|---|
| `parties` (`P001`…) | `st_parties` | `mkt` (free-text name) → `assigned_user_id` |
| `couriers` (`C001`…) | `st_couriers` | `trackUrl` → `tracking_url_template` with `{tracking}` |
| `products` (`PR001`…) | `st_products` | `price` (₹) → `unit_price_paise`; `board` → `board_type`; `stock` → `stock_status` |
| `requests` (`REQ-0001`) | `st_requests` + `st_request_items` | `products[]` embedded → item rows; `party` name → `party_id`; `by` name → `requested_by_user_id` |
| `dispatches` (`DSP-0001`) | `st_dispatches` + `st_dispatch_history` | `party` → `party_id`; `courier` (name) → `courier_id` or `courier_name_manual`; `reqLink` → `linked_request_id`; `history[{s,t}]` → history rows; `city` snapshot dropped (taken from the party) |
| `notifs` (global `read` flag) | `st_notifications` + `st_notification_reads` | read and cleared become per user |
| in-memory `activityLog` (never saved, max 100) | `st_activity_log` | now saved |
| `settings.customCities[]` + `INDIAN_CITIES` + `cityStateMap` | `st_city_master` (+ `st_states`) | `is_custom` separates built-in cities from user-added ones |
| `settings` (company, gs*) | `st_settings` (key → JSON) | see §12 |
| `ROLE_PERMS` (hard-coded, edits lost on reload) | `st_role_permissions` (one row per role) | see §2 |
| `SEED_USERS` + `users` (plaintext passwords) | `users` (provisional, `0001_users.sql`) + `sessions` | argon2id hashes; no passwords migrated or seeded in SQL |
| `nextReqId()` / `nextDspId()` (max + 1) | `st_counters` | atomic, see §4.1 |

Enumerations (enforced by CHECK constraints):

- Party type: `Existing Customer`, `New Lead`. Industry (soft list): Furniture, Construction, Interior Design, Contractor, Trader / Dealer, Architect, Manufacturer, Other.
- Courier type: `Courier`, `Transport`, `Bus`. Courier status: `Active`, `Inactive`. Rating: 1–5.
- Board type: `OSB`, `S-OSB`, `Hybrid`, `MDO`, `Core Veneer`, `Face Veneer`. Stock: `Available`, `Limited`, `Out of Stock`.
- Request priority: `Normal`, `Medium`, `High`, `Urgent`. Request status: `Pending`, `Approved`, `Dispatched`, `Delivered`.
- Dispatch mode: `Courier`, `Transport`, `Bus`, `Hand Delivery`.
- Dispatch status: `Pending`, `Approved`, `Packed`, `Dispatched`, `In Transit`, `Delivered`, `Delayed`, `Returned`.
- Notification type: `info`, `success`, `warning`, `danger`.

---

## 2. Auth, roles and permissions

**Legacy**
- `doLogin()` compared username and password in plaintext against `SEED_USERS` and `S.users`. `doLogout()` cleared `S.user`. `fillLogin()` filled demo credentials.
- The startup IIFE **skipped login**. It took a portal session from localStorage, and if none matched it **logged in as `SEED_USERS[0]` (Super Admin)**.
- Five roles (`ROLE_MAP`): superadmin, admin, dispatch, marketing, management.
- `ROLE_PERMS[role]` = `{ pages[], edit, delete, print, export, dashboard_full, dashboard_widgets[] }`. Defaults:

| Role | Pages | edit | delete | print | export | dashboard |
|---|---|---|---|---|---|---|
| superadmin | all 11 | ✓ | ✓ | ✓ | ✓ | full |
| admin | all 11 | ✓ | ✓ | ✓ | ✓ | full |
| dispatch | dashboard, dispatch, tracking, couriers, notifications | ✓ | ✗ | ✓ | ✗ | total, delivered, delayed |
| marketing | dashboard, requests, tracking, parties, products, notifications | ✓ | ✗ | ✓ | ✗ | pending, parties |
| management | dashboard, reports, notifications | ✗ | ✗ | ✓ | ✓ | total, pending, delivered, delayed, parties, couriers |

- `canDo(action)` and `canViewPage(page)` gate buttons and nav. `applySidebarPerms()` hides nav items and empty groups. `showNoAccess()` shows "Access Restricted". `renderRoleUI()` adds role-gated header buttons and a role badge.
- **Role matrix editor** (Users → Roles tab): `renderRoleCards()`, `renderPermsMatrix()` (checkbox per page and action per role; superadmin locked), `onPermChange()`, `saveRolePerms()`, `resetRolePerms()`.

**Rebuild** (built; see `api/src/auth`, `api/src/modules/sampletrack`, tests in `api/test`)
- Uses the ERP-wide sign-in: `POST /api/auth/login` with username + password, which sets an httpOnly SameSite=Lax `sid` cookie. Sessions are server-side, idle 12 h and absolute 7 d. Only `sha256(token)` is stored. `POST /api/auth/logout`. There is no separate SampleTrack login and no auto-login.
- Every endpoint is registered through `SecureRouter` with a policy: `public` (only login), `authenticated`, `superadmin`, or `page(<page>, ...actions)`, which runs `requirePage` + `requireAction`. A test fails if any route lacks a policy or is missing from the role × endpoint matrix. The UI only hides controls.
- `GET /api/me` returns the user, role, effective `permissions {pages, actions, widgets}` and `can` flags.
- The matrix lives in `st_role_permissions`, one row per role, seeded with the defaults above. `GET /api/sampletrack/role-permissions` needs the users page. `PUT …/:role` and `POST …/reset` are superadmin only. The superadmin row is locked (`role_locked`) and superadmin always has everything. A change applies on the next request in the same process. Other instances see it within `PERMISSION_CACHE_MS` (5 s). Every change is logged with a diff.
- Whether SampleTrack keeps its own five roles or maps onto the ERP's role model is an open question (§15).

---

## 3. Dashboard

**Legacy**: `renderDashboard()`, `drawCharts()`
- KPI tiles: Total Dispatches, Pending Requests, Delivered, Delayed, Active Parties (counted **all** parties), Couriers. Each role sees only its `dashboard_widgets`.
- Greeting by time of day plus the date.
- Recent dispatches (last 5) and Pending requests (first 5, with priority).
- Charts (full-dashboard roles only): a 6-month "Dispatched vs Delivered" trend, where **the first five months were hard-coded fake numbers**, and a status doughnut with pending requests added to the "Pending" slice.

**Rebuild** (built: `GET /api/sampletrack/dashboard`, `reports/dashboard-service.ts`, figures in `reports/calc.ts`)
- **Widgets.** Only the role's widgets are computed and returned:
  - total = live dispatches; pending = Pending requests; delivered and delayed = dispatches in that status;
  - parties = live parties and couriers = live couriers, all of them as in the legacy dashboard (open question: count only active ones?).
- **Panels and charts.** Recent dispatches (last 5) need `dashboard_full` or the total widget. Pending requests (oldest 5) need `dashboard_full` or the pending widget. Charts need `dashboard_full`. So management sees all 6 widgets and both panels but no charts.
- **Trend.** Last 6 months including the current one, in India time. Dispatched counts by dispatch date. Delivered counts by the month the dispatch last entered Delivered in history, or its dispatch date if there is no history, so a September dispatch delivered on 1 Oct counts as delivered in October.
- **Status distribution.** The legacy 5 slices (Pending, Dispatched, In Transit, Delivered, Delayed); Approved, Packed and Returned are not shown. Pending includes Pending requests, with `pendingBreakdown` giving both parts.

---

## 4. Sample requests

**Legacy**: `renderReqTable`, `setReqFilter`, `openReqModal`, `editReq`, `addProductLine`, `saveRequest`, `approveReq`, `delReq`, `reqToDispatch`, `exportReqs`, `previewRequestSlip`, `doPrintSlip`

- **List**: status tabs (all / Pending / Approved / Dispatched / Delivered), 10 per page, and a text search that filtered only the rows already rendered. Columns: ID, date, party, product chips "name (qty)", priority badge, required date, status, requested by. The nav badge shows the Pending count.
- **Create/edit** form: auto ID (read-only), date (default today), party (required, a select of party names), purpose, priority (default Normal), required dispatch date, requested by (a select of marketing/admin/superadmin user names **plus** every party's `mkt` value), and remarks.
- **Product lines** (`addProductLine`): a select from the product master plus inputs for board, thickness, size and qty (free text, e.g. "5 sheets"). Choosing a product pre-fills board, thickness and size. Lines can be added and removed. At least one line with a name is required.
- New requests start as `Pending`. Editing keeps the current status and `createdAt`/`createdBy`. A new request sends an `info` notification "New Request".
- **Approve** (`approveReq`): sets `Approved` no matter what the current status is, and sends a `success` notification.
- **Delete**: hard delete after a confirm.
- **Create dispatch from request** (`reqToDispatch`): opens the dispatch form with the party pre-filled, the description set to "name qty, …" from the lines, and the linked request set.
- **Excel export**: Request ID, Date, Party, Products ("name qty; …"), Purpose, Priority, Req Dispatch Date, Requested By, Status, Remarks.
- **Request slip (A4 print)**: company header (name, address line, phone, LLPIN), "Sample Request Slip", the request no., a status pill, a Request Details block (date, created time, required by, priority with High/Urgent in red, purpose, requested by), a Party block (name, contact, mobile, email, address, GST), a products table (#, name, board, thickness, size, qty), remarks, three signature boxes (Requested By / Approved By / Dispatched By), and a footer with generated and printed times.
  - **Rebuild** (built): `GET /requests/:id/slip` → `RequestSlip` (A4 portrait). Contents: company block, request (with a `highPriority` flag for High/Urgent), party, lines, `approvedBy {name, at}` and a `signatures` block pre-filled with the requester and approver names.
  - **Approver:** approving now records `st_requests.approved_by` / `approved_at`. The activity log can be purged, so it isn't a reliable source.

**Rebuild** (built: `/api/sampletrack/requests`, service `api/src/modules/sampletrack/requests`, hooks `web/src/modules/samples/api/requests.ts`)

| Endpoint | Needs |
|---|---|
| `GET /requests` (q, `status` tab, `partyId`, `requestedByUserId`, `dateFrom`/`dateTo`, sort, paging) → `{rows, total, counts}` | requests |
| `GET /requests/pending-count` → `{count}` (sidebar badge) | requests |
| `GET /requests/:id` | requests |
| `POST /requests` / `PATCH /requests/:id` | requests + edit |
| `POST /requests/:id/approve` | requests + **approve** (a new action key; default superadmin + admin, configurable in the role matrix) |
| `DELETE /requests/:id` | requests + delete |
| `GET /requests/export` (xlsx) | requests + export |
| `GET /requests/:id/dispatch-draft` | **dispatch + edit** (it prefills the dispatch form) |

- **Create.** Party required (must be live). Date defaults to today in **India time** (`Asia/Kolkata`). Status is always Pending; a `status` sent in the body is ignored. Requested by defaults to the signed-in user; a named requester must be an active marketing/admin/superadmin user. The required dispatch date can't be before the request date. Sends a "New Request" (info) notification and logs Create.
- **Lines.** Entirely blank lines are dropped. Each remaining line needs a name: from the picked product, or typed (free text, `productId` null). A picked product fills any blank name/board/thickness/size (thickness as "18mm"); the web helper `lineFromProduct()` does the same in the form. At most 50 lines.
- **Edit.** Can change the fields and replace the lines. Status, created_by and created_at never change. The party can't change once a dispatch is linked (409 `party_locked`). Re-sending identical lines isn't counted as a change. Logs Edit with the changed fields.
- **Approve.** Pending → Approved only (409 `invalid_status` otherwise), as a guarded transition, so two approvals at once can't both succeed. Sends an "Approved" (success) notification and logs Approve.
- **Delete.** Soft delete, blocked while a live dispatch is linked (409 `has_dispatch`). The number is not reused.
- **List.** The search covers the request number, party name, product names on the lines, and the requester's name. `counts` (all + each status) follow the search and other filters but not the status tab. Default sort is newest first; `reqNo` sorts numerically.
- **Dispatch draft** returns `{partyId, partyName, productDescription: "name qty, name qty", linkedRequestId, linkedRequestNo, requestStatus}`. It writes nothing.

### 4.1 Numbering
Legacy `nextReqId()` and `nextDspId()` used max(existing) + 1, which races and reuses numbers after a delete. **Rebuild**: `st_counters` bumped in the same unit of work as the insert (`uow.run`). Numbers are `REQ-` / `DSP-` plus at least 4 digits, never reused. The form shows "(auto)" until the record is saved. Built for REQ: a failed create rolls the counter back, and concurrent creates get distinct, consecutive numbers (tested).

### 4.2 Item quantity
Legacy `qty` was free text ("5 sheets"). **Rebuild** keeps exactly what was typed in `qty_raw`, and when it parses also stores `qty_value` (number) and `qty_unit` (default `sheets`). Built: "5 sheets", "5", "2.5kg", "2,5 kg" and "10 Nos." parse; sheet/sht → sheets, pc/piece/no/nos → pcs, kgs → kg, and other units are kept lower-cased. Text like "5-6 sheets" keeps only the raw value. `product_id` is set when the line matches a master product. `product_name`/`board`/`thickness`/`size` are a snapshot taken at save time.

### 4.3 Request status rules (rebuild)
- `Pending → Approved` only, via Approve (needs the `approve` action). Approving anything else is rejected.
- `Dispatched` and `Delivered` are set **only** by dispatch sync (§5.3), never by hand.

---

## 5. Dispatches

**Legacy**: `renderDispTable`, `openDispModal`, `editDisp`, `fillCourierList`, `fillCourierDetails`, `saveDispatch`, `delDisp`, `exportDisp`, `getPartyCity`, `getPartyObj`

- **List**: newest first, filters for mode and status, 10 per page, and a text search over the rendered rows. Columns: ID, date, party, city (from the party), courier, tracking, mode badge, expected delivery, weight, freight ₹, status. Row actions: edit, track, print label, QR, delete.
- **Form**: auto ID, date (default today), party (required), mode (default Courier), courier picker filtered by mode (**all** couriers when the mode is Hand Delivery) **or** a manual courier name, tracking no., vehicle no., driver details, expected delivery date, freight ₹, weight kg (marked required but saved as 0 when empty), dimensions, product description, linked request, status (default Pending) and remarks.
- **On create**: history starts with the first status. Sends an `info` "Dispatch Created" notification.
- **On save (create or edit)**: if the status is Delayed it sends a `warning` "Delay Alert"; if Delivered, a `success` "Delivered". **Editing the status in this form did not add a history row.**
- **Excel export**: Dispatch ID, Date, Party, City, Courier, Tracking No, Mode, Vehicle, Expected Delivery, Weight (KG), Freight ₹, Dimensions, Product, Status, Remarks.

### 5.1 Status update (tracking page)
`updateDispStatus()` asks for a new status (any of the 8), adds `{status, time}` to the history, and sends Delayed/Delivered notifications. **It did not sync the linked request** (an inconsistency with `saveDispatch`).

### 5.2 Rebuild rules (built: `/api/sampletrack/dispatches`, service `api/src/modules/sampletrack/dispatches`, hooks `web/src/modules/samples/api/dispatches.ts`)

| Endpoint | Needs |
|---|---|
| `GET /dispatches` (q = dsp no / tracking no / party; `mode`, `status` (all 8), `partyId`, `courierId`, `linkedRequestId`, `dateFrom`/`dateTo`, `overdue=true`; sort; paging) | dispatch |
| `GET /dispatches/:id` | dispatch |
| `POST /dispatches`, `PATCH /dispatches/:id`, `POST /dispatches/:id/status` | dispatch + edit |
| `GET /dispatches/party-options`, `GET /dispatches/request-options` (form pickers: the dispatch role has no Parties or Requests page) | dispatch + edit |
| `DELETE /dispatches/:id` | dispatch + delete |
| `GET /dispatches/export` (dispatch register xlsx) | dispatch + export |
| `GET /tracking`, `GET /tracking/:id` | tracking (read-only; marketing can follow shipments but not change them) |

- **Create/edit.** Party, mode and weight > 0 are required, and weight can't be cleared on edit. Date defaults to today in India time. The expected delivery date can't be before the dispatch date. `DSP-0001…` is assigned atomically from `st_counters` in the same transaction (no reuse, no number used on failure).
- **Carrier.** Either `courierId` (from the master: Active when newly chosen, and its type must equal the mode except for Hand Delivery) or `courierNameManual`, never both. Courier/Transport/Bus need one of them; Hand Delivery may have none.
- **Linked request.** It must exist and be for the same party, which is also why a request's party is locked once a dispatch is linked.
- **One status path.** Every status change goes through one service method: the initial status on create, a `status` in the edit form, or the quick `POST …/status`. It validates against the 8 statuses, makes a guarded update (a concurrent change gets 409 `stale_status`), appends a `st_dispatch_history` row (user, UTC time, optional note), notifies, syncs the request, and logs `StatusChange`, **all in one transaction**. Setting the same status again is a no-op. Any status may follow any other, as in the legacy app.
- **Notifications.** Created (info), Delayed (warning) and Delivered (success). A dispatch created directly in Delayed or Delivered also notifies.
- **Overdue** is computed, never stored: `expected_delivery_date < today (India)` and status not Delivered or Returned. Status is never changed automatically. It is available as a list filter and an export column.
- **Delete.** Soft delete. History is kept, and the linked request keeps its status.

### 5.3 Dispatch → request status sync (atomic) — built
Dispatched or In Transit set the linked request to **Dispatched** (from Pending or Approved). Delivered sets it to **Delivered** (from Pending, Approved or Dispatched). Other statuses (Pending, Approved, Packed, Delayed, Returned) don't touch the request. **A request never moves backwards**: a Delivered request stays Delivered if the dispatch is later Returned. Linking a request on edit brings it up to the dispatch's current status. The sync runs inside the status change's transaction (tested by failing a later step and checking everything rolled back), and logs a `StatusChange` on the request. **Open:** should Returned reopen the request? (§15.3)

### 5.4 Courier label (A5 landscape print)
`printCourierLabel()` shows a preview and `doPrintLabel()` opens the print window. Left column: FROM (company, address line, phone, LLPIN), a mode badge, and dispatch ID, date, expected delivery, tracking, courier, vehicle and dimensions (each only if set), then contents (product description). Right column: DELIVER TO (party name large, "Attn: contact", mobile, address, city, state, PIN in bold, email) and the status.

**Rebuild** (built): `GET /dispatches/:id/label` returns the label data as JSON (`CourierLabel`: `from` from st_settings `company.*`, the dispatch fields, `to` from the party, `qrPayload`, `printedAt`, and `page` = A5 landscape 210×148 mm). The layout comes from the design system. Web `printHtml()` / `pageCss()` (`web/src/lib/print.ts`) print it through a hidden iframe with `@page { size: 210mm 148mm }` and `print-color-adjust: exact`.

### 5.5 QR code
`showQR()` encodes `ID:<dsp>|Party:<name>|Track:<no or NA>|Status:<status>`. **Legacy sent this to `api.qrserver.com`**, so party data went to a third party. **Rebuild** (built): `GET /dispatches/:id/qr` returns only `{payload}`. A `|` or line break inside a value is replaced, so the fields stay separable, and a missing tracking number becomes `NA`. The browser draws the image with the `qrcode` package (`web/src/lib/qr.ts`: `qrSvg`, `qrDataUrl`), with no network call, which is tested.

### 5.6 WhatsApp share
`shareWhatsApp()` opens `https://wa.me/?text=…` with a formatted message: company, dispatch ID and date, party and city, courier (or mode), tracking (or "Not assigned yet"), mode, expected delivery (or "TBD"), contents (or "As per order"), current status, an apology line if Delayed, a tracking link if there is one, and a sign-off. **Rebuild** (built): the server builds the text (`GET /dispatches/:id/whatsapp` → `{text, phone}`, `print/share-text.ts`). Dates are shown as "01 Oct 2026". The apology line appears only when Delayed. The tracking block appears only when there is both a courier and a tracking number, and holds the resolved link or the "Contact courier…" hint. `phone` is the party's mobile as `91XXXXXXXXXX`, when valid. The client opens `https://wa.me/[phone]?text=<encoded>` (`web/src/lib/share.ts`, `shareDispatchOnWhatsApp`).

### 5.7 Tracking URL
Legacy `getTrackingUrl()` **ignored the courier's `trackUrl`** and hard-coded three: Blue Dart `https://www.bluedart.com/tracking?trackfor={tracking}`, DTDC `https://www.dtdc.in/tracking.asp?REF_NO={tracking}`, Delhivery `https://www.delhivery.com/track/package/{tracking}`. Otherwise it returned "Contact courier with tracking number: …".

**Rebuild** (built, `resolveTracking()` in `dispatches/tracking.ts`; every dispatch view carries `tracking`):
1. The master courier's `tracking_url_template`, with `{tracking}` replaced (URL-encoded).
2. Otherwise the three built-ins above, matched on the courier name (master or manual) ignoring case.
3. Otherwise `{kind:'text', text:'Contact courier with tracking number: X'}`.

It is null when there's no tracking number.

---

## 6. Live tracking

**Legacy**: `renderTrackList(q)`, `viewTrackDetail(id)`
- Left list: dispatches newest first, search by dispatch ID or party name. Each card shows ID, status, party, courier or mode, tracking, and date → expected date.
- Detail: courier, mode, tracking, vehicle, dispatch date, expected date, freight and city. A **timeline** of the fixed steps Pending → Approved → Packed → Dispatched → In Transit → Delivered, each marked done, current or pending, with the time from history when there is one. `Delayed` and `Returned` were not on the timeline. Actions: Update Status, Print Label, QR, WhatsApp.

**Rebuild** (built): `GET /tracking` lists shipments newest first, searching dispatch no., party and tracking no. `GET /tracking/:id` returns `{dispatch, timeline, offPath, history}`:
- `timeline` has the 6 path steps (Pending → Delivered), each `done | current | pending`, with the latest time and user from history. Steps that were skipped show as done with no time. Delivered counts as done.
- `offPath` lists every Delayed/Returned event (time, user, note), flagged `current` when the dispatch is in it now. While a dispatch is off-path, the timeline shows progress up to the furthest step reached.

---

## 7. Parties

**Legacy**: `renderPartyTable`, `openPartyModal`, `editParty`, `setSelectOrAdd`, `saveParty`, `delParty`, `exportParties`, `onCityChange`
- List: filter by type, search, 10 per page. Columns: name, contact, mobile, email, city/state, address, industry, type badge, assigned to. Without edit/delete the row says "View only".
- Form: name (required), contact, mobile, email, GST, address (marked required), city (select = built-in cities ∪ cities already on parties ∪ custom cities), state (select of 36), PIN, industry (default Furniture), type (default Existing Customer), assigned marketing person, remarks.
- **Choosing a city fills in its state** from `cityStateMap`, then from the custom cities.
- **Duplicate check**: a case-insensitive name match asks "Similar party exists: X. Add anyway?" (a warning, not a block).
- Delete: hard delete after a confirm. Requests and dispatches kept the party **name**, so the party's address simply vanished from labels.
- Excel export: Party Name, Contact Person, Mobile, Email, Full Address, City, State, Pincode, GST Number, Industry, Type, Assigned To, Remarks.

**Rebuild** (built: `/api/sampletrack/parties`, hooks in `web/src/modules/samples/api/parties.ts`)
- List: server-side `q` over name, contact, mobile, email, GST, city and state. Filters `type`, `assignedUserId`, `city`, `state`. Sort `name` (default), `city`, `state`, `type`, `createdAt`. `page`/`pageSize`, default 10. Returns `{rows, total}`, and each row carries `assignedUserName`.
- Validation: name required. GST is 15 characters, GSTIN format, stored upper case. Mobile is an Indian 10-digit number starting 6–9; `+91`, `0`, spaces and dashes are accepted, and it is stored as the 10 digits. Pincode is 6 digits. Email is checked. State must be one of `st_states` and is stored under its canonical name. Blank fields become null.
- Duplicate check: a name equal to a live party's, ignoring case and repeated spaces, returns **409 `possible_duplicate`** with `details.similar[]`. Resend with `?force=true` to save anyway, which the log records. Renames get the same check.
- Assigned person: `GET /parties/assignees` lists active marketing, admin and superadmin users. Anyone else is rejected with 422.
- Delete: **409 `in_use`** with `{requests, dispatches}` counts while any live request or dispatch references the party. Otherwise a soft delete.
- `GET /parties/export`: every party matching the current filters (no paging), all columns, as xlsx. Needs the `export` action, so marketing can no longer export as the legacy UI allowed.
- Every create, edit (with the changed fields), delete and export is logged.
- Not built: the GST-state-code vs state mismatch warning.

---

## 8. Couriers

**Legacy**: `renderCourierTable`, `openCourierModal`, `editCourier`, `saveCourier`, `delCourier`
- List: filter by type, search, 10 per page. Columns: name, type, contact, mobile, email, coverage, a track link, star rating and status. **Edit/delete buttons had no permission check.**
- Form: name (required), type, contact, mobile, email, coverage, tracking URL, rating 1–5, status, remarks.
- Delete: hard.

**Rebuild** (built: `/api/sampletrack/couriers`, hooks in `couriers.ts`)
- List: `q` over name, contact, mobile, email and coverage. Filters `type`, `status`. Sort `name`, `type`, `rating`, `status`, `createdAt`. Default page size 10.
- Validation: name required, and rating must be a whole number 1–5. The tracking URL must be http(s); a `{tracking}` placeholder is replaced (web `trackingUrl()`). Phone is checked loosely, so toll-free numbers are allowed.
- `GET /couriers/options?mode=` serves the dispatch form dropdown: active couriers with `type = mode`, or every active courier for Hand Delivery. It is allowed from the dispatch page as well as the couriers page.
- Delete: 409 `in_use` while a live dispatch references the courier. Otherwise a soft delete. All changes are logged.

---

## 9. Products

**Legacy**: `renderProductTable`, `openProductModal`, `editProduct`, `saveProduct`, `delProduct`, `exportProducts`, `importProductsExcel`, `downloadProductTemplate`
- List: filter by board type, search. Counters: total, OSB, S-OSB, MDO, other. **No pagination wiring (`changePg` ignored 'prod'), and no permission check on edit/delete.**
- Form: code, name (required), board type (default OSB), thickness mm, size, category, unit price ₹, stock status (default Available), description.
- **Excel import**: first sheet, case-insensitive fuzzy headers: code ∈ {code, product code, prod code, item code}, name ∈ {name, product name, prod name, item name, product}, board ∈ {board, board type, type, category type}, thickness ∈ {thickness, thick, mm}, size ∈ {size, dimensions}, category ∈ {category, cat}, price ∈ {price, unit price, rate, mrp}, stock ∈ {stock, stock status, availability}. Defaults: board OSB, category Standard, stock Available. Skips rows with no name **or a duplicate name**, then reports "Imported N, skipped M".
- **Import template** download: headers Product Code, Product Name, Board Type, Thickness, Size, Category, Unit Price, Stock Status, with 2 example rows.
- Excel export: Code, Name, Board Type, Thickness, Size, Category, Unit Price ₹, Stock, Description.

**Rebuild** (built: `/api/sampletrack/products`, hooks in `products.ts`)
- List: `q` over code, name, size, category and description. Filters `boardType`, `stockStatus`. Default page size 10. `GET /products/summary` returns `{total, osb, sosb, mdo, others}`.
- Validation: name and code required, and the code is unique among live products ignoring case (409 `code_taken`). Price is integer paise.
- Delete: 409 `in_use` while a live request line references the product.
- `GET /products/export` (xlsx, every column, price in ₹) and `GET /products/import-template` (headers, 2 example rows, and an "Allowed values" sheet). An exported file can be imported back.
- **Import** is `POST /products/import` (multipart `file`; .xlsx, .xls or .csv; up to 2 MB and 5,000 rows).
  - Without `?commit=true` it is a dry-run preview. With it, the server re-plans inside one unit of work and adds every valid row together.
  - Each row gets `would_add` / `added`, `skipped` (empty name, or a duplicate name against existing products or earlier rows) or `error` (missing code, a code already used, a bad board type, thickness, price or stock value). Each result has a reason.
  - Headers are matched case-insensitively with punctuation ignored, using the aliases listed in `product-import.ts`. The report says which column fed each field.
  - Defaults: board OSB, category Standard, stock Available, price 0. `₹`, `Rs` and commas are stripped from prices.
  - The commit is logged once as `Import`.

---

## 10. Reports

**Legacy**: `genReport(type)`, `exportRptExcel()`, `exportRptCSV()` (exports the first table in the report). All reports cover **all time**, with no date filter.

| Key | Report | Content |
|---|---|---|
| `dispatch-register` | Dispatch Register | every dispatch: ID, date, party, city, courier, tracking, mode, expected delivery, freight, status, plus total count and total freight |
| `pending` | Pending Sample Report | dispatches in Pending/In Transit/Dispatched/Delayed **plus** requests in Pending. Columns ID, Type, Party, Status, Date. (Legacy decided the type by checking whether `courier` was set, which is wrong for dispatches without a courier.) |
| `partywise` | Party-wise Sample Report | dispatches grouped by party: ID, date, mode, freight, status |
| `courier` | Courier Performance | per courier (or "Unknown"): total, delivered, delivery rate %, total freight |
| `cost` | Cost Tracking | total freight, dispatch count, average per dispatch, freight by mode with % share |
| `product-analysis` | Product-wise Sample Analysis | how many times each product name was requested (counted across request lines), with its board types, plus a product master summary (code, name, board, price, stock) |
| `marketing` | Marketing Performance | per requested-by person: total, delivered, pending, success rate % |

**Rebuild** (built: `GET /reports/:key` [reports], `GET /reports/:key/export?format=xlsx|csv&table=` [reports + export], `GET /reports/:key/print` [reports + print]; figures in `reports/calc.ts`, each unit-tested on fixture data)
- **Filters:** `dateFrom`/`dateTo` (inclusive, on the dispatch or request date), `partyId` and `courierId`. On the two request-based reports `courierId` is rejected (422). On the pending report it limits the list to dispatches.
- **Shape:** every report is `{key, title, filters (+ party/courier names), generatedAt, summary[], tables[]}`. Columns are typed: money in paise, percent 0–100 with one decimal. Exports convert money to ₹.
- **xlsx** = a Summary sheet (filters + summary) plus one sheet per table with a totals row. **csv** = one table, UTF-8 with BOM and RFC 4180 quoting; text starting with = + - @ is prefixed with ' so it can't run as a formula.
- **Print** returns the report plus the company block, A4 landscape. Exports and prints are logged.
- **The seven reports:**
  - **Register** is sorted by date, then number; it has the total record count and total freight.
  - **Pending** = dispatches in Pending/In Transit/Dispatched/Delayed plus Pending requests, oldest first, with the type taken from the record (not guessed from `courier`).
  - **Party-wise** has a per-party summary and the dispatch lines.
  - **Courier** merges names ignoring case and uses "Unknown" when blank. Rate = delivered / total.
  - **Cost** gives the average per dispatch rounded to the paisa, and % share of freight per mode.
  - **Product analysis** counts request lines per product: by id for master products, by name ignoring case for free text. The master name wins over the line text. It also shows the boards seen on those lines, the distinct requests and the sheets total, plus the master summary.
  - **Marketing** groups by requester, "Unassigned" when blank. Success rate = Delivered / total.

---

## 11. Notifications and activity log

**Legacy**
- `addNotif(type,title,msg)` puts the newest first. `updateBadges()` shows the unread count and pending-request count. `renderNotifs()`. `markRead(id)` set a **global** read flag. `clearNotifs()` deleted **all of them for everyone**.
- Triggers: request created (info), request approved (success), dispatch created (info), dispatch Delayed (warning), dispatch Delivered (success).
- `logActivity(action, details)` was in memory only: login, create/edit of requests and dispatches, user changes, permission saves. The log was viewable in Users → Activity, with a clear button.

**Rebuild**
- `st_notifications` rows with `entity_type`/`entity_id` so a click opens the record. Per-user read and cleared state is in `st_notification_reads`. Unread count = notifications without a read row for this user.
- **Built.** Events: request created (info "New Request"), request approved (success "Approved"), dispatch created (info), Delayed (warning "Delay Alert"), Delivered (success). Each is written in the same transaction as the event.
  - Notifications are broadcast (`target_user_id` null) unless targeted. Only users with the **Notifications page** can read them; the routes are guarded.
  - **The user whose action created a notification gets it already marked read**, so their own badge doesn't light up.
  - Endpoints (all need the notifications page): `GET /notifications` (`unread=true`, `type`, paging; newest first), `GET /notifications/unread-count`, `POST /notifications/read {ids}`, `POST /notifications/read-all {upTo?}` (marks only up to what the user saw), and `POST /notifications/clear {ids? | upTo?}` (hides for this user only; nothing is deleted).
  - `GET /badges` (any signed-in user) returns `{unreadNotifications?, pendingRequests?}`, each only with the matching page. The web `useBadges()` polls every **30 s**, plus on window focus. Polling was chosen over SSE because it works the same on Node and Workers.
- `st_activity_log` is written by the service layer, in the same unit of work as the change it records. It holds the user plus their name and role at the time, the action, the entity, the details and the time. Built so far: Login, LoginFailed, Logout, Create/Edit/Delete (users), PermissionChange, Purge. Later modules add status change, approve, import, restore and settings.
- `GET /api/sampletrack/activity` needs the users page. Filters: `userId`, `action`, `entityType`, `from`/`to`, `q`, paging.
- `POST /api/sampletrack/activity/purge {olderThanDays}` is superadmin only. It hard-deletes entries older than N days, and the purge is logged as a new entry.

---

## 12. Settings

**Legacy**: `loadSettings`, `saveCompanySettings`, `saveGsConfig`, `updateGsSidebar`, `testGsConn`, `syncToSheets`, `pullFromSheets`, `startAutoSync`, `autoSyncTick`, `renderAppsScript`, `copyScript`, `backupData`, `restoreData`, `clearAllData`, `renderCityMaster`, `addCityToMaster`, `removeCityFromMaster`, `exportCityMaster`

- **Company profile**: name, LLPIN, address line ("City / State"), phone/GST. Used on labels, slips and WhatsApp messages.
  - **Rebuild** (built): `GET /settings/company` (settings page) and `PUT /settings/company` (settings + edit) → `{name, llpin, city, phone, gst}`, kept in `st_settings` (`company.name`, `company.llpin`, `company.address_line`, `company.phone`, `company.gst`).
  - **Phone and GST are separate fields** (the legacy form had one "Phone | GST" box). GST is checked against the GSTIN format and LLPIN against `AAA-1234`. Name is required; a blank value clears any other field. Only changed fields are saved, in one transaction, and logged.
  - Read by every courier label, request slip, report print and WhatsApp message (tested end to end).
- **City master**: add a custom city (name + state, both required, duplicate city name case-insensitive is rejected), remove one, and export built-in + custom cities to Excel.
  - **Rebuild** (built): `GET /states`. `GET /cities/options` serves the party dropdown: built-in + custom + cities already used on parties, one entry per (city, state). The web `stateForCity()` fills the state when only one state is known for that name.
  - `GET/POST /cities` and `DELETE /cities/:id` (custom cities only; 409 `builtin_city` otherwise). Duplicates are checked per (city, state) ignoring case, giving 409 `city_exists`. **This differs from the legacy check on the name alone, so the same city name can exist in two states.**
  - `GET /cities/export`. Removing a custom city doesn't touch parties, which keep their city text.
- **Google Sheets sync**: Spreadsheet ID, Apps Script web-app URL, interval (manual / 5 / 15 / 30 min), last sync time. Test (`?action=ping`). **Push** (`writeAll` overwrites the Dispatches, Requests (flattened one row per product line), Parties, Couriers and Products sheets, and appends to SyncLog keeping the last 100). **Pull** (`readAll`) **replaced local data** with the sheet contents. Auto-push ran on a timer in the browser, and also after each request/dispatch/party save (`autoSyncTick`). The app also showed the full Apps Script code to copy.
- **Backup**: downloads JSON (requests, dispatches, parties, couriers, products, settings, exportedAt).
- **Restore**: upload JSON, confirm, then replace those collections and merge settings.
- **Clear all data**: confirm, type `DELETE`, then wipe requests, dispatches, parties, couriers, products and notifications.

`st_settings` keys (values are JSON): `company.name`, `company.llpin`, `company.address_line`, `company.phone`, `company.gst`, `sheets.spreadsheet_id`, `sheets.webapp_url`, `sheets.interval_min`, `sheets.last_sync_at`. Role permissions live in `st_role_permissions`.

**Rebuild**
- Sheets sync becomes a **server-side service behind an interface** (`SheetsSyncService`) with a no-op stub for now, marked `TODO(d1)`. The interval runs as a server cron, not a browser timer. Push only at first. Pull ("replace everything from the sheet") is dropped or becomes an admin-only import with a preview (open question). The Apps Script code is shipped as a file in the docs, not shown in the UI.
- Backup/restore becomes a `BackupService` interface (stub now). Restore runs in **one transaction** (`uow.run`) and checks the payload before writing. It accepts the legacy JSON shape (names) and resolves names to ids.
- "Clear all data" is superadmin-only and soft-deletes. Or drop it (open question).

---

## 13. Users (legacy user management)

**Legacy**: `renderUserStats`, `renderUserTable`, `openUserModal`, `updateRolePreview`, `wireUserRoleSelect`, `editUser`, `saveUser`, `toggleUserStatus`, `delUser`, `switchUmTab`
- Stats: total, active, and a count per role. Table: name/department, username, email, phone, role pill with page count, status, created date. Filters for role and status.
- Form: name and username (required, username unique), email, phone, role (superadmin only appears when editing a superadmin), status, password (required on create, at least 6 characters, blank on edit keeps the old one), department. A live preview shows the role's pages and actions.
- Built-in seed users could not be deleted or deactivated.

**Rebuild** (built, at `/api/sampletrack/users`; moves to the ERP Admin module when core RBAC lands)
- `GET /users` (filters `role`, `status`, `q`, `sort`, paging), `GET /users/stats` (total, active, inactive, count per role) and `GET /users/:id` need the users page. `POST /users`, `PATCH /users/:id` and `POST /users/:id/toggle-status` need users + edit. `DELETE /users/:id` needs users + delete (soft delete).
- Username is unique (case-insensitive among live users). Password is at least 8 characters and hashed with argon2id (pure JS, so it runs on Workers too). A blank password on edit keeps the current one.
- Rules: you can't delete or deactivate yourself, and at least one active superadmin must always remain. Only a superadmin can create, promote to, edit or delete a superadmin.
- An inactive user can't sign in. Deactivating a user, changing their password or deleting them ends their sessions at once.
- The password hash is never returned. A password change is logged as "password" with no value.

---

## 13a. Print and share permissions (built)
Label, WhatsApp text and QR need the **print** action plus the Dispatch **or** Live Tracking page (as in the legacy tracking panel). The request slip needs print plus the Requests page. Every call is logged as `Print` (label, slip, QR) or `Share` (WhatsApp) and is fetched fresh, never cached. Company details come from `st_settings` (`company.name`, `company.address_line`, `company.phone`, `company.llpin`), and a blank phone or LLPIN is left off.

## 14. Legacy defects (don't copy)

1. Auto-login as Super Admin, and plaintext passwords stored in the client and in the synced state.
2. The whole database was POSTed from the browser on every change (last writer wins, no concurrency control).
3. Every relation was by name: renaming a party broke its history, and deleting it lost the label address.
4. Doc numbers were max + 1 (race conditions, and numbers reused after a delete).
5. Hard deletes everywhere, with no check for references.
6. Permission checks only in the UI. Courier/product edit/delete had none at all.
7. Search filtered only the 10 visible rows. Product pagination wasn't wired up.
8. A status change on the tracking page skipped the request sync. A status change in the form skipped the history row.
9. Approve worked from any status, even Delivered.
10. Dashboard trend chart used hard-coded numbers.
11. QR data was sent to api.qrserver.com.
12. Tracking URL ignored the courier's own URL.
13. Pending report guessed request vs dispatch from whether `courier` was set.
14. Notifications' read and cleared state was global. The activity log was never saved.
15. The weight field was marked required but not checked. Freight and price were floats in rupees.
16. Sheets "Pull" replaced all local data without checking it.
17. `INDIAN_CITIES` had 'Ghaziabad' twice, and `INDIAN_STATES` used the pre-2020 "Dadra & Nagar Haveli" (now the merged UT, GST code 26).

---

## 15. Open questions

1. **Roles**: keep SampleTrack's five roles, or map them onto ERP roles plus per-module permissions?
2. **People who aren't users**: legacy `mkt`/`by` hold names such as "Ankit Patel", "Suresh Kumar" and "Raj Verma", who are not users. Should they become users (possibly unable to log in), or should we add a separate `st_marketing_people` table?
3. Should a `Returned` dispatch change its linked request (back to Approved?), or leave it alone?
4. Party delete when records reference it: block it, or soft delete and keep it showing on old records?
5. Keep Sheets **Pull**, or push only?
6. Keep "Clear all data"?
7. Can a request link to more than one dispatch (partial shipments)? The schema allows it. The legacy UI assumed one.
8. Should `st_states` and `st_city_master` be shared ERP masters rather than prefixed `st_`?

---

## 16. Reference data seeded by migration

- 36 states/UTs with their GST codes (`st_states`).
- 109 cities with their states (`st_city_master`, `is_custom = 0`). The source list has 110 entries because Ghaziabad appears twice.
- 6 products: OSB-12-8X4 (₹850), OSB-18-8X4 (₹1,200), SOSB-15-8X4 (₹1,050), MDO-12-8X4 (₹950, Limited), HYB-18-8X4 (₹1,350), CV-06-8X4 (₹650).
- Settings defaults and the counters `REQ = 0` and `DSP = 0`.
- Role permission defaults (`0004_access_control.sql`, `st_role_permissions`).
- **No users and no passwords.** The legacy demo parties, couriers, requests, dispatches and notifications go only in the dev-only in-memory seed.
