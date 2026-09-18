import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";

import { UploadCard } from "@/components/plan/upload-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import type { ImportResult, SewingPlanEntry } from "@/lib/import/types";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "Import sewing plan — Armana Planning" },
      {
        name: "description",
        content:
          "Read an Armana sewing plan workbook, normalise every planning cell and review styles, POs, targets and warnings before planning.",
      },
      { property: "og:title", content: "Import sewing plan — Armana Planning" },
      {
        property: "og:description",
        content:
          "Read an Armana sewing plan workbook, normalise every planning cell and review styles, POs, targets and warnings before planning.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportPage,
});

const TYPE_TONE: Record<string, string> = {
  STYLE: "bg-primary/10 text-primary",
  PO: "bg-secondary text-secondary-foreground",
  BALANCE: "bg-warning/15 text-warning-foreground",
  LINE_SUPPORT: "bg-warning/15 text-warning-foreground",
  TOTAL_QTY: "bg-secondary text-secondary-foreground",
  INSTRUCTION: "bg-muted text-muted-foreground",
  OTHER: "bg-muted text-muted-foreground",
  UNKNOWN: "bg-destructive/10 text-destructive",
};

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

function ImportPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [onlyProblems, setOnlyProblems] = useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseSewingPlanWorkbook(buffer, file.name);
      setResult(parsed);
      toast.success(
        `Read ${parsed.summary.planningRecords.toLocaleString()} planning records from ${parsed.summary.sheetsDetected} sheets`,
      );
    } catch (error) {
      console.error(error);
      toast.error("That file could not be read. Please check it is the sewing plan workbook.");
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(() => {
    if (!result) return [] as SewingPlanEntry[];
    const q = query.trim().toLowerCase();
    return result.entries
      .filter((e) => (typeFilter === "ALL" ? true : e.entryType === typeFilter))
      .filter((e) => (onlyProblems ? e.parseStatus !== "PARSED" || e.flags.length > 0 : true))
      .filter((e) =>
        q
          ? e.rawText.toLowerCase().includes(q) ||
            (e.styleNo ?? "").toLowerCase().includes(q) ||
            (e.poNo ?? "").toLowerCase().includes(q) ||
            e.date.includes(q)
          : true,
      )
      .slice(0, 500);
  }, [result, query, typeFilter, onlyProblems]);

  const typeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of result?.entries ?? []) map.set(e.entryType, (map.get(e.entryType) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [result]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Armana production planning
            </p>
            <h1 className="text-lg font-semibold text-foreground">Import &amp; data review</h1>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="mr-1 size-4" /> Back
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <UploadCard
          title="Upload the sewing plan workbook"
          hint="Line sheets are detected automatically — any number of lines, any sheet order."
          busy={busy}
          compact={!!result}
          onFile={handleFile}
        />

        {result && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Sheets detected" value={result.summary.sheetsDetected} />
              <Stat label="Lines detected" value={result.summary.linesDetected} />
              <Stat
                label="Date range"
                value={`${result.summary.dateFrom ?? "—"} → ${result.summary.dateTo ?? "—"}`}
              />
              <Stat
                label="Planning records"
                value={result.summary.planningRecords.toLocaleString()}
              />
              <Stat label="Styles detected" value={result.summary.stylesDetected} />
              <Stat label="POs detected" value={result.summary.posDetected} />
              <Stat label="Targets detected" value={result.summary.targetsDetected} />
              <Stat
                label="Successfully read"
                value={result.summary.successfullyParsed.toLocaleString()}
                tone="text-success"
              />
              <Stat
                label="Critical errors"
                value={result.summary.criticalErrors}
                tone={result.summary.criticalErrors ? "text-destructive" : "text-success"}
              />
              <Stat label="Warnings" value={result.summary.warnings} tone="text-warning" />
              <Stat label="Information notes" value={result.summary.infos} />
              <Stat label="Style blocks (other sheets)" value={result.styleBlocks.length} />
            </div>

            <Tabs defaultValue="rows">
              <TabsList>
                <TabsTrigger value="rows">Planning records</TabsTrigger>
                <TabsTrigger value="issues">Validation</TabsTrigger>
                <TabsTrigger value="sheets">Sheets &amp; lines</TabsTrigger>
              </TabsList>

              <TabsContent value="rows" className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search style, PO, date or raw text"
                    className="max-w-xs"
                  />
                  <Button
                    size="sm"
                    variant={typeFilter === "ALL" ? "default" : "outline"}
                    onClick={() => setTypeFilter("ALL")}
                  >
                    All
                  </Button>
                  {typeCounts.map(([type, count]) => (
                    <Button
                      key={type}
                      size="sm"
                      variant={typeFilter === type ? "default" : "outline"}
                      onClick={() => setTypeFilter(type)}
                    >
                      {type} ({count})
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant={onlyProblems ? "default" : "outline"}
                    onClick={() => setOnlyProblems((v) => !v)}
                  >
                    Needs a look
                  </Button>
                </div>

                <div className="max-h-[32rem] overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Line</TableHead>
                        <TableHead className="min-w-64">Raw entry</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Style</TableHead>
                        <TableHead>PO</TableHead>
                        <TableHead className="text-right">Order qty</TableHead>
                        <TableHead className="text-right">Target</TableHead>
                        <TableHead>Delivery</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap">{e.date}</TableCell>
                          <TableCell className="whitespace-nowrap">{e.lineLabel}</TableCell>
                          <TableCell className="max-w-96 truncate" title={e.rawText}>
                            {e.rawText || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-medium ${TYPE_TONE[e.entryType] ?? ""}`}
                            >
                              {e.entryType}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {e.styleNo ?? "—"}
                            {e.secondaryCode ? (
                              <span className="text-muted-foreground"> / {e.secondaryCode}</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{e.poNo ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            {e.quantities.length
                              ? e.quantities.map((q) => q.value.toLocaleString()).join(" + ")
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {e.targetQty?.toLocaleString() ?? "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {e.deliveryDateStart
                              ? e.deliveryDateEnd && e.deliveryDateEnd !== e.deliveryDateStart
                                ? `${e.deliveryDateStart} → ${e.deliveryDateEnd}`
                                : e.deliveryDateStart
                              : (e.deliveryDateRaw ?? "—")}
                          </TableCell>
                          <TableCell>
                            {e.flags.filter((f) => f !== "CARRY_OVER_DAY").length ? (
                              <Badge variant="outline" className="border-warning text-warning">
                                {e.flags.filter((f) => f !== "CARRY_OVER_DAY").join(", ")}
                              </Badge>
                            ) : (
                              <span className="text-xs text-success">OK</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Showing {rows.length.toLocaleString()} of{" "}
                  {result.entries.length.toLocaleString()} records.
                </p>
              </TabsContent>

              <TabsContent value="issues" className="mt-4 space-y-3">
                {(["CRITICAL", "WARNING", "INFO"] as const).map((severity) => {
                  const list = result.issues.filter((i) => i.severity === severity);
                  const Icon =
                    severity === "CRITICAL"
                      ? AlertTriangle
                      : severity === "WARNING"
                        ? AlertTriangle
                        : Info;
                  return (
                    <Card key={severity}>
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                          {list.length === 0 && severity === "CRITICAL" ? (
                            <CheckCircle2 className="size-4 text-success" />
                          ) : (
                            <Icon
                              className={`size-4 ${severity === "CRITICAL" ? "text-destructive" : severity === "WARNING" ? "text-warning" : "text-muted-foreground"}`}
                            />
                          )}
                          {severity} ({list.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="max-h-64 overflow-auto text-sm">
                        {list.length === 0 ? (
                          <p className="text-muted-foreground">Nothing to report.</p>
                        ) : (
                          <ul className="space-y-1">
                            {list.slice(0, 200).map((i) => (
                              <li key={i.id} className="text-muted-foreground">
                                <span className="font-medium text-foreground">{i.code}</span> —{" "}
                                {i.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </TabsContent>

              <TabsContent value="sheets" className="mt-4 space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Sheets</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sheet</TableHead>
                          <TableHead>Structure</TableHead>
                          <TableHead className="text-right">Rows</TableHead>
                          <TableHead className="text-right">Columns</TableHead>
                          <TableHead className="text-right">Header row</TableHead>
                          <TableHead>Lines</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.plan.sheets.map((s) => (
                          <TableRow key={s.name}>
                            <TableCell>{s.name}</TableCell>
                            <TableCell>{s.kind}</TableCell>
                            <TableCell className="text-right">{s.rows}</TableCell>
                            <TableCell className="text-right">{s.columns}</TableCell>
                            <TableCell className="text-right">{s.headerRow ?? "—"}</TableCell>
                            <TableCell>{s.lineLabels.join(", ") || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Sewing lines</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {result.plan.lines.map((l) => (
                      <Badge key={l.id} variant="secondary">
                        {l.label}
                      </Badge>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}
