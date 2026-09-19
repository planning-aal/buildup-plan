/**
 * UPLOAD -> STORE ORIGINAL -> CREATE VERSION -> PARSE -> NORMALIZE ->
 * VALIDATE -> STORE RECORDS. A parse failure keeps the original file and
 * marks the version FAILED; no half-imported plan is ever exposed.
 */
import { createFileRoute } from "@tanstack/react-router";

import { ApiError, audit, handler, json, rateLimit, sha256Hex } from "@/lib/cloud/http.server";
import {
  findPlanByHash,
  insertEntries,
  insertSewingPlan,
  insertValidationIssues,
  nextVersionId,
  setSewingPlanStatus,
} from "@/lib/cloud/repo.server";
import { putObject, sewingPlanKey } from "@/lib/cloud/storage.server";

const MAX_BYTES = 30 * 1024 * 1024;

export const Route = createFileRoute("/api/sewing-plans/upload")({
  server: {
    handlers: {
      POST: handler("plan.upload", async ({ request, ctx }) => {
        await rateLimit(`upload:${ctx.user.id}`, 10, 60);

        const form = await request.formData();
        const file = form.get("file");
        const mode = String(form.get("mode") ?? "AUTO"); // AUTO | USE_EXISTING | NEW_VERSION
        if (!(file instanceof File)) throw new ApiError("No file was uploaded.");
        if (file.size > MAX_BYTES) throw new ApiError("That file is larger than the 30 MB limit.", 413);

        const buffer = await file.arrayBuffer();
        const hash = await sha256Hex(buffer);

        const duplicate = await findPlanByHash(ctx.factoryId, hash);
        if (duplicate && mode !== "NEW_VERSION") {
          return json(
            request,
            {
              duplicate: true,
              message: "This file has already been uploaded.",
              existing: { id: duplicate.id, fileName: duplicate.file_name, uploadedAt: duplicate.uploaded_at },
              choices: ["USE_EXISTING", "NEW_VERSION"],
            },
            { status: 409, requestId: ctx.requestId },
          );
        }

        const now = new Date();
        const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        const { id, version } = await nextVersionId("SP", "sewing_plans", ctx.factoryId, period);
        const [year, month] = period.split("-") as [string, string];
        const storageKey = sewingPlanKey(id, year, month);

        // 1. the original file is preserved before anything is parsed
        await putObject(storageKey, buffer, file.type || undefined, { factoryId: ctx.factoryId, sewingPlanId: id });

        await insertSewingPlan({
          id,
          factory_id: ctx.factoryId,
          file_name: file.name,
          file_hash: hash,
          storage_key: storageKey,
          file_size: buffer.byteLength,
          planning_period: period,
          period_from: null,
          period_to: null,
          version,
          status: "UPLOADED",
          uploaded_by: ctx.user.id,
          summary_json: null,
        });
        await audit(ctx, "SEWING_PLAN_UPLOAD", "SEWING_PLAN", id, { new: { fileName: file.name, hash } });

        try {
          const { parseSewingPlanWorkbook } = await import("@/lib/import/parse-workbook");
          const parsed = parseSewingPlanWorkbook(buffer, file.name);

          await insertEntries(ctx.factoryId, id, parsed.entries);
          await insertValidationIssues(
            ctx.factoryId,
            "SEWING_PLAN",
            id,
            parsed.issues.map((i) => ({ severity: i.severity, code: i.code, message: i.message })),
          );
          await setSewingPlanStatus(ctx.factoryId, id, parsed.summary.criticalErrors ? "PARSED" : "VALIDATED");

          return json(
            request,
            {
              id,
              version,
              fileName: file.name,
              status: parsed.summary.criticalErrors ? "PARSED" : "VALIDATED",
              summary: parsed.summary,
              lines: parsed.plan.lines.length,
              entries: parsed.entries.length,
            },
            { status: 201, requestId: ctx.requestId },
          );
        } catch (error) {
          await setSewingPlanStatus(ctx.factoryId, id, "FAILED");
          await insertValidationIssues(ctx.factoryId, "SEWING_PLAN", id, [
            { severity: "CRITICAL", code: "PARSE_FAILED", message: String(error) },
          ]);
          throw new ApiError(
            "The file was saved but could not be read as a sewing plan. Nothing was imported.",
            422,
            "PARSE_FAILED",
          );
        }
      }),
    },
  },
});
