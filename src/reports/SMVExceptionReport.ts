import type { ReportBlocker, ReportColumn, ReportContext, ReportRow, ReportTable } from "./types";

const COLUMNS: ReportColumn[] = [
  { key: "style", header: "Style", type: "text", width: 18 },
  { key: "buyer", header: "Buyer", type: "text", width: 14 },
  { key: "po", header: "PO", type: "text", width: 14 },
  { key: "line", header: "Line", type: "text", width: 11 },
  { key: "smv", header: "SMV", type: "smv", width: 9 },
  { key: "status", header: "Status", type: "status", width: 16 },
  { key: "issue", header: "Issue", type: "text", width: 18 },
  { key: "action", header: "Action", type: "text", width: 34, wrap: true },
];

type Issue = "SMV MISSING" | "SMV INVALID" | "SMV INACTIVE" | "STYLE NOT FOUND" | "AMBIGUOUS STYLE";

/** 11 SMV Exceptions — every style that cannot be costed, with the action required. */
export function buildSmvExceptionReport(ctx: ReportContext): ReportTable {
  const masterByStyle = new Map<string, typeof ctx.smvMaster>();
  for (const rec of ctx.smvMaster) {
    const key = rec.styleNo.toUpperCase();
    masterByStyle.set(key, [...(masterByStyle.get(key) ?? []), rec]);
  }

  const rows: ReportRow[] = [];
  for (const run of ctx.result.runs) {
    if (!run.styleNo) continue;
    const key = run.styleNo.toUpperCase();
    const records = masterByStyle.get(key) ?? [];
    let issue: Issue | null = null;

    if (!records.length) issue = "STYLE NOT FOUND";
    else if (records.every((r) => r.smv === null || Number.isNaN(r.smv))) issue = "SMV MISSING";
    else if (records.some((r) => r.smv !== null && r.smv <= 0)) issue = "SMV INVALID";
    else if (records.every((r) => r.status === "SMV_INVALID")) issue = "SMV INACTIVE";
    else if (new Set(records.map((r) => r.smv)).size > 1 && !run.smv) issue = "AMBIGUOUS STYLE";

    if (!issue && run.smvStatus === "SMV_FOUND") continue;
    if (!issue) issue = run.smvStatus === "SMV_INVALID" ? "SMV INVALID" : "SMV MISSING";

    rows.push({
      style: run.styleNo,
      buyer: run.buyer ?? ctx.buyerByStyle.get(key) ?? null,
      po: run.poNo,
      line: run.lineName,
      smv: run.smv,
      status: run.smvStatus,
      issue,
      action:
        issue === "AMBIGUOUS STYLE"
          ? "Choose the effective SMV record for this style in the SMV master"
          : issue === "SMV INVALID"
            ? "Correct the SMV value in the SMV master, then recalculate"
            : "Enter the SMV or upload an updated SMV master, then recalculate",
    });
  }

  return {
    id: "smv-exceptions",
    sheetName: "11 SMV Exceptions",
    title: "SMV Exceptions",
    description: "Styles that cannot be planned until an SMV is supplied. No SMV is ever assumed or set to zero.",
    columns: COLUMNS,
    rows,
    freezeColumns: 1,
  };
}

/** Critical issues that block the final Production Buildup Plan. */
export function reportBlockers(ctx: ReportContext, smvTable: ReportTable): ReportBlocker[] {
  const blockers: ReportBlocker[] = [];

  const missingStyles = new Set(
    smvTable.rows.filter((r) => r["issue"] !== "AMBIGUOUS STYLE").map((r) => String(r["style"])),
  );
  if (missingStyles.size) {
    blockers.push({
      code: "SMV_MISSING",
      count: missingStyles.size,
      message: `${missingStyles.size} ${missingStyles.size === 1 ? "style has" : "styles have"} no usable SMV.`,
    });
  }

  const critical = ctx.result.issues.filter((i) => i.severity === "CRITICAL");
  if (critical.length) {
    blockers.push({
      code: "VALIDATION_CRITICAL",
      count: critical.length,
      message: `${critical.length} critical validation ${critical.length === 1 ? "issue" : "issues"} in the sewing plan.`,
    });
  }

  const badLines = ctx.lineSettings.filter(
    (l) => l.active && (!(l.workingHours > 0) || !(l.manpower > 0) || !(l.ramp.maxEfficiency > 0)),
  );
  if (badLines.length) {
    blockers.push({
      code: "INVALID_LINE_SETTINGS",
      count: badLines.length,
      message: `${badLines.length} active ${badLines.length === 1 ? "line has" : "lines have"} invalid working hours, manpower or efficiency.`,
    });
  }

  if (!ctx.calendar.some((d) => d.workingStatus === "WORKING" || d.workingStatus === "SPECIAL_WORKING_DAY")) {
    blockers.push({
      code: "NO_WORKING_DAYS",
      count: 1,
      message: "The working calendar contains no working days for this period.",
    });
  }

  return blockers;
}
