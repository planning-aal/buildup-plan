import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Printer } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, SectionCard } from "@/components/planning/ui-bits";
import { ReportTableView } from "@/components/reports/report-table-view";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportProductionBuildupPlan, exportTableCsv, STAGE_MESSAGE, type ExportStage } from "@/export";
import { usePlanning } from "@/lib/app-state/planning-store";
import { useBuildupReport } from "@/lib/app-state/use-buildup-report";

export const Route = createFileRoute("/buildup")({
  head: () => ({
    meta: [
      { title: "Production Buildup Plan — Armana Production Planning" },
      {
        name: "description",
        content:
          "Preview and export the Armana Production Buildup Plan: summary, line plans, daily production, style mix, capacity, efficiency, calendar, SMV exceptions and assumptions.",
      },
      { property: "og:title", content: "Production Buildup Plan — Armana Production Planning" },
      {
        property: "og:description",
        content: "Preview the full production buildup plan and export the Excel workbook.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuildupPage,
});

function BuildupPage() {
  const { result } = usePlanning();
  const report = useBuildupReport();
  const [active, setActive] = useState<string | null>(null);
  const [stage, setStage] = useState<ExportStage | null>(null);
  const [showBlockers, setShowBlockers] = useState(false);

  if (!result || !report) {
    return (
      <AppShell title="Production Buildup Plan" subtitle="Report preview and Excel export">
        <EmptyState
          title="No production plan"
          message="Complete validation and generate the plan to build the Production Buildup Plan."
          actionLabel="Go to production plan"
          actionTo="/production-plan"
        />
      </AppShell>
    );
  }

  const table = report.tables.find((t) => t.id === active) ?? report.tables[0]!;
  const blocked = report.meta.status === "BLOCKED";
  const busy = stage !== null && stage !== "DONE" && stage !== "FAILED";

  async function onExport() {
    const toastId = toast.loading(STAGE_MESSAGE.PREPARING);
    try {
      const outcome = await exportProductionBuildupPlan(report!, (s) => {
        setStage(s);
        if (s !== "DONE" && s !== "FAILED") toast.loading(STAGE_MESSAGE[s], { id: toastId });
      });
      if (outcome.ok) {
        toast.success(STAGE_MESSAGE.DONE, { id: toastId, description: outcome.fileName });
      } else {
        toast.error(STAGE_MESSAGE.FAILED, {
          id: toastId,
          description: outcome.validation.problems.slice(0, 3).join(" · "),
        });
        setShowBlockers(true);
      }
    } catch (err) {
      toast.error(STAGE_MESSAGE.FAILED, { id: toastId, description: String(err) });
    } finally {
      setStage(null);
    }
  }

  return (
    <AppShell
      title="Production Buildup Plan"
      subtitle={`${report.meta.factory} · ${report.meta.periodLabel} · ${report.meta.scenarioName}`}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => exportTableCsv(table, report)}>
            <Download className="size-4" /> Export CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          <Button size="sm" onClick={onExport} disabled={busy || blocked}>
            <FileSpreadsheet className="size-4" /> {busy ? STAGE_MESSAGE[stage!] : "Export Excel"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <SectionCard title="Report header" description="Every generated report is identified and reproducible">
          <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Report ID", report.meta.reportId],
              ["Plan ID", report.meta.planId],
              ["Factory", report.meta.factory],
              ["Planning period", report.meta.periodLabel],
              ["Scenario", report.meta.scenarioName],
              ["Generated", new Date(report.meta.generatedAt).toLocaleString("en-GB")],
              ["Efficiency profile", report.meta.efficiencyProfile],
              ["Status", report.meta.status],
            ].map(([k, v]) => (
              <div key={k} className="rounded border border-border px-3 py-2">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className="truncate font-medium" title={v}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        {blocked ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-semibold">Report generation blocked</p>
                <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                  {report.blockers.map((b) => (
                    <li key={b.code}>{b.message}</li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowBlockers((s) => !s)}>
                    {showBlockers ? "Hide errors" : "View errors"}
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/smv-master">Fix now</Link>
                  </Button>
                </div>
                {showBlockers ? (
                  <div className="mt-3">
                    <ReportTableView table={report.tables.find((t) => t.id === "smv-exceptions")!} />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <SectionCard title={table.title} description={table.description}>
          <Tabs value={table.id} onValueChange={setActive} className="mb-3">
            <TabsList className="flex h-auto flex-wrap justify-start">
              {report.tables.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="text-xs">
                  {t.title}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <ReportTableView table={table} />
        </SectionCard>
      </div>
    </AppShell>
  );
}
