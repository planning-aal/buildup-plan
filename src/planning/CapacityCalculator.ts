/**
 * The single source of truth for capacity arithmetic. Every other module and
 * every UI component must go through these functions — no formula is allowed
 * to be re-written anywhere else.
 */

/** Available Minutes = Working Hours x 60 x Manpower. Never a hard-coded 480. */
export function availableMinutes(workingHours: number, manpower: number): number {
  if (workingHours <= 0 || manpower <= 0) return 0;
  return workingHours * 60 * manpower;
}

/** Effective Minutes = Available Minutes x Efficiency (efficiency as decimal). */
export function effectiveMinutes(available: number, efficiency: number): number {
  return available * efficiency;
}

/**
 * Capacity = Effective Minutes / SMV.
 * A missing or invalid SMV yields null — never zero, never an invented value.
 */
export function dailyCapacity(
  workingHours: number,
  manpower: number,
  efficiency: number,
  smv: number | null,
): number | null {
  if (smv === null || !Number.isFinite(smv) || smv <= 0) return null;
  const available = availableMinutes(workingHours, manpower);
  return effectiveMinutes(available, efficiency) / smv;
}

/** Earned Minutes = Production Quantity x SMV. */
export function earnedMinutes(quantity: number, smv: number | null): number {
  if (smv === null || !Number.isFinite(smv) || smv <= 0) return 0;
  return quantity * smv;
}

/** Efficiency = Earned Minutes / Available Minutes. */
export function efficiencyFromMinutes(earned: number, available: number): number {
  if (available <= 0) return 0;
  return earned / available;
}

/** Capacity Gap = Capacity - Required Production. Negative means shortage. */
export function capacityGap(capacity: number, required: number): number {
  return capacity - required;
}

export function gapStatus(gap: number): "SURPLUS" | "SHORTAGE" | "BALANCED" {
  if (gap > 0) return "SURPLUS";
  if (gap < 0) return "SHORTAGE";
  return "BALANCED";
}

/* -------------------- display rounding (never internal) ------------------ */

export function roundQty(value: number): number {
  return Math.round(value);
}

export function formatQty(value: number): string {
  return Math.round(value).toLocaleString();
}

export function formatEfficiency(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatMinutes(value: number): string {
  return Math.round(value).toLocaleString();
}
