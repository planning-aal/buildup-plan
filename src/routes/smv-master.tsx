import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { UploadCard } from "@/components/plan/upload-card";
import { AppShell } from "@/components/shell/app-shell";
import { KpiCard, SectionCard, StatusBadge, qty, smvText } from "@/components/planning/ui-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { missingSmvStyles, usePlanning } from "@/lib/app-state/planning-store";
import { downloadText, readSmvUpload, smvRecord, smvToCsv } from "@/lib/app-state/smv-io";

export const Route = createFileRoute("/smv-master")({
  head: () => ({
    meta: [
      { title: "SMV Master — Armana Production Planning" },
      {
        name: "description",
        content:
          "Maintain the style-wise SMV master: upload in bulk, add single values, track effective dates and resolve styles with a missing SMV.",
      },
      { property: "og:title", content: "SMV Master — Armana Production Planning" },
      {
        property: "og:description",
        content:
          "Maintain the style-wise SMV master and resolve styles with a missing SMV before the plan is calculated.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SmvMasterPage,
});

const PAGE_SIZE = 30;

function SmvMasterPage() {
  const planning = usePlanning();
  const { smvMaster, smvSource, setSmvMaster, upsertSmv, removeSmv, result, generate } = planning;
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [newStyle, setNewStyle] = useState("");
  const [newSmv, setNewSmv] = useState("");
  const [newBuyer, setNewBuyer] = useState("");
  const [newDate, setNewDate] = useState("");
  const [fixValues, setFixValues] = useState<Record<string, string>>({});

  const missing = useMemo(() => missingSmvStyles(planning), [planning]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return smvMaster
      .filter((r) => !q || r.styleNo.toLowerCase().includes(q) || (r.buyer ?? "").toLowerCase().includes(q))
      .sort((a, b) => a.styleNo.localeCompare(b.styleNo));
  }, [smvMaster, search]);

  const paged = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const handleUpload = async (file: File) => {
    setBusy(true);
    try {
      const { records, error } = readSmvUpload(await file.arrayBuffer(), file.name);
      if (error || !records.length) {
        toast.error(error ?? "No Style No / SMV columns were found in that file.");
        return;
      }
      const byStyle = new Map(smvMaster.map((r) => [`${r.styleNo.toUpperCase()}|${r.effectiveDate ?? ""}`, r]));
      for (const r of records) byStyle.set(`${r.styleNo.toUpperCase()}|${r.effectiveDate ?? ""}`, r);
      setSmvMaster([...byStyle.values()], file.name);
      toast.success(`${records.length} SMV values loaded from ${file.name}`);
    } catch (error) {
      console.error(error);
      toast.error("That SMV file could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const addManual = () => {
    const value = Number(newSmv);
    if (!newStyle.trim() || !Number.isFinite(value) || value <= 0) {
      toast.error("Enter a style number and an SMV greater than zero.");
      return;
    }
    upsertSmv(smvRecord(newStyle, Number(value.toFixed(2)), "Manual entry", newBuyer || null, newDate || null));
    setNewStyle("");
    setNewSmv("");
    setNewBuyer("");
    toast.success("SMV added to the master.");
  };

  const found = smvMaster.filter((r) => r.status === "SMV_FOUND").length;
  const invalid = smvMaster.filter((r) => r.status === "SMV_INVALID").length;

  return (
    <AppShell
      title="SMV Master"
      subtitle="Style-wise standard minute values used by the capacity engine"
      actions={
        <>
          <Button size="sm" variant="outline" onClick={() => downloadText("smv-master.csv", smvToCsv(smvMaster))}>
            Export
          </Button>
          {result ? (
            <Button size="sm" onClick={() => void generate()}>
              Recalculate plan
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="SMV records" value={qty(smvMaster.length)} />
          <KpiCard label="Valid SMV" value={qty(found)} />
          <KpiCard label="Invalid SMV" value={qty(invalid)} tone={invalid ? "negative" : "default"} />
          <KpiCard
            label="Styles without SMV"
            value={qty(missing.length)}
            tone={missing.length ? "negative" : "positive"}
            hint="From the uploaded sewing plan"
          />
        </div>

        <Tabs defaultValue="master">
          <TabsList>
            <TabsTrigger value="master">Master ({smvMaster.length})</TabsTrigger>
            <TabsTrigger value="missing">Missing SMV ({missing.length})</TabsTrigger>
            <TabsTrigger value="add">Upload / Add</TabsTrigger>
          </TabsList>

          <TabsContent value="master" className="mt-3">
            <SectionCard
              title="SMV master"
              description={smvSource ? `Last upload: ${smvSource}` : "No SMV file uploaded yet"}
              actions={
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Search style or buyer"
                  className="h-8 w-56"
                />
              }
            >
              {smvMaster.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No SMV master. Upload your SMV master to calculate capacity.
                </p>
              ) : (
                <>
                  <div className="max-h-[560px] overflow-auto rounded-md border border-border">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-muted">
                        <TableRow>
                          <TableHead>Style</TableHead>
                          <TableHead>Buyer</TableHead>
                          <TableHead className="text-right">SMV</TableHead>
                          <TableHead>Effective date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Last updated</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paged.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.styleNo}</TableCell>
                            <TableCell>{r.buyer ?? "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{smvText(r.smv)}</TableCell>
                            <TableCell>{r.effectiveDate ?? "—"}</TableCell>
                            <TableCell>
                              {r.status === "SMV_FOUND" ? (
                                <Badge variant="outline" className="border-success text-success">
                                  SMV FOUND
                                </Badge>
                              ) : (
                                <StatusBadge status={r.status} />
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.source}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.updatedAt.slice(0, 10)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="ghost" onClick={() => removeSmv(r.id)}>
                                Remove
                              </Button>
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
                </>
              )}
            </SectionCard>
          </TabsContent>

          <TabsContent value="missing" className="mt-3">
            <SectionCard
              title="SMV not found"
              description="These styles appear in the sewing plan but have no SMV. Capacity is never calculated with a guessed or zero SMV."
            >
              {missing.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Every style in the sewing plan has an SMV.
                </p>
              ) : (
                <div className="max-h-[560px] overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-muted">
                      <TableRow>
                        <TableHead>Style</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-40">Enter SMV</TableHead>
                        <TableHead className="w-40" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {missing.map((style) => (
                        <TableRow key={style}>
                          <TableCell className="font-medium">{style}</TableCell>
                          <TableCell>
                            <StatusBadge status="SMV_MISSING" />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8"
                              inputMode="decimal"
                              placeholder="e.g. 21.32"
                              value={fixValues[style] ?? ""}
                              onChange={(e) => setFixValues((p) => ({ ...p, [style]: e.target.value }))}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={() => {
                                const v = Number(fixValues[style]);
                                if (!Number.isFinite(v) || v <= 0) {
                                  toast.error("Enter an SMV greater than zero.");
                                  return;
                                }
                                upsertSmv(smvRecord(style, Number(v.toFixed(2)), "Manual entry"));
                                setFixValues((p) => ({ ...p, [style]: "" }));
                                toast.success(`SMV added for ${style}`);
                              }}
                            >
                              Add to master
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </SectionCard>
          </TabsContent>

          <TabsContent value="add" className="mt-3">
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Bulk upload" description="Excel or CSV with a Style No column and an SMV column">
                <UploadCard
                  title="Upload SMV master"
                  hint="Matching SMV to styles… existing values for the same style and effective date are replaced."
                  busy={busy}
                  onFile={handleUpload}
                />
              </SectionCard>
              <SectionCard title="Add a single SMV" description="Manual entry is recorded with its own source">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="smv-style">Style number</Label>
                    <Input id="smv-style" value={newStyle} onChange={(e) => setNewStyle(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="smv-value">SMV</Label>
                    <Input id="smv-value" inputMode="decimal" value={newSmv} onChange={(e) => setNewSmv(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="smv-buyer">Buyer</Label>
                    <Input id="smv-buyer" value={newBuyer} onChange={(e) => setNewBuyer(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="smv-date">Effective date</Label>
                    <Input id="smv-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                  </div>
                </div>
                <Button className="mt-3" size="sm" onClick={addManual}>
                  Add SMV
                </Button>
              </SectionCard>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
