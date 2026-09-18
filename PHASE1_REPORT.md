# Phase 1 — Excel reverse engineering & data architecture

## A. Existing project audit

| Area | File | Decision |
| --- | --- | --- |
| Landing / upload | `src/routes/index.tsx` | KEEP (added a link to the new import screen) |
| Planning workspace | `src/routes/plan.tsx` | KEEP untouched |
| Upload component | `src/components/plan/upload-card.tsx` | KEEP, reused by the import screen |
| Legacy quick parser | `src/lib/plan/parse-rough-plan.ts`, `style-parse.ts` | KEEP (feeds the existing generator) |
| Plan model / generator | `src/lib/plan/model.ts`, `generate.ts`, `smv.ts`, `store.ts` | KEEP |
| Format-preserving xlsx writer | `src/lib/xlsx/patch.ts` | KEEP, will be reused for Phase 2 export |
| Theme / branding | `src/styles.css` | KEEP |
| Database | none (browser localStorage) | KEEP for now; normalized model is storage-agnostic |
| Removed | nothing | — |

## B. Workbook structure (actual uploaded file)

* `Line 1-4` 353×27, `Line 5-8` 711×11, `Line 9-12` 679×12, `Sheet1` 25×5.
* Row 1 = title banner (`ARMANA APPAREL'S PRODUCTION PLAN … UPDATE ON :`), row 2 = header `DATE | DAY | LINE-1 | TARGET | LINE-2 | TARGET …`.
* `Line 9-12` has no TARGET labels — target columns are inferred from content.
* `Sheet1` is a different structure: style blocks (`STYLE# D100142/1195310 Qty:45935 Pcs`) with per-line daily quantities.

## C. Parser architecture (layered, no logic in UI)

```
Excel file → parse-workbook.ts (sheet + header + line detection)
           → field-parsers.ts   (style / PO / qty / delivery / entry type)
           → types.ts           (normalized records)
           → validate.ts        (CRITICAL / WARNING / INFO)
           → routes/import.tsx  (presentation only)
```

Line detection is label-driven, not positional — 12, 16 or 30 lines all work.

## D. Normalized data model

`Factory, SewingLine, SewingPlan, SheetInfo, SewingPlanEntry, StyleBlockRecord,
SmvMasterRecord, WorkingCalendarDay, EfficiencyProfile, LineSettingsRecord,
ValidationIssue, ImportSummary` — all in `src/lib/import/types.ts`.
`SewingPlanEntry` keeps `rawText`, `sourceSheet`, `sourceRow`, `sourceColumn`, so the
original cell is never destroyed.

## E. Validation model

CRITICAL: `INVALID_DATE, MISSING_LINE, INVALID_TARGET, INVALID_STYLE, INVALID_ORDER_QTY`.
WARNING: `AMBIGUOUS_PO, AMBIGUOUS_QUANTITY, UNRECOGNIZED_TEXT, UNPARSED_DELIVERY_DATE, UNKNOWN_ENTRY_TYPE`.
INFO: `MANUAL, VMI, LINE_SUPPORT, BALANCE`.

## F–H. Master data (`src/lib/master/master-data.ts`)

* SMV master: versioned by `effectiveDate`, status `SMV_FOUND / SMV_MISSING / SMV_INVALID`, `resolveSmv()` picks the record in force.
* Working calendar: every day starts as WORKING; `WORKING / HOLIDAY / WEEKLY_OFF / SPECIAL_WORKING_DAY` are set explicitly — no weekday is assumed to be a holiday.
* Efficiency profiles: `startEfficiency, maxEfficiency, rampMode, rampStep, customValues` (shape only, no ramp maths yet).
* `lineAvailableMinutes()` = manpower × hours × 60, resolved per line **and** per date. The 480 constant is documented reference logic only (`REFERENCE_FORMULAS` in `types.ts`), never hard-coded.

## I. Files created

`src/lib/import/types.ts`, `field-parsers.ts`, `parse-workbook.ts`, `validate.ts`,
`src/lib/master/master-data.ts`, `src/routes/import.tsx`, `scripts/parse-check.ts`.

## J. Files modified

`src/routes/index.tsx` (nav link only), `src/lib/plan/generate.ts` (At a Glance L1 fix), `roadmap.md`.

## K. Known parsing limitations

* Descriptive entries with no code (`FOTIS JACKET`, `New Classic`) yield `styleNo = null` and a `STYLE_NOT_IDENTIFIED` flag rather than a guess.
* Multiple quantities in one cell are stored separately and flagged AMBIGUOUS_QUANTITY, never summed.
* `DL:` without a year uses the planning context year; cross-year ranges are handled, but a genuinely ambiguous date is left raw.
* Merged/irregular banner rows inside a sheet are classified OTHER rather than dropped.

## L. Test results (actual uploaded workbook)

4 sheets, 12 lines, date range 2025-05-03 → 2026-12-31, 4,353 planning records,
269 styles, 301 POs, 4,244 targets, 40 style blocks from `Sheet1`.
0 critical errors, 243 warnings, 274 information notes, 4,054 parsed / 203 partial / 56 unparsed.
Entry types: STYLE 967, PO 1,505, OTHER 1,715 (carry-over days), INSTRUCTION 74, TOTAL_QTY 18, BALANCE 17, LINE_SUPPORT 17.
Verified end-to-end in the browser on `/import`.

**Stop point:** Phase 2 (capacity & planning engine) not started.
