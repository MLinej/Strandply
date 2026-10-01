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
| `ROLE_PERMS` (hard-coded, edits lost on reload) | `st_settings['roles.permissions']` | see §2 |
| `SEED_USERS` + `users` (plaintext passwords) | `users` (provisional, `0001_users.sql`) | no passwords migrated or seeded |
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

**Rebuild**
- Checks run **on the server** for every route. The UI only hides controls. No auto-login, and passwords are hashed.
- The permission matrix is saved in `st_settings['roles.permissions']` (seeded with the defaults above). "Reset defaults" writes the seeded value back. Superadmin always has everything.
- Whether SampleTrack keeps its own five roles or maps onto the ERP's role model is an open question (§15).

---

## 3. Dashboard

**Legacy**: `renderDashboard()`, `drawCharts()`
- KPI tiles: Total Dispatches, Pending Requests, Delivered, Delayed, Active Parties (counted **all** parties), Couriers. Each role sees only its `dashboard_widgets`.
- Greeting by time of day plus the date.
- Recent dispatches (last 5) and Pending requests (first 5, with priority).
- Charts (full-dashboard roles only): a 6-month "Dispatched vs Delivered" trend, where **the first five months were hard-coded fake numbers**, and a status doughnut with pending requests added to the "Pending" slice.

**Rebuild**: one `GET /dashboard` that returns the counts, recent and pending lists, and a real monthly series grouped by `st_dispatches.date` (or the Delivered timestamp in history). The server filters widgets by role.

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

### 4.1 Numbering
Legacy `nextReqId()` and `nextDspId()` used max(existing) + 1, which races and reuses numbers after a delete. **Rebuild**: `st_counters` bumped in the same unit of work as the insert (`uow.run`). Numbers are `REQ-` / `DSP-` plus at least 4 digits, never reused. The form shows "(auto)" until the record is saved.

### 4.2 Item quantity
Legacy `qty` was free text ("5 sheets"). **Rebuild** keeps exactly what was typed in `qty_raw`, and when it parses also stores `qty_value` (number) and `qty_unit` (default `sheets`). `product_id` is set when the line matches a master product. `product_name`/`board`/`thickness`/`size` are a snapshot taken at save time.

### 4.3 Request status rules (rebuild)
- `Pending → Approved` only, via Approve (needs `edit`). Approving anything else is rejected.
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

### 5.2 Rebuild rules
- Every status change, from the form or the tracking page, goes through **one** service method that adds a `st_dispatch_history` row (`changed_by`, `changed_at`, optional `note`), sends notifications, writes the activity log and runs the request sync, all inside one `uow.run`.
- The courier is `courier_id` when one is picked from the master, otherwise `courier_name_manual`. The picker lists only `Active` couriers whose `type = mode`. For Hand Delivery the courier is optional.
- Weight is optional but must be ≥ 0. Freight is stored in paise.

### 5.3 Dispatch → request status sync (atomic)
Legacy: when saving a dispatch with `reqLink`, status `Dispatched` set the request to `Dispatched`, and `Delivered` set it to `Delivered`. **Rebuild**: the same mapping, done in the same transaction as the dispatch write, from **both** status paths. Statuses after Dispatched that don't move backwards (`In Transit`, `Delayed`) leave the request as `Dispatched`, and if the request is still `Pending`/`Approved` they move it to `Dispatched`. Whether `Returned` should touch the request is an open question (§15).

### 5.4 Courier label (A5 landscape print)
`printCourierLabel()` shows a preview and `doPrintLabel()` opens the print window. Left column: FROM (company, address line, phone, LLPIN), a mode badge, and dispatch ID, date, expected delivery, tracking, courier, vehicle and dimensions (each only if set), then contents (product description). Right column: DELIVER TO (party name large, "Attn: contact", mobile, address, city, state, PIN in bold, email) and the status.

### 5.5 QR code
`showQR()` encodes `ID:<dsp>|Party:<name>|Track:<no or NA>|Status:<status>`. **Legacy sent this to `api.qrserver.com`**, so party data went to a third party. **Rebuild**: generate the QR on the client with a library.

### 5.6 WhatsApp share
`shareWhatsApp()` opens `https://wa.me/?text=…` with a formatted message: company, dispatch ID and date, party and city, courier (or mode), tracking (or "Not assigned yet"), mode, expected delivery (or "TBD"), contents (or "As per order"), current status, an apology line if Delayed, a tracking link if there is one, and a sign-off. Build it client-side from the dispatch detail.

### 5.7 Tracking URL
Legacy `getTrackingUrl()` **ignored the courier's `trackUrl`** and hard-coded three: Blue Dart `https://www.bluedart.com/tracking?trackfor={tracking}`, DTDC `https://www.dtdc.in/tracking.asp?REF_NO={tracking}`, Delhivery `https://www.delhivery.com/track/package/{tracking}`. Otherwise it returned "Contact courier with tracking number: …". **Rebuild**: `st_couriers.tracking_url_template` with `{tracking}` replaced. The dev seed uses the three URLs above.

---

## 6. Live tracking

**Legacy**: `renderTrackList(q)`, `viewTrackDetail(id)`
- Left list: dispatches newest first, search by dispatch ID or party name. Each card shows ID, status, party, courier or mode, tracking, and date → expected date.
- Detail: courier, mode, tracking, vehicle, dispatch date, expected date, freight and city. A **timeline** of the fixed steps Pending → Approved → Packed → Dispatched → In Transit → Delivered, each marked done, current or pending, with the time from history when there is one. `Delayed` and `Returned` were not on the timeline. Actions: Update Status, Print Label, QR, WhatsApp.

**Rebuild**: the timeline comes from `st_dispatch_history` (all 8 statuses, including Delayed and Returned as off-path events) on top of the main steps. Search covers dsp_no, party name and tracking_no.

---

## 7. Parties

**Legacy**: `renderPartyTable`, `openPartyModal`, `editParty`, `setSelectOrAdd`, `saveParty`, `delParty`, `exportParties`, `onCityChange`
- List: filter by type, search, 10 per page. Columns: name, contact, mobile, email, city/state, address, industry, type badge, assigned to. Without edit/delete the row says "View only".
- Form: name (required), contact, mobile, email, GST, address (marked required), city (select = built-in cities ∪ cities already on parties ∪ custom cities), state (select of 36), PIN, industry (default Furniture), type (default Existing Customer), assigned marketing person, remarks.
- **Choosing a city fills in its state** from `cityStateMap`, then from the custom cities.
- **Duplicate check**: a case-insensitive name match asks "Similar party exists: X. Add anyway?" (a warning, not a block).
- Delete: hard delete after a confirm. Requests and dispatches kept the party **name**, so the party's address simply vanished from labels.
- Excel export: Party Name, Contact Person, Mobile, Email, Full Address, City, State, Pincode, GST Number, Industry, Type, Assigned To, Remarks.

**Rebuild**: soft delete. A party with live requests or dispatches can't be deleted (or ask: open question). Duplicate-name check = server returns `possibleDuplicates`, client confirms. Search covers name, contact, mobile, GST and city. Validate GST format and check that its first 2 digits match `st_states.gst_code` of the chosen state (warn only).

---

## 8. Couriers

**Legacy**: `renderCourierTable`, `openCourierModal`, `editCourier`, `saveCourier`, `delCourier`
- List: filter by type, search, 10 per page. Columns: name, type, contact, mobile, email, coverage, a track link, star rating and status. **Edit/delete buttons had no permission check.**
- Form: name (required), type, contact, mobile, email, coverage, tracking URL, rating 1–5, status, remarks.
- Delete: hard.

**Rebuild**: permission-checked. Soft delete. Couriers that dispatches still point to stay in place (FK); inactive ones drop out of the picker.

---

## 9. Products

**Legacy**: `renderProductTable`, `openProductModal`, `editProduct`, `saveProduct`, `delProduct`, `exportProducts`, `importProductsExcel`, `downloadProductTemplate`
- List: filter by board type, search. Counters: total, OSB, S-OSB, MDO, other. **No pagination wiring (`changePg` ignored 'prod'), and no permission check on edit/delete.**
- Form: code, name (required), board type (default OSB), thickness mm, size, category, unit price ₹, stock status (default Available), description.
- **Excel import**: first sheet, case-insensitive fuzzy headers: code ∈ {code, product code, prod code, item code}, name ∈ {name, product name, prod name, item name, product}, board ∈ {board, board type, type, category type}, thickness ∈ {thickness, thick, mm}, size ∈ {size, dimensions}, category ∈ {category, cat}, price ∈ {price, unit price, rate, mrp}, stock ∈ {stock, stock status, availability}. Defaults: board OSB, category Standard, stock Available. Skips rows with no name **or a duplicate name**, then reports "Imported N, skipped M".
- **Import template** download: headers Product Code, Product Name, Board Type, Thickness, Size, Category, Unit Price, Stock Status, with 2 example rows.
- Excel export: Code, Name, Board Type, Thickness, Size, Category, Unit Price ₹, Stock, Description.

**Rebuild**: `code` is required and unique among live rows. Import dedupes on **code** (and also warns on duplicate names), checks board/stock against the enums, and reports skipped rows with their reasons. The whole import is one unit of work. Price → paise.

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

**Rebuild**: each report is a server query with an optional date range (and party/courier filters where they make sense), and returns rows + totals. Excel/CSV export on the server (or the client from the same rows). The pending report uses the entity type, not a guess. Product analysis groups by `product_id` (and falls back to `product_name` for free-text lines) and also sums `qty_value`.

---

## 11. Notifications and activity log

**Legacy**
- `addNotif(type,title,msg)` puts the newest first. `updateBadges()` shows the unread count and pending-request count. `renderNotifs()`. `markRead(id)` set a **global** read flag. `clearNotifs()` deleted **all of them for everyone**.
- Triggers: request created (info), request approved (success), dispatch created (info), dispatch Delayed (warning), dispatch Delivered (success).
- `logActivity(action, details)` was in memory only: login, create/edit of requests and dispatches, user changes, permission saves. The log was viewable in Users → Activity, with a clear button.

**Rebuild**
- `st_notifications` rows with `entity_type`/`entity_id` so a click opens the record. Per-user read and cleared state is in `st_notification_reads`. Unread count = notifications without a read row for this user.
- `st_activity_log` is written by the service layer for every create, edit, delete, status change, approve, import, restore, settings change and login. Viewing it needs the `users` page (admin). Clearing it is an admin-only soft delete, or not allowed at all (open question).

---

## 12. Settings

**Legacy**: `loadSettings`, `saveCompanySettings`, `saveGsConfig`, `updateGsSidebar`, `testGsConn`, `syncToSheets`, `pullFromSheets`, `startAutoSync`, `autoSyncTick`, `renderAppsScript`, `copyScript`, `backupData`, `restoreData`, `clearAllData`, `renderCityMaster`, `addCityToMaster`, `removeCityFromMaster`, `exportCityMaster`

- **Company profile**: name, LLPIN, address line ("City / State"), phone/GST. Used on labels, slips and WhatsApp messages.
- **City master**: add a custom city (name + state, both required, duplicate city name case-insensitive is rejected), remove one, and export built-in + custom cities to Excel.
- **Google Sheets sync**: Spreadsheet ID, Apps Script web-app URL, interval (manual / 5 / 15 / 30 min), last sync time. Test (`?action=ping`). **Push** (`writeAll` overwrites the Dispatches, Requests (flattened one row per product line), Parties, Couriers and Products sheets, and appends to SyncLog keeping the last 100). **Pull** (`readAll`) **replaced local data** with the sheet contents. Auto-push ran on a timer in the browser, and also after each request/dispatch/party save (`autoSyncTick`). The app also showed the full Apps Script code to copy.
- **Backup**: downloads JSON (requests, dispatches, parties, couriers, products, settings, exportedAt).
- **Restore**: upload JSON, confirm, then replace those collections and merge settings.
- **Clear all data**: confirm, type `DELETE`, then wipe requests, dispatches, parties, couriers, products and notifications.

`st_settings` keys (values are JSON): `company.name`, `company.llpin`, `company.address_line`, `company.phone`, `sheets.spreadsheet_id`, `sheets.webapp_url`, `sheets.interval_min`, `sheets.last_sync_at`, `roles.permissions`.

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

**Rebuild**: user management belongs to the ERP core (Admin module). SampleTrack only needs users to exist for `assigned_user_id`, `requested_by_user_id`, `created_by` and `changed_by`, and a "marketing people" list (users with the marketing/admin role) for pickers.

---

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
- **No users and no passwords.** The legacy demo parties, couriers, requests, dispatches and notifications go only in the dev-only in-memory seed.
