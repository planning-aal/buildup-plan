/**
 * Phase 1 normalized data model for the Armana production planning system.
 *
 * These types are the contract between the parsing layer and everything that
 * comes later (planning engine, reports, Excel export). Nothing here assumes a
 * fixed number of sewing lines, a fixed sheet layout or a fixed working day.
 */

export type EntryType =
  | "STYLE"
  | "PO"
  | "BALANCE"
  | "LINE_SUPPORT"
  | "TOTAL_QTY"
  | "INSTRUCTION"
  | "OTHER"
  | "UNKNOWN";

export type ParseStatus = "PARSED" | "PARTIAL" | "UNPARSED" | "EMPTY";

export type Factory = {
  id: string;
  name: string;
  floors: string[];
};

export type SewingLine = {
  id: string;
  factoryId: string;
  /** printed label, e.g. "LINE-7" */
  label: string;
  /** numeric order when the label contains one; otherwise sequence index */
  lineNo: number;
  floor?: string;
};

export type SewingPlan = {
  id: string;
  factoryId: string;
  fileName: string;
  importedAt: string;
  /** "UPDATE ON :" date found in the sheet header, when present */
  updatedOn?: string;
  sheets: SheetInfo[];
  lines: SewingLine[];
  dateRange: { from: string; to: string } | null;
};

export type SheetInfo = {
  name: string;
  kind: "DAILY_LINE_GRID" | "STYLE_BLOCKS" | "LINE_QTY_GRID" | "UNKNOWN";
  rows: number;
  columns: number;
  headerRow: number | null;
  lineLabels: string[];
};

export type Quantity = {
  value: number;
  /** text the number came from, kept for audit */
  raw: string;
};

export type SewingPlanEntry = {
  id: string;
  planId: string;
  /** yyyy-mm-dd */
  date: string;
  dayLabel: string;
  lineId: string;
  lineNo: number;
  lineLabel: string;

  /** never modified — the exact cell text */
  rawText: string;
  entryType: EntryType;

  styleNo: string | null;
  secondaryCode: string | null;
  poNo: string | null;
  /** every quantity found in the cell; never silently merged */
  quantities: Quantity[];
  orderQty: number | null;
  deliveryDateStart: string | null;
  deliveryDateEnd: string | null;
  deliveryDateRaw: string | null;
  buyer: string | null;
  planner: string | null;
  season: string | null;
  additionalDescription: string | null;

  /** target from the TARGET column belonging to this line/date */
  targetQty: number | null;

  sourceSheet: string;
  sourceRow: number;
  sourceColumn: number;
  parseStatus: ParseStatus;
  flags: string[];
};

/** A style block found in a secondary sheet (Sheet1-style layouts). */
export type StyleBlockRecord = {
  id: string;
  planId: string;
  styleNo: string | null;
  secondaryCode: string | null;
  orderQty: number | null;
  date: string;
  lineLabel: string;
  lineNo: number;
  plannedQty: number;
  rawBlock: string;
  sourceSheet: string;
  sourceRow: number;
};

export type IssueSeverity = "CRITICAL" | "WARNING" | "INFO";

export type ValidationIssue = {
  id: string;
  severity: IssueSeverity;
  code: string;
  message: string;
  entryId?: string;
  sourceSheet?: string;
  sourceRow?: number;
  sourceColumn?: number;
};

export type ImportSummary = {
  sheetsDetected: number;
  linesDetected: number;
  dateFrom: string | null;
  dateTo: string | null;
  planningRecords: number;
  stylesDetected: number;
  posDetected: number;
  targetsDetected: number;
  criticalErrors: number;
  warnings: number;
  infos: number;
  successfullyParsed: number;
};

export type ImportResult = {
  plan: SewingPlan;
  entries: SewingPlanEntry[];
  styleBlocks: StyleBlockRecord[];
  issues: ValidationIssue[];
  summary: ImportSummary;
};

/* ---------- master data architecture (no engine logic in phase 1) -------- */

export type SmvStatus = "SMV_FOUND" | "SMV_MISSING" | "SMV_INVALID";

export type SmvMasterRecord = {
  id: string;
  styleNo: string;
  buyer: string | null;
  smv: number | null;
  effectiveDate: string | null;
  status: SmvStatus;
  /** where the value came from: upload file name, manual entry, workbook */
  source: string;
  updatedAt: string;
};

export type WorkingStatus = "WORKING" | "HOLIDAY" | "WEEKLY_OFF" | "SPECIAL_WORKING_DAY";

export type WorkingCalendarDay = {
  date: string;
  day: string;
  workingStatus: WorkingStatus;
  holidayType: string | null;
  holidayReason: string | null;
  /** hours for the whole factory on that date; per-line overrides live in LineSettings */
  workingHours: number;
};

export type RampMode = "LINEAR" | "STEP" | "CUSTOM" | "NONE";

export type EfficiencyProfile = {
  id: string;
  name: string;
  startEfficiency: number;
  maxEfficiency: number;
  rampMode: RampMode;
  /** percentage points added per day in STEP mode */
  rampStep: number;
  /** day-index → efficiency, used when rampMode is CUSTOM */
  customValues: Record<number, number>;
};

export type LineSettingsRecord = {
  lineId: string;
  manpower: number;
  workingHours: number;
  /** date → hours, overriding workingHours for that day only */
  hoursByDate: Record<string, number>;
  efficiencyProfileId: string | null;
};

/** available minutes is always derived, never a hard-coded 480. */
export function availableMinutes(manpower: number, workingHours: number): number {
  return manpower * workingHours * 60;
}

/** Reference logic from the workbook, documented but not yet applied. */
export const REFERENCE_FORMULAS = {
  earnedMinutes: "target x smv",
  availableMinutes: "manpower x workingHours x 60  (workbook used manpower x 480)",
  efficiency: "earnedMinutes / availableMinutes",
} as const;
