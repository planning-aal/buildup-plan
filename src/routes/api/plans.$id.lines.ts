import { createFileRoute } from "@tanstack/react-router";

import { handler, json } from "@/lib/cloud/http.server";
import { getPlanLines } from "@/lib/cloud/repo.server";

export const Route = createFileRoute("/api/plans/$id/lines")({
  server: {
    handlers: {
      GET: handler("plan.read", async ({ request, ctx, params }) => {
        const rows = await getPlanLines(params["id"]!);
        return json(request, { data: rows }, { requestId: ctx.requestId });
      }),
    },
  },
});
