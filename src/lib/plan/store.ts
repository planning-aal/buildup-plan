import { useCallback, useEffect, useState } from "react";

import type { RoughPlan } from "./parse-rough-plan";
import {
  DEFAULT_LINE_SETTINGS,
  defaultHolidays,
  type PlanSettings,
  type SmvEntry,
} from "./model";

export type PlanSession = {
  plan: RoughPlan;
  settings: PlanSettings;
  smv: SmvEntry[];
  updatedAt: string;
};

const KEY = "buildup-plan-session-v1";

export function defaultSettings(month: string): PlanSettings {
  return {
    month,
    lines: DEFAULT_LINE_SETTINGS.map((l) => ({ ...l })),
    rampStart: 0.45,
    rampDays: 4,
    fillAverage: 1200,
    fillEmptyDays: true,
    monthlyTarget: 0,
    holidays: defaultHolidays(month),
    roundTo: 50,
  };
}

export function loadSession(): PlanSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PlanSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: PlanSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* quota — keep working in memory */
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

/** Session state hydrated after mount so SSR and the client agree. */
export function usePlanSession() {
  const [session, setSession] = useState<PlanSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(loadSession());
    setReady(true);
  }, []);

  const update = useCallback((next: PlanSession | null) => {
    setSession(next);
    if (next) saveSession(next);
    else clearSession();
  }, []);

  return { session, ready, update };
}
