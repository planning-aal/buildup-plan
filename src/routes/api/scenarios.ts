import { createFileRoute } from "@tanstack/react-router";

import { ApiError, audit, handler, json } from "@/lib/cloud/http.server";
import { createScenario, listScenarios } from "@/lib/cloud/repo.server";

export const Route = createFileRoute("/api/scenarios")({
  server: {
    handlers: {
      GET: handler("scenario.read", async ({ request, ctx }) => {
        const rows = await listScenarios(ctx.factoryId);
        return json(request, { data: rows }, { requestId: ctx.requestId });
      }),
      POST: handler("scenario.write", async ({ request, ctx }) => {
        const body = (await request.json()) as { name?: string; overrides?: unknown };
        if (!body.name) throw new ApiError("A scenario name is required.");
        const created = await createScenario(
          ctx.factoryId,
          body.name,
          body.overrides ?? {},
          ctx.user.id,
        );
        await audit(ctx, "SCENARIO_CREATE", "SCENARIO", created.id, { new: { name: body.name } });
        return json(request, created, { status: 201, requestId: ctx.requestId });
      }),
    },
  },
});
