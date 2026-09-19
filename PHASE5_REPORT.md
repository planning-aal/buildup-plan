# Phase 5 — Cloudflare production layer

Status: **implemented and verified locally; not deployed.** Deployment needs an
Armana-owned Cloudflare account (see CLOUDFLARE_DEPLOYMENT.md). Nothing in the
existing application was rebuilt or removed, and the Phase 2 planning engine
remains the only place calculations happen.

## Architecture

```text
USER
  -> ARMANA WEB APP (TanStack Start, React 19)
    -> CLOUDFLARE WORKER  (src/server.ts, /api/* routes)
      -> D1   structured data, versions, snapshots, audit log
      -> R2   original uploads + generated workbooks
      -> PLANNING ENGINE (src/planning)  <- single source of truth
        -> PRODUCTION PLAN -> REPORT LAYER (src/reports) -> XLSX (src/export)
```

## Cloudflare components

| Component | Binding | Purpose |
| --- | --- | --- |
| Workers | — | application + API execution, three environments |
| D1 | `DB` | factories, lines, users, plans, SMV, calendar, reports, audit |
| R2 | `FILES` | sewing plans, SMV files, generated workbooks |
| Access | headers | authenticated identity, mapped to a role and factory |
| Secrets | `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN` | never committed |

## Files created

- `wrangler.toml`
- `migrations/0001_initial_schema.sql` … `0005_audit_logs.sql`
- `src/lib/cloud/bindings.server.ts`, `roles.ts`, `auth.server.ts`,
  `http.server.ts`, `storage.server.ts`, `repo.server.ts`, `replay.server.ts`,
  `client.ts`
- `src/routes/api/` — `health`, `sewing-plans.index`, `sewing-plans.upload`,
  `sewing-plans.$id`, `sewing-plans.$id.entries`, `smv.index`, `smv.upload`,
  `calendar`, `scenarios`, `plans.generate`, `plans.index`, `plans.$id`,
  `plans.$id.summary`, `plans.$id.lines`, `plans.$id.styles`,
  `reports.generate`, `reports.index`, `reports.$id`, `reports.$id.download`
- `src/routes/history.tsx` (Plan History)
- `CLOUDFLARE_DEPLOYMENT.md`, `DATABASE_SCHEMA.md`, `API.md`

## Files modified

- `src/components/shell/app-shell.tsx` — Plan History navigation entry
- `roadmap.md`

## How the guarantees are met

- **One calculation source.** `replay.server.ts` rebuilds a stored plan by
  re-running the deterministic engine over the saved snapshot; the exporter
  never recalculates anything.
- **Versioning.** Uploads become `SP-YYYY-MM-NNN`, plans `PLAN-YYYY-MM-NNN`,
  reports `PBP-YYYY-MM-NNN`, SMV `SMV-vNNN`, calendars `CAL-YYYY-MM-NNN`.
  Changing settings creates a new plan version; earlier plans and reports are
  untouched.
- **Duplicates.** A file hash match returns 409 with USE EXISTING VERSION /
  UPLOAD AS NEW VERSION. Plan generation is idempotent per request key, so a
  double click, retry or refresh cannot create two plans.
- **Failed imports.** The original file is stored before parsing; a parse
  failure marks the version FAILED and commits no plan records.
- **Security.** No credentials reach the browser; every query is scoped by
  `factory_id` in the data layer; downloads are authenticated endpoints, not
  public storage URLs; CORS is restricted to configured origins; uploads and
  generation are rate limited; errors carry a reference ID only.
- **Audit.** Uploads, SMV, calendar, line and efficiency changes, plan and
  report generation, export and download are recorded.
- **Determinism.** No AI or external API is used anywhere in the pipeline.

## Local verification

- `tsgo --noEmit` — clean
- `eslint` — clean
- `vitest run` — 17/17
- `GET /api/health` → `{"status":"ok","environment":"development","services":{"database":false,"storage":false}}`
- `GET /api/sewing-plans` with no database → readable error plus reference ID
- `/history` renders and explains that permanent storage is not switched on yet

## Known limitations

- D1, R2, Access, migrations, the health check against real bindings, and the
  end-to-end production test cannot be run from here — they need the customer's
  Cloudflare account.
- The existing pages still read and write the browser session; switching them
  to the API is a small follow-up once a live environment exists. Plan History
  already reads from the API.
- Cloudflare Access JWT signature verification relies on Access sitting in
  front of the Worker (the standard setup); an extra in-Worker JWKS check can
  be added if required.
- Scenario persistence stores definitions; scenario comparison still runs in
  the browser against the live engine.
