# PHASE 2 — Production Planning & Capacity Calculation Engine

Phase 1 functionality (upload, parser, raw preservation, normalized entries, validation,
SMV/calendar/efficiency architecture, `/import` review screen) is untouched. No UI redesign.

## A. Calculation engine architecture

```
src/planning/
  types.ts                     contracts (settings, scenario, daily record, summaries, audit)
  CapacityCalculator.ts        minutes, capacity, earned minutes, efficiency, gap, formatting
  CalendarCalculator.ts        period dates, calendar build, productivity, per-line overrides, hours resolution
  EfficiencyCalculator.ts      NONE / FIXED / CUSTOM ramp on working-day index
  StyleSequenceCalculator.ts   style runs per line from Phase 1 entries + SMV resolution
  OrderAllocator.ts            daily allocation with remaining cap, completion projection
  ValidationEngine.ts          CRITICAL / WARNING / INFO planning issues
  PlanningEngine.ts            orchestration, scenarios, comparison, memoized runs
  index.ts                     public surface
  __tests__/engine.test.ts     unit tests
```

UI components never calculate; `src/routes/planning.tsx` only collects inputs and renders
`PlanningResult`.

## B. Calculation formulas (all configurable, nothing hard-codes 480)

- Available minutes = working hours x 60 x manpower
- Effective minutes = available minutes x efficiency
- Daily capacity = effective minutes / SMV  (null when SMV missing/invalid)
- Earned minutes = planned quantity x SMV
- Efficiency = earned minutes / available minutes
- Capacity gap = capacity - required production (negative = shortage, shown, never hidden)
- Factory efficiency = total earned minutes / total available minutes (weighted, not an average of percentages)

## C. Data flow

Excel -> Phase 1 parser -> normalized entries -> PlanningInput
(entries + SMV master + line settings + calendar + period + scenario)
-> PlanningEngine -> { days, runs, orders, styleChanges, lineSummaries, factory, issues, audit }
-> UI / future Excel export.

## D. Planning algorithm

For each active line, for each date in the period:
1. Resolve day status (factory calendar, then line override; inactive line = no capacity).
2. Resolve working hours (per-date override > per-line > factory day).
3. Resolve the active style run (last style carries forward until the plan changes it).
4. Non-productive day -> capacity 0, ramp day not advanced (a holiday never consumes a ramp step).
5. Productive day -> ramp day +1, efficiency from the ramp profile (reset on style change).
6. SMV resolved from the SMV master by effective date; missing/invalid -> status SMV_MISSING, no capacity.
7. Planned quantity = min(capacity, remaining order quantity) unless overproduction is enabled (default OFF).
8. Track cumulative / remaining / earned minutes / capacity gap / style change per record.

## E. Scenario architecture

`Scenario.overrides` may set working hours, manpower, efficiency start/max/step/mode,
calendar statuses, line availability and SMV values. Each scenario runs the engine on a
cloned input; the base plan is never mutated. `compareScenarios` returns capacity, planned,
gap, efficiency, last planned day, orders completed and orders short — with no "best" label.

## F. Unit test results (`bunx vitest run -c vitest.config.ts`)

10 passed / 10, including all seven required cases:

| Test | Expectation | Result |
|---|---|---|
| 1 | 8h, 40 MP, 70%, SMV 20 -> 672 pcs | pass |
| 2 | 50/55/60 ramp, holiday in between does not consume a step | pass |
| 3 | Order 850 vs capacity 1,200 -> planned 850 | pass |
| 4 | Missing SMV -> SMV_MISSING, no capacity | pass |
| 5 | 24 working days + 1 holiday -> holiday capacity 0 | pass |
| 6 | Line 1 = 8h vs Line 2 = 9h -> capacities differ (672 vs 756) | pass |
| 7 | Base unchanged after a 75% scenario | pass |
| + | Determinism (identical inputs, identical output) | pass |
| + | SMV effective date picks the September value | pass |

## G. Reference Excel comparison (`bun scripts/reference-check.ts`)

Against `01_Production Buildup Plan Jan 2026.xlsx`:

- 312 daily efficiency cells compared, **296 reproduce exactly** with hours = 8.
- 16 cells differ by exactly the ratio 480/600 — those workbook cells still divide by 600
  (a 10-hour assumption left in the file), so the workbook itself is internally inconsistent;
  the engine reproduces the business logic, not the stale cells.
- Total target 320,650 pcs, earned 6,976,910 min, available 10,932,480 min,
  weighted efficiency 63.82%.

## H. Live validation (real workbook `update sewing plan`, Jan 2026 period, 45-style SMV list)

Total capacity 134,462 / planned 132,114 / available minutes 13,034,880 /
earned 2,887,374 / factory efficiency 22.15% / shortage 144,738.
Styles with no SMV produce no capacity by design (361 issues listed, mostly SMV_MISSING),
which is why lines with unmatched styles show zero. Scenario run: base 134,462,
efficiency 75% -> 129,974, 9-hour day -> 151,270; base row unchanged.

## I. Files created

- `src/planning/*` (9 modules) and `src/planning/__tests__/engine.test.ts`
- `src/routes/planning.tsx` — planning workspace (settings, calendar, results, daily plan, style buildup, scenarios)
- `scripts/reference-check.ts`, `vitest.config.ts`, `PHASE2_REPORT.md`

## J. Files modified

- `src/routes/index.tsx` — link to the planning workspace
- `roadmap.md`

## K. Known limitations

- Style/PO matching depends on the Phase 1 parse; styles the workbook writes as free text
  ("ROCKET", "CH SLIM") only get capacity once an SMV exists for that exact name.
- Line reallocation of shortage orders is not implemented (explicitly out of scope).
- Changeover minutes are recorded as style-change events but do not consume minutes yet.
- Custom ramp values are stored per line but have no dedicated editor in this phase.
- Production Buildup Plan Excel export still uses the existing Phase 0 generator; wiring the
  engine output into the export is Phase 3 work.

Phase 2 complete — stopping for approval before PHASE 3 (Armana Group UI/UX).
