-- 0016_dwpas.sql
--
-- DWPAS (legacy "Daily Work Plan & Achievement System"): the department and employee masters, one work plan per day
-- with department lines (work, target, manpower, machine, priority, operator) and their achievement, the approval
-- trail; plus the dwpas_* keys and the dwpas_approve action in the role permission matrix. Behaviour lives in
-- api/src/modules/dwpas (docs/dwpas-spec.md). Conventions are listed at the top of 0001_users.sql. Nothing here has been run.

CREATE TABLE dw_departments (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT,
  head        TEXT NOT NULL,
  description TEXT,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);
CREATE UNIQUE INDEX dw_departments_name_uq ON dw_departments (lower(trim(name))) WHERE deleted_at IS NULL;

CREATE TABLE dw_employees (
  id          TEXT PRIMARY KEY,
  code        TEXT,
  name        TEXT NOT NULL,
  department  TEXT,                                    -- name, as legacy (Management and Production aren't plant departments)
  designation TEXT,
  type        TEXT NOT NULL DEFAULT 'Skilled' CHECK (type IN ('Skilled', 'Unskilled', 'Supervisor', 'Manager')),
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);
CREATE UNIQUE INDEX dw_employees_name_uq ON dw_employees (lower(trim(name))) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX dw_employees_code_uq ON dw_employees (lower(code)) WHERE deleted_at IS NULL AND code IS NOT NULL;

CREATE TABLE dw_plans (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'Regular Day' CHECK (type IN ('Regular Day', 'Extra Shift', 'Overtime', 'Holiday Planning')),
  prepared_by TEXT,                                    -- employee name
  remarks     TEXT,
  status      TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Submitted', 'Approved')),
  trail       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(trail)),   -- [{action, by, byName, at, note}]
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at  TEXT
);
CREATE UNIQUE INDEX dw_plans_date_uq ON dw_plans (date) WHERE deleted_at IS NULL;
CREATE INDEX dw_plans_status_idx ON dw_plans (status) WHERE deleted_at IS NULL;

CREATE TABLE dw_plan_lines (
  plan_id          TEXT NOT NULL REFERENCES dw_plans(id),
  line_no          INTEGER NOT NULL,
  department       TEXT NOT NULL,
  head             TEXT NOT NULL,                      -- department head when saved
  work             TEXT NOT NULL,
  qty              REAL NOT NULL DEFAULT 0,
  unit             TEXT NOT NULL,
  skilled          INTEGER NOT NULL DEFAULT 0,
  unskilled        INTEGER NOT NULL DEFAULT 0,
  machine          TEXT,
  priority         TEXT NOT NULL DEFAULT 'High' CHECK (priority IN ('High', 'Medium', 'Low')),
  operator         TEXT,
  actual_qty       REAL,                               -- achievement, NULL until recorded
  actual_skilled   INTEGER,
  actual_unskilled INTEGER,
  reason           TEXT,
  head_remarks     TEXT,
  PRIMARY KEY (plan_id, line_no)
);
CREATE INDEX dw_plan_lines_dept_idx ON dw_plan_lines (department);

-- ─────────────────────────────────────────────────────────────
-- Reference data: legacy SEED_DEPARTMENTS and SEED_EMPLOYEES (api/src/seed/dwpas.ts).
-- ─────────────────────────────────────────────────────────────

INSERT INTO dw_departments (id, name, code, head, description) VALUES
  ('dwd-1', 'Log Yard', 'LY', 'Yard Manager', 'Incoming log sorting & storage'),
  ('dwd-2', 'Peeling', 'PL', 'Rajesh Patel', 'Log peeling & core veneer production'),
  ('dwd-3', 'Dryer', 'DR', 'Mahesh Joshi', 'Veneer drying operations'),
  ('dwd-4', 'Core Composer', 'CC', 'Supervisor', 'Core layer composition'),
  ('dwd-5', 'Glue Kitchen', 'GK', 'Resin Manager', 'Glue/resin preparation'),
  ('dwd-6', 'Hot Press', 'HP', 'Vikram Sharma', 'Board pressing operations'),
  ('dwd-7', 'Trimming & Sanding', 'TS', 'Finishing Head', 'Panel finishing'),
  ('dwd-8', 'Lamination', 'LM', 'Lamination Head', 'Surface lamination'),
  ('dwd-9', 'Dispatch', 'DS', 'Dispatch Manager', 'Outward logistics'),
  ('dwd-10', 'Maintenance', 'MT', 'Maintenance Head', 'Equipment maintenance'),
  ('dwd-11', 'Store', 'ST', 'Sanjay Rao', 'Inventory & stores'),
  ('dwd-12', 'Quality', 'QC', 'QC Head', 'Quality control & inspection');

INSERT INTO dw_employees (id, code, name, department, designation, type) VALUES
  ('dwe-1', 'MGR001', 'Jimit Mehta', 'Management', 'Plant Manager', 'Manager'),
  ('dwe-2', 'MGR002', 'P K Sinha', 'Production', 'Production Head', 'Manager'),
  ('dwe-3', 'MGR003', 'Sanjay Rao', 'Store', 'Store Manager', 'Manager'),
  ('dwe-4', 'SUP001', 'Rahul', 'Log Yard', 'Unloading Supervisor', 'Supervisor'),
  ('dwe-5', 'SUP002', 'Rajesh Patel', 'Peeling', 'Peeling Supervisor', 'Supervisor'),
  ('dwe-6', 'SUP003', 'Mahesh Joshi', 'Dryer', 'Dryer Incharge', 'Supervisor'),
  ('dwe-7', 'SUP004', 'Vikram Sharma', 'Hot Press', 'Press Supervisor', 'Supervisor');

-- ─────────────────────────────────────────────────────────────
-- Role permissions: append the DWPAS keys (keeps custom changes).
-- Same result as DEFAULT_ROLE_PERMISSIONS in api/src/domain/access.ts (a test checks 0004 + 0005 … 0016).
-- ─────────────────────────────────────────────────────────────

UPDATE st_role_permissions
SET permissions = json_insert(permissions,
      '$.pages[#]', 'dwpas_dashboard', '$.pages[#]', 'dwpas_plans', '$.pages[#]', 'dwpas_reports', '$.pages[#]', 'dwpas_masters',
      '$.actions[#]', 'dwpas_approve'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('superadmin', 'admin');

UPDATE st_role_permissions
SET permissions = json_insert(permissions, '$.pages[#]', 'dwpas_dashboard', '$.pages[#]', 'dwpas_plans', '$.pages[#]', 'dwpas_reports'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE role IN ('management');
