import type { ReportColumn, ReportContext, ReportRow, ReportTable } from "./types";

export const DAILY_PLAN_COLUMNS: ReportColumn[] = [
  { key: "date", header: "Date", type: "date", width: 12 },
  { key: "line", header: "Line", type: "text", width: 11 },
  { key: "style", header: "Style", type: "text", width: 16 },
  { key: "po", header: "PO", type: "text", width: 14 },
  { key: "smv", header: "SMV", type: "smv", width: 9 },
  { key: "efficiency", header: "Efficiency", type: "pct", width: 11 },
  { key: "hours", header: "Working Hours", type: "hours", width: 12 },
  { key: "manpower", header: "Manpower", type: "int", width: 10 },
  { key: "availableMinutes", header: "Available Minutes", type: "minutes", width: 15 },
  { key: "dailyCapacity", header: "Capacity", type: "qty", width: 11 },
  { key: "requiredQty", header: "Required Qty", type: "qty", width: 12 },
  { key: "plannedQty", header: "Planned Qty", type: "qty", width: 12 },
  { key: "cumulativeQty", header: "Cumulative Qty", type: "qty", width: 13 },
  { key: "remainingQty", header: "Remaining Qty", type: "qty", width: 13 },
  { key: "status", header: "Status", type: "status", width: 15 },
];

/** 06 Daily Production Plan — the operational buildup, sorted by date, line, style. */
export function buildDailyPlanReport(ctx: ReportContext): ReportTable {
  const rows: ReportRow[] = ctx.result.days
    .slice()
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.lineName.localeCompare(b.lineName, undefined, { numeric: true }) ||
        (a.styleNo ?? "").localeCompare(b.styleNo ?? ""),
    )
    .map((d) => ({
      date: d.date,
      line: d.lineName,
      style: d.styleNo,
      po: d.poNo,
      smv: d.smv,
      efficiency: d.efficiency,
      hours: d.workingHours,
      manpower: d.manpower,
      availableMinutes: d.availableMinutes,
      dailyCapacity: d.dailyCapacity,
      requiredQty: d.requiredQty,
      plannedQty: d.plannedQty,
      cumulativeQty: d.cumulativeQty,
      remainingQty: d.remainingQty,
      status: d.status,
    }));

  const sum = (key: keyof (typeof ctx.result.days)[number]) =>
    ctx.result.days.reduce((a, d) => a + (Number(d[key]) || 0), 0);

  return {
    id: "daily-plan",
    sheetName: "06 Daily Production Plan",
    title: "Daily Production Plan",
    description: "Every planned line-day in the planning period",
    columns: DAILY_PLAN_COLUMNS,
    rows,
    freezeColumns: 3,
    landscape: true,
    totals: {
      date: "TOTAL",
      availableMinutes: sum("availableMinutes"),
      dailyCapacity: sum("dailyCapacity"),
      plannedQty: sum("plannedQty"),
    },
  };
}
