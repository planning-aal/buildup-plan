# Roadmap

## Phase 1 — Excel reverse engineering & data architecture (DONE)
- [x] Audit existing project (KEEP/MODIFY/CREATE map) — see PHASE1_REPORT.md
- [x] Workbook/sheet detection, line detection (any number of lines)
- [x] Style / PO / quantity / delivery-date parsers, entry-type classification
- [x] Raw text preservation (rawText + sheet/row/column)
- [x] Sheet1 style-block parser
- [x] Normalized data model + validation model
- [x] SMV master, working calendar, efficiency profile architecture
- [x] Import preview screen at /import
- [x] Acceptance test against the real sewing plan workbook

## Phase 2 — Planning & capacity engine (DONE)
- [x] Engine modules under src/planning (single source of truth), 10/10 unit tests
- [x] Jan 2026 reference comparison (296/312 cells exact; the 16 differences are stale 10-hour assumptions in the reference workbook). See PHASE2_REPORT.md

## Phase 3 — Armana Group UI/UX (DONE)
- [x] Sidebar + header shell, Armana logo, Inter, shared design system
- [x] Dashboard, Production Plan, Sewing Plan Upload, SMV Master, Line Capacity, Calendar, Scenarios, Reports, Settings
- [x] Status shown as badge + text + icon, never colour alone. See PHASE3_REPORT.md

## Phase 4 — Production Buildup Plan, reports & Excel export (DONE)
- [x] Report layer under src/reports (Summary, At a Glance, Line groups, Daily Plan, Style Mix, Capacity, Efficiency, Calendar, SMV Exceptions, Assumptions)
- [x] Export layer under src/export (WorkbookBuilder, ExcelFormatter, ExcelExporter) — 13-sheet branded XLSX
- [x] Report blocking on critical validation, post-export workbook validation, 17/17 tests. See PHASE4_REPORT.md

## Phase 5 — Cloudflare production layer (WRITTEN, NOT DEPLOYED)
- [x] wrangler.toml with development / staging / production, D1 + R2 bindings, no committed secrets
- [x] Migrations 0001–0005 (18 tables, indexes, Armana Apparels Ltd + LINE-1…12 seed)
- [x] Server layer: bindings, roles, Access authentication, request IDs, rate limiting, audit, R2 storage, factory-scoped repository
- [x] API routes: health, sewing plans (+upload/dedupe), SMV, calendar, scenarios, plan generate with idempotency, plan reads, reports (generate / list / detail / authenticated download)
- [x] Plan history page + graceful behaviour while storage is switched off
- [x] CLOUDFLARE_DEPLOYMENT.md, DATABASE_SCHEMA.md, API.md
- [ ] Deploy with an Armana-owned Cloudflare account, run the migrations, add users, connect capacity.armanagroup.com (needs the customer's account — cannot be done from here)
