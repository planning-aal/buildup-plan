import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  Archive,
  CalendarDays,
  FileSpreadsheet,
  FileText,
  GaugeCircle,
  LayoutDashboard,
  ListChecks,
  Settings,
  SlidersHorizontal,
  Table2,
  Upload,
} from "lucide-react";

import { ArmanaLogo } from "@/components/brand/armana-logo";
import { Badge } from "@/components/ui/badge";
import { periodLabel, usePlanning } from "@/lib/app-state/planning-store";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/production-plan", label: "Production Plan", icon: ListChecks },
  { to: "/sewing-plan-upload", label: "Sewing Plan Upload", icon: Upload },
  { to: "/smv-master", label: "SMV Master", icon: Table2 },
  { to: "/line-capacity", label: "Line Capacity", icon: GaugeCircle },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/scenarios", label: "Scenarios", icon: SlidersHorizontal },
  { to: "/buildup", label: "Production Buildup", icon: FileSpreadsheet },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/history", label: "Plan History", icon: Archive },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { period, result, stale } = usePlanning();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-4">
          <ArmanaLogo size={30} />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">ARMANA GROUP</p>
            <p className="text-[11px] uppercase tracking-widest opacity-70">Planning</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV.map((item) => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_0_var(--sidebar-primary)]"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border px-4 py-3 text-[11px] opacity-70">
          Armana Apparels Ltd
          <br />
          Production Planning &amp; Control
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="flex items-center gap-3">
              <ArmanaLogo size={26} className="lg:hidden" />
              <div>
                <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                  Production Planning · Armana Apparels Ltd
                </p>
                <h1 className="text-base font-semibold tracking-tight">{title}</h1>
                {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-medium">
                Period: {periodLabel(period)}
              </Badge>
              {result && stale ? (
                <Badge variant="outline" className="border-warning text-warning">
                  Settings changed — recalculate
                </Badge>
              ) : null}
              {actions}
              <div className="flex items-center gap-2 border-l border-border pl-2">
                <div className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                  PL
                </div>
                <div className="hidden text-left leading-tight sm:block">
                  <p className="text-xs font-medium">Planner</p>
                  <p className="text-[11px] text-muted-foreground">PPC Department</p>
                </div>
              </div>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-border px-3 py-1.5 lg:hidden">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium",
                  pathname === item.to
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="min-w-0 flex-1 p-5">{children}</main>
      </div>
    </div>
  );
}
