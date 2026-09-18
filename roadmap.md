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
- [x] At a Glance L1 fix in the existing generator

## Phase 2 — Production planning & capacity engine (NOT STARTED, awaiting validation)

## Phase 2 — planning & capacity engine: DONE
- Engine modules under src/planning, 10/10 unit tests, /planning workspace, Jan 2026 reference comparison (296/312 exact). See PHASE2_REPORT.md.
- Phase 3 (Armana Group UI/UX): NOT STARTED — awaiting approval.
