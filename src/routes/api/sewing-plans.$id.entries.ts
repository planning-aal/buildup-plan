import { createFileRoute } from "@tanstack/react-router";

import { handler, json, pagination } from "@/lib/cloud/http.server";
import { listEntries } from "@/lib/cloud/repo.server";

export const Route = createFileRoute("/api/sewing-plans/$id/entries")({
  server: {
    handlers: {
      GET: handler("plan.read", async ({ request, ctx, params }) => {
        const url = new URL(request.url);
        const { limit, offset } = pagination(url, 200, 1000);
        const { rows, total } = await listEntries(ctx.factoryId, params["id"]!, {
          limit,
          offset,
          line: url.searchParams.get("line") ?? undefined,
          style: url.searchParams.get("style") ?? undefined,
          date: url.searchParams.get("date") ?? undefined,
        });
        return json(
          request,
          { data: rows, paging: { limit, offset, total } },
          { requestId: ctx.requestId },
        );
      }),
    },
  },
});
