/**
 * D1 data access. All reads and writes are scoped by factory_id — factory
 * isolation is enforced here, not in the browser.
 */
import type { SewingPlanEntry, SmvMasterRecord, WorkingCalendarDay } from "@/lib/import/types";
import type { LinePlanSettings, PlanningResult } from "@/planning/types";

import { requireDb, type D1Database, type D1PreparedStatement } from "./bindings.server";
import { newId } from "./http.server";

const CHUNK = 60; // statements per D1 batch

async function runBatches(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  for (let i = 0; i < statements.length; i += CHUNK) {
    await db.batch(statements.slice(i, i + CHUNK));
  }
}

/* --------------------------------------------------------------- versions */

function pad(n: number, width = 3): string {
  return String(n).padStart(width, "0");
}

/** SP-2026-09-001 / PLAN-2026-09-001 / PBP-2026-09-001 — sequential per period. */
export async function nextVersionId(
  prefix: "SP" | "PLAN" | "PBP",
  table: "sewing_plans" | "production_plans" | "reports",
  factoryId: string,
  period: string,
): Promise<{ id: string; version: number }> {
  const db = await requireDb();
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE factory_id = ?1 AND id LIKE ?2`)
    .bind(factoryId, `${prefix}-${period}-%`)
    .first<{ n: number }>();
  const version = (row?.n ?? 0) + 1;
  return { id: `${prefix}-${period}-${pad(version)}`, version };
}

/* ----------------------------------------------------------- sewing plans */

export type SewingPlanRow = {
  id: string;
  factory_id: string;
  file_name: string;
  file_hash: string;
  storage_key: string;
  file_size: number;
  planning_period: string | null;
  period_from: string | null;
  period_to: string | null;
  version: number;
  status: string;
  uploaded_by: string | null;
  uploaded_at: string;
  summary_json: string | null;
};

export async function findPlanByHash(factoryId: string, hash: string): Promise<SewingPlanRow | null> {
  const db = await requireDb();
  return db
    .prepare("SELECT * FROM sewing_plans WHERE factory_id = ?1 AND file_hash = ?2 ORDER BY uploaded_at DESC LIMIT 1")
    .bind(factoryId, hash)
    .first<SewingPlanRow>();
}

export async function listSewingPlans(
  factoryId: string,
  limit: number,
  offset: number,
): Promise<SewingPlanRow[]> {
  const db = await requireDb();
  const res = await db
    .prepare(
      "SELECT * FROM sewing_plans WHERE factory_id = ?1 AND status != 'ARCHIVED' ORDER BY uploaded_at DESC LIMIT ?2 OFFSET ?3",
    )
    .bind(factoryId, limit, offset)
    .all<SewingPlanRow>();
  return res.results;
}

export async function getSewingPlan(factoryId: string, id: string): Promise<SewingPlanRow | null> {
  const db = await requireDb();
  return db
    .prepare("SELECT * FROM sewing_plans WHERE factory_id = ?1 AND id = ?2")
    .bind(factoryId, id)
    .first<SewingPlanRow>();
}

export async function insertSewingPlan(row: Omit<SewingPlanRow, "uploaded_at">): Promise<void> {
  const db = await requireDb();
  await db
    .prepare(
      "INSERT INTO sewing_plans (id, factory_id, file_name, file_hash, storage_key, file_size, planning_period, period_from, period_to, version, status, uploaded_by, summary_json) " +
        "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
    )
    .bind(
      row.id,
      row.factory_id,
      row.file_name,
      row.file_hash,
      row.storage_key,
      row.file_size,
      row.planning_period,
      row.period_from,
      row.period_to,
      row.version,
      row.status,
      row.uploaded_by,
      row.summary_json,
    )
    .run();
}

export async function setSewingPlanStatus(factoryId: string, id: string, status: string): Promise<void> {
  const db = await requireDb();
  await db
    .prepare("UPDATE sewing_plans SET status = ?3 WHERE factory_id = ?1 AND id = ?2")
    .bind(factoryId, id, status)
    .run();
}

export async function insertEntries(
  factoryId: string,
  sewingPlanId: string,
  entries: SewingPlanEntry[],
): Promise<void> {
  const db = await requireDb();
  const sql =
    "INSERT INTO sewing_plan_entries (id, sewing_plan_id, factory_id, entry_date, day_label, line_id, line_no, line_label, raw_text, entry_type, style_no, secondary_code, po_no, order_qty, target_qty, quantities_json, delivery_start, delivery_end, delivery_raw, buyer, planner, season, source_sheet, source_row, source_column, parse_status, flags_json) " +
    "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27)";
  const statements = entries.map((e) =>
    db
      .prepare(sql)
      .bind(
        e.id,
        sewingPlanId,
        factoryId,
        e.date,
        e.dayLabel,
        e.lineId,
        e.lineNo,
        e.lineLabel,
        e.rawText,
        e.entryType,
        e.styleNo,
        e.secondaryCode,
        e.poNo,
        e.orderQty,
        e.targetQty,
        JSON.stringify(e.quantities),
        e.deliveryDateStart,
        e.deliveryDateEnd,
        e.deliveryDateRaw,
        e.buyer,
        e.planner,
        e.season,
        e.sourceSheet,
        e.sourceRow,
        e.sourceColumn,
        e.parseStatus,
        JSON.stringify(e.flags),
      ),
  );
  await runBatches(db, statements);
}

export async function listEntries(
  factoryId: string,
  sewingPlanId: string,
  opts: { limit: number; offset: number; line?: string; style?: string; date?: string },
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  const db = await requireDb();
  const where = ["factory_id = ?1", "sewing_plan_id = ?2"];
  const binds: unknown[] = [factoryId, sewingPlanId];
  if (opts.line) {
    binds.push(opts.line);
    where.push(`line_id = ?${binds.length}`);
  }
  if (opts.style) {
    binds.push(opts.style);
    where.push(`style_no = ?${binds.length}`);
  }
  if (opts.date) {
    binds.push(opts.date);
    where.push(`entry_date = ?${binds.length}`);
  }
  const clause = where.join(" AND ");
  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM sewing_plan_entries WHERE ${clause}`)
    .bind(...binds)
    .first<{ n: number }>();
  const res = await db
    .prepare(
      `SELECT * FROM sewing_plan_entries WHERE ${clause} ORDER BY entry_date, line_no LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`,
    )
    .bind(...binds, opts.limit, opts.offset)
    .all();
  return { rows: res.results, total: totalRow?.n ?? 0 };
}

export async function insertValidationIssues(
  factoryId: string,
  entityType: string,
  entityId: string,
  issues: { severity: string; code: string; message: string }[],
): Promise<void> {
  if (!issues.length) return;
  const db = await requireDb();
  const statements = issues.map((i) =>
    db
      .prepare(
        "INSERT INTO validation_issues (id, factory_id, entity_type, entity_id, severity, code, message) VALUES (?1,?2,?3,?4,?5,?6,?7)",
      )
      .bind(newId("vis"), factoryId, entityType, entityId, i.severity, i.code, i.message),
  );
  await runBatches(db, statements);
}

/* -------------------------------------------------------------------- SMV */

export async function createSmvVersion(args: {
  factoryId: string;
  fileName: string | null;
  fileHash: string | null;
  storageKey: string | null;
  fileSize: number;
  source: string;
  records: SmvMasterRecord[];
  createdBy: string;
}): Promise<{ id: string; version: number }> {
  const db = await requireDb();
  const countRow = await db
    .prepare("SELECT COUNT(*) AS n FROM smv_versions WHERE factory_id = ?1")
    .bind(args.factoryId)
    .first<{ n: number }>();
  const version = (countRow?.n ?? 0) + 1;
  const id = `SMV-v${pad(version)}`;

  await db
    .prepare(
      "INSERT INTO smv_versions (id, factory_id, file_name, file_hash, storage_key, file_size, version, source, record_count, created_by) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
    )
    .bind(
      id,
      args.factoryId,
      args.fileName,
      args.fileHash,
      args.storageKey,
      args.fileSize,
      version,
      args.source,
      args.records.length,
      args.createdBy,
    )
    .run();

  const statements = args.records.map((r) =>
    db
      .prepare(
        "INSERT INTO smv_master (id, factory_id, smv_version_id, style_no, buyer, smv, effective_date, status, source) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
      )
      .bind(newId("smv"), args.factoryId, id, r.styleNo, r.buyer, r.smv, r.effectiveDate, r.status, r.source),
  );
  await runBatches(db, statements);
  return { id, version };
}

export async function latestSmvVersion(factoryId: string): Promise<{ id: string; version: number } | null> {
  const db = await requireDb();
  return db
    .prepare(
      "SELECT id, version FROM smv_versions WHERE factory_id = ?1 AND status = 'ACTIVE' ORDER BY version DESC LIMIT 1",
    )
    .bind(factoryId)
    .first<{ id: string; version: number }>();
}

export async function listSmv(factoryId: string, versionId: string | null): Promise<SmvMasterRecord[]> {
  const db = await requireDb();
  const version = versionId ?? (await latestSmvVersion(factoryId))?.id;
  if (!version) return [];
  const res = await db
    .prepare("SELECT * FROM smv_master WHERE factory_id = ?1 AND smv_version_id = ?2 ORDER BY style_no")
    .bind(factoryId, version)
    .all<{
      id: string;
      style_no: string;
      buyer: string | null;
      smv: number | null;
      effective_date: string | null;
      status: SmvMasterRecord["status"];
      source: string;
      updated_at: string;
    }>();
  return res.results.map((r) => ({
    id: r.id,
    styleNo: r.style_no,
    buyer: r.buyer,
    smv: r.smv,
    effectiveDate: r.effective_date,
    status: r.status,
    source: r.source,
    updatedAt: r.updated_at,
  }));
}

/* --------------------------------------------------------------- calendar */

export async function saveCalendar(
  factoryId: string,
  period: string,
  days: WorkingCalendarDay[],
  createdBy: string,
): Promise<{ id: string; version: number }> {
  const db = await requireDb();
  const countRow = await db
    .prepare("SELECT COUNT(*) AS n FROM calendar_versions WHERE factory_id = ?1 AND period = ?2")
    .bind(factoryId, period)
    .first<{ n: number }>();
  const version = (countRow?.n ?? 0) + 1;
  const id = `CAL-${period}-${pad(version)}`;

  await db
    .prepare("INSERT INTO calendar_versions (id, factory_id, period, version, created_by) VALUES (?1,?2,?3,?4,?5)")
    .bind(id, factoryId, period, version, createdBy)
    .run();

  const statements = days.map((d) =>
    db
      .prepare(
        "INSERT INTO working_calendar (id, calendar_version_id, factory_id, calendar_date, day_label, working_status, holiday_type, holiday_reason, working_hours) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
      )
      .bind(newId("cal"), id, factoryId, d.date, d.day, d.workingStatus, d.holidayType, d.holidayReason, d.workingHours),
  );
  await runBatches(db, statements);
  return { id, version };
}

export async function latestCalendar(
  factoryId: string,
  period: string,
): Promise<{ id: string; days: WorkingCalendarDay[] } | null> {
  const db = await requireDb();
  const version = await db
    .prepare("SELECT id FROM calendar_versions WHERE factory_id = ?1 AND period = ?2 ORDER BY version DESC LIMIT 1")
    .bind(factoryId, period)
    .first<{ id: string }>();
  if (!version) return null;
  const res = await db
    .prepare("SELECT * FROM working_calendar WHERE calendar_version_id = ?1 ORDER BY calendar_date")
    .bind(version.id)
    .all<{
      calendar_date: string;
      day_label: string;
      working_status: WorkingCalendarDay["workingStatus"];
      holiday_type: string | null;
      holiday_reason: string | null;
      working_hours: number;
    }>();
  return {
    id: version.id,
    days: res.results.map((r) => ({
      date: r.calendar_date,
      day: r.day_label,
      workingStatus: r.working_status,
      holidayType: r.holiday_type,
      holidayReason: r.holiday_reason,
      workingHours: r.working_hours,
    })),
  };
}

/* ---------------------------------------------------------- line settings */

export async function saveLineSettings(
  factoryId: string,
  period: string,
  settings: LinePlanSettings[],
  updatedBy: string,
): Promise<void> {
  const db = await requireDb();
  const statements = settings.map((s) =>
    db
      .prepare(
        "INSERT INTO line_settings (id, factory_id, line_id, period, active, working_hours, manpower, ramp_json, hours_by_date_json, overrides_json, updated_by, updated_at) " +
          "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,datetime('now')) " +
          "ON CONFLICT(factory_id, line_id, period) DO UPDATE SET active=?5, working_hours=?6, manpower=?7, ramp_json=?8, hours_by_date_json=?9, overrides_json=?10, updated_by=?11, updated_at=datetime('now')",
      )
      .bind(
        newId("lst"),
        factoryId,
        s.lineId,
        period,
        s.active ? 1 : 0,
        s.workingHours,
        s.manpower,
        JSON.stringify(s.ramp),
        JSON.stringify(s.hoursByDate ?? {}),
        JSON.stringify(s.calendarOverrides ?? {}),
        updatedBy,
      ),
  );
  await runBatches(db, statements);
}

/* -------------------------------------------------------- production plan */

export async function findPlanByIdempotencyKey(
  factoryId: string,
  key: string,
): Promise<{ id: string } | null> {
  const db = await requireDb();
  return db
    .prepare("SELECT id FROM production_plans WHERE factory_id = ?1 AND idempotency_key = ?2")
    .bind(factoryId, key)
    .first<{ id: string }>();
}

export async function saveProductionPlan(args: {
  factoryId: string;
  period: string;
  sewingPlanId: string;
  smvVersionId: string | null;
  calendarVersionId: string | null;
  scenarioId: string | null;
  idempotencyKey: string | null;
  generatedBy: string;
  result: PlanningResult;
  snapshot: unknown;
}): Promise<{ id: string; version: number }> {
  const db = await requireDb();
  const { id, version } = await nextVersionId("PLAN", "production_plans", args.factoryId, args.period);

  await db
    .prepare(
      "INSERT INTO production_plans (id, factory_id, version, period, period_from, period_to, sewing_plan_id, smv_version_id, calendar_version_id, scenario_id, snapshot_json, summary_json, status, idempotency_key, generated_by) " +
        "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'GENERATED',?13,?14)",
    )
    .bind(
      id,
      args.factoryId,
      version,
      args.period,
      args.result.audit.period.from,
      args.result.audit.period.to,
      args.sewingPlanId,
      args.smvVersionId,
      args.calendarVersionId,
      args.scenarioId,
      JSON.stringify(args.snapshot),
      JSON.stringify(args.result.factory),
      args.idempotencyKey,
      args.generatedBy,
    )
    .run();

  const dayStatements = args.result.days.map((d) =>
    db
      .prepare(
        "INSERT INTO production_plan_days (id, plan_id, factory_id, plan_date, line_id, line_name, style_no, po_no, smv, working_hours, manpower, efficiency, available_minutes, earned_minutes, daily_capacity, required_qty, planned_qty, cumulative_qty, remaining_qty, capacity_gap, ramp_day, style_change, status) " +
          "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)",
      )
      .bind(
        d.planDayId,
        id,
        args.factoryId,
        d.date,
        d.lineId,
        d.lineName,
        d.styleNo,
        d.poNo,
        d.smv,
        d.workingHours,
        d.manpower,
        d.efficiency,
        d.availableMinutes,
        d.earnedMinutes,
        d.dailyCapacity,
        d.requiredQty,
        d.plannedQty,
        d.cumulativeQty,
        d.remainingQty,
        d.capacityGap,
        d.rampDay,
        d.styleChange ? 1 : 0,
        d.status,
      ),
  );

  const runById = new Map(args.result.runs.map((r) => [r.id, r]));
  const itemStatements = args.result.orders.map((o, index) => {
    const run = runById.get(o.runId);
    return db
      .prepare(
        "INSERT INTO production_plan_items (id, plan_id, factory_id, line_id, line_name, style_no, secondary_code, po_no, buyer, smv, smv_status, order_qty, planned_qty, remaining_qty, shortage_qty, start_date, end_date, projected_completion, sequence, status) " +
          "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)",
      )
      .bind(
        newId("pli"),
        id,
        args.factoryId,
        o.lineId,
        o.lineName,
        o.styleNo,
        run?.secondaryCode ?? null,
        o.poNo,
        run?.buyer ?? null,
        o.smv,
        run?.smvStatus ?? null,
        o.orderQty,
        o.plannedQty,
        o.remainingQty,
        o.shortageQty,
        o.plannedStartDate,
        o.plannedEndDate,
        o.projectedCompletionDate,
        run?.sequence ?? index,
        o.status,
      );
  });

  const lineStatements = args.result.lineSummaries.map((l) =>
    db
      .prepare(
        "INSERT INTO production_plan_lines (id, plan_id, line_id, line_name, active, working_days, total_capacity, total_planned, total_required, available_minutes, earned_minutes, efficiency, capacity_gap, style_changes) " +
          "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
      )
      .bind(
        newId("pln"),
        id,
        l.lineId,
        l.lineName,
        l.active ? 1 : 0,
        l.workingDays,
        l.totalCapacity,
        l.totalPlanned,
        l.totalRequired,
        l.availableMinutes,
        l.earnedMinutes,
        l.efficiency,
        l.capacityGap,
        l.styleChanges,
      ),
  );

  await runBatches(db, [...dayStatements, ...itemStatements, ...lineStatements]);
  return { id, version };
}

export async function listProductionPlans(factoryId: string, limit: number, offset: number) {
  const db = await requireDb();
  const res = await db
    .prepare(
      "SELECT id, version, period, period_from, period_to, sewing_plan_id, smv_version_id, calendar_version_id, scenario_id, status, summary_json, generated_by, generated_at " +
        "FROM production_plans WHERE factory_id = ?1 ORDER BY generated_at DESC LIMIT ?2 OFFSET ?3",
    )
    .bind(factoryId, limit, offset)
    .all();
  return res.results;
}

export async function getProductionPlan(factoryId: string, id: string) {
  const db = await requireDb();
  return db
    .prepare("SELECT * FROM production_plans WHERE factory_id = ?1 AND id = ?2")
    .bind(factoryId, id)
    .first<Record<string, unknown>>();
}

export async function getPlanLines(planId: string) {
  const db = await requireDb();
  return (await db.prepare("SELECT * FROM production_plan_lines WHERE plan_id = ?1 ORDER BY line_name").bind(planId).all())
    .results;
}

export async function getPlanItems(planId: string, limit: number, offset: number) {
  const db = await requireDb();
  return (
    await db
      .prepare("SELECT * FROM production_plan_items WHERE plan_id = ?1 ORDER BY line_name, sequence LIMIT ?2 OFFSET ?3")
      .bind(planId, limit, offset)
      .all()
  ).results;
}

export async function getPlanDays(planId: string, limit: number, offset: number) {
  const db = await requireDb();
  return (
    await db
      .prepare("SELECT * FROM production_plan_days WHERE plan_id = ?1 ORDER BY plan_date, line_name LIMIT ?2 OFFSET ?3")
      .bind(planId, limit, offset)
      .all()
  ).results;
}

/* ------------------------------------------------------------- scenarios */

export async function createScenario(factoryId: string, name: string, overrides: unknown, createdBy: string) {
  const db = await requireDb();
  const id = newId("scn");
  await db
    .prepare("INSERT INTO scenarios (id, factory_id, name, overrides_json, created_by) VALUES (?1,?2,?3,?4,?5)")
    .bind(id, factoryId, name, JSON.stringify(overrides ?? {}), createdBy)
    .run();
  return { id, name };
}

export async function listScenarios(factoryId: string) {
  const db = await requireDb();
  return (
    await db
      .prepare("SELECT id, name, overrides_json, is_base, created_at FROM scenarios WHERE factory_id = ?1 ORDER BY created_at DESC")
      .bind(factoryId)
      .all()
  ).results;
}

/* --------------------------------------------------------------- reports */

export async function saveReport(args: {
  factoryId: string;
  planId: string;
  period: string;
  scenarioId: string | null;
  scenarioName: string | null;
  status: string;
  blockers: unknown;
  snapshot: unknown;
  totals: unknown;
  generatedBy: string;
}): Promise<{ id: string; version: number }> {
  const db = await requireDb();
  const { id, version } = await nextVersionId("PBP", "reports", args.factoryId, args.period);
  await db
    .prepare(
      "INSERT INTO reports (id, factory_id, plan_id, version, period, scenario_id, scenario_name, status, blockers_json, snapshot_json, totals_json, generated_by) " +
        "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
    )
    .bind(
      id,
      args.factoryId,
      args.planId,
      version,
      args.period,
      args.scenarioId,
      args.scenarioName,
      args.status,
      JSON.stringify(args.blockers ?? []),
      JSON.stringify(args.snapshot ?? {}),
      JSON.stringify(args.totals ?? {}),
      args.generatedBy,
    )
    .run();
  return { id, version };
}

export async function listReports(factoryId: string, limit: number, offset: number) {
  const db = await requireDb();
  return (
    await db
      .prepare(
        "SELECT id, plan_id, version, period, scenario_name, status, totals_json, generated_by, generated_at FROM reports WHERE factory_id = ?1 ORDER BY generated_at DESC LIMIT ?2 OFFSET ?3",
      )
      .bind(factoryId, limit, offset)
      .all()
  ).results;
}

export async function getReport(factoryId: string, id: string) {
  const db = await requireDb();
  return db
    .prepare("SELECT * FROM reports WHERE factory_id = ?1 AND id = ?2")
    .bind(factoryId, id)
    .first<Record<string, unknown>>();
}

export async function saveReportExport(args: {
  reportId: string;
  factoryId: string;
  fileName: string;
  storageKey: string;
  fileSize: number;
  createdBy: string;
}): Promise<string> {
  const db = await requireDb();
  const id = newId("rex");
  await db
    .prepare(
      "INSERT INTO report_exports (id, report_id, factory_id, file_name, storage_key, file_size, created_by) VALUES (?1,?2,?3,?4,?5,?6,?7)",
    )
    .bind(id, args.reportId, args.factoryId, args.fileName, args.storageKey, args.fileSize, args.createdBy)
    .run();
  await db.prepare("UPDATE reports SET status = 'EXPORTED' WHERE id = ?1").bind(args.reportId).run();
  return id;
}

export async function latestReportExport(factoryId: string, reportId: string) {
  const db = await requireDb();
  return db
    .prepare(
      "SELECT * FROM report_exports WHERE factory_id = ?1 AND report_id = ?2 AND status = 'STORED' ORDER BY created_at DESC LIMIT 1",
    )
    .bind(factoryId, reportId)
    .first<{ id: string; file_name: string; storage_key: string; file_size: number }>();
}

/* ------------------------------------------- rehydration for the engine */

/**
 * Loads all normalized entries of a sewing plan version back into the exact
 * shape the Phase 2 planning engine expects. The engine is never re-implemented
 * server-side — it is the same module the browser uses.
 */
export async function loadPlanEntries(
  factoryId: string,
  sewingPlanId: string,
): Promise<{ entries: SewingPlanEntry[]; lines: { id: string; factoryId: string; label: string; lineNo: number }[] }> {
  const db = await requireDb();
  const res = await db
    .prepare(
      "SELECT * FROM sewing_plan_entries WHERE factory_id = ?1 AND sewing_plan_id = ?2 ORDER BY entry_date, line_no",
    )
    .bind(factoryId, sewingPlanId)
    .all<Record<string, never>>();

  const entries = (res.results as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r["id"]),
    planId: sewingPlanId,
    date: String(r["entry_date"]),
    dayLabel: String(r["day_label"] ?? ""),
    lineId: String(r["line_id"]),
    lineNo: Number(r["line_no"] ?? 0),
    lineLabel: String(r["line_label"] ?? ""),
    rawText: String(r["raw_text"] ?? ""),
    entryType: r["entry_type"] as SewingPlanEntry["entryType"],
    styleNo: (r["style_no"] as string | null) ?? null,
    secondaryCode: (r["secondary_code"] as string | null) ?? null,
    poNo: (r["po_no"] as string | null) ?? null,
    quantities: r["quantities_json"] ? (JSON.parse(String(r["quantities_json"])) as SewingPlanEntry["quantities"]) : [],
    orderQty: (r["order_qty"] as number | null) ?? null,
    deliveryDateStart: (r["delivery_start"] as string | null) ?? null,
    deliveryDateEnd: (r["delivery_end"] as string | null) ?? null,
    deliveryDateRaw: (r["delivery_raw"] as string | null) ?? null,
    buyer: (r["buyer"] as string | null) ?? null,
    planner: (r["planner"] as string | null) ?? null,
    season: (r["season"] as string | null) ?? null,
    additionalDescription: null,
    targetQty: (r["target_qty"] as number | null) ?? null,
    sourceSheet: String(r["source_sheet"] ?? ""),
    sourceRow: Number(r["source_row"] ?? 0),
    sourceColumn: Number(r["source_column"] ?? 0),
    parseStatus: r["parse_status"] as SewingPlanEntry["parseStatus"],
    flags: r["flags_json"] ? (JSON.parse(String(r["flags_json"])) as string[]) : [],
  })) satisfies SewingPlanEntry[];

  const seen = new Map<string, { id: string; factoryId: string; label: string; lineNo: number }>();
  for (const e of entries) {
    if (!seen.has(e.lineId)) {
      seen.set(e.lineId, { id: e.lineId, factoryId, label: e.lineLabel, lineNo: e.lineNo });
    }
  }
  return { entries, lines: [...seen.values()].sort((a, b) => a.lineNo - b.lineNo) };
}

export async function loadLineSettings(
  factoryId: string,
  period: string,
): Promise<LinePlanSettings[]> {
  const db = await requireDb();
  const res = await db
    .prepare("SELECT * FROM line_settings WHERE factory_id = ?1 AND period = ?2")
    .bind(factoryId, period)
    .all<Record<string, never>>();
  return (res.results as unknown as Record<string, unknown>[]).map((r) => ({
    lineId: String(r["line_id"]),
    lineName: String(r["line_id"]),
    active: Number(r["active"]) === 1,
    workingHours: Number(r["working_hours"]),
    manpower: Number(r["manpower"]),
    ramp: JSON.parse(String(r["ramp_json"] ?? "{}")) as LinePlanSettings["ramp"],
    hoursByDate: JSON.parse(String(r["hours_by_date_json"] ?? "{}")) as Record<string, number>,
    calendarOverrides: JSON.parse(String(r["overrides_json"] ?? "{}")) as LinePlanSettings["calendarOverrides"],
  }));
}

export async function calendarByVersion(versionId: string): Promise<WorkingCalendarDay[]> {
  const db = await requireDb();
  const res = await db
    .prepare("SELECT * FROM working_calendar WHERE calendar_version_id = ?1 ORDER BY calendar_date")
    .bind(versionId)
    .all<{
      calendar_date: string;
      day_label: string;
      working_status: WorkingCalendarDay["workingStatus"];
      holiday_type: string | null;
      holiday_reason: string | null;
      working_hours: number;
    }>();
  return res.results.map((r) => ({
    date: r.calendar_date,
    day: r.day_label,
    workingStatus: r.working_status,
    holidayType: r.holiday_type,
    holidayReason: r.holiday_reason,
    workingHours: r.working_hours,
  }));
}
