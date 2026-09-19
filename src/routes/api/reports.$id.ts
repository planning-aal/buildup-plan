import { createFileRoute } from "@tanstack/react-router";

import { ApiError, handler, json } from "@/lib/cloud/http.server";
import { getReport, latestReportExport } from "@/lib/cloud/repo.server";

export const Route = createFileRoute("/api/reports/$id")({
  server: {
    handlers: {
      GET: handler("report.read", async ({ request, ctx, params }) => {
        const report = await getReport(ctx.factoryId, params["id"]!);
        if (!report) throw new ApiError("Report not found.", 404, "NOT_FOUND");
        const exported = await latestReportExport(ctx.factoryId, params["id"]!);
        return json(
          request,
          {
            id: report["id"],
            planId: report["plan_id"],
            version: report["version"],
            period: report["period"],
            status: report["status"],
            scenarioName: report["scenario_name"],
            generatedAt: report["generated_at"],
            totals: report["totals_json"] ? JSON.parse(String(report["totals_json"])) : null,
            blockers: report["blockers_json"] ? JSON.parse(String(report["blockers_json"])) : [],
            file: exported
              ? {
                  fileName: exported.file_name,
                  fileSize: exported.file_size,
                  download: `/api/reports/${report["id"]}/download`,
                }
              : null,
          },
          { requestId: ctx.requestId },
        );
      }),
    },
  },
});
