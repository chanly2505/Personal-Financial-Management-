import type { IsoDate } from "@/lib/dates";

/**
 * Goal progress (docs/PRD.md §6.8), exact integer arithmetic:
 *   saved      = Σ contributions (never below zero)
 *   remaining  = max(target − saved, 0)
 *   percent    = ⌊saved × 100 ÷ target⌋ (may exceed 100 — saving past the target is allowed)
 *   achieved   = saved ≥ target (derived, never stored)
 * With a target date not yet passed:
 *   monthsLeft = calendar months from this month to the target month, inclusive
 *   monthly    = ⌈remaining ÷ monthsLeft⌉ (minor units; shown, never enforced)
 */
export interface GoalProgress {
  remainingMinor: bigint;
  percent: number;
  achieved: boolean;
  /** Target date in the past and not achieved. */
  overdue: boolean;
  monthsLeft: number | null;
  monthlyNeededMinor: bigint | null;
}

export function goalProgress(
  goal: { targetMinor: bigint; savedMinor: bigint; targetDate: IsoDate | null },
  today: IsoDate,
): GoalProgress {
  const remainingMinor =
    goal.savedMinor >= goal.targetMinor ? 0n : goal.targetMinor - goal.savedMinor;
  const percent = goal.targetMinor > 0n ? Number((goal.savedMinor * 100n) / goal.targetMinor) : 0;
  const achieved = goal.targetMinor > 0n && goal.savedMinor >= goal.targetMinor;
  if (!goal.targetDate || achieved) {
    return {
      remainingMinor,
      percent,
      achieved,
      overdue: false,
      monthsLeft: null,
      monthlyNeededMinor: null,
    };
  }
  if (goal.targetDate < today) {
    return {
      remainingMinor,
      percent,
      achieved,
      overdue: true,
      monthsLeft: 0,
      monthlyNeededMinor: null,
    };
  }
  const [ty, tm] = goal.targetDate.split("-").map(Number) as [number, number];
  const [cy, cm] = today.split("-").map(Number) as [number, number];
  const monthsLeft = (ty - cy) * 12 + (tm - cm) + 1;
  const months = BigInt(monthsLeft);
  const monthlyNeededMinor = (remainingMinor + months - 1n) / months;
  return { remainingMinor, percent, achieved, overdue: false, monthsLeft, monthlyNeededMinor };
}
