import { describe, expect, it } from "vitest";

import { bucketFor, bucketStarts, resolvePeriod, trendRange } from "@/features/dashboard/period";
import { dashboardFiltersSchema } from "@/features/dashboard/schemas";
import { type IsoDate, daysBetween, startOfWeek } from "@/lib/dates";

const today = "2026-10-16" as IsoDate;
const resolve = (params: Record<string, string>) =>
  resolvePeriod(dashboardFiltersSchema.parse(params), today);

describe("resolvePeriod", () => {
  it.each([
    ["this_month", "2026-10-01", "2026-10-16", 16],
    ["last_month", "2026-09-01", "2026-09-30", 30],
    ["last_30_days", "2026-09-17", "2026-10-16", 30],
    ["last_90_days", "2026-07-19", "2026-10-16", 90],
    ["this_year", "2026-01-01", "2026-10-16", 289],
  ])("%s → %s … %s (%i days)", (period, from, to, days) => {
    expect(resolve({ period })).toMatchObject({ preset: period, from, to, days });
  });

  it("handles month and year edges", () => {
    expect(resolvePeriod({ period: "last_month" }, "2026-03-31" as IsoDate)).toMatchObject({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(resolvePeriod({ period: "last_month" }, "2026-01-05" as IsoDate)).toMatchObject({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(resolvePeriod({ period: "last_month" }, "2028-03-01" as IsoDate)).toMatchObject({
      to: "2028-02-29",
    });
  });

  it("accepts custom ranges, swapping reversed bounds and capping the length", () => {
    expect(resolve({ period: "custom", from: "2026-03-31", to: "2026-03-01" })).toMatchObject({
      preset: "custom",
      from: "2026-03-01",
      to: "2026-03-31",
    });
    const long = resolve({ period: "custom", from: "2000-01-01", to: "2026-10-16" });
    expect(long.days).toBe(1830);
    expect(long.to).toBe("2026-10-16");
  });

  it("falls back to this month for incomplete or invalid input", () => {
    expect(resolve({ period: "custom", from: "2026-03-01" }).preset).toBe("this_month");
    expect(resolve({ period: "custom", from: "2026-02-30", to: "2026-03-01" }).preset).toBe(
      "this_month",
    );
    expect(resolve({ period: "decade" }).preset).toBe("this_month");
    expect(resolve({}).preset).toBe("this_month");
  });
});

describe("buckets", () => {
  it("chooses day, week or month by length", () => {
    expect([bucketFor(1), bucketFor(31), bucketFor(32), bucketFor(183), bucketFor(184)]).toEqual([
      "day",
      "day",
      "week",
      "week",
      "month",
    ]);
  });

  it("lists every bucket, including empty ones", () => {
    expect(bucketStarts("2026-02-27" as IsoDate, "2026-03-02" as IsoDate, "day")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
    expect(bucketStarts("2026-03-04" as IsoDate, "2026-03-20" as IsoDate, "week")).toEqual([
      "2026-03-02",
      "2026-03-09",
      "2026-03-16",
    ]);
    expect(bucketStarts("2025-11-15" as IsoDate, "2026-02-01" as IsoDate, "month")).toEqual([
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ]);
  });

  it("weeks start on Monday", () => {
    expect(startOfWeek("2026-03-01" as IsoDate)).toBe("2026-02-23"); // Sunday
    expect(startOfWeek("2026-03-02" as IsoDate)).toBe("2026-03-02"); // Monday
    expect(daysBetween("2026-03-01" as IsoDate, "2026-03-31" as IsoDate)).toBe(30);
  });

  it("trend covers whole months up to the period end", () => {
    expect(trendRange("2026-10-16" as IsoDate, 6)).toEqual({
      from: "2026-05-01",
      to: "2026-10-16",
    });
  });
});
