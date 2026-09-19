# Database schema (Cloudflare D1)

All tables are created by the versioned migrations in `migrations/`. Every
production record carries a `factory_id`, and every query in
`src/lib/cloud/repo.server.ts` filters by it — factory isolation is enforced in
the data layer, never in the browser.

## Migration order

| File | Contents |
| --- | --- |
| `0001_initial_schema.sql` | factories, sewing_lines, users, sewing_plans, styles, purchase_orders, sewing_plan_entries, validation_issues + seed |
| `0002_smv_versioning.sql` | smv_versions, smv_master, efficiency_profiles, calendar_versions, working_calendar, line_settings |
| `0003_production_plan.sql` | production_plans, production_plan_days, production_plan_items, production_plan_lines, scenarios |
| `0004_reports.sql` | reports, report_exports |
| `0005_audit_logs.sql` | audit_logs, rate_limits |

## Core tables

**factories** — `id, factory_code, factory_name, location, timezone, active, created_at, updated_at`.
Seeded with `fac_armana_apparels` / Armana Apparels Ltd. The factory is never
hard-coded in application code.

**sewing_lines** — `id, factory_id, line_code, line_name, sequence, active,
default_working_hours, default_manpower, …`; seeded LINE-1…LINE-12, unique on
`(factory_id, line_code)`. Additional lines need no code change.

**users** — `id, factory_id, email, full_name, role, active`. Role is one of
ADMIN, PLANNER, IE, PRODUCTION, MANAGEMENT, VIEWER.

## Uploads and versioning

**sewing_plans** — `id` (`SP-YYYY-MM-NNN`), `factory_id, file_name, file_hash,
file_size, storage_key, planning_period, version, status, summary_json,
uploaded_at, uploaded_by`. Status: UPLOADED → PARSED → VALIDATED →
USED_IN_PLAN → ARCHIVED (plus FAILED when parsing fails; the original file is
kept either way). `UNIQUE(factory_id, file_hash)` powers duplicate detection.

**sewing_plan_entries** — the normalized Phase 1 records, including `raw_text`.
Indexed on `(sewing_plan_id, entry_date)`, `(sewing_plan_id, line_id)` and
`style_id`.

**styles / purchase_orders** — deduplicated per factory;
`UNIQUE(factory_id, style_no)` and `UNIQUE(factory_id, po_no, style_id)`.

**smv_versions / smv_master** — each upload creates `SMV-vNNN`; SMV rows belong
to a version, so an older plan always resolves the SMVs it was generated with.

**calendar_versions / working_calendar** — each saved calendar creates
`CAL-YYYY-MM-NNN`; `UNIQUE(calendar_version_id, calendar_date)`. Statuses:
WORKING, HOLIDAY, WEEKLY_OFF, SPECIAL_WORKING_DAY.

**line_settings** — per line and period, upserted;
`UNIQUE(factory_id, line_id, period)`.

## Plans, snapshots and reports

**production_plans** — `id` (`PLAN-YYYY-MM-NNN`), `factory_id, sewing_plan_id,
version, period, status, idempotency_key, snapshot_json, summary_json,
generated_at, generated_by`. `snapshot_json` stores the exact inputs used:
sewing plan version, SMV version, calendar version, line settings, efficiency
profile, scenario, period. A generated plan is immutable — changing settings
creates PLAN-…-002, never a silent edit.
`UNIQUE(factory_id, idempotency_key)` blocks duplicate plans from double
clicks, retries and refreshes.

**production_plan_days / _items / _lines** — the daily buildup, per-style
allocations and per-line rollups exactly as the planning engine produced them.

**reports** — `id` (`PBP-YYYY-MM-NNN`), `plan_id, version, period, status,
scenario_name, totals_json, blockers_json, snapshot_json`. Status: DRAFT,
VALIDATED, GENERATED, EXPORTED, BLOCKED. Reports are bound to one plan version
and are never overwritten.

**report_exports** — `id, report_id, factory_id, file_name, storage_key,
file_size, created_at, created_by`.

**audit_logs** — `id, user_id, factory_id, action, entity_type, entity_id,
old_value, new_value, request_id, timestamp`. Written for login, uploads,
version creation, SMV and calendar changes, line and efficiency changes, plan
and scenario generation, report generation, Excel export and download.

**rate_limits** — fixed-window counters protecting uploads, plan generation and
report generation.

## Indexing

Indexes exist on `factory_id`, dates, `line_id`, `style_id`, `po_id`,
`plan_id`, `report_id` and `status`, with composite indexes for the listing and
daily-plan queries. No further indexes are added speculatively.

## Retention

Nothing is deleted automatically. Historical plans and reports are archived
(status change), not removed; permanent deletion is not exposed in the normal
interface.
