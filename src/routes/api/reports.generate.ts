/**
 * Builds the Production Buildup Plan for a stored plan version, validates the
 * workbook, stores it in object storage and records the export.
 * A blocked report never produces a downloadable file.
 */
import { createFileRoute } from "@tanstack/react-router";

import { ApiError, audit, handler, json, rateLimit } from "@/lib/cloud/http.server";
import { replayPlan } from "@/lib/cloud/replay.server";
import { saveReport, saveReportExport } from "@/lib/cloud/repo.server";
import { putObject, reportKey } from "@/lib/cloud/storage.server";

export const Route = createFileRoute("/api/reports/generate")({
  server: {
    handlers: {
      POST: handler("report.generate", async ({ request, ctx }) => {
        await rateLimit(`report:${ctx.user.id}`, 6, 60);
        const body = (await request.json()) as { planId: string; export?: boolean };
        if (!body.planId) throw new ApiError("A production plan id is required.");

        const replay = await replayPlan(ctx.factoryId, body.planId);

        const { buildProductionBuildupReport } = await import("@/reports/ProductionBuildupReport");
        const report = buildProductionBuildupReport({
          result: replay.result,
          imported: null,
          calendar: replay.calendar,
          lineSettings: replay.snapshot["lineSettings"] as never,
          smvMaster: replay.smvMaster,
          period: replay.period,
        });

        const saved = await saveReport({
          factoryId: ctx.factoryId,
          planId: body.planId,
          period: replay.period.from.slice(0, 7),
          scenarioId: report.meta.scenarioId,
          scenarioName: report.meta.scenarioName,
          status: report.meta.status,
          blockers: report.blockers,
          snapshot: report.snapshot,
          totals: report.totals,
          generatedBy: ctx.user.id,
        });
        await audit(ctx, "REPORT_GENERATE", "REPORT", saved.id, { new: { planId: body.planId } });

        if (report.meta.status === "BLOCKED") {
          return json(
            request,
            { id: saved.id, status: "BLOCKED", blockers: report.blockers },
            { status: 422, requestId: ctx.requestId },
          );
        }

        if (body.export === false) {
          return json(
            request,
            { id: saved.id, status: report.meta.status },
            { status: 201, requestId: ctx.requestId },
          );
        }

        const { generateWorkbookBlob, validateWorkbook } = await import("@/export/ExcelExporter");
        const { buffer } = await generateWorkbookBlob(report);
        const validation = await validateWorkbook(buffer, report);
        if (!validation.ok) {
          throw new ApiError(
            "The workbook was built but failed its own checks, so it was not published.",
            500,
            "EXPORT_VALIDATION_FAILED",
          );
        }

        const [year, month] = replay.period.from.split("-") as [string, string];
        const key = reportKey(year, month, `${saved.id}_${report.meta.fileName}`);
        await putObject(key, buffer, undefined, { factoryId: ctx.factoryId, reportId: saved.id });
        const exportId = await saveReportExport({
          reportId: saved.id,
          factoryId: ctx.factoryId,
          fileName: report.meta.fileName,
          storageKey: key,
          fileSize: buffer.byteLength,
          createdBy: ctx.user.id,
        });
        await audit(ctx, "EXCEL_EXPORT", "REPORT_EXPORT", exportId, {
          new: { reportId: saved.id, fileName: report.meta.fileName },
        });

        return json(
          request,
          {
            id: saved.id,
            version: saved.version,
            status: "EXPORTED",
            fileName: report.meta.fileName,
            download: `/api/reports/${saved.id}/download`,
            totals: report.totals,
          },
          { status: 201, requestId: ctx.requestId },
        );
      }),
    },
  },
});
