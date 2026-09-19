/**
 * Reproduces a stored production plan exactly.
 *
 * The plan snapshot records every input that was used, so re-running the
 * deterministic Phase 2 engine over that snapshot returns the same result the
 * plan was generated from. This keeps one calculation source: reports and the
 * Excel workbook are never recalculated by a second engine.
 */
import type { PlanningResult } from "@/planning/types";

import { ApiError } from "./http.server";
import {
  calendarByVersion,
  getProductionPlan,
  getSewingPlan,
  listSmv,
  loadPlanEntries,
} from "./repo.server";

export type ReplayedPlan = {
  planId: string;
  period: { from: string; to: string };
  result: PlanningResult;
  snapshot: Record<string, unknown>;
  smvMaster: Awaited<ReturnType<typeof listSmv>>;
  calendar: Awaited<ReturnType<typeof calendarByVersion>>;
};

export async function replayPlan(factoryId: string, planId: string): Promise<ReplayedPlan> {
  const plan = await getProductionPlan(factoryId, planId);
  if (!plan) throw new ApiError("Production plan not found.", 404, "NOT_FOUND");

  const snapshot = JSON.parse(String(plan["snapshot_json"])) as Record<string, unknown>;
  const sewingPlanId = String(snapshot["sewingPlanId"]);
  const period = snapshot["period"] as { from: string; to: string };

  const sewingPlan = await getSewingPlan(factoryId, sewingPlanId);
  const { entries, lines } = await loadPlanEntries(factoryId, sewingPlanId);
  const calendar = await calendarByVersion(String(snapshot["calendarVersionId"]));
  const smvMaster = await listSmv(factoryId, (snapshot["smvVersionId"] as string | null) ?? null);

  const { runPlanningEngine } = await import("@/planning/PlanningEngine");
  const result = runPlanningEngine({
    planId: sewingPlanId,
    entries,
    lines,
    smvMaster,
    calendar,
    lineSettings: snapshot["lineSettings"] as never,
    period,
    allowOverproduction: Boolean(snapshot["allowOverproduction"]),
    scenario: (snapshot["scenario"] as never) ?? undefined,
    sources: {
      sewingPlan: sewingPlan?.file_name,
      smv: (snapshot["smvVersionId"] as string | null) ?? undefined,
      calendar: String(snapshot["calendarVersionId"]),
    },
  });

  return { planId, period, result, snapshot, smvMaster, calendar };
}
