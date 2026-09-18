import type { ReportColumn, ReportContext, ReportRow, ReportTable } from "./types";

const COLUMNS: ReportColumn[] = [
  { key: "line", header: "Line", type: "text", width: 12 },
  { key: "active", header: "Active", type: "text", width: 9 },
  { key: "hours", header: "Working Hours", type: "hours", width: 13 },
  { key: "manpower", header: "Manpower", type: "int", width: 10 },
  { key: "startEff", header: "Starting Efficiency", type: "pct", width: 16 },
  { key: "maxEff", header: "Maximum Efficiency", type: "pct", width: 16 },
  { key: "rampMode", header: "Ramp Mode", type: "text", width: 12 },
  { key: "rampStep", header: "Ramp Step", type: "pct", width: 11 },
  { key: "availableMinutes", header: "Available Minutes / Day", type: "minutes", width: 20 },
];

/** 12 Assumptions — every input used to produce this report. */
export function buildAssumptionsReport(ctx: ReportContext): ReportTable {
  const workingDays = ctx.calendar.filter(
    (d) => d.workingStatus === "WORKING" || d.workingStatus === "SPECIAL_WORKING_DAY",
  ).length;
  const active = ctx.lineSettings.filter((l) => l.active);
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

  const rows: ReportRow[] = ctx.lineSettings.map((l) => ({
    line: l.lineName,
    active: l.active ? "YES" : "NO",
    hours: l.workingHours,
    manpower: l.manpower,
    startEff: l.ramp.startEfficiency,
    maxEff: l.ramp.maxEfficiency,
    rampMode: l.ramp.mode,
    rampStep: l.ramp.mode === "FIXED" ? l.ramp.rampStep : null,
    availableMinutes: l.manpower * l.workingHours * 60,
  }));

  return {
    id: "assumptions",
    sheetName: "12 Assumptions",
    title: "Planning Assumptions",
    description: "The complete input set used to generate this report",
    columns: COLUMNS,
    rows,
    keyValues: [
      { label: "Factory", value: ctx.factory },
      { label: "Planning period", value: ctx.periodLabel },
      { label: "Period range", value: `${ctx.period.from} → ${ctx.period.to}` },
      { label: "Working days", value: String(workingDays) },
      { label: "Holidays / non-working days", value: String(ctx.calendar.length - workingDays) },
      { label: "Active lines", value: String(active.length) },
      { label: "Average working hours", value: avg(active.map((l) => l.workingHours)).toFixed(1) },
      { label: "Average manpower per line", value: Math.round(avg(active.map((l) => l.manpower))).toString() },
      {
        label: "Starting efficiency",
        value: `${(avg(active.map((l) => l.ramp.startEfficiency)) * 100).toFixed(1)}%`,
      },
      {
        label: "Maximum efficiency",
        value: `${(avg(active.map((l) => l.ramp.maxEfficiency)) * 100).toFixed(1)}%`,
      },
      {
        label: "Ramp-up",
        value: `${(avg(active.map((l) => (l.ramp.mode === "FIXED" ? l.ramp.rampStep : 0))) * 100).toFixed(1)}% per working day`,
      },
      { label: "Available minutes", value: "manpower × working hours × 60" },
      { label: "Capacity", value: "available minutes × efficiency ÷ SMV" },
      { label: "Sewing plan source", value: ctx.result.audit.sewingPlanSource ?? "—" },
      { label: "SMV source", value: ctx.result.audit.smvSource ?? `${ctx.smvMaster.length} SMV records` },
      { label: "Calendar", value: `${ctx.periodLabel} factory calendar` },
      { label: "Overproduction allowed", value: ctx.result.audit.allowOverproduction ? "YES" : "NO" },
      { label: "Scenario", value: ctx.result.audit.scenarioName },
      { label: "Generated", value: new Date(ctx.generatedAt).toLocaleString("en-GB") },
    ],
  };
}
