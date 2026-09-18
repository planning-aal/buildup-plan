import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
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
  dateText,
  pct,
  qty,
  signedQty,
  smvText,
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

export const Route = createFileRoute("/line-capacity/$lineId")({
  head: () => ({
    meta: [
      { title: "Line Detail — Armana Production Planning" },
      {
        name: "description",
        content:
          "Daily capacity, planned production, cumulative buildup and remaining order quantity for a single Armana sewing line.",
      },
      { property: "og:title", content: "Line Detail — Armana Production Planning" },
      {
        property: "og:description",
        content: "Daily capacity, cumulative buildup and remaining quantity for a single sewing line.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LineDetailPage,
});

function LineDetailPage() {
  const { lineId } = Route.useParams();
  const { result, lineSettings, calendar } = usePlanning();

  const settings = lineSettings.find((l) => l.lineId === lineId);
  const summary = result?.lineSummaries.find((l) => l.lineId === lineId);
  const days = useMemo(
    () => (result ? result.days.filter((d) => d.lineId === lineId).sort((a, b) => a.date.localeCompare(b.date)) : []),
    [result, lineId],
  );
  const orders = result ? result.orders.filter((o) => o.lineId === lineId) : [];

  const chartData = useMemo(() => {
    let cumulative = 0;
    return days.map((d) => {
      cumulative += d.plannedQty;
      return {
        label: d.date.slice(8),
        date: d.date,
        capacity: Math.round(d.dailyCapacity),
        planned: Math.round(d.plannedQty),
        cumulative: Math.round(cumulative),
      };
    });
  }, [days]);

  if (!result || !summary || !settings) {
    return (
      <AppShell title="Line detail" subtitle="Daily capacity and production buildup">
        <EmptyState
          title="No production plan"
          message="Complete validation and generate the plan to see line detail."
          actionLabel="Go to production plan"
          actionTo="/production-plan"
        />
      </AppShell>
    );
  }

  const workingDaysForLine = calendar.filter((d) => {
    const override = settings.calendarOverrides?.[d.date];
    const status = override ?? d.workingStatus;
    return status === "WORKING" || status === "SPECIAL_WORKING_DAY";
  }).length;

  return (
    <AppShell
      title={`${summary.lineName} — line detail`}
      subtitle="Style sequence, daily capacity and production buildup"
      actions={
        <Button size="sm" variant="outline" asChild>
          <Link to="/line-capacity">Back to line matrix</Link>
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Working hours" value={`${settings.workingHours} hrs`} />
          <KpiCard label="Manpower" value={String(settings.manpower)} />
          <KpiCard label="Working days" value={String(workingDaysForLine)} />
          <KpiCard label="Efficiency" value={pct(summary.efficiency)} hint="Earned / available minutes" />
          <KpiCard label="Capacity" value={qty(summary.totalCapacity)} />
          <KpiCard label="Planned" value={qty(summary.totalPlanned)} />
          <KpiCard label="Required" value={qty(summary.totalRequired)} />
          <KpiCard
            label="Capacity gap"
            value={signedQty(summary.capacityGap)}
            tone={summary.capacityGap >= 0 ? "positive" : "negative"}
          />
        </div>

        <SectionCard
          title="Production buildup"
          description="Daily capacity and planned production with the cumulative buildup curve"
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={60} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  width={70}
                />
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
                <Bar yAxisId="left" dataKey="capacity" name="Capacity" fill="var(--chart-1)" />
                <Bar yAxisId="left" dataKey="planned" name="Planned" fill="var(--chart-2)" />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="cumulative"
                  name="Cumulative"
                  stroke="var(--chart-4)"
                  fill="var(--chart-4)"
                  fillOpacity={0.12}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Style sequence" description="Orders planned on this line in sewing-plan sequence">
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Style</TableHead>
                  <TableHead>PO</TableHead>
                  <TableHead className="text-right">SMV</TableHead>
                  <TableHead className="text-right">Order qty</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="text-right">Planned</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Completion</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.runId}>
                    <TableCell className="font-medium">{o.styleNo ?? "—"}</TableCell>
                    <TableCell>{o.poNo ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{smvText(o.smv)}</TableCell>
                    <TableCell className="text-right tabular-nums">{qty(o.orderQty)}</TableCell>
                    <TableCell>{dateText(o.plannedStartDate)}</TableCell>
                    <TableCell>{dateText(o.plannedEndDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{qty(o.plannedQty)}</TableCell>
                    <TableCell className="text-right tabular-nums">{qty(o.remainingQty)}</TableCell>
                    <TableCell>{dateText(o.projectedCompletionDate)}</TableCell>
                    <TableCell>
                      <StatusBadge status={o.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>

        <SectionCard title="Daily plan" description="Every date in the planning period for this line">
          <div className="max-h-[520px] overflow-auto rounded-md border border-border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Style</TableHead>
                  <TableHead className="text-right">SMV</TableHead>
                  <TableHead className="text-right">Eff</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">MP</TableHead>
                  <TableHead className="text-right">Capacity</TableHead>
                  <TableHead className="text-right">Planned</TableHead>
                  <TableHead className="text-right">Cumulative</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((d) => (
                  <TableRow key={d.planDayId}>
                    <TableCell className="tabular-nums">{dateText(d.date)}</TableCell>
                    <TableCell>{d.styleNo ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{smvText(d.smv)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(d.efficiency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.workingHours}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.manpower}</TableCell>
                    <TableCell className="text-right tabular-nums">{qty(d.dailyCapacity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{qty(d.plannedQty)}</TableCell>
                    <TableCell className="text-right tabular-nums">{qty(d.cumulativeQty)}</TableCell>
                    <TableCell className="text-right tabular-nums">{qty(d.remainingQty)}</TableCell>
                    <TableCell>
                      <StatusBadge status={d.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
