import * as XLSX from "xlsx";

import { extractQty, isContinuationRow, parseStyleText } from "./style-parse";

export type DayEntry = {
  line: number;
  /** yyyy-mm-dd */
  date: string;
  styleRaw: string;
  /** cleaned style code, empty when the row only continues the style above */
  style: string;
  merchant: string;
  buyer: string;
  target: number;
};

export type StyleSummary = {
  line: number;
  style: string;
  merchant: string;
  buyer: string;
  /** order quantity read from the P.O / QTY rows */
  orderQty: number;
  days: number;
  plannedQty: number;
};

export type RoughPlan = {
  fileName: string;
  entries: DayEntry[];
  months: string[];
  /** Month with the most planned work — the one we open by default. */
  primaryMonth: string;
  warnings: string[];
};


const SHEET_LINES: Record<string, number[]> = {
  "line 1-4": [1, 2, 3, 4],
  "line 5-8": [5, 6, 7, 8],
  "line 9-12": [9, 10, 11, 12],
};

function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  return null;
}

function numberOf(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[,\s]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function parseRoughPlan(buffer: ArrayBuffer, fileName: string): RoughPlan {
  const wb = XLSX.read(buffer, { cellDates: true });
  const entries: DayEntry[] = [];
  const warnings: string[] = [];
  const months = new Set<string>();

  for (const sheetName of wb.SheetNames) {
    const key = sheetName.trim().toLowerCase().replace(/\s+/g, " ");
    const lines = SHEET_LINES[key];
    if (!lines) continue;
    const sheet = wb.Sheets[sheetName]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      blankrows: true,
    });

    for (const row of rows) {
      const date = toIsoDate(row?.[0]);
      if (!date) continue;
      months.add(date.slice(0, 7));
      lines.forEach((line, slot) => {
        const styleCol = 2 + slot * 2;
        const targetCol = styleCol + 1;
        const styleRaw = String(row[styleCol] ?? "").trim();
        const target = numberOf(row[targetCol]);
        if (!styleRaw && !target) return;
        const parsed = styleRaw ? parseStyleText(styleRaw) : null;
        entries.push({
          line,
          date,
          styleRaw,
          style: parsed?.style ?? "",
          merchant: parsed?.merchant ?? "",
          buyer: parsed?.buyer ?? "",
          target,
        });
      });
    }
  }

  if (entries.length === 0) {
    warnings.push(
      "No line sheets recognised. Expected sheets named Line 1-4, Line 5-8 and Line 9-12.",
    );
  }

  entries.sort((a, b) => a.line - b.line || a.date.localeCompare(b.date));

  // Count real planned work per month so thin trailing months (a few stray
  // rows at the end of the sheet) never become the default selection.
  const weight = new Map<string, number>();
  for (const e of entries) {
    const key = e.date.slice(0, 7);
    const score = (e.style ? 1 : 0) + (e.target > 0 ? 1 : 0);
    weight.set(key, (weight.get(key) ?? 0) + score);
  }
  const monthList = [...months].sort();
  const primaryMonth =
    [...weight.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
    monthList[monthList.length - 1] ??
    new Date().toISOString().slice(0, 7);

  return {
    fileName,
    entries,
    months: monthList.filter((m) => (weight.get(m) ?? 0) >= 5),
    primaryMonth,
    warnings,
  };
}


/** Rolls the daily rows of one month into one row per style, per line. */
export function summariseStyles(
  entries: DayEntry[],
  month: string,
): StyleSummary[] {
  const inMonth = entries.filter((e) => e.date.startsWith(month));
  const byLine = new Map<number, DayEntry[]>();
  for (const e of inMonth) {
    const list = byLine.get(e.line) ?? [];
    list.push(e);
    byLine.set(e.line, list);
  }

  const out: StyleSummary[] = [];
  for (const [line, list] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    let current: StyleSummary | null = null;
    for (const e of list) {
      if (e.style) {
        current = {
          line,
          style: e.style,
          merchant: e.merchant,
          buyer: e.buyer,
          orderQty: 0,
          days: 0,
          plannedQty: 0,
        };
        out.push(current);
      }
      if (current) {
        if (e.styleRaw && isContinuationRow(e.styleRaw)) {
          current.orderQty += extractQty(e.styleRaw);
        }
        if (e.target > 0) {
          current.days += 1;
          current.plannedQty += e.target;
        }
      }
    }
  }
  return out;
}

/** The style running on each line on each day, carrying the last style forward. */
export function styleByDay(
  entries: DayEntry[],
  month: string,
): Map<string, string> {
  const map = new Map<string, string>();
  const byLine = new Map<number, DayEntry[]>();
  for (const e of entries.filter((x) => x.date.startsWith(month))) {
    const list = byLine.get(e.line) ?? [];
    list.push(e);
    byLine.set(e.line, list);
  }
  for (const [line, list] of byLine) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    for (const e of list) {
      if (e.style) map.set(`${line}|${e.date}`, e.style);
    }
  }
  return map;
}
