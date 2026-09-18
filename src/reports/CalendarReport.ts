import type { ReportColumn, ReportContext, ReportRow, ReportTable } from "./types";

const COLUMNS: ReportColumn[] = [
  { key: "date", header: "Date", type: "date", width: 12 },
  { key: "day", header: "Day", type: "text", width: 11 },
  { key: "status", header: "Status", type: "status", width: 18 },
  { key: "holidayType", header: "Holiday Type", type: "text", width: 14 },
  { key: "reason", header: "Reason", type: "text", width: 26, wrap: true },
  { key: "hours", header: "Working Hours", type: "hours", width: 12 },
  { key: "activeLines", header: "Active Lines", type: "int", width: 11 },
  { key: "capacity", header: "Capacity", type: "qty", width: 12 },
];

/** 10 Working Calendar — holiday capacity is whatever the engine produced (zero unless configured working). */
export function buildCalendarReport(ctx: ReportContext): ReportTable {
  const rows: ReportRow[] = ctx.calendar.map((day) => {
    const days = ctx.result.days.filter((d) => d.date === day.date);
    return {
      date: day.date,
      day: day.day,
      status: day.workingStatus,
      holidayType: day.holidayType,
      reason: day.holidayReason,
      hours: day.workingHours,
      activeLines: new Set(days.filter((d) => d.availableMinutes > 0).map((d) => d.lineId)).size,
      capacity: days.reduce((a, d) => a + d.dailyCapacity, 0),
    };
  });

  return {
    id: "calendar",
    sheetName: "10 Working Calendar",
    title: "Working Calendar",
    description: "Working, holiday, weekly off and special working days used by the plan",
    columns: COLUMNS,
    rows,
    freezeColumns: 1,
  };
}
