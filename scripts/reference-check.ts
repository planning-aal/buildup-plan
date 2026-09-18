/**
 * Reference validation: reproduce the business calculation of
 * 01_Production Buildup Plan Jan 2026.xlsx with the Phase 2 engine formulas.
 *
 *   bun scripts/reference-check.ts <workbook.xlsx>
 *
 * The workbook's own efficiency formula is target x smv / (manpower x 480).
 * 480 is 8 hours x 60, so the engine's configurable form must land on the same
 * number when working hours are set to 8.
 */
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

import {
  availableMinutes,
  earnedMinutes,
  efficiencyFromMinutes,
} from "../src/planning/CapacityCalculator";

const file = process.argv[2];
if (!file) throw new Error("usage: bun scripts/reference-check.ts <workbook.xlsx>");

const wb = XLSX.read(readFileSync(file), { cellDates: true, cellFormula: false });
const SHEETS = ["Sewing Line (1-4)", "Sewing Line (5-8)", "Sewing Line (9-12)"];
const SLOTS = [2, 6, 10, 14]; // 0-based column of the Style cell per line block

let compared = 0;
let matched = 0;
let totalTarget = 0;
let totalEarned = 0;
let totalAvailable = 0;
const mismatches: string[] = [];

for (const name of SHEETS) {
  const sheet = wb.Sheets[name];
  if (!sheet) continue;
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true });

  for (const styleCol of SLOTS) {
    const mpCell = grid[1]?.[styleCol + 3];
    const manpower = typeof mpCell === "number" ? mpCell : null;
    if (!manpower) continue;
    const hoursCell = grid[3]?.[styleCol + 3];
    const hours = typeof hoursCell === "number" ? hoursCell : 8;

    let lineAvailable = 0;
    let lineEarned = 0;

    for (let r = 5; r < grid.length; r++) {
      const target = grid[r]?.[styleCol + 1];
      const smv = grid[r]?.[styleCol + 2];
      const excelEff = grid[r]?.[styleCol + 3];
      if (typeof target !== "number" || typeof smv !== "number" || target <= 0) continue;

      const available = availableMinutes(hours, manpower);
      const earned = earnedMinutes(target, smv);
      const engineEff = efficiencyFromMinutes(earned, available);

      totalTarget += target;
      lineAvailable += available;
      lineEarned += earned;

      if (typeof excelEff === "number") {
        compared++;
        if (Math.abs(engineEff - excelEff) < 1e-9) matched++;
        else mismatches.push(`${name} row ${r + 1}: excel ${excelEff} vs engine ${engineEff}`);
      }
    }

    totalAvailable += lineAvailable;
    totalEarned += lineEarned;
  }
}

console.log({
  file,
  cellsCompared: compared,
  matched,
  mismatches: mismatches.slice(0, 10),
  totalTarget,
  totalEarnedMinutes: Math.round(totalEarned),
  totalAvailableMinutes: Math.round(totalAvailable),
  weightedEfficiency: Number(efficiencyFromMinutes(totalEarned, totalAvailable).toFixed(4)),
});
