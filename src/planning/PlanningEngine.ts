import type { ValidationIssue } from "@/lib/import/types";

import {
  applyScenarioCalendar,
  calendarForPeriod,
  datesInPeriod,
  hoursForLineDay,
  isProductive,
  statusForLine,
} from "./CalendarCalculator";
import {
  availableMinutes as availMin,
  capacityGap,
  dailyCapacity,
  earnedMinutes as earnedMin,
  efficiencyFromMinutes,
} from "./CapacityCalculator";
import { efficiencyForRampDay, toDecimal } from "./EfficiencyCalculator";
import { allocateDay, projectCompletion } from "./OrderAllocator";
import { buildStyleRuns, runIndexByDate } from "./StyleSequenceCalculator";
import { validatePlanning } from "./ValidationEngine";
import {
  BASE_SCENARIO,
  type DailyPlanRecord,
  type FactorySummary,
  type LinePlanSettings,
  type LineSummary,
  type OrderPlan,
  type PlanningInput,
  type PlanningResult,
  type Scenario,
  type ScenarioComparisonRow,
  type StyleRun,
} from "./types";

/* ------------------------- scenario application -------------------------- */

export function applyScenario(
  lines: LinePlanSettings[],
  scenario: Scenario,
): LinePlanSettings[] {
  const o = scenario.overrides;
  return lines.map((line) => {
    const per = o.lines?.[line.lineId];
    const ramp = {
      ...line.ramp,
      ...(o.rampMode ? { mode: o.rampMode } : {}),
      ...(o.startEfficiency !== undefined ? { startEfficiency: toDecimal(o.startEfficiency) } : {}),
      ...(o.maxEfficiency !== undefined ? { maxEfficiency: toDecimal(o.maxEfficiency) } : {}),
      ...(o.rampStep !== undefined ? { rampStep: toDecimal(o.rampStep) } : {}),
      ...(per?.ramp ?? {}),
    };
    return {
      ...line,
      ...(o.workingHours !== undefined ? { workingHours: o.workingHours } : {}),
      ...(o.manpower !== undefined ? { manpower: o.manpower } : {}),
      ...per,
      ramp,
    } as LinePlanSettings;
  });
}

/* ------------------------------ the engine ------------------------------- */

export function runPlanningEngine(input: PlanningInput): PlanningResult {
  const scenario = input.scenario ?? BASE_SCENARIO;
  const allowOverproduction =
    scenario.overrides.allowOverproduction ?? input.allowOverproduction ?? false;

  const lines = applyScenario(input.lineSettings, scenario).filter((l) => l.active);
  const dates = datesInPeriod(input.period);
  const baseHours = lines[0]?.workingHours ?? 8;
  const calendar = applyScenarioCalendar(
    calendarForPeriod(input.period, baseHours, input.calendar),
    scenario.overrides.calendar,
  );
  const calendarByDate = new Map(calendar.map((d) => [d.date, d]));

  const { runs, styleChanges } = buildStyleRuns(
    input.entries,
    lines,
    input.smvMaster,
    input.period,
    scenario.overrides.smv ?? {},
  );

  // required production (targets from the sewing plan) per line/date
  const requiredByKey = new Map<string, number>();
  for (const e of input.entries) {
    if (e.targetQty === null) continue;
    const key = `${e.lineId}|${e.date}`;
    requiredByKey.set(key, (requiredByKey.get(key) ?? 0) + e.targetQty);
  }

  const days: DailyPlanRecord[] = [];
  const orderState = new Map<
    string,
    { planned: number; start: string | null; end: string | null; lastRate: number }
  >();
  const changeDates = new Map<string, Set<string>>();
  for (const c of styleChanges) {
    const set = changeDates.get(c.lineId) ?? new Set<string>();
    set.add(c.date);
    changeDates.set(c.lineId, set);
  }

  for (const line of lines) {
    const runAt = runIndexByDate(runs, line.lineId);
    let rampDay = 0;
    let currentRunId: string | null = null;

    for (const date of dates) {
      const day = calendarByDate.get(date)!;
      const status = statusForLine(day, line);
      const run = runAt(date);
      const required = requiredByKey.get(`${line.lineId}|${date}`) ?? null;
      const hours = hoursForLineDay(day, line);
      const available = isProductive(status) ? availMin(hours, line.manpower) : 0;
      const styleChange = changeDates.get(line.lineId)?.has(date) ?? false;

      if (run && run.id !== currentRunId) {
        currentRunId = run.id;
        rampDay = 0;
      }

      const base = {
        planDayId: `${line.lineId}_${date}`,
        planId: input.planId,
        date,
        lineId: line.lineId,
        lineName: line.lineName,
        styleNo: run?.styleNo ?? null,
        poNo: run?.poNo ?? null,
        smv: run?.smv ?? null,
        workingHours: hours,
        manpower: line.manpower,
        requiredQty: required,
        styleChange,
      };

      if (!isProductive(status)) {
        days.push({
          ...base,
          efficiency: 0,
          availableMinutes: 0,
          effectiveMinutes: 0,
          dailyCapacity: 0,
          plannedQty: 0,
          cumulativeQty: orderState.get(run?.id ?? "")?.planned ?? 0,
          remainingQty: remainingOf(run, orderState),
          earnedMinutes: 0,
          capacityGap: required === null ? null : capacityGap(0, required),
          rampDay: 0,
          status:
            !line.active
              ? "LINE_OFF"
              : status === "WEEKLY_OFF"
                ? "WEEKLY_OFF"
                : "HOLIDAY",
        });
        continue;
      }

      // working day — the ramp advances only here
      rampDay += 1;
      const efficiency = efficiencyForRampDay(line.ramp, rampDay);

      if (!run || run.smvStatus !== "SMV_FOUND" || run.smv === null) {
        days.push({
          ...base,
          efficiency,
          availableMinutes: available,
          effectiveMinutes: available * efficiency,
          dailyCapacity: 0,
          plannedQty: 0,
          cumulativeQty: orderState.get(run?.id ?? "")?.planned ?? 0,
          remainingQty: remainingOf(run, orderState),
          earnedMinutes: 0,
          capacityGap: required === null ? null : capacityGap(0, required),
          rampDay,
          status: run ? "SMV_MISSING" : "IDLE",
        });
        continue;
      }

      const state =
        orderState.get(run.id) ?? { planned: 0, start: null, end: null, lastRate: 0 };
      const capacity = dailyCapacity(hours, line.manpower, efficiency, run.smv) ?? 0;
      const remainingBefore =
        run.orderQty === null ? null : Math.max(run.orderQty - state.planned, 0);
      const planned = allocateDay({
        capacity,
        remaining: remainingBefore,
        allowOverproduction,
      });

      state.planned += planned;
      state.lastRate = capacity;
      if (planned > 0) {
        if (!state.start) state.start = date;
        state.end = date;
      }
      orderState.set(run.id, state);

      const remainingAfter =
        run.orderQty === null ? null : Math.max(run.orderQty - state.planned, 0);

      days.push({
        ...base,
        efficiency,
        availableMinutes: available,
        effectiveMinutes: available * efficiency,
        dailyCapacity: capacity,
        plannedQty: planned,
        cumulativeQty: state.planned,
        remainingQty: remainingAfter,
        earnedMinutes: earnedMin(planned, run.smv),
        capacityGap: required === null ? null : capacityGap(capacity, required),
        rampDay,
        status: planned > 0 ? "PLANNED" : remainingAfter === 0 ? "ORDER_COMPLETE" : "IDLE",
      });
    }
  }

  /* ------------------------------- orders -------------------------------- */

  const orders: OrderPlan[] = runs.map((run) => {
    const state = orderState.get(run.id);
    const planned = state?.planned ?? 0;
    const remaining = run.orderQty === null ? null : Math.max(run.orderQty - planned, 0);
    const shortage = remaining ?? 0;

    let status: OrderPlan["status"];
    if (run.smvStatus !== "SMV_FOUND") status = "SMV_MISSING";
    else if (planned === 0) status = "NOT_STARTED";
    else if (run.orderQty === null) status = "IN_PROGRESS";
    else if (remaining === 0) status = "COMPLETED";
    else status = "CAPACITY_SHORTAGE";

    return {
      runId: run.id,
      lineId: run.lineId,
      lineName: run.lineName,
      styleNo: run.styleNo,
      poNo: run.poNo,
      orderQty: run.orderQty,
      smv: run.smv,
      plannedStartDate: state?.start ?? null,
      plannedEndDate: state?.end ?? null,
      plannedQty: planned,
      remainingQty: remaining,
      shortageQty: status === "CAPACITY_SHORTAGE" ? shortage : 0,
      projectedCompletionDate: null,
      status,
    };
  });

  // projected completion, using calendar days after the period at the last rate
  const afterDates = nextWorkingDates(input.period.to, 400);
  for (const order of orders) {
    if (order.status !== "CAPACITY_SHORTAGE") continue;
    const rate = orderState.get(order.runId)?.lastRate ?? 0;
    order.projectedCompletionDate = projectCompletion(
      order.shortageQty,
      rate,
      afterDates,
    ).date;
  }

  /* ------------------------------ summaries ------------------------------ */

  const lineSummaries: LineSummary[] = lines.map((line) => {
    const lineDays = days.filter((d) => d.lineId === line.lineId);
    const working = lineDays.filter((d) => d.availableMinutes > 0);
    const available = working.reduce((s, d) => s + d.availableMinutes, 0);
    const earned = lineDays.reduce((s, d) => s + d.earnedMinutes, 0);
    const capacity = lineDays.reduce((s, d) => s + d.dailyCapacity, 0);
    const planned = lineDays.reduce((s, d) => s + d.plannedQty, 0);
    const required = lineDays.reduce((s, d) => s + (d.requiredQty ?? 0), 0);
    return {
      lineId: line.lineId,
      lineName: line.lineName,
      active: line.active,
      workingDays: working.length,
      totalCapacity: capacity,
      totalPlanned: planned,
      totalRequired: required,
      availableMinutes: available,
      earnedMinutes: earned,
      efficiency: efficiencyFromMinutes(earned, available),
      capacityGap: capacity - required,
      styleChanges: styleChanges.filter((c) => c.lineId === line.lineId).length,
    };
  });

  const totalAvailable = lineSummaries.reduce((s, l) => s + l.availableMinutes, 0);
  const totalEarned = lineSummaries.reduce((s, l) => s + l.earnedMinutes, 0);
  const totalCapacity = lineSummaries.reduce((s, l) => s + l.totalCapacity, 0);
  const totalRequired = lineSummaries.reduce((s, l) => s + l.totalRequired, 0);
  const gap = totalCapacity - totalRequired;

  const factory: FactorySummary = {
    totalOrderQty: runs.reduce((s, r) => s + (r.orderQty ?? 0), 0),
    totalPlannedQty: lineSummaries.reduce((s, l) => s + l.totalPlanned, 0),
    totalCapacity,
    totalRequired,
    totalAvailableMinutes: totalAvailable,
    totalEarnedMinutes: totalEarned,
    averageEfficiency: efficiencyFromMinutes(totalEarned, totalAvailable),
    capacitySurplus: gap > 0 ? gap : 0,
    capacityShortage: gap < 0 ? -gap : 0,
    ordersCompleted: orders.filter((o) => o.status === "COMPLETED").length,
    ordersWithShortage: orders.filter((o) => o.status === "CAPACITY_SHORTAGE").length,
    styleChanges: styleChanges.length,
  };

  const issues: ValidationIssue[] = validatePlanning(runs, orders, days, lines);

  return {
    audit: {
      planId: input.planId,
      resultId: `${input.planId}_${scenario.id}_${input.period.from}_${input.period.to}`,
      generatedAt: new Date().toISOString(),
      period: input.period,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      sewingPlanSource: input.sources?.sewingPlan ?? null,
      smvSource: input.sources?.smv ?? null,
      calendarVersion: input.sources?.calendar ?? null,
      lineSettings: lines,
      allowOverproduction,
    },
    days,
    runs,
    orders,
    styleChanges,
    lineSummaries,
    factory,
    issues,
  };
}

function remainingOf(
  run: StyleRun | null,
  state: Map<string, { planned: number }>,
): number | null {
  if (!run || run.orderQty === null) return null;
  return Math.max(run.orderQty - (state.get(run.id)?.planned ?? 0), 0);
}

function nextWorkingDates(from: string, count: number): string[] {
  const out: string[] = [];
  const cur = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < count; i++) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    out.push(cur.toISOString().slice(0, 10));
  }
  return out;
}

/* --------------------------- scenario comparison ------------------------- */

export function compareScenarios(
  input: PlanningInput,
  scenarios: Scenario[],
): { results: PlanningResult[]; rows: ScenarioComparisonRow[] } {
  const results = scenarios.map((scenario) =>
    runPlanningEngine({ ...input, scenario }),
  );
  const rows: ScenarioComparisonRow[] = results.map((r) => ({
    scenarioId: r.audit.scenarioId,
    scenarioName: r.audit.scenarioName,
    totalCapacity: r.factory.totalCapacity,
    totalPlanned: r.factory.totalPlannedQty,
    capacityGap: r.factory.capacitySurplus - r.factory.capacityShortage,
    averageEfficiency: r.factory.averageEfficiency,
    lastPlannedDate:
      r.days
        .filter((d) => d.plannedQty > 0)
        .map((d) => d.date)
        .sort()
        .pop() ?? null,
    ordersCompleted: r.factory.ordersCompleted,
    ordersWithShortage: r.factory.ordersWithShortage,
  }));
  return { results, rows };
}

/* ------------------------------- memoisation ----------------------------- */

const cache = new Map<string, PlanningResult>();

/** Same inputs → same cached result; any configuration change busts the key. */
export function runPlanningEngineCached(input: PlanningInput): PlanningResult {
  const key = JSON.stringify({
    planId: input.planId,
    period: input.period,
    scenario: input.scenario?.id ?? "base",
    overrides: input.scenario?.overrides ?? {},
    allow: input.allowOverproduction ?? false,
    lines: input.lineSettings,
    smv: input.smvMaster.map((s) => [s.styleNo, s.smv, s.effectiveDate]),
    calendar: input.calendar.map((c) => [c.date, c.workingStatus, c.workingHours]),
    entries: input.entries.length,
  });
  const hit = cache.get(key);
  if (hit) return hit;
  const result = runPlanningEngine(input);
  if (cache.size > 12) cache.clear();
  cache.set(key, result);
  return result;
}
