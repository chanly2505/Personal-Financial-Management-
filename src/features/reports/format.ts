import type { IsoDate } from "@/lib/dates";
import { formatDate, formatDayMonth, formatMonthShort, formatMonthYear } from "@/lib/format/dates";
import { formatPercent } from "@/lib/format/number";

import type { Granularity } from "./constants";

/** Report labels in the user's date format (server components; request preferences apply). */

/** Short axis label for a bucket start. */
export function bucketLabel(start: IsoDate, granularity: Granularity, spansYears: boolean): string {
  if (granularity === "year") return start.slice(0, 4);
  if (granularity === "month") {
    return spansYears ? formatMonthYear(start, "short") : formatMonthShort(start);
  }
  return formatDayMonth(start);
}

/** Long label for tables and tooltips. */
export function bucketTitle(start: IsoDate, granularity: Granularity): string {
  switch (granularity) {
    case "day":
      return formatDate(start);
    case "week":
      return `Week of ${formatDate(start)}`;
    case "month":
      return formatMonthYear(start, "short");
    case "year":
      return start.slice(0, 4);
  }
}

export const GRANULARITY_UNIT: Record<Granularity, string> = {
  day: "day",
  week: "week",
  month: "month",
  year: "year",
};

export const GRANULARITY_COLUMN: Record<Granularity, string> = {
  day: "Date",
  week: "Week",
  month: "Month",
  year: "Year",
};

/**
 * Change in words and signs: "+12.5%", "−3.0%", "New" (nothing before), "No change".
 * The sign comes from the exact amounts, not the rounded percentage, so a tiny
 * increase reads "+0.0%", never "−0.0%" (FIN-2).
 */
export function changePercent(current: bigint, previous: bigint): string {
  if (current === previous) return "No change";
  if (previous === 0n) return "New";
  const scaled = ((current - previous) * 2000n) / (previous < 0n ? -previous : previous);
  const tenths = scaled >= 0n ? (scaled + 1n) / 2n : (scaled - 1n) / 2n;
  const value = Number(tenths < 0n ? -tenths : tenths) / 10;
  return `${current > previous ? "+" : "−"}${formatPercent(value)}`;
}
