import * as XLSX from "xlsx";

import type { SmvEntry } from "./model";

const STYLE_HEADERS = ["style no", "style", "style#", "style code", "styleno"];
const SMV_HEADERS = ["smv", "s.m.v", "smv value", "standard minute"];

function headerIndex(row: unknown[], candidates: string[]): number {
  return row.findIndex((cell) => {
    const text = String(cell ?? "").trim().toLowerCase();
    return candidates.some((c) => text === c || text.startsWith(c));
  });
}

/** Reads a bulk SMV upload: Excel or CSV with Style No + SMV columns. */
export function parseSmvFile(buffer: ArrayBuffer): {
  entries: SmvEntry[];
  error?: string;
} {
  const wb = XLSX.read(buffer, { cellDates: false });
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, {
      header: 1,
      blankrows: false,
    });
    for (let h = 0; h < Math.min(rows.length, 10); h++) {
      const header = rows[h] ?? [];
      const styleCol = headerIndex(header, STYLE_HEADERS);
      const smvCol = headerIndex(header, SMV_HEADERS);
      if (styleCol === -1 || smvCol === -1) continue;

      const entries: SmvEntry[] = [];
      for (const row of rows.slice(h + 1)) {
        const style = String(row?.[styleCol] ?? "").trim();
        const smv = Number(row?.[smvCol]);
        if (!style || !Number.isFinite(smv) || smv <= 0) continue;
        entries.push({ style, smv: Number(smv.toFixed(2)) });
      }
      if (entries.length) return { entries };
    }
  }
  return {
    entries: [],
    error:
      "Could not find a 'Style No' column and an 'SMV' column in that file. Add those two headings and upload again.",
  };
}
