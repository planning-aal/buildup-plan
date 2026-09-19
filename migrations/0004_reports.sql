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
