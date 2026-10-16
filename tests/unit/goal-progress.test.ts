import { describe, expect, it } from "vitest";

import { goalProgress } from "@/features/goals/progress";
import type { IsoDate } from "@/lib/dates";

const today = "2026-10-16" as IsoDate;
const g = (target: bigint, saved: bigint, date: string | null = null) =>
  goalProgress(
    { targetMinor: target, savedMinor: saved, targetDate: date as IsoDate | null },
    today,
  );

describe("goal progress", () => {
  it("computes remaining and floored percent", () => {
    expect(g(100000n, 0n)).toMatchObject({ remainingMinor: 100000n, percent: 0, achieved: false });
    expect(g(100000n, 33333n)).toMatchObject({
      remainingMinor: 66667n,
      percent: 33,
      achieved: false,
    });
    expect(g(100000n, 99999n)).toMatchObject({ percent: 99, achieved: false });
  });

  it("is achieved at the target and allows saving beyond it", () => {
    expect(g(100000n, 100000n)).toMatchObject({ remainingMinor: 0n, percent: 100, achieved: true });
    expect(g(100000n, 125000n)).toMatchObject({ remainingMinor: 0n, percent: 125, achieved: true });
  });

  it("works out the monthly amount needed for a dated goal (rounded up)", () => {
    // Oct, Nov, Dec = 3 months; 1,000.00 remaining → 333.34 per month.
    expect(g(100000n, 0n, "2026-12-31")).toMatchObject({
      monthsLeft: 3,
      monthlyNeededMinor: 33334n,
      overdue: false,
    });
    // Target this month: everything now.
    expect(g(100000n, 40000n, "2026-10-31")).toMatchObject({
      monthsLeft: 1,
      monthlyNeededMinor: 60000n,
    });
    // Across a year end: Oct 2026 → Mar 2027 = 6 months; KHR 4,000,000 → 666,667.
    expect(g(4000000n, 0n, "2027-03-01")).toMatchObject({
      monthsLeft: 6,
      monthlyNeededMinor: 666667n,
    });
  });

  it("flags an overdue goal and stops suggesting a monthly amount once achieved", () => {
    expect(g(100000n, 1n, "2026-10-15")).toMatchObject({ overdue: true, monthlyNeededMinor: null });
    expect(g(100000n, 100000n, "2026-10-15")).toMatchObject({
      overdue: false,
      achieved: true,
      monthlyNeededMinor: null,
    });
  });
});
