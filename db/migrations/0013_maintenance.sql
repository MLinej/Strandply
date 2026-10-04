-- 0013_maintenance.sql
--
-- Maintenance module (legacy "Maintenance Work Tracker"): plant areas and work orders with an activity timeline;
-- plus the maintenance_* keys in the role permission matrix. Behaviour lives in api/src/modules/maintenance
-- (docs/maintenance-spec.md). Conventions are listed at the top of 0001_users.sql. Nothing here has been run.
--
-- Numbers: WO-26-0001 from st_counters 'MT-WO-<fy>' (the FY of the raised date). Areas are stored on work orders
-- by name, as legacy did; renaming an area renames it on its work orders in the same batch.

CREATE TABLE mt_areas (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);
CREATE UNIQUE INDEX mt_areas_name_uq ON mt_areas (lower(trim(name))) WHERE deleted_at IS NULL;

CREATE TABLE mt_work_orders (
  id           TEXT PRIMARY KEY,
  wo_no        TEXT NOT NULL,
  title        TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('Mechanical', 'Electrical', 'Hydraulic', 'Pneumatic', 'Civil', 'Instrumentation', 'HVAC', 'Safety')),
  area         TEXT NOT NULL,
  priority     TEXT NOT NULL DEFAULT 'High' CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')),
  status       TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'On Hold', 'Completed')),
  assignee     TEXT NOT NULL,                 -- technician, as typed
  description  TEXT,
  notes        TEXT,
  due_date     TEXT NOT NULL,
  completed_on TEXT,                          -- business date last marked Completed; NULL when reopened
  created_by   TEXT REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at   TEXT
);
CREATE UNIQUE INDEX mt_work_orders_no_uq ON mt_work_orders (lower(wo_no)) WHERE deleted_at IS NULL;
CREATE INDEX mt_work_orders_open_idx ON mt_work_orders (status, due_date) WHERE deleted_at IS NULL;
CREATE INDEX mt_work_orders_area_idx ON mt_work_orders (area);

-- The activity timeline (legacy timeline table: created / assigned / status / edited / note). Append-only.
CREATE TABLE mt_timeline (
  id            TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES mt_work_orders(id),
  type          TEXT NOT NULL CHECK (type IN ('created', 'assigned', 'status', 'edited', 'note')),
  text          TEXT NOT NULL,
  by_user       TEXT REFERENCES users(id),
  by_name       TEXT NOT NULL,
  at            TEXT NOT NULL
);
CREATE INDEX mt_timeline_wo_idx ON mt_timeline (work_order_id, at);

-- ─────────────────────────────────────────────────────────────
-- Reference data: legacy DEFAULT_AREAS (api/src/seed/maintenance.ts).
-- ─────────────────────────────────────────────────────────────

INSERT INTO mt_areas (id, name) VALUES
  ('mta-1', 'Assembly Line A'),
  ('mta-2', 'Assembly Line B'),
  ('mta-3', 'Packaging Unit'),
  ('mta-4', 'Boiler Room'),
  ('mta-5', 'Warehouse'),
  ('mta-6', 'Quality Lab'),
  ('mta-7', 'Utility Block'),
  ('mta-8', 'Press Shop');

-- ─────────────────────────────────────────────────────────────
-- Role permissions: append the Maintenance keys (keeps custom changes).
-- Same result as DEFAULT_ROLE_PERMISSIONS in api/src/domain/access.ts (a test checks 0004 + 0005 … 0013).
-- ─────────────────────────────────────────────────────────────

UPDATE st_role_permissions
SET permissions = json_insert(permissions,
      '$.pages[#]', 'maintenance_dashboard', '$.pages[#]', 'maintenance_orders', '$.pages[#]', 'maintenance_masters', '$.pages[#]', 'maintenance_reports'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('superadmin', 'admin');

UPDATE st_role_permissions
SET permissions = json_insert(permissions, '$.pages[#]', 'maintenance_dashboard', '$.pages[#]', 'maintenance_reports'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('management');
