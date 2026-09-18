import { describe, expect, it } from "vitest";

import type { SewingLine, SewingPlanEntry, SmvMasterRecord, WorkingCalendarDay } from "@/lib/import/types";
import { makeSmvRecord } from "@/lib/master/master-data";

import { dailyCapacity, availableMinutes, earnedMinutes } from "../CapacityCalculator";
import { efficiencyForRampDay } from "../EfficiencyCalculator";
import { allocateDay } from "../OrderAllocator";
import { runPlanningEngine } from "../PlanningEngine";
import type { LinePlanSettings, PlanningInput, RampProfile, Scenario } from "../types";

const ramp = (over: Partial<RampProfile> = {}): RampProfile => ({
  mode: "FIXED",
  startEfficiency: 0.5,
  maxEfficiency: 0.8,
  rampStep: 0.05,
  customValues: {},
  ...over,
});

const line = (id: string, over: Partial<LinePlanSettings> = {}): LinePlanSettings => ({
  lineId: id,
  lineName: id.toUpperCase(),
  active: true,
  workingHours: 8,
  manpower: 40,
  ramp: ramp(),
  ...over,
});

function entry(over: Partial<SewingPlanEntry>): SewingPlanEntry {
  return {
    id: Math.random().toString(36).slice(2),
    planId: "plan",
    date: "2026-09-01",
    dayLabel: "Tuesday",
    lineId: "line1",
    lineNo: 1,
    lineLabel: "LINE-1",
    rawText: "",
    entryType: "STYLE",
    styleNo: null,
    secondaryCode: null,
    poNo: null,
    quantities: [],
    orderQty: null,
    deliveryDateStart: null,
    deliveryDateEnd: null,
    deliveryDateRaw: null,
    buyer: null,
    planner: null,
    season: null,
    additionalDescription: null,
    targetQty: null,
    sourceSheet: "test",
    sourceRow: 1,
    sourceColumn: 1,
    parseStatus: "PARSED",
    flags: [],
    ...over,
  };
}

function calendar(dates: string[], holidays: string[] = []): WorkingCalendarDay[] {
  return dates.map((date) => ({
    date,
    day: "Day",
    workingStatus: holidays.includes(date) ? "HOLIDAY" : "WORKING",
    holidayType: null,
    holidayReason: null,
    workingHours: 8,
  }));
}

const lines: SewingLine[] = [
  { id: "line1", factoryId: "armana", label: "LINE-1", lineNo: 1 },
  { id: "line2", factoryId: "armana", label: "LINE-2", lineNo: 2 },
];

function input(over: Partial<PlanningInput> = {}): PlanningInput {
  return {
    planId: "plan",
    entries: [],
    lines,
    smvMaster: [],
    calendar: [],
    lineSettings: [line("line1")],
    period: { from: "2026-09-01", to: "2026-09-05" },
    ...over,
  };
}

describe("TEST 1 — capacity formula", () => {
  it("8h x 40 manpower @70% with SMV 20 gives 672 pieces", () => {
    expect(availableMinutes(8, 40)).toBe(19200);
    expect(dailyCapacity(8, 40, 0.7, 20)).toBe(672);
    expect(earnedMinutes(672, 20)).toBe(13440);
  });
});

describe("TEST 2 — ramp-up skips holidays", () => {
  it("fixed ramp steps per working day and caps at max", () => {
    expect(efficiencyForRampDay(ramp(), 1)).toBeCloseTo(0.5);
    expect(efficiencyForRampDay(ramp(), 7)).toBeCloseTo(0.8);
    expect(efficiencyForRampDay(ramp(), 12)).toBeCloseTo(0.8);
    expect(efficiencyForRampDay(ramp({ mode: "NONE" }), 1)).toBeCloseTo(0.8);
    expect(efficiencyForRampDay(ramp({ mode: "CUSTOM", customValues: { 1: 0.45, 2: 0.5 } }), 2)).toBeCloseTo(0.5);
  });

  it("a holiday does not consume a ramp step", () => {
    const dates = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"];
    const result = runPlanningEngine(
      input({
        period: { from: dates[0]!, to: dates[3]! },
        calendar: calendar(dates, ["2026-09-03"]),
        entries: [entry({ styleNo: "S1", orderQty: 1_000_000 })],
        smvMaster: [makeSmvRecord({ styleNo: "S1", smv: 20, source: "test" })],
      }),
    );
    const eff = result.days.map((d) => Number(d.efficiency.toFixed(4)));
    expect(eff).toEqual([0.5, 0.55, 0, 0.6]);
    expect(result.days[2]!.status).toBe("HOLIDAY");
    expect(result.days[2]!.dailyCapacity).toBe(0);
  });
});

describe("TEST 3 — final day capped at remaining quantity", () => {
  it("plans 850 when 850 remain and capacity is 1200", () => {
    expect(allocateDay({ capacity: 1200, remaining: 850, allowOverproduction: false })).toBe(850);
    expect(allocateDay({ capacity: 1200, remaining: 850, allowOverproduction: true })).toBe(1200);
    const result = runPlanningEngine(
      input({
        calendar: calendar(["2026-09-01", "2026-09-02"]),
        period: { from: "2026-09-01", to: "2026-09-02" },
        lineSettings: [line("line1", { ramp: ramp({ mode: "NONE", maxEfficiency: 0.7 }) })],
        entries: [entry({ styleNo: "S1", orderQty: 850 })],
        smvMaster: [makeSmvRecord({ styleNo: "S1", smv: 20, source: "test" })],
      }),
    );
    expect(result.days[0]!.plannedQty).toBe(672);
    expect(result.days[1]!.plannedQty).toBe(178);
    expect(result.orders[0]!.status).toBe("COMPLETED");
  });
});

describe("TEST 4 — missing SMV", () => {
  it("does not calculate capacity and reports SMV_MISSING", () => {
    const result = runPlanningEngine(
      input({
        calendar: calendar(["2026-09-01"]),
        period: { from: "2026-09-01", to: "2026-09-01" },
        entries: [entry({ styleNo: "NO-SMV", orderQty: 5000 })],
        smvMaster: [],
      }),
    );
    expect(result.days[0]!.status).toBe("SMV_MISSING");
    expect(result.days[0]!.dailyCapacity).toBe(0);
    expect(result.days[0]!.plannedQty).toBe(0);
    expect(result.orders[0]!.status).toBe("SMV_MISSING");
    expect(result.issues.some((i) => i.code === "SMV_MISSING" && i.severity === "CRITICAL")).toBe(true);
  });
});

describe("TEST 5 — holiday contributes no capacity", () => {
  it("24 working days + 1 holiday", () => {
    const dates = Array.from({ length: 25 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
    const result = runPlanningEngine(
      input({
        period: { from: dates[0]!, to: dates[24]! },
        calendar: calendar(dates, ["2026-09-11"]),
        lineSettings: [line("line1", { ramp: ramp({ mode: "NONE", maxEfficiency: 0.7 }) })],
        entries: [entry({ styleNo: "S1", orderQty: 1_000_000 })],
        smvMaster: [makeSmvRecord({ styleNo: "S1", smv: 20, source: "test" })],
      }),
    );
    const holiday = result.days.find((d) => d.date === "2026-09-11")!;
    expect(holiday.dailyCapacity).toBe(0);
    expect(holiday.availableMinutes).toBe(0);
    expect(result.lineSummaries[0]!.workingDays).toBe(24);
    expect(result.lineSummaries[0]!.totalCapacity).toBeCloseTo(24 * 672);
  });
});

describe("TEST 6 — per-line working hours", () => {
  it("9 hours produces more than 8 hours on the same style", () => {
    const entries = [
      entry({ styleNo: "S1", orderQty: 1_000_000 }),
      entry({ styleNo: "S1", orderQty: 1_000_000, lineId: "line2", lineNo: 2, lineLabel: "LINE-2" }),
    ];
    const result = runPlanningEngine(
      input({
        period: { from: "2026-09-01", to: "2026-09-01" },
        calendar: calendar(["2026-09-01"]),
        lineSettings: [
          line("line1", { ramp: ramp({ mode: "NONE", maxEfficiency: 0.7 }) }),
          line("line2", { workingHours: 9, ramp: ramp({ mode: "NONE", maxEfficiency: 0.7 }) }),
        ],
        entries,
        smvMaster: [makeSmvRecord({ styleNo: "S1", smv: 20, source: "test" })],
      }),
    );
    const l1 = result.days.find((d) => d.lineId === "line1")!;
    const l2 = result.days.find((d) => d.lineId === "line2")!;
    expect(l1.dailyCapacity).toBe(672);
    expect(l2.dailyCapacity).toBeCloseTo(756);
  });
});

describe("TEST 7 — scenarios never mutate the base plan", () => {
  it("a 75% scenario differs while base results stay identical", () => {
    const common = input({
      period: { from: "2026-09-01", to: "2026-09-03" },
      calendar: calendar(["2026-09-01", "2026-09-02", "2026-09-03"]),
      lineSettings: [line("line1", { ramp: ramp({ mode: "NONE", maxEfficiency: 0.7 }) })],
      entries: [entry({ styleNo: "S1", orderQty: 1_000_000 })],
      smvMaster: [makeSmvRecord({ styleNo: "S1", smv: 20, source: "test" })],
    });
    const base = runPlanningEngine(common);
    const scenario: Scenario = {
      id: "s75",
      name: "75% efficiency",
      overrides: { maxEfficiency: 0.75 },
    };
    const alt = runPlanningEngine({ ...common, scenario });
    const baseAgain = runPlanningEngine(common);

    expect(base.factory.totalPlannedQty).toBeCloseTo(3 * 672);
    expect(alt.factory.totalPlannedQty).toBeCloseTo(3 * 720);
    expect(baseAgain.factory.totalPlannedQty).toBe(base.factory.totalPlannedQty);
    expect(common.lineSettings[0]!.ramp.maxEfficiency).toBe(0.7);
  });
});

describe("determinism and SMV effective dates", () => {
  it("returns identical results for identical inputs", () => {
    const common = input({
      period: { from: "2026-09-01", to: "2026-09-04" },
      calendar: calendar(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]),
      entries: [entry({ styleNo: "S1", orderQty: 5000 })],
      smvMaster: [makeSmvRecord({ styleNo: "S1", smv: 20, source: "test" })],
    });
    const a = runPlanningEngine(common);
    const b = runPlanningEngine(common);
    expect(JSON.stringify(a.days)).toBe(JSON.stringify(b.days));
  });

  it("uses the SMV in force on the planning date", () => {
    const master: SmvMasterRecord[] = [
      makeSmvRecord({ styleNo: "D100142", smv: 20.5, effectiveDate: "2026-01-01", source: "jan" }),
      makeSmvRecord({ styleNo: "D100142", smv: 21.32, effectiveDate: "2026-09-01", source: "sep" }),
    ];
    const result = runPlanningEngine(
      input({
        period: { from: "2026-09-01", to: "2026-09-01" },
        calendar: calendar(["2026-09-01"]),
        entries: [entry({ styleNo: "D100142", orderQty: 5000 })],
        smvMaster: master,
      }),
    );
    expect(result.runs[0]!.smv).toBe(21.32);
  });
});
