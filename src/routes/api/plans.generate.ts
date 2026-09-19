/**
 * Generates a production plan version.
 *
 * The Phase 2 planning engine remains the single source of truth: this route
 * loads the stored inputs, runs the same engine module the browser uses, then
 * persists an immutable snapshot. Changing settings never edits an existing
 * plan — it produces the next version.
 */
import { createFileRoute } from "@tanstack/react-router";

import { ApiError, audit, handler, json, rateLimit } from "@/lib/cloud/http.server";
import {
  findPlanByIdempotencyKey,
  getSewingPlan,
  latestCalendar,
  latestSmvVersion,
  listSmv,
  loadLineSettings,
  loadPlanEntries,
  saveLineSettings,
  saveProductionPlan,
  setSewingPlanStatus,
} from "@/lib/cloud/repo.server";
import type { LinePlanSettings, PlanningPeriod, Scenario } from "@/planning/types";

export const Route = createFileRoute("/api/plans/generate")({
  server: {
    handlers: {
      POST: handler("plan.generate", async ({ request, ctx }) => {
        await rateLimit(`generate:${ctx.user.id}`, 6, 60);

        const body = (await request.json()) as {
          sewingPlanId: string;
          period: PlanningPeriod;
          lineSettings?: LinePlanSettings[];
          allowOverproduction?: boolean;
          scenario?: Scenario;
          idempotencyKey?: string;
        };

        const idempotencyKey = body.idempotencyKey ?? request.headers.get("idempotency-key");
        if (idempotencyKey) {
          const existing = await findPlanByIdempotencyKey(ctx.factoryId, idempotencyKey);
          if (existing) {
            return json(request, { id: existing.id, reused: true }, { requestId: ctx.requestId });
          }
        }

        if (!body.sewingPlanId || !body.period?.from || !body.period?.to) {
          throw new ApiError("A sewing plan version and a planning period are required.");
        }
        const sewingPlan = await getSewingPlan(ctx.factoryId, body.sewingPlanId);
        if (!sewingPlan) throw new ApiError("Sewing plan not found.", 404, "NOT_FOUND");

        const monthKey = body.period.from.slice(0, 7);
        const { entries, lines } = await loadPlanEntries(ctx.factoryId, body.sewingPlanId);
        if (!entries.length)
          throw new ApiError("That sewing plan has no imported records.", 422, "NO_ENTRIES");

        if (body.lineSettings?.length) {
          await saveLineSettings(ctx.factoryId, monthKey, body.lineSettings, ctx.user.id);
        }
        const lineSettings = body.lineSettings?.length
          ? body.lineSettings
          : await loadLineSettings(ctx.factoryId, monthKey);
        if (!lineSettings.length)
          throw new ApiError("Line settings have not been configured.", 422, "NO_LINE_SETTINGS");

        const calendar = await latestCalendar(ctx.factoryId, monthKey);
        if (!calendar?.days.length)
          throw new ApiError("The working calendar is not configured.", 422, "NO_CALENDAR");

        const smvVersion = await latestSmvVersion(ctx.factoryId);
        const smvMaster = await listSmv(ctx.factoryId, smvVersion?.id ?? null);
        if (!smvMaster.length)
          throw new ApiError("No SMV master has been uploaded.", 422, "NO_SMV");

        const { runPlanningEngine } = await import("@/planning/PlanningEngine");
        const result = runPlanningEngine({
          planId: body.sewingPlanId,
          entries,
          lines,
          smvMaster,
          calendar: calendar.days,
          lineSettings,
          period: body.period,
          allowOverproduction: body.allowOverproduction ?? false,
          scenario: body.scenario,
          sources: { sewingPlan: sewingPlan.file_name, smv: smvVersion?.id, calendar: calendar.id },
        });

        const critical = result.issues.filter((i) => i.severity === "CRITICAL");
        if (critical.length) {
          throw new ApiError(
            `The plan cannot be generated: ${critical.length} critical issue(s) must be resolved first.`,
            422,
            "VALIDATION_BLOCKED",
          );
        }

        const saved = await saveProductionPlan({
          factoryId: ctx.factoryId,
          period: monthKey,
          sewingPlanId: body.sewingPlanId,
          smvVersionId: smvVersion?.id ?? null,
          calendarVersionId: calendar.id,
          scenarioId: body.scenario?.id ?? null,
          idempotencyKey: idempotencyKey ?? null,
          generatedBy: ctx.user.id,
          result,
          snapshot: {
            sewingPlanId: body.sewingPlanId,
            smvVersionId: smvVersion?.id ?? null,
            calendarVersionId: calendar.id,
            lineSettings,
            scenario: body.scenario ?? null,
            period: body.period,
            allowOverproduction: body.allowOverproduction ?? false,
            generatedAt: new Date().toISOString(),
          },
        });

        await setSewingPlanStatus(ctx.factoryId, body.sewingPlanId, "USED_IN_PLAN");
        await audit(ctx, "PLAN_GENERATE", "PRODUCTION_PLAN", saved.id, {
          new: { sewingPlanId: body.sewingPlanId, period: monthKey },
        });

        return json(
          request,
          {
            id: saved.id,
            version: saved.version,
            summary: result.factory,
            days: result.days.length,
          },
          { status: 201, requestId: ctx.requestId },
        );
      }),
    },
  },
});
