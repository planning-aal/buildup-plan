import { createFileRoute } from "@tanstack/react-router";

import { ApiError, audit, handler, json } from "@/lib/cloud/http.server";
import { latestCalendar, saveCalendar } from "@/lib/cloud/repo.server";
import type { WorkingCalendarDay } from "@/lib/import/types";

export const Route = createFileRoute("/api/calendar")({
  server: {
    handlers: {
      GET: handler("calendar.read", async ({ request, ctx }) => {
        const period = new URL(request.url).searchParams.get("period");
        if (!period) throw new ApiError("A planning period (yyyy-mm) is required.");
        const found = await latestCalendar(ctx.factoryId, period);
        return json(
          request,
          { version: found?.id ?? null, data: found?.days ?? [] },
          { requestId: ctx.requestId },
        );
      }),
      // A calendar change creates a new calendar version; earlier plans keep theirs.
      POST: handler("calendar.write", async ({ request, ctx }) => {
        const body = (await request.json()) as { period: string; days: WorkingCalendarDay[] };
        if (!body.period || !Array.isArray(body.days))
          throw new ApiError("period and days are required.");
        const created = await saveCalendar(ctx.factoryId, body.period, body.days, ctx.user.id);
        await audit(ctx, "CALENDAR_CHANGE", "CALENDAR_VERSION", created.id, {
          new: { days: body.days.length },
        });
        return json(request, created, { status: 201, requestId: ctx.requestId });
      }),
    },
  },
});
