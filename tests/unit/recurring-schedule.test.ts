import { describe, expect, it } from "vitest";

import {
  type Schedule,
  describeSchedule,
  firstOnOrAfter,
  nextAfter,
  occurrenceAt,
  occurrencesBetween,
} from "@/features/recurring/schedule";
import type { IsoDate } from "@/lib/dates";

const d = (s: string) => s as IsoDate;
const rule = (
  frequency: Schedule["frequency"],
  startOn: string,
  extra: Partial<Schedule> = {},
): Schedule => ({
  frequency,
  interval: 1,
  startOn: d(startOn),
  endOn: null,
  ...extra,
});

describe("monthly calendar policy", () => {
  it("clamps the 31st to the last day of short months, from the anchor (no drift)", () => {
    const s = rule("MONTHLY", "2026-01-31");
    expect([0, 1, 2, 3, 4, 12, 13].map((k) => occurrenceAt(s, k))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2027-01-31",
      "2027-02-28",
    ]);
  });

  it("uses 29 February in leap years", () => {
    const s = rule("MONTHLY", "2027-12-31");
    expect(occurrenceAt(s, 2)).toBe("2028-02-29");
    expect(occurrenceAt(rule("MONTHLY", "2028-01-30"), 1)).toBe("2028-02-29");
  });

  it("supports every N months", () => {
    const s = rule("MONTHLY", "2026-01-15", { interval: 3 });
    expect(occurrencesBetween(s, d("2026-01-01"), d("2026-12-31"))).toEqual([
      "2026-01-15",
      "2026-04-15",
      "2026-07-15",
      "2026-10-15",
    ]);
  });
});

describe("yearly calendar policy", () => {
  it("posts 29 February rules on 28 February in common years and returns to the 29th", () => {
    const s = rule("YEARLY", "2024-02-29");
    expect([0, 1, 2, 3, 4].map((k) => occurrenceAt(s, k))).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });
});

describe("weekly", () => {
  it("steps 7 × interval days and crosses month and year ends", () => {
    const s = rule("WEEKLY", "2026-12-24", { interval: 2 });
    expect(occurrencesBetween(s, d("2026-12-01"), d("2027-01-31"))).toEqual([
      "2026-12-24",
      "2027-01-07",
      "2027-01-21",
    ]);
  });
});

describe("next occurrence", () => {
  it("finds the first occurrence on or after a date", () => {
    const s = rule("MONTHLY", "2026-01-31");
    expect(firstOnOrAfter(s, d("2025-06-01"))).toBe("2026-01-31");
    expect(firstOnOrAfter(s, d("2026-02-28"))).toBe("2026-02-28");
    expect(firstOnOrAfter(s, d("2026-03-01"))).toBe("2026-03-31");
    expect(nextAfter(s, d("2026-02-28"))).toBe("2026-03-31");
    expect(firstOnOrAfter(rule("WEEKLY", "2026-10-05"), d("2026-10-06"))).toBe("2026-10-12");
  });

  it("respects the end date (inclusive)", () => {
    const s = rule("MONTHLY", "2026-01-31", { endOn: d("2026-03-31") });
    expect(occurrencesBetween(s, d("2026-01-01"), d("2027-01-01"))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    expect(nextAfter(s, d("2026-03-31"))).toBeNull();
  });
});

describe("describeSchedule", () => {
  it("explains the schedule in plain words", () => {
    expect(describeSchedule(rule("MONTHLY", "2026-01-31"))).toBe(
      "Every month on the 31st (the last day in shorter months)",
    );
    expect(describeSchedule(rule("MONTHLY", "2026-01-01", { interval: 2 }))).toBe(
      "Every 2 months on the 1st",
    );
    expect(describeSchedule(rule("WEEKLY", "2026-10-16"))).toBe("Every week on Friday");
    expect(describeSchedule(rule("YEARLY", "2024-02-29"))).toBe(
      "Every year on 29 February (28 February in common years)",
    );
  });
});
