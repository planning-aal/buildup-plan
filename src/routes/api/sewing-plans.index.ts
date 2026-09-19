import { createFileRoute } from "@tanstack/react-router";

import { handler, json, pagination } from "@/lib/cloud/http.server";
import { listSewingPlans } from "@/lib/cloud/repo.server";

export const Route = createFileRoute("/api/sewing-plans/")({
  server: {
    handlers: {
      GET: handler("plan.read", async ({ request, ctx }) => {
        const { limit, offset } = pagination(new URL(request.url), 50, 200);
        const rows = await listSewingPlans(ctx.factoryId, limit, offset);
        return json(
          request,
          {
            data: rows.map((r) => ({
              id: r.id,
              fileName: r.file_name,
              version: r.version,
              status: r.status,
              period: r.planning_period,
              periodFrom: r.period_from,
              periodTo: r.period_to,
              fileSize: r.file_size,
              uploadedAt: r.uploaded_at,
              uploadedBy: r.uploaded_by,
              summary: r.summary_json ? JSON.parse(r.summary_json) : null,
            })),
            paging: { limit, offset },
          },
          { requestId: ctx.requestId },
        );
      }),
    },
  },
});
