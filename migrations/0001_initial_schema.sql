-- 0001_initial_schema
-- Factories, sewing lines, sewing plan versioning, normalized plan entries.

CREATE TABLE IF NOT EXISTS factories (
  id            TEXT PRIMARY KEY,
  factory_code  TEXT NOT NULL UNIQUE,
  factory_name  TEXT NOT NULL,
  location      TEXT,
  timezone      TEXT NOT NULL DEFAULT 'Asia/Dhaka',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sewing_lines (
  id                    TEXT PRIMARY KEY,
  factory_id            TEXT NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  line_code             TEXT NOT NULL,
  line_name             TEXT NOT NULL,
  sequence              INTEGER NOT NULL,
  active                INTEGER NOT NULL DEFAULT 1,
  default_working_hours REAL NOT NULL DEFAULT 8,
  default_manpower      INTEGER NOT NULL DEFAULT 73,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (factory_id, line_code)
);
CREATE INDEX IF NOT EXISTS idx_sewing_lines_factory ON sewing_lines (factory_id, sequence);

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  user_name   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'VIEWER',
  factory_id  TEXT REFERENCES factories(id),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_factory ON users (factory_id);

-- Every upload is a new immutable version. Nothing is ever overwritten.
CREATE TABLE IF NOT EXISTS sewing_plans (
  id              TEXT PRIMARY KEY,              -- SP-2026-09-001
  factory_id      TEXT NOT NULL REFERENCES factories(id),
  file_name       TEXT NOT NULL,
  file_hash       TEXT NOT NULL,
  storage_key     TEXT NOT NULL,
  file_size       INTEGER NOT NULL DEFAULT 0,
  planning_period TEXT,                          -- yyyy-mm
  period_from     TEXT,
  period_to       TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'UPLOADED',
  uploaded_by     TEXT,
  uploaded_at     TEXT NOT NULL DEFAULT (datetime('now')),
  summary_json    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sewing_plans_factory ON sewing_plans (factory_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_sewing_plans_hash ON sewing_plans (factory_id, file_hash);
CREATE INDEX IF NOT EXISTS idx_sewing_plans_status ON sewing_plans (status);

CREATE TABLE IF NOT EXISTS styles (
  id             TEXT PRIMARY KEY,
  factory_id     TEXT NOT NULL REFERENCES factories(id),
  style_no       TEXT NOT NULL,
  secondary_code TEXT,
  buyer          TEXT,
  merchant       TEXT,
  division       TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (factory_id, style_no)
);
CREATE INDEX IF NOT EXISTS idx_styles_factory ON styles (factory_id, style_no);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id            TEXT PRIMARY KEY,
  factory_id    TEXT NOT NULL REFERENCES factories(id),
  style_id      TEXT REFERENCES styles(id),
  po_no         TEXT NOT NULL,
  order_qty     INTEGER,
  delivery_from TEXT,
  delivery_to   TEXT,
  buyer         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (factory_id, po_no, style_id)
);
CREATE INDEX IF NOT EXISTS idx_po_style ON purchase_orders (style_id);

CREATE TABLE IF NOT EXISTS sewing_plan_entries (
  id              TEXT PRIMARY KEY,
  sewing_plan_id  TEXT NOT NULL REFERENCES sewing_plans(id) ON DELETE CASCADE,
  factory_id      TEXT NOT NULL REFERENCES factories(id),
  entry_date      TEXT NOT NULL,
  day_label       TEXT,
  line_id         TEXT NOT NULL,
  line_no         INTEGER,
  line_label      TEXT,
  raw_text        TEXT NOT NULL,                -- never modified
  entry_type      TEXT NOT NULL,
  style_no        TEXT,
  secondary_code  TEXT,
  po_no           TEXT,
  order_qty       INTEGER,
  target_qty      INTEGER,
  quantities_json TEXT,
  delivery_start  TEXT,
  delivery_end    TEXT,
  delivery_raw    TEXT,
  buyer           TEXT,
  planner         TEXT,
  season          TEXT,
  source_sheet    TEXT,
  source_row      INTEGER,
  source_column   INTEGER,
  parse_status    TEXT NOT NULL,
  flags_json      TEXT
);
CREATE INDEX IF NOT EXISTS idx_entries_plan ON sewing_plan_entries (sewing_plan_id);
CREATE INDEX IF NOT EXISTS idx_entries_plan_date_line ON sewing_plan_entries (sewing_plan_id, entry_date, line_id);
CREATE INDEX IF NOT EXISTS idx_entries_style ON sewing_plan_entries (sewing_plan_id, style_no);

CREATE TABLE IF NOT EXISTS validation_issues (
  id          TEXT PRIMARY KEY,
  factory_id  TEXT NOT NULL REFERENCES factories(id),
  entity_type TEXT NOT NULL,                    -- SEWING_PLAN | PRODUCTION_PLAN | REPORT
  entity_id   TEXT NOT NULL,
  severity    TEXT NOT NULL,                    -- CRITICAL | WARNING | INFO
  code        TEXT NOT NULL,
  message     TEXT NOT NULL,
  source_ref  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_issues_entity ON validation_issues (entity_type, entity_id, severity);

-- Seed factory and its twelve sewing lines. Additional lines are added later
-- through the UI; nothing in the application assumes twelve.
INSERT OR IGNORE INTO factories (id, factory_code, factory_name, location, timezone)
VALUES ('fac_armana_apparels', 'AAL', 'Armana Apparels Ltd', 'Bangladesh', 'Asia/Dhaka');

INSERT OR IGNORE INTO sewing_lines (id, factory_id, line_code, line_name, sequence) VALUES
 ('line_aal_1','fac_armana_apparels','LINE-1','Line 1',1),
 ('line_aal_2','fac_armana_apparels','LINE-2','Line 2',2),
 ('line_aal_3','fac_armana_apparels','LINE-3','Line 3',3),
 ('line_aal_4','fac_armana_apparels','LINE-4','Line 4',4),
 ('line_aal_5','fac_armana_apparels','LINE-5','Line 5',5),
 ('line_aal_6','fac_armana_apparels','LINE-6','Line 6',6),
 ('line_aal_7','fac_armana_apparels','LINE-7','Line 7',7),
 ('line_aal_8','fac_armana_apparels','LINE-8','Line 8',8),
 ('line_aal_9','fac_armana_apparels','LINE-9','Line 9',9),
 ('line_aal_10','fac_armana_apparels','LINE-10','Line 10',10),
 ('line_aal_11','fac_armana_apparels','LINE-11','Line 11',11),
 ('line_aal_12','fac_armana_apparels','LINE-12','Line 12',12);
