import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/shell/app-shell";
import { EmptyState, SectionCard, StatusBadge, dateText, qty } from "@/components/planning/ui-bits";
import { Badge } from "@/components/ui/badge";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePlanning } from "@/lib/app-state/planning-store";
import type { WorkingStatus } from "@/lib/import/types";
import { isProductive } from "@/planning/CalendarCalculator";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Working Calendar — Armana Production Planning" },
      {
        name: "description",
        content:
          "Set working days, weekly offs, holidays and special working days for the planning month, for all lines or selected lines.",
      },
      { property: "og:title", content: "Working Calendar — Armana Production Planning" },
      {
        property: "og:description",
        content:
          "Set working days, weekly offs, holidays and special working days, then recalculate the production plan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});

const STATUSES: WorkingStatus[] = ["WORKING", "HOLIDAY", "WEEKLY_OFF", "SPECIAL_WORKING_DAY"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function CalendarPage() {
  const { calendar, lineSettings, setDayStatus, result, generate } = usePlanning();
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [scope, setScope] = useState<"ALL" | string>("ALL");

  const selected = calendar.find((d) => d.date === openDate) ?? null;

  const dayCapacity = useMemo(() => {
    const map = new Map<string, number>();
    if (result) {
      for (const d of result.days) map.set(d.date, (map.get(d.date) ?? 0) + d.dailyCapacity);
    }
    return map;
  }, [result]);

  const leading = useMemo(() => {
    if (!calendar.length) return 0;
    const first = new Date(`${calendar[0]!.date}T00:00:00Z`).getUTCDay();
    return (first + 6) % 7;
  }, [calendar]);

  const holidays = calendar.filter((d) => !isProductive(d.workingStatus));

  if (!calendar.length) {
    return (
      <AppShell title="Working Calendar" subtitle="Working days, holidays and special working days">
        <EmptyState
          title="No planning period"
          message="Upload a sewing plan to begin production planning — the calendar is created from the planning period."
          actionLabel="Upload sewing plan"
          actionTo="/sewing-plan-upload"
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Working Calendar"
      subtitle="Click any date to change its working status, hours or holiday reason"
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
          title="Planning month"
          description={`${calendar.filter((d) => isProductive(d.workingStatus)).length} working days · ${holidays.length} non-working days`}
        >
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: leading }, (_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {calendar.map((d) => {
              const productive = isProductive(d.workingStatus);
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setOpenDate(d.date)}
                  className={cn(
                    "min-h-[88px] rounded border p-2 text-left transition-colors hover:border-primary",
                    productive ? "border-border bg-card" : "border-dashed border-border bg-muted/40",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold tabular-nums">{d.date.slice(8)}</span>
                    <span className="text-[10px] text-muted-foreground">{d.day.slice(0, 3)}</span>
                  </div>
                  <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {d.workingStatus.replace(/_/g, " ")}
                  </p>
                  {productive ? (
                    <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                      {d.workingHours} hrs
                      {dayCapacity.has(d.date) ? ` · ${qty(dayCapacity.get(d.date))} pcs` : ""}
                    </p>
                  ) : (
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">{d.holidayReason ?? "No capacity"}</p>
                  )}
                </button>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Holiday list" description="Non-working days in this planning period">
          {holidays.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Every date in the period is a working day.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Affected lines</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.map((d) => (
                    <TableRow key={d.date}>
                      <TableCell className="tabular-nums">{dateText(d.date)}</TableCell>
                      <TableCell>{d.day}</TableCell>
                      <TableCell>
                        <StatusBadge status={d.workingStatus} />
                      </TableCell>
                      <TableCell>{d.holidayReason ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">All lines</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setOpenDate(d.date)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setDayStatus(d.date, {
                              workingStatus: "WORKING",
                              holidayReason: null,
                              holidayType: null,
                            });
                            toast.success(`${dateText(d.date)} restored as a working day.`);
                          }}
                        >
                          Restore working day
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      </div>

      <Sheet open={Boolean(openDate)} onOpenChange={(open) => !open && setOpenDate(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{selected ? `${dateText(selected.date)} · ${selected.day}` : ""}</SheetTitle>
          </SheetHeader>
          {selected ? (
            <div className="space-y-4 px-4 pb-6">
              <div className="space-y-1">
                <Label>Working status</Label>
                <Select
                  value={selected.workingStatus}
                  onValueChange={(v) =>
                    setDayStatus(
                      selected.date,
                      { workingStatus: v as WorkingStatus },
                      scope === "ALL" ? undefined : [scope],
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="reason">Holiday reason</Label>
                <Input
                  id="reason"
                  value={selected.holidayReason ?? ""}
                  onChange={(e) => setDayStatus(selected.date, { holidayReason: e.target.value || null })}
                  placeholder="e.g. Weekly off, Eid holiday"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="hours">Working hours</Label>
                <Input
                  id="hours"
                  inputMode="decimal"
                  value={selected.workingHours}
                  onChange={(e) =>
                    setDayStatus(
                      selected.date,
                      { workingHours: Number(e.target.value) || 0 },
                      scope === "ALL" ? undefined : [scope],
                    )
                  }
                />
              </div>

              <div className="space-y-1">
                <Label>Apply to</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All lines</SelectItem>
                    {lineSettings.map((l) => (
                      <SelectItem key={l.lineId} value={l.lineId}>
                        {l.lineName} only
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setOpenDate(null);
                    if (result) {
                      void generate();
                      toast.success("Calendar saved — production plan recalculated.");
                    } else {
                      toast.success("Calendar saved.");
                    }
                  }}
                >
                  Save &amp; recalculate
                </Button>
                <Button size="sm" variant="outline" onClick={() => setOpenDate(null)}>
                  Close
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}
