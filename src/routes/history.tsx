import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Archive, CloudOff, Download, FileSpreadsheet, History } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cloud,
  cloudHealth,
  type CloudHealth,
  type StoredPlan,
  type StoredReport,
  type StoredSewingPlan,
} from "@/lib/cloud/client";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Plan history — Armana Production Planning" },
      {
        name: "description",
        content:
          "Every uploaded sewing plan, generated production plan and exported Production Buildup Plan, kept as a permanent version history.",
      },
      { property: "og:title", content: "Plan history — Armana Production Planning" },
      {
        property: "og:description",
        content: "Permanent version history of sewing plans, production plans and exported buildup reports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

function bytes(n: number): string {
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function when(iso: string): string {
  return new Date(iso.replace(" ", "T") + (iso.endsWith("Z") ? "" : "Z")).toLocaleString("en-GB");
}

function HistoryPage() {
  const [health, setHealth] = useState<CloudHealth | null | "loading">("loading");
  const [plans, setPlans] = useState<StoredSewingPlan[]>([]);
  const [productionPlans, setProductionPlans] = useState<StoredPlan[]>([]);
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await cloudHealth();
      if (cancelled) return;
      setHealth(status);
      if (!status?.services.database) return;
      try {
        const [a, b, c] = await Promise.all([cloud.sewingPlans(), cloud.plans(), cloud.reports()]);
        if (cancelled) return;
        setPlans(a.data);
        setProductionPlans(b.data);
        setReports(c.data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the history.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connected = health !== "loading" && health !== null && health.services.database;

  return (
    <AppShell
      title="Plan history"
      subtitle="Every upload, plan and report is kept as its own version — nothing is overwritten"
    >
      {!connected && health !== "loading" ? (
        <Card>
          <CardContent className="flex items-start gap-3 py-8">
            <CloudOff className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">Permanent storage is not switched on yet</p>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Plans and reports are currently kept for this browser session only. Once the production
                environment is set up, every sewing plan, production plan and exported report will be stored
                permanently and listed here. See CLOUDFLARE_DEPLOYMENT.md for the setup steps.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {connected ? (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <Archive className="size-4" aria-hidden />
              <CardTitle className="text-base">Uploaded sewing plans</CardTitle>
            </CardHeader>
            <CardContent>
              {plans.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sewing plan has been uploaded yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2">Version</th>
                      <th>File</th>
                      <th>Records</th>
                      <th>Size</th>
                      <th>Uploaded</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2 font-medium">{p.id}</td>
                        <td>{p.fileName}</td>
                        <td>{p.summary?.planningRecords?.toLocaleString() ?? "—"}</td>
                        <td>{bytes(p.fileSize)}</td>
                        <td>{when(p.uploadedAt)}</td>
                        <td>
                          <Badge variant="secondary">{p.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <History className="size-4" aria-hidden />
              <CardTitle className="text-base">Generated production plans</CardTitle>
            </CardHeader>
            <CardContent>
              {productionPlans.length === 0 ? (
                <p className="text-sm text-muted-foreground">No production plan has been generated yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2">Plan</th>
                      <th>Month</th>
                      <th>From upload</th>
                      <th>Generated</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productionPlans.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2 font-medium">{p.id}</td>
                        <td>{p.period}</td>
                        <td>{p.sewing_plan_id}</td>
                        <td>{when(p.generated_at)}</td>
                        <td>
                          <Badge variant="secondary">{p.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <FileSpreadsheet className="size-4" aria-hidden />
              <CardTitle className="text-base">Production Buildup Plan reports</CardTitle>
            </CardHeader>
            <CardContent>
              {reports.length === 0 ? (
                <p className="text-sm text-muted-foreground">No report has been generated yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2">Report</th>
                      <th>Plan</th>
                      <th>Month</th>
                      <th>Generated</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2 font-medium">{r.id}</td>
                        <td>{r.plan_id}</td>
                        <td>{r.period}</td>
                        <td>{when(r.generated_at)}</td>
                        <td>
                          <Badge variant="secondary">{r.status}</Badge>
                        </td>
                        <td className="text-right">
                          {r.status === "EXPORTED" ? (
                            <a
                              className="inline-flex items-center gap-1 text-sm underline"
                              href={`/api/reports/${r.id}/download`}
                            >
                              <Download className="size-3.5" aria-hidden /> Download
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}
