import templateAsset from "@/assets/buildup-template.xlsx.asset.json";
import { XlsxPatcher, type CellInput } from "@/lib/xlsx/patch";

import type { StyleSummary } from "./parse-rough-plan";
import { daysInMonth, type BuildResult, type PlanSettings } from "./model";

const LINE_SHEETS = [
  { name: "Sewing Line (1-4)", lines: [1, 2, 3, 4] },
  { name: "Sewing Line (5-8)", lines: [5, 6, 7, 8] },
  { name: "Sewing Line (9-12)", lines: [9, 10, 11, 12] },
] as const;

/** column letters per slot: style, target, smv, efficiency */
const SLOT_COLS = [
  ["D", "E", "F", "G"],
  ["H", "I", "J", "K"],
  ["L", "M", "N", "O"],
  ["P", "Q", "R", "S"],
] as const;

const MP_CELLS = ["G2", "K2", "O2", "S2"] as const;
const FIRST_ROW = 6;
const LAST_ROW = 36;
const STYLE_SHEET = "Style count -  product mix";
const STYLE_FIRST_ROW = 6;
const STYLE_LAST_ROW = 71;

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function monthFileName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const short = new Date(y!, m! - 1, 1).toLocaleDateString("en-US", { month: "short" });
  return `${String(m).padStart(2, "0")}_Production Buildup Plan ${short} ${y}.xlsx`;
}

export async function loadTemplate(): Promise<ArrayBuffer> {
  const res = await fetch(templateAsset.url);
  if (!res.ok) throw new Error(`Could not load the report template (${res.status})`);
  return res.arrayBuffer();
}

export type GenerateInput = {
  settings: PlanSettings;
  result: BuildResult;
  styles: StyleSummary[];
  templateBuffer: ArrayBuffer;
};

export function generateWorkbook({
  settings,
  result,
  styles,
  templateBuffer,
}: GenerateInput): Blob {
  const patcher = XlsxPatcher.fromBuffer(templateBuffer);
  const dates = daysInMonth(settings.month);
  const label = monthLabel(settings.month);

  const settingFor = (line: number) =>
    settings.lines.find((l) => l.line === line)!;

  for (const sheetDef of LINE_SHEETS) {
    const sheet = patcher.sheet(sheetDef.name);
    const minutes = sheetDef.lines.map((line) => settingFor(line).hours * 60);

    // manpower + available minutes
    sheetDef.lines.forEach((line, slot) => {
      sheet.set(MP_CELLS[slot]!, { kind: "number", value: settingFor(line).manpower });
    });
    sheet.set("W2", {
      kind: "formula",
      value: `G2*${minutes[0]}+K2*${minutes[1]}+O2*${minutes[2]}+S2*${minutes[3]}`,
    });

    for (let row = FIRST_ROW; row <= LAST_ROW; row++) {
      const dayIndex = row - FIRST_ROW;
      const date = dates[dayIndex];

      if (!date) {
        // shorter month: clear the trailing row completely
        sheet.set(`B${row}`, { kind: "blank" });
        for (const [styleCol, qtyCol, smvCol] of SLOT_COLS) {
          sheet.set(`${styleCol}${row}`, { kind: "blank" });
          sheet.set(`${qtyCol}${row}`, { kind: "blank" });
          sheet.set(`${smvCol}${row}`, { kind: "blank" });
        }
        continue;
      }

      const [y, m, d] = date.split("-").map(Number);
      sheet.set(`B${row}`, { kind: "date", value: new Date(y!, m! - 1, d!) });

      sheetDef.lines.forEach((line, slot) => {
        const [styleCol, qtyCol, smvCol, effCol] = SLOT_COLS[slot]!;
        const cell = result.cells.find((c) => c.line === line && c.date === date);
        const style: CellInput = cell?.style
          ? { kind: "string", value: cell.style }
          : { kind: "blank" };
        sheet.set(`${styleCol}${row}`, style);
        sheet.set(
          `${qtyCol}${row}`,
          cell && cell.target > 0
            ? { kind: "number", value: cell.target }
            : { kind: "blank" },
        );
        sheet.set(
          `${smvCol}${row}`,
          cell && cell.target > 0 && cell.smv > 0
            ? { kind: "number", value: cell.smv }
            : { kind: "blank" },
        );
        sheet.set(`${effCol}${row}`, {
          kind: "formula",
          value: `IF(${qtyCol}${row}="","",(${qtyCol}${row}*${smvCol}${row}/(${effCol}$2*${minutes[slot]})))`,
        });
      });
    }
  }

  // Summary: title + date header row
  const summary = patcher.sheet("Summary");
  summary.set("K3", { kind: "string", value: `Buildup Plan for the Month of ${label}` });
  for (let i = 0; i < 31; i++) {
    const col = String.fromCharCode(66 + i); // B..
    const ref = i < 25 ? `${col}4` : `A${String.fromCharCode(65 + i - 25)}4`;
    const date = dates[i];
    if (!date) {
      summary.set(ref, { kind: "blank" });
      continue;
    }
    const [y, m, d] = date.split("-").map(Number);
    summary.set(ref, { kind: "date", value: new Date(y!, m! - 1, d!) });
  }

  // At a Glance: dates + total available minutes driven by the line sheets
  const glance = patcher.sheet("At a Glance");
  glance.set("V1", {
    kind: "formula",
    value: `'Sewing Line (1-4)'!W2+'Sewing Line (5-8)'!W2+'Sewing Line (9-12)'!W2`,
  });
  for (let row = FIRST_ROW; row <= LAST_ROW; row++) {
    const date = dates[row - FIRST_ROW];
    if (!date) {
      glance.set(`B${row}`, { kind: "blank" });
      continue;
    }
    const [y, m, d] = date.split("-").map(Number);
    glance.set(`B${row}`, { kind: "date", value: new Date(y!, m! - 1, d!) });
  }

  // Chart sheet heading
  const chart = patcher.sheet("Chart");
  chart.set("A1", { kind: "string", value: `Line-wise ${label} Production Plan` });

  // Style count - product mix
  const styleSheet = patcher.sheet(STYLE_SHEET);
  const rows = styles.slice(0, STYLE_LAST_ROW - STYLE_FIRST_ROW + 1);
  for (let i = 0; i <= STYLE_LAST_ROW - STYLE_FIRST_ROW; i++) {
    const row = STYLE_FIRST_ROW + i;
    const entry = rows[i];
    if (!entry) {
      styleSheet.set(`B${row}`, { kind: "blank" });
      styleSheet.set(`C${row}`, { kind: "blank" });
      styleSheet.set(`D${row}`, { kind: "blank" });
      styleSheet.set(`F${row}`, { kind: "blank" });
      continue;
    }
    styleSheet.set(`B${row}`, { kind: "number", value: entry.line });
    styleSheet.set(`C${row}`, { kind: "string", value: entry.style });
    styleSheet.set(`D${row}`, { kind: "string", value: entry.buyer || "" });
    styleSheet.set(`F${row}`, {
      kind: "number",
      value: entry.orderQty || entry.plannedQty,
    });
  }
  // Clear the stale helper block the template carries below the data range
  // (leftover buyer labels plus a cached #N/A from the source file).
  for (let row = STYLE_LAST_ROW + 1; row <= 87; row++) {
    styleSheet.set(`C${row}`, { kind: "blank" });
    styleSheet.set(`D${row}`, { kind: "blank" });
    styleSheet.set(`E${row}`, { kind: "blank" });
    styleSheet.set(`F${row}`, { kind: "blank" });
  }

  const [yy, mm] = settings.month.split("-").map(Number);
  styleSheet.set("B1", { kind: "date", value: new Date(yy!, mm! - 1, 1) });
  styleSheet.set("K1", { kind: "date", value: new Date(yy!, mm! - 1, 1) });


  return patcher.toBlob();
}
