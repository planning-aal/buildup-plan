/**
 * Acceptance check for the Phase 1 sewing-plan parser.
 * Usage: bun scripts/parse-check.ts <path-to-sewing-plan.xlsx>
 */
import { readFileSync } from "node:fs";

import { parseSewingPlanWorkbook } from "../src/lib/import/parse-workbook";

const path = process.argv[2];
if (!path) throw new Error("pass the workbook path");
const buf = readFileSync(path);
const result = parseSewingPlanWorkbook(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  path.split("/").pop()!,
);

console.log("summary", result.summary);
console.log("sheets", result.plan.sheets);
console.log("lines", result.plan.lines.map((l) => l.label).join(", "));

const byType: Record<string, number> = {};
for (const e of result.entries) byType[e.entryType] = (byType[e.entryType] ?? 0) + 1;
console.log("entry types", byType);

const byStatus: Record<string, number> = {};
for (const e of result.entries) byStatus[e.parseStatus] = (byStatus[e.parseStatus] ?? 0) + 1;
console.log("parse status", byStatus);

console.log("\nsample entries");
for (const e of result.entries.filter((x) => x.rawText.trim()).slice(0, 8)) {
  console.log({
    date: e.date,
    line: e.lineLabel,
    type: e.entryType,
    style: e.styleNo,
    second: e.secondaryCode,
    po: e.poNo,
    qty: e.quantities.map((q) => q.value),
    dl: [e.deliveryDateStart, e.deliveryDateEnd],
    planner: e.planner,
    buyer: e.buyer,
    target: e.targetQty,
    flags: e.flags,
    raw: e.rawText.slice(0, 60),
  });
}

console.log("\nunparsed samples");
for (const e of result.entries.filter((x) => x.parseStatus === "UNPARSED").slice(0, 10)) {
  console.log(e.entryType, "|", e.rawText.slice(0, 70));
}
console.log("\nstyle blocks", result.styleBlocks.length, result.styleBlocks.slice(0, 3));
