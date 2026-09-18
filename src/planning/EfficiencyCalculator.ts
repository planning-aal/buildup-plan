import type { RampProfile } from "./types";

export const DEFAULT_RAMP: RampProfile = {
  mode: "FIXED",
  startEfficiency: 0.5,
  maxEfficiency: 0.8,
  rampStep: 0.05,
  customValues: {},
};

/**
 * Efficiency for a given ramp day.
 *
 * `rampDay` counts WORKING days only and is 1-based: a holiday never consumes
 * a ramp step because it is never given an index.
 */
export function efficiencyForRampDay(ramp: RampProfile, rampDay: number): number {
  const max = clamp(ramp.maxEfficiency);
  if (rampDay < 1) return 0;

  if (ramp.mode === "NONE") return max;

  if (ramp.mode === "CUSTOM") {
    const keys = Object.keys(ramp.customValues)
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (keys.length === 0) return max;
    const exact = ramp.customValues[rampDay];
    if (exact !== undefined) return Math.min(clamp(exact), max);
    const last = keys[keys.length - 1]!;
    if (rampDay > last) return Math.min(clamp(ramp.customValues[last]!), max);
    const first = keys[0]!;
    return Math.min(clamp(ramp.customValues[first]!), max);
  }

  // FIXED: start + step per working day, capped at max
  const value = clamp(ramp.startEfficiency) + clamp(ramp.rampStep) * (rampDay - 1);
  return Math.min(value, max);
}

/** The full curve for a run, one value per working day. */
export function rampCurve(ramp: RampProfile, workingDays: number): number[] {
  return Array.from({ length: Math.max(0, workingDays) }, (_, i) =>
    efficiencyForRampDay(ramp, i + 1),
  );
}

/** Accepts 0.75 or 75 and normalises to a decimal. */
export function toDecimal(value: number): number {
  return value > 1 ? value / 100 : value;
}

function clamp(value: number): number {
  const v = toDecimal(value);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}
