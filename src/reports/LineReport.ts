import type { ReportColumn, ReportContext, ReportRow, ReportTable } from "./types";

export const LINE_REPORT_COLUMNS: ReportColumn[] = [
  { key: "date", header: "Date", type: "date", width: 12 },
  { key: "day", header: "Day", type: "text", width: 10 },
  { key: "line", header: "Line", type: "text", width: 11 },
  { key: "style", header: "Style", type: "text", width: 16 },
  { key: "buyer", header: "Buyer", type: "text", width: 14 },
  { key: "po", header: "PO", type: "text", width: 14 },
  { key: "smv", header: "SMV", type: "smv", width: 9 },
  { key: "hours", header: "Working Hours", type: "hours", width: 12 },
  { key: "manpower", header: "Manpower", type: "int", width: 10 },
  { key: "efficiency", header: "Efficiency", type: "pct", width: 11 },
  { key: "availableMinutes", header: "Available Minutes", type: "minutes", width: 15 },
  { key: "effectiveMinutes", header: "Effective Minutes", type: "minutes", width: 15 },
  { key: "dailyCapacity", header: "Daily Capacity", type: "qty", width: 13 },
  { key: "plannedQty", header: "Planned Qty", type: "qty", width: 12 },
  { key: "cumulativeQty", header: "Cumulative Qty", type: "qty", width: 13 },
  { key: "remainingQty", header: "Remaining Qty", type: "qty", width: 13 },
  { key: "capacityGap", header: "Capacity Gap", type: "qty", width: 12 },
  { key: "styleChange", header: "Style Change", type: "text", width: 12 },
  { key: "status", header: "Status", type: "status", width: 15 },
];

const dayName = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });

/**
 * 03+ Line reports. Lines are grouped purely for presentation, in fixed-size
 * blocks, so 12 lines yield 1-4 / 5-8 / 9-12 and 16 lines yield a 13-16 sheet
 * with no code change.
 */
export function buildLineReports(ctx: ReportContext, groupSize = 4): ReportTable[] {
  const lines = [...ctx.lineSettings].sort((a, b) =>
    a.lineName.localeCompare(b.lineName, undefined, { numeric: true }),
  );
  const tables: ReportTable[] = [];

  for (let i = 0; i < lines.length; i += groupSize) {
    const group = lines.slice(i, i + groupSize);
    const ids = new Set(group.map((l) => l.lineId));
    const rows: ReportRow[] = ctx.result.days
      .filter((d) => ids.has(d.lineId))
      .sort((a, b) => a.date.localeCompare(b.date) || a.lineName.localeCompare(b.lineName, undefined, { numeric: true }))
      .map((d) => ({
        date: d.date,
        day: dayName(d.date),
        line: d.lineName,
        style: d.styleNo,
        buyer: d.styleNo ? ctx.buyerByStyle.get(d.styleNo.toUpperCase()) ?? null : null,
        po: d.poNo,
        smv: d.smv,
        hours: d.workingHours,
        manpower: d.manpower,
        efficiency: d.efficiency,
        availableMinutes: d.availableMinutes,
        effectiveMinutes: d.effectiveMinutes,
        dailyCapacity: d.dailyCapacity,
        plannedQty: d.plannedQty,
        cumulativeQty: d.cumulativeQty,
        remainingQty: d.remainingQty,
        capacityGap: d.capacityGap,
        styleChange: d.styleChange ? "YES" : "",
        status: d.status,
      }));

    const first = group[0]?.lineName ?? `${i + 1}`;
    const last = group[group.length - 1]?.lineName ?? first;
    const sheetIndex = String(3 + tables.length).padStart(2, "0");
    const label = group.length === 1 ? first : `${first} – ${last}`;

    tables.push({
      id: `line-group-${i / groupSize + 1}`,
      sheetName: `${sheetIndex} ${shorten(label)}`,
      title: `Line plan — ${label}`,
      description: "Daily buildup for each line in this group",
      columns: LINE_REPORT_COLUMNS,
      rows,
      freezeColumns: 3,
      landscape: true,
    });
  }

  return tables;
}

/** Excel sheet names are limited to 31 characters. */
function shorten(label: string) {
  const compact = label.replace(/LINE-?/gi, "L").replace(/\s+/g, " ").trim();
  return compact.length > 26 ? compact.slice(0, 26) : compact;
}
