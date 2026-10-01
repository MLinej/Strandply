-- 0002_sampletrack.sql
--
-- SampleTrack (sample requests and dispatch). Every table is prefixed st_.
-- Behaviour is described in docs/sampletrack-spec.md.
-- Conventions are listed at the top of 0001_users.sql.

-- ─────────────────────────────────────────────────────────────
-- Geography masters
-- ─────────────────────────────────────────────────────────────

CREATE TABLE st_states (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL COLLATE NOCASE,
  gst_code   TEXT,                           -- first 2 digits of a GSTIN
  kind       TEXT NOT NULL CHECK (kind IN ('State', 'UT')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX st_states_name_uq ON st_states (name) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX st_states_gst_code_uq ON st_states (gst_code) WHERE deleted_at IS NULL;

CREATE TABLE st_city_master (
  id         TEXT PRIMARY KEY,
  city       TEXT NOT NULL COLLATE NOCASE,
  state_id   TEXT NOT NULL REFERENCES st_states(id),
  is_custom  INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0, 1)),  -- 0 = shipped seed, 1 = added by a user
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);
-- Unique per state: the same city name can exist in two states.
CREATE UNIQUE INDEX st_city_master_city_state_uq ON st_city_master (city, state_id) WHERE deleted_at IS NULL;
CREATE INDEX st_city_master_state_idx ON st_city_master (state_id);

-- ─────────────────────────────────────────────────────────────
-- Parties (customers and leads)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE st_parties (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL COLLATE NOCASE,
  contact          TEXT,
  mobile           TEXT,
  email            TEXT,
  gst              TEXT,
  address          TEXT,
  -- city/state/pin form the postal address that is printed on labels and slips.
  -- They are free text on purpose: the city master is only where the form's
  -- picker gets its options, and a party may have a city that isn't in it.
  city             TEXT,
  state            TEXT,
  pin              TEXT,
  industry         TEXT,                     -- Furniture | Construction | Interior Design | Contractor | Trader / Dealer | Architect | Manufacturer | Other
  type             TEXT NOT NULL DEFAULT 'Existing Customer' CHECK (type IN ('Existing Customer', 'New Lead')),
  assigned_user_id TEXT REFERENCES users(id),
  remarks          TEXT,
  created_by       TEXT REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at       TEXT
);
-- Names are not unique: the old app warned about a duplicate and let the user continue.
CREATE INDEX st_parties_name_idx     ON st_parties (name);
CREATE INDEX st_parties_mobile_idx   ON st_parties (mobile);
CREATE INDEX st_parties_gst_idx      ON st_parties (gst);
CREATE INDEX st_parties_city_idx     ON st_parties (city);
CREATE INDEX st_parties_type_idx     ON st_parties (type);
CREATE INDEX st_parties_assigned_idx ON st_parties (assigned_user_id);

-- ─────────────────────────────────────────────────────────────
-- Couriers / transporters
-- ─────────────────────────────────────────────────────────────

CREATE TABLE st_couriers (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL COLLATE NOCASE,
  type                  TEXT NOT NULL CHECK (type IN ('Courier', 'Transport', 'Bus')),
  contact               TEXT,
  mobile                TEXT,
  email                 TEXT,
  coverage              TEXT,
  tracking_url_template TEXT,                -- '{tracking}' is replaced with the tracking no.
  rating                INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  status                TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  remarks               TEXT,
  created_by            TEXT REFERENCES users(id),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at            TEXT
);
CREATE INDEX st_couriers_name_idx        ON st_couriers (name);
CREATE INDEX st_couriers_type_status_idx ON st_couriers (type, status);

-- ─────────────────────────────────────────────────────────────
-- Product master
-- ─────────────────────────────────────────────────────────────

CREATE TABLE st_products (
  id                TEXT PRIMARY KEY,
  code              TEXT NOT NULL COLLATE NOCASE,
  name              TEXT NOT NULL COLLATE NOCASE,
  board_type        TEXT NOT NULL CHECK (board_type IN ('OSB', 'S-OSB', 'Hybrid', 'MDO', 'Core Veneer', 'Face Veneer')),
  thickness_mm      REAL CHECK (thickness_mm IS NULL OR thickness_mm > 0),
  size              TEXT,                    -- e.g. '8x4 ft'
  category          TEXT,                    -- e.g. Standard | Premium
  unit_price_paise  INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_paise >= 0),
  stock_status      TEXT NOT NULL DEFAULT 'Available' CHECK (stock_status IN ('Available', 'Limited', 'Out of Stock')),
  description       TEXT,
  created_by        TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at        TEXT
);
-- Code is unique among live rows. A soft-deleted product's code can be used again.
CREATE UNIQUE INDEX st_products_code_uq ON st_products (code) WHERE deleted_at IS NULL;
CREATE INDEX st_products_name_idx  ON st_products (name);
CREATE INDEX st_products_board_idx ON st_products (board_type);

-- ─────────────────────────────────────────────────────────────
-- Sample requests
-- ─────────────────────────────────────────────────────────────

CREATE TABLE st_requests (
  id                     TEXT PRIMARY KEY,
  req_no                 TEXT NOT NULL,      -- REQ-0001, from st_counters 'REQ'. Never reused.
  date                   TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  party_id               TEXT NOT NULL REFERENCES st_parties(id),
  purpose                TEXT,
  priority               TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Normal', 'Medium', 'High', 'Urgent')),
  required_dispatch_date TEXT CHECK (required_dispatch_date IS NULL OR required_dispatch_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  requested_by_user_id   TEXT REFERENCES users(id),
  remarks                TEXT,
  status                 TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Dispatched', 'Delivered')),
  created_by             TEXT REFERENCES users(id),
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at             TEXT
);
-- Not partial: a request number stays taken after a soft delete.
CREATE UNIQUE INDEX st_requests_req_no_uq ON st_requests (req_no);
CREATE INDEX st_requests_party_idx        ON st_requests (party_id);
CREATE INDEX st_requests_status_idx       ON st_requests (status);
CREATE INDEX st_requests_date_idx         ON st_requests (date);
CREATE INDEX st_requests_requested_by_idx ON st_requests (requested_by_user_id);

CREATE TABLE st_request_items (
  id           TEXT PRIMARY KEY,
  request_id   TEXT NOT NULL REFERENCES st_requests(id) ON DELETE CASCADE,
  line_no      INTEGER NOT NULL CHECK (line_no >= 1),
  product_id   TEXT REFERENCES st_products(id),   -- NULL = free-text product not in the master
  product_name TEXT NOT NULL,                     -- the name as it was when the request was saved
  board        TEXT,
  thickness    TEXT,                              -- free text as entered, e.g. '18mm'
  size         TEXT,
  qty_value    REAL CHECK (qty_value IS NULL OR qty_value >= 0),
  qty_unit     TEXT,                              -- e.g. 'sheets'
  qty_raw      TEXT,                              -- exactly what was typed, e.g. '5 sheets'
  created_by   TEXT REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at   TEXT
);
CREATE UNIQUE INDEX st_request_items_line_uq ON st_request_items (request_id, line_no) WHERE deleted_at IS NULL;
CREATE INDEX st_request_items_product_idx    ON st_request_items (product_id);
CREATE INDEX st_request_items_name_idx       ON st_request_items (product_name);

-- ─────────────────────────────────────────────────────────────
-- Dispatches
-- ─────────────────────────────────────────────────────────────

CREATE TABLE st_dispatches (
  id                     TEXT PRIMARY KEY,
  dsp_no                 TEXT NOT NULL,      -- DSP-0001, from st_counters 'DSP'. Never reused.
  date                   TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  party_id               TEXT NOT NULL REFERENCES st_parties(id),
  mode                   TEXT NOT NULL CHECK (mode IN ('Courier', 'Transport', 'Bus', 'Hand Delivery')),
  courier_id             TEXT REFERENCES st_couriers(id),
  courier_name_manual    TEXT,               -- used when the carrier is not in st_couriers
  tracking_no            TEXT,
  vehicle_no             TEXT,
  driver_details         TEXT,
  expected_delivery_date TEXT CHECK (expected_delivery_date IS NULL OR expected_delivery_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  freight_paise          INTEGER NOT NULL DEFAULT 0 CHECK (freight_paise >= 0),
  weight_kg              REAL CHECK (weight_kg IS NULL OR weight_kg >= 0),
  dimensions             TEXT,
  product_description    TEXT,
  linked_request_id      TEXT REFERENCES st_requests(id),
  remarks                TEXT,
  status                 TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Packed', 'Dispatched', 'In Transit', 'Delivered', 'Delayed', 'Returned')),
  created_by             TEXT REFERENCES users(id),
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at             TEXT
);
CREATE UNIQUE INDEX st_dispatches_dsp_no_uq ON st_dispatches (dsp_no);
CREATE INDEX st_dispatches_party_idx    ON st_dispatches (party_id);
CREATE INDEX st_dispatches_status_idx   ON st_dispatches (status);
CREATE INDEX st_dispatches_date_idx     ON st_dispatches (date);
CREATE INDEX st_dispatches_mode_idx     ON st_dispatches (mode);
CREATE INDEX st_dispatches_courier_idx  ON st_dispatches (courier_id);
CREATE INDEX st_dispatches_tracking_idx ON st_dispatches (tracking_no);
CREATE INDEX st_dispatches_request_idx  ON st_dispatches (linked_request_id);

-- One row per status change, the first status included. The tracking timeline is built from these rows.
CREATE TABLE st_dispatch_history (
  id          TEXT PRIMARY KEY,
  dispatch_id TEXT NOT NULL REFERENCES st_dispatches(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Packed', 'Dispatched', 'In Transit', 'Delivered', 'Delayed', 'Returned')),
  changed_by  TEXT REFERENCES users(id),
  changed_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  note        TEXT,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);
CREATE INDEX st_dispatch_history_dispatch_idx ON st_dispatch_history (dispatch_id, changed_at);

-- ─────────────────────────────────────────────────────────────
-- Notifications (read and cleared state is tracked per user)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE st_notifications (
  id             TEXT PRIMARY KEY,
  type           TEXT NOT NULL CHECK (type IN ('info', 'success', 'warning', 'danger')),
  title          TEXT NOT NULL,
  message        TEXT,
  entity_type    TEXT CHECK (entity_type IS NULL OR entity_type IN ('request', 'dispatch')),
  entity_id      TEXT,
  target_user_id TEXT REFERENCES users(id),  -- NULL = everyone who can open Notifications
  created_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at     TEXT
);
CREATE INDEX st_notifications_created_idx ON st_notifications (created_at);
CREATE INDEX st_notifications_target_idx  ON st_notifications (target_user_id);
CREATE INDEX st_notifications_entity_idx  ON st_notifications (entity_type, entity_id);

CREATE TABLE st_notification_reads (
  notification_id TEXT NOT NULL REFERENCES st_notifications(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id),
  read_at         TEXT,
  dismissed_at    TEXT,                       -- "Clear all" hides the notification for this user only
  created_by      TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at      TEXT,
  PRIMARY KEY (notification_id, user_id)
);
CREATE INDEX st_notification_reads_user_idx ON st_notification_reads (user_id);

-- ─────────────────────────────────────────────────────────────
-- Activity log (append-only; updated_at and deleted_at exist only to follow the convention)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE st_activity_log (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id),     -- NULL = system
  action      TEXT NOT NULL,                 -- Create | Edit | Delete | Login | StatusChange | Approve | Import | Restore | ...
  entity_type TEXT,                          -- party | courier | product | request | dispatch | user | settings | city
  entity_id   TEXT,
  details     TEXT,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);
CREATE INDEX st_activity_log_created_idx ON st_activity_log (created_at);
CREATE INDEX st_activity_log_user_idx    ON st_activity_log (user_id);
CREATE INDEX st_activity_log_entity_idx  ON st_activity_log (entity_type, entity_id);

-- ─────────────────────────────────────────────────────────────
-- Settings and counters
-- ─────────────────────────────────────────────────────────────

-- Each value is JSON-encoded text. The known keys are listed in docs/sampletrack-spec.md.
CREATE TABLE st_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

-- Atomic document numbering. D1 has no interactive transactions, so the bump and
-- the insert that uses it go in a single batch():
--   UPDATE st_counters SET last_value = last_value + 1, updated_at = ? WHERE name = 'REQ';
--   INSERT INTO st_requests (..., req_no) VALUES (..., (SELECT printf('REQ-%04d', last_value) FROM st_counters WHERE name = 'REQ'));
-- If anything in the batch fails, the whole batch rolls back, so no number is used up.
CREATE TABLE st_counters (
  name       TEXT PRIMARY KEY,               -- 'REQ' | 'DSP'
  last_value INTEGER NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);
