-- 0009_production.sql
--
-- Production module (legacy "Production MIS" and the stand-alone "Matt Weight System"): production plans,
-- hot press, matt weight batches and punched weights, chipping (consumes Purchase Nilgiri lots) → WIP
-- Nilgiri batches, resin consumption (consumes Purchase resin lots), board cutting, production summaries,
-- MDO press; plus the production_* keys in the role permission matrix and the production settings.
-- Behaviour lives in api/src/modules/production (docs/production-spec.md).
-- Conventions are listed at the top of 0001_users.sql. Nothing here has been run.
--
-- Document numbers: PPR-0001, HP-0001, CHR-0001, RC-0001, BC-0001, PS-0001, MDO-0001, MWB-0001, WIP-0001
-- from st_counters 'PR-<prefix>'. Workflow documents: wf_state draft → review → reviewed → approved,
-- wf_trail = JSON array of {action, by, byName, note, at}. Money: INTEGER paise. Rates: paise per ton.
-- Calculated figures (hot press times, plan requirements, matt stats, WIP balances) are not stored:
-- see api/src/contracts/production.ts and modules/production/common.ts.

-- Columns shared by the workflow documents.
-- id, doc_no, date, wf_state, wf_trail, remarks, created_by, created_at, updated_at, deleted_at

CREATE TABLE pr_plans (
  id                TEXT PRIMARY KEY,
  doc_no            TEXT NOT NULL,
  date              TEXT NOT NULL,
  shift             TEXT NOT NULL CHECK (shift IN ('Day', 'Afternoon', 'Night')),
  plan_op           TEXT,
  matt_wt_kg        REAL,
  matts             INTEGER,
  resin_per_matt_kg REAL,
  wet_wood_avail_kg REAL,
  process           TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(process)),   -- boiler, dryer, blender … fields
  hotpress_id       TEXT,                                                    -- pr_hotpress.id
  matt_batch_id     TEXT,                                                    -- pr_matt_batches.id
  cutting_id        TEXT,                                                    -- pr_cutting.id
  wf_state          TEXT NOT NULL DEFAULT 'draft' CHECK (wf_state IN ('draft', 'review', 'reviewed', 'approved')),
  wf_trail          TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(wf_trail)),
  remarks           TEXT,
  created_by        TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at        TEXT
);
CREATE UNIQUE INDEX pr_plans_no_uq ON pr_plans (doc_no) WHERE deleted_at IS NULL;
CREATE INDEX pr_plans_date_idx ON pr_plans (date);

CREATE TABLE pr_plan_products (
  plan_id       TEXT NOT NULL REFERENCES pr_plans(id),
  line_no       INTEGER NOT NULL,
  product       TEXT NOT NULL CHECK (product IN ('OSB', 'S-OSB', 'Semi OSB')),
  size          TEXT NOT NULL,
  thickness     TEXT NOT NULL,
  priority      TEXT NOT NULL CHECK (priority IN ('High', 'Medium', 'Low')),
  target_boards INTEGER NOT NULL CHECK (target_boards > 0),
  PRIMARY KEY (plan_id, line_no)
);

CREATE TABLE pr_hotpress (
  id         TEXT PRIMARY KEY,
  doc_no     TEXT NOT NULL,
  date       TEXT NOT NULL,
  shift      TEXT NOT NULL CHECK (shift IN ('Day', 'Afternoon', 'Night')),
  product    TEXT NOT NULL CHECK (product IN ('OSB', 'S-OSB', 'Semi OSB')),
  size       TEXT NOT NULL,
  thickness  TEXT,
  operator   TEXT,
  wf_state   TEXT NOT NULL DEFAULT 'draft' CHECK (wf_state IN ('draft', 'review', 'reviewed', 'approved')),
  wf_trail   TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(wf_trail)),
  remarks    TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX pr_hotpress_no_uq ON pr_hotpress (doc_no) WHERE deleted_at IS NULL;
CREATE INDEX pr_hotpress_date_idx ON pr_hotpress (date);

CREATE TABLE pr_hotpress_charges (
  hotpress_id TEXT NOT NULL REFERENCES pr_hotpress(id),
  line_no     INTEGER NOT NULL,
  label       TEXT NOT NULL,
  pcs         INTEGER NOT NULL CHECK (pcs > 0),
  load_time   TEXT,                -- HH:MM
  unload_time TEXT,
  remarks     TEXT,
  PRIMARY KEY (hotpress_id, line_no)
);

CREATE TABLE pr_chipping (
  id         TEXT PRIMARY KEY,
  doc_no     TEXT NOT NULL,
  date       TEXT NOT NULL,
  shift      TEXT NOT NULL CHECK (shift IN ('Day', 'Afternoon', 'Night')),
  operator   TEXT,
  machine    TEXT,
  wf_state   TEXT NOT NULL DEFAULT 'draft' CHECK (wf_state IN ('draft', 'review', 'reviewed', 'approved')),
  wf_trail   TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(wf_trail)),
  remarks    TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX pr_chipping_no_uq ON pr_chipping (doc_no) WHERE deleted_at IS NULL;

CREATE TABLE pr_chipping_lots (
  chipping_id       TEXT NOT NULL REFERENCES pr_chipping(id),
  line_no           INTEGER NOT NULL,
  purchase_entry_id TEXT NOT NULL REFERENCES pu_entries(id),
  lot_no            TEXT NOT NULL,
  qty               REAL NOT NULL CHECK (qty > 0),         -- kg
  rate_paise        INTEGER NOT NULL,                       -- net rate per ton, fixed at save
  amount_paise      INTEGER NOT NULL,
  PRIMARY KEY (chipping_id, line_no)
);
CREATE INDEX pr_chipping_lots_entry_idx ON pr_chipping_lots (purchase_entry_id);

CREATE TABLE pr_resin (
  id                TEXT PRIMARY KEY,
  doc_no            TEXT NOT NULL,
  date              TEXT NOT NULL,
  shift             TEXT NOT NULL CHECK (shift IN ('Day', 'Afternoon', 'Night')),
  purchase_entry_id TEXT NOT NULL REFERENCES pu_entries(id),
  lot_no            TEXT NOT NULL,
  qty               REAL NOT NULL CHECK (qty > 0),
  rate_paise        INTEGER NOT NULL,
  amount_paise      INTEGER NOT NULL,
  product           TEXT CHECK (product IN ('OSB', 'S-OSB', 'Semi OSB')),
  operator          TEXT,
  wf_state          TEXT NOT NULL DEFAULT 'draft' CHECK (wf_state IN ('draft', 'review', 'reviewed', 'approved')),
  wf_trail          TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(wf_trail)),
  remarks           TEXT,
  created_by        TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at        TEXT
);
CREATE UNIQUE INDEX pr_resin_no_uq ON pr_resin (doc_no) WHERE deleted_at IS NULL;
CREATE INDEX pr_resin_entry_idx ON pr_resin (purchase_entry_id);

CREATE TABLE pr_cutting (
  id          TEXT PRIMARY KEY,
  doc_no      TEXT NOT NULL,
  date        TEXT NOT NULL,
  shift       TEXT NOT NULL CHECK (shift IN ('Day', 'Afternoon', 'Night')),
  hotpress_id TEXT NOT NULL REFERENCES pr_hotpress(id),
  operator    TEXT,
  cut_pcs     INTEGER NOT NULL CHECK (cut_pcs > 0),
  wf_state    TEXT NOT NULL DEFAULT 'draft' CHECK (wf_state IN ('draft', 'review', 'reviewed', 'approved')),
  wf_trail    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(wf_trail)),
  remarks     TEXT,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);
CREATE UNIQUE INDEX pr_cutting_no_uq ON pr_cutting (doc_no) WHERE deleted_at IS NULL;
-- One live board cutting report per hot press report.
CREATE UNIQUE INDEX pr_cutting_hotpress_uq ON pr_cutting (hotpress_id) WHERE deleted_at IS NULL;

CREATE TABLE pr_summaries (
  id            TEXT PRIMARY KEY,
  doc_no        TEXT NOT NULL,
  date          TEXT NOT NULL,
  product       TEXT NOT NULL CHECK (product IN ('OSB', 'S-OSB', 'Semi OSB')),
  size          TEXT NOT NULL,
  thickness     TEXT,
  batch         TEXT,
  hotpress_id   TEXT REFERENCES pr_hotpress(id),
  matt_batch_id TEXT,
  cutting_id    TEXT REFERENCES pr_cutting(id),
  plan_id       TEXT REFERENCES pr_plans(id),
  press_pcs     INTEGER NOT NULL DEFAULT 0,
  boards        INTEGER NOT NULL DEFAULT 0,
  board_rej     INTEGER NOT NULL DEFAULT 0,
  matt_pcs      INTEGER NOT NULL DEFAULT 0,
  matt_wt_kg    REAL NOT NULL DEFAULT 0,
  matt_rej      INTEGER NOT NULL DEFAULT 0,
  resin_kg      REAL NOT NULL DEFAULT 0,       -- from linked resin entries when there are any
  resin_paise   INTEGER NOT NULL DEFAULT 0,
  dry_wood_kg   REAL NOT NULL DEFAULT 0,
  wf_state      TEXT NOT NULL DEFAULT 'draft' CHECK (wf_state IN ('draft', 'review', 'reviewed', 'approved')),
  wf_trail      TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(wf_trail)),
  remarks       TEXT,
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at    TEXT
);
CREATE UNIQUE INDEX pr_summaries_no_uq ON pr_summaries (doc_no) WHERE deleted_at IS NULL;
CREATE INDEX pr_summaries_date_idx ON pr_summaries (date);

CREATE TABLE pr_summary_resin (
  summary_id TEXT NOT NULL REFERENCES pr_summaries(id),
  resin_id   TEXT NOT NULL REFERENCES pr_resin(id),
  PRIMARY KEY (summary_id, resin_id)
);

CREATE TABLE pr_summary_wip (
  summary_id TEXT NOT NULL REFERENCES pr_summaries(id),
  wip_id     TEXT NOT NULL,              -- pr_wip_batches.id
  qty        REAL NOT NULL CHECK (qty > 0),
  PRIMARY KEY (summary_id, wip_id)
);
CREATE INDEX pr_summary_wip_wip_idx ON pr_summary_wip (wip_id);

CREATE TABLE pr_mdo (
  id            TEXT PRIMARY KEY,
  doc_no        TEXT NOT NULL,
  date          TEXT NOT NULL,
  shift         TEXT NOT NULL CHECK (shift IN ('Day', 'Afternoon', 'Night')),
  operator      TEXT,
  press_start   TEXT,
  press_end     TEXT,
  paper_used    REAL,
  paper_wastage REAL,
  wf_state      TEXT NOT NULL DEFAULT 'draft' CHECK (wf_state IN ('draft', 'review', 'reviewed', 'approved')),
  wf_trail      TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(wf_trail)),
  remarks       TEXT,
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at    TEXT
);
CREATE UNIQUE INDEX pr_mdo_no_uq ON pr_mdo (doc_no) WHERE deleted_at IS NULL;

CREATE TABLE pr_mdo_items (
  mdo_id     TEXT NOT NULL REFERENCES pr_mdo(id),
  line_no    INTEGER NOT NULL,
  board_type TEXT NOT NULL,
  thickness  TEXT,
  paper      TEXT,
  type       TEXT CHECK (type IN ('BSL', 'OSL', 'Both')),
  finish     TEXT,
  pcs        INTEGER NOT NULL DEFAULT 0,
  cycle_time TEXT,
  PRIMARY KEY (mdo_id, line_no)
);

CREATE TABLE pr_matt_batches (
  id         TEXT PRIMARY KEY,
  doc_no     TEXT NOT NULL,
  date       TEXT NOT NULL,
  shift      TEXT NOT NULL CHECK (shift IN ('Day', 'Afternoon', 'Night')),
  product    TEXT NOT NULL CHECK (product IN ('OSB', 'S-OSB', 'Semi OSB')),
  size       TEXT NOT NULL,
  thickness  TEXT,
  operator   TEXT,
  setpoint   REAL NOT NULL CHECK (setpoint > 0),
  band       REAL NOT NULL CHECK (band > 0),
  target_qty INTEGER,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at  TEXT,
  remarks    TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX pr_matt_batches_no_uq ON pr_matt_batches (doc_no) WHERE deleted_at IS NULL;

CREATE TABLE pr_matt_weights (
  batch_id TEXT NOT NULL REFERENCES pr_matt_batches(id),
  n        INTEGER NOT NULL,           -- matt number in the batch; numbers are kept when one is deleted
  weight   REAL NOT NULL CHECK (weight > 0),
  at       TEXT NOT NULL,
  PRIMARY KEY (batch_id, n)
);

CREATE TABLE pr_wip_batches (
  id          TEXT PRIMARY KEY,
  doc_no      TEXT NOT NULL,
  chipping_id TEXT NOT NULL REFERENCES pr_chipping(id),
  date        TEXT NOT NULL,
  remarks     TEXT,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);
CREATE UNIQUE INDEX pr_wip_batches_no_uq ON pr_wip_batches (doc_no) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX pr_wip_batches_chipping_uq ON pr_wip_batches (chipping_id) WHERE deleted_at IS NULL;

CREATE TABLE pr_wip_adjustments (
  id         TEXT PRIMARY KEY,
  wip_id     TEXT NOT NULL REFERENCES pr_wip_batches(id),
  date       TEXT NOT NULL,
  qty        REAL NOT NULL CHECK (qty <> 0),   -- signed kg
  reason     TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);
CREATE INDEX pr_wip_adjustments_wip_idx ON pr_wip_adjustments (wip_id);

-- ─────────────────────────────────────────────────────────────
-- Settings (legacy Thickness / Size masters). Same as api/src/seed/production.ts.
-- ─────────────────────────────────────────────────────────────

INSERT INTO st_settings (key, value) VALUES
  ('production.thicknesses', '["6","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","27","28"]'),
  ('production.sizes', '["8x4","4x4","6x4"]'),
  ('production.boards_per_charge', '30'),
  ('production.wet_wood_factor', '2.5'),
  ('production.closed_fys', '[]');

-- ─────────────────────────────────────────────────────────────
-- Role permissions: append the Production keys (keeps custom changes).
-- Same result as DEFAULT_ROLE_PERMISSIONS in api/src/domain/access.ts (a test checks 0004 + 0005 … 0009).
-- ─────────────────────────────────────────────────────────────

UPDATE st_role_permissions
SET permissions = json_insert(permissions,
      '$.pages[#]', 'production_dashboard', '$.pages[#]', 'production_planning', '$.pages[#]', 'production_press',
      '$.pages[#]', 'production_matt', '$.pages[#]', 'production_materials', '$.pages[#]', 'production_settings',
      '$.actions[#]', 'production_review', '$.actions[#]', 'production_approve'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('superadmin', 'admin');

UPDATE st_role_permissions
SET permissions = json_insert(permissions, '$.pages[#]', 'production_dashboard'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('management');
