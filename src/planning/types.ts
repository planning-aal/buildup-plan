/**
 * Phase 2 planning engine contracts.
 *
 * Nothing in here references an Excel cell address. The engine consumes the
 * Phase 1 normalized records plus configuration, and returns structured
 * results that the UI and (later) the export layer render.
 */
import type {
  SewingLine,
  SewingPlanEntry,
  SmvMasterRecord,
  ValidationIssue,
  WorkingCalendarDay,
} from "@/lib/import/types";

export type RampMode = "NONE" | "FIXED" | "CUSTOM";

export type RampProfile = {
  mode: RampMode;
  /** decimal, e.g. 0.5 */
  startEfficiency: number;
  /** decimal, e.g. 0.8 — efficiency never exceeds this */
  maxEfficiency: number;
  /** decimal added per working day in FIXED mode, e.g. 0.05 */
  rampStep: number;
  /** working-day index (1-based) → efficiency, used in CUSTOM mode */
  customValues: Record<number, number>;
};

export type LinePlanSettings = {
  lineId: string;
  lineName: string;
  active: boolean;
  workingHours: number;
  manpower: number;
  ramp: RampProfile;
  /** date → hours, overrides workingHours for that date only */
  hoursByDate?: Record<string, number>;
  /** date → working status override for this line only */
  calendarOverrides?: Record<string, WorkingCalendarDay["workingStatus"]>;
};

export type PlanningPeriod = { from: string; to: string };

export type ScenarioOverrides = {
  /** applied to every active line unless a per-line override exists */
  workingHours?: number;
  manpower?: number;
  maxEfficiency?: number;
  startEfficiency?: number;
  rampStep?: number;
  rampMode?: RampMode;
  allowOverproduction?: boolean;
  /** lineId → partial line settings */
  lines?: Record<string, Partial<Omit<LinePlanSettings, "lineId" | "ramp">> & { ramp?: Partial<RampProfile> }>;
  /** date → status, applied to the factory calendar */
  calendar?: Record<string, WorkingCalendarDay["workingStatus"]>;
  /** styleNo → smv, overriding the master for this scenario only */
  smv?: Record<string, number>;
};

export type Scenario = {
  id: string;
  name: string;
  overrides: ScenarioOverrides;
};

export const BASE_SCENARIO: Scenario = { id: "base", name: "Base plan", overrides: {} };

export type PlanningInput = {
  planId: string;
  entries: SewingPlanEntry[];
  lines: SewingLine[];
  smvMaster: SmvMasterRecord[];
  calendar: WorkingCalendarDay[];
  lineSettings: LinePlanSettings[];
  period: PlanningPeriod;
  allowOverproduction?: boolean;
  scenario?: Scenario;
  /** provenance, carried into the audit trail */
  sources?: { sewingPlan?: string; smv?: string; calendar?: string };
};

export type DayStatus =
  | "PLANNED"
  | "IDLE"
  | "HOLIDAY"
  | "WEEKLY_OFF"
  | "LINE_OFF"
  | "SMV_MISSING"
  | "ORDER_COMPLETE";

export type DailyPlanRecord = {
  planDayId: string;
  planId: string;
  date: string;
  lineId: string;
  lineName: string;
  styleNo: string | null;
  poNo: string | null;
  smv: number | null;
  workingHours: number;
  manpower: number;
  /** decimal, full precision */
  efficiency: number;
  availableMinutes: number;
  effectiveMinutes: number;
  dailyCapacity: number;
  /** target read from the sewing plan for that line/date, when present */
  requiredQty: number | null;
  plannedQty: number;
  cumulativeQty: number;
  remainingQty: number | null;
  earnedMinutes: number;
  capacityGap: number | null;
  styleChange: boolean;
  /** 1-based ramp index counting working days only; 0 on non-working days */
  rampDay: number;
  status: DayStatus;
};

export type OrderCompletionStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CAPACITY_SHORTAGE"
  | "SMV_MISSING"
  | "VALIDATION_ERROR";

export type StyleRun = {
  id: string;
  lineId: string;
  lineName: string;
  styleNo: string | null;
  secondaryCode: string | null;
  poNo: string | null;
  buyer: string | null;
  orderQty: number | null;
  smv: number | null;
  smvStatus: "SMV_FOUND" | "SMV_MISSING" | "SMV_INVALID";
  startDate: string;
  /** last date of the run inside the sewing plan sequence */
  endDate: string;
  sequence: number;
};

export type OrderPlan = {
  runId: string;
  lineId: string;
  lineName: string;
  styleNo: string | null;
  poNo: string | null;
  orderQty: number | null;
  smv: number | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  plannedQty: number;
  remainingQty: number | null;
  /** quantity that does not fit inside the planning period */
  shortageQty: number;
  /** date the order would finish if the period were extended at the last rate */
  projectedCompletionDate: string | null;
  status: OrderCompletionStatus;
};

export type StyleChangeRecord = {
  lineId: string;
  lineName: string;
  date: string;
  previousStyle: string | null;
  newStyle: string | null;
};

export type LineSummary = {
  lineId: string;
  lineName: string;
  active: boolean;
  workingDays: number;
  totalCapacity: number;
  totalPlanned: number;
  totalRequired: number;
  availableMinutes: number;
  earnedMinutes: number;
  /** earned / available */
  efficiency: number;
  capacityGap: number;
  styleChanges: number;
};

export type FactorySummary = {
  totalOrderQty: number;
  totalPlannedQty: number;
  totalCapacity: number;
  totalRequired: number;
  totalAvailableMinutes: number;
  totalEarnedMinutes: number;
  /** weighted: earned / available */
  averageEfficiency: number;
  capacitySurplus: number;
  capacityShortage: number;
  ordersCompleted: number;
  ordersWithShortage: number;
  styleChanges: number;
};

export type PlanningAudit = {
  planId: string;
  resultId: string;
  generatedAt: string;
  period: PlanningPeriod;
  scenarioId: string;
  scenarioName: string;
  sewingPlanSource: string | null;
  smvSource: string | null;
  calendarVersion: string | null;
  lineSettings: LinePlanSettings[];
  allowOverproduction: boolean;
};

export type PlanningResult = {
  audit: PlanningAudit;
  days: DailyPlanRecord[];
  runs: StyleRun[];
  orders: OrderPlan[];
  styleChanges: StyleChangeRecord[];
  lineSummaries: LineSummary[];
  factory: FactorySummary;
  issues: ValidationIssue[];
};

export type ScenarioComparisonRow = {
  scenarioId: string;
  scenarioName: string;
  totalCapacity: number;
  totalPlanned: number;
  capacityGap: number;
  averageEfficiency: number;
  lastPlannedDate: string | null;
  ordersCompleted: number;
  ordersWithShortage: number;
};
