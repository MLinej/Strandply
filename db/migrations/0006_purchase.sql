-- 0006_purchase.sql
--
-- Purchase module (legacy Purchase ERP): inward entries for six raw materials, purchase orders,
-- returns, opening stock and consumption per financial year, documents, and the Nilgiri species /
-- face veneer type masters; plus the purchase_* keys in the role permission matrix.
-- Behaviour lives in api/src/modules/purchase (docs/purchase-spec.md).
-- Conventions are listed at the top of 0001_users.sql. Nothing here has been run.
--
-- Quantities: REAL in the material's unit (Kg, Pcs, Sq Mtr). Money: INTEGER paise.
-- Rates: paise per ton (nilgiri, resin, firewood: amount = qty × rate ÷ 1000) or per unit.
-- Amounts (GST, notes, payable) are computed by api/src/contracts/purchase.ts calcEntry, never stored.

CREATE TABLE pu_types (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('nilgiri_species', 'face_veneer')),
  name       TEXT NOT NULL COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX pu_types_kind_name_uq ON pu_types (kind, name) WHERE deleted_at IS NULL;

CREATE TABLE pu_orders (
  id          TEXT PRIMARY KEY,
  po_no       TEXT NOT NULL COLLATE NOCASE,          -- typed in, or PO-YY-NNN from st_counters 'PO-YY'
  date        TEXT NOT NULL,
  material    TEXT NOT NULL CHECK (material IN ('nilgiri', 'resin', 'kraft', 'firewood', 'core', 'face')),
  vendor_id   TEXT REFERENCES vn_vendors(id),
  vendor_name TEXT NOT NULL,
  qty         REAL NOT NULL CHECK (qty > 0),
  rate_paise  INTEGER NOT NULL CHECK (rate_paise >= 0),
  remarks     TEXT,
  tnc_ids     TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tnc_ids)),   -- vn_tnc ids printed on the PO
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);
CREATE UNIQUE INDEX pu_orders_po_no_uq ON pu_orders (po_no) WHERE deleted_at IS NULL;
CREATE INDEX pu_orders_material_idx ON pu_orders (material, date);

CREATE TABLE pu_entries (
  id                  TEXT PRIMARY KEY,
  material            TEXT NOT NULL CHECK (material IN ('nilgiri', 'resin', 'kraft', 'firewood', 'core', 'face')),
  date                TEXT NOT NULL,                  -- inward date
  lot_no              TEXT NOT NULL,                  -- N01, R03 … per material per FY
  po_id               TEXT REFERENCES pu_orders(id),
  vendor_id           TEXT REFERENCES vn_vendors(id),
  vendor_name         TEXT NOT NULL,                  -- snapshot at entry time (also for typed-in vendors)
  vendor_code         TEXT,
  gstin               TEXT,
  pan                 TEXT,
  city                TEXT,
  state               TEXT,
  mobile              TEXT,
  invoice_no          TEXT NOT NULL,
  invoice_date        TEXT,
  tax_type            TEXT NOT NULL CHECK (tax_type IN ('SG+CG', 'IGST', 'URD')),
  gst_pct             INTEGER NOT NULL DEFAULT 18 CHECK (gst_pct IN (0, 5, 12, 18, 28)),
  vehicle_no          TEXT,
  driver              TEXT,
  transporter         TEXT,
  rst_no              TEXT,
  mrn_no              TEXT,
  grn_no              TEXT,
  remarks             TEXT,
  item_id             TEXT REFERENCES vn_products(id),
  item_name           TEXT,
  hsn                 TEXT,
  species             TEXT,                           -- nilgiri: pu_types name at the time
  veneer_type         TEXT,                           -- face veneer
  alt_qty_pcs         REAL,
  inv_qty             REAL NOT NULL CHECK (inv_qty > 0),
  spl_qty             REAL NOT NULL CHECK (spl_qty >= 0),
  rate_paise          INTEGER NOT NULL CHECK (rate_paise > 0),
  rate_diff_paise     INTEGER NOT NULL DEFAULT 0,
  other_charges_paise INTEGER NOT NULL DEFAULT 0 CHECK (other_charges_paise >= 0),
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'approved')),
  approved_by         TEXT REFERENCES users(id),
  approved_at         TEXT,
  qty_note_status     TEXT NOT NULL DEFAULT 'Pending' CHECK (qty_note_status IN ('Pending', 'Under Review', 'Issued', 'Settled', 'Cancelled')),
  rate_note_status    TEXT NOT NULL DEFAULT 'Pending' CHECK (rate_note_status IN ('Pending', 'Under Review', 'Issued', 'Settled', 'Cancelled')),
  created_by          TEXT REFERENCES users(id),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at          TEXT
);
CREATE INDEX pu_entries_date_idx ON pu_entries (date);
CREATE INDEX pu_entries_material_date_idx ON pu_entries (material, date);
CREATE INDEX pu_entries_po_idx ON pu_entries (po_id);
CREATE INDEX pu_entries_invoice_idx ON pu_entries (vendor_name, invoice_no);

CREATE TABLE pu_returns (
  id                  TEXT PRIMARY KEY,
  return_no           TEXT NOT NULL,                  -- RET-YY-NNN from st_counters 'RET-YY'
  date                TEXT NOT NULL,
  material            TEXT NOT NULL CHECK (material IN ('nilgiri', 'resin', 'kraft', 'firewood', 'core', 'face')),
  species             TEXT,
  entry_id            TEXT REFERENCES pu_entries(id),
  vendor_name         TEXT NOT NULL,
  original_invoice_no TEXT,
  qty                 REAL NOT NULL CHECK (qty > 0),
  rate_paise          INTEGER NOT NULL CHECK (rate_paise >= 0),
  tax_type            TEXT NOT NULL CHECK (tax_type IN ('SG+CG', 'IGST', 'URD')),
  gst_pct             INTEGER NOT NULL DEFAULT 18,
  reason              TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  approved_by         TEXT REFERENCES users(id),
  approved_at         TEXT,
  created_by          TEXT REFERENCES users(id),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at          TEXT
);
CREATE UNIQUE INDEX pu_returns_no_uq ON pu_returns (return_no) WHERE deleted_at IS NULL;
CREATE INDEX pu_returns_date_idx ON pu_returns (date);

-- Opening stock: one header per FY ("2026-27"), lines per material (Nilgiri: per species).
CREATE TABLE pu_opening_stock (
  fy          TEXT PRIMARY KEY,
  as_on_date  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved')),
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);
CREATE TABLE pu_opening_stock_items (
  fy         TEXT NOT NULL REFERENCES pu_opening_stock(fy),
  material   TEXT NOT NULL,
  species    TEXT NOT NULL DEFAULT '',               -- '' for materials without species
  qty        REAL NOT NULL CHECK (qty >= 0),
  rate_paise INTEGER NOT NULL CHECK (rate_paise >= 0),
  remarks    TEXT,
  PRIMARY KEY (fy, material, species)
);

-- Consumption per FY per ledger key ('resin', 'nilgiri::Eucalyptus', …), from the chipping report.
CREATE TABLE pu_consumption (
  fy         TEXT NOT NULL,
  key        TEXT NOT NULL,
  qty        REAL NOT NULL CHECK (qty >= 0),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  PRIMARY KEY (fy, key)
);

-- Uploaded files: metadata here, bytes in the blob store (R2) under blob_key.
CREATE TABLE pu_documents (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('Invoice', 'Weighment Slip', 'GRN/MRN', 'Debit Note', 'Credit Note', 'Photo', 'Transport Doc', 'Other')),
  mime       TEXT NOT NULL CHECK (mime IN ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  blob_key   TEXT NOT NULL,
  entry_id   TEXT REFERENCES pu_entries(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);
CREATE INDEX pu_documents_entry_idx ON pu_documents (entry_id);

-- ─────────────────────────────────────────────────────────────
-- Seed: type masters (legacy defaults). Generated from api/src/seed/purchase.ts.
-- ─────────────────────────────────────────────────────────────

INSERT INTO pu_types (id, kind, name, sort_order) VALUES
  ('ptype-nilgiri-eucalyptus', 'nilgiri_species', 'Eucalyptus', 1),
  ('ptype-nilgiri-subabul', 'nilgiri_species', 'Subabul', 2),
  ('ptype-nilgiri-other', 'nilgiri_species', 'Other', 3),
  ('ptype-veneer-teak', 'face_veneer', 'Teak', 1),
  ('ptype-veneer-walnut', 'face_veneer', 'Walnut', 2),
  ('ptype-veneer-oak', 'face_veneer', 'Oak', 3),
  ('ptype-veneer-other', 'face_veneer', 'Other', 4);

-- Legacy PO T&C clauses (TC_MASTER), added to the shared T&C master for purchase orders.
INSERT INTO vn_tnc (id, title, category, version, body, summary, status, applies_to) VALUES
  ('tnc-po-weight', 'Weight Variation', 'Quality', '1.0', 'Acceptable weight variation ±2%. Beyond that, debit/credit note will be issued.', 'Weight variation over ±2% settled by debit/credit note.', 'active', 'po'),
  ('tnc-po-delivery', 'Delivery Schedule', 'Delivery', '1.0', 'Delivery as per agreed schedule. Delay penalty 0.5% per week.', 'Delay penalty 0.5% per week.', 'active', 'po'),
  ('tnc-po-rate', 'Rate Revision', 'Payment', '1.0', 'Rates are fixed for the PO period. Any revision requires written consent.', 'Rates fixed for the PO period.', 'active', 'po'),
  ('tnc-po-gst', 'GST Compliance', 'Legal', '1.0', 'Vendor must provide valid GST invoice. ITC credit subject to vendor filing.', 'Valid GST invoice required.', 'active', 'po');

-- ─────────────────────────────────────────────────────────────
-- Role permissions: append the Purchase keys (keeps custom changes).
-- Same result as DEFAULT_ROLE_PERMISSIONS in api/src/domain/access.ts (a test checks 0004 + 0005 + 0006).
-- ─────────────────────────────────────────────────────────────

UPDATE st_role_permissions
SET permissions = json_insert(permissions,
      '$.pages[#]', 'purchase_dashboard', '$.pages[#]', 'purchase_entries', '$.pages[#]', 'purchase_orders',
      '$.pages[#]', 'purchase_notes', '$.pages[#]', 'purchase_inventory',
      '$.actions[#]', 'purchase_approve'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('superadmin', 'admin');

UPDATE st_role_permissions
SET permissions = json_insert(permissions, '$.pages[#]', 'purchase_dashboard', '$.pages[#]', 'purchase_inventory'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('management');
