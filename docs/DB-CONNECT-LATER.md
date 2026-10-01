# Connecting the database later: checklist

Until the dedicated "connect DB" task, nothing touches D1, wrangler or the Cloudflare API. This file lists everything that has to happen at that point. Add to it whenever a `TODO(d1)` goes into the code.

## Migrations (written, never run)
- [ ] Review `db/migrations/0001_users.sql`. It is a provisional users table. Reconcile it with the ERP auth design (PLAN.md §4: code, PIN hash and salt, must_change_pin, firm access) **before the first apply**, while editing it in place is still safe.
- [ ] Apply `0001`–`0003` to a local D1 and check that the schema and seed counts are right (36 states, 109 cities, 6 products, 9 settings, 2 counters).
- [ ] Confirm D1 accepts the partial unique indexes and the `strftime(...)` column defaults.
- [ ] Apply to the remote D1.

## Code
- [ ] Implement the `d1` backend for every repo interface and wire `DATA_BACKEND=d1` in `api/src/container.ts`.
- [ ] Implement `uow.run` on D1 as a single `batch()`. Doc numbering (`st_counters`), dispatch → request status sync and restore must each be one batch.
- [ ] Run `api/test/repo-contract.ts` against D1.
- [ ] Find every `TODO(d1)`: `grep -rn "TODO(d1)" api web`.

## Infrastructure services (stubs now)
- [ ] Google Sheets sync: real `SheetsSyncService` and a cron trigger for `sheets.interval_min`.
- [ ] Cloud backup: real `BackupService`.
