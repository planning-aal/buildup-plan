import { createFileRoute } from "@tanstack/react-router";

import { ApiError, audit, handler, json, rateLimit, sha256Hex } from "@/lib/cloud/http.server";
import { createSmvVersion } from "@/lib/cloud/repo.server";
import { putObject, smvKey } from "@/lib/cloud/storage.server";

const MAX_BYTES = 15 * 1024 * 1024;

export const Route = createFileRoute("/api/smv/upload")({
  server: {
    handlers: {
      POST: handler("smv.write", async ({ request, ctx }) => {
        await rateLimit(`smv-upload:${ctx.user.id}`, 10, 60);
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) throw new ApiError("No file was uploaded.");
        if (file.size > MAX_BYTES) throw new ApiError("That file is larger than the 15 MB limit.", 413);

        const buffer = await file.arrayBuffer();
        const hash = await sha256Hex(buffer);

        const { readSmvUpload } = await import("@/lib/app-state/smv-io");
        const records = readSmvUpload(buffer, file.name);
        if (!records.length) throw new ApiError("No SMV rows were found in that file.", 422, "EMPTY_SMV");

        const year = String(new Date().getUTCFullYear());
        // the version id is only known after insert, so store under the hash first
        const created = await createSmvVersion({
          factoryId: ctx.factoryId,
          fileName: file.name,
          fileHash: hash,
          storageKey: smvKey("pending", year),
          fileSize: buffer.byteLength,
          source: "UPLOAD",
          records,
          createdBy: ctx.user.id,
        });
        await putObject(smvKey(created.id, year), buffer, file.type || undefined, {
          factoryId: ctx.factoryId,
          smvVersionId: created.id,
        });
        await audit(ctx, "SMV_UPLOAD", "SMV_VERSION", created.id, {
          new: { fileName: file.name, records: records.length },
        });

        return json(
          request,
          { ...created, records: records.length, fileName: file.name },
          { status: 201, requestId: ctx.requestId },
        );
      }),
    },
  },
});
