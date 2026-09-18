/**
 * Export orchestration: report dataset → XLSX bytes → validated download.
 *
 * Single source of truth rule: this module compares the workbook it produced
 * against the planning-engine totals carried on the report. If they disagree,
 * the file is never presented as successfully generated.
 */
import ExcelJS from "exceljs";

import logoUrl from "@/assets/armana-logo.png";
import type { ProductionBuildupReport, ReportTable } from "@/reports/types";

import { buildWorkbook } from "./WorkbookBuilder";

export type ExportStage =
  | "PREPARING"
  | "BUILDING"
  | "FORMATTING"
  | "VALIDATING"
  | "DOWNLOADING"
  | "DONE"
  | "FAILED";

export const STAGE_MESSAGE: Record<ExportStage, string> = {
  PREPARING: "Preparing Production Buildup Plan…",
  BUILDING: "Building report sheets…",
  FORMATTING: "Formatting workbook…",
  VALIDATING: "Validating exported workbook…",
  DOWNLOADING: "Starting download…",
  DONE: "Production Buildup Plan generated successfully.",
  FAILED: "Production Buildup Plan could not be generated.",
};

export type ExportValidation = {
  ok: boolean;
  sheetCount: number;
  sheets: string[];
  rowCounts: Record<string, number>;
  problems: string[];
};

export type ExportOutcome = {
  ok: boolean;
  fileName: string;
  blob: Blob | null;
  validation: ExportValidation;
};

const QTY_TOLERANCE = 1;
const PCT_TOLERANCE = 0.0005;

async function loadLogo(): Promise<{ data: ArrayBuffer; width: number; height: number } | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const data = await res.arrayBuffer();
    const size = await naturalSize(logoUrl);
    return { data, width: size.width, height: size.height };
  } catch {
    return null;
  }
}

function naturalSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") return resolve({ width: 512, height: 128 });
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 512, height: img.naturalHeight || 128 });
    img.onerror = () => resolve({ width: 512, height: 128 });
    img.src = url;
  });
}

export async function generateWorkbookBlob(
  report: ProductionBuildupReport,
  onStage?: (stage: ExportStage) => void,
): Promise<{ blob: Blob; buffer: ArrayBuffer }> {
  onStage?.("BUILDING");
  const logo = await loadLogo();
  const wb = buildWorkbook({ report, logo });
  onStage?.("FORMATTING");
  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return { blob, buffer };
}

/** Re-opens the produced workbook and checks structure and the critical totals. */
export async function validateWorkbook(
  buffer: ArrayBuffer,
  report: ProductionBuildupReport,
): Promise<ExportValidation> {
  const problems: string[] = [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const sheets = wb.worksheets.map((s) => s.name);
  const rowCounts: Record<string, number> = {};

  if (!sheets.length) problems.push("The workbook contains no sheets.");

  for (const table of report.tables) {
    const sheet = wb.worksheets.find((s) => s.name.startsWith(table.sheetName.slice(0, 20)));
    if (!sheet) {
      problems.push(`Missing sheet: ${table.sheetName}`);
      continue;
    }
    const headerRow = findHeaderRow(sheet, table);
    if (!headerRow) {
      problems.push(`Header row not found on sheet ${table.sheetName}`);
      continue;
    }
    const dataRows = countDataRows(sheet, headerRow, table);
    rowCounts[table.sheetName] = dataRows;
    if (dataRows !== table.rows.length) {
      problems.push(
        `Row count mismatch on ${table.sheetName}: workbook ${dataRows}, report ${table.rows.length}`,
      );
    }
  }

  // Critical totals must equal the planning-engine values.
  const summary = report.tables.find((t) => t.id === "summary");
  if (summary) {
    const check = (metric: string, expected: number, tolerance: number) => {
      const row = summary.rows.find((r) => String(r["metric"]).toLowerCase() === metric.toLowerCase());
      if (!row) {
        problems.push(`Summary is missing "${metric}"`);
        return;
      }
      const actual = Number(row["value"]);
      if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
        problems.push(`${metric} mismatch: report ${actual}, engine ${expected}`);
      }
    };
    check("Total Order Quantity", report.totals.totalOrderQty, QTY_TOLERANCE);
    check("Total Planned Quantity", report.totals.totalPlannedQty, QTY_TOLERANCE);
    check("Total Capacity", report.totals.totalCapacity, QTY_TOLERANCE);
    check("Average Efficiency", report.totals.averageEfficiency, PCT_TOLERANCE);
  } else {
    problems.push("Summary sheet dataset missing.");
  }

  return { ok: problems.length === 0, sheetCount: sheets.length, sheets, rowCounts, problems };
}

function findHeaderRow(sheet: ExcelJS.Worksheet, table: ReportTable): number | null {
  const first = table.columns[0]?.header;
  if (!first) return null;
  for (let r = 1; r <= Math.min(sheet.rowCount, 80); r += 1) {
    if (String(sheet.getRow(r).getCell(1).value ?? "") === first) return r;
  }
  return null;
}

function countDataRows(sheet: ExcelJS.Worksheet, headerRow: number, table: ReportTable): number {
  let count = 0;
  for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const empty = table.columns.every((_, i) => {
      const v = row.getCell(i + 1).value;
      return v === null || v === undefined || v === "";
    });
    if (empty) break;
    count += 1;
  }
  return table.totals ? Math.max(0, count - 1) : count;
}

export async function exportProductionBuildupPlan(
  report: ProductionBuildupReport,
  onStage?: (stage: ExportStage) => void,
): Promise<ExportOutcome> {
  onStage?.("PREPARING");
  const fileName = report.meta.fileName;

  if (report.meta.status === "BLOCKED") {
    onStage?.("FAILED");
    return {
      ok: false,
      fileName,
      blob: null,
      validation: {
        ok: false,
        sheetCount: 0,
        sheets: [],
        rowCounts: {},
        problems: report.blockers.map((b) => b.message),
      },
    };
  }

  const { blob, buffer } = await generateWorkbookBlob(report, onStage);
  onStage?.("VALIDATING");
  const validation = await validateWorkbook(buffer, report);

  if (!validation.ok) {
    onStage?.("FAILED");
    return { ok: false, fileName, blob: null, validation };
  }

  onStage?.("DOWNLOADING");
  downloadBlob(blob, fileName);
  onStage?.("DONE");
  return { ok: true, fileName, blob, validation };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** CSV for a single report table only — never several tabs in one file. */
export function tableToCsv(table: ReportTable): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [table.columns.map((c) => esc(c.header)).join(",")];
  for (const row of table.rows) lines.push(table.columns.map((c) => esc(row[c.key])).join(","));
  if (table.totals) lines.push(table.columns.map((c) => esc(table.totals![c.key])).join(","));
  return lines.join("\n");
}

export function exportTableCsv(table: ReportTable, report: ProductionBuildupReport) {
  const name = `Armana_${table.sheetName.replace(/[^A-Za-z0-9]+/g, "_")}_${report.meta.periodLabel.replace(/\s+/g, "_")}.csv`;
  downloadBlob(new Blob([tableToCsv(table)], { type: "text/csv;charset=utf-8" }), name);
}
