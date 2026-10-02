-- 0007_stores.sql
--
-- Stores module (legacy "Stores — MRN & GRN"): the gate entry Security makes when a truck arrives
-- (MRN, with one line per material on the vehicle), the receiving note Stores makes against it
-- (GRN, actual quantity and quality per line), the GRN Draft → Reviewed → Approved sign-off, and
-- the accounting audit trail (voucher number once the GRN is booked in the accounts software).
-- Plus the stores_* keys in the role permission matrix and the auto-punch settings.
-- Behaviour lives in api/src/modules/stores (docs/stores-spec.md).
-- Conventions are listed at the top of 0001_users.sql. Nothing here has been run.
--
-- Numbers: MRN/26-27/0001 and GRN/26-27/0001, from st_counters 'MRN-2026-27' / 'GRN-2026-27'
-- (one counter per FY of the document date). Quantities: REAL in the line's unit.

CREATE TABLE sto_mrns (
  id            TEXT PRIMARY KEY,
  mrn_no        TEXT NOT NULL COLLATE NOCASE,
  fy            TEXT NOT NULL,                       -- 2026-27
  date          TEXT NOT NULL,                       -- gate date, YYYY-MM-DD (India)
  time          TEXT NOT NULL,                       -- HH:MM (India)
  vehicle_no    TEXT NOT NULL,
  security_name TEXT NOT NULL,
  driver_name   TEXT,
  driver_phone  TEXT,
  vendor_id     TEXT REFERENCES vn_vendors(id),     -- null for a typed-in vendor
  vendor_name   TEXT NOT NULL,
  invoice_no    TEXT,                                -- invoice / challan, if the driver has it
  remarks       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending_grn' CHECK (status IN ('pending_grn', 'grn_created')),
  grn_id        TEXT,                                -- sto_grns.id (no FK: the GRN row is inserted after)
  grn_no        TEXT,
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at    TEXT
);
CREATE UNIQUE INDEX sto_mrns_mrn_no_uq ON sto_mrns (mrn_no) WHERE deleted_at IS NULL;
CREATE INDEX sto_mrns_status_idx ON sto_mrns (status, date) WHERE deleted_at IS NULL;
CREATE INDEX sto_mrns_date_idx ON sto_mrns (date);

CREATE TABLE sto_mrn_items (
  id         TEXT PRIMARY KEY,
  mrn_id     TEXT NOT NULL REFERENCES sto_mrns(id),
  line_no    INTEGER NOT NULL,
  material   TEXT NOT NULL CHECK (material IN ('nilgiri', 'resin', 'kraft', 'firewood', 'core', 'face', 'other')),
  approx_qty REAL NOT NULL CHECK (approx_qty > 0),
  unit       TEXT NOT NULL CHECK (unit IN ('Kg', 'MT', 'Nos', 'Sheets', 'Bundle', 'Litre', 'Roll')),
  packages   TEXT,
  remarks    TEXT
);
CREATE INDEX sto_mrn_items_mrn_idx ON sto_mrn_items (mrn_id, line_no);

CREATE TABLE sto_grns (
  id                TEXT PRIMARY KEY,
  grn_no            TEXT NOT NULL COLLATE NOCASE,
  fy                TEXT NOT NULL,
  date              TEXT NOT NULL,
  time              TEXT NOT NULL,
  mrn_id            TEXT NOT NULL REFERENCES sto_mrns(id),
  mrn_no            TEXT NOT NULL,
  vehicle_no        TEXT NOT NULL,
  vendor_name       TEXT NOT NULL,
  invoice_no        TEXT NOT NULL,
  purchase_entry_id TEXT REFERENCES pu_entries(id),  -- the Purchase entry with this invoice, found on save
  received_by_name  TEXT NOT NULL,
  remarks           TEXT,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved')),
  reviewed_by       TEXT REFERENCES users(id),
  reviewed_at       TEXT,
  approved_by       TEXT REFERENCES users(id),
  approved_at       TEXT,
  accounted         INTEGER NOT NULL DEFAULT 0 CHECK (accounted IN (0, 1)),
  voucher_no        TEXT,
  accounted_by      TEXT REFERENCES users(id),
  accounted_at      TEXT,
  created_by        TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at        TEXT,
  CHECK (accounted = 0 OR (status = 'approved' AND voucher_no IS NOT NULL))
);
CREATE UNIQUE INDEX sto_grns_grn_no_uq ON sto_grns (grn_no) WHERE deleted_at IS NULL;
-- One live GRN per MRN.
CREATE UNIQUE INDEX sto_grns_mrn_uq ON sto_grns (mrn_id) WHERE deleted_at IS NULL;
CREATE INDEX sto_grns_status_idx ON sto_grns (status, accounted) WHERE deleted_at IS NULL;
CREATE INDEX sto_grns_date_idx ON sto_grns (date);

CREATE TABLE sto_grn_items (
  id              TEXT PRIMARY KEY,
  grn_id          TEXT NOT NULL REFERENCES sto_grns(id),
  line_no         INTEGER NOT NULL,
  mrn_item_id     TEXT REFERENCES sto_mrn_items(id),  -- null = unlisted / extra item found on unloading
  material        TEXT NOT NULL CHECK (material IN ('nilgiri', 'resin', 'kraft', 'firewood', 'core', 'face', 'other')),
  approx_qty      REAL NOT NULL DEFAULT 0,            -- copied from the MRN line (0 for unlisted)
  actual_qty      REAL NOT NULL CHECK (actual_qty > 0),
  unit            TEXT NOT NULL CHECK (unit IN ('Kg', 'MT', 'Nos', 'Sheets', 'Bundle', 'Litre', 'Roll')),
  quality         TEXT NOT NULL CHECK (quality IN ('damaged', 'short', 'partial', 'excess', 'ok')),
  quality_remarks TEXT
);
CREATE INDEX sto_grn_items_grn_idx ON sto_grn_items (grn_id, line_no);

-- ─────────────────────────────────────────────────────────────
-- Settings: auto-punch the MRN / GRN date and time (legacy defaults: on).
-- Same as api/src/seed/stores.ts DEFAULT_STORES_SETTINGS.
-- ─────────────────────────────────────────────────────────────

INSERT INTO st_settings (key, value) VALUES
  ('stores.auto_punch_mrn', 'true'),
  ('stores.auto_punch_grn', 'true');

-- ─────────────────────────────────────────────────────────────
-- Role permissions: append the Stores keys (keeps custom changes).
-- Same result as DEFAULT_ROLE_PERMISSIONS in api/src/domain/access.ts (a test checks 0004 + 0005 + 0006 + 0007).
-- ─────────────────────────────────────────────────────────────

UPDATE st_role_permissions
SET permissions = json_insert(permissions,
      '$.pages[#]', 'stores_dashboard', '$.pages[#]', 'stores_gate', '$.pages[#]', 'stores_grn',
      '$.pages[#]', 'stores_accounting', '$.pages[#]', 'stores_reports', '$.pages[#]', 'stores_settings',
      '$.actions[#]', 'stores_review', '$.actions[#]', 'stores_approve', '$.actions[#]', 'stores_account'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('superadmin', 'admin');

UPDATE st_role_permissions
SET permissions = json_insert(permissions, '$.pages[#]', 'stores_dashboard', '$.pages[#]', 'stores_reports'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('management');
