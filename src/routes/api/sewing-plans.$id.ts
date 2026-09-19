import { createFileRoute } from "@tanstack/react-router";

import { ApiError, handler, json } from "@/lib/cloud/http.server";
import { getSewingPlan } from "@/lib/cloud/repo.server";

export const Route = createFileRoute("/api/sewing-plans/$id")({
  server: {
    handlers: {
      GET: handler("plan.read", async ({ request, ctx, params }) => {
        const row = await getSewingPlan(ctx.factoryId, params["id"]!);
        if (!row) throw new ApiError("Sewing plan not found.", 404, "NOT_FOUND");
        return json(
          request,
          {
            id: row.id,
            fileName: row.file_name,
            version: row.version,
            status: row.status,
            period: row.planning_period,
            fileSize: row.file_size,
            uploadedAt: row.uploaded_at,
            summary: row.summary_json ? JSON.parse(row.summary_json) : null,
          },
          { requestId: ctx.requestId },
        );
      }),
    },
  },
});
