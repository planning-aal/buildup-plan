import type { ReportColumn, ReportContext, ReportRow, ReportTable } from "./types";

const FACTORY_COLUMNS: ReportColumn[] = [
  { key: "scope", header: "Scope", type: "text", width: 14 },
  { key: "name", header: "Name", type: "text", width: 20 },
  { key: "required", header: "Required", type: "qty", width: 12 },
  { key: "capacity", header: "Capacity", type: "qty", width: 12 },
  { key: "planned", header: "Planned", type: "qty", width: 12 },
  { key: "surplus", header: "Surplus", type: "qty", width: 12 },
  { key: "shortage", header: "Shortage", type: "qty", width: 12 },
  { key: "utilisation", header: "Utilisation (Planned ÷ Capacity)", type: "pct", width: 24 },
  { key: "status", header: "Status", type: "status", width: 15 },
];

const DAILY_COLUMNS: ReportColumn[] = [
  { key: "date", header: "Date", type: "date", width: 12 },
  { key: "workingStatus", header: "Working Status", type: "text", width: 18 },
  { key: "activeLines", header: "Active Lines", type: "int", width: 11 },
  { key: "availableMinutes", header: "Available Minutes", type: "minutes", width: 16 },
  { key: "capacity", header: "Capacity", type: "qty", width: 12 },
  { key: "required", header: "Required Qty", type: "qty", width: 12 },
  { key: "planned", header: "Planned Qty", type: "qty", width: 12 },
  { key: "gap", header: "Capacity Gap", type: "qty", width: 12 },
  { key: "utilisation", header: "Utilisation (Planned ÷ Capacity)", type: "pct", width: 24 },
];

const gapStatus = (gap: number) => (gap > 0 ? "SURPLUS" : gap < 0 ? "SHORTAGE" : "ON_PLAN");

/**
 * 08 Capacity Analysis — factory, line, date and style scopes in one table.
 * Utilisation is explicitly planned production ÷ available capacity; it is not
 * efficiency and not production achievement.
 */
export function buildCapacityReport(ctx: ReportContext): ReportTable {
  const { result } = ctx;
  const rows: ReportRow[] = [];
  const f = result.factory;

  rows.push({
    scope: "FACTORY",
    name: ctx.factory,
    required: f.totalRequired,
    capacity: f.totalCapacity,
    planned: f.totalPlannedQty,
    surplus: f.capacitySurplus,
    shortage: f.capacityShortage,
    utilisation: f.totalCapacity > 0 ? f.totalPlannedQty / f.totalCapacity : 0,
    status: gapStatus(f.totalCapacity - f.totalRequired),
  });

  for (const line of result.lineSummaries) {
    const gap = line.totalCapacity - line.totalRequired;
    rows.push({
      scope: "LINE",
      name: line.lineName,
      required: line.totalRequired,
      capacity: line.totalCapacity,
      planned: line.totalPlanned,
      surplus: Math.max(0, gap),
      shortage: Math.max(0, -gap),
      utilisation: line.totalCapacity > 0 ? line.totalPlanned / line.totalCapacity : 0,
      status: gapStatus(gap),
    });
  }

  const byDate = new Map<string, { capacity: number; required: number; planned: number }>();
  for (const d of result.days) {
    const agg = byDate.get(d.date) ?? { capacity: 0, required: 0, planned: 0 };
    agg.capacity += d.dailyCapacity;
    agg.required += d.requiredQty ?? 0;
    agg.planned += d.plannedQty;
    byDate.set(d.date, agg);
  }
  for (const [date, agg] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const gap = agg.capacity - agg.required;
    rows.push({
      scope: "DATE",
      name: date,
      required: agg.required,
      capacity: agg.capacity,
      planned: agg.planned,
      surplus: Math.max(0, gap),
      shortage: Math.max(0, -gap),
      utilisation: agg.capacity > 0 ? agg.planned / agg.capacity : 0,
      status: gapStatus(gap),
    });
  }

  for (const order of result.orders) {
    const days = result.days.filter(
      (d) => d.lineId === order.lineId && d.styleNo === order.styleNo && d.poNo === order.poNo && d.plannedQty > 0,
    );
    const capacity = days.reduce((a, d) => a + d.dailyCapacity, 0);
    const required = order.orderQty ?? 0;
    const gap = capacity - required;
    rows.push({
      scope: "STYLE",
      name: `${order.styleNo ?? "—"} · ${order.poNo ?? "—"} · ${order.lineName}`,
      required,
      capacity,
      planned: order.plannedQty,
      surplus: Math.max(0, gap),
      shortage: Math.max(0, -gap),
      utilisation: capacity > 0 ? order.plannedQty / capacity : 0,
      status: gapStatus(gap),
    });
  }

  return {
    id: "capacity",
    sheetName: "08 Capacity Analysis",
    title: "Capacity Analysis",
    description:
      "Required, capacity, planned, surplus and shortage at factory, line, date and style level. Utilisation = planned ÷ capacity.",
    columns: FACTORY_COLUMNS,
    rows,
    freezeColumns: 2,
    landscape: true,
  };
}

/** Daily capacity table used by the preview charts and the capacity sheet. */
export function buildDailyCapacityTable(ctx: ReportContext): ReportTable {
  const { result, calendar } = ctx;
  const rows: ReportRow[] = calendar.map((day) => {
    const days = result.days.filter((d) => d.date === day.date);
    const capacity = days.reduce((a, d) => a + d.dailyCapacity, 0);
    const required = days.reduce((a, d) => a + (d.requiredQty ?? 0), 0);
    const planned = days.reduce((a, d) => a + d.plannedQty, 0);
    const availableMinutes = days.reduce((a, d) => a + d.availableMinutes, 0);
    const activeLines = new Set(days.filter((d) => d.availableMinutes > 0).map((d) => d.lineId)).size;
    return {
      date: day.date,
      workingStatus: day.workingStatus,
      activeLines,
      availableMinutes,
      capacity,
      required,
      planned,
      gap: capacity - required,
      utilisation: capacity > 0 ? planned / capacity : 0,
    };
  });

  return {
    id: "daily-capacity",
    sheetName: "08b Daily Capacity",
    title: "Daily Capacity",
    description: "Capacity, requirement and planned production for every date in the period",
    columns: DAILY_COLUMNS,
    rows,
    freezeColumns: 1,
    landscape: true,
  };
}
