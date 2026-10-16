import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonthsClamped,
  dbDateToIso,
  endOfMonth,
  isIsoDate,
  isValidTimeZone,
  isoDateToDb,
  startOfMonth,
  toIsoDate,
  todayInTimeZone,
} from "@/lib/dates";

describe("isIsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(isIsoDate("2026-10-15")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it.each([
    "2026-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-04-31",
    "26-10-15",
    "2026-10-15T00:00:00Z",
    "",
  ])("rejects %j", (value) => {
    expect(isIsoDate(value)).toBe(false);
  });
});

describe("todayInTimeZone", () => {
  // 2026-10-15T20:30:00Z is already Oct 16 in Phnom Penh (UTC+7) but still Oct 15 in New York.
  const instant = new Date("2026-10-15T20:30:00Z");

  it("uses the user's timezone, not the server's", () => {
    expect(todayInTimeZone("Asia/Phnom_Penh", instant)).toBe("2026-10-16");
    expect(todayInTimeZone("America/New_York", instant)).toBe("2026-10-15");
    expect(todayInTimeZone("UTC", instant)).toBe("2026-10-15");
  });
});

describe("isValidTimeZone", () => {
  it("validates IANA identifiers", () => {
    expect(isValidTimeZone("Asia/Phnom_Penh")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});

describe("database date conversion", () => {
  it("round-trips without timezone drift", () => {
    const iso = toIsoDate("2026-01-01");
    const db = isoDateToDb(iso);
    expect(db.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(dbDateToIso(db)).toBe(iso);
  });
});

describe("date arithmetic", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays(toIsoDate("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(toIsoDate("2026-03-01"), -1)).toBe("2026-02-28");
  });

  it("clamps month-end when adding months", () => {
    const jan31 = toIsoDate("2026-01-31");
    expect(addMonthsClamped(jan31, 1)).toBe("2026-02-28");
    expect(addMonthsClamped(jan31, 2)).toBe("2026-03-31");
    expect(addMonthsClamped(toIsoDate("2028-01-31"), 1)).toBe("2028-02-29");
    expect(addMonthsClamped(toIsoDate("2026-11-15"), 3)).toBe("2027-02-15");
    expect(addMonthsClamped(toIsoDate("2026-03-15"), -3)).toBe("2025-12-15");
  });

  it("finds month bounds", () => {
    expect(startOfMonth(toIsoDate("2026-02-17"))).toBe("2026-02-01");
    expect(endOfMonth(toIsoDate("2026-02-17"))).toBe("2026-02-28");
    expect(endOfMonth(toIsoDate("2028-02-01"))).toBe("2028-02-29");
  });
});
