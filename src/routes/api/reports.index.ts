import { createFileRoute } from "@tanstack/react-router";

import { handler, json, pagination } from "@/lib/cloud/http.server";
import { listReports } from "@/lib/cloud/repo.server";

export const Route = createFileRoute("/api/reports/")({
  server: {
    handlers: {
      GET: handler("report.read", async ({ request, ctx }) => {
        const { limit, offset } = pagination(new URL(request.url), 50, 200);
        const rows = await listReports(ctx.factoryId, limit, offset);
        return json(request, { data: rows, paging: { limit, offset } }, { requestId: ctx.requestId });
      }),
    },
  },
});
