/**
 * Budget usage (docs/PRD.md §6.7), in exact integer arithmetic:
 *   remaining = limit − spent            (negative = over budget)
 *   usage %   = ⌊spent × 100 ÷ limit⌋    (may exceed 100; 100 only when fully used)
 * A limit ≤ 0 cannot happen (validation + CHECK constraint) but is handled
 * safely: usage is null and the status is "invalid", never a division error.
 */

export type BudgetStatus = "on_track" | "warning" | "reached" | "over" | "invalid";

export interface BudgetUsage {
  remainingMinor: bigint;
  /** Whole percent, floored; null when the limit is not positive. */
  usagePercent: number | null;
  status: BudgetStatus;
}

/** True when spent has reached `percent` % of the limit (exact, no rounding). */
export function hasReached(spentMinor: bigint, limitMinor: bigint, percent: number): boolean {
  return limitMinor > 0n && spentMinor * 100n >= limitMinor * BigInt(percent);
}

export function budgetUsage(
  limitMinor: bigint,
  spentMinor: bigint,
  alertThresholdPercent: number,
): BudgetUsage {
  const remainingMinor = limitMinor - spentMinor;
  if (limitMinor <= 0n) return { remainingMinor, usagePercent: null, status: "invalid" };
  const usagePercent = Number((spentMinor * 100n) / limitMinor);
  const status: BudgetStatus =
    spentMinor > limitMinor
      ? "over"
      : spentMinor === limitMinor
        ? "reached"
        : hasReached(spentMinor, limitMinor, alertThresholdPercent)
          ? "warning"
          : "on_track";
  return { remainingMinor, usagePercent, status };
}

/** The thresholds a budget warns at: its own setting and 100 %. */
export function alertThresholds(alertThresholdPercent: number): number[] {
  return [...new Set([alertThresholdPercent, 100])].sort((a, b) => a - b);
}

export const STATUS_LABELS: Record<BudgetStatus, string> = {
  on_track: "On track",
  warning: "Almost at limit",
  reached: "Limit reached",
  over: "Over budget",
  invalid: "Invalid limit",
};
