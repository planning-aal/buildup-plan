/**
 * Builds the Production Buildup Plan workbook from a report dataset.
 *
 * The builder never calculates a planning figure. Every value written comes
 * from the report dataset, which itself is a projection of the planning engine.
 */
import ExcelJS from "exceljs";

import type { ProductionBuildupReport, ReportTable } from "@/reports/types";

import {
  bodyFont,
  columnWidth,
  excelDate,
  FONT_NAME,
  headerFill,
  headerFont,
  isNumericType,
  leftAlign,
  NUMBER_FORMATS,
  rightAlign,
  statusFill,
  statusLabel,
  subtitleFont,
  thinBorder,
  titleFont,
  totalFill,
  totalFont,
  wrapAlign,
} from "./ExcelFormatter";

export type BuildWorkbookOptions = {
  report: ProductionBuildupReport;
  /** PNG bytes of the Armana logo, drawn at its natural aspect ratio */
  logo?: { data: ArrayBuffer; width: number; height: number } | null;
};

const LOGO_ROW_HEIGHT = 18;

export function buildWorkbook(options: BuildWorkbookOptions): ExcelJS.Workbook {
  const { report } = options;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Armana Production Planning";
  wb.created = new Date(report.meta.generatedAt);

  let logoId: number | null = null;
  if (options.logo) {
    logoId = wb.addImage({ buffer: options.logo.data as ArrayBuffer, extension: "png" });
  }

  for (const table of report.tables) {
    const sheet = wb.addWorksheet(safeSheetName(table.sheetName, wb), {
      views: [{ state: "frozen" }],
      pageSetup: {
        orientation: table.landscape ? "landscape" : "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      },
    });
    writeSheet(sheet, table, report, logoId, options.logo ?? null);
  }

  return wb;
}

function writeSheet(
  sheet: ExcelJS.Worksheet,
  table: ReportTable,
  report: ProductionBuildupReport,
  logoId: number | null,
  logo: BuildWorkbookOptions["logo"],
) {
  const { meta } = report;
  const colCount = Math.max(table.columns.length, 4);
  // header banner spans enough columns that the title is never clipped in print
  const bannerCols = Math.max(colCount, 7);

  // ---- branded header block ------------------------------------------------
  if (logoId !== null && logo) {
    const ratio = logo.height / logo.width;
    const width = 54;
    sheet.addImage(logoId, {
      tl: { col: 0.15, row: 0.2 },
      ext: { width, height: Math.round(width * ratio) },
      editAs: "oneCell",
    });
  }
  sheet.getRow(1).height = LOGO_ROW_HEIGHT;
  sheet.getRow(2).height = LOGO_ROW_HEIGHT;
  sheet.getRow(3).height = LOGO_ROW_HEIGHT;

  const titleCell = sheet.getCell(1, 2);
  titleCell.value = table.title.toUpperCase();
  titleCell.font = titleFont;
  sheet.mergeCells(1, 2, 1, bannerCols);

  const line2 = sheet.getCell(2, 2);
  line2.value = `Armana Group  ·  ${meta.factory}  ·  ${meta.periodLabel}  ·  ${meta.scenarioName}`;
  line2.font = subtitleFont;
  sheet.mergeCells(2, 2, 2, bannerCols);

  const line3 = sheet.getCell(3, 2);
  line3.value = `${meta.reportId}  ·  Plan ${meta.planId}  ·  ${new Date(meta.generatedAt).toLocaleString("en-GB")}  ·  ${meta.status}`;
  line3.font = subtitleFont;
  sheet.mergeCells(3, 2, 3, bannerCols);

  let row = 5;

  if (table.description) {
    const cell = sheet.getCell(row, 1);
    cell.value = table.description;
    cell.font = { name: FONT_NAME, size: 9, italic: true };
    sheet.mergeCells(row, 1, row, colCount);
    row += 2;
  }

  // ---- key/value block -----------------------------------------------------
  if (table.keyValues?.length) {
    for (const kv of table.keyValues) {
      sheet.getCell(row, 1).value = kv.label;
      sheet.getCell(row, 1).font = { name: FONT_NAME, size: 10, bold: true };
      sheet.getCell(row, 2).value = kv.value;
      sheet.getCell(row, 2).font = bodyFont;
      row += 1;
    }
    row += 1;
  }

  // ---- table ---------------------------------------------------------------
  const headerRowIndex = row;
  const headerRow = sheet.getRow(headerRowIndex);
  table.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.alignment = { horizontal: isNumericType(col.type) ? "right" : "left", vertical: "middle", wrapText: true };
    cell.border = thinBorder;
  });
  headerRow.height = 26;

  table.rows.forEach((r, rIdx) => {
    const excelRow = sheet.getRow(headerRowIndex + 1 + rIdx);
    const rowStatus = statusLabel(r["status"]);
    const fill = rowStatus ? statusFill(rowStatus) : null;

    table.columns.forEach((col, cIdx) => {
      const cell = excelRow.getCell(cIdx + 1);
      const raw = r[col.key];
      const type = col.key === "value" && typeof r["__type"] === "string" ? (r["__type"] as typeof col.type) : col.type;

      if (raw === null || raw === undefined || raw === "") {
        cell.value = null;
      } else if (type === "date") {
        const d = excelDate(raw);
        cell.value = d ?? String(raw);
      } else if (type === "status") {
        cell.value = statusLabel(raw);
      } else if (isNumericType(type) && typeof raw === "number") {
        cell.value = raw;
      } else {
        cell.value = raw as string | number;
      }

      const format = NUMBER_FORMATS[type];
      if (format) cell.numFmt = format;
      cell.font = bodyFont;
      cell.alignment = col.wrap ? wrapAlign : isNumericType(type) || type === "date" ? rightAlign : leftAlign;
      cell.border = thinBorder;
      if (fill && (col.type === "status" || cIdx === 0)) cell.fill = fill;
    });
  });

  const lastDataRow = headerRowIndex + table.rows.length;

  if (table.totals) {
    const totalsRow = sheet.getRow(lastDataRow + 1);
    table.columns.forEach((col, cIdx) => {
      const cell = totalsRow.getCell(cIdx + 1);
      const raw = table.totals![col.key];
      if (raw !== undefined && raw !== null) cell.value = raw;
      const format = NUMBER_FORMATS[col.type];
      if (format) cell.numFmt = format;
      cell.font = totalFont;
      cell.fill = totalFill;
      cell.border = thinBorder;
      cell.alignment = isNumericType(col.type) ? rightAlign : leftAlign;
    });
  }

  // ---- widths, freeze panes, filters, print titles -------------------------
  table.columns.forEach((col, i) => {
    sheet.getColumn(i + 1).width = columnWidth(col, table.rows);
  });

  sheet.views = [
    {
      state: "frozen",
      xSplit: table.freezeColumns ?? 0,
      ySplit: headerRowIndex,
      topLeftCell: cellRef((table.freezeColumns ?? 0) + 1, headerRowIndex + 1),
      activeCell: "A1",
    },
  ];

  if (table.rows.length) {
    sheet.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: lastDataRow, column: table.columns.length },
    };
  }

  sheet.pageSetup.printTitlesRow = `${headerRowIndex}:${headerRowIndex}`;
  sheet.headerFooter = {
    oddFooter: `&L${meta.factory} · ${meta.periodLabel}&C&P / &N&R${meta.reportId}`,
  };
}

function cellRef(col: number, row: number): string {
  let s = "";
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return `${s}${row}`;
}

/** Excel sheet names: max 31 chars, no []:*?/\ and must be unique. */
export function safeSheetName(name: string, wb?: ExcelJS.Workbook): string {
  let base = name.replace(/[[\]:*?/\\]/g, "-").slice(0, 31).trim();
  if (!wb) return base;
  let candidate = base;
  let i = 2;
  while (wb.worksheets.some((s) => s.name === candidate)) {
    const suffix = ` (${i})`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    i += 1;
  }
  return candidate;
}
