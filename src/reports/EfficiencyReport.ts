import type { ReportColumn, ReportContext, ReportRow, ReportTable } from "./types";

const COLUMNS: ReportColumn[] = [
  { key: "date", header: "Date", type: "date", width: 12 },
  { key: "line", header: "Line", type: "text", width: 11 },
  { key: "hours", header: "Working Hours", type: "hours", width: 12 },
  { key: "manpower", header: "Manpower", type: "int", width: 10 },
  { key: "smv", header: "SMV", type: "smv", width: 9 },
  { key: "availableMinutes", header: "Available Minutes", type: "minutes", width: 16 },
  { key: "earnedMinutes", header: "Earned Minutes", type: "minutes", width: 15 },
  { key: "efficiency", header: "Efficiency", type: "pct", width: 11 },
  { key: "rampDay", header: "Ramp Day", type: "int", width: 10 },
];

/** 09 Efficiency Analysis — earned ÷ available, per line and date. */
export function buildEfficiencyReport(ctx: ReportContext): ReportTable {
  const rows: ReportRow[] = ctx.result.days
    .filter((d) => d.availableMinutes > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.lineName.localeCompare(b.lineName, undefined, { numeric: true }))
    .map((d) => ({
      date: d.date,
      line: d.lineName,
      hours: d.workingHours,
      manpower: d.manpower,
      smv: d.smv,
      availableMinutes: d.availableMinutes,
      earnedMinutes: d.earnedMinutes,
      efficiency: d.efficiency,
      rampDay: d.rampDay || null,
    }));

  const first = ctx.lineSettings.find((l) => l.active) ?? ctx.lineSettings[0];
  const f = ctx.result.factory;

  return {
    id: "efficiency",
    sheetName: "09 Efficiency Analysis",
    title: "Efficiency Analysis",
    description: "Efficiency = earned minutes ÷ available minutes, at full precision",
    columns: COLUMNS,
    rows,
    freezeColumns: 2,
    landscape: true,
    keyValues: [
      { label: "Starting efficiency", value: first ? `${(first.ramp.startEfficiency * 100).toFixed(1)}%` : "—" },
      { label: "Maximum efficiency", value: first ? `${(first.ramp.maxEfficiency * 100).toFixed(1)}%` : "—" },
      {
        label: "Ramp-up",
        value: first
          ? first.ramp.mode === "NONE"
            ? "No ramp"
            : first.ramp.mode === "FIXED"
              ? `${(first.ramp.rampStep * 100).toFixed(1)}% per working day`
              : "Custom ramp"
          : "—",
      },
      { label: "Average efficiency (weighted)", value: `${(f.averageEfficiency * 100).toFixed(1)}%` },
      { label: "Total available minutes", value: Math.round(f.totalAvailableMinutes).toLocaleString() },
      { label: "Total earned minutes", value: Math.round(f.totalEarnedMinutes).toLocaleString() },
    ],
  };
}
