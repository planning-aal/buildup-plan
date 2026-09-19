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
