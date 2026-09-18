import { Link } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import {
  AlertTriangle,
  CalendarOff,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  Info,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/* ----------------------------- formatting ------------------------------ */

export const qty = (value: number | null | undefined) =>
  value === null || value === undefined || Number.isNaN(value) ? "—" : Math.round(value).toLocaleString();

export const signedQty = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString()}`;
};

export const pct = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined || Number.isNaN(value)
    ? "—"
    : `${(value * 100).toFixed(digits)}%`;

export const smvText = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : value.toFixed(2);

export const dateText = (value: string | null | undefined) =>
  value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
      })
    : "—";

/* ------------------------------- status -------------------------------- */

export type StatusKey =
  | "ON_PLAN"
  | "SURPLUS"
  | "SHORTAGE"
  | "COMPLETED"
  | "IN_PROGRESS"
  | "NOT_STARTED"
  | "SMV_MISSING"
  | "VALIDATION_ERROR"
  | "HOLIDAY"
  | "WEEKLY_OFF"
  | "LINE_OFF"
  | "PLANNED"
  | "IDLE"
  | "ORDER_COMPLETE"
  | "CAPACITY_SHORTAGE";

const STATUS_META: Record<
  StatusKey,
  { label: string; icon: ComponentType<{ className?: string }>; className: string }
> = {
  ON_PLAN: { label: "ON PLAN", icon: CheckCircle2, className: "border-border text-foreground" },
  SURPLUS: { label: "SURPLUS", icon: TrendingUp, className: "border-success text-success" },
  SHORTAGE: { label: "SHORTAGE", icon: TrendingDown, className: "border-destructive text-destructive" },
  CAPACITY_SHORTAGE: {
    label: "SHORTAGE",
    icon: TrendingDown,
    className: "border-destructive text-destructive",
  },
  COMPLETED: { label: "COMPLETED", icon: CheckCircle2, className: "border-success text-success" },
  ORDER_COMPLETE: { label: "COMPLETED", icon: CheckCircle2, className: "border-success text-success" },
  IN_PROGRESS: { label: "IN PROGRESS", icon: CircleDashed, className: "border-primary text-primary" },
  PLANNED: { label: "PLANNED", icon: CheckCircle2, className: "border-primary text-primary" },
  NOT_STARTED: { label: "NOT STARTED", icon: Minus, className: "border-border text-muted-foreground" },
  IDLE: { label: "IDLE", icon: Minus, className: "border-border text-muted-foreground" },
  SMV_MISSING: { label: "SMV MISSING", icon: AlertTriangle, className: "border-warning text-warning" },
  VALIDATION_ERROR: {
    label: "VALIDATION ERROR",
    icon: CircleSlash,
    className: "border-destructive text-destructive",
  },
  HOLIDAY: { label: "HOLIDAY", icon: CalendarOff, className: "border-border text-muted-foreground" },
  WEEKLY_OFF: { label: "WEEKLY OFF", icon: CalendarOff, className: "border-border text-muted-foreground" },
  LINE_OFF: { label: "LINE OFF", icon: CircleSlash, className: "border-border text-muted-foreground" },
};

/** Status is always badge + text + icon — never colour alone. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = STATUS_META[status as StatusKey] ?? {
    label: status.replace(/_/g, " "),
    icon: Info,
    className: "border-border text-muted-foreground",
  };
  const Icon = meta.icon;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 whitespace-nowrap font-medium", meta.className, className)}
    >
      <Icon className="size-3" />
      {meta.label}
    </Badge>
  );
}

export function gapStatusKey(gap: number | null | undefined): StatusKey {
  if (gap === null || gap === undefined) return "NOT_STARTED";
  if (gap > 0) return "SURPLUS";
  if (gap < 0) return "SHORTAGE";
  return "ON_PLAN";
}

/* -------------------------------- cards -------------------------------- */

export function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums tracking-tight",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions}
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  actionTo,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  actionTo?: "/sewing-plan-upload" | "/smv-master" | "/production-plan" | "/settings";
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-card px-6 py-14 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {actionLabel && actionTo ? (
        <Button asChild size="sm">
          <Link to={actionTo}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}
