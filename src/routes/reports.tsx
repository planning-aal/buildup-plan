import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import {
  EmptyState,
  SectionCard,
  StatusBadge,
  dateText,
  pct,
  qty,
  smvText,
} from "@/components/planning/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePlanning } from "@/lib/app-state/planning-store";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Armana Production Planning" },
      {
        name: "description",
        content:
          "Style buildup report: order quantity, planned quantity, remaining quantity and completion status for every style, with daily detail.",
      },
      { property: "og:title", content: "Reports — Armana Production Planning" },
      {
        property: "og:description",
        content: "Style buildup with order quantity, planned quantity, remaining quantity and daily detail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { result } = usePlanning();
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const orders = useMemo(() => {
    if (!result) return [];
    const q = search.trim().toLowerCase();
    return result.orders.filter(
      (o) =>
        !q ||
        (o.styleNo ?? "").toLowerCase().includes(q) ||
        (o.poNo ?? "").toLowerCase().includes(q) ||
        o.lineName.toLowerCase().includes(q),
    );
  }, [result, search]);

  if (!result) {
    return (
      <AppShell title="Reports" subtitle="Style buildup and order completion">
        <EmptyState
          title="No production plan"
          message="Complete validation and generate the plan to see the style buildup report."
          actionLabel="Go to production plan"
          actionTo="/production-plan"
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Reports"
      subtitle="Style buildup and order completion"
      actions={
        <Button size="sm" variant="outline" asChild>
          <Link to="/plan">Workbook generator</Link>
        </Button>
      }
    >
      <div className="space-y-4">
        <SectionCard
          title="Style buildup"
          description="Click a style to see its daily detail"
          actions={
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search style, PO or line"
              className="h-8 w-56"
            />
          }
        >
          <div className="max-h-[640px] overflow-auto rounded-md border border-border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Style</TableHead>
                  <TableHead>PO</TableHead>
                  <TableHead>Line</TableHead>
                  <TableHead className="text-right">SMV</TableHead>
                  <TableHead className="text-right">Order qty</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="text-right">Planned</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => {
                  const expanded = open === o.runId;
                  const days = result.days.filter((d) => d.styleNo === o.styleNo && d.lineId === o.lineId && d.plannedQty > 0);
                  return (
                    <Fragment key={o.runId}>
                      <TableRow className="cursor-pointer" onClick={() => setOpen(expanded ? null : o.runId)}>
                        <TableCell>
                          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </TableCell>
                        <TableCell className="font-medium">{o.styleNo ?? "—"}</TableCell>
                        <TableCell>{o.poNo ?? "—"}</TableCell>
                        <TableCell>{o.lineName}</TableCell>
                        <TableCell className="text-right tabular-nums">{smvText(o.smv)}</TableCell>
                        <TableCell className="text-right tabular-nums">{qty(o.orderQty)}</TableCell>
                        <TableCell>{dateText(o.plannedStartDate)}</TableCell>
                        <TableCell>{dateText(o.plannedEndDate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{qty(o.plannedQty)}</TableCell>
                        <TableCell className="text-right tabular-nums">{qty(o.remainingQty)}</TableCell>
                        <TableCell>
                          <StatusBadge status={o.status} />
                        </TableCell>
                      </TableRow>
                      {expanded ? (
                        <TableRow>
                          <TableCell colSpan={11} className="bg-muted/30 p-3">
                            {days.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No production planned for this style yet.</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="text-right">Efficiency</TableHead>
                                    <TableHead className="text-right">Capacity</TableHead>
                                    <TableHead className="text-right">Planned</TableHead>
                                    <TableHead className="text-right">Cumulative</TableHead>
                                    <TableHead className="text-right">Remaining</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {days.map((d) => (
                                    <TableRow key={d.planDayId}>
                                      <TableCell className="tabular-nums">{dateText(d.date)}</TableCell>
                                      <TableCell className="text-right tabular-nums">{pct(d.efficiency)}</TableCell>
                                      <TableCell className="text-right tabular-nums">{qty(d.dailyCapacity)}</TableCell>
                                      <TableCell className="text-right tabular-nums">{qty(d.plannedQty)}</TableCell>
                                      <TableCell className="text-right tabular-nums">{qty(d.cumulativeQty)}</TableCell>
                                      <TableCell className="text-right tabular-nums">{qty(d.remainingQty)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </SectionCard>

        <SectionCard title="Audit trail" description="Every generated plan records its inputs">
          <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Plan ID", result.audit.planId],
              ["Result ID", result.audit.resultId],
              ["Generated at", new Date(result.audit.generatedAt).toLocaleString("en-GB")],
              ["Period", `${result.audit.period.from} → ${result.audit.period.to}`],
              ["Scenario", result.audit.scenarioName],
              ["Sewing plan source", result.audit.sewingPlanSource ?? "—"],
              ["SMV source", result.audit.smvSource ?? "—"],
              ["Overproduction allowed", result.audit.allowOverproduction ? "Yes" : "No"],
            ].map(([k, v]) => (
              <div key={k} className="rounded border border-border px-3 py-2">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className="truncate font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            The standard Production Buildup Plan workbook export is delivered in the next phase.
          </p>
        </SectionCard>
      </div>
    </AppShell>
  );
}
