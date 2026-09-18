import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseSewingPlanWorkbook } from "@/lib/import/parse-workbook";
import { makeSmvRecord } from "@/lib/master/master-data";
import { calendarForPeriod } from "@/planning/CalendarCalculator";
import { runPlanningEngine } from "@/planning/PlanningEngine";
import type { LinePlanSettings, PlanningInput } from "@/planning/types";
import { buildProductionBuildupReport } from "@/reports";
import { buildWorkbook } from "@/export/WorkbookBuilder";
import { tableToCsv, validateWorkbook } from "@/export/ExcelExporter";

const FILE = "/tmp/user-uploads/update_sewing_plan-5.xlsx";

function setup() {
  const buf = readFileSync(FILE);
  const imported = parseSewingPlanWorkbook(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    "update_sewing_plan.xlsx",
  );

  const period = imported.plan.dateRange!;
  const calendar = calendarForPeriod(period, 8, []);
  const lineSettings: LinePlanSettings[] = imported.plan.lines.map((l): LinePlanSettings => ({
    lineId: l.id,
    lineName: l.label,
    active: true,
    workingHours: 8,
    manpower: 73,
    ramp: { mode: "FIXED", startEfficiency: 0.5, maxEfficiency: 0.8, rampStep: 0.05, customValues: {} },
  }));

  // every style gets an SMV so the report is not blocked
  const styles = new Set(imported.entries.map((e) => e.styleNo).filter(Boolean) as string[]);
  const smvMaster = [...styles].map((s, i) =>
    makeSmvRecord({ styleNo: s, smv: 15 + (i % 10), source: "test" }),
  );

  const input: PlanningInput = {
    entries: imported.entries,
    lines: imported.plan.lines,
    lineSettings,
    calendar,
    smvMaster,
    period,
    allowOverproduction: false,
    sewingPlanSource: "update_sewing_plan.xlsx",
    smvSource: "test",
  };

  const result = runPlanningEngine(input);
  const report = buildProductionBuildupReport({
    result,
    imported,
    calendar,
    lineSettings,
    smvMaster,
    period,
  });
  return { imported, result, report };
}

describe("production buildup report", () => {
  const { result, report } = setup();

  it("reports the engine totals unchanged", () => {
    expect(report.totals.totalOrderQty).toBe(result.factory.totalOrderQty);
    expect(report.totals.totalPlannedQty).toBe(result.factory.totalPlannedQty);
    expect(report.totals.totalCapacity).toBe(result.factory.totalCapacity);
    expect(report.totals.averageEfficiency).toBe(result.factory.averageEfficiency);
  });

  it("is not blocked when every style has an SMV", () => {
    expect(report.blockers).toEqual([]);
    expect(report.meta.status).toBe("GENERATED");
  });

  it("produces the expected report sheets", () => {
    const names = report.tables.map((t) => t.sheetName);
    expect(names[0]).toBe("01 Summary");
    expect(names[1]).toBe("02 At a Glance");
    expect(names).toContain("06 Daily Production Plan");
    expect(names).toContain("07 Style Product Mix");
    expect(names).toContain("08 Capacity Analysis");
    expect(names).toContain("09 Efficiency Analysis");
    expect(names).toContain("10 Working Calendar");
    expect(names).toContain("11 SMV Exceptions");
    expect(names).toContain("12 Assumptions");
    // 12 lines → three presentation groups
    expect(names.filter((n) => /^0[3-5] /.test(n))).toHaveLength(3);
  });

  it("daily plan rows match the engine day records", () => {
    const daily = report.tables.find((t) => t.id === "daily-plan")!;
    expect(daily.rows.length).toBe(result.days.length);
    const planned = daily.rows.reduce((a, r) => a + Number(r["plannedQty"] ?? 0), 0);
    expect(Math.round(planned)).toBe(Math.round(result.factory.totalPlannedQty));
  });

  it("names the file after the planning period", () => {
    expect(report.meta.fileName).toMatch(/^Armana_Production_Buildup_Plan_[A-Za-z]+_\d{4}\.xlsx$/);
  });

  it("writes a workbook that passes export validation", async () => {
    const wb = buildWorkbook({ report, logo: null });
    const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const validation = await validateWorkbook(buffer, report);
    expect(validation.problems).toEqual([]);
    expect(validation.ok).toBe(true);
    expect(validation.sheetCount).toBe(report.tables.length);
  }, 120_000);

  it("exports one table per CSV", () => {
    const daily = report.tables.find((t) => t.id === "daily-plan")!;
    const csv = tableToCsv(daily);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("Date");
    expect(lines.length).toBe(daily.rows.length + 2); // header + rows + totals
  });
});
