/**
 * Phase 4 reporting contracts.
 *
 * A report is a pure projection of the Phase 2 planning engine result. No
 * report module recalculates capacity, efficiency or quantities — it only
 * selects, groups and labels values the engine already produced.
 */
import type { SmvMasterRecord, WorkingCalendarDay } from "@/lib/import/types";
import type { LinePlanSettings, PlanningPeriod, PlanningResult } from "@/planning/types";

export type CellValue = string | number | null;

export type CellType =
  | "text"
  | "qty"
  | "int"
  | "pct"
  | "smv"
  | "hours"
  | "date"
  | "minutes"
  | "status";

export type ReportColumn = {
  key: string;
  header: string;
  type: CellType;
  /** Excel column width in characters; the exporter clamps this. */
  width?: number;
  wrap?: boolean;
};

export type ReportRow = Record<string, CellValue>;

export type ReportTable = {
  id: string;
  /** sheet name used in the Excel workbook, e.g. "01 Summary" */
  sheetName: string;
  title: string;
  description?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  /** number of leading columns to freeze in Excel */
  freezeColumns?: number;
  /** key/value block rendered above the table (Summary, Assumptions) */
  keyValues?: { label: string; value: string }[];
  /** landscape when the table is wide */
  landscape?: boolean;
  /** totals row appended at the bottom */
  totals?: ReportRow;
};

export type ReportStatus = "DRAFT" | "VALIDATED" | "GENERATED" | "EXPORTED" | "BLOCKED";

export type ReportMeta = {
  reportId: string;
  planId: string;
  resultId: string;
  generatedAt: string;
  period: PlanningPeriod;
  periodLabel: string;
  factory: string;
  scenarioId: string;
  scenarioName: string;
  sewingPlanSource: string | null;
  smvSource: string | null;
  calendarVersion: string;
  efficiencyProfile: string;
  status: ReportStatus;
  fileName: string;
};

export type ReportBlocker = {
  code: string;
  message: string;
  count: number;
};

export type ReportSnapshot = {
  reportId: string;
  planId: string;
  resultId: string;
  generatedAt: string;
  period: PlanningPeriod;
  scenarioId: string;
  sewingPlanSource: string | null;
  smvSource: string | null;
  smvRecordCount: number;
  calendarVersion: string;
  lineSettings: LinePlanSettings[];
  allowOverproduction: boolean;
};

export type ProductionBuildupReport = {
  meta: ReportMeta;
  blockers: ReportBlocker[];
  snapshot: ReportSnapshot;
  tables: ReportTable[];
  /** headline numbers reused by the UI, the workbook and export validation */
  totals: {
    totalOrderQty: number;
    totalPlannedQty: number;
    totalCapacity: number;
    capacityGap: number;
    averageEfficiency: number;
  };
};

export type ReportContext = {
  result: PlanningResult;
  calendar: WorkingCalendarDay[];
  lineSettings: LinePlanSettings[];
  smvMaster: SmvMasterRecord[];
  period: PlanningPeriod;
  periodLabel: string;
  factory: string;
  /** styleNo (upper case) → buyer */
  buyerByStyle: Map<string, string>;
  /** styleNo (upper case) → secondary code */
  secondaryByStyle: Map<string, string>;
  /** styleNo (upper case) → order quantity seen in the sewing plan */
  reportId: string;
  generatedAt: string;
};
