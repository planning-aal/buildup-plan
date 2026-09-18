/**
 * Excel number formats, fonts and column sizing rules for the Armana
 * Production Buildup Plan workbook. Formatting only — no calculations.
 */
import type { Alignment, Borders, Fill, Font } from "exceljs";

import type { CellType, ReportColumn, ReportRow } from "@/reports/types";

export const FONT_NAME = "Arial";

export const NUMBER_FORMATS: Record<CellType, string | undefined> = {
  text: undefined,
  status: undefined,
  qty: "#,##0;(#,##0);-",
  int: "#,##0;(#,##0);-",
  minutes: "#,##0;(#,##0);-",
  smv: "0.00",
  hours: "0.0",
  pct: "0.0%",
  date: "dd-mmm-yyyy",
};

export const MAX_COLUMN_WIDTH = 42;
export const MIN_COLUMN_WIDTH = 8;

export const titleFont: Partial<Font> = { name: FONT_NAME, size: 14, bold: true, color: { argb: "FF10343B" } };
export const subtitleFont: Partial<Font> = { name: FONT_NAME, size: 9, color: { argb: "FF5B6B70" } };
export const headerFont: Partial<Font> = { name: FONT_NAME, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
export const bodyFont: Partial<Font> = { name: FONT_NAME, size: 10 };
export const totalFont: Partial<Font> = { name: FONT_NAME, size: 10, bold: true };

export const headerFill: Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF10343B" },
};

export const totalFill: Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEDF1F2" },
};

export const shortageFill: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE7E7" } };
export const surplusFill: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE9F6EC" } };
export const warningFill: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF6E0" } };
export const mutedFill: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F5" } };

export const thinBorder: Partial<Borders> = {
  top: { style: "hair", color: { argb: "FFC9D1D3" } },
  left: { style: "hair", color: { argb: "FFC9D1D3" } },
  bottom: { style: "hair", color: { argb: "FFC9D1D3" } },
  right: { style: "hair", color: { argb: "FFC9D1D3" } },
};

export const rightAlign: Partial<Alignment> = { horizontal: "right", vertical: "middle" };
export const leftAlign: Partial<Alignment> = { horizontal: "left", vertical: "middle" };
export const wrapAlign: Partial<Alignment> = { horizontal: "left", vertical: "middle", wrapText: true };

export function isNumericType(type: CellType): boolean {
  return type === "qty" || type === "int" || type === "minutes" || type === "smv" || type === "hours" || type === "pct";
}

/** Status text used in Excel — always written as words, colour is only a hint. */
export function statusLabel(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  return String(value).replace(/_/g, " ").toUpperCase();
}

/** Row background hint by status, used together with the text label. */
export function statusFill(status: string): Fill | null {
  const s = status.toUpperCase();
  if (s.includes("SHORTAGE")) return shortageFill;
  if (s.includes("SURPLUS")) return surplusFill;
  if (s.includes("SMV") || s.includes("VALIDATION")) return warningFill;
  if (s.includes("HOLIDAY") || s.includes("WEEKLY") || s.includes("OFF") || s === "IDLE") return mutedFill;
  if (s.includes("COMPLETE")) return surplusFill;
  return null;
}

/** Content-aware width, clamped so a long raw text field cannot blow the sheet up. */
export function columnWidth(column: ReportColumn, rows: ReportRow[]): number {
  if (column.width) return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, column.width));
  let longest = column.header.length;
  for (let i = 0; i < rows.length && i < 500; i += 1) {
    const value = rows[i]?.[column.key];
    if (value === null || value === undefined) continue;
    longest = Math.max(longest, String(value).length);
  }
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, longest + 2));
}

/** Converts an ISO date string to a Date so Excel stores a real date value. */
export function excelDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}
