import type { ReportColumn, ReportContext, ReportRow, ReportTable } from "./types";

const COLUMNS: ReportColumn[] = [
  { key: "style", header: "Style", type: "text", width: 16 },
  { key: "secondary", header: "Secondary Code", type: "text", width: 15 },
  { key: "buyer", header: "Buyer", type: "text", width: 14 },
  { key: "po", header: "PO", type: "text", width: 14 },
  { key: "line", header: "Line", type: "text", width: 11 },
  { key: "smv", header: "SMV", type: "smv", width: 9 },
  { key: "orderQty", header: "Order Qty", type: "qty", width: 12 },
  { key: "plannedQty", header: "Planned Qty", type: "qty", width: 12 },
  { key: "remainingQty", header: "Remaining Qty", type: "qty", width: 13 },
  { key: "startDate", header: "Start Date", type: "date", width: 12 },
  { key: "endDate", header: "End Date", type: "date", width: 12 },
  { key: "workingDays", header: "Working Days", type: "int", width: 12 },
  { key: "efficiency", header: "Average Efficiency", type: "pct", width: 15 },
  { key: "capacity", header: "Capacity", type: "qty", width: 12 },
  { key: "status", header: "Status", type: "status", width: 17 },
];

/**
 * 07 Style / Product Mix. Grouped by style + PO + line so that two different
 * POs of the same style are never merged into one row.
 */
export function buildStyleMixReport(ctx: ReportContext): ReportTable {
  const rows: ReportRow[] = ctx.result.orders
    .slice()
    .sort(
      (a, b) =>
        (a.styleNo ?? "").localeCompare(b.styleNo ?? "") ||
        (a.poNo ?? "").localeCompare(b.poNo ?? "") ||
        a.lineName.localeCompare(b.lineName, undefined, { numeric: true }),
    )
    .map((order) => {
      const days = ctx.result.days.filter(
        (d) => d.lineId === order.lineId && d.styleNo === order.styleNo && d.poNo === order.poNo && d.plannedQty > 0,
      );
      const available = days.reduce((a, d) => a + d.availableMinutes, 0);
      const earned = days.reduce((a, d) => a + d.earnedMinutes, 0);
      const key = (order.styleNo ?? "").toUpperCase();
      const run = ctx.result.runs.find((r) => r.id === order.runId);

      return {
        style: order.styleNo,
        secondary: run?.secondaryCode ?? ctx.secondaryByStyle.get(key) ?? null,
        buyer: run?.buyer ?? ctx.buyerByStyle.get(key) ?? null,
        po: order.poNo,
        line: order.lineName,
        smv: order.smv,
        orderQty: order.orderQty,
        plannedQty: order.plannedQty,
        remainingQty: order.remainingQty,
        startDate: order.plannedStartDate,
        endDate: order.plannedEndDate,
        workingDays: days.length,
        efficiency: available > 0 ? earned / available : 0,
        capacity: days.reduce((a, d) => a + d.dailyCapacity, 0),
        status: order.status,
      };
    });

  return {
    id: "style-mix",
    sheetName: "07 Style Product Mix",
    title: "Style / Product Mix",
    description: "One row per style, PO and line combination",
    columns: COLUMNS,
    rows,
    freezeColumns: 2,
    landscape: true,
    totals: {
      style: "TOTAL",
      orderQty: rows.reduce((a, r) => a + (Number(r["orderQty"]) || 0), 0),
      plannedQty: rows.reduce((a, r) => a + (Number(r["plannedQty"]) || 0), 0),
      capacity: rows.reduce((a, r) => a + (Number(r["capacity"]) || 0), 0),
    },
  };
}
