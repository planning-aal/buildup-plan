import { createFileRoute } from "@tanstack/react-router";

import { audit, handler, json } from "@/lib/cloud/http.server";
import { createSmvVersion, latestSmvVersion, listSmv } from "@/lib/cloud/repo.server";
import type { SmvMasterRecord } from "@/lib/import/types";

export const Route = createFileRoute("/api/smv/")({
  server: {
    handlers: {
      GET: handler("smv.read", async ({ request, ctx }) => {
        const version = new URL(request.url).searchParams.get("version");
        const records = await listSmv(ctx.factoryId, version);
        const latest = await latestSmvVersion(ctx.factoryId);
        return json(
          request,
          { version: version ?? latest?.id ?? null, data: records },
          { requestId: ctx.requestId },
        );
      }),
      // Manual add / bulk update: creates a new SMV version, never edits in place.
      POST: handler("smv.write", async ({ request, ctx }) => {
        const body = (await request.json()) as { records: SmvMasterRecord[] };
        const created = await createSmvVersion({
          factoryId: ctx.factoryId,
          fileName: null,
          fileHash: null,
          storageKey: null,
          fileSize: 0,
          source: "MANUAL",
          records: body.records ?? [],
          createdBy: ctx.user.id,
        });
        await audit(ctx, "SMV_UPDATE", "SMV_VERSION", created.id, {
          new: { count: body.records?.length ?? 0 },
        });
        return json(request, created, { status: 201, requestId: ctx.requestId });
      }),
    },
  },
});
