/**
 * Layer 1 of the pipeline: Excel -> raw records -> normalized records.
 *
 * Nothing here knows about production maths, and nothing here is specific to
 * twelve lines: the sewing lines are discovered from the header row of each
 * sheet, so 16, 20 or 30 lines parse without code changes.
 */
import * as XLSX from "xlsx";

import {
  classifyEntry,
  parseDelivery,
  parsePo,
  parseQuantities,
  parseStyle,
  squash,
} from "./field-parsers";
import type {
  ImportResult,
  ParseStatus,
  SewingLine,
  SewingPlanEntry,
  SheetInfo,
  StyleBlockRecord,
} from "./types";
import { validateImport } from "./validate";

type Grid = unknown[][];

let seq = 0;
const nextId = (prefix: string) => `${prefix}_${(++seq).toString(36)}`;

function toIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number" && value > 20000 && value < 90000) {
    const p = XLSX.SSF.parse_date_code(value);
    if (!p) return null;
    return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  }
  if (typeof value === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (m) return m[0];
  }
  return null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[,\s]/g, ""));
    if (value.trim() !== "" && Number.isFinite(n)) return n;
  }
  return null;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

const LINE_LABEL = /^\s*LINE\s*[-–]?\s*(\d+)\s*$/i;
const TARGET_LABEL = /^\s*TARGET\s*$/i;

type LineColumn = {
  label: string;
  lineNo: number;
  textCol: number;
  targetCol: number | null;
};

/** Finds the header row and the line/target column pairs on a sheet. */
function detectHeader(grid: Grid): { row: number; lines: LineColumn[] } | null {
  const limit = Math.min(grid.length, 30);
  for (let r = 0; r < limit; r++) {
    const row = grid[r] ?? [];
    const cells = row.map((c) => squash(text(c)));
    const hasDate = cells.some((c) => /^DATE$/i.test(c));
    const lines: LineColumn[] = [];
    cells.forEach((cell, index) => {
      const m = LINE_LABEL.exec(cell);
      if (!m) return;
      const next = cells[index + 1] ?? "";
      lines.push({
        label: `LINE-${Number(m[1])}`,
        lineNo: Number(m[1]),
        textCol: index,
        targetCol: TARGET_LABEL.test(next) ? index + 1 : null,
      });
    });
    if (hasDate && lines.length > 0) {
      inferTargetColumns(grid, r, lines);
      return { row: r, lines };
    }
  }
  return null;
}

/**
 * Some sheets leave the TARGET header blank. Sample the data instead: if the
 * line's own column is mostly free text and the next column is mostly numbers,
 * that next column holds the daily targets.
 */
function inferTargetColumns(grid: Grid, headerRow: number, lines: LineColumn[]): void {
  const sampleRows = grid.slice(headerRow + 1, headerRow + 120);
  for (const line of lines) {
    if (line.targetCol !== null) continue;
    let ownText = 0;
    let ownNumber = 0;
    let nextNumber = 0;
    for (const row of sampleRows) {
      const own = row?.[line.textCol];
      const next = row?.[line.textCol + 1];
      if (typeof own === "string" && squash(own)) ownText++;
      else if (num(own) !== null) ownNumber++;
      if (num(next) !== null) nextNumber++;
    }
    if (ownText > ownNumber && nextNumber >= 3) line.targetCol = line.textCol + 1;
  }
}


export function parseSewingPlanWorkbook(
  buffer: ArrayBuffer,
  fileName: string,
): ImportResult {
  const wb = XLSX.read(buffer, { cellDates: true });
  const planId = nextId("plan");

  const sheets: SheetInfo[] = [];
  const entries: SewingPlanEntry[] = [];
  const styleBlocks: StyleBlockRecord[] = [];
  const lineMap = new Map<string, SewingLine>();
  let updatedOn: string | undefined;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]!;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      blankrows: true,
    }) as Grid;
    const columns = grid.reduce((max, r) => Math.max(max, r?.length ?? 0), 0);
    const header = detectHeader(grid);

    if (!updatedOn) {
      for (let r = 0; r < Math.min(grid.length, 5); r++) {
        const row = grid[r] ?? [];
        if (row.some((c) => /UPDATE\s*ON/i.test(text(c)))) {
          const found = row.map(toIso).find(Boolean);
          if (found) updatedOn = found;
        }
      }
    }

    if (!header) {
      sheets.push({
        name: sheetName,
        kind: "UNKNOWN",
        rows: grid.length,
        columns,
        headerRow: null,
        lineLabels: [],
      });
      continue;
    }

    const hasTargets = header.lines.some((l) => l.targetCol !== null);
    const kind: SheetInfo["kind"] = hasTargets ? "DAILY_LINE_GRID" : "LINE_QTY_GRID";
    sheets.push({
      name: sheetName,
      kind,
      rows: grid.length,
      columns,
      headerRow: header.row + 1,
      lineLabels: header.lines.map((l) => l.label),
    });

    for (const line of header.lines) {
      const id = `line_${line.lineNo}`;
      if (!lineMap.has(id)) {
        lineMap.set(id, {
          id,
          factoryId: "armana",
          label: line.label,
          lineNo: line.lineNo,
        });
      }
    }

    // repeated header rows appear throughout the sheet; skip them by
    // requiring a real date in column A.
    for (let r = header.row + 1; r < grid.length; r++) {
      const row = grid[r] ?? [];
      const date = toIso(row[0]);
      if (!date) continue;
      const dayLabel = squash(text(row[1]));
      const contextYear = Number(date.slice(0, 4));

      for (const line of header.lines) {
        const rawText = text(row[line.textCol]).replace(/\u00a0/g, " ");
        const target = line.targetCol !== null ? num(row[line.targetCol]) : null;

        if (kind === "LINE_QTY_GRID") {
          const planned = num(row[line.textCol]);
          if (planned === null) continue;
          styleBlocks.push({
            id: nextId("blk"),
            planId,
            styleNo: null,
            secondaryCode: null,
            orderQty: null,
            date,
            lineLabel: line.label,
            lineNo: line.lineNo,
            plannedQty: planned,
            rawBlock: squash(rawText),
            sourceSheet: sheetName,
            sourceRow: r + 1,
          });
          continue;
        }

        if (!squash(rawText) && target === null) continue;

        const hasText = squash(rawText).length > 0;
        const entryType = hasText ? classifyEntry(rawText) : "OTHER";
        const style = parseStyle(rawText);
        const po = parsePo(rawText);
        const qty = parseQuantities(rawText);
        const delivery = parseDelivery(rawText, contextYear);
        const flags: string[] = [];

        if (entryType === "STYLE" && !style.styleNo) flags.push("STYLE_NOT_IDENTIFIED");
        if (po.multiple) flags.push("MULTIPLE_PO");
        if (qty.ambiguous) flags.push("AMBIGUOUS_QUANTITY");
        if (delivery.raw && !delivery.start) flags.push("UNPARSED_DELIVERY_DATE");
        if (entryType === "UNKNOWN" && hasText) flags.push("UNRECOGNIZED_TEXT");

        let parseStatus: ParseStatus = "PARSED";
        if (!hasText) {
          parseStatus = target === null ? "EMPTY" : "PARSED";
          flags.push("CARRY_OVER_DAY");
        }
        else if (entryType === "UNKNOWN" || entryType === "OTHER") parseStatus = "UNPARSED";
        else if (flags.length > 0) parseStatus = "PARTIAL";

        entries.push({
          id: nextId("ent"),
          planId,
          date,
          dayLabel,
          lineId: `line_${line.lineNo}`,
          lineNo: line.lineNo,
          lineLabel: line.label,
          rawText,
          entryType,
          styleNo: style.styleNo,
          secondaryCode: style.secondaryCode,
          poNo: po.poNo,
          quantities: qty.quantities,
          orderQty: qty.quantities.length === 1 ? qty.quantities[0]!.value : null,
          deliveryDateStart: delivery.start,
          deliveryDateEnd: delivery.end,
          deliveryDateRaw: delivery.raw,
          buyer: style.buyer,
          planner: style.planner,
          season: style.season,
          additionalDescription: style.description,
          targetQty: target,
          sourceSheet: sheetName,
          sourceRow: r + 1,
          sourceColumn: line.textCol + 1,
          parseStatus,
          flags,
        });
      }
    }
  }

  const dates = entries.map((e) => e.date).concat(styleBlocks.map((b) => b.date)).sort();
  const lines = [...lineMap.values()].sort((a, b) => a.lineNo - b.lineNo);
  const issues = validateImport(entries, styleBlocks);

  const summary = {
    sheetsDetected: sheets.length,
    linesDetected: lines.length,
    dateFrom: dates[0] ?? null,
    dateTo: dates[dates.length - 1] ?? null,
    planningRecords: entries.length + styleBlocks.length,
    stylesDetected: new Set(entries.map((e) => e.styleNo).filter(Boolean)).size,
    posDetected: new Set(entries.map((e) => e.poNo).filter(Boolean)).size,
    targetsDetected: entries.filter((e) => (e.targetQty ?? 0) > 0).length,
    criticalErrors: issues.filter((i) => i.severity === "CRITICAL").length,
    warnings: issues.filter((i) => i.severity === "WARNING").length,
    infos: issues.filter((i) => i.severity === "INFO").length,
    successfullyParsed: entries.filter((e) => e.parseStatus === "PARSED").length,
  };

  return {
    plan: {
      id: planId,
      factoryId: "armana",
      fileName,
      importedAt: new Date().toISOString(),
      ...(updatedOn ? { updatedOn } : {}),
      sheets,
      lines,
      dateRange: dates.length
        ? { from: dates[0]!, to: dates[dates.length - 1]! }
        : null,
    },
    entries,
    styleBlocks,
    issues,
    summary,
  };
}
