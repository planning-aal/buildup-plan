# PHASE 3 — UI / UX (Armana Group Production Planning)

## Pages created
- /dashboard — KPI cards, capacity overview, daily capacity trend, efficiency trend
- /production-plan — 6-step workflow, filters, production buildup table
- /sewing-plan-upload — import review table (raw text preserved, REVIEW REQUIRED status)
- /smv-master — upload / add / bulk update / export, missing SMV highlighting
- /line-capacity (+ /line-capacity/$lineId) — line cards, sortable matrix, line detail
- /calendar — monthly grid, day side panel, holiday list
- /scenarios — Base / Scenario A / Scenario B side-by-side (no "best" labelling)
- /reports — style buildup with expandable daily detail + audit trail
- /settings — line settings table, efficiency control panel, apply-to-all with confirmation
- / redirects to /dashboard; legacy workbook generator moved to /builder (/plan untouched)

## Components created
ArmanaLogo, AppShell (sidebar + header + content), StatusBadge (badge+text+icon),
KpiCard, SectionCard, EmptyState, formatting helpers, smv-io helpers,
PlanningProvider store (localStorage-persisted settings).

## Components modified
__root.tsx (Inter font links, Armana metadata, PlanningProvider), styles.css (Inter font tokens),
src/routes/index.tsx (redirect).

## Engine
Unchanged. All figures come from runPlanningEngineCached / compareScenarios.

## Known issues
- Uploaded sewing plan and SMV data live in memory for the session; a hard browser
  reload requires re-upload (settings, calendar and SMV master persist).
- Excel export architecture intentionally not implemented (Phase 4).
