import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, FileSpreadsheet, Gauge, Timer } from "lucide-react";

import { UploadCard } from "@/components/plan/upload-card";
import { Button } from "@/components/ui/button";
import { parseRoughPlan } from "@/lib/plan/parse-rough-plan";
import { defaultSettings, loadSession, saveSession, usePlanSession } from "@/lib/plan/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sewing Plan Builder — Production Buildup Plan generator" },
      {
        name: "description",
        content:
          "Upload your rough sewing plan and generate the standard monthly Production Buildup Plan workbook for all 12 lines.",
      },
      { property: "og:title", content: "Sewing Plan Builder" },
      {
        property: "og:description",
        content:
          "Upload your rough sewing plan and generate the standard monthly Production Buildup Plan workbook for all 12 lines.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const FEATURES = [
  { icon: Timer, title: "Working hours per line", text: "Set 8, 10 or any shift length line by line." },
  { icon: Gauge, title: "Efficiency & ramp-up", text: "Target efficiency plus a buildup curve for new styles." },
  { icon: CalendarDays, title: "Working days", text: "Fridays off by default, tick any other holiday." },
  { icon: FileSpreadsheet, title: "Standard workbook", text: "Same sheets, formulas and charts you use today." },
];

function Index() {
  const navigate = useNavigate();
  const { session, ready, update } = usePlanSession();
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const plan = parseRoughPlan(await file.arrayBuffer(), file.name);
      if (!plan.entries.length) {
        toast.error(plan.warnings[0] ?? "Nothing could be read from that file.");
        return;
      }
      const month = plan.primaryMonth;
      const existing = loadSession();
      const next = {
        plan,
        settings: defaultSettings(month),
        smv: existing?.smv ?? [],
        updatedAt: new Date().toISOString(),
      };
      update(next);
      saveSession(next);
      toast.success(`Read ${plan.entries.length} rows from ${file.name}`);
      void navigate({ to: "/plan" });
    } catch (error) {
      console.error(error);
      toast.error("That file could not be read. Please upload the sewing plan Excel file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded bg-primary text-primary-foreground">
              <FileSpreadsheet className="size-4" />
            </div>
            <span className="font-semibold tracking-tight">Sewing Plan Builder</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/import" })}>
              Import &amp; data review
            </Button>
            {ready && session ? (
              <Button variant="outline" size="sm" onClick={() => navigate({ to: "/plan" })}>
                Open current plan
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          12 sewing lines · monthly buildup
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-bold leading-tight tracking-tight text-foreground">
          Upload the rough sewing plan. Get the finished Production Buildup Plan.
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          The app reads every line and every day, pulls the style, merchant and order quantity,
          applies your hours, manpower, efficiency and holidays, then writes the standard workbook
          with all the usual sheets and formulas.
        </p>

        <div className="mt-8">
          <UploadCard
            busy={busy}
            onFile={handleFile}
            title="Drop your sewing plan file here"
            hint="Excel file with the Line 1-4, Line 5-8 and Line 9-12 sheets"
          />
        </div>

        {ready && session ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Last file: <span className="font-medium text-foreground">{session.plan.fileName}</span> ·{" "}
            {session.plan.entries.length} rows · saved on this device.
          </p>
        ) : null}

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-lg border border-border bg-card p-4">
              <Icon className="size-5 text-primary" />
              <p className="mt-3 font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
