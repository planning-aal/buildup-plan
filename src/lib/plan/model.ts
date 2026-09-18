import type { DayEntry, StyleSummary } from "./parse-rough-plan";

export const LINES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export type LineSetting = {
  line: number;
  hours: number;
  manpower: number;
  /** target efficiency at full run, 0-1 */
  efficiency: number;
};

export type PlanSettings = {
  month: string; // yyyy-mm
  lines: LineSetting[];
  /** efficiency on the first day of a new style, 0-1 */
  rampStart: number;
  /** days taken to reach the full target efficiency */
  rampDays: number;
  /** blank working days get this average target before ramp shaping */
  fillAverage: number;
  fillEmptyDays: boolean;
  /** exact monthly output to land on; 0 = keep计 calculated values */
  monthlyTarget: number;
  holidays: string[]; // yyyy-mm-dd
  roundTo: number;
};

export type SmvEntry = { style: string; smv: number };

export type PlannedCell = {
  line: number;
  date: string;
  style: string;
  smv: number;
  target: number;
  /** day index within the current style run, 1-based */
  runDay: number;
  isHoliday: boolean;
};

export const DEFAULT_LINE_SETTINGS: LineSetting[] = LINES.map((line) => ({
  line,
  hours: 8,
  manpower: line <= 3 ? 73 : 72,
  efficiency: 0.68,
}));

export function daysInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  const last = new Date(y!, m!, 0).getDate();
  for (let d = 1; d <= last; d++) {
    out.push(`${month}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

export function weekdayName(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { weekday: "long" });
}

/** Fridays of the month, used as the default holiday list. */
export function defaultHolidays(month: string): string[] {
  return daysInMonth(month).filter((d) => weekdayName(d) === "Friday");
}

function roundTo(value: number, step: number): number {
  if (step <= 1) return Math.round(value);
  return Math.round(value / step) * step;
}

export function normaliseStyleKey(style: string): string {
  return style.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function lookupSmv(
  style: string,
  smvMap: Map<string, number>,
  fallback: number,
): number {
  if (!style) return fallback;
  const key = normaliseStyleKey(style);
  const direct = smvMap.get(key);
  if (direct) return direct;
  for (const [k, v] of smvMap) {
    if (k.length >= 5 && (key.includes(k) || k.includes(key))) return v;
  }
  return fallback;
}

export type BuildInput = {
  entries: DayEntry[];
  styles: StyleSummary[];
  settings: PlanSettings;
  smv: SmvEntry[];
};

export type BuildResult = {
  cells: PlannedCell[];
  perLine: {
    line: number;
    total: number;
    avgEfficiency: number;
    avgSmv: number;
    workingDays: number;
  }[];
  grandTotal: number;
  avgEfficiency: number;
  unmatchedStyles: string[];
};

export function buildPlan(input: BuildInput): BuildResult {
  const { entries, settings, smv } = input;
  const dates = daysInMonth(settings.month);
  const holidays = new Set(settings.holidays);
  const smvMap = new Map<string, number>(
    smv.map((s) => [normaliseStyleKey(s.style), s.smv]),
  );

  // style running per line per day (carried forward)
  const source = new Map<string, DayEntry>();
  for (const e of entries) {
    if (e.date.startsWith(settings.month)) source.set(`${e.line}|${e.date}`, e);
  }

  const avgSmvByLine = new Map<number, number>();
  for (const line of LINES) {
    const values: number[] = [];
    for (const date of dates) {
      const style = source.get(`${line}|${date}`)?.style;
      if (!style) continue;
      const found = smvMap.get(normaliseStyleKey(style));
      if (found) values.push(found);
    }
    avgSmvByLine.set(
      line,
      values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
    );
  }
  const globalAvgSmv = (() => {
    const all = [...avgSmvByLine.values()].filter((v) => v > 0);
    return all.length ? all.reduce((a, b) => a + b, 0) / all.length : 22;
  })();

  const unmatched = new Set<string>();
  const cells: PlannedCell[] = [];

  for (const setting of settings.lines) {
    let currentStyle = "";
    let runDay = 0;
    for (const date of dates) {
      const entry = source.get(`${setting.line}|${date}`);
      const isHoliday = holidays.has(date);
      if (entry?.style) {
        currentStyle = entry.style;
        runDay = 0;
      }
      if (isHoliday) {
        cells.push({
          line: setting.line,
          date,
          style: entry?.style ?? "",
          smv: 0,
          target: 0,
          runDay: 0,
          isHoliday: true,
        });
        continue;
      }
      runDay += 1;

      const fallbackSmv =
        avgSmvByLine.get(setting.line) || globalAvgSmv;
      const styleForDay = currentStyle;
      let cellSmv = fallbackSmv;
      if (styleForDay) {
        const key = normaliseStyleKey(styleForDay);
        if (smvMap.has(key)) cellSmv = smvMap.get(key)!;
        else {
          cellSmv = lookupSmv(styleForDay, smvMap, fallbackSmv);
          if (cellSmv === fallbackSmv) unmatched.add(styleForDay);
        }
      }

      const rampFactor =
        settings.rampDays > 1 && runDay < settings.rampDays
          ? settings.rampStart +
            ((setting.efficiency - settings.rampStart) * (runDay - 1)) /
              (settings.rampDays - 1)
          : setting.efficiency;

      const sourceTarget = entry?.target ?? 0;
      let target = sourceTarget;
      if (!target && settings.fillEmptyDays && styleForDay) {
        const capacity =
          (setting.manpower * setting.hours * 60 * rampFactor) /
          Math.max(cellSmv, 1);
        target = Math.min(capacity, settings.fillAverage * (rampFactor / setting.efficiency || 1));
        if (!Number.isFinite(target) || target <= 0) target = settings.fillAverage;
      }

      cells.push({
        line: setting.line,
        date,
        style: entry?.style ?? "",
        smv: Number(cellSmv.toFixed(2)),
        target: roundTo(target, settings.roundTo),
        runDay,
        isHoliday: false,
      });
    }
  }

  // scale to the requested monthly output
  if (settings.monthlyTarget > 0) {
    const current = cells.reduce((sum, c) => sum + c.target, 0);
    if (current > 0) {
      const factor = settings.monthlyTarget / current;
      for (const c of cells) c.target = roundTo(c.target * factor, settings.roundTo);
      // nudge in round steps until exact
      let diff = settings.monthlyTarget - cells.reduce((s, c) => s + c.target, 0);
      const adjustable = cells.filter((c) => c.target > 0);
      let i = 0;
      while (Math.abs(diff) >= settings.roundTo && adjustable.length > 0) {
        const cell = adjustable[i % adjustable.length]!;
        const step = diff > 0 ? settings.roundTo : -settings.roundTo;
        if (cell.target + step > 0) {
          cell.target += step;
          diff -= step;
        }
        i++;
        if (i > adjustable.length * 50) break;
      }
    }
  }

  const perLine = settings.lines.map((setting) => {
    const lineCells = cells.filter((c) => c.line === setting.line);
    const working = lineCells.filter((c) => c.target > 0);
    const total = working.reduce((s, c) => s + c.target, 0);
    const availableMin = setting.manpower * setting.hours * 60;
    const effs = working.map((c) => (c.target * c.smv) / availableMin);
    const smvs = working.map((c) => c.smv).filter((v) => v > 0);
    return {
      line: setting.line,
      total,
      avgEfficiency: effs.length ? effs.reduce((a, b) => a + b, 0) / effs.length : 0,
      avgSmv: smvs.length ? smvs.reduce((a, b) => a + b, 0) / smvs.length : 0,
      workingDays: working.length,
    };
  });

  const grandTotal = perLine.reduce((s, l) => s + l.total, 0);
  const activeLines = perLine.filter((l) => l.total > 0);
  return {
    cells,
    perLine,
    grandTotal,
    avgEfficiency: activeLines.length
      ? activeLines.reduce((s, l) => s + l.avgEfficiency, 0) / activeLines.length
      : 0,
    unmatchedStyles: [...unmatched].sort(),
  };
}
