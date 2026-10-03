-- 0008_stock.sql
--
-- Stock module (legacy "Stock Management", SKU Master v8): the item (SKU group) master, opening stock,
-- stock issue / receipt slips (SIS = ISS/2026/001, SRS = MRS/2026/001), reclassification (STR/2026/001),
-- and the stock_* keys in the role permission matrix.
-- Behaviour lives in api/src/modules/stock (docs/stock-spec.md).
-- Conventions are listed at the top of 0001_users.sql. Nothing here has been run.
--
-- A SKU code is the group prefix plus a two-digit thickness (OC-611 + 12 = OC-61112), or just the
-- prefix for fixed codes. Balances are not stored: they are the sum of the legs of every live movement
-- (opening +, slip / reclass − from and + to). Quantities: REAL in the item's unit, up to 3 decimals.
-- Numbers come from st_counters 'ISS-2026', 'MRS-2026', 'STR-2026' (calendar year of the document date).

CREATE TABLE sk_groups (
  id          TEXT PRIMARY KEY,
  prefix      TEXT NOT NULL COLLATE NOCASE,
  label       TEXT NOT NULL,
  family      TEXT NOT NULL CHECK (family IN ('OB', 'OC', 'SO', 'SC', 'MD', 'HY', 'RC', 'RM')),
  dept        TEXT NOT NULL,
  size        TEXT,
  grade       TEXT,
  unit        TEXT NOT NULL DEFAULT 'pcs',
  thicknesses TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(thicknesses)),   -- ["09","12"]; [] = fixed code
  sort_order  INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);
CREATE UNIQUE INDEX sk_groups_prefix_uq ON sk_groups (prefix) WHERE deleted_at IS NULL;

CREATE TABLE sk_opening (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  group_id   TEXT NOT NULL REFERENCES sk_groups(id),
  thick      TEXT,
  sku        TEXT NOT NULL,
  qty        REAL NOT NULL CHECK (qty > 0),
  note       TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);
CREATE INDEX sk_opening_sku_idx ON sk_opening (sku) WHERE deleted_at IS NULL;

CREATE TABLE sk_slips (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('SIS', 'SRS')),
  slip_no       TEXT NOT NULL,
  date          TEXT NOT NULL,
  from_group_id TEXT NOT NULL REFERENCES sk_groups(id),
  from_thick    TEXT,
  from_sku      TEXT NOT NULL,
  to_group_id   TEXT NOT NULL REFERENCES sk_groups(id),
  to_thick      TEXT,
  to_sku        TEXT NOT NULL,
  qty           REAL NOT NULL CHECK (qty > 0),
  batch         TEXT NOT NULL,
  ref_no        TEXT,                                  -- against PR / SO
  shift         TEXT CHECK (shift IN ('Day', 'Night', 'General')),
  remarks       TEXT,
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at    TEXT,
  CHECK (from_sku <> to_sku)
);
CREATE UNIQUE INDEX sk_slips_no_uq ON sk_slips (slip_no);
CREATE INDEX sk_slips_date_idx ON sk_slips (date) WHERE deleted_at IS NULL;
CREATE INDEX sk_slips_from_idx ON sk_slips (from_sku) WHERE deleted_at IS NULL;
CREATE INDEX sk_slips_to_idx ON sk_slips (to_sku) WHERE deleted_at IS NULL;

CREATE TABLE sk_reclass (
  id            TEXT PRIMARY KEY,
  str_no        TEXT NOT NULL,
  date          TEXT NOT NULL,
  scenario      TEXT NOT NULL,
  from_group_id TEXT NOT NULL REFERENCES sk_groups(id),
  from_thick    TEXT,
  from_sku      TEXT NOT NULL,
  to_group_id   TEXT NOT NULL REFERENCES sk_groups(id),
  to_thick      TEXT,
  to_sku        TEXT NOT NULL,
  qty           REAL NOT NULL CHECK (qty > 0),
  reason        TEXT NOT NULL,
  ref           TEXT,                                  -- STJ / Miracle reference
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at    TEXT,
  CHECK (from_sku <> to_sku)
);
CREATE UNIQUE INDEX sk_reclass_no_uq ON sk_reclass (str_no);
CREATE INDEX sk_reclass_date_idx ON sk_reclass (date) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- Seed: the item master (SKU Master v8, 103 groups). Generated from api/src/seed/stock.ts.
-- ─────────────────────────────────────────────────────────────

INSERT INTO sk_groups (id, prefix, label, family, dept, size, grade, unit, thicknesses, sort_order) VALUES
  ('skug-rm-01000', 'RM-01000', 'Nilgiri (Eucalyptus) Wood', 'RM', 'Raw Material Store', NULL, NULL, 'kg', '[]', 1),
  ('skug-rm-02000', 'RM-02000', 'Nilgiri Jalav Wood', 'RM', 'Raw Material Store', NULL, NULL, 'kg', '[]', 2),
  ('skug-rm-03000', 'RM-03000', 'Melia Dubia Wood', 'RM', 'Raw Material Store', NULL, NULL, 'kg', '[]', 3),
  ('skug-rm-04000', 'RM-04000', 'Fire Wood', 'RM', 'Raw Material Store', NULL, NULL, 'kg', '[]', 4),
  ('skug-rm-05000', 'RM-05000', 'Melamine Resin', 'RM', 'Raw Material Store', NULL, NULL, 'kg', '[]', 5),
  ('skug-rm-06000', 'RM-06000', 'Kraft Paper (MDO Overlay)', 'RM', 'Raw Material Store', NULL, NULL, 'sh', '[]', 6),
  ('skug-rm-07000', 'RM-07000', 'Face Veneer Sheet', 'RM', 'Raw Material Store', NULL, NULL, 'sh', '[]', 7),
  ('skug-rm-08000', 'RM-08000', 'Core Veneer Sheet', 'RM', 'Raw Material Store', NULL, NULL, 'sh', '[]', 8),
  ('skug-rm-09000', 'RM-09000', 'Coil Nail', 'RM', 'Raw Material Store', NULL, NULL, 'pcs', '[]', 9),
  ('skug-rm-10000', 'RM-10000', 'Strapping', 'RM', 'Raw Material Store', NULL, NULL, 'roll', '[]', 10),
  ('skug-rm-11000', 'RM-11000', 'Wax', 'RM', 'Raw Material Store', NULL, NULL, 'kg', '[]', 11),
  ('skug-rm-12000', 'RM-12000', 'SPCP (Chemical)', 'RM', 'Raw Material Store', NULL, NULL, 'kg', '[]', 12),
  ('skug-rm-13000', 'RM-13000', 'AC2 (Chemical)', 'RM', 'Raw Material Store', NULL, NULL, 'kg', '[]', 13),
  ('skug-ob-10x00', 'OB-10X00', 'Wood in WIP Hot Press (Consumable)', 'OB', 'WIP Consumables – Hot Press', NULL, NULL, 'kg', '[]', 14),
  ('skug-ob-10x01', 'OB-10X01', 'Melamine Resin in WIP Hot Press (Consumable)', 'OB', 'WIP Consumables – Hot Press', NULL, NULL, 'kg', '[]', 15),
  ('skug-ob-10x02', 'OB-10X02', 'Wax in WIP Hot Press (Consumable)', 'OB', 'WIP Consumables – Hot Press', NULL, NULL, 'kg', '[]', 16),
  ('skug-md-c0200', 'MD-C0200', 'Kraft Paper in WIP-MDO Press (Consumable)', 'MD', 'WIP Consumables – MDO Press', NULL, NULL, 'sh', '[]', 17),
  ('skug-ob-101', 'OB-101', 'OSB – WIP Inside Hot Press', 'OB', 'Hot Press Dept (WIP)', '2590×1320', NULL, 'pcs', '["08","09","10","12","14","16","17","18","20","23","25"]', 18),
  ('skug-so-101', 'SO-101', 'S-OSB – WIP Inside Hot Press', 'SO', 'Hot Press Dept (WIP)', '2590×1320', NULL, 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 19),
  ('skug-ob-201', 'OB-201', 'OSB Plain (Non-Calibrated)', 'OB', 'Stock (PLAIN)', '2590×1320', NULL, 'pcs', '["08","09","10","12","14","16","17","18","20","23","25"]', 20),
  ('skug-so-201', 'SO-201', 'S-OSB Plain (Non-Calibrated)', 'SO', 'Stock (PLAIN)', '2590×1320', NULL, 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 21),
  ('skug-ob-p01', 'OB-P01', 'OSB Plain Ungraded – 2590×1320', 'OB', 'Stock (PLAIN-UNG)', '2590×1320', NULL, 'pcs', '["08","09","10","12","14","16","17","18","20","23","25"]', 22),
  ('skug-ob-p02', 'OB-P02', 'OSB Plain Ungraded – 1220×2440', 'OB', 'Stock (PLAIN-UNG)', '1220×2440', NULL, 'pcs', '["08","09","10","12","14","16","17","18","20","23","25"]', 23),
  ('skug-ob-301', 'OB-301', 'OSB – WIP Calibration Dept', 'OB', 'Calibration Dept (WIP)', '2590×1320', NULL, 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 24),
  ('skug-so-301', 'SO-301', 'S-OSB – WIP Calibration Dept', 'SO', 'Calibration Dept (WIP)', '2590×1320', NULL, 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 25),
  ('skug-oc-401', 'OC-401', 'OSB Calibrated Board', 'OC', 'Stock (CALIB)', '2590×1320', NULL, 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 26),
  ('skug-sc-401', 'SC-401', 'S-OSB Calibrated Board', 'SC', 'Stock (CALIB)', '2590×1320', NULL, 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 27),
  ('skug-ob-501', 'OB-501', 'OSB Plain – WIP Grading Dept', 'OB', 'Grading Dept (WIP)', '2590×1320', NULL, 'pcs', '["08","09","10","12","14","16","17","18","20","23","25"]', 28),
  ('skug-oc-501', 'OC-501', 'OSB-CAL – WIP Grading Dept', 'OC', 'Grading Dept (WIP)', '2590×1320', NULL, 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 29),
  ('skug-sc-501', 'SC-501', 'S-OSB-CAL – WIP Grading Dept', 'SC', 'Grading Dept (WIP)', '2590×1320', NULL, 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 30),
  ('skug-oc-611', 'OC-611', 'OSB-CAL Graded A – 2590×1320', 'OC', 'Stock (GRA)', '2590×1320', 'A', 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 31),
  ('skug-oc-621', 'OC-621', 'OSB-CAL Graded B – 2590×1320', 'OC', 'Stock (GRA)', '2590×1320', 'B', 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 32),
  ('skug-oc-631', 'OC-631', 'OSB-CAL Graded C – 2590×1320', 'OC', 'Stock (GRA)', '2590×1320', 'C', 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 33),
  ('skug-oc-612', 'OC-612', 'OSB-CAL Graded A – 1220×2440', 'OC', 'Stock (GRA)', '1220×2440', 'A', 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 34),
  ('skug-oc-622', 'OC-622', 'OSB-CAL Graded B – 1220×2440', 'OC', 'Stock (GRA)', '1220×2440', 'B', 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 35),
  ('skug-sc-611', 'SC-611', 'S-OSB-CAL Graded A – 2590×1320', 'SC', 'Stock (GRA)', '2590×1320', 'A', 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 36),
  ('skug-sc-621', 'SC-621', 'S-OSB-CAL Graded B – 2590×1320', 'SC', 'Stock (GRA)', '2590×1320', 'B', 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 37),
  ('skug-sc-612', 'SC-612', 'S-OSB-CAL Graded A – 1220×2440', 'SC', 'Stock (GRA)', '1220×2440', 'A', 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 38),
  ('skug-sc-622', 'SC-622', 'S-OSB-CAL Graded B – 1220×2440', 'SC', 'Stock (GRA)', '1220×2440', 'B', 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 39),
  ('skug-ob-n11', 'OB-N11', 'OSB Plain FG Grade A – 2590×1320', 'OB', 'Stock (PLAIN-FG)', '2590×1320', 'A', 'pcs', '["08","09","10","12","14","16","17","18","20","23","25"]', 40),
  ('skug-ob-n21', 'OB-N21', 'OSB Plain FG Grade B – 2590×1320', 'OB', 'Stock (PLAIN-FG)', '2590×1320', 'B', 'pcs', '["08","09","10","12","14","16","17","18","20","23","25"]', 41),
  ('skug-ob-n12', 'OB-N12', 'OSB Plain FG Grade A – 1220×2440', 'OB', 'Stock (PLAIN-FG)', '1220×2440', 'A', 'pcs', '["08","09","10","12","14","16","17","18","20","23","25"]', 42),
  ('skug-ob-n22', 'OB-N22', 'OSB Plain FG Grade B – 1220×2440', 'OB', 'Stock (PLAIN-FG)', '1220×2440', 'B', 'pcs', '["08","09","10","12","14","16","17","18","20","23","25"]', 43),
  ('skug-md-802', 'MD-802', 'MDO Board – WIP MDO Press', 'MD', 'MDO Press Dept (WIP)', '1220×2440', NULL, 'pcs', '["09","10","12","14","16","17","18","23","25"]', 44),
  ('skug-md-902', 'MD-902', 'MDO Board – Ungraded (Post Press)', 'MD', 'Stock (MDO)', '1220×2440', NULL, 'pcs', '["09","10","12","14","16","17","18","23","25"]', 45),
  ('skug-md-a02', 'MD-A02', 'MDO Board – WIP MDO Grading Dept', 'MD', 'MDO Grading Dept (WIP)', '1220×2440', NULL, 'pcs', '["09","10","12","14","16","17","18","23","25"]', 46),
  ('skug-md-b11', 'MD-B11', 'MDO Graded A – 2590×1320', 'MD', 'Stock (MDO-GRA)', '2590×1320', 'A', 'pcs', '["09","10","12","14","16","17","18","23","25"]', 47),
  ('skug-md-b21', 'MD-B21', 'MDO Graded B – 2590×1320', 'MD', 'Stock (MDO-GRA)', '2590×1320', 'B', 'pcs', '["09","10","12","14","16","17","18","23","25"]', 48),
  ('skug-md-b12', 'MD-B12', 'MDO Graded A – 1220×2440', 'MD', 'Stock (MDO-GRA)', '1220×2440', 'A', 'pcs', '["09","10","12","14","16","17","18","23","25"]', 49),
  ('skug-md-b22', 'MD-B22', 'MDO Graded B – 1220×2440', 'MD', 'Stock (MDO-GRA)', '1220×2440', 'B', 'pcs', '["09","10","12","14","16","17","18","23","25"]', 50),
  ('skug-rc-c02', 'RC-C02', 'RCOSB – WIP Resin Coating', 'RC', 'RC Coating Dept (WIP)', '1220×2440', NULL, 'pcs', '["09","10","12","14","16","17","18","23","25"]', 51),
  ('skug-rc-d11', 'RC-D11', 'RCOSB Graded A – 2590×1320', 'RC', 'Stock (RCOSB)', '2590×1320', 'A', 'pcs', '["09","10","12","14","16","17","18","23","25"]', 52),
  ('skug-rc-d21', 'RC-D21', 'RCOSB Graded B – 2590×1320', 'RC', 'Stock (RCOSB)', '2590×1320', 'B', 'pcs', '["09","10","12","14","16","17","18","23","25"]', 53),
  ('skug-rc-d12', 'RC-D12', 'RCOSB Graded A – 1220×2440', 'RC', 'Stock (RCOSB)', '1220×2440', 'A', 'pcs', '["09","10","12","14","16","17","18","23","25"]', 54),
  ('skug-rc-d22', 'RC-D22', 'RCOSB Graded B – 1220×2440', 'RC', 'Stock (RCOSB)', '1220×2440', 'B', 'pcs', '["09","10","12","14","16","17","18","23","25"]', 55),
  ('skug-hy-e01', 'HY-E01', 'HYB – WIP Hybrid Press 2590×1320', 'HY', 'Hybrid Press Dept (WIP)', '2590×1320', NULL, 'pcs', '["09","11","12","14","15","16","17","18","23"]', 56),
  ('skug-hy-e02', 'HY-E02', 'HYB – WIP Hybrid Press 1220×2440', 'HY', 'Hybrid Press Dept (WIP)', '1220×2440', NULL, 'pcs', '["09","11","12","14","15","16","17","18","23"]', 57),
  ('skug-hy-f01', 'HY-F01', 'HYB Ungraded – 2590×1320', 'HY', 'Stock (HYB)', '2590×1320', NULL, 'pcs', '["09","11","12","14","15","16","17","18","23"]', 58),
  ('skug-hy-f02', 'HY-F02', 'HYB Ungraded – 1220×2440', 'HY', 'Stock (HYB)', '1220×2440', NULL, 'pcs', '["09","11","12","14","15","16","17","18","23"]', 59),
  ('skug-hy-g01', 'HY-G01', 'HYB – WIP Grading Dept 2590×1320', 'HY', 'Grading Dept (WIP)', '2590×1320', NULL, 'pcs', '["09","11","12","14","15","16","17","18","23"]', 60),
  ('skug-hy-g02', 'HY-G02', 'HYB – WIP Grading Dept 1220×2440', 'HY', 'Grading Dept (WIP)', '1220×2440', NULL, 'pcs', '["09","11","12","14","15","16","17","18","23"]', 61),
  ('skug-hy-h12', 'HY-H12', 'HYB Graded A – 1220×2440', 'HY', 'Stock (HYB-GRA)', '1220×2440', 'A', 'pcs', '["09","11","12","14","15","16","17","18","23"]', 62),
  ('skug-hy-h22', 'HY-H22', 'HYB Graded B – 1220×2440', 'HY', 'Stock (HYB-GRA)', '1220×2440', 'B', 'pcs', '["09","11","12","14","15","16","17","18","23"]', 63),
  ('skug-ob-i01', 'OB-I01', 'OSB – WIP Cutting Dept', 'OB', 'Cutting Dept (WIP)', '2590×1320', NULL, 'pcs', '["08","09","10","12","14","16","17","18","20","23","25"]', 64),
  ('skug-so-i01', 'SO-I01', 'S-OSB – WIP Cutting Dept', 'SO', 'Cutting Dept (WIP)', '2590×1320', NULL, 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 65),
  ('skug-oc-i01', 'OC-I01', 'OSB-CAL – WIP Cutting Dept', 'OC', 'Cutting Dept (WIP)', '2590×1320', NULL, 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 66),
  ('skug-sc-i01', 'SC-I01', 'S-OSB-CAL – WIP Cutting Dept', 'SC', 'Cutting Dept (WIP)', '2590×1320', NULL, 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 67),
  ('skug-hy-i01', 'HY-I01', 'HYB – WIP Cutting Dept', 'HY', 'Cutting Dept (WIP)', '2590×1320', NULL, 'pcs', '["09","11","12","14","15","16","17","18","23"]', 68),
  ('skug-rc-i01', 'RC-I01', 'RCOSB – WIP Cutting Dept', 'RC', 'Cutting Dept (WIP)', '2590×1320', NULL, 'pcs', '["09","10","12","14","16","17","18","23","25"]', 69),
  ('skug-oc-j12', 'OC-J12', 'OSB-CAL Cut A – 1220×2440', 'OC', 'Stock (CUT)', '1220×2440', 'A', 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 70),
  ('skug-oc-j22', 'OC-J22', 'OSB-CAL Cut B – 1220×2440', 'OC', 'Stock (CUT)', '1220×2440', 'B', 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 71),
  ('skug-sc-j12', 'SC-J12', 'S-OSB-CAL Cut A – 1220×2440', 'SC', 'Stock (CUT)', '1220×2440', 'A', 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 72),
  ('skug-sc-j22', 'SC-J22', 'S-OSB-CAL Cut B – 1220×2440', 'SC', 'Stock (CUT)', '1220×2440', 'B', 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 73),
  ('skug-hy-j12', 'HY-J12', 'HYB Cut A – 1220×2440', 'HY', 'Stock (CUT)', '1220×2440', 'A', 'pcs', '["09","11","12","14","15","16","17","18","23"]', 74),
  ('skug-hy-j22', 'HY-J22', 'HYB Cut B – 1220×2440', 'HY', 'Stock (CUT)', '1220×2440', 'B', 'pcs', '["09","11","12","14","15","16","17","18","23"]', 75),
  ('skug-oc-l02', 'OC-L02', 'OSB-CAL – WIP Finishing Dept', 'OC', 'Finishing Dept (WIP)', '1220×2440', NULL, 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 76),
  ('skug-md-l02', 'MD-L02', 'MDO – WIP Finishing Dept', 'MD', 'Finishing Dept (WIP)', '1220×2440', NULL, 'pcs', '["09","10","12","14","16","17","18","23","25"]', 77),
  ('skug-hy-l02', 'HY-L02', 'HYB – WIP Finishing Dept', 'HY', 'Finishing Dept (WIP)', '1220×2440', NULL, 'pcs', '["09","11","12","14","15","16","17","18","23"]', 78),
  ('skug-sc-l02', 'SC-L02', 'S-OSB-CAL – WIP Finishing Dept', 'SC', 'Finishing Dept (WIP)', '1220×2440', NULL, 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 79),
  ('skug-oc-m11', 'OC-M11', 'OSB-CAL FG A – 2590×1320', 'OC', 'Stock (FG)', '2590×1320', 'A', 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 80),
  ('skug-oc-m21', 'OC-M21', 'OSB-CAL FG B – 2590×1320', 'OC', 'Stock (FG)', '2590×1320', 'B', 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 81),
  ('skug-oc-m12', 'OC-M12', 'OSB-CAL FG A – 1220×2440', 'OC', 'Stock (FG)', '1220×2440', 'A', 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 82),
  ('skug-oc-m22', 'OC-M22', 'OSB-CAL FG B – 1220×2440', 'OC', 'Stock (FG)', '1220×2440', 'B', 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 83),
  ('skug-sc-m11', 'SC-M11', 'S-OSB-CAL FG A – 2590×1320', 'SC', 'Stock (FG)', '2590×1320', 'A', 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 84),
  ('skug-sc-m21', 'SC-M21', 'S-OSB-CAL FG B – 2590×1320', 'SC', 'Stock (FG)', '2590×1320', 'B', 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 85),
  ('skug-sc-m12', 'SC-M12', 'S-OSB-CAL FG A – 1220×2440', 'SC', 'Stock (FG)', '1220×2440', 'A', 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 86),
  ('skug-sc-m22', 'SC-M22', 'S-OSB-CAL FG B – 1220×2440', 'SC', 'Stock (FG)', '1220×2440', 'B', 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 87),
  ('skug-md-m12', 'MD-M12', 'MDO FG A – 1220×2440', 'MD', 'Stock (FG)', '1220×2440', 'A', 'pcs', '["09","10","12","14","16","17","18","23","25"]', 88),
  ('skug-md-m22', 'MD-M22', 'MDO FG B – 1220×2440', 'MD', 'Stock (FG)', '1220×2440', 'B', 'pcs', '["09","10","12","14","16","17","18","23","25"]', 89),
  ('skug-hy-m12', 'HY-M12', 'HYB FG A – 1220×2440', 'HY', 'Stock (FG)', '1220×2440', 'A', 'pcs', '["09","11","12","14","15","16","17","18","23"]', 90),
  ('skug-hy-m22', 'HY-M22', 'HYB FG B – 1220×2440', 'HY', 'Stock (FG)', '1220×2440', 'B', 'pcs', '["09","11","12","14","15","16","17","18","23"]', 91),
  ('skug-ob-771', 'OB-771', 'OSB Plain Rejected – 2590×1320', 'OB', 'Stock (REJ)', '2590×1320', 'REJ', 'pcs', '["08","09","10","12","14","16","17","18","20","23","25"]', 92),
  ('skug-ob-772', 'OB-772', 'OSB Plain Rejected – 1220×2440', 'OB', 'Stock (REJ)', '1220×2440', 'REJ', 'pcs', '["08","09","10","12","14","16","17","18","20","23","25"]', 93),
  ('skug-oc-771', 'OC-771', 'OSB-CAL Rejected – 2590×1320', 'OC', 'Stock (REJ)', '2590×1320', 'REJ', 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 94),
  ('skug-oc-772', 'OC-772', 'OSB-CAL Rejected – 1220×2440', 'OC', 'Stock (REJ)', '1220×2440', 'REJ', 'pcs', '["06","08","09","10","12","14","16","17","18","20","23","25"]', 95),
  ('skug-sc-771', 'SC-771', 'S-OSB-CAL Rejected – 2590×1320', 'SC', 'Stock (REJ)', '2590×1320', 'REJ', 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 96),
  ('skug-sc-772', 'SC-772', 'S-OSB-CAL Rejected – 1220×2440', 'SC', 'Stock (REJ)', '1220×2440', 'REJ', 'pcs', '["09","10","12","14","15","16","17","18","20","23","25"]', 97),
  ('skug-md-771', 'MD-771', 'MDO Rejected – 2590×1320', 'MD', 'Stock (REJ)', '2590×1320', 'REJ', 'pcs', '["09","10","12","14","16","17","18","23","25"]', 98),
  ('skug-md-772', 'MD-772', 'MDO Rejected – 1220×2440', 'MD', 'Stock (REJ)', '1220×2440', 'REJ', 'pcs', '["09","10","12","14","16","17","18","23","25"]', 99),
  ('skug-hy-771', 'HY-771', 'HYB Rejected – 2590×1320', 'HY', 'Stock (REJ)', '2590×1320', 'REJ', 'pcs', '["09","11","12","14","15","16","17","18","23"]', 100),
  ('skug-hy-772', 'HY-772', 'HYB Rejected – 1220×2440', 'HY', 'Stock (REJ)', '1220×2440', 'REJ', 'pcs', '["09","11","12","14","15","16","17","18","23"]', 101),
  ('skug-ob-k0x00', 'OB-K0X00', 'OSB / S-OSB Scrap Offcuts', 'OB', 'Scrap Yard', NULL, NULL, 'pcs', '[]', 102),
  ('skug-md-k0x00', 'MD-K0X00', 'MDO Scrap Offcuts', 'MD', 'Scrap Yard', NULL, NULL, 'pcs', '[]', 103);

-- ─────────────────────────────────────────────────────────────
-- Role permissions: append the Stock keys (keeps custom changes).
-- Same result as DEFAULT_ROLE_PERMISSIONS in api/src/domain/access.ts (a test checks 0004 + 0005 … 0008).
-- ─────────────────────────────────────────────────────────────

UPDATE st_role_permissions
SET permissions = json_insert(permissions,
      '$.pages[#]', 'stock_dashboard', '$.pages[#]', 'stock_slips', '$.pages[#]', 'stock_ledger',
      '$.pages[#]', 'stock_reclass', '$.pages[#]', 'stock_masters'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('superadmin', 'admin');

UPDATE st_role_permissions
SET permissions = json_insert(permissions, '$.pages[#]', 'stock_dashboard', '$.pages[#]', 'stock_ledger'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('management');
