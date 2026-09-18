import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, RotateCcw } from "lucide-react";

import { UploadCard } from "@/components/plan/upload-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildPlan,
  daysInMonth,
  defaultHolidays,
  weekdayName,
  type PlanSettings,
} from "@/lib/plan/model";
import { summariseStyles } from "@/lib/plan/parse-rough-plan";
import { parseSmvFile } from "@/lib/plan/smv";
import { generateWorkbook, loadTemplate, monthFileName } from "@/lib/plan/generate";
import { defaultSettings, usePlanSession } from "@/lib/plan/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/plan")({
  head: () => ({
    meta: [
      { title: "Plan workspace — Sewing Plan Builder" },
      {
        name: "description",
        content:
          "Set working hours, manpower, efficiency, ramp-up, SMVs and holidays, then export the Production Buildup Plan workbook.",
      },
      { property: "og:title", content: "Plan workspace — Sewing Plan Builder" },
      {
        property: "og:description",
        content:
          "Set working hours, manpower, efficiency, ramp-up, SMVs and holidays, then export the Production Buildup Plan workbook.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanWorkspace,
});

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const num = (v: number) => v.toLocaleString("en-US");

function PlanWorkspace() {
  const navigate = useNavigate();
  const { session, ready, update } = usePlanSession();
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (ready && !session) void navigate({ to: "/" });
  }, [ready, session, navigate]);

  const settings = session?.settings;

  const styles = useMemo(
    () => (session && settings ? summariseStyles(session.plan.entries, settings.month) : []),
    [session, settings],
  );

  const result = useMemo(
    () =>
      session && settings
        ? buildPlan({
            entries: session.plan.entries,
            styles,
            settings,
            smv: session.smv,
          })
        : null,
    [session, settings, styles],
  );

  if (!ready || !session || !settings || !result) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const patch = (next: Partial<PlanSettings>) =>
    update({ ...session, settings: { ...settings, ...next }, updatedAt: new Date().toISOString() });

  const patchLine = (line: number, next: Partial<PlanSettings["lines"][number]>) =>
    patch({ lines: settings.lines.map((l) => (l.line === line ? { ...l, ...next } : l)) });

  const dates = daysInMonth(settings.month);
  const holidays = new Set(settings.holidays);

  const handleSmvFile = async (file: File) => {
    const { entries, error } = parseSmvFile(await file.arrayBuffer());
    if (error) {
      toast.error(error);
      return;
    }
    update({ ...session, smv: entries, updatedAt: new Date().toISOString() });
    toast.success(`Loaded ${entries.length} SMV values`);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const templateBuffer = await loadTemplate();
      const blob = generateWorkbook({ settings, result, styles, templateBuffer });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = monthFileName(settings.month);
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Production Buildup Plan downloaded");
    } catch (error) {
      console.error(error);
      toast.error("The report could not be built. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <main className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>
              <ArrowLeft className="size-4" /> New file
            </Button>
            <div>
              <p className="text-sm font-semibold">{session.plan.fileName}</p>
              <p className="text-xs text-muted-foreground">
                {num(result.grandTotal)} pcs · average efficiency {pct(result.avgEfficiency)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={settings.month} onValueChange={(month) => patch({ month, holidays: defaultHolidays(month) })}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {session.plan.months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {new Date(`${m}-01T00:00:00`).toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Generate Excel
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Monthly output" value={`${num(result.grandTotal)} pcs`} />
          <Stat label="Average efficiency" value={pct(result.avgEfficiency)} />
          <Stat label="Styles in month" value={String(styles.length)} />
          <Stat
            label="Working days"
            value={`${dates.length - settings.holidays.length} of ${dates.length}`}
          />
        </div>

        <Tabs defaultValue="lines" className="mt-6">
          <TabsList>
            <TabsTrigger value="lines">Lines &amp; efficiency</TabsTrigger>
            <TabsTrigger value="calendar">Working days</TabsTrigger>
            <TabsTrigger value="smv">SMV</TabsTrigger>
            <TabsTrigger value="review">Data read</TabsTrigger>
          </TabsList>

          <TabsContent value="lines" className="mt-4 space-y-6">
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="font-semibold">Buildup &amp; monthly target</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Monthly target (pcs, 0 = as planned)">
                  <Input
                    type="number"
                    value={settings.monthlyTarget}
                    onChange={(e) => patch({ monthlyTarget: Number(e.target.value) || 0 })}
                  />
                </Field>
                <Field label="Ramp-up start efficiency %">
                  <Input
                    type="number"
                    value={Math.round(settings.rampStart * 100)}
                    onChange={(e) => patch({ rampStart: Number(e.target.value) / 100 })}
                  />
                </Field>
                <Field label="Ramp-up days to full rate">
                  <Input
                    type="number"
                    value={settings.rampDays}
                    onChange={(e) => patch({ rampDays: Math.max(1, Number(e.target.value)) })}
                  />
                </Field>
                <Field label="Rounding step (pcs)">
                  <Input
                    type="number"
                    value={settings.roundTo}
                    onChange={(e) => patch({ roundTo: Math.max(1, Number(e.target.value)) })}
                  />
                </Field>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={settings.fillEmptyDays}
                    onCheckedChange={(v) => patch({ fillEmptyDays: v })}
                  />
                  Fill empty working days
                </label>
                <Field label="Average fill target (pcs/day)" inline>
                  <Input
                    className="w-28"
                    type="number"
                    value={settings.fillAverage}
                    onChange={(e) => patch({ fillAverage: Number(e.target.value) || 0 })}
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between p-5 pb-3">
                <h2 className="font-semibold">Line settings</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => patch({ lines: defaultSettings(settings.month).lines })}
                >
                  <RotateCcw className="size-4" /> Reset
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead>Hours/day</TableHead>
                    <TableHead>Manpower</TableHead>
                    <TableHead>Target eff. %</TableHead>
                    <TableHead className="text-right">Month pcs</TableHead>
                    <TableHead className="text-right">Avg eff.</TableHead>
                    <TableHead className="text-right">Avg SMV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settings.lines.map((line) => {
                    const stats = result.perLine.find((p) => p.line === line.line)!;
                    return (
                      <TableRow key={line.line}>
                        <TableCell className="font-medium">Line {line.line}</TableCell>
                        <TableCell>
                          <Input
                            className="h-8 w-20"
                            type="number"
                            step="0.5"
                            value={line.hours}
                            onChange={(e) =>
                              patchLine(line.line, { hours: Number(e.target.value) || 0 })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 w-20"
                            type="number"
                            value={line.manpower}
                            onChange={(e) =>
                              patchLine(line.line, { manpower: Number(e.target.value) || 0 })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 w-20"
                            type="number"
                            value={Math.round(line.efficiency * 100)}
                            onChange={(e) =>
                              patchLine(line.line, { efficiency: Number(e.target.value) / 100 })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{num(stats.total)}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            stats.avgEfficiency > 0 && stats.avgEfficiency < 0.5 && "text-destructive",
                          )}
                        >
                          {pct(stats.avgEfficiency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {stats.avgSmv.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </section>
          </TabsContent>

          <TabsContent value="calendar" className="mt-4">
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold">Working days &amp; holidays</h2>
                  <p className="text-sm text-muted-foreground">
                    Tap a day to switch it between working and holiday. Fridays are off by default.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => patch({ holidays: defaultHolidays(settings.month) })}
                >
                  Fridays only
                </Button>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {dates.map((date) => {
                  const off = holidays.has(date);
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() =>
                        patch({
                          holidays: off
                            ? settings.holidays.filter((d) => d !== date)
                            : [...settings.holidays, date].sort(),
                        })
                      }
                      className={cn(
                        "rounded border p-2 text-left transition-colors",
                        off
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : "border-border bg-background hover:border-primary",
                      )}
                    >
                      <span className="block text-sm font-semibold">{Number(date.slice(-2))}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {weekdayName(date).slice(0, 3)}
                      </span>
                      <span className="block text-[11px]">{off ? "Holiday" : "Working"}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="smv" className="mt-4 space-y-4">
            <UploadCard
              compact
              title="Bulk SMV upload"
              hint="Excel or CSV with a Style No column and an SMV column"
              onFile={handleSmvFile}
            />
            {result.unmatchedStyles.length ? (
              <div className="rounded-lg border border-warning/50 bg-warning/10 p-4">
                <p className="text-sm font-semibold">
                  {result.unmatchedStyles.length} styles have no SMV in your file
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  They are running on the line average for now: {result.unmatchedStyles.join(", ")}
                </p>
              </div>
            ) : null}
            <section className="rounded-lg border border-border bg-card">
              <div className="p-5 pb-2">
                <h2 className="font-semibold">SMV list ({session.smv.length})</h2>
              </div>
              <div className="max-h-[420px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Style</TableHead>
                      <TableHead className="w-32 text-right">SMV</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {session.smv.map((entry, index) => (
                      <TableRow key={`${entry.style}-${index}`}>
                        <TableCell>{entry.style}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            className="ml-auto h-8 w-24 text-right"
                            type="number"
                            step="0.01"
                            value={entry.smv}
                            onChange={(e) =>
                              update({
                                ...session,
                                smv: session.smv.map((s, i) =>
                                  i === index ? { ...s, smv: Number(e.target.value) || 0 } : s,
                                ),
                                updatedAt: new Date().toISOString(),
                              })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {!session.smv.length ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground">
                          No SMVs uploaded yet — line averages from the plan are used.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="review" className="mt-4">
            <section className="rounded-lg border border-border bg-card">
              <div className="p-5 pb-2">
                <h2 className="font-semibold">Styles read from your file</h2>
                <p className="text-sm text-muted-foreground">
                  Order quantity comes from the P.O / QTY rows under each style.
                </p>
              </div>
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Line</TableHead>
                      <TableHead>Style</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Buyer</TableHead>
                      <TableHead className="text-right">Order qty</TableHead>
                      <TableHead className="text-right">Days</TableHead>
                      <TableHead className="text-right">Planned pcs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {styles.map((s, i) => (
                      <TableRow key={`${s.line}-${s.style}-${i}`}>
                        <TableCell>{s.line}</TableCell>
                        <TableCell className="font-medium">{s.style}</TableCell>
                        <TableCell>{s.merchant || "—"}</TableCell>
                        <TableCell>
                          {s.buyer ? (
                            s.buyer
                          ) : (
                            <Badge variant="outline" className="text-destructive">
                              add code
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.orderQty ? num(s.orderQty) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{s.days}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(s.plannedQty)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
  inline,
}: {
  label: string;
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <div className={cn(inline ? "flex items-center gap-2" : "space-y-1.5")}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
