import type { WorkingCalendarDay, WorkingStatus } from "@/lib/import/types";

import type { LinePlanSettings, PlanningPeriod, ScenarioOverrides } from "./types";

export function datesInPeriod(period: PlanningPeriod): string[] {
  const out: string[] = [];
  const cur = new Date(`${period.from}T00:00:00Z`);
  const end = new Date(`${period.to}T00:00:00Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function dayName(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
}

/** Builds an all-working calendar for a period; no weekday is assumed off. */
export function calendarForPeriod(
  period: PlanningPeriod,
  workingHours: number,
  existing: WorkingCalendarDay[] = [],
): WorkingCalendarDay[] {
  const byDate = new Map(existing.map((d) => [d.date, d]));
  return datesInPeriod(period).map(
    (date) =>
      byDate.get(date) ?? {
        date,
        day: dayName(date),
        workingStatus: "WORKING" as WorkingStatus,
        holidayType: null,
        holidayReason: null,
        workingHours,
      },
  );
}

export function applyScenarioCalendar(
  calendar: WorkingCalendarDay[],
  overrides: ScenarioOverrides["calendar"],
): WorkingCalendarDay[] {
  if (!overrides) return calendar;
  return calendar.map((d) =>
    overrides[d.date] ? { ...d, workingStatus: overrides[d.date]! } : d,
  );
}

export function isProductive(status: WorkingStatus): boolean {
  return status === "WORKING" || status === "SPECIAL_WORKING_DAY";
}

/** Factory status combined with a line-specific override. */
export function statusForLine(
  day: WorkingCalendarDay,
  line: LinePlanSettings,
): WorkingStatus {
  if (!line.active) return "HOLIDAY";
  return line.calendarOverrides?.[day.date] ?? day.workingStatus;
}

/** Hours in force for a line on a date: per-date override, then line, then factory. */
export function hoursForLineDay(day: WorkingCalendarDay, line: LinePlanSettings): number {
  return line.hoursByDate?.[day.date] ?? line.workingHours ?? day.workingHours;
}
