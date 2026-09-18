import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/shell/app-shell";
import {
  EmptyState,
  KpiCard,
  SectionCard,
  StatusBadge,
  gapStatusKey,
  pct,
  qty,
  signedQty,
} from "@/components/planning/ui-bits";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePlanning } from "@/lib/app-state/planning-store";
import { isProductive } from "@/planning/CalendarCalculator";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Production Planning Dashboard — Armana Group" },
      {
        name: "description",
        content:
          "Capacity, planned quantity, capacity gap and efficiency across all Armana sewing lines for the selected planning period.",
      },
      { property: "og:title", content: "Production Planning Dashboard — Armana Group" },
      {
        property: "og:description",
        content:
          "Capacity, planned quantity, capacity gap and efficiency across all Armana sewing lines for the selected planning period.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { imported, result, lineSettings, calendar } = usePlanning();

  const workingDays = calendar.filter((d) => isProductive(d.workingStatus)).length;
  const activeLines = lineSettings.filter((l) => l.active).length;

  const dailyTrend = useMemo(() => {
    if (!result) return [];
    const byDate = new Map<
      string,
      { date: string; capacity: number; requirement: number; planned: number; effSum: number; effCount: number }
    >();
    for (const d of result.days) {
      const row =
        byDate.get(d.date) ??
        { date: d.date, capacity: 0, requirement: 0, planned: 0, effSum: 0, effCount: 0 };
      row.capacity += d.dailyCapacity;
      row.requirement += d.requiredQty ?? 0;
      row.planned += d.plannedQty;
      if (d.plannedQty > 0) {
        row.effSum += d.efficiency;
        row.effCount += 1;
      }
      byDate.set(d.date, row);
    }
    return [...byDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        ...r,
        label: r.date.slice(8),
        efficiency: r.effCount ? Number(((r.effSum / r.effCount) * 100).toFixed(1)) : 0,
      }));
  }, [result]);

  const lineChartData = useMemo(
    () =>
      result
        ? result.lineSummaries.map((l) => ({
            line: l.lineName.replace("LINE-", "L"),
            required: Math.round(l.totalRequired),
            capacity: Math.round(l.totalCapacity),
            planned: Math.round(l.totalPlanned),
          }))
        : [],
    [result],
  );

  const rampPreview = useMemo(() => {
    const first = lineSettings[0];
    if (!first) return [];
    const { startEfficiency, maxEfficiency, rampStep, mode } = first.ramp;
    return Array.from({ length: 10 }, (_, i) => {
      const value =
        mode === "NONE"
          ? maxEfficiency
          : Math.min(maxEfficiency, startEfficiency + rampStep * i);
      return { day: i + 1, efficiency: Number((value * 100).toFixed(1)) };
    });
  }, [lineSettings]);

  if (!imported) {
    return (
      <AppShell title="Production Planning Dashboard" subtitle="Production capacity and buildup overview">
        <EmptyState
          title="No sewing plan uploaded"
          message="Upload a sewing plan to begin production planning. The dashboard fills in as soon as a plan is generated."
          actionLabel="Upload sewing plan"
          actionTo="/sewing-plan-upload"
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Production Planning Dashboard"
      subtitle="Production capacity and buildup overview"
      actions={
        <Button size="sm" asChild>
          <Link to="/production-plan">Open production plan</Link>
        </Button>
      }
    >
      {!result ? (
        <EmptyState
          title="No production plan yet"
          message="Complete validation and generate the plan to see capacity, gap and efficiency figures."
          actionLabel="Go to production plan"
          actionTo="/production-plan"
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Total lines" value={String(lineSettings.length)} />
            <KpiCard label="Active lines" value={String(activeLines)} />
            <KpiCard label="Working days" value={String(workingDays)} hint="In the planning period" />
            <KpiCard label="Total order qty" value={qty(result.factory.totalOrderQty)} />
            <KpiCard label="Planned qty" value={qty(result.factory.totalPlannedQty)} />
            <KpiCard label="Total capacity" value={qty(result.factory.totalCapacity)} />
            <KpiCard
              label="Capacity gap"
              value={signedQty(result.factory.totalCapacity - result.factory.totalRequired)}
              tone={
                result.factory.totalCapacity - result.factory.totalRequired >= 0 ? "positive" : "negative"
              }
              hint="Capacity minus plan requirement"
            />
            <KpiCard
              label="Average efficiency"
              value={pct(result.factory.averageEfficiency)}
              hint="Earned minutes / available minutes"
            />
          </div>

          <SectionCard
            title="Capacity overview"
            description="Requirement, capacity and planned quantity for each sewing line"
          >
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lineChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="line" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" width={64} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => v.toLocaleString()}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="required" name="Required" fill="var(--chart-3)" />
                  <Bar dataKey="capacity" name="Capacity" fill="var(--chart-1)" />
                  <Bar dataKey="planned" name="Planned" fill="var(--chart-2)" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead className="text-right">Required</TableHead>
                    <TableHead className="text-right">Capacity</TableHead>
                    <TableHead className="text-right">Planned</TableHead>
                    <TableHead className="text-right">Gap</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.lineSummaries.map((l) => (
                    <TableRow key={l.lineId}>
                      <TableCell className="font-medium">
                        <Link
                          to="/line-capacity/$lineId"
                          params={{ lineId: l.lineId }}
                          className="hover:underline"
                        >
                          {l.lineName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{qty(l.totalRequired)}</TableCell>
                      <TableCell className="text-right tabular-nums">{qty(l.totalCapacity)}</TableCell>
                      <TableCell className="text-right tabular-nums">{qty(l.totalPlanned)}</TableCell>
                      <TableCell className="text-right tabular-nums">{signedQty(l.capacityGap)}</TableCell>
                      <TableCell>
                        <StatusBadge status={gapStatusKey(l.capacityGap)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard
              title="Daily capacity trend"
              description="Capacity vs requirement vs planned production"
            >
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={64} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                      labelFormatter={(l, payload) => payload?.[0]?.payload?.date ?? String(l)}
                      formatter={(v: number) => v.toLocaleString()}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="capacity" name="Capacity" stroke="var(--chart-1)" dot={false} />
                    <Line
                      type="monotone"
                      dataKey="requirement"
                      name="Requirement"
                      stroke="var(--chart-3)"
                      dot={false}
                    />
                    <Line type="monotone" dataKey="planned" name="Planned" stroke="var(--chart-2)" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard
              title="Efficiency trend"
              description="Planned daily efficiency against the configured ramp-up"
            >
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded border border-border px-2 py-1.5">
                  <p className="text-[11px] uppercase text-muted-foreground">Starting</p>
                  <p className="text-sm font-semibold">{pct(lineSettings[0]?.ramp.startEfficiency ?? 0, 0)}</p>
                </div>
                <div className="rounded border border-border px-2 py-1.5">
                  <p className="text-[11px] uppercase text-muted-foreground">Maximum</p>
                  <p className="text-sm font-semibold">{pct(lineSettings[0]?.ramp.maxEfficiency ?? 0, 0)}</p>
                </div>
                <div className="rounded border border-border px-2 py-1.5">
                  <p className="text-[11px] uppercase text-muted-foreground">Average</p>
                  <p className="text-sm font-semibold">{pct(result.factory.averageEfficiency)}</p>
                </div>
              </div>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="var(--muted-foreground)"
                      width={44}
                      unit="%"
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                      formatter={(v: number) => `${v}%`}
                    />
                    <Line
                      type="monotone"
                      dataKey="efficiency"
                      name="Planned efficiency"
                      stroke="var(--chart-4)"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {rampPreview.map((r) => (
                  <span
                    key={r.day}
                    className="rounded border border-border px-2 py-1 text-[11px] tabular-nums text-muted-foreground"
                  >
                    Day {r.day}: <span className="font-medium text-foreground">{r.efficiency}%</span>
                  </span>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>
      )}
    </AppShell>
  );
}
