# Connecting the database later: checklist

Until the dedicated "connect DB" task, nothing touches D1, wrangler or the Cloudflare API. This file lists everything that has to happen at that point. Add to it whenever a `TODO(d1)` goes into the code.

## Migrations (written, never run)
- [ ] Review `db/migrations/0001_users.sql`. It is a provisional users table. Reconcile it with the ERP auth design (PLAN.md §4: code, PIN hash and salt, must_change_pin, firm access) **before the first apply**, while editing it in place is still safe.
- [ ] Apply `0001`–`0009` to a local D1 and check that the schema and seed counts are right (36 states, 110 cities, 6 sample products, 11 settings, 3 counters, 5 role-permission rows; Vendors: 6 categories, 14 products, 9 T&C clauses; Purchase: 7 types; Stores: 2 settings; Stock: 103 item groups; Production: 5 settings).
- [ ] Confirm D1 accepts the partial unique indexes, the `strftime(...)` column defaults and `json_valid()` in CHECK.
- [ ] Apply to the remote D1.

## Code
- [ ] Implement the `d1` backend for every repo interface and wire `DATA_BACKEND=d1` in `api/src/container.ts`.
- [ ] Implement `uow.run` on D1 as a single `batch()`. Doc numbering (`st_counters`), dispatch → request status sync and restore must each be one batch.
- [ ] Run `api/test/repo-contract.ts` against D1.
- [ ] Find every `TODO(d1)`: `grep -rn "TODO(d1)" api web`.
- [ ] Map camelCase repo types to snake_case columns. `st_role_permissions.permissions` is JSON text, and `locked` is 0/1.
- [ ] Last-superadmin rule (`UserService.assertSuperadminRemains`): today it's check-then-write inside the memory uow. On D1, use a guarded `UPDATE … WHERE (SELECT COUNT(*) …) > 1` and check the changed-row count.
- [ ] Map `SQLITE_CONSTRAINT_UNIQUE` to `UniqueViolationError(entity, field)` (users.username, sessions.token_hash).
- [ ] Add a cron job to delete expired `sessions` rows (`expires_at < now`).
- [ ] Master deletes (party/courier/product): today the memory uow does check-then-soft-delete. On D1, use a guarded `UPDATE … SET deleted_at = ? WHERE id = ? AND NOT EXISTS (live request/dispatch/request item)`, check the changed-row count, and return 409 `in_use` when it is 0.
- [ ] `UsageRepo` queries: `COUNT(*)` on `st_requests.party_id`, `st_dispatches.party_id/courier_id` and `COUNT(DISTINCT request_id)` on `st_request_items.product_id` joined to live requests. Indexes already exist.
- [ ] Party list `assignedUserName`: a LEFT JOIN to users (the memory version uses `getByIds`).
- [ ] Product import commit can be up to 5,000 inserts plus 1 log row. Check D1's per-batch statement and size limits. If it must be chunked, it is no longer all-or-nothing, so either lower `MAX_IMPORT_ROWS` or accept per-chunk atomicity.
- [ ] Case-insensitive uniqueness: product code and city use `COLLATE NOCASE` columns. The memory version also collapses repeated spaces (`normName`). Either normalise on write or accept the small difference.
- [ ] `PartyRepo.findByName` (duplicate check): `WHERE lower(name) = lower(?)`, plus space-collapsing as above.
- [ ] **Request numbering** (`CounterRepo.next`). The memory uow hands out the number and inserts in one rollback-able step. D1 options:
  - (a) Keep the whole create as one `batch()`: `UPDATE st_counters SET last_value = last_value + 1 … ;` then `INSERT INTO st_requests (…, req_no) VALUES (…, (SELECT printf('REQ-%04d', last_value) FROM st_counters WHERE name = 'REQ'))`. The notification text and log details must use the same sub-select, or be written after the batch with the number read back.
  - (b) `UPDATE … RETURNING last_value` as its own statement, then the batch. Numbers can be skipped (gaps) on failure but never duplicated.
  - Pick one and make the contract test (`counters … rolled back with the unit of work`) reflect it.
- [ ] `RequestRepo.setStatus`: `UPDATE st_requests SET status = ? WHERE id = ? AND deleted_at IS NULL AND status IN (…)`, then check the changed-row count.
- [ ] `RequestRepo.list` search across party name, requester name and product names: JOIN parties/users plus `EXISTS (SELECT 1 FROM st_request_items …)`, or the FTS5 `search_index` from PLAN.md §3. Tab counts are one `GROUP BY status` on the same WHERE.
- [ ] Request soft delete must also soft-delete its `st_request_items`, in the same batch.
- [ ] **Dispatch status change.** Memory does it as one rollback-able unit: a guarded status update, a history row, notifications, the request sync and log rows. D1 batches can't branch on a row count, so pick one:
  - (a) Run the guarded `UPDATE st_dispatches SET status=? … WHERE id=? AND status=<old>` alone and check `changes`, then send everything else as one batch. A failure in the second step leaves the status changed with no history row.
  - (b) Make every follow-up insert conditional on the new state, e.g. `INSERT INTO st_dispatch_history … SELECT … FROM st_dispatches WHERE id=? AND status=<new> AND updated_at=<at>`, so the whole change is a single batch.
  - Whichever you pick, rerun the "is one transaction" test in `test/dispatches.test.ts` against D1.
- [ ] DSP numbering: same choice as REQ (see above).
- [ ] `RequestRepo.approve`: `UPDATE st_requests SET status='Approved', approved_by=?, approved_at=?, updated_at=? WHERE id=? AND status='Pending' AND deleted_at IS NULL`, then check `changes`. (`approved_by`/`approved_at` were added to 0002 before it was ever applied.)
- [ ] Dashboard/reports: today the services load the filtered rows (`collectAll`, capped at 20,000) and compute in `reports/calc.ts`. On D1, `DispatchRepo.countByStatus` is one `GROUP BY status`, and `latestStatusAt` is `SELECT dispatch_id, MAX(changed_at) … WHERE status=? AND dispatch_id IN (…) GROUP BY dispatch_id` (chunk the IN list). If data grows, move the grouping for the courier/party/mode reports into SQL. The calc functions then only shape the rows, and their unit tests still apply.
- [ ] Notifications per user: visibility is `n.deleted_at IS NULL AND (n.target_user_id IS NULL OR n.target_user_id = ?) AND NOT EXISTS (dismissed read row)`. Read/clear are `INSERT … ON CONFLICT(notification_id, user_id) DO UPDATE` over `INSERT … SELECT` of the visible set. Add an index on `st_notifications(created_at)` (exists) and consider a retention job; the read table grows by users × notifications.
- [ ] `SettingsRepo`: `value` is JSON text in SQL and decoded in the repo. `set` is `INSERT … ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`.
- [ ] Dispatch list: JOIN parties/couriers/requests for the names. Overdue filter: `expected_delivery_date < ? AND status NOT IN ('Delivered','Returned')`. Index `st_dispatches(expected_delivery_date)` if the list grows.
- [ ] Persisted role permissions: a new page or action key isn't added to roles that already exist in the database. Ship it in a migration that appends with `json_insert(permissions, '$.pages[#]', …)` (0005 does this for the Vendors keys, and a test checks 0004 + 0005 against the code defaults). The memory backend mirrors each such migration in `api/src/seed/upgrades.ts`; the `upgrades` table is memory-only and has no D1 counterpart.
- [ ] If the API moves to Workers: argon2id is pure JS (~300 ms per hash with m=19 MiB, t=2 on a laptop). Check this fits the Workers CPU limit, or move hashing elsewhere.

### Vendors module (0005)
- [ ] `vn_vendors.category_ids` / `product_ids` are id arrays in the memory backend. On D1 they are the `vn_vendor_categories` / `vn_vendor_products` link tables: read them back in `position` order, and on edit DELETE + INSERT them in the same batch as the vendor UPDATE.
- [ ] `VendorRepo.list` category filter: `EXISTS (SELECT 1 FROM vn_vendor_categories WHERE vendor_id = v.id AND category_id = ?)`. State filter is case-insensitive.
- [ ] Vendor and vendor-product codes come from per-year counters (`VEN-YY`, `VP-YY`, e.g. `VEN-26`) and skip codes already taken (typed in by hand or imported). On D1: bump the counter and insert in one batch, and retry on `UniqueViolationError('vendors', 'code')`.
- [ ] Vendor workflow steps (`VendorService.act`): guarded `UPDATE vn_vendors SET status = ? … WHERE id = ? AND status IN (…) AND deleted_at IS NULL`, then check `changes` and return 409 `invalid_transition` when it is 0.
- [ ] Category and product deletes are blocked while used (products/vendors). Use the guarded `UPDATE … WHERE NOT EXISTS (…)` pattern from the master deletes above.
- [ ] Pincodes: `st_city_master.pincodes` is a JSON array, so "one city per pincode" can't be a unique index. Keep the API check, or move pincodes into their own `st_city_pincodes(pincode PRIMARY KEY, city_id)` table if the lookup gets slow (`findByPincode` scans with `json_each`).
- [ ] Vendor import commit: up to 5,000 vendors, each with link rows. Same batch-size question as the product import.
- [ ] `VendorRepo.listAll` feeds reports, find-by-product and pickers. Fine for a few thousand vendors; past that, move the report grouping into SQL.
- [ ] TODO(purchase): block vendor deletes once purchase orders reference vendors.

### Purchase module (0006)
- [ ] `PurchaseEntryRepo.list` searches several text columns; `fy` / `month` filters are date ranges on `pu_entries.date` (index exists). `posted` = `status <> 'draft'`.
- [ ] `listBetween` feeds the dashboard, reports and stock ledger. At a few thousand entries a year it is fine; past that, move the grouping (product × day, monthly, vendor) into SQL — `calcEntry` must then be mirrored in SQL or the totals computed from stored amounts. Keep the unit tests on `calcEntry` as the reference.
- [ ] Opening stock: `pu_opening_stock` + `pu_opening_stock_items` replace the memory row's `items` array; `put` = upsert the header and replace the items in one batch. Species '' ↔ null.
- [ ] `pu_orders.tnc_ids` is a JSON array of `vn_tnc` ids (no FK). If clauses can be deleted, decide whether a printed PO should keep the deleted text (store a snapshot on approval).
- [ ] PO received quantities: one `SELECT po_id, SUM(spl_qty) … WHERE status <> 'draft' GROUP BY po_id`, not a query per PO.
- [ ] Lot / PO / RET numbering: same counter-in-batch question as REQ/DSP (`PO-YY`, `RET-YY` counters; lots use MAX within the FY).
- [ ] Approvals and status changes: guarded `UPDATE … WHERE status = 'pending'`, check `changes`.
- [ ] Deleting a PO is blocked while entries reference it: guarded soft delete with `NOT EXISTS`.

### Stores module (0007)
- [ ] MRN and GRN lines are arrays on the memory rows. On D1 they are `sto_mrn_items` / `sto_grn_items` (ordered by `line_no`): create = header + lines in one batch; edit = UPDATE the header, DELETE + INSERT the lines, same batch. Keep line ids that came back from the client (the GRN lines point at MRN line ids).
- [ ] MRN / GRN numbers come from per-FY counters (`MRN-2026-27`, `GRN-2026-27`). Bump the counter and insert in one batch; retry on `UniqueViolationError('store_mrns', 'mrnNo')`. `peekDocNo` reads the counter without bumping it.
- [ ] Creating a GRN also flips its MRN to `grn_created`; deleting it flips it back. One batch, and the `sto_grns_mrn_uq` partial index stops two live GRNs for one MRN — map that violation to 409 `grn_exists`.
- [ ] GRN steps (review, approve, account, undo): guarded `UPDATE sto_grns SET … WHERE id = ? AND status = ? [AND accounted = ?]`, check `changes`, 409 when 0.
- [ ] `MrnRepo.list` material filter: `EXISTS (SELECT 1 FROM sto_mrn_items WHERE mrn_id = m.id AND material = ?)`.
- [ ] `findInvoice` uses `purchaseEntries.list({ q })` and then an exact match ignoring spaces. On D1 add a dedicated lookup (`WHERE replace(lower(invoice_no), ' ', '') = ?`) or a normalised column with an index.
- [ ] `listPending` feeds the dashboard, pending report and badge (polled every 30 s). Index `sto_mrns_status_idx` covers it; the badge could use a COUNT instead.
- [ ] Settings `stores.auto_punch_mrn` / `stores.auto_punch_grn` are JSON booleans in `st_settings`.

### Stock module (0008)
- [ ] Movements are three memory tables with nested `from` / `to` / `item` refs; on D1 they are flat columns (`from_group_id`, `from_thick`, `from_sku`, …) in `sk_slips`, `sk_reclass`, `sk_opening`.
- [ ] Balances are computed by summing every leg (`allLegs` in `modules/stock/common.ts`). On D1: one `UNION ALL` of the three tables grouped by SKU, or a `sk_balances` table kept in the same batch as each movement. Each check (`ensureAvailable`, `ensureReversible`) must read the balance and write the movement in one batch, or two slips can both pass the check — use a guarded INSERT … SELECT … WHERE balance ≥ qty.
- [ ] Slip / STR numbers: counters `ISS-YYYY`, `MRS-YYYY`, `STR-YYYY` bumped in the insert batch (`sk_slips_no_uq` / `sk_reclass_no_uq` catch races).
- [ ] `sk_groups.thicknesses` is a JSON array. The item-in-use checks scan the movement tables by `group_id`; add indexes on `from_group_id` / `to_group_id` / `group_id` if the item master page gets slow.
- [ ] Ledgers and live stock load every leg. Fine for tens of thousands of movements; past that, move the per-SKU sums and date filters into SQL.

### Production module (0009)
- [ ] Workflow documents keep line items (charges, lots, products, WIP use, MDO items) and `wfTrail` inside the row in memory. On D1: child tables (`pr_hotpress_charges`, `pr_chipping_lots`, `pr_plan_products`, `pr_summary_resin`, `pr_summary_wip`, `pr_mdo_items`) replaced in the same batch as the header update; `wf_trail` and `process` are JSON columns.
- [ ] Lot availability (`lotOptions`) sums every chipping lot / resin entry per Purchase entry. Check-and-insert must be one batch (guarded INSERT … WHERE SPL qty − used ≥ qty) or two reports can over-draw a lot together.
- [ ] WIP balances and the ledger are derived (`wipViews`, `wipLedger`): chipping lots + summary WIP lines + adjustments. Fine at shop-floor volumes; index `pr_summary_wip(wip_id)` exists.
- [ ] Matt weights: `pr_matt_weights(batch_id, n)`. A punch = INSERT with `n = MAX(n)+1` inside the batch; corrections UPDATE / DELETE one row.
- [ ] Document numbers: counters `PR-PPR`, `PR-HP`, `PR-CHR`, `PR-RC`, `PR-BC`, `PR-PS`, `PR-MDO`, `PR-MWB`, `PR-WIP` bumped in the insert batch.
- [ ] One cutting report per hot press and one WIP batch per chipping report: partial unique indexes exist; map violations to 409.
- [ ] Closed financial years are a JSON array in `production.closed_fys`; every write checks it (`guardFy`).

## Infrastructure services (stubs now)
- [ ] Google Sheets sync: real `SheetsSyncService` and a cron trigger for `sheets.interval_min`.
- [ ] Cloud backup: real `BackupService`.
- [ ] File storage: an R2 implementation of `BlobStore` (`api/src/lib/blob-store.ts`) for purchase documents, wired in the Workers entry; a retention job for blobs of soft-deleted documents.
- [ ] E-mail relay: vendor e-mails use the sender in Vendor settings (`vendors.email.from_name`, `vendors.email.reply_to`). Connect sending (the legacy portal's "Send test" was itself a placeholder) together with the Sales module's e-mail relay.
