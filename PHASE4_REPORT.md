# Phase 4 — Production Buildup Plan reporting + Excel export

The Phase 2 planning engine remains the single source of truth. Nothing in
`src/reports/` or `src/export/` recalculates production numbers; both layers only
read `PlanningResult` and shape it for presentation.

## Report architecture

```
Sewing plan + SMV + Calendar + Line settings
        -> PlanningEngine (Phase 2)      = PlanningResult   (single calculation)
        -> src/reports/*                 = ReportTable[]    (shaping only)
        -> Report preview (/buildup)     = same tables on screen
        -> src/export/*                  = XLSX workbook from the same tables
```

`src/reports/`
- `types.ts` — ReportColumn/ReportTable/ReportMeta/ReportBlocker/ReportSnapshot/ProductionBuildupReport
- `SummaryReport.ts` — 01 Summary (weighted efficiency = earned ÷ available)
- `AtAGlanceReport.ts` — 02 At a Glance (one row per active line)
- `LineReport.ts` — line groups of 4 (12 lines → 3 sheets, 16 lines → 4 sheets, no code change)
- `DailyPlanReport.ts` — 06 Daily Production Plan (date, line, style order)
- `StyleMixReport.ts` — 07 Style / Product Mix (style + PO + line, POs never merged)
- `CapacityReport.ts` — 08 Capacity Analysis (factory/line/date/style) + 08b Daily Capacity
- `EfficiencyReport.ts` — 09 Efficiency Analysis
- `CalendarReport.ts` — 10 Working Calendar (holiday capacity = 0)
- `SMVExceptionReport.ts` — 11 SMV Exceptions + blocking rules
- `AssumptionsReport.ts` — 12 Assumptions (all planning inputs)
- `ProductionBuildupReport.ts` — orchestrator: meta, blockers, snapshot, tables, totals

`src/export/`
- `ExcelFormatter.ts` — number/date formats, fonts, fills, column-width caps
- `WorkbookBuilder.ts` — ExcelJS workbook: logo, branded header, freeze panes, auto filter, print setup
- `ExcelExporter.ts` — stage messages, blob generation, post-export validation, CSV per table

## Report pages

- `/buildup` — "Production Buildup Plan": report header (Report ID, Plan ID, factory, period,
  scenario, generated date, status), tabs for all 13 tables, Export CSV / Print / Export Excel.
- Blocked state shows "Report generation blocked" with the reasons plus VIEW ERRORS / FIX NOW.
- Existing `/reports` style-buildup page and every Phase 3 page are unchanged.
- Tables use the shared `ReportTableView` (search, sort, pagination, frozen key columns, totals row).

## Excel workbook

Sheets produced from the real sewing plan (May 2025 run, 281 SMVs):

| Sheet | Rows |
|---|---|
| 01 Summary | 34 |
| 02 At a Glance | 19 |
| 03 L1 – L4 / 04 L5 – L8 / 05 L9 – L12 | 131 each |
| 06 Daily Production Plan | 380 |
| 07 Style Product Mix | 716 |
| 08 Capacity Analysis | 759 |
| 08b Daily Capacity | 38 |
| 09 Efficiency Analysis | 386 |
| 10 Working Calendar | 38 |
| 11 SMV Exceptions | 7 |
| 12 Assumptions | 39 |

Formatting: Armana logo at natural aspect ratio on every sheet, Inter-style single font,
qty `1,234`, SMV `21.32`, efficiency `72.0%`, hours `8.0`, dates `18-May-2025`, minutes `24,000`;
freeze panes under the header (plus key columns), auto filters, capped column widths with wrapped
raw text, status shown as text plus a subtle fill (never colour alone), landscape + fit-to-width +
repeating header rows + footer (factory · period · page · report ID) for wide sheets.

File name: `Armana_Production_Buildup_Plan_May_2025.xlsx`
(`..._Scenario_A.xlsx` when a scenario is active).

## Validation

Before generation: critical validation issues, missing/invalid SMV, invalid line settings and
"no working days" all raise blockers; a blocked report is never exported.
After generation: the exported buffer is re-opened and checked for every expected sheet, its row
count, and Total Order Qty / Total Planned Qty / Total Capacity / Average Efficiency against the
engine totals. A failed check is reported as a failure, not a successful download.

## Snapshot and versioning

Each report carries Report ID (`PBP-2025-05-0001`), Plan ID, result ID, period, factory, scenario,
sewing-plan source, SMV source, calendar version, efficiency profile, line settings and generated
timestamp, so a report can be reproduced later.

## Reference workbook comparison (developer only)

`bun scripts/reference-check.ts <workbook.xlsx>` against
`01_Production_Buildup_Plan_Jan_2026.xlsx`: 312 cells compared, 296 reproduced exactly,
16 differ only because those cells still use a 10-hour (600 minute) assumption in the source
workbook. Totals: target 320,650, earned 6,976,910 min, available 10,932,480 min,
weighted efficiency 63.8%. Not exposed in the UI.

## Test results

- `bunx tsgo --noEmit` clean.
- `bunx vitest run` — 17/17 (10 engine, 7 report/export, including a full workbook build and
  export validation on the real sewing plan).
- Browser end-to-end on the real files: sewing plan (4,705 records) → 281 SMVs → Generate plan →
  `/buildup` renders report PBP-2025-05-0001 → Export Excel downloads
  `Armana_Production_Buildup_Plan_May_2025.xlsx` with all 13 sheets. No page errors.
- Visual QA: workbook rendered to PDF (63 pages) and inspected — Summary, At a Glance,
  Daily Production Plan and Capacity pages are readable, header rows repeat, nothing clipped.

## Known limitations

- Uploaded plan data lives in memory for the session (settings, calendar and SMV master persist);
  durable storage is Phase 5.
- The reference comparison covers efficiency/minute cells and totals, not every reference sheet.
- Print/PDF uses the browser print dialog; there is no server-side PDF renderer.
- Large daily tables are paginated rather than virtualised.
