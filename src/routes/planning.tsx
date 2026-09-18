import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Calculator } from "lucide-react";
import { toast } from "sonner";

import { UploadCard } from "@/components/plan/upload-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseSewingPlanWorkbook } from "@/lib/import/parse-workbook";
import type { ImportResult, WorkingCalendarDay } from "@/lib/import/types";
import { makeSmvRecord } from "@/lib/master/master-data";
import { parseSmvFile } from "@/lib/plan/smv";
import { calendarForPeriod, dayName, datesInPeriod } from "@/planning/CalendarCalculator";
import { formatEfficiency, formatQty } from "@/planning/CapacityCalculator";
import { compareScenarios, runPlanningEngineCached } from "@/planning/PlanningEngine";
import type {
  LinePlanSettings,
  PlanningInput,
  PlanningResult,
  Scenario,
  ScenarioComparisonRow,
} from "@/planning/types";
import type { SmvMasterRecord } from "@/lib/import/types";

export const Route = createFileRoute("/planning")({
  head: () => ({
    meta: [
      { title: "Capacity & planning engine — Armana Planning" },
      {
        name: "description",
        content:
          "Turn the sewing plan, SMVs, line settings and working calendar into a daily production plan with capacity, buildup and shortage figures.",
      },
      { property: "og:title", content: "Capacity & planning engine — Armana Planning" },
      {
        property: "og:description",
        content:
          "Turn the sewing plan, SMVs, line settings and working calendar into a daily production plan with capacity, buildup and shortage figures.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanningPage,
});

function defaultPeriod() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function PlanningPage() {
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [smvMaster, setSmvMaster] = useState<SmvMasterRecord[]>([]);
  const [smvSource, setSmvSource] = useState<string | null>(null);
  const [period, setPeriod] = useState(defaultPeriod);
  const [lineSettings, setLineSettings] = useState<LinePlanSettings[]>([]);
  const [calendar, setCalendar] = useState<WorkingCalendarDay[]>([]);
  const [allowOver, setAllowOver] = useState(false);
  const [result, setResult] = useState<PlanningResult | null>(null);
  const [comparison, setComparison] = useState<ScenarioComparisonRow[] | null>(null);
  const [scenarioEff, setScenarioEff] = useState(75);
  const [scenarioHours, setScenarioHours] = useState(9);

  const buildCalendar = (from: string, to: string, existing: WorkingCalendarDay[] = []) =>
    calendarForPeriod({ from, to }, 8, existing);

  const handlePlanFile = async (file: File) => {
    setBusy(true);
    try {
      const parsed = parseSewingPlanWorkbook(await file.arrayBuffer(), file.name);
      setImported(parsed);
      setLineSettings(
        parsed.plan.lines.map((l) => ({
          lineId: l.id,
          lineName: l.label,
          active: true,
          workingHours: 8,
          manpower: 73,
          ramp: {
            mode: "FIXED",
            startEfficiency: 0.5,
            maxEfficiency: 0.8,
            rampStep: 0.05,
            customValues: {},
          },
        })),
      );
      const range = parsed.plan.dateRange;
      let next = period;
      if (range) {
        const start = new Date(`${range.from}T00:00:00Z`);
        const from = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
        const to = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
        next = { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
      }
      setPeriod(next);
      setCalendar(buildCalendar(next.from, next.to));
      setResult(null);
      setComparison(null);
      toast.success(`Loaded ${parsed.entries.length.toLocaleString()} planning records`);
    } catch (e) {
      console.error(e);
      toast.error("That file could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const handleSmvFile = async (file: File) => {
    const { entries, error } = parseSmvFile(await file.arrayBuffer());
    if (error) {
      toast.error(error);
      return;
    }
    setSmvMaster(
      entries.map((e) =>
        makeSmvRecord({ styleNo: e.style, smv: e.smv, effectiveDate: period.from, source: file.name }),
      ),
    );
    setSmvSource(file.name);
    setResult(null);
    toast.success(`Loaded ${entries.length} SMV records`);
  };

  const setPeriodPart = (part: "from" | "to", value: string) => {
    const next = { ...period, [part]: value };
    setPeriod(next);
    setCalendar(buildCalendar(next.from, next.to, calendar));
    setResult(null);
  };

  const patchLine = (lineId: string, patch: Partial<LinePlanSettings>) => {
    setLineSettings((prev) =>
      prev.map((l) => (l.lineId === lineId ? { ...l, ...patch } : l)),
    );
    setResult(null);
  };

  const patchRamp = (lineId: string, patch: Partial<LinePlanSettings["ramp"]>) => {
    setLineSettings((prev) =>
      prev.map((l) => (l.lineId === lineId ? { ...l, ramp: { ...l.ramp, ...patch } } : l)),
    );
    setResult(null);
  };

  const toggleDay = (date: string) => {
    setCalendar((prev) =>
      prev.map((d) =>
        d.date === date
          ? { ...d, workingStatus: d.workingStatus === "WORKING" ? "WEEKLY_OFF" : "WORKING" }
          : d,
      ),
    );
    setResult(null);
  };

  const engineInput: PlanningInput | null = useMemo(() => {
    if (!imported) return null;
    return {
      planId: imported.plan.id,
      entries: imported.entries,
      lines: imported.plan.lines,
      smvMaster,
      calendar,
      lineSettings,
      period,
      allowOverproduction: allowOver,
      sources: { sewingPlan: imported.plan.fileName, smv: smvSource ?? undefined },
    };
  }, [imported, smvMaster, calendar, lineSettings, period, allowOver, smvSource]);

  const calculate = () => {
    if (!engineInput) return;
    const res = runPlanningEngineCached(engineInput);
    setResult(res);
    setComparison(null);
    toast.success(
      `Plan generated — ${formatQty(res.factory.totalPlannedQty)} pcs across ${res.lineSummaries.length} lines`,
    );
  };

  const runScenarios = () => {
    if (!engineInput) return;
    const scenarios: Scenario[] = [
      { id: "base", name: "Base plan", overrides: {} },
      {
        id: "eff",
        name: `Efficiency ${scenarioEff}%`,
        overrides: { maxEfficiency: scenarioEff / 100 },
      },
      {
        id: "hours",
        name: `${scenarioHours} hour day`,
        overrides: { workingHours: scenarioHours },
      },
    ];
    setComparison(compareScenarios(engineInput, scenarios).rows);
  };

  const dailyRows = useMemo(
    () => (result ? result.days.filter((d) => d.plannedQty > 0 || d.status !== "IDLE").slice(0, 600) : []),
    [result],
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Armana production planning
            </p>
            <h1 className="text-lg font-semibold text-foreground">Capacity &amp; planning engine</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/import">Import &amp; data review</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/">
                <ArrowLeft className="mr-1 size-4" /> Back
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-2">
          <UploadCard
            title="Sewing plan"
            hint={imported ? imported.plan.fileName : "Upload the rough sewing plan workbook"}
            busy={busy}
            compact
            onFile={handlePlanFile}
          />
          <UploadCard
            title="SMV master"
            hint={smvSource ?? "Style No + SMV columns (Excel or CSV)"}
            compact
            onFile={handleSmvFile}
          />
        </div>

        {imported && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Planning period &amp; rules</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-4">
                <div>
                  <Label className="text-xs">From</Label>
                  <Input
                    type="date"
                    value={period.from}
                    onChange={(e) => setPeriodPart("from", e.target.value)}
                    className="w-40"
                  />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input
                    type="date"
                    value={period.to}
                    onChange={(e) => setPeriodPart("to", e.target.value)}
                    className="w-40"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={allowOver}
                    onCheckedChange={(v) => {
                      setAllowOver(v);
                      setResult(null);
                    }}
                  />
                  <Label className="text-xs">Allow overproduction</Label>
                </div>
                <Button onClick={calculate} disabled={!engineInput}>
                  <Calculator className="mr-1 size-4" /> Generate production plan
                </Button>
              </CardContent>
            </Card>

            <Tabs defaultValue="lines">
              <TabsList>
                <TabsTrigger value="lines">Line settings</TabsTrigger>
                <TabsTrigger value="calendar">Working calendar</TabsTrigger>
                <TabsTrigger value="results">Results</TabsTrigger>
                <TabsTrigger value="daily">Daily plan</TabsTrigger>
                <TabsTrigger value="orders">Style buildup</TabsTrigger>
                <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
              </TabsList>

              <TabsContent value="lines" className="mt-4">
                <div className="overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Line</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead>Manpower</TableHead>
                        <TableHead>Ramp mode</TableHead>
                        <TableHead>Start eff %</TableHead>
                        <TableHead>Step %</TableHead>
                        <TableHead>Max eff %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineSettings.map((l) => (
                        <TableRow key={l.lineId}>
                          <TableCell className="font-medium">{l.lineName}</TableCell>
                          <TableCell>
                            <Switch
                              checked={l.active}
                              onCheckedChange={(v) => patchLine(l.lineId, { active: v })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.5"
                              className="w-20"
                              value={l.workingHours}
                              onChange={(e) =>
                                patchLine(l.lineId, { workingHours: Number(e.target.value) })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="w-20"
                              value={l.manpower}
                              onChange={(e) =>
                                patchLine(l.lineId, { manpower: Number(e.target.value) })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <select
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                              value={l.ramp.mode}
                              onChange={(e) =>
                                patchRamp(l.lineId, {
                                  mode: e.target.value as LinePlanSettings["ramp"]["mode"],
                                })
                              }
                            >
                              <option value="NONE">No ramp</option>
                              <option value="FIXED">Fixed ramp</option>
                              <option value="CUSTOM">Custom</option>
                            </select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="w-20"
                              value={Math.round(l.ramp.startEfficiency * 100)}
                              onChange={(e) =>
                                patchRamp(l.lineId, { startEfficiency: Number(e.target.value) / 100 })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="w-20"
                              value={Math.round(l.ramp.rampStep * 100)}
                              onChange={(e) =>
                                patchRamp(l.lineId, { rampStep: Number(e.target.value) / 100 })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="w-20"
                              value={Math.round(l.ramp.maxEfficiency * 100)}
                              onChange={(e) =>
                                patchRamp(l.lineId, { maxEfficiency: Number(e.target.value) / 100 })
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="calendar" className="mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      Tap a day to switch it between working and off
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {datesInPeriod(period).map((date) => {
                      const day = calendar.find((d) => d.date === date);
                      const off = day && day.workingStatus !== "WORKING" && day.workingStatus !== "SPECIAL_WORKING_DAY";
                      return (
                        <button
                          key={date}
                          onClick={() => toggleDay(date)}
                          className={`rounded-md border px-3 py-2 text-xs ${
                            off
                              ? "border-destructive/40 bg-destructive/10 text-destructive"
                              : "border-border bg-card text-foreground"
                          }`}
                        >
                          <span className="block font-medium">{date.slice(8)}</span>
                          <span className="block text-[10px] text-muted-foreground">
                            {dayName(date).slice(0, 3)}
                          </span>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="results" className="mt-4 space-y-4">
                {!result ? (
                  <p className="text-sm text-muted-foreground">
                    Set the lines and calendar, then press Generate production plan.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Stat label="Total capacity" value={formatQty(result.factory.totalCapacity)} />
                      <Stat label="Planned quantity" value={formatQty(result.factory.totalPlannedQty)} />
                      <Stat label="Order quantity" value={formatQty(result.factory.totalOrderQty)} />
                      <Stat
                        label="Factory efficiency"
                        value={formatEfficiency(result.factory.averageEfficiency)}
                      />
                      <Stat label="Available minutes" value={formatQty(result.factory.totalAvailableMinutes)} />
                      <Stat label="Earned minutes" value={formatQty(result.factory.totalEarnedMinutes)} />
                      <Stat
                        label="Capacity surplus"
                        value={formatQty(result.factory.capacitySurplus)}
                        tone="text-success"
                      />
                      <Stat
                        label="Capacity shortage"
                        value={formatQty(result.factory.capacityShortage)}
                        tone="text-destructive"
                      />
                    </div>

                    <div className="overflow-auto rounded-md border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Line</TableHead>
                            <TableHead className="text-right">Working days</TableHead>
                            <TableHead className="text-right">Capacity</TableHead>
                            <TableHead className="text-right">Planned</TableHead>
                            <TableHead className="text-right">Plan target</TableHead>
                            <TableHead className="text-right">Gap</TableHead>
                            <TableHead className="text-right">Efficiency</TableHead>
                            <TableHead className="text-right">Style changes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.lineSummaries.map((l) => (
                            <TableRow key={l.lineId}>
                              <TableCell>{l.lineName}</TableCell>
                              <TableCell className="text-right">{l.workingDays}</TableCell>
                              <TableCell className="text-right">{formatQty(l.totalCapacity)}</TableCell>
                              <TableCell className="text-right">{formatQty(l.totalPlanned)}</TableCell>
                              <TableCell className="text-right">{formatQty(l.totalRequired)}</TableCell>
                              <TableCell
                                className={`text-right ${l.capacityGap < 0 ? "text-destructive" : "text-success"}`}
                              >
                                {l.capacityGap < 0 ? "" : "+"}
                                {formatQty(l.capacityGap)}
                              </TableCell>
                              <TableCell className="text-right">{formatEfficiency(l.efficiency)}</TableCell>
                              <TableCell className="text-right">{l.styleChanges}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">
                          Planning issues ({result.issues.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="max-h-64 space-y-1 overflow-auto text-sm">
                        {result.issues.slice(0, 150).map((i) => (
                          <p key={i.id}>
                            <Badge
                              variant="outline"
                              className={
                                i.severity === "CRITICAL"
                                  ? "border-destructive text-destructive"
                                  : i.severity === "WARNING"
                                    ? "border-warning text-warning"
                                    : ""
                              }
                            >
                              {i.severity}
                            </Badge>{" "}
                            <span className="text-muted-foreground">{i.message}</span>
                          </p>
                        ))}
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>

              <TabsContent value="daily" className="mt-4">
                {!result ? (
                  <p className="text-sm text-muted-foreground">Generate the plan first.</p>
                ) : (
                  <div className="max-h-[32rem] overflow-auto rounded-md border border-border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card">
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Line</TableHead>
                          <TableHead>Style</TableHead>
                          <TableHead className="text-right">SMV</TableHead>
                          <TableHead className="text-right">Hrs</TableHead>
                          <TableHead className="text-right">MP</TableHead>
                          <TableHead className="text-right">Eff</TableHead>
                          <TableHead className="text-right">Avail min</TableHead>
                          <TableHead className="text-right">Capacity</TableHead>
                          <TableHead className="text-right">Planned</TableHead>
                          <TableHead className="text-right">Cumulative</TableHead>
                          <TableHead className="text-right">Remaining</TableHead>
                          <TableHead className="text-right">Gap</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyRows.map((d) => (
                          <TableRow key={d.planDayId}>
                            <TableCell className="whitespace-nowrap">{d.date}</TableCell>
                            <TableCell>{d.lineName}</TableCell>
                            <TableCell>{d.styleNo ?? "—"}</TableCell>
                            <TableCell className="text-right">{d.smv ?? "—"}</TableCell>
                            <TableCell className="text-right">{d.workingHours}</TableCell>
                            <TableCell className="text-right">{d.manpower}</TableCell>
                            <TableCell className="text-right">{formatEfficiency(d.efficiency)}</TableCell>
                            <TableCell className="text-right">{formatQty(d.availableMinutes)}</TableCell>
                            <TableCell className="text-right">{formatQty(d.dailyCapacity)}</TableCell>
                            <TableCell className="text-right">{formatQty(d.plannedQty)}</TableCell>
                            <TableCell className="text-right">{formatQty(d.cumulativeQty)}</TableCell>
                            <TableCell className="text-right">
                              {d.remainingQty === null ? "—" : formatQty(d.remainingQty)}
                            </TableCell>
                            <TableCell
                              className={`text-right ${d.capacityGap !== null && d.capacityGap < 0 ? "text-destructive" : ""}`}
                            >
                              {d.capacityGap === null ? "—" : formatQty(d.capacityGap)}
                            </TableCell>
                            <TableCell className="text-xs">{d.status}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="orders" className="mt-4">
                {!result ? (
                  <p className="text-sm text-muted-foreground">Generate the plan first.</p>
                ) : (
                  <div className="max-h-[32rem] overflow-auto rounded-md border border-border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card">
                        <TableRow>
                          <TableHead>Line</TableHead>
                          <TableHead>Style</TableHead>
                          <TableHead>PO</TableHead>
                          <TableHead className="text-right">Order qty</TableHead>
                          <TableHead className="text-right">SMV</TableHead>
                          <TableHead>Start</TableHead>
                          <TableHead>End</TableHead>
                          <TableHead className="text-right">Planned</TableHead>
                          <TableHead className="text-right">Remaining</TableHead>
                          <TableHead>Projected finish</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.orders.map((o) => (
                          <TableRow key={o.runId}>
                            <TableCell>{o.lineName}</TableCell>
                            <TableCell>{o.styleNo ?? "—"}</TableCell>
                            <TableCell>{o.poNo ?? "—"}</TableCell>
                            <TableCell className="text-right">
                              {o.orderQty === null ? "—" : formatQty(o.orderQty)}
                            </TableCell>
                            <TableCell className="text-right">{o.smv ?? "—"}</TableCell>
                            <TableCell>{o.plannedStartDate ?? "—"}</TableCell>
                            <TableCell>{o.plannedEndDate ?? "—"}</TableCell>
                            <TableCell className="text-right">{formatQty(o.plannedQty)}</TableCell>
                            <TableCell className="text-right">
                              {o.remainingQty === null ? "—" : formatQty(o.remainingQty)}
                            </TableCell>
                            <TableCell>{o.projectedCompletionDate ?? "—"}</TableCell>
                            <TableCell className="text-xs">{o.status}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="scenarios" className="mt-4 space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">What-if comparison</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-end gap-4">
                    <div>
                      <Label className="text-xs">Scenario A — efficiency %</Label>
                      <Input
                        type="number"
                        className="w-28"
                        value={scenarioEff}
                        onChange={(e) => setScenarioEff(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Scenario B — working hours</Label>
                      <Input
                        type="number"
                        step="0.5"
                        className="w-28"
                        value={scenarioHours}
                        onChange={(e) => setScenarioHours(Number(e.target.value))}
                      />
                    </div>
                    <Button variant="outline" onClick={runScenarios} disabled={!engineInput}>
                      Compare scenarios
                    </Button>
                  </CardContent>
                </Card>

                {comparison && (
                  <div className="overflow-auto rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Scenario</TableHead>
                          <TableHead className="text-right">Capacity</TableHead>
                          <TableHead className="text-right">Planned</TableHead>
                          <TableHead className="text-right">Gap</TableHead>
                          <TableHead className="text-right">Efficiency</TableHead>
                          <TableHead>Last planned day</TableHead>
                          <TableHead className="text-right">Orders completed</TableHead>
                          <TableHead className="text-right">Orders short</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparison.map((r) => (
                          <TableRow key={r.scenarioId}>
                            <TableCell>{r.scenarioName}</TableCell>
                            <TableCell className="text-right">{formatQty(r.totalCapacity)}</TableCell>
                            <TableCell className="text-right">{formatQty(r.totalPlanned)}</TableCell>
                            <TableCell className="text-right">{formatQty(r.capacityGap)}</TableCell>
                            <TableCell className="text-right">{formatEfficiency(r.averageEfficiency)}</TableCell>
                            <TableCell>{r.lastPlannedDate ?? "—"}</TableCell>
                            <TableCell className="text-right">{r.ordersCompleted}</TableCell>
                            <TableCell className="text-right">{r.ordersWithShortage}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}
