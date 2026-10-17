import { describe, expect, it } from "vitest";

import { formatCalendarDate, todayInTimeZone } from "@/lib/dates";
import {
  DEFAULT_FORMAT_PREFS,
  type FormatPrefs,
  formatDate,
  formatDateRange,
  formatDayMonth,
  formatDayMonthLong,
  formatInstant,
  formatInteger,
  formatMonthYear,
  formatPercent,
} from "@/lib/format";
import { formatMoney } from "@/lib/money";

const p = (patch: Partial<FormatPrefs>): FormatPrefs => ({ ...DEFAULT_FORMAT_PREFS, ...patch });
const NNBSP = " ";

describe("date formats", () => {
  it.each([
    ["D_MMM_Y", "1 Mar 2026", "1 Mar", "March 2026", "1 March"],
    ["MMM_D_Y", "Mar 1, 2026", "Mar 1", "March 2026", "March 1"],
    ["DD_MM_Y", "01/03/2026", "01/03", "March 2026", "1 March"],
    ["ISO", "2026-03-01", "03-01", "2026-03", "1 March"],
  ] as const)("%s", (dateFormat, full, short, month, dayMonth) => {
    const prefs = p({ dateFormat });
    expect(formatDate("2026-03-01", prefs)).toBe(full);
    expect(formatDayMonth("2026-03-01", prefs)).toBe(short);
    expect(formatMonthYear("2026-03-01", "long", prefs)).toBe(month);
    expect(formatDayMonthLong("2026-03-01", prefs)).toBe(dayMonth);
  });

  it("never shifts a calendar date, whatever the machine's timezone", () => {
    // 1 January and 31 December are where a UTC/local mix-up would show.
    expect(formatDate("2026-01-01", p({}))).toBe("1 Jan 2026");
    expect(formatDate("2026-12-31", p({ dateFormat: "ISO" }))).toBe("2026-12-31");
    expect(formatDate("2028-02-29", p({ dateFormat: "DD_MM_Y" }))).toBe("29/02/2028");
  });

  it("formats ranges compactly within a year", () => {
    expect(formatDateRange("2026-03-01", "2026-03-31", p({}))).toBe("1 Mar – 31 Mar 2026");
    expect(formatDateRange("2026-03-01", "2026-03-31", p({ dateFormat: "MMM_D_Y" }))).toBe(
      "Mar 1 – Mar 31, 2026",
    );
    expect(formatDateRange("2025-12-01", "2026-01-31", p({}))).toBe("1 Dec 2025 – 31 Jan 2026");
    expect(formatDateRange("2026-03-01", "2026-03-01", p({ dateFormat: "ISO" }))).toBe(
      "2026-03-01",
    );
  });

  it("keeps Today / Yesterday and otherwise uses the chosen format", () => {
    const today = "2026-10-17" as never;
    expect(formatCalendarDate("2026-10-17" as never, today, p({ dateFormat: "ISO" }))).toBe(
      "Today",
    );
    expect(formatCalendarDate("2026-10-16" as never, today)).toBe("Yesterday");
    expect(formatCalendarDate("2026-10-01" as never, today, p({ dateFormat: "ISO" }))).toBe(
      "2026-10-01",
    );
  });
});

describe("timezone boundaries", () => {
  // 31 Oct 2026 17:30 UTC = 1 Nov 00:30 in Phnom Penh (UTC+7), still 31 Oct in London.
  const instant = new Date("2026-10-31T17:30:00Z");

  it("decides 'today' (and so this month) by the user's timezone", () => {
    expect(todayInTimeZone("Asia/Phnom_Penh", instant)).toBe("2026-11-01");
    expect(todayInTimeZone("Europe/London", instant)).toBe("2026-10-31");
    expect(todayInTimeZone("Pacific/Kiritimati", new Date("2026-12-31T10:30:00Z"))).toBe(
      "2027-01-01",
    );
  });

  it("shows a moment (e.g. 'password last changed') as the date in that timezone", () => {
    expect(formatInstant(instant, "Asia/Phnom_Penh", p({}))).toBe("1 Nov 2026");
    expect(formatInstant(instant, "America/New_York", p({}))).toBe("31 Oct 2026");
  });
});

describe("number formats", () => {
  it.each([
    ["COMMA_DOT", "$1,234,567.89", "៛4,100,000", "12,345", "96.2%"],
    ["DOT_COMMA", "$1.234.567,89", "៛4.100.000", "12.345", "96,2%"],
    [
      "SPACE_COMMA",
      `$1${NNBSP}234${NNBSP}567,89`,
      `៛4${NNBSP}100${NNBSP}000`,
      `12${NNBSP}345`,
      "96,2%",
    ],
  ] as const)("%s", (numberFormat, usd, khr, int, pct) => {
    const prefs = p({ numberFormat });
    expect(formatMoney(123456789n, "USD", { prefs })).toBe(usd);
    expect(formatMoney(4100000n, "KHR", { prefs })).toBe(khr);
    expect(formatInteger(12345, prefs)).toBe(int);
    expect(formatPercent(96.2, 1, prefs)).toBe(pct);
  });

  it("keeps each currency's own decimals and shows codes when asked", () => {
    const code = p({ currencyDisplay: "CODE" });
    expect(formatMoney(5n, "USD", { prefs: code })).toBe("USD 0.05");
    expect(formatMoney(41000n, "KHR", { prefs: code })).toBe("KHR 41,000");
    expect(formatMoney(-1250n, "USD", { prefs: p({}) })).toBe("-$12.50");
    expect(formatMoney(1250n, "USD", { prefs: p({}), signDisplay: "always" })).toBe("+$12.50");
  });

  it("is exact for the largest amounts (no floating point)", () => {
    expect(formatMoney(999_999_999_999_999n, "USD", { prefs: p({}) })).toBe(
      "$9,999,999,999,999.99",
    );
  });
});
