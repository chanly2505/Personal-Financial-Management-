import { describe, expect, it } from "vitest";

import {
  bucketStart,
  bucketStarts,
  previousPeriod,
  resolveGranularity,
  resolveReportPeriod,
} from "@/features/reports/period";
import type { IsoDate } from "@/lib/dates";

const d = (s: string) => s as IsoDate;
const today = d("2026-10-16"); // a Friday

describe("presets", () => {
  it.each([
    ["today", "2026-10-16", "2026-10-16", 1],
    ["this_week", "2026-10-12", "2026-10-16", 5],
    ["this_month", "2026-10-01", "2026-10-16", 16],
    ["last_month", "2026-09-01", "2026-09-30", 30],
    ["last_30_days", "2026-09-17", "2026-10-16", 30],
    ["last_90_days", "2026-07-19", "2026-10-16", 90],
    ["this_year", "2026-01-01", "2026-10-16", 289],
    ["last_year", "2025-01-01", "2025-12-31", 365],
  ] as const)("%s → %s … %s", (period, from, to, days) => {
    expect(resolveReportPeriod({ period }, today)).toEqual({ preset: period, from, to, days });
  });

  it("orders a reversed custom range, caps it at ~5 years and falls back when incomplete", () => {
    expect(
      resolveReportPeriod({ period: "custom", from: "2026-03-31", to: "2026-03-01" }, today),
    ).toMatchObject({ from: "2026-03-01", to: "2026-03-31", days: 31 });
    expect(
      resolveReportPeriod({ period: "custom", from: "2000-01-01", to: "2026-10-16" }, today),
    ).toMatchObject({ days: 1830, to: "2026-10-16" });
    expect(resolveReportPeriod({ period: "custom", from: "2026-01-01" }, today)).toMatchObject({
      preset: "this_month",
    });
  });

  it("handles a leap day as last year's boundary", () => {
    expect(resolveReportPeriod({ period: "last_year" }, d("2029-02-28"))).toMatchObject({
      from: "2028-01-01",
      to: "2028-12-31",
      days: 366,
    });
  });
});

describe("previous period", () => {
  const prev = (period: Parameters<typeof resolveReportPeriod>[0], t = today) =>
    previousPeriod(resolveReportPeriod(period, t));

  it("compares month/year to date with the same days before", () => {
    expect(prev({ period: "this_month" })).toEqual({ from: "2026-09-01", to: "2026-09-16" });
    expect(prev({ period: "this_month" }, d("2026-03-31"))).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(prev({ period: "this_year" })).toEqual({ from: "2025-01-01", to: "2025-10-16" });
  });

  it("compares whole months with the same number of whole months", () => {
    expect(prev({ period: "last_month" })).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(prev({ period: "last_year" })).toEqual({ from: "2024-01-01", to: "2024-12-31" });
    expect(prev({ period: "custom", from: "2026-01-01", to: "2026-03-31" })).toEqual({
      from: "2025-10-01",
      to: "2025-12-31",
    });
  });

  it("keeps rolling presets' length even when they cover whole months (QA-05)", () => {
    expect(prev({ period: "last_30_days" }, d("2026-09-30"))).toEqual({
      from: "2026-08-02",
      to: "2026-08-31",
    });
    expect(prev({ period: "last_90_days" }, d("2026-03-31"))).toEqual({
      from: "2025-10-03",
      to: "2025-12-31",
    });
  });

  it("compares other ranges with the same number of days just before", () => {
    expect(prev({ period: "last_30_days" })).toEqual({ from: "2026-08-18", to: "2026-09-16" });
    expect(prev({ period: "today" })).toEqual({ from: "2026-10-15", to: "2026-10-15" });
    expect(prev({ period: "this_week" })).toEqual({ from: "2026-10-07", to: "2026-10-11" });
    expect(prev({ period: "custom", from: "2026-03-10", to: "2026-03-19" })).toEqual({
      from: "2026-02-28",
      to: "2026-03-09",
    });
  });
});

describe("buckets", () => {
  it("starts weeks on Monday, months on the 1st and years on 1 January", () => {
    expect(bucketStart(d("2026-10-18"), "week")).toBe("2026-10-12"); // Sunday → Monday before
    expect(bucketStart(d("2026-10-12"), "week")).toBe("2026-10-12");
    expect(bucketStart(d("2026-10-18"), "month")).toBe("2026-10-01");
    expect(bucketStart(d("2026-10-18"), "year")).toBe("2026-01-01");
  });

  it("lists every bucket, including empty ones and partial first/last buckets", () => {
    expect(bucketStarts(d("2026-01-30"), d("2026-02-02"), "day")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
    expect(bucketStarts(d("2026-10-01"), d("2026-10-16"), "week")).toEqual([
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
    ]);
    expect(bucketStarts(d("2024-11-15"), d("2026-02-01"), "year")).toEqual([
      "2024-01-01",
      "2025-01-01",
      "2026-01-01",
    ]);
  });

  it("picks a granularity automatically and coarsens choices that would be too long", () => {
    const period = (from: string, to: string) =>
      resolveReportPeriod({ period: "custom", from, to }, today);
    expect(resolveGranularity("auto", period("2026-10-01", "2026-10-31")).granularity).toBe("day");
    expect(resolveGranularity("auto", period("2026-05-02", "2026-10-31")).granularity).toBe("week");
    expect(resolveGranularity("auto", period("2025-01-01", "2026-10-31")).granularity).toBe(
      "month",
    );
    expect(resolveGranularity("year", period("2026-10-01", "2026-10-31"))).toEqual({
      granularity: "year",
      adjusted: false,
    });
    expect(resolveGranularity("day", period("2025-01-01", "2026-10-31"))).toEqual({
      granularity: "week",
      adjusted: true,
    });
  });
});
