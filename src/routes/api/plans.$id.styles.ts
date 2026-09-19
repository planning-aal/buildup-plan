import { createFileRoute } from "@tanstack/react-router";

import { handler, json, pagination } from "@/lib/cloud/http.server";
import { getPlanItems } from "@/lib/cloud/repo.server";

export const Route = createFileRoute("/api/plans/$id/styles")({
  server: {
    handlers: {
      GET: handler("plan.read", async ({ request, ctx, params }) => {
        const { limit, offset } = pagination(new URL(request.url), 200, 1000);
        const rows = await getPlanItems(params["id"]!, limit, offset);
        return json(
          request,
          { data: rows, paging: { limit, offset } },
          { requestId: ctx.requestId },
        );
      }),
    },
  },
});
