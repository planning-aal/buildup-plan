import type { SewingPlanEntry, SmvMasterRecord } from "@/lib/import/types";
import { resolveSmv } from "@/lib/master/master-data";

import type { LinePlanSettings, PlanningPeriod, StyleChangeRecord, StyleRun } from "./types";

/**
 * Rebuilds the style sequence per line from the normalized sewing plan.
 *
 * A STYLE entry starts a new run. PO / quantity entries that follow attach to
 * the run in progress. Styles are never merged just because they share a line.
 */
export function buildStyleRuns(
  entries: SewingPlanEntry[],
  lines: LinePlanSettings[],
  smvMaster: SmvMasterRecord[],
  period: PlanningPeriod,
  smvOverrides: Record<string, number> = {},
): { runs: StyleRun[]; styleChanges: StyleChangeRecord[] } {
  const runs: StyleRun[] = [];
  const styleChanges: StyleChangeRecord[] = [];

  for (const line of lines) {
    const lineEntries = entries
      .filter((e) => e.lineId === line.lineId)
      .sort((a, b) => a.date.localeCompare(b.date) || a.sourceRow - b.sourceRow);
    if (lineEntries.length === 0) continue;

    let current: StyleRun | null = null;
    let previousStyle: string | null = null;
    let sequence = 0;

    for (const entry of lineEntries) {
      if (entry.entryType === "STYLE" && entry.styleNo) {
        if (current && current.styleNo === entry.styleNo) {
          current.endDate = entry.date;
          continue;
        }
        sequence += 1;
        current = {
          id: `${line.lineId}_run${sequence}`,
          lineId: line.lineId,
          lineName: line.lineName,
          styleNo: entry.styleNo,
          secondaryCode: entry.secondaryCode,
          poNo: entry.poNo,
          buyer: entry.buyer,
          orderQty: entry.orderQty,
          smv: null,
          smvStatus: "SMV_MISSING",
          startDate: entry.date,
          endDate: entry.date,
          sequence,
        };
        runs.push(current);
        if (previousStyle !== null && previousStyle !== entry.styleNo) {
          styleChanges.push({
            lineId: line.lineId,
            lineName: line.lineName,
            date: entry.date,
            previousStyle,
            newStyle: entry.styleNo,
          });
        }
        previousStyle = entry.styleNo;
        continue;
      }

      if (!current) continue;
      current.endDate = entry.date;
      if (entry.poNo && !current.poNo) current.poNo = entry.poNo;
      if (entry.entryType === "PO" || entry.entryType === "TOTAL_QTY") {
        const qty = entry.orderQty ?? entry.quantities[0]?.value ?? null;
        if (qty !== null) current.orderQty = (current.orderQty ?? 0) + qty;
      }
    }
  }

  // resolve SMV for every run, honouring effective dates and scenario overrides
  for (const run of runs) {
    if (!run.styleNo) {
      run.smvStatus = "SMV_MISSING";
      continue;
    }
    const override = smvOverrides[run.styleNo];
    if (override !== undefined && override > 0) {
      run.smv = override;
      run.smvStatus = "SMV_FOUND";
      continue;
    }
    const onDate = run.startDate < period.from ? period.from : run.startDate;
    const record = resolveSmv(run.styleNo, smvMaster, onDate);
    if (!record || record.smv === null) {
      run.smv = null;
      run.smvStatus = record?.status === "SMV_INVALID" ? "SMV_INVALID" : "SMV_MISSING";
    } else {
      run.smv = record.smv;
      run.smvStatus = "SMV_FOUND";
    }
  }

  return { runs, styleChanges };
}

/**
 * The run in force for a line on a date — the plan sequence carries the last
 * style forward until the next style starts.
 */
export function runIndexByDate(runs: StyleRun[], lineId: string): (date: string) => StyleRun | null {
  const lineRuns = runs
    .filter((r) => r.lineId === lineId)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.sequence - b.sequence);
  return (date: string) => {
    let found: StyleRun | null = null;
    for (const run of lineRuns) {
      if (run.startDate <= date) found = run;
      else break;
    }
    return found;
  };
}
