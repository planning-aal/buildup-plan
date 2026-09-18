import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { UploadCard } from "@/components/plan/upload-card";
import { AppShell } from "@/components/shell/app-shell";
import { KpiCard, SectionCard, StatusBadge, dateText, qty } from "@/components/planning/ui-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { usePlanning } from "@/lib/app-state/planning-store";
import { parseSewingPlanWorkbook } from "@/lib/import/parse-workbook";
import type { SewingPlanEntry } from "@/lib/import/types";

export const Route = createFileRoute("/sewing-plan-upload")({
  head: () => ({
    meta: [
      { title: "Sewing Plan Upload — Armana Production Planning" },
      {
        name: "description",
        content:
          "Upload the monthly sewing plan workbook and review every parsed planning entry: style, PO, order quantity, target and delivery date.",
      },
      { property: "og:title", content: "Sewing Plan Upload — Armana Production Planning" },
      {
        property: "og:description",
        content:
          "Upload the monthly sewing plan workbook and review every parsed planning entry before generating the production plan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SewingPlanUploadPage,
});

const PAGE_SIZE = 40;
const TYPES = ["ALL", "STYLE", "PO", "BALANCE", "LINE_SUPPORT", "TOTAL_QTY", "INSTRUCTION", "OTHER", "UNKNOWN"];

function entryStatus(entry: SewingPlanEntry): string {
  if (entry.parseStatus === "UNPARSED") return "VALIDATION_ERROR";
  if (entry.parseStatus === "PARTIAL" || entry.entryType === "UNKNOWN") return "REVIEW REQUIRED";
  return "OK";
}

function SewingPlanUploadPage() {
  const { imported, planFileName, planFileSize, setImported } = usePlanning();
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("ALL");
  const [line, setLine] = useState("ALL");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [page, setPage] = useState(0);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const result = parseSewingPlanWorkbook(await file.arrayBuffer(), file.name);
      if (!result.entries.length) {
        toast.error("No planning rows could be read from that workbook.");
        return;
      }
      setImported(result, { name: file.name, size: file.size });
      toast.success(`${result.entries.length.toLocaleString()} planning records read from ${file.name}`);
    } catch (error) {
      console.error(error);
      toast.error("That workbook could not be read. Please upload the sewing plan Excel file.");
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(() => {
    if (!imported) return [];
    const q = search.trim().toLowerCase();
    return imported.entries.filter((e) => {
      if (type !== "ALL" && e.entryType !== type) return false;
      if (line !== "ALL" && e.lineLabel !== line) return false;
      if (onlyIssues && entryStatus(e) === "OK") return false;
      if (!q) return true;
      return (
        e.rawText.toLowerCase().includes(q) ||
        (e.styleNo ?? "").toLowerCase().includes(q) ||
        (e.poNo ?? "").toLowerCase().includes(q) ||
        e.date.includes(q)
      );
    });
  }, [imported, search, type, line, onlyIssues]);

  const paged = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  return (
    <AppShell title="Sewing Plan Upload" subtitle="Import, normalise and review the monthly sewing plan">
      <div className="space-y-4">
        <SectionCard title="Sewing plan workbook" description="Excel (.xlsx) exported from the planning department">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
            <UploadCard
              title="Upload sewing plan"
              hint="Reading Excel… parsing sewing plan… the original cell text is always preserved."
              busy={busy}
              onFile={handleFile}
            />
            <div className="space-y-2 text-sm">
              {planFileName ? (
                <div className="rounded-md border border-border p-3">
                  <p className="font-medium">{planFileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {planFileSize ? `${(planFileSize / 1024).toFixed(0)} KB` : ""} · Status: loaded
                  </p>
                  {imported ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {imported.summary.sheetsDetected} sheets · {imported.summary.linesDetected} lines ·{" "}
                      {imported.summary.planningRecords.toLocaleString()} records ·{" "}
                      {dateText(imported.summary.dateFrom)} – {dateText(imported.summary.dateTo)}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  No sewing plan uploaded. Upload a sewing plan to begin production planning.
                </p>
              )}
            </div>
          </div>
        </SectionCard>

        {imported ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Total rows" value={qty(imported.summary.planningRecords)} />
              <KpiCard label="Successfully parsed" value={qty(imported.summary.successfullyParsed)} />
              <KpiCard label="Styles detected" value={qty(imported.summary.stylesDetected)} />
              <KpiCard label="POs detected" value={qty(imported.summary.posDetected)} />
              <KpiCard label="Targets detected" value={qty(imported.summary.targetsDetected)} />
              <KpiCard
                label="Critical errors"
                value={qty(imported.summary.criticalErrors)}
                tone={imported.summary.criticalErrors ? "negative" : "default"}
              />
              <KpiCard label="Warnings" value={qty(imported.summary.warnings)} />
              <KpiCard label="Information" value={qty(imported.summary.infos)} />
            </div>

            <SectionCard
              title="Parsed planning entries"
              description={`${rows.length.toLocaleString()} of ${imported.entries.length.toLocaleString()} rows shown`}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                    placeholder="Search style, PO, raw text…"
                    className="h-8 w-56"
                  />
                  <Select
                    value={type}
                    onValueChange={(v) => {
                      setType(v);
                      setPage(0);
                    }}
                  >
                    <SelectTrigger className="h-8 w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t === "ALL" ? "All entry types" : t.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={line}
                    onValueChange={(v) => {
                      setLine(v);
                      setPage(0);
                    }}
                  >
                    <SelectTrigger className="h-8 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All lines</SelectItem>
                      {imported.plan.lines.map((l) => (
                        <SelectItem key={l.id} value={l.label}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant={onlyIssues ? "default" : "outline"}
                    onClick={() => {
                      setOnlyIssues((v) => !v);
                      setPage(0);
                    }}
                  >
                    Review required only
                  </Button>
                </div>
              }
            >
              <div className="max-h-[640px] overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted">
                    <TableRow>
                      <TableHead className="w-24">Date</TableHead>
                      <TableHead className="w-20">Line</TableHead>
                      <TableHead className="min-w-[280px]">Raw entry</TableHead>
                      <TableHead className="w-28">Entry type</TableHead>
                      <TableHead className="w-32">Style</TableHead>
                      <TableHead className="w-28">PO</TableHead>
                      <TableHead className="w-24 text-right">Order qty</TableHead>
                      <TableHead className="w-20 text-right">Target</TableHead>
                      <TableHead className="w-24">Delivery</TableHead>
                      <TableHead className="w-36">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((e) => {
                      const status = entryStatus(e);
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="tabular-nums">{dateText(e.date)}</TableCell>
                          <TableCell>{e.lineLabel}</TableCell>
                          <TableCell className="max-w-[420px]">
                            <p className="truncate font-mono text-xs" title={e.rawText}>
                              RAW: {e.rawText || "—"}
                            </p>
                            {status !== "OK" ? (
                              <p className="text-[11px] text-muted-foreground">
                                Parsed: {e.styleNo ? `Style=${e.styleNo} ` : ""}
                                {e.poNo ? `PO=${e.poNo} ` : ""}
                                {e.orderQty ? `Qty=${e.orderQty.toLocaleString()} ` : ""}
                                {e.deliveryDateRaw ? `Delivery=${e.deliveryDateRaw}` : ""}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{e.entryType.replace(/_/g, " ")}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{e.styleNo ?? "—"}</TableCell>
                          <TableCell>{e.poNo ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{qty(e.orderQty)}</TableCell>
                          <TableCell className="text-right tabular-nums">{qty(e.targetQty)}</TableCell>
                          <TableCell>{e.deliveryDateRaw ?? "—"}</TableCell>
                          <TableCell>
                            {status === "OK" ? (
                              <Badge variant="outline" className="border-success text-success">
                                OK
                              </Badge>
                            ) : status === "VALIDATION_ERROR" ? (
                              <StatusBadge status="VALIDATION_ERROR" />
                            ) : (
                              <Badge variant="outline" className="border-warning text-warning">
                                REVIEW REQUIRED
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
        ) : null}
      </div>
    </AppShell>
  );
}
