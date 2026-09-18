import type { ValidationIssue } from "@/lib/import/types";

import type { DailyPlanRecord, LinePlanSettings, OrderPlan, StyleRun } from "./types";

let seq = 0;
function issue(
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
): ValidationIssue {
  seq += 1;
  return { id: `plan_issue_${seq}`, severity, code, message };
}

export function validatePlanning(
  runs: StyleRun[],
  orders: OrderPlan[],
  days: DailyPlanRecord[],
  lines: LinePlanSettings[],
): ValidationIssue[] {
  const out: ValidationIssue[] = [];

  for (const line of lines) {
    if (!line.active) continue;
    if (line.manpower <= 0)
      out.push(issue("CRITICAL", "INVALID_MANPOWER", `${line.lineName}: manpower must be above zero.`));
    if (line.workingHours <= 0)
      out.push(
        issue("CRITICAL", "INVALID_WORKING_HOURS", `${line.lineName}: working hours must be above zero.`),
      );
    if (line.ramp.maxEfficiency <= 0)
      out.push(
        issue("CRITICAL", "INVALID_EFFICIENCY", `${line.lineName}: maximum efficiency must be above zero.`),
      );
  }

  const missing = new Set<string>();
  for (const run of runs) {
    if (run.smvStatus === "SMV_FOUND") continue;
    const label = run.styleNo ?? "(style not identified)";
    if (missing.has(`${run.lineId}|${label}`)) continue;
    missing.add(`${run.lineId}|${label}`);
    out.push(
      issue(
        "CRITICAL",
        run.smvStatus,
        `${run.lineName}: no usable SMV for ${label} — capacity was not calculated for this style.`,
      ),
    );
  }

  for (const order of orders) {
    if (order.status === "CAPACITY_SHORTAGE") {
      out.push(
        issue(
          "WARNING",
          "CAPACITY_SHORTAGE",
          `${order.lineName} / ${order.styleNo ?? "?"}: short by ${Math.round(order.shortageQty).toLocaleString()} pcs inside the planning period.`,
        ),
      );
    }
  }

  const idleLines = new Map<string, number>();
  for (const day of days) {
    if (day.status === "IDLE") idleLines.set(day.lineId, (idleLines.get(day.lineId) ?? 0) + 1);
  }
  for (const [lineId, count] of idleLines) {
    const line = lines.find((l) => l.lineId === lineId);
    out.push(
      issue(
        "INFO",
        "IDLE_DAYS",
        `${line?.lineName ?? lineId}: ${count} working day(s) with no style planned.`,
      ),
    );
  }

  return out;
}
