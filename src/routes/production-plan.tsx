import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { missingSmvStyles, monthPeriod, periodLabel, usePlanning } from "@/lib/app-state/planning-store";
import { isProductive } from "@/planning/CalendarCalculator";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/production-plan")({
  head: () => ({
    meta: [
      { title: "Production Plan — Armana Production Planning" },
      {
        name: "description",
        content:
          "Generate the daily production plan: upload the sewing plan and SMV master, set the calendar and line settings, then review the buildup line by line.",
      },
      { property: "og:title", content: "Production Plan — Armana Production Planning" },
      {
        property: "og:description",
        content:
          "Generate and review the daily production buildup for every Armana sewing line in the planning period.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductionPlanPage,
});

const PAGE_SIZE = 50;

function Step({
  index,
  title,
  detail,
  done,
  warn,
}: {
  index: number;
  title: string;
  detail: string;
  done: boolean;
  warn?: boolean;
}) {
  const Icon = done ? CheckCircle2 : warn ? AlertTriangle : Circle;
  return (
    <div className="flex gap-2 rounded-md border border-border bg-card p-3">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          done ? "text-success" : warn ? "text-warning" : "text-muted-foreground",
        )}
      />
      <div className="min-w-0">
        <p className="text-xs font-semibold">
          {index}. {title}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function ProductionPlanPage() {
  const planning = usePlanning();
  const {
    imported,
    smvMaster,
    calendar,
    lineSettings,
    period,
    setPeriod,
    result,
    generate,
    generating,
    stale,
  } = planning;

  const [lineFilter, setLineFilter] = useState("ALL");
  const [styleFilter, setStyleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(0);

  const missing = useMemo(() => missingSmvStyles(planning), [planning]);
  const criticalIssues = result?.issues.filter((i) => i.severity === "CRITICAL") ?? [];
  const workingDays = calendar.filter((d) => isProductive(d.workingStatus)).length;
  const canGenerate = Boolean(imported) && smvMaster.length > 0 && workingDays > 0;

  const rows = useMemo(() => {
    if (!result) return [];
    const q = styleFilter.trim().toLowerCase();
    return result.days.filter((d) => {
      if (lineFilter !== "ALL" && d.lineId !== lineFilter) return false;
      if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
      if (q && !(d.styleNo ?? "").toLowerCase().includes(q) && !(d.poNo ?? "").toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [result, lineFilter, statusFilter, styleFilter]);

  const paged = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const handleGenerate = async () => {
    if (!canGenerate) return;
    const res = await generate();
    if (res) toast.success("Production plan generated successfully.");
  };

  return (
    <AppShell
      title="Production Plan"
      subtitle={`Planning period ${periodLabel(period)}`}
      actions={
        <>
          <Button size="sm" variant="outline" asChild>
            <Link to="/sewing-plan-upload">Upload sewing plan</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/smv-master">Upload SMV</Link>
          </Button>
          <Button size="sm" variant="outline" disabled={!result || generating} onClick={() => void generate()}>
            Recalculate
          </Button>
          <Button size="sm" disabled={!canGenerate || generating} onClick={() => void handleGenerate()}>
            {generating ? "Calculating capacity…" : "Generate plan"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SectionCard title="Planning workflow" description="Every step must be complete before the plan is generated">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            <Step
              index={1}
              title="Sewing plan"
              detail={
                imported
                  ? `${planning.planFileName} · ${imported.summary.planningRecords.toLocaleString()} records · ${imported.summary.linesDetected} lines`
                  : "No sewing plan uploaded"
              }
              done={Boolean(imported)}
            />
            <Step
              index={2}
              title="Validation"
              detail={
                imported
                  ? `${imported.summary.successfullyParsed.toLocaleString()} valid · ${imported.summary.warnings} warnings · ${imported.summary.criticalErrors} critical`
                  : "Waiting for the sewing plan"
              }
              done={Boolean(imported) && imported!.summary.criticalErrors === 0}
              warn={Boolean(imported) && imported!.summary.criticalErrors > 0}
            />
            <Step
              index={3}
              title="SMV"
              detail={
                smvMaster.length
                  ? `${smvMaster.length} SMV records · ${missing.length} styles without SMV`
                  : "No SMV master loaded"
              }
              done={smvMaster.length > 0 && missing.length === 0}
              warn={smvMaster.length > 0 && missing.length > 0}
            />
            <Step
              index={4}
              title="Calendar"
              detail={`${workingDays} working days · ${calendar.length - workingDays} non-working days`}
              done={workingDays > 0}
            />
            <Step
              index={5}
              title="Planning settings"
              detail={
                lineSettings.length
                  ? `${lineSettings.filter((l) => l.active).length} active lines · ${lineSettings[0]?.workingHours ?? 0} hrs · ramp ${pct(lineSettings[0]?.ramp.startEfficiency ?? 0, 0)} → ${pct(lineSettings[0]?.ramp.maxEfficiency ?? 0, 0)}`
                  : "No line settings"
              }
              done={lineSettings.length > 0}
            />
            <Step
              index={6}
              title="Generate"
              detail={
                result
                  ? stale
                    ? "Settings changed since the last calculation — recalculate"
                    : `Generated ${new Date(result.audit.generatedAt).toLocaleString("en-GB")}`
                  : "Not generated yet"
              }
              done={Boolean(result) && !stale}
              warn={Boolean(result) && stale}
            />
          </div>

          {generating ? (
            <div className="mt-3">
              <p className="mb-1 text-xs text-muted-foreground">Calculating capacity… generating production plan…</p>
              <Progress value={70} />
            </div>
          ) : null}

          {!canGenerate ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="size-4 text-warning" />
              <span>
                {!imported
                  ? "The production plan cannot be generated because no sewing plan has been uploaded."
                  : !smvMaster.length
                    ? "The production plan cannot be generated because no SMV master has been loaded."
                    : "The production plan cannot be generated because the calendar has no working days."}
              </span>
              <Button size="sm" variant="outline" asChild>
                <Link to={!imported ? "/sewing-plan-upload" : !smvMaster.length ? "/smv-master" : "/calendar"}>
                  Fix now
                </Link>
              </Button>
            </div>
          ) : missing.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="size-4 text-warning" />
              <span>
                {missing.length} styles do not have an SMV — no capacity is calculated for those styles.
              </span>
              <Button size="sm" variant="outline" asChild>
                <Link to="/smv-master">View errors</Link>
              </Button>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Filters" description="Planning month, line, style or PO and day status">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="month">Planning month</Label>
              <Input
                id="month"
                type="month"
                value={period.from.slice(0, 7)}
                onChange={(e) => e.target.value && setPeriod(monthPeriod(`${e.target.value}-01`))}
              />
            </div>
            <div className="space-y-1">
              <Label>Factory</Label>
              <Input value="Armana Apparels Ltd" readOnly />
            </div>
            <div className="space-y-1">
              <Label>Line</Label>
              <Select
                value={lineFilter}
                onValueChange={(v) => {
                  setLineFilter(v);
                  setPage(0);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All lines</SelectItem>
                  {lineSettings.map((l) => (
                    <SelectItem key={l.lineId} value={l.lineId}>
                      {l.lineName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="style">Style or PO</Label>
              <Input
                id="style"
                value={styleFilter}
                onChange={(e) => {
                  setStyleFilter(e.target.value);
                  setPage(0);
                }}
                placeholder="e.g. D100142"
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(0);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["ALL", "PLANNED", "IDLE", "HOLIDAY", "WEEKLY_OFF", "LINE_OFF", "SMV_MISSING", "ORDER_COMPLETE"].map(
                    (s) => (
                      <SelectItem key={s} value={s}>
                        {s === "ALL" ? "All statuses" : s.replace(/_/g, " ")}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>

        {!result ? (
          <EmptyState
            title="No production plan"
            message="Complete validation and generate the plan. Capacity, planned quantity and the daily buildup appear here."
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Total capacity" value={qty(result.factory.totalCapacity)} />
              <KpiCard label="Planned qty" value={qty(result.factory.totalPlannedQty)} />
              <KpiCard
                label="Capacity gap"
                value={signedQty(result.factory.totalCapacity - result.factory.totalRequired)}
                tone={result.factory.totalCapacity - result.factory.totalRequired >= 0 ? "positive" : "negative"}
              />
              <KpiCard label="Average efficiency" value={pct(result.factory.averageEfficiency)} />
            </div>

            {criticalIssues.length ? (
              <SectionCard title={`Critical issues (${criticalIssues.length})`} description="Resolve before publishing the plan">
                <ul className="space-y-1 text-sm">
                  {criticalIssues.slice(0, 20).map((i) => (
                    <li key={i.id} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                      <span>{i.message}</span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ) : null}

            <SectionCard
              title="Production buildup"
              description={`${rows.length.toLocaleString()} daily records`}
            >
              <div className="max-h-[620px] overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted">
                    <TableRow>
                      <TableHead className="w-24">Date</TableHead>
                      <TableHead className="w-20">Line</TableHead>
                      <TableHead className="w-32">Style</TableHead>
                      <TableHead className="w-24">PO</TableHead>
                      <TableHead className="w-16 text-right">SMV</TableHead>
                      <TableHead className="w-16 text-right">Eff</TableHead>
                      <TableHead className="w-16 text-right">Hrs</TableHead>
                      <TableHead className="w-16 text-right">MP</TableHead>
                      <TableHead className="w-24 text-right">Capacity</TableHead>
                      <TableHead className="w-24 text-right">Planned</TableHead>
                      <TableHead className="w-24 text-right">Cumulative</TableHead>
                      <TableHead className="w-24 text-right">Remaining</TableHead>
                      <TableHead className="w-36">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((d) => (
                      <TableRow key={d.planDayId}>
                        <TableCell className="tabular-nums">{dateText(d.date)}</TableCell>
                        <TableCell>{d.lineName}</TableCell>
                        <TableCell className="font-medium">{d.styleNo ?? "—"}</TableCell>
                        <TableCell>{d.poNo ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{smvText(d.smv)}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct(d.efficiency, 0)}</TableCell>
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
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Page {page + 1} of {pages}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= pages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </AppShell>
  );
}
