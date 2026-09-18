import type { ReportContext, ReportTable } from "./types";

/** 01 Summary — management view. Weighted efficiency, never an average of percentages. */
export function buildSummaryReport(ctx: ReportContext): ReportTable {
  const { result, calendar } = ctx;
  const f = result.factory;

  const workingDays = calendar.filter(
    (d) => d.workingStatus === "WORKING" || d.workingStatus === "SPECIAL_WORKING_DAY",
  ).length;
  const holidays = calendar.length - workingDays;

  const styles = new Set<string>();
  const pos = new Set<string>();
  for (const run of result.runs) {
    if (run.styleNo) styles.add(run.styleNo.toUpperCase());
    if (run.poNo) pos.add(`${run.styleNo ?? ""}|${run.poNo}`);
  }

  const smvValues = result.runs.map((r) => r.smv).filter((v): v is number => typeof v === "number" && v > 0);
  const avgSmv = smvValues.length ? smvValues.reduce((a, b) => a + b, 0) / smvValues.length : 0;

  const activeLines = ctx.lineSettings.filter((l) => l.active).length;
  const incomplete = result.orders.length - f.ordersCompleted;

  const rows = [
    ["Total lines", ctx.lineSettings.length, "int"],
    ["Active lines", activeLines, "int"],
    ["Working days", workingDays, "int"],
    ["Holidays / non-working days", holidays, "int"],
    ["Total styles", styles.size, "int"],
    ["Total POs", pos.size, "int"],
    ["Total order quantity", f.totalOrderQty, "qty"],
    ["Total planned quantity", f.totalPlannedQty, "qty"],
    ["Total capacity", f.totalCapacity, "qty"],
    ["Total requirement", f.totalRequired, "qty"],
    ["Capacity surplus", f.capacitySurplus, "qty"],
    ["Capacity shortage", f.capacityShortage, "qty"],
    ["Capacity gap (capacity − requirement)", f.totalCapacity - f.totalRequired, "qty"],
    ["Total available minutes", f.totalAvailableMinutes, "minutes"],
    ["Total earned minutes", f.totalEarnedMinutes, "minutes"],
    ["Average efficiency (weighted: earned ÷ available)", f.averageEfficiency, "pct"],
    ["Average SMV", avgSmv, "smv"],
    ["Completed orders", f.ordersCompleted, "int"],
    ["Incomplete orders", incomplete, "int"],
    ["Style changes", f.styleChanges, "int"],
  ] as const;

  return {
    id: "summary",
    sheetName: "01 Summary",
    title: "Production Buildup Plan — Summary",
    description: "Management summary of the generated production plan",
    columns: [
      { key: "metric", header: "Metric", type: "text", width: 46 },
      { key: "value", header: "Value", type: "text", width: 18 },
    ],
    keyValues: [
      { label: "Factory", value: ctx.factory },
      { label: "Planning period", value: ctx.periodLabel },
      { label: "Report ID", value: ctx.reportId },
      { label: "Plan ID", value: result.audit.planId },
      { label: "Scenario", value: result.audit.scenarioName },
      { label: "Generated", value: new Date(ctx.generatedAt).toLocaleString("en-GB") },
    ],
    rows: rows.map(([metric, value, type]) => ({
      metric,
      value,
      __type: type,
    })),
  };
}
