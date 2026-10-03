-- 0010_sales.sql
--
-- Sales module (legacy "Sales ERP"): party master, item master, effective-dated price list and weight
-- chart, proforma invoices → sales orders → sales invoices (with approval), dispatch details, FG inventory,
-- the LLP → OSB inter-company register; plus the sales_* keys in the role permission matrix and the
-- sales settings. Behaviour lives in api/src/modules/sales (docs/sales-spec.md).
-- Conventions are listed at the top of 0001_users.sql. Nothing here has been run.
--
-- Firms: 'llp' (Strandply LLP, Gujarat, GST state 24) and 'osb' (Strandply OSB, Maharashtra, 27).
-- Document numbers per firm and FY from st_counters 'SL-SO-<firm>-<fy>', 'SL-PI-…', 'SL-INV-…':
-- SO/12/26-27, PI/004/26-27, SPL/07/26-27 (LLP invoices), OSB/07/26-27 (OSB invoices); OSB orders and
-- proformas get an OSB- prefix. Money: INTEGER paise. Rates: paise per sq m. Sq m: REAL, 4 decimals.
-- Lines copy the item's details when saved. total_paise is the stored grand total (items + freight + GST);
-- the GST split and weights are calculated (api/src/contracts/sales.ts docTotals).

CREATE TABLE sl_customers (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  code               TEXT,
  dealer_type        TEXT NOT NULL DEFAULT 'Dealer' CHECK (dealer_type IN ('Dealer', 'OEM', 'Distributor', 'Internal Company')),
  gstin              TEXT,
  pan                TEXT,
  account_group      TEXT NOT NULL DEFAULT 'SUNDRY DEBTORS',
  address            TEXT,
  city               TEXT,
  state              TEXT,
  country            TEXT NOT NULL DEFAULT 'India',
  pincode            TEXT,
  contact_person     TEXT,
  mobile1            TEXT,
  mobile2            TEXT,
  email              TEXT,
  credit_days        INTEGER NOT NULL DEFAULT 0 CHECK (credit_days >= 0),
  credit_limit_paise INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit_paise >= 0),
  transport_pref     TEXT,
  payment_terms      TEXT,
  tax_type_llp       TEXT NOT NULL DEFAULT 'SG+CG' CHECK (tax_type_llp IN ('SG+CG', 'IGST')),
  tax_type_osb       TEXT NOT NULL DEFAULT 'SG+CG' CHECK (tax_type_osb IN ('SG+CG', 'IGST')),
  active             INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by         TEXT REFERENCES users(id),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at         TEXT
);
CREATE UNIQUE INDEX sl_customers_name_uq ON sl_customers (lower(trim(name))) WHERE deleted_at IS NULL;
CREATE INDEX sl_customers_state_city_idx ON sl_customers (state, city);

CREATE TABLE sl_items (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  brand              TEXT NOT NULL,
  grade              TEXT NOT NULL,
  sub_type           TEXT,
  thic               REAL NOT NULL CHECK (thic > 0),     -- mm
  width              REAL NOT NULL CHECK (width > 0),
  length             REAL NOT NULL CHECK (length > 0),
  sqm_factor         REAL NOT NULL CHECK (sqm_factor > 0),
  default_rate_paise INTEGER NOT NULL DEFAULT 0,       -- per sq m
  hsn                TEXT,
  active             INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by         TEXT REFERENCES users(id),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at         TEXT
);
CREATE UNIQUE INDEX sl_items_name_uq ON sl_items (lower(trim(name))) WHERE deleted_at IS NULL;

-- The value applies from effective_date until a later row for the same item.
CREATE TABLE sl_price_list (
  id             TEXT PRIMARY KEY,
  item_id        TEXT NOT NULL REFERENCES sl_items(id),
  effective_date TEXT NOT NULL,
  rate_paise     INTEGER NOT NULL CHECK (rate_paise > 0),   -- per sq m
  created_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at     TEXT
);
CREATE UNIQUE INDEX sl_price_list_item_date_uq ON sl_price_list (item_id, effective_date) WHERE deleted_at IS NULL;

CREATE TABLE sl_weight_chart (
  id             TEXT PRIMARY KEY,
  item_id        TEXT NOT NULL REFERENCES sl_items(id),
  effective_date TEXT NOT NULL,
  weight_kg      REAL NOT NULL CHECK (weight_kg > 0),        -- per board
  created_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at     TEXT
);
CREATE UNIQUE INDEX sl_weight_chart_item_date_uq ON sl_weight_chart (item_id, effective_date) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- Proformas, orders and invoices. Party names, state and city are copied in when saved.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE sl_proformas (
  id             TEXT PRIMARY KEY,
  firm           TEXT NOT NULL CHECK (firm IN ('llp', 'osb')),
  pi_no          TEXT NOT NULL,
  date           TEXT NOT NULL,
  valid_until    TEXT,
  po_ref         TEXT,
  bill_to_id     TEXT REFERENCES sl_customers(id),
  bill_to        TEXT NOT NULL,
  ship_to_id     TEXT REFERENCES sl_customers(id),
  ship_to        TEXT NOT NULL,
  state          TEXT,
  city           TEXT,
  sales_person   TEXT,
  payment_terms  TEXT,
  delivery_terms TEXT,
  tax_type       TEXT NOT NULL CHECK (tax_type IN ('SG+CG', 'IGST')),
  freight_paise  INTEGER NOT NULL DEFAULT 0,
  gst_pct        REAL NOT NULL DEFAULT 18,
  total_paise    INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'confirmed', 'cancelled')),
  so_id          TEXT,                                   -- sl_orders.id once confirmed
  so_no          TEXT,
  remarks        TEXT,
  created_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at     TEXT
);
CREATE UNIQUE INDEX sl_proformas_no_uq ON sl_proformas (lower(pi_no)) WHERE deleted_at IS NULL;
CREATE INDEX sl_proformas_firm_date_idx ON sl_proformas (firm, date);

-- Order / proforma line (same columns). amount_paise = round(qty_sqm × rate_paise).
CREATE TABLE sl_proforma_lines (
  proforma_id  TEXT NOT NULL REFERENCES sl_proformas(id),
  line_no      INTEGER NOT NULL,
  item_id      TEXT REFERENCES sl_items(id),
  item_name    TEXT NOT NULL,
  brand        TEXT,
  grade        TEXT,
  sub_type     TEXT,
  thic         REAL,
  width        REAL,
  length       REAL,
  hsn          TEXT,
  sqm_factor   REAL NOT NULL,
  pcs          INTEGER NOT NULL CHECK (pcs >= 0),
  qty_sqm      REAL NOT NULL CHECK (qty_sqm > 0),
  rate_paise   INTEGER NOT NULL CHECK (rate_paise >= 0),
  weight_kg    REAL NOT NULL DEFAULT 0,                   -- per board
  amount_paise INTEGER NOT NULL,
  PRIMARY KEY (proforma_id, line_no)
);

CREATE TABLE sl_orders (
  id                 TEXT PRIMARY KEY,
  firm               TEXT NOT NULL CHECK (firm IN ('llp', 'osb')),
  so_no              TEXT NOT NULL,
  date               TEXT NOT NULL,
  po_no              TEXT,
  po_date            TEXT,
  edd                TEXT,                               -- expected dispatch date
  bill_to_id         TEXT REFERENCES sl_customers(id),
  bill_to            TEXT NOT NULL,
  ship_to_id         TEXT REFERENCES sl_customers(id),
  ship_to            TEXT NOT NULL,
  state              TEXT,
  city               TEXT,
  sales_person       TEXT,
  payment_terms      TEXT,
  delivery_terms     TEXT,
  tax_type           TEXT NOT NULL CHECK (tax_type IN ('SG+CG', 'IGST')),
  freight_paise      INTEGER NOT NULL DEFAULT 0,
  gst_pct            REAL NOT NULL DEFAULT 18,
  total_paise        INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'planned', 'ready', 'partial', 'completed', 'cancelled')),
  remarks            TEXT,
  pi_id              TEXT REFERENCES sl_proformas(id),
  pi_no              TEXT,
  dispatch_date      TEXT,
  vehicle_no         TEXT,
  transporter        TEXT,
  transporter_gstin  TEXT,
  lr_no              TEXT,
  driver_name        TEXT,
  driver_mobile      TEXT,
  created_by         TEXT REFERENCES users(id),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at         TEXT
);
CREATE UNIQUE INDEX sl_orders_no_uq ON sl_orders (lower(so_no)) WHERE deleted_at IS NULL;
CREATE INDEX sl_orders_firm_date_idx ON sl_orders (firm, date);
CREATE INDEX sl_orders_status_idx ON sl_orders (status);

CREATE TABLE sl_order_lines (
  order_id     TEXT NOT NULL REFERENCES sl_orders(id),
  line_no      INTEGER NOT NULL,
  item_id      TEXT REFERENCES sl_items(id),
  item_name    TEXT NOT NULL,
  brand        TEXT,
  grade        TEXT,
  sub_type     TEXT,
  thic         REAL,
  width        REAL,
  length       REAL,
  hsn          TEXT,
  sqm_factor   REAL NOT NULL,
  pcs          INTEGER NOT NULL CHECK (pcs >= 0),
  qty_sqm      REAL NOT NULL CHECK (qty_sqm > 0),
  rate_paise   INTEGER NOT NULL CHECK (rate_paise >= 0),
  weight_kg    REAL NOT NULL DEFAULT 0,
  amount_paise INTEGER NOT NULL,
  PRIMARY KEY (order_id, line_no)
);

CREATE TABLE sl_invoices (
  id                TEXT PRIMARY KEY,
  firm              TEXT NOT NULL CHECK (firm IN ('llp', 'osb')),
  inv_no            TEXT NOT NULL,
  date              TEXT NOT NULL,
  so_id             TEXT REFERENCES sl_orders(id),
  so_no             TEXT,
  po_no             TEXT,
  bill_to_id        TEXT REFERENCES sl_customers(id),
  bill_to           TEXT NOT NULL,
  ship_to_id        TEXT REFERENCES sl_customers(id),
  ship_to           TEXT NOT NULL,
  state             TEXT,
  city              TEXT,
  tax_type          TEXT NOT NULL CHECK (tax_type IN ('SG+CG', 'IGST')),
  freight_paise     INTEGER NOT NULL DEFAULT 0,
  gst_pct           REAL NOT NULL DEFAULT 18,
  total_paise       INTEGER NOT NULL,
  irn               TEXT,                                -- e-invoice reference
  eway_bill         TEXT,
  weight_tons       REAL,
  approval          TEXT NOT NULL DEFAULT 'pending' CHECK (approval IN ('pending', 'approved', 'rejected')),
  approval_note     TEXT,
  approved_by       TEXT REFERENCES users(id),
  approved_by_name  TEXT,
  approved_at       TEXT,
  remarks           TEXT,
  created_by        TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at        TEXT
);
CREATE UNIQUE INDEX sl_invoices_no_uq ON sl_invoices (lower(inv_no)) WHERE deleted_at IS NULL;
CREATE INDEX sl_invoices_firm_date_idx ON sl_invoices (firm, date);
CREATE INDEX sl_invoices_so_idx ON sl_invoices (so_id);

-- Dispatched against an order line (so_line = sl_order_lines.line_no); so_pcs / so_qty_sqm copied for reference.
CREATE TABLE sl_invoice_lines (
  invoice_id   TEXT NOT NULL REFERENCES sl_invoices(id),
  line_no      INTEGER NOT NULL,
  so_line      INTEGER,
  item_id      TEXT REFERENCES sl_items(id),
  item_name    TEXT NOT NULL,
  brand        TEXT,
  grade        TEXT,
  sub_type     TEXT,
  thic         REAL,
  width        REAL,
  length       REAL,
  hsn          TEXT,
  sqm_factor   REAL NOT NULL,
  so_pcs       INTEGER NOT NULL,
  so_qty_sqm   REAL NOT NULL,
  pcs          INTEGER NOT NULL CHECK (pcs >= 0),
  qty_sqm      REAL NOT NULL CHECK (qty_sqm > 0),
  rate_paise   INTEGER NOT NULL CHECK (rate_paise >= 0),
  amount_paise INTEGER NOT NULL,
  PRIMARY KEY (invoice_id, line_no)
);

-- ─────────────────────────────────────────────────────────────
-- FG inventory and the inter-company register
-- ─────────────────────────────────────────────────────────────

-- One row per firm and specification. Reserved / available are calculated from pending orders.
CREATE TABLE sl_fg_stock (
  id              TEXT PRIMARY KEY,
  firm            TEXT NOT NULL CHECK (firm IN ('llp', 'osb')),
  grade           TEXT NOT NULL,
  thic            REAL NOT NULL,
  width           REAL NOT NULL,
  length          REAL NOT NULL,
  qty_on_hand_sqm REAL NOT NULL DEFAULT 0,
  reorder_sqm     REAL NOT NULL DEFAULT 0,
  created_by      TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at      TEXT
);
CREATE UNIQUE INDEX sl_fg_stock_spec_uq ON sl_fg_stock (firm, grade, thic, width, length) WHERE deleted_at IS NULL;

-- LLP → OSB billing documents as in OSB's purchase register; billing_doc matches an LLP invoice number.
CREATE TABLE sl_intercompany (
  id             TEXT PRIMARY KEY,
  billing_doc    TEXT NOT NULL,
  billing_date   TEXT NOT NULL,
  material_desc  TEXT NOT NULL,
  grade          TEXT,
  thic           REAL,
  width          REAL,
  length         REAL,
  pcs            INTEGER NOT NULL DEFAULT 0,
  qty_sqm        REAL NOT NULL DEFAULT 0,
  rate_paise     INTEGER NOT NULL DEFAULT 0,
  material_paise INTEGER NOT NULL DEFAULT 0,
  cgst_paise     INTEGER NOT NULL DEFAULT 0,
  sgst_paise     INTEGER NOT NULL DEFAULT 0,
  igst_paise     INTEGER NOT NULL DEFAULT 0,
  freight_paise  INTEGER NOT NULL DEFAULT 0,
  total_paise    INTEGER NOT NULL DEFAULT 0,
  vehicle_no     TEXT,
  created_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at     TEXT
);
CREATE UNIQUE INDEX sl_intercompany_doc_uq ON sl_intercompany (lower(billing_doc)) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- Item master: the legacy catalogue. Same rows as api/src/seed/sales-items.ts.
-- ─────────────────────────────────────────────────────────────

INSERT INTO sl_items (id, name, brand, grade, sub_type, thic, width, length, sqm_factor, default_rate_paise, hsn) VALUES
  ('sli-1', 'S-OSB PRELAM + MDO 1220mm X 2440mm X 12mm', 'Strandply', 'S-OSB', 'PRELAM + MDO', 12, 1220, 2440, 2.9768, 44074, '441012'),
  ('sli-2', 'S-OSB MDO 1220mm X 2440mm X 9mm', 'Strandply', 'S-OSB', 'MDO', 9, 1220, 2440, 2.9768, 33099, '441012'),
  ('sli-3', 'S-OSB MDO 1220mm X 2440mm X 12mm', 'Strandply', 'S-OSB', 'MDO', 12, 1220, 2440, 2.9768, 40430, '441012'),
  ('sli-4', 'S-OSB MDO 1220mm X 2440mm X 17mm', 'Strandply', 'S-OSB', 'MDO', 17, 1220, 2440, 2.9768, 49030, '441012'),
  ('sli-5', 'S-OSB MDO 1220mm X 2440mm X 16mm', 'Strandply', 'S-OSB', 'MDO', 16, 1220, 2440, 2.9768, 46987, '441012'),
  ('sli-6', 'S-OSB MDO 1220mm X 2440mm X 25mm', 'Strandply', 'S-OSB', 'MDO', 25, 1220, 2440, 2.9768, 67939, '441012'),
  ('sli-7', 'OSB CALIBRATED 1220mm X 2440mm X 18mm', 'Strandply', 'OSB', 'CALIBRATED', 18, 1220, 2440, 2.9768, 43644, '441012'),
  ('sli-8', 'S-OSB MDO + Prelam GC- 1094 1220mm X 2440mm X 9mm', 'Strandply', 'S-OSB', 'MDO + Prelam GC- 1094', 9, 1220, 2440, 2.9768, 39506, '441012'),
  ('sli-9', 'OSB HYBRID Without Face 1220mm X 2440mm X 11mm', 'Strandply', 'OSB HYBRID', 'Without Face', 11, 1220, 2440, 2.9768, 29325, '441012'),
  ('sli-10', 'OSB HYBRID With Face 1220mm X 2134mm X 11mm', 'Strandply', 'OSB HYBRID', 'With Face', 11, 1220, 2134, 2.6035, 32819, '441012'),
  ('sli-11', 'OSB HYBRID With Face 1220mm X 2440mm X 11mm', 'Strandply', 'OSB HYBRID', 'With Face', 11, 1220, 2440, 2.9768, 32819, '441012'),
  ('sli-12', 'OSB HYBRID With Face 1220mm X 2440mm X 16mm', 'Strandply', 'OSB HYBRID', 'With Face', 16, 1220, 2440, 2.9768, 42462, '441012'),
  ('sli-13', 'OSB HYBRID 1220mm X 2440mm X 11mm', 'Strandply', 'OSB HYBRID', NULL, 11, 1220, 2440, 2.9768, 32819, '441012'),
  ('sli-14', 'OSB HYBRID Double Core 1220mm X 2440mm X 17mm', 'Strandply', 'OSB HYBRID', 'Double Core', 17, 1220, 2440, 2.9768, 43558, '441012'),
  ('sli-15', 'S-OSB CALIBRATED B-GRADE 1220mm X 2440mm X 12mm', 'Strandply', 'S-OSB', 'CALIBRATED B-GRADE', 12, 1220, 2440, 2.9768, 23515, '441012'),
  ('sli-16', 'OSB COATED 1220mm X 2440mm X 12mm', 'Strandply', 'OSB', 'COATED', 12, 1220, 2440, 2.9768, 30744, '441012'),
  ('sli-17', 'OSB CALIBRATED 1220mm X 2440mm X 12mm', 'Strandply', 'OSB', 'CALIBRATED', 12, 1220, 2440, 2.9768, 30744, '441012'),
  ('sli-18', 'S-OSB CALIBRATED 1220mm X 2440mm X 16mm', 'Strandply', 'S-OSB', 'CALIBRATED', 16, 1220, 2440, 2.9768, 37732, '441012'),
  ('sli-19', 'OSB PLAIN 1220mm X 2440mm X 12mm', 'Strandply', 'OSB', 'PLAIN', 12, 1220, 2440, 2.9768, 28272, '441012'),
  ('sli-20', 'S-OSB CALIBRATED 1220mm X 2440mm X 12mm', 'Strandply', 'S-OSB', 'CALIBRATED', 12, 1220, 2440, 2.9768, 26831, '441012'),
  ('sli-21', 'S-OSB CALIBRATED 1220mm X 2440mm X 17mm', 'Strandply', 'S-OSB', 'CALIBRATED', 17, 1220, 2440, 2.9768, 36324, '441012'),
  ('sli-22', 'S-OSB CALIBRATED 1220mm X 2440mm X 18mm', 'Strandply', 'S-OSB', 'CALIBRATED', 18, 1220, 2440, 2.9768, 38366, '441012'),
  ('sli-23', 'OSB COATED 1220mm X 2440mm X 10mm', 'Strandply', 'OSB', 'COATED', 10, 1220, 2440, 2.9768, 23650, '441012'),
  ('sli-24', 'OSB COATED 1220mm X 2440mm X 14mm', 'Strandply', 'OSB', 'COATED', 14, 1220, 2440, 2.9768, 31174, '441012'),
  ('sli-25', 'OSB HYBRID MDO + OCKUME FACE 1220mm X 2440mm X 14mm', 'Strandply', 'OSB HYBRID', 'MDO + OCKUME FACE', 14, 1220, 2440, 2.9768, 40398, '441012'),
  ('sli-26', 'OSB HYBRID OCKUME FACE 1220mm X 2440mm X 17mm', 'Strandply', 'OSB HYBRID', 'OCKUME FACE', 17, 1220, 2440, 2.9768, 43558, '441012'),
  ('sli-27', 'S-OSB OCKUME FACE 1220mm X 2440mm X 17mm', 'Strandply', 'S-OSB', 'OCKUME FACE', 17, 1220, 2440, 2.9768, 49987, '441012'),
  ('sli-28', 'S-OSB CALIBRATED B-GRADE 1220mm X 2440mm X 18mm', 'Strandply', 'S-OSB', 'CALIBRATED B-GRADE', 18, 1220, 2440, 2.9768, 38850, '441012'),
  ('sli-29', 'OSB CALIBRATED 1220mm X 2440mm X 16mm', 'Strandply', 'OSB', 'CALIBRATED', 16, 1220, 2440, 2.9768, 39914, '441012'),
  ('sli-30', 'S-OSB OCKUME FACE 1220mm X 2440mm X 9mm', 'Strandply', 'S-OSB', 'OCKUME FACE', 9, 1220, 2440, 2.9768, 0, '441012'),
  ('sli-31', 'S-OSB ONE SIDE WHITE + ONE SIDE BLACK 1220mm X 2440mm X 14mm', 'Strandply', 'S-OSB', 'ONE SIDE WHITE + ONE SIDE BLACK', 14, 1220, 2440, 2.9768, 37958, '441012'),
  ('sli-32', 'S-OSB GURJAN FACE 1220mm X 2440mm X 17mm', 'Strandply', 'S-OSB', 'GURJAN FACE', 17, 1220, 2440, 2.9768, 43558, '441012'),
  ('sli-33', 'OSB COATED 1220mm X 2440mm X 8mm', 'Strandply', 'OSB', 'COATED', 8, 1220, 2440, 2.9768, 20425, '441012'),
  ('sli-34', 'OSB COATED 1220mm X 2440mm X 9mm', 'Strandply', 'OSB', 'COATED', 9, 1220, 2440, 2.9768, 22575, '441012'),
  ('sli-35', 'S-OSB OCKUME FACE 1220mm X 2440mm X 12mm', 'Strandply', 'S-OSB', 'OCKUME FACE', 12, 1220, 2440, 2.9768, 40312, '441012'),
  ('sli-36', 'OSB HYBRID Without Face 1220mm X 2440mm X 14mm', 'Strandply', 'OSB HYBRID', 'Without Face', 14, 1220, 2440, 2.9768, 36904, '441012'),
  ('sli-37', 'OSB CALIBRATED 1220mm X 2440mm X 9mm', 'Strandply', 'OSB', 'CALIBRATED', 9, 1220, 2440, 2.9768, 25875, '441012'),
  ('sli-38', 'S-OSB PRELAM BOTH SIDE 1220mm X 2134mm X 9mm', 'Strandply', 'S-OSB', 'PRELAM BOTH SIDE', 9, 1220, 2134, 2.6035, 43945, '441012'),
  ('sli-39', 'OSB COATED 1220mm X 2440mm X 16mm', 'Strandply', 'OSB', 'COATED', 16, 1220, 2440, 2.9768, 35474, '441012'),
  ('sli-40', 'OSB COATED 1220mm X 2440mm X 18mm', 'Strandply', 'OSB', 'COATED', 18, 1220, 2440, 2.9768, 39774, '441012'),
  ('sli-41', 'OSB HYBRID Without Face 1220mm X 2440mm X 16mm', 'Strandply', 'OSB HYBRID', 'Without Face', 16, 1220, 2440, 2.9768, 38968, '441012'),
  ('sli-42', 'OSB HYBRID Without Face 1220mm X 2440mm X 18mm', 'Strandply', 'OSB HYBRID', 'Without Face', 18, 1220, 2440, 2.9768, 42053, '441012'),
  ('sli-43', 'OSB HYBRID OCKUME FACE 1220mm X 2440mm X 11mm', 'Strandply', 'OSB HYBRID', 'OCKUME FACE', 11, 1220, 2440, 2.9768, 32819, '441012'),
  ('sli-44', 'OSB HYBRID GORILA 1220mm X 2440mm X 11mm', 'Strandply', 'OSB HYBRID', 'GORILA', 11, 1220, 2440, 2.9768, 32013, '441012'),
  ('sli-45', 'OSB PLAIN COATED 1220mm X 2440mm X 12mm', 'Strandply', 'OSB', 'PLAIN COATED', 12, 1220, 2440, 2.9768, 27949, '441012'),
  ('sli-46', 'OSB PLAIN COATED 1220mm X 2440mm X 15mm', 'Strandply', 'OSB', 'PLAIN COATED', 15, 1220, 2440, 2.9768, 33324, '441012'),
  ('sli-47', 'OSB PLAIN COATED 1220mm X 2440mm X 16mm', 'Strandply', 'OSB', 'PLAIN COATED', 16, 1220, 2440, 2.9768, 35474, '441012'),
  ('sli-48', 'S-OSB MDO B-GRADE 1220mm X 2440mm X 18mm', 'Strandply', 'S-OSB', 'MDO B-GRADE', 18, 1220, 2440, 2.9768, 41279, '441012'),
  ('sli-49', 'S-OSB MDO 1220mm X 2440mm X 23mm', 'Strandply', 'S-OSB', 'MDO', 23, 1220, 2440, 2.9768, 60199, '441012'),
  ('sli-50', 'S-OSB MDO 1220mm X 2440mm X 18mm', 'Strandply', 'S-OSB', 'MDO', 18, 1220, 2440, 2.9768, 51599, '441012'),
  ('sli-51', 'OSB PLAIN COATED 1220mm X 2440mm X 8mm', 'Strandply', 'OSB', 'PLAIN COATED', 8, 1220, 2440, 2.9768, 20425, '441012'),
  ('sli-52', 'OSB PLAIN COATED 1220mm X 2440mm X 10mm', 'Strandply', 'OSB', 'PLAIN COATED', 10, 1220, 2440, 2.9768, 23650, '441012'),
  ('sli-53', 'S-OSB CALIBRATED B-GRADE 1220mm X 2440mm X 9mm', 'Strandply', 'S-OSB', 'CALIBRATED B-GRADE', 9, 1220, 2440, 2.9768, 21836, '441012'),
  ('sli-54', 'OSB HYBRID Double Core 1220mm X 2440mm X 14mm', 'Strandply', 'OSB HYBRID', 'Double Core', 14, 1220, 2440, 2.9768, 36904, '441012'),
  ('sli-55', 'OSB CALIBRATED 1220mm X 2440mm X 17mm', 'Strandply', 'OSB', 'CALIBRATED', 17, 1220, 2440, 2.9768, 39291, '441012'),
  ('sli-56', 'S-OSB PRELAM BOTH SIDE 1220mm X 2440mm X 12mm', 'Strandply', 'S-OSB', 'PRELAM BOTH SIDE', 12, 1220, 2440, 2.9768, 49804, '441012'),
  ('sli-57', 'OSB COATED 1220mm X 2134mm X 10mm', 'Strandply', 'OSB', 'COATED', 10, 1220, 2134, 2.6035, 0, '441012'),
  ('sli-58', 'OSB HYBRID Without Face 1220mm X 2134mm X 11mm', 'Strandply', 'OSB HYBRID', 'Without Face', 11, 1220, 2134, 2.6035, 0, '441012'),
  ('sli-59', 'OSB HYBRID CORE 1220mm X 2440mm X 14mm', 'Strandply', 'OSB HYBRID', 'CORE', 14, 1220, 2440, 2.9768, 0, '441012'),
  ('sli-60', 'OSB HYBRID GORILA 1220mm X 2440mm X 14mm', 'Strandply', 'OSB HYBRID', 'GORILA', 14, 1220, 2440, 2.9768, 0, '441012'),
  ('sli-61', 'OSB HYBRID OCKUME FACE 1220mm X 2440mm X 14mm', 'Strandply', 'OSB HYBRID', 'OCKUME FACE', 14, 1220, 2440, 2.9768, 0, '441012'),
  ('sli-62', 'SEMI S-OSB MDO 1220mm X 2440mm X 14mm', 'Strandply', 'SEMI S-OSB', 'MDO', 14, 1220, 2440, 2.9768, 0, '441012');

-- ─────────────────────────────────────────────────────────────
-- Settings (legacy dropdown masters, brand master, email recipients and templates). Same as api/src/seed/sales.ts.
-- ─────────────────────────────────────────────────────────────

INSERT INTO st_settings (key, value) VALUES
  ('sales.payment_terms', '["30 Days","15 Days","7 Days","Advance","Against Delivery","IMMEDIATE","Inter-Company"]'),
  ('sales.delivery_terms', '["EX WORKS","FOR","FOR Destination","To Pay"]'),
  ('sales.sales_persons', '[]'),
  ('sales.brands', '["Strandply"]'),
  ('sales.grades', '["S-OSB","OSB","OSB HYBRID","SEMI S-OSB","MDO","Hybrid Board","Plywood"]'),
  ('sales.firm_state_codes', '{"llp":"24","osb":"27"}'),
  ('sales.email_recipients', '{"proforma":["sales@strandply.com"],"order":["jimit@strandply.com","sanjay@strandply.com"],"invoice":["accounts@strandply.com"]}'),
  ('sales.email_templates', '{}');   -- {} = the built-in templates (DEFAULT_EMAIL_TEMPLATES); saving in Settings stores them

-- ─────────────────────────────────────────────────────────────
-- Role permissions: append the Sales keys (keeps custom changes).
-- Same result as DEFAULT_ROLE_PERMISSIONS in api/src/domain/access.ts (a test checks 0004 + 0005 … 0010).
-- ─────────────────────────────────────────────────────────────

UPDATE st_role_permissions
SET permissions = json_insert(permissions,
      '$.pages[#]', 'sales_dashboard', '$.pages[#]', 'sales_masters', '$.pages[#]', 'sales_proforma', '$.pages[#]', 'sales_orders',
      '$.pages[#]', 'sales_invoices', '$.pages[#]', 'sales_dispatch', '$.pages[#]', 'sales_reports', '$.pages[#]', 'sales_settings',
      '$.actions[#]', 'sales_approve'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('superadmin', 'admin');

UPDATE st_role_permissions
SET permissions = json_insert(permissions, '$.pages[#]', 'sales_dashboard', '$.pages[#]', 'sales_reports'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('management');
