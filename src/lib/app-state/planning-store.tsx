/**
 * Single source of truth for the planning workspace.
 *
 * The store holds inputs only. Every derived number comes from the Phase 2
 * planning engine (src/planning) — no page recalculates anything itself.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  ImportResult,
  SmvMasterRecord,
  WorkingCalendarDay,
  WorkingStatus,
} from "@/lib/import/types";
import { calendarForPeriod } from "@/planning/CalendarCalculator";
import { runPlanningEngineCached } from "@/planning/PlanningEngine";
import type {
  LinePlanSettings,
  PlanningInput,
  PlanningPeriod,
  PlanningResult,
  RampProfile,
} from "@/planning/types";

const STORAGE_KEY = "armana.planning.settings.v1";

export type PersistedSettings = {
  period: PlanningPeriod;
  lineSettings: LinePlanSettings[];
  calendar: WorkingCalendarDay[];
  smvMaster: SmvMasterRecord[];
  smvSource: string | null;
  allowOverproduction: boolean;
};

export const DEFAULT_RAMP: RampProfile = {
  mode: "FIXED",
  startEfficiency: 0.5,
  maxEfficiency: 0.8,
  rampStep: 0.05,
  customValues: {},
};

export function monthPeriod(anchor: Date | string): PlanningPeriod {
  const d = typeof anchor === "string" ? new Date(`${anchor}T00:00:00Z`) : anchor;
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function periodLabel(period: PlanningPeriod): string {
  return new Date(`${period.from}T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

type Ctx = {
  ready: boolean;
  imported: ImportResult | null;
  planFileName: string | null;
  planFileSize: number | null;
  period: PlanningPeriod;
  lineSettings: LinePlanSettings[];
  calendar: WorkingCalendarDay[];
  smvMaster: SmvMasterRecord[];
  smvSource: string | null;
  allowOverproduction: boolean;
  /** engine output; null until a plan has been generated */
  result: PlanningResult | null;
  generating: boolean;
  stale: boolean;
  setImported: (result: ImportResult, file: { name: string; size: number }) => void;
  setPeriod: (period: PlanningPeriod) => void;
  patchLine: (lineId: string, patch: Partial<LinePlanSettings>) => void;
  patchRamp: (lineId: string, patch: Partial<RampProfile>) => void;
  applyToAllLines: (patch: LineBulkPatch) => void;
  setDayStatus: (
    date: string,
    patch: Partial<Pick<WorkingCalendarDay, "workingStatus" | "holidayReason" | "holidayType" | "workingHours">>,
    lineIds?: string[],
  ) => void;
  setSmvMaster: (records: SmvMasterRecord[], source: string | null) => void;
  upsertSmv: (record: SmvMasterRecord) => void;
  removeSmv: (id: string) => void;
  setAllowOverproduction: (value: boolean) => void;
  generate: () => Promise<PlanningResult | null>;
  engineInput: PlanningInput | null;
  reset: () => void;
};

export type LineBulkPatch = Omit<Partial<LinePlanSettings>, "ramp"> & { ramp?: Partial<RampProfile> };

const PlanningContext = createContext<Ctx | null>(null);

export function PlanningProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [imported, setImportedState] = useState<ImportResult | null>(null);
  const [planFileName, setPlanFileName] = useState<string | null>(null);
  const [planFileSize, setPlanFileSize] = useState<number | null>(null);
  const [period, setPeriodState] = useState<PlanningPeriod>(() => monthPeriod(new Date()));
  const [lineSettings, setLineSettings] = useState<LinePlanSettings[]>([]);
  const [calendar, setCalendar] = useState<WorkingCalendarDay[]>([]);
  const [smvMaster, setSmvMasterState] = useState<SmvMasterRecord[]>([]);
  const [smvSource, setSmvSource] = useState<string | null>(null);
  const [allowOverproduction, setAllowOverproduction] = useState(false);
  const [result, setResult] = useState<PlanningResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as PersistedSettings;
        if (saved.period) setPeriodState(saved.period);
        if (saved.lineSettings) setLineSettings(saved.lineSettings);
        if (saved.calendar) setCalendar(saved.calendar);
        if (saved.smvMaster) setSmvMasterState(saved.smvMaster);
        setSmvSource(saved.smvSource ?? null);
        setAllowOverproduction(Boolean(saved.allowOverproduction));
      }
    } catch {
      /* ignore unreadable storage */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const payload: PersistedSettings = {
      period,
      lineSettings,
      calendar,
      smvMaster,
      smvSource,
      allowOverproduction,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* quota — settings simply are not remembered */
    }
  }, [ready, period, lineSettings, calendar, smvMaster, smvSource, allowOverproduction]);

  const markStale = useCallback(() => setStale(true), []);

  const setImported = useCallback(
    (res: ImportResult, file: { name: string; size: number }) => {
      setImportedState(res);
      setPlanFileName(file.name);
      setPlanFileSize(file.size);
      setResult(null);
      setStale(false);

      const nextPeriod = res.plan.dateRange ? monthPeriod(res.plan.dateRange.from) : period;
      setPeriodState(nextPeriod);
      setCalendar((prev) => calendarForPeriod(nextPeriod, 8, prev));
      setLineSettings((prev) => {
        const byId = new Map(prev.map((l) => [l.lineId, l]));
        return res.plan.lines.map(
          (l) =>
            byId.get(l.id) ?? {
              lineId: l.id,
              lineName: l.label,
              active: true,
              workingHours: 8,
              manpower: 73,
              ramp: { ...DEFAULT_RAMP, customValues: {} },
            },
        );
      });
    },
    [period],
  );

  const setPeriod = useCallback((next: PlanningPeriod) => {
    setPeriodState(next);
    setCalendar((prev) => calendarForPeriod(next, 8, prev));
    markStale();
  }, [markStale]);

  const patchLine = useCallback(
    (lineId: string, patch: Partial<LinePlanSettings>) => {
      setLineSettings((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, ...patch } : l)));
      markStale();
    },
    [markStale],
  );

  const patchRamp = useCallback(
    (lineId: string, patch: Partial<RampProfile>) => {
      setLineSettings((prev) =>
        prev.map((l) => (l.lineId === lineId ? { ...l, ramp: { ...l.ramp, ...patch } } : l)),
      );
      markStale();
    },
    [markStale],
  );

  const applyToAllLines = useCallback(
    (patch: LineBulkPatch) => {
      const { ramp, ...rest } = patch;
      setLineSettings((prev) =>
        prev.map((l) =>
          l.active ? { ...l, ...rest, ramp: ramp ? { ...l.ramp, ...ramp } : l.ramp } : l,
        ),
      );
      markStale();
    },
    [markStale],
  );

  const setDayStatus: Ctx["setDayStatus"] = useCallback(
    (date, patch, lineIds) => {
      if (lineIds && lineIds.length) {
        setLineSettings((prev) =>
          prev.map((l) =>
            lineIds.includes(l.lineId)
              ? {
                  ...l,
                  calendarOverrides: {
                    ...(l.calendarOverrides ?? {}),
                    ...(patch.workingStatus ? { [date]: patch.workingStatus as WorkingStatus } : {}),
                  },
                  hoursByDate: patch.workingHours
                    ? { ...(l.hoursByDate ?? {}), [date]: patch.workingHours }
                    : l.hoursByDate,
                }
              : l,
          ),
        );
      } else {
        setCalendar((prev) => prev.map((d) => (d.date === date ? { ...d, ...patch } : d)));
      }
      markStale();
    },
    [markStale],
  );

  const setSmvMasterRecords = useCallback(
    (records: SmvMasterRecord[], source: string | null) => {
      setSmvMasterState(records);
      setSmvSource(source);
      markStale();
    },
    [markStale],
  );

  const upsertSmv = useCallback(
    (record: SmvMasterRecord) => {
      setSmvMasterState((prev) => {
        const idx = prev.findIndex(
          (r) => r.styleNo.toUpperCase() === record.styleNo.toUpperCase() && r.effectiveDate === record.effectiveDate,
        );
        if (idx === -1) return [record, ...prev];
        const next = [...prev];
        next[idx] = record;
        return next;
      });
      markStale();
    },
    [markStale],
  );

  const removeSmv = useCallback(
    (id: string) => {
      setSmvMasterState((prev) => prev.filter((r) => r.id !== id));
      markStale();
    },
    [markStale],
  );

  const engineInput: PlanningInput | null = useMemo(() => {
    if (!imported || !lineSettings.length || !calendar.length) return null;
    return {
      planId: imported.plan.id,
      entries: imported.entries,
      lines: imported.plan.lines,
      smvMaster,
      calendar,
      lineSettings,
      period,
      allowOverproduction,
      sources: { sewingPlan: planFileName ?? undefined, smv: smvSource ?? undefined },
    };
  }, [imported, lineSettings, calendar, smvMaster, period, allowOverproduction, planFileName, smvSource]);

  const generate = useCallback(async () => {
    if (!engineInput) return null;
    setGenerating(true);
    // let the loading state paint before the synchronous engine run
    await new Promise((r) => setTimeout(r, 30));
    try {
      const res = runPlanningEngineCached(engineInput);
      setResult(res);
      setStale(false);
      return res;
    } finally {
      setGenerating(false);
    }
  }, [engineInput]);

  const reset = useCallback(() => {
    setImportedState(null);
    setPlanFileName(null);
    setPlanFileSize(null);
    setResult(null);
    setStale(false);
  }, []);

  const value: Ctx = {
    ready,
    imported,
    planFileName,
    planFileSize,
    period,
    lineSettings,
    calendar,
    smvMaster,
    smvSource,
    allowOverproduction,
    result,
    generating,
    stale,
    setImported,
    setPeriod,
    patchLine,
    patchRamp,
    applyToAllLines,
    setDayStatus,
    setSmvMaster: setSmvMasterRecords,
    upsertSmv,
    removeSmv,
    setAllowOverproduction: (v: boolean) => {
      setAllowOverproduction(v);
      markStale();
    },
    generate,
    engineInput,
    reset,
  };

  return <PlanningContext.Provider value={value}>{children}</PlanningContext.Provider>;
}

export function usePlanning(): Ctx {
  const ctx = useContext(PlanningContext);
  if (!ctx) throw new Error("usePlanning must be used inside <PlanningProvider>");
  return ctx;
}

/** Styles in the sewing plan that have no usable SMV — blocks plan generation. */
export function missingSmvStyles(ctx: Pick<Ctx, "imported" | "smvMaster">): string[] {
  if (!ctx.imported) return [];
  const known = new Set(ctx.smvMaster.filter((r) => r.smv && r.smv > 0).map((r) => r.styleNo.toUpperCase()));
  const out = new Set<string>();
  for (const e of ctx.imported.entries) {
    if (!e.styleNo) continue;
    const key = e.styleNo.toUpperCase();
    if (!known.has(key)) out.add(e.styleNo);
  }
  return [...out].sort();
}
