-- Armana Production Planning - complete database setup.
-- Paste this WHOLE file into the Cloudflare D1 Console and press Run. (One-time setup.)

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

-- 0002_smv_versioning
-- SMV master with upload versions; values are never overwritten in place.

CREATE TABLE IF NOT EXISTS smv_versions (
  id          TEXT PRIMARY KEY,                -- SMV-v003
  factory_id  TEXT NOT NULL REFERENCES factories(id),
  file_name   TEXT,
  file_hash   TEXT,
  storage_key TEXT,
  file_size   INTEGER NOT NULL DEFAULT 0,
  version     INTEGER NOT NULL DEFAULT 1,
  source      TEXT NOT NULL DEFAULT 'UPLOAD',  -- UPLOAD | MANUAL | WORKBOOK
  record_count INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | ARCHIVED
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_smv_versions_factory ON smv_versions (factory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_smv_versions_hash ON smv_versions (factory_id, file_hash);

CREATE TABLE IF NOT EXISTS smv_master (
  id             TEXT PRIMARY KEY,
  factory_id     TEXT NOT NULL REFERENCES factories(id),
  smv_version_id TEXT NOT NULL REFERENCES smv_versions(id) ON DELETE CASCADE,
  style_no       TEXT NOT NULL,
  buyer          TEXT,
  smv            REAL,
  effective_date TEXT,
  status         TEXT NOT NULL,                -- SMV_FOUND | SMV_MISSING | SMV_INVALID
  source         TEXT NOT NULL,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_smv_lookup ON smv_master (smv_version_id, style_no);
CREATE INDEX IF NOT EXISTS idx_smv_factory_style ON smv_master (factory_id, style_no, effective_date);

CREATE TABLE IF NOT EXISTS efficiency_profiles (
  id                TEXT PRIMARY KEY,
  factory_id        TEXT NOT NULL REFERENCES factories(id),
  name              TEXT NOT NULL,
  start_efficiency  REAL NOT NULL DEFAULT 0.5,
  max_efficiency    REAL NOT NULL DEFAULT 0.8,
  ramp_mode         TEXT NOT NULL DEFAULT 'FIXED',  -- NONE | FIXED | CUSTOM
  ramp_step         REAL NOT NULL DEFAULT 0.05,
  custom_json       TEXT,
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_eff_profiles_factory ON efficiency_profiles (factory_id, active);

CREATE TABLE IF NOT EXISTS calendar_versions (
  id         TEXT PRIMARY KEY,                 -- CAL-2026-09-001
  factory_id TEXT NOT NULL REFERENCES factories(id),
  period     TEXT NOT NULL,                    -- yyyy-mm
  version    INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cal_versions ON calendar_versions (factory_id, period, version DESC);

CREATE TABLE IF NOT EXISTS working_calendar (
  id                  TEXT PRIMARY KEY,
  calendar_version_id TEXT NOT NULL REFERENCES calendar_versions(id) ON DELETE CASCADE,
  factory_id          TEXT NOT NULL REFERENCES factories(id),
  calendar_date       TEXT NOT NULL,
  day_label           TEXT,
  working_status      TEXT NOT NULL,           -- WORKING | HOLIDAY | WEEKLY_OFF | SPECIAL_WORKING_DAY
  holiday_type        TEXT,
  holiday_reason      TEXT,
  working_hours       REAL NOT NULL DEFAULT 8,
  UNIQUE (calendar_version_id, calendar_date)
);
CREATE INDEX IF NOT EXISTS idx_calendar_date ON working_calendar (calendar_version_id, calendar_date);

CREATE TABLE IF NOT EXISTS line_settings (
  id                    TEXT PRIMARY KEY,
  factory_id            TEXT NOT NULL REFERENCES factories(id),
  line_id               TEXT NOT NULL,
  period                TEXT NOT NULL,         -- yyyy-mm
  active                INTEGER NOT NULL DEFAULT 1,
  working_hours         REAL NOT NULL DEFAULT 8,
  manpower              INTEGER NOT NULL DEFAULT 73,
  efficiency_profile_id TEXT REFERENCES efficiency_profiles(id),
  ramp_json             TEXT,
  hours_by_date_json    TEXT,
  overrides_json        TEXT,
  updated_by            TEXT,
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (factory_id, line_id, period)
);
CREATE INDEX IF NOT EXISTS idx_line_settings ON line_settings (factory_id, period);

-- 0003_production_plan
-- Immutable production plan snapshots. Regeneration creates a NEW version.

CREATE TABLE IF NOT EXISTS scenarios (
  id            TEXT PRIMARY KEY,
  factory_id    TEXT NOT NULL REFERENCES factories(id),
  name          TEXT NOT NULL,
  overrides_json TEXT NOT NULL DEFAULT '{}',
  is_base       INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scenarios_factory ON scenarios (factory_id, created_at DESC);

CREATE TABLE IF NOT EXISTS production_plans (
  id                    TEXT PRIMARY KEY,      -- PLAN-2026-09-001
  factory_id            TEXT NOT NULL REFERENCES factories(id),
  version               INTEGER NOT NULL DEFAULT 1,
  period                TEXT NOT NULL,         -- yyyy-mm
  period_from           TEXT NOT NULL,
  period_to             TEXT NOT NULL,
  sewing_plan_id        TEXT NOT NULL REFERENCES sewing_plans(id),
  smv_version_id        TEXT REFERENCES smv_versions(id),
  calendar_version_id   TEXT REFERENCES calendar_versions(id),
  scenario_id           TEXT REFERENCES scenarios(id),
  efficiency_profile_id TEXT REFERENCES efficiency_profiles(id),
  -- full input snapshot so the plan can be reproduced exactly
  snapshot_json         TEXT NOT NULL,
  summary_json          TEXT,
  status                TEXT NOT NULL DEFAULT 'GENERATED', -- GENERATED | ARCHIVED | BLOCKED
  idempotency_key       TEXT,
  generated_by          TEXT,
  generated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_idem ON production_plans (factory_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_plans_factory_period ON production_plans (factory_id, period, version DESC);
CREATE INDEX IF NOT EXISTS idx_plans_status ON production_plans (status);

CREATE TABLE IF NOT EXISTS production_plan_days (
  id                 TEXT PRIMARY KEY,
  plan_id            TEXT NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
  factory_id         TEXT NOT NULL REFERENCES factories(id),
  plan_date          TEXT NOT NULL,
  line_id            TEXT NOT NULL,
  line_name          TEXT NOT NULL,
  style_no           TEXT,
  po_no              TEXT,
  smv                REAL,
  working_hours      REAL NOT NULL,
  manpower           INTEGER NOT NULL,
  efficiency         REAL NOT NULL,
  available_minutes  REAL NOT NULL,
  earned_minutes     REAL NOT NULL,
  daily_capacity     REAL NOT NULL,
  required_qty       REAL,
  planned_qty        REAL NOT NULL,
  cumulative_qty     REAL NOT NULL,
  remaining_qty      REAL,
  capacity_gap       REAL,
  ramp_day           INTEGER NOT NULL DEFAULT 0,
  style_change       INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_days ON production_plan_days (plan_id, plan_date, line_id);
CREATE INDEX IF NOT EXISTS idx_plan_days_style ON production_plan_days (plan_id, style_no);

CREATE TABLE IF NOT EXISTS production_plan_items (
  id             TEXT PRIMARY KEY,
  plan_id        TEXT NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
  factory_id     TEXT NOT NULL REFERENCES factories(id),
  line_id        TEXT NOT NULL,
  line_name      TEXT NOT NULL,
  style_no       TEXT,
  secondary_code TEXT,
  po_no          TEXT,
  buyer          TEXT,
  smv            REAL,
  smv_status     TEXT,
  order_qty      REAL,
  planned_qty    REAL NOT NULL DEFAULT 0,
  remaining_qty  REAL,
  shortage_qty   REAL NOT NULL DEFAULT 0,
  start_date     TEXT,
  end_date       TEXT,
  projected_completion TEXT,
  sequence       INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_items ON production_plan_items (plan_id, line_id, sequence);
CREATE INDEX IF NOT EXISTS idx_plan_items_style ON production_plan_items (plan_id, style_no, po_no);

CREATE TABLE IF NOT EXISTS production_plan_lines (
  id                TEXT PRIMARY KEY,
  plan_id           TEXT NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
  line_id           TEXT NOT NULL,
  line_name         TEXT NOT NULL,
  active            INTEGER NOT NULL DEFAULT 1,
  working_days      INTEGER NOT NULL DEFAULT 0,
  total_capacity    REAL NOT NULL DEFAULT 0,
  total_planned     REAL NOT NULL DEFAULT 0,
  total_required    REAL NOT NULL DEFAULT 0,
  available_minutes REAL NOT NULL DEFAULT 0,
  earned_minutes    REAL NOT NULL DEFAULT 0,
  efficiency        REAL NOT NULL DEFAULT 0,
  capacity_gap      REAL NOT NULL DEFAULT 0,
  style_changes     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_plan_lines ON production_plan_lines (plan_id, line_id);

-- 0004_reports
-- Production Buildup Plan reports and their exported workbooks.

CREATE TABLE IF NOT EXISTS reports (
  id            TEXT PRIMARY KEY,              -- PBP-2026-09-001
  factory_id    TEXT NOT NULL REFERENCES factories(id),
  plan_id       TEXT NOT NULL REFERENCES production_plans(id),
  version       INTEGER NOT NULL DEFAULT 1,
  period        TEXT NOT NULL,
  scenario_id   TEXT,
  scenario_name TEXT,
  status        TEXT NOT NULL DEFAULT 'GENERATED', -- DRAFT | VALIDATED | GENERATED | EXPORTED | BLOCKED
  blockers_json TEXT,
  snapshot_json TEXT NOT NULL,
  totals_json   TEXT,
  generated_by  TEXT,
  generated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_plan ON reports (plan_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_reports_factory ON reports (factory_id, period, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);

CREATE TABLE IF NOT EXISTS report_exports (
  id          TEXT PRIMARY KEY,
  report_id   TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  factory_id  TEXT NOT NULL REFERENCES factories(id),
  file_name   TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  file_size   INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  status      TEXT NOT NULL DEFAULT 'STORED',  -- STORED | FAILED | ARCHIVED
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_report_exports ON report_exports (report_id, created_at DESC);

-- 0005_audit_logs
-- Append-only audit trail plus a small counter table used for rate limiting.

CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  user_email  TEXT,
  factory_id  TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  old_value   TEXT,
  new_value   TEXT,
  request_id  TEXT,
  ip_address  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_factory_time ON audit_logs (factory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0
);
