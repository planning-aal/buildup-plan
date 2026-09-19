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
