import { createFileRoute } from "@tanstack/react-router";

import { ApiError, handler, json } from "@/lib/cloud/http.server";
import { getProductionPlan } from "@/lib/cloud/repo.server";

export const Route = createFileRoute("/api/plans/$id/summary")({
  server: {
    handlers: {
      GET: handler("plan.read", async ({ request, ctx, params }) => {
        const plan = await getProductionPlan(ctx.factoryId, params["id"]!);
        if (!plan) throw new ApiError("Production plan not found.", 404, "NOT_FOUND");
        return json(
          request,
          {
            id: plan["id"],
            version: plan["version"],
            period: plan["period"],
            status: plan["status"],
            generatedAt: plan["generated_at"],
            sources: {
              sewingPlanId: plan["sewing_plan_id"],
              smvVersionId: plan["smv_version_id"],
              calendarVersionId: plan["calendar_version_id"],
              scenarioId: plan["scenario_id"],
            },
            summary: plan["summary_json"] ? JSON.parse(String(plan["summary_json"])) : null,
          },
          { requestId: ctx.requestId },
        );
      }),
    },
  },
});
