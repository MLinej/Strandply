-- 0018_change_requests.sql
--
-- Schema changes from the October 2026 change list (vendors, purchase, stores, maintenance). Nothing here has
-- been run. The memory backend applies the same changes through the '0018_change_requests' upgrade in
-- api/src/seed/upgrades.ts.

-- ── Vendors ─────────────────────────────────────────────────────────
-- Bank branch (filled from the IFSC lookup) and supporting documents (GST certificate, cancelled cheque, Udyam…).
ALTER TABLE vn_vendors ADD COLUMN branch TEXT;

CREATE TABLE vn_vendor_documents (
  id          TEXT PRIMARY KEY,
  vendor_id   TEXT NOT NULL REFERENCES vn_vendors(id),
  type        TEXT NOT NULL CHECK (type IN ('GSTIN certificate', 'Bank details', 'Cancelled cheque', 'Udyam certificate', 'PAN card', 'Other')),
  name        TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  blob_key    TEXT NOT NULL,                       -- vendors/<vendor_id>/<id>
  uploaded_by TEXT REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX vn_vendor_documents_vendor_idx ON vn_vendor_documents (vendor_id);

-- ── Purchase entries ────────────────────────────────────────────────
-- Invoice-wise entry (resin, core and face veneer): one row per product line. The entry's inv_qty, spl_qty and
-- rate_paise become the lines' totals and average rate, worked out by the API.
-- raise_notes: whether quantity / rate debit and credit notes are raised (optional for resin and kraft,
-- never for veneers). Existing entries keep their notes.
ALTER TABLE pu_entries ADD COLUMN raise_notes INTEGER NOT NULL DEFAULT 1 CHECK (raise_notes IN (0, 1));

CREATE TABLE pu_entry_lines (
  entry_id   TEXT NOT NULL REFERENCES pu_entries(id),
  position   INTEGER NOT NULL,
  item_id    TEXT REFERENCES vn_products(id),
  item_name  TEXT NOT NULL,
  hsn        TEXT,
  inv_qty    REAL NOT NULL CHECK (inv_qty > 0),
  spl_qty    REAL NOT NULL CHECK (spl_qty >= 0),
  rate_paise INTEGER NOT NULL CHECK (rate_paise > 0),
  PRIMARY KEY (entry_id, position)
);
-- Returns are checked against their lot (pu_returns.entry_id): a lot can't send back more than it received.
CREATE INDEX IF NOT EXISTS pu_returns_entry_idx ON pu_returns (entry_id);

-- ── Purchase orders ─────────────────────────────────────────────────
-- Lines like a sales order, GST and freight, and a review step (pending → reviewed → approved) for the
-- Generated / Reviewed / Approved signatures. The status CHECK changes, so the table is rebuilt.
CREATE TABLE pu_orders_new (
  id             TEXT PRIMARY KEY,
  po_no          TEXT NOT NULL COLLATE NOCASE,
  date           TEXT NOT NULL,
  material       TEXT NOT NULL CHECK (material IN ('nilgiri', 'resin', 'kraft', 'firewood', 'core', 'face')),
  vendor_id      TEXT REFERENCES vn_vendors(id),
  vendor_name    TEXT NOT NULL,
  qty            REAL NOT NULL CHECK (qty > 0),           -- Σ line qty
  rate_paise     INTEGER NOT NULL CHECK (rate_paise >= 0), -- average rate of the lines
  tax_type       TEXT NOT NULL DEFAULT 'SG+CG' CHECK (tax_type IN ('SG+CG', 'IGST', 'URD')),
  gst_pct        REAL NOT NULL DEFAULT 18,
  freight_paise  INTEGER NOT NULL DEFAULT 0 CHECK (freight_paise >= 0),
  payment_terms  TEXT,
  delivery_terms TEXT,
  delivery_date  TEXT,
  quotation_ref  TEXT,
  remarks        TEXT,
  tnc_ids        TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tnc_ids)),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'approved')),
  reviewed_by    TEXT REFERENCES users(id),
  reviewed_at    TEXT,
  approved_by    TEXT REFERENCES users(id),
  approved_at    TEXT,
  created_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at     TEXT
);
INSERT INTO pu_orders_new (id, po_no, date, material, vendor_id, vendor_name, qty, rate_paise, remarks, tnc_ids, status, approved_by, approved_at, created_by, created_at, updated_at, deleted_at)
  SELECT id, po_no, date, material, vendor_id, vendor_name, qty, rate_paise, remarks, tnc_ids, status, approved_by, approved_at, created_by, created_at, updated_at, deleted_at FROM pu_orders;
DROP TABLE pu_orders;
ALTER TABLE pu_orders_new RENAME TO pu_orders;
CREATE UNIQUE INDEX pu_orders_po_no_uq ON pu_orders (po_no) WHERE deleted_at IS NULL;
CREATE INDEX pu_orders_material_idx ON pu_orders (material, date);

-- POs saved before lines have none; the API shows them as one line of their material.
CREATE TABLE pu_order_lines (
  order_id     TEXT NOT NULL REFERENCES pu_orders(id),
  position     INTEGER NOT NULL,
  item_id      TEXT REFERENCES vn_products(id),
  item_name    TEXT NOT NULL,
  hsn          TEXT,
  qty          REAL NOT NULL CHECK (qty > 0),
  rate_paise   INTEGER NOT NULL CHECK (rate_paise >= 0),
  amount_paise INTEGER NOT NULL,
  PRIMARY KEY (order_id, position)
);

-- Nilgiri stock is now kept per product (pu_entries.item_name, falling back to species for older entries);
-- pu_opening_stock_items.species and pu_consumption keys hold the product name for Nilgiri rows. No schema change.

-- ── Stores ──────────────────────────────────────────────────────────
-- MRN and GRN lines name a product from the product master. `material` stays: it is derived from the product
-- (materialForProduct in api/src/contracts/stores.ts) so reports by material keep working; older lines keep theirs.
ALTER TABLE sto_mrn_items ADD COLUMN item_id TEXT REFERENCES vn_products(id);
ALTER TABLE sto_mrn_items ADD COLUMN item_name TEXT;
ALTER TABLE sto_grn_items ADD COLUMN item_id TEXT REFERENCES vn_products(id);
ALTER TABLE sto_grn_items ADD COLUMN item_name TEXT;

-- ── Maintenance ─────────────────────────────────────────────────────
-- "Assigned to" master: technicians offered on work orders (work orders keep the name as text).
CREATE TABLE mt_assignees (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL COLLATE NOCASE,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX mt_assignees_name_uq ON mt_assignees (name) WHERE deleted_at IS NULL;
-- Everyone already on a work order becomes an active entry.
INSERT INTO mt_assignees (id, name)
  SELECT lower(hex(randomblob(16))), assignee FROM (SELECT DISTINCT assignee FROM mt_work_orders WHERE deleted_at IS NULL);

-- Photos on a work order (bytes in the blob store under maintenance/<work_order_id>/<id>).
CREATE TABLE mt_work_order_photos (
  id            TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES mt_work_orders(id),
  name          TEXT NOT NULL,
  mime          TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes    INTEGER NOT NULL,
  uploaded_by   TEXT REFERENCES users(id),
  uploaded_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX mt_work_order_photos_wo_idx ON mt_work_order_photos (work_order_id);

-- ── Company settings ────────────────────────────────────────────────
-- New st_settings keys, written when first saved (a missing key reads as empty): company.email, company.pan,
-- company.state_code (else the GSTIN's first two digits), company.bank_name, company.bank_account_no, company.bank_ifsc.

-- MRN: the challan / PO / transport details printed on the gate entry, and per line the challan quantity and
-- the condition seen at the gate. GRN: the store location, and per line the quantity rejected at QC.
ALTER TABLE sto_mrns ADD COLUMN challan_date TEXT;
ALTER TABLE sto_mrns ADD COLUMN po_no TEXT;
ALTER TABLE sto_mrns ADD COLUMN time_out TEXT;
ALTER TABLE sto_mrns ADD COLUMN transporter TEXT;
ALTER TABLE sto_mrns ADD COLUMN lr_no TEXT;
ALTER TABLE sto_mrns ADD COLUMN eway_bill TEXT;
ALTER TABLE sto_mrn_items ADD COLUMN challan_qty REAL;
ALTER TABLE sto_mrn_items ADD COLUMN condition TEXT CHECK (condition IS NULL OR condition IN ('Sealed', 'Good', 'Damaged', 'Leaking', 'Wet'));
ALTER TABLE sto_grns ADD COLUMN location TEXT;
ALTER TABLE sto_grn_items ADD COLUMN rejected_qty REAL NOT NULL DEFAULT 0 CHECK (rejected_qty >= 0);
-- Equipment and station on a work order (printed on the maintenance job card).
ALTER TABLE mt_work_orders ADD COLUMN equipment TEXT;
ALTER TABLE mt_work_orders ADD COLUMN station TEXT;
