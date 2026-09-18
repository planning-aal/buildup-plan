/**
 * Master-data architecture for Phase 1: SMV master, working calendar and
 * efficiency profiles. These are storage/shape definitions plus small pure
 * helpers — the planning engine that consumes them arrives in Phase 2.
 */
import type {
  EfficiencyProfile,
  LineSettingsRecord,
  SmvMasterRecord,
  SmvStatus,
  WorkingCalendarDay,
  WorkingStatus,
} from "@/lib/import/types";

/* ------------------------------- SMV master ----------------------------- */

export function smvKey(styleNo: string): string {
  return styleNo.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function classifySmv(value: unknown): SmvStatus {
  if (value === null || value === undefined || value === "") return "SMV_MISSING";
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n > 500) return "SMV_INVALID";
  return "SMV_FOUND";
}

export function makeSmvRecord(input: {
  styleNo: string;
  buyer?: string | null;
  smv: unknown;
  effectiveDate?: string | null;
  source: string;
}): SmvMasterRecord {
  const status = classifySmv(input.smv);
  const value = status === "SMV_FOUND" ? Number(input.smv) : null;
  return {
    id: `smv_${smvKey(input.styleNo)}_${input.effectiveDate ?? "current"}`,
    styleNo: input.styleNo.trim(),
    buyer: input.buyer ?? null,
    smv: value,
    effectiveDate: input.effectiveDate ?? null,
    status,
    source: input.source,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Picks the record in force on a date; several SMV versions per style are
 * supported, so history is never overwritten.
 */
export function resolveSmv(
  styleNo: string,
  records: SmvMasterRecord[],
  onDate?: string,
): SmvMasterRecord | null {
  const key = smvKey(styleNo);
  const candidates = records
    .filter((r) => smvKey(r.styleNo) === key)
    .filter((r) => !onDate || !r.effectiveDate || r.effectiveDate <= onDate)
    .sort((a, b) => (a.effectiveDate ?? "").localeCompare(b.effectiveDate ?? ""));
  return candidates[candidates.length - 1] ?? null;
}

/* ----------------------------- working calendar ------------------------- */

export const DEFAULT_WORKING_HOURS = 8;

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function dayName(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" });
}

/**
 * Builds a calendar where every day is a working day. Weekly offs and
 * holidays are an explicit decision the factory makes — nothing is assumed.
 */
export function buildCalendar(
  from: string,
  to: string,
  overrides: Partial<Record<string, Partial<WorkingCalendarDay>>> = {},
  workingHours = DEFAULT_WORKING_HOURS,
): WorkingCalendarDay[] {
  return datesBetween(from, to).map((date) => {
    const base: WorkingCalendarDay = {
      date,
      day: dayName(date),
      workingStatus: "WORKING" as WorkingStatus,
      holidayType: null,
      holidayReason: null,
      workingHours,
    };
    return { ...base, ...(overrides[date] ?? {}) };
  });
}

export function markDays(
  calendar: WorkingCalendarDay[],
  dates: string[],
  status: WorkingStatus,
  reason?: string,
  type?: string,
): WorkingCalendarDay[] {
  const set = new Set(dates);
  return calendar.map((d) =>
    set.has(d.date)
      ? {
          ...d,
          workingStatus: status,
          holidayReason: reason ?? d.holidayReason,
          holidayType: type ?? d.holidayType,
        }
      : d,
  );
}

/* --------------------------- efficiency profiles ------------------------ */

export const DEFAULT_EFFICIENCY_PROFILE: EfficiencyProfile = {
  id: "eff_default",
  name: "Standard ramp-up",
  startEfficiency: 0.45,
  maxEfficiency: 0.68,
  rampMode: "LINEAR",
  rampStep: 0.05,
  customValues: {},
};

export function defaultLineSettings(lineId: string): LineSettingsRecord {
  return {
    lineId,
    manpower: 72,
    workingHours: DEFAULT_WORKING_HOURS,
    hoursByDate: {},
    efficiencyProfileId: DEFAULT_EFFICIENCY_PROFILE.id,
  };
}

/** Minutes available on one line on one date; never a hard-coded 480. */
export function lineAvailableMinutes(
  settings: LineSettingsRecord,
  date: string,
  calendarDay?: WorkingCalendarDay,
): number {
  if (calendarDay && calendarDay.workingStatus !== "WORKING" &&
      calendarDay.workingStatus !== "SPECIAL_WORKING_DAY") {
    return 0;
  }
  const hours =
    settings.hoursByDate[date] ?? calendarDay?.workingHours ?? settings.workingHours;
  return settings.manpower * hours * 60;
}
