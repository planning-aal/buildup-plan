import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { EmptyState, SectionCard, dateText, pct, qty, signedQty } from "@/components/planning/ui-bits";
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
import { usePlanning } from "@/lib/app-state/planning-store";
import { compareScenarios } from "@/planning/PlanningEngine";
import { BASE_SCENARIO, type Scenario, type ScenarioComparisonRow } from "@/planning/types";

export const Route = createFileRoute("/scenarios")({
  head: () => ({
    meta: [
      { title: "Scenarios — Armana Production Planning" },
      {
        name: "description",
        content:
          "Compare the base plan with what-if scenarios: different working hours, efficiency and ramp-up, side by side.",
      },
      { property: "og:title", content: "Scenarios — Armana Production Planning" },
      {
        property: "og:description",
        content: "Compare the base plan with what-if scenarios for hours, efficiency and ramp-up.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScenariosPage,
});

type Draft = { name: string; hours: string; maxEff: string; startEff: string; step: string };

const emptyDraft = (name: string): Draft => ({ name, hours: "", maxEff: "", startEff: "", step: "" });

function toScenario(id: string, draft: Draft): Scenario {
  const overrides: Scenario["overrides"] = {};
  if (draft.hours) overrides.workingHours = Number(draft.hours);
  if (draft.maxEff) overrides.maxEfficiency = Number(draft.maxEff) / 100;
  if (draft.startEff) overrides.startEfficiency = Number(draft.startEff) / 100;
  if (draft.step) overrides.rampStep = Number(draft.step) / 100;
  return { id, name: draft.name, overrides };
}

function ScenariosPage() {
  const { engineInput, result } = usePlanning();
  const [a, setA] = useState<Draft>({ ...emptyDraft("Scenario A"), maxEff: "75" });
  const [b, setB] = useState<Draft>({ ...emptyDraft("Scenario B"), hours: "9" });
  const [rows, setRows] = useState<ScenarioComparisonRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const scenarios = useMemo(
    () => [BASE_SCENARIO, toScenario("scenario-a", a), toScenario("scenario-b", b)],
    [a, b],
  );

  const run = async () => {
    if (!engineInput) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    try {
      setRows(compareScenarios(engineInput, scenarios).rows);
    } finally {
      setBusy(false);
    }
  };

  if (!engineInput) {
    return (
      <AppShell title="Scenarios" subtitle="What-if comparison against the base plan">
        <EmptyState
          title="No sewing plan uploaded"
          message="Upload a sewing plan to begin production planning, then compare scenarios."
          actionLabel="Upload sewing plan"
          actionTo="/sewing-plan-upload"
        />
      </AppShell>
    );
  }

  const field = (
    draft: Draft,
    set: (d: Draft) => void,
    key: keyof Draft,
    label: string,
    placeholder: string,
  ) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        value={draft[key]}
        placeholder={placeholder}
        onChange={(e) => set({ ...draft, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <AppShell
      title="Scenarios"
      subtitle="The base plan is never modified — each scenario is calculated separately"
      actions={
        <Button size="sm" disabled={busy} onClick={() => void run()}>
          {busy ? "Calculating capacity…" : "Run comparison"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard title="Base plan" description="Current settings, unchanged">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total capacity</dt>
                <dd className="tabular-nums">{result ? qty(result.factory.totalCapacity) : "Not generated"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Planned</dt>
                <dd className="tabular-nums">{result ? qty(result.factory.totalPlannedQty) : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Average efficiency</dt>
                <dd className="tabular-nums">{result ? pct(result.factory.averageEfficiency) : "—"}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Scenario A" description="Leave a field empty to keep the base value">
            <div className="grid gap-3 sm:grid-cols-2">
              {field(a, setA, "name", "Name", "Scenario A")}
              {field(a, setA, "hours", "Working hours", "e.g. 10")}
              {field(a, setA, "startEff", "Starting efficiency %", "e.g. 55")}
              {field(a, setA, "maxEff", "Maximum efficiency %", "e.g. 75")}
              {field(a, setA, "step", "Ramp step %", "e.g. 5")}
            </div>
          </SectionCard>

          <SectionCard title="Scenario B" description="Leave a field empty to keep the base value">
            <div className="grid gap-3 sm:grid-cols-2">
              {field(b, setB, "name", "Name", "Scenario B")}
              {field(b, setB, "hours", "Working hours", "e.g. 9")}
              {field(b, setB, "startEff", "Starting efficiency %", "e.g. 50")}
              {field(b, setB, "maxEff", "Maximum efficiency %", "e.g. 80")}
              {field(b, setB, "step", "Ramp step %", "e.g. 5")}
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Comparison" description="Calculated differences only — no scenario is recommended">
          {!rows ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Run the comparison to calculate each scenario.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Scenario</TableHead>
                    <TableHead className="text-right">Capacity</TableHead>
                    <TableHead className="text-right">Planned</TableHead>
                    <TableHead className="text-right">Capacity gap</TableHead>
                    <TableHead className="text-right">Average efficiency</TableHead>
                    <TableHead className="text-right">Orders completed</TableHead>
                    <TableHead className="text-right">Orders with shortage</TableHead>
                    <TableHead>Last planned date</TableHead>
                    <TableHead className="text-right">vs base (planned)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.scenarioId}>
                      <TableCell className="font-medium">{r.scenarioName}</TableCell>
                      <TableCell className="text-right tabular-nums">{qty(r.totalCapacity)}</TableCell>
                      <TableCell className="text-right tabular-nums">{qty(r.totalPlanned)}</TableCell>
                      <TableCell className="text-right tabular-nums">{signedQty(r.capacityGap)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(r.averageEfficiency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.ordersCompleted}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.ordersWithShortage}</TableCell>
                      <TableCell>{dateText(r.lastPlannedDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.scenarioId === "base" ? "—" : signedQty(r.totalPlanned - (rows[0]?.totalPlanned ?? 0))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
