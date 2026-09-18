/**
 * Validation layer. Runs on normalized records only — it never re-parses text
 * and never changes the data; it only reports what a planner has to look at.
 */
import type {
  SewingPlanEntry,
  StyleBlockRecord,
  ValidationIssue,
} from "./types";

let seq = 0;
const id = () => `iss_${(++seq).toString(36)}`;

function issue(
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  entry?: SewingPlanEntry,
): ValidationIssue {
  return {
    id: id(),
    severity,
    code,
    message,
    ...(entry
      ? {
          entryId: entry.id,
          sourceSheet: entry.sourceSheet,
          sourceRow: entry.sourceRow,
          sourceColumn: entry.sourceColumn,
        }
      : {}),
  };
}

export function validateImport(
  entries: SewingPlanEntry[],
  blocks: StyleBlockRecord[],
): ValidationIssue[] {
  const out: ValidationIssue[] = [];

  for (const e of entries) {
    const where = `${e.sourceSheet} row ${e.sourceRow}, ${e.lineLabel}`;

    // CRITICAL
    if (!e.date) out.push(issue("CRITICAL", "INVALID_DATE", `No date on ${where}`, e));
    if (!e.lineNo) out.push(issue("CRITICAL", "MISSING_LINE", `No sewing line on ${where}`, e));
    if (e.targetQty !== null && (e.targetQty < 0 || !Number.isFinite(e.targetQty))) {
      out.push(issue("CRITICAL", "INVALID_TARGET", `Target is not a usable number on ${where}`, e));
    }
    if (e.entryType === "STYLE" && !e.styleNo) {
      out.push(issue("CRITICAL", "INVALID_STYLE", `Style text could not be read on ${where}`, e));
    }
    if (e.quantities.some((q) => q.value <= 0)) {
      out.push(issue("CRITICAL", "INVALID_ORDER_QTY", `Order quantity is zero on ${where}`, e));
    }

    // WARNING
    if (e.flags.includes("MULTIPLE_PO")) {
      out.push(issue("WARNING", "AMBIGUOUS_PO", `More than one PO in one cell on ${where}`, e));
    }
    if (e.flags.includes("AMBIGUOUS_QUANTITY")) {
      out.push(
        issue("WARNING", "AMBIGUOUS_QUANTITY", `Several quantities in one cell on ${where}`, e),
      );
    }
    if (e.flags.includes("UNRECOGNIZED_TEXT")) {
      out.push(issue("WARNING", "UNRECOGNIZED_TEXT", `Text not recognised on ${where}`, e));
    }
    if (e.flags.includes("UNPARSED_DELIVERY_DATE")) {
      out.push(
        issue("WARNING", "UNPARSED_DELIVERY_DATE", `Delivery date unclear on ${where}`, e),
      );
    }
    if (e.entryType === "UNKNOWN" && e.rawText.trim()) {
      out.push(issue("WARNING", "UNKNOWN_ENTRY_TYPE", `Entry type unknown on ${where}`, e));
    }

    // INFORMATION
    if (/\bMANUAL\b/i.test(e.rawText)) {
      out.push(issue("INFO", "MANUAL", `Manual work noted on ${where}`, e));
    }
    if (/\bVMI\b/i.test(e.rawText)) {
      out.push(issue("INFO", "VMI", `VMI noted on ${where}`, e));
    }
    if (e.entryType === "LINE_SUPPORT") {
      out.push(issue("INFO", "LINE_SUPPORT", `Line support noted on ${where}`, e));
    }
    if (e.entryType === "BALANCE") {
      out.push(issue("INFO", "BALANCE", `Sewing balance noted on ${where}`, e));
    }
  }

  for (const b of blocks) {
    if (b.plannedQty < 0) {
      out.push(
        issue(
          "CRITICAL",
          "INVALID_TARGET",
          `Negative planned quantity in ${b.sourceSheet} row ${b.sourceRow}`,
        ),
      );
    }
  }

  return out;
}
