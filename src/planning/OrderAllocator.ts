/**
 * Allocates daily capacity against an order quantity.
 *
 * Overproduction is OFF by default: the planned quantity can never exceed the
 * remaining order quantity, and the final day is capped at the remainder.
 */
export type AllocationInput = {
  capacity: number;
  remaining: number | null;
  allowOverproduction: boolean;
};

export function allocateDay({
  capacity,
  remaining,
  allowOverproduction,
}: AllocationInput): number {
  if (capacity <= 0) return 0;
  if (remaining === null) return capacity;
  if (allowOverproduction) return capacity;
  if (remaining <= 0) return 0;
  return Math.min(capacity, remaining);
}

/** Days still needed at the last known daily rate, once the period runs out. */
export function projectCompletion(
  shortage: number,
  lastDailyRate: number,
  nextDates: string[],
): { date: string | null; daysNeeded: number } {
  if (shortage <= 0) return { date: null, daysNeeded: 0 };
  if (lastDailyRate <= 0) return { date: null, daysNeeded: Infinity };
  const daysNeeded = Math.ceil(shortage / lastDailyRate);
  return { date: nextDates[daysNeeded - 1] ?? null, daysNeeded };
}
