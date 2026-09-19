import { createFileRoute } from "@tanstack/react-router";

import { ApiError, handler, json, pagination } from "@/lib/cloud/http.server";
import { getPlanDays, getProductionPlan } from "@/lib/cloud/repo.server";

export const Route = createFileRoute("/api/plans/$id")({
  server: {
    handlers: {
      GET: handler("plan.read", async ({ request, ctx, params }) => {
        const plan = await getProductionPlan(ctx.factoryId, params["id"]!);
        if (!plan) throw new ApiError("Production plan not found.", 404, "NOT_FOUND");
        const { limit, offset } = pagination(new URL(request.url), 500, 2000);
        const days = await getPlanDays(String(plan["id"]), limit, offset);
        return json(
          request,
          { plan: { ...plan, snapshot_json: undefined }, days, paging: { limit, offset } },
          { requestId: ctx.requestId },
        );
      }),
    },
  },
});
