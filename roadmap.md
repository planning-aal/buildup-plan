# Roadmap

## In progress
- [ ] Fix `At a Glance!L1` showing #VALUE! in the generated workbook.

## Phase 1 — Armana production planning foundation (requested 18 Sep 2026)
- [ ] Audit existing project (routes, components, parsers, generator) → keep/modify/create map.
- [ ] Robust sewing-plan parser: sheet + line-group detection, any number of lines, raw text always preserved.
- [ ] Field parsers: style no + secondary code, PO, quantity, delivery date range, buyer/planner/season.
- [ ] Entry-type classification: STYLE / PO / BALANCE / LINE_SUPPORT / TOTAL_QTY / INSTRUCTION / OTHER / UNKNOWN.
- [ ] Sheet1 style-block parser (style → daily qty per line).
- [ ] Normalized data model (SewingPlanEntry, Style, PurchaseOrder, SMVMaster, WorkingCalendar, EfficiencyProfile, LineSettings, ValidationIssue).
- [ ] Validation system: critical / warning / information categories + counts.
- [ ] Import preview screen: summary stats + inspectable row table with status filters.
- [ ] Phase 1 report back to user; stop before Phase 2 (calculation engine).

## Later (Phase 2, not started)
- Production planning & capacity calculation engine.
