import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/shell/app-shell";
import {
  EmptyState,
  SectionCard,
  StatusBadge,
  dateText,
  gapStatusKey,
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

export const Route = createFileRoute("/line-capacity/")({
  head: () => ({
    meta: [
      { title: "Line Capacity — Armana Production Planning" },
      {
        name: "description",
        content:
          "Line-by-line capacity matrix: current style, SMV, hours, manpower, efficiency, planned quantity, remaining quantity and completion date.",
      },
      { property: "og:title", content: "Line Capacity — Armana Production Planning" },
      {
        property: "og:description",
        content:
          "Compare every sewing line by capacity, gap, efficiency, remaining quantity and completion date.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LineCapacityPage,
});

type SortKey = "line" | "capacity" | "gap" | "efficiency" | "remaining" | "completion";

function LineCapacityPage() {
  const { imported, result, lineSettings } = usePlanning();
  const [sort, setSort] = useState<SortKey>("line");
  const [desc, setDesc] = useState(false);

  const rows = useMemo(() => {
    if (!result) return [];
    return result.lineSummaries.map((summary) => {
      const settings = lineSettings.find((l) => l.lineId === summary.lineId);
      const orders = result.orders.filter((o) => o.lineId === summary.lineId);
      const active = orders.find((o) => o.status === "IN_PROGRESS") ?? orders[orders.length - 1] ?? null;
      const remaining = orders.reduce((sum, o) => sum + (o.remainingQty ?? 0), 0);
      const completion = orders
        .map((o) => o.projectedCompletionDate ?? o.plannedEndDate)
        .filter(Boolean)
        .sort()
        .pop() as string | undefined;
      return {
        summary,
        settings,
        style: active?.styleNo ?? null,
        po: active?.poNo ?? null,
        smv: active?.smv ?? null,
        orderQty: orders.reduce((sum, o) => sum + (o.orderQty ?? 0), 0),
        remaining,
        completion: completion ?? null,
        status: orders.some((o) => o.status === "SMV_MISSING")
          ? "SMV_MISSING"
          : orders.some((o) => o.status === "CAPACITY_SHORTAGE")
            ? "CAPACITY_SHORTAGE"
            : gapStatusKey(summary.capacityGap),
      };
    });
  }, [result, lineSettings]);

  const sorted = useMemo(() => {
    const value = (r: (typeof rows)[number]) => {
      switch (sort) {
        case "capacity":
          return r.summary.totalCapacity;
        case "gap":
          return r.summary.capacityGap;
        case "efficiency":
          return r.summary.efficiency;
        case "remaining":
          return r.remaining;
        case "completion":
          return r.completion ?? "";
        default:
          return r.summary.lineName;
      }
    };
    return [...rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return desc ? -cmp : cmp;
    });
  }, [rows, sort, desc]);

  const head = (key: SortKey, label: string, align: "left" | "right" = "left") => (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        className="font-medium hover:underline"
        onClick={() => {
          if (sort === key) setDesc((d) => !d);
          else {
            setSort(key);
            setDesc(false);
          }
        }}
      >
        {label}
        {sort === key ? (desc ? " ↓" : " ↑") : ""}
      </button>
    </TableHead>
  );

  if (!imported) {
    return (
      <AppShell title="Line Capacity" subtitle="Capacity, style and completion by sewing line">
        <EmptyState
          title="No sewing plan uploaded"
          message="Upload a sewing plan to begin production planning."
          actionLabel="Upload sewing plan"
          actionTo="/sewing-plan-upload"
        />
      </AppShell>
    );
  }

  if (!result) {
    return (
      <AppShell title="Line Capacity" subtitle="Capacity, style and completion by sewing line">
        <EmptyState
          title="No production plan"
          message="Complete validation and generate the plan to see line capacity."
          actionLabel="Go to production plan"
          actionTo="/production-plan"
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="Line Capacity" subtitle="Capacity, style and completion by sewing line">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.slice(0, 6).map((r) => (
            <div key={r.summary.lineId} className="rounded-md border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{r.summary.lineName}</p>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Style {r.style ?? "—"} · SMV {smvText(r.smv)} · {r.settings?.workingHours ?? 0} hrs · MP{" "}
                {r.settings?.manpower ?? 0} · Eff {pct(r.summary.efficiency, 0)}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">Capacity</p>
                  <p className="font-semibold tabular-nums">{qty(r.summary.totalCapacity)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Planned</p>
                  <p className="font-semibold tabular-nums">{qty(r.summary.totalPlanned)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Remaining</p>
                  <p className="font-semibold tabular-nums">{qty(r.remaining)}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="mt-3 w-full" asChild>
                <Link to="/line-capacity/$lineId" params={{ lineId: r.summary.lineId }}>
                  Open line detail
                </Link>
              </Button>
            </div>
          ))}
        </div>

        <SectionCard title="Line matrix" description="Sort by capacity, gap, efficiency, remaining or completion">
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  {head("line", "Line")}
                  <TableHead>Current style</TableHead>
                  <TableHead className="text-right">SMV</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Manpower</TableHead>
                  {head("efficiency", "Efficiency", "right")}
                  {head("capacity", "Capacity", "right")}
                  <TableHead className="text-right">Planned</TableHead>
                  {head("remaining", "Remaining", "right")}
                  {head("gap", "Gap", "right")}
                  {head("completion", "Completion")}
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => (
                  <TableRow key={r.summary.lineId}>
                    <TableCell className="font-medium">
                      <Link
                        to="/line-capacity/$lineId"
                        params={{ lineId: r.summary.lineId }}
                        className="hover:underline"
                      >
                        {r.summary.lineName}
                      </Link>
                    </TableCell>
                    <TableCell>{r.style ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{smvText(r.smv)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.settings?.workingHours ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.settings?.manpower ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.summary.efficiency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{qty(r.summary.totalCapacity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{qty(r.summary.totalPlanned)}</TableCell>
                    <TableCell className="text-right tabular-nums">{qty(r.remaining)}</TableCell>
                    <TableCell className="text-right tabular-nums">{signedQty(r.summary.capacityGap)}</TableCell>
                    <TableCell>{dateText(r.completion)}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
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
