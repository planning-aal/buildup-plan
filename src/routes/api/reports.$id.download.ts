/**
 * Authenticated download. The object key is never handed to the browser and
 * no permanent public storage URL exists — the file is streamed only after the
 * caller's factory and permission have been checked.
 */
import { createFileRoute } from "@tanstack/react-router";

import { ApiError, audit, handler } from "@/lib/cloud/http.server";
import { getReport, latestReportExport } from "@/lib/cloud/repo.server";
import { getObject } from "@/lib/cloud/storage.server";

export const Route = createFileRoute("/api/reports/$id/download")({
  server: {
    handlers: {
      GET: handler("report.export", async ({ ctx, params }) => {
        const reportId = params["id"]!;
        const report = await getReport(ctx.factoryId, reportId);
        if (!report) throw new ApiError("Report not found.", 404, "NOT_FOUND");

        const exported = await latestReportExport(ctx.factoryId, reportId);
        if (!exported) throw new ApiError("This report has no stored workbook.", 404, "NO_EXPORT");

        const data = await getObject(exported.storage_key);
        if (!data) throw new ApiError("The stored workbook could not be read.", 404, "MISSING_OBJECT");

        await audit(ctx, "EXCEL_DOWNLOAD", "REPORT_EXPORT", exported.id, { new: { reportId } });

        return new Response(data, {
          headers: {
            "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "content-disposition": `attachment; filename="${exported.file_name}"`,
            "cache-control": "private, no-store",
            "x-request-id": ctx.requestId,
          },
        });
      }),
    },
  },
});
