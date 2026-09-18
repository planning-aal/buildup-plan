import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/shell/app-shell";
import { EmptyState, SectionCard, pct } from "@/components/planning/ui-bits";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePlanning } from "@/lib/app-state/planning-store";
import { rampCurve } from "@/planning/EfficiencyCalculator";
import type { RampMode } from "@/planning/types";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Line Settings & Efficiency — Armana Production Planning" },
      {
        name: "description",
        content:
          "Configure working hours, manpower, starting and maximum efficiency and the ramp-up profile for every Armana sewing line.",
      },
      { property: "og:title", content: "Line Settings & Efficiency — Armana Production Planning" },
      {
        property: "og:description",
        content:
          "Configure working hours, manpower and efficiency ramp-up for every sewing line, line by line or for all active lines.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const RAMP_MODES: { value: RampMode; label: string }[] = [
  { value: "NONE", label: "NO RAMP" },
  { value: "FIXED", label: "FIXED RAMP" },
  { value: "CUSTOM", label: "CUSTOM RAMP" },
];

function SettingsPage() {
  const {
    lineSettings,
    patchLine,
    patchRamp,
    applyToAllLines,
    allowOverproduction,
    setAllowOverproduction,
    result,
    generate,
  } = usePlanning();

  const [bulkHours, setBulkHours] = useState("8");
  const [bulkManpower, setBulkManpower] = useState("73");
  const [bulkStart, setBulkStart] = useState("50");
  const [bulkMax, setBulkMax] = useState("80");
  const [bulkStep, setBulkStep] = useState("5");
  const [bulkMode, setBulkMode] = useState<RampMode>("FIXED");

  if (!lineSettings.length) {
    return (
      <AppShell title="Settings" subtitle="Line settings, efficiency and ramp-up">
        <EmptyState
          title="No sewing plan uploaded"
          message="Upload a sewing plan to begin production planning — line settings are created from the lines found in the plan."
          actionLabel="Upload sewing plan"
          actionTo="/sewing-plan-upload"
        />
      </AppShell>
    );
  }

  const preview = rampCurve(
    {
      mode: bulkMode,
      startEfficiency: Number(bulkStart) / 100,
      maxEfficiency: Number(bulkMax) / 100,
      rampStep: Number(bulkStep) / 100,
      customValues: {},
    },
    10,
  );

  return (
    <AppShell
      title="Settings"
      subtitle="Line settings, efficiency and ramp-up"
      actions={
        result ? (
          <Button size="sm" onClick={() => void generate()}>
            Recalculate plan
          </Button>
        ) : null
      }
    >
      <div className="space-y-4">
        <SectionCard
          title="Efficiency control panel"
          description="Preview a ramp-up before applying it. Ramp steps are counted on working days only."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1">
              <Label>Working hours</Label>
              <Input value={bulkHours} onChange={(e) => setBulkHours(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <Label>Manpower</Label>
              <Input value={bulkManpower} onChange={(e) => setBulkManpower(e.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <Label>Starting efficiency %</Label>
              <Input value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <Label>Maximum efficiency %</Label>
              <Input value={bulkMax} onChange={(e) => setBulkMax(e.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <Label>Ramp step %</Label>
              <Input value={bulkStep} onChange={(e) => setBulkStep(e.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <Label>Ramp mode</Label>
              <Select value={bulkMode} onValueChange={(v) => setBulkMode(v as RampMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RAMP_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {preview.map((v, i) => (
              <span
                key={i}
                className="rounded border border-border px-2 py-1 text-[11px] tabular-nums text-muted-foreground"
              >
                WD {i + 1}: <span className="font-medium text-foreground">{pct(v, 0)}</span>
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm">Apply to all active lines</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apply these settings to all active lines?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Working hours, manpower and the ramp-up profile above will overwrite the current values on every
                    active line. Lines switched off are not changed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      applyToAllLines({
                        workingHours: Number(bulkHours) || 8,
                        manpower: Number(bulkManpower) || 0,
                        ramp: {
                          mode: bulkMode,
                          startEfficiency: Number(bulkStart) / 100,
                          maxEfficiency: Number(bulkMax) / 100,
                          rampStep: Number(bulkStep) / 100,
                        },
                      });
                      toast.success("Settings applied to all active lines.");
                    }}
                  >
                    Apply
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="flex items-center gap-2">
              <Switch
                id="overproduction"
                checked={allowOverproduction}
                onCheckedChange={setAllowOverproduction}
              />
              <Label htmlFor="overproduction" className="text-sm font-normal">
                Allow production beyond the order quantity
              </Label>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Line settings" description="Each line can run its own hours, manpower and ramp-up">
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-24">Line</TableHead>
                  <TableHead className="w-20">Active</TableHead>
                  <TableHead className="w-28">Working hrs</TableHead>
                  <TableHead className="w-28">Manpower</TableHead>
                  <TableHead className="w-28">Start eff %</TableHead>
                  <TableHead className="w-28">Max eff %</TableHead>
                  <TableHead className="w-36">Ramp mode</TableHead>
                  <TableHead className="w-28">Ramp step %</TableHead>
                  <TableHead className="w-24">Copy</TableHead>
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
                        aria-label={`${l.lineName} active`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        inputMode="decimal"
                        value={l.workingHours}
                        onChange={(e) => patchLine(l.lineId, { workingHours: Number(e.target.value) || 0 })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        inputMode="numeric"
                        value={l.manpower}
                        onChange={(e) => patchLine(l.lineId, { manpower: Number(e.target.value) || 0 })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        inputMode="numeric"
                        value={Math.round(l.ramp.startEfficiency * 100)}
                        onChange={(e) => patchRamp(l.lineId, { startEfficiency: Number(e.target.value) / 100 })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        inputMode="numeric"
                        value={Math.round(l.ramp.maxEfficiency * 100)}
                        onChange={(e) => patchRamp(l.lineId, { maxEfficiency: Number(e.target.value) / 100 })}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={l.ramp.mode}
                        onValueChange={(v) => patchRamp(l.lineId, { mode: v as RampMode })}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RAMP_MODES.map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        inputMode="numeric"
                        value={Math.round(l.ramp.rampStep * 100)}
                        onChange={(e) => patchRamp(l.lineId, { rampStep: Number(e.target.value) / 100 })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setBulkHours(String(l.workingHours));
                          setBulkManpower(String(l.manpower));
                          setBulkStart(String(Math.round(l.ramp.startEfficiency * 100)));
                          setBulkMax(String(Math.round(l.ramp.maxEfficiency * 100)));
                          setBulkStep(String(Math.round(l.ramp.rampStep * 100)));
                          setBulkMode(l.ramp.mode);
                          toast.success(`${l.lineName} settings copied to the control panel.`);
                        }}
                      >
                        Copy
                      </Button>
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
