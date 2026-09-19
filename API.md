# API reference

Base path `/api`. All endpoints are same-origin and JSON unless stated.

## Authentication

Cloudflare Access sits in front of the application. The Worker reads
`cf-access-authenticated-user-email` (and the signed
`cf-access-jwt-assertion`), looks the person up in `users` and derives their
role and factory. In `development` a local user is assumed so the app runs
without Access.

Errors: `401` not signed in, `403` no permission or wrong factory.

## Permissions by role

| Permission | ADMIN | PLANNER | IE | PRODUCTION | MANAGEMENT | VIEWER |
| --- | --- | --- | --- | --- | --- | --- |
| plan.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| plan.upload | ✓ | ✓ | | | | |
| plan.generate | ✓ | ✓ | | | | |
| smv.write | ✓ | | ✓ | | | |
| calendar.write | ✓ | ✓ | | | | |
| lines.write / efficiency.write | ✓ | ✓ | ✓ (efficiency) | | | |
| scenario.write | ✓ | ✓ | ✓ | | ✓ | |
| report.generate / report.export | ✓ | ✓ | ✓ | | ✓ | |
| audit.read / admin | ✓ | | | | | |

## Error shape

```json
{ "error": "Readable message.", "code": "NOT_FOUND", "requestId": "ABC123", "reference": "ABC123" }
```

The same request ID appears in the Worker log. No credentials, tokens or file
contents are ever included.

## Endpoints

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/api/health` | none | `{ status, environment, version, services }` |
| GET | `/api/sewing-plans` | plan.read | paginated list of uploaded versions |
| POST | `/api/sewing-plans/upload` | plan.upload | multipart `file`, optional `mode=AUTO\|USE_EXISTING\|NEW_VERSION`. `409` with both choices when the file hash already exists. Original stored before parsing; parse failure keeps the file and marks the version FAILED |
| GET | `/api/sewing-plans/:id` | plan.read | version detail + summary |
| GET | `/api/sewing-plans/:id/entries` | plan.read | `?limit&offset&line&date&status` |
| GET | `/api/smv` | smv.read | `?version=SMV-v003` (defaults to latest) |
| POST | `/api/smv/upload` | smv.write | multipart `file`; creates a new SMV version |
| GET | `/api/calendar` | calendar.read | latest calendar version for a period |
| POST | `/api/calendar` | calendar.write | saves a new calendar version |
| GET | `/api/plans` | plan.read | generated plan versions |
| POST | `/api/plans/generate` | plan.generate | body `{ sewingPlanId, period, lineSettings, allowOverproduction, scenario }`, header `Idempotency-Key`. Blocks on critical validation issues (`422`), otherwise saves an immutable snapshot |
| GET | `/api/plans/:id` | plan.read | plan header + snapshot |
| GET | `/api/plans/:id/summary` | plan.read | KPI totals |
| GET | `/api/plans/:id/lines` | plan.read | per-line rollup |
| GET | `/api/plans/:id/styles` | plan.read | per-style buildup |
| GET | `/api/scenarios` | scenario.read | saved scenarios |
| POST | `/api/scenarios` | scenario.write | creates a scenario definition |
| GET | `/api/reports` | report.read | report versions |
| POST | `/api/reports/generate` | report.generate | body `{ planId, export?: boolean }`. Replays the stored snapshot through the planning engine, builds the workbook, validates it, stores it and records the export. `422` when the report is BLOCKED |
| GET | `/api/reports/:id` | report.read | report detail + file metadata |
| GET | `/api/reports/:id/download` | report.export | streams the XLSX after checking factory and permission; no public storage URL exists |

## Rate limits

Uploads, plan generation and report generation use fixed-window counters per
user. Read-only dashboard and listing endpoints are not rate limited.
