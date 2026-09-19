import { createFileRoute } from "@tanstack/react-router";

import { cloudConfigured, cloudEnv } from "@/lib/cloud/bindings.server";
import { newRequestId } from "@/lib/cloud/http.server";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const env = await cloudEnv();
        const configured = await cloudConfigured();
        return Response.json(
          {
            status: "ok",
            environment: env.ENVIRONMENT ?? "development",
            version: "phase-5",
            services: { database: configured.database, storage: configured.storage },
            time: new Date().toISOString(),
          },
          { headers: { "cache-control": "no-store", "x-request-id": newRequestId() } },
        );
      },
    },
  },
});
