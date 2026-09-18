/**
 * Orchestrator for the Production Buildup Plan report set.
 *
 * Input: the Phase 2 planning engine result plus the inputs that produced it.
 * Output: a report dataset. No number in here is recalculated from scratch —
 * everything is a projection, aggregation or relabelling of engine output.
 */
import type { ImportResult, SmvMasterRecord, WorkingCalendarDay } from "@/lib/import/types";
import type { LinePlanSettings, PlanningPeriod, PlanningResult } from "@/planning/types";

import { buildAssumptionsReport } from "./AssumptionsReport";
import { buildAtAGlanceReport } from "./AtAGlanceReport";
import { buildCalendarReport } from "./CalendarReport";
import { buildCapacityReport, buildDailyCapacityTable } from "./CapacityReport";
import { buildDailyPlanReport } from "./DailyPlanReport";
import { buildEfficiencyReport } from "./EfficiencyReport";
import { buildLineReports } from "./LineReport";
import { buildSmvExceptionReport, reportBlockers } from "./SMVExceptionReport";
import { buildStyleMixReport } from "./StyleMixReport";
import { buildSummaryReport } from "./SummaryReport";
import type { ProductionBuildupReport, ReportContext, ReportMeta, ReportStatus } from "./types";

export type BuildReportOptions = {
  result: PlanningResult;
  imported: ImportResult | null;
  calendar: WorkingCalendarDay[];
  lineSettings: LinePlanSettings[];
  smvMaster: SmvMasterRecord[];
  period: PlanningPeriod;
  factory?: string;
  /** presentation grouping for the line sheets; 12 lines → 1-4 / 5-8 / 9-12 */
  lineGroupSize?: number;
  sequence?: number;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function periodTitle(period: PlanningPeriod): string {
  const d = new Date(`${period.from}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function makeReportId(period: PlanningPeriod, sequence = 1): string {
  const d = new Date(`${period.from}T00:00:00Z`);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `PBP-${d.getUTCFullYear()}-${mm}-${String(sequence).padStart(4, "0")}`;
}

export function reportFileName(period: PlanningPeriod, scenarioName: string, scenarioId: string): string {
  const base = `Armana_Production_Buildup_Plan_${periodTitle(period).replace(/\s+/g, "_")}`;
  if (scenarioId === "base") return `${base}.xlsx`;
  return `${base}_${scenarioName.replace(/[^A-Za-z0-9]+/g, "_")}.xlsx`;
}

function buildContext(options: BuildReportOptions): ReportContext {
  const buyerByStyle = new Map<string, string>();
  const secondaryByStyle = new Map<string, string>();
  for (const entry of options.imported?.entries ?? []) {
    if (!entry.styleNo) continue;
    const key = entry.styleNo.toUpperCase();
    if (entry.buyer && !buyerByStyle.has(key)) buyerByStyle.set(key, entry.buyer);
    if (entry.secondaryCode && !secondaryByStyle.has(key)) secondaryByStyle.set(key, entry.secondaryCode);
  }
  for (const rec of options.smvMaster) {
    const key = rec.styleNo.toUpperCase();
    if (rec.buyer && !buyerByStyle.has(key)) buyerByStyle.set(key, rec.buyer);
  }

  return {
    result: options.result,
    calendar: options.calendar,
    lineSettings: options.lineSettings,
    smvMaster: options.smvMaster,
    period: options.period,
    periodLabel: periodTitle(options.period),
    factory: options.factory ?? "Armana Apparels Ltd",
    buyerByStyle,
    secondaryByStyle,
    reportId: makeReportId(options.period, options.sequence ?? 1),
    generatedAt: new Date().toISOString(),
  };
}

export function buildProductionBuildupReport(options: BuildReportOptions): ProductionBuildupReport {
  const ctx = buildContext(options);
  const { result } = options;

  const summary = buildSummaryReport(ctx);
  const atAGlance = buildAtAGlanceReport(ctx);
  const lineTables = buildLineReports(ctx, options.lineGroupSize ?? 4);
  const dailyPlan = buildDailyPlanReport(ctx);
  const styleMix = buildStyleMixReport(ctx);
  const capacity = buildCapacityReport(ctx);
  const dailyCapacity = buildDailyCapacityTable(ctx);
  const efficiency = buildEfficiencyReport(ctx);
  const calendar = buildCalendarReport(ctx);
  const smvExceptions = buildSmvExceptionReport(ctx);
  const assumptions = buildAssumptionsReport(ctx);

  const blockers = reportBlockers(ctx, smvExceptions);
  const status: ReportStatus = blockers.length ? "BLOCKED" : "GENERATED";

  const meta: ReportMeta = {
    reportId: ctx.reportId,
    planId: result.audit.planId,
    resultId: result.audit.resultId,
    generatedAt: ctx.generatedAt,
    period: options.period,
    periodLabel: ctx.periodLabel,
    factory: ctx.factory,
    scenarioId: result.audit.scenarioId,
    scenarioName: result.audit.scenarioName,
    sewingPlanSource: result.audit.sewingPlanSource,
    smvSource: result.audit.smvSource,
    calendarVersion: `${ctx.periodLabel} · ${options.calendar.length} days`,
    efficiencyProfile: efficiencyProfileLabel(options.lineSettings),
    status,
    fileName: reportFileName(options.period, result.audit.scenarioName, result.audit.scenarioId),
  };

  return {
    meta,
    blockers,
    snapshot: {
      reportId: meta.reportId,
      planId: meta.planId,
      resultId: meta.resultId,
      generatedAt: meta.generatedAt,
      period: options.period,
      scenarioId: meta.scenarioId,
      sewingPlanSource: meta.sewingPlanSource,
      smvSource: meta.smvSource,
      smvRecordCount: options.smvMaster.length,
      calendarVersion: meta.calendarVersion,
      lineSettings: options.lineSettings.map((l) => ({ ...l, ramp: { ...l.ramp } })),
      allowOverproduction: result.audit.allowOverproduction,
    },
    tables: [
      summary,
      atAGlance,
      ...lineTables,
      dailyPlan,
      styleMix,
      capacity,
      dailyCapacity,
      efficiency,
      calendar,
      smvExceptions,
      assumptions,
    ],
    totals: {
      totalOrderQty: result.factory.totalOrderQty,
      totalPlannedQty: result.factory.totalPlannedQty,
      totalCapacity: result.factory.totalCapacity,
      capacityGap: result.factory.totalCapacity - result.factory.totalRequired,
      averageEfficiency: result.factory.averageEfficiency,
    },
  };
}

function efficiencyProfileLabel(lines: LinePlanSettings[]): string {
  const active = lines.filter((l) => l.active);
  if (!active.length) return "—";
  const first = active[0]!.ramp;
  const uniform = active.every(
    (l) =>
      l.ramp.mode === first.mode &&
      l.ramp.startEfficiency === first.startEfficiency &&
      l.ramp.maxEfficiency === first.maxEfficiency &&
      l.ramp.rampStep === first.rampStep,
  );
  const base = `${(first.startEfficiency * 100).toFixed(0)}% → ${(first.maxEfficiency * 100).toFixed(0)}%${
    first.mode === "FIXED" ? ` @ ${(first.rampStep * 100).toFixed(0)}%/day` : first.mode === "NONE" ? " (no ramp)" : " (custom)"
  }`;
  return uniform ? base : `${base} (per-line overrides)`;
}
