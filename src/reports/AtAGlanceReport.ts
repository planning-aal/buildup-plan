import type { ReportColumn, ReportContext, ReportRow, ReportTable } from "./types";

const COLUMNS: ReportColumn[] = [
  { key: "line", header: "Line", type: "text", width: 12 },
  { key: "style", header: "Current Style", type: "text", width: 16 },
  { key: "buyer", header: "Buyer", type: "text", width: 14 },
  { key: "po", header: "PO", type: "text", width: 14 },
  { key: "smv", header: "SMV", type: "smv", width: 9 },
  { key: "hours", header: "Working Hours", type: "hours", width: 12 },
  { key: "manpower", header: "Manpower", type: "int", width: 10 },
  { key: "efficiency", header: "Efficiency", type: "pct", width: 11 },
  { key: "dailyCapacity", header: "Daily Capacity", type: "qty", width: 13 },
  { key: "orderQty", header: "Order Qty", type: "qty", width: 12 },
  { key: "plannedQty", header: "Planned Qty", type: "qty", width: 12 },
  { key: "remainingQty", header: "Remaining Qty", type: "qty", width: 13 },
  { key: "startDate", header: "Start Date", type: "date", width: 12 },
  { key: "completionDate", header: "Completion Date", type: "date", width: 14 },
  { key: "capacityGap", header: "Capacity Gap", type: "qty", width: 12 },
  { key: "status", header: "Status", type: "status", width: 16 },
];

/** 02 At a Glance — one row per active line, showing the line's current run. */
export function buildAtAGlanceReport(ctx: ReportContext): ReportTable {
  const { result } = ctx;
  const rows: ReportRow[] = [];

  for (const line of ctx.lineSettings) {
    if (!line.active) continue;
    const summary = result.lineSummaries.find((s) => s.lineId === line.lineId);
    const lineDays = result.days.filter((d) => d.lineId === line.lineId && d.plannedQty > 0);
    const current = lineDays[0] ?? null;
    const order = current
      ? result.orders.find((o) => o.lineId === line.lineId && o.styleNo === current.styleNo) ?? null
      : (result.orders.find((o) => o.lineId === line.lineId) ?? null);

    const producing = lineDays.filter((d) => d.styleNo === (current?.styleNo ?? null));
    const avgCapacity = producing.length
      ? producing.reduce((a, d) => a + d.dailyCapacity, 0) / producing.length
      : 0;
    const avgEff = producing.length
      ? producing.reduce((a, d) => a + d.availableMinutes, 0) > 0
        ? producing.reduce((a, d) => a + d.earnedMinutes, 0) /
          producing.reduce((a, d) => a + d.availableMinutes, 0)
        : 0
      : (summary?.efficiency ?? 0);

    const styleKey = (current?.styleNo ?? order?.styleNo ?? "").toUpperCase();

    rows.push({
      line: line.lineName,
      style: current?.styleNo ?? order?.styleNo ?? null,
      buyer: ctx.buyerByStyle.get(styleKey) ?? null,
      po: current?.poNo ?? order?.poNo ?? null,
      smv: current?.smv ?? order?.smv ?? null,
      hours: line.workingHours,
      manpower: line.manpower,
      efficiency: avgEff,
      dailyCapacity: avgCapacity,
      orderQty: order?.orderQty ?? null,
      plannedQty: order?.plannedQty ?? 0,
      remainingQty: order?.remainingQty ?? null,
      startDate: order?.plannedStartDate ?? null,
      completionDate: order?.projectedCompletionDate ?? order?.plannedEndDate ?? null,
      capacityGap: summary?.capacityGap ?? null,
      status: order?.status ?? (summary && summary.capacityGap < 0 ? "SHORTAGE" : "ON_PLAN"),
    });
  }

  return {
    id: "at-a-glance",
    sheetName: "02 At a Glance",
    title: "At a Glance — current line status",
    description: "One row per active sewing line",
    columns: COLUMNS,
    rows,
    freezeColumns: 1,
    landscape: true,
  };
}
