import type { IsoDate } from "@/lib/dates";
import { formatDate, formatDayMonth, formatMonthShort, formatMonthYear } from "@/lib/format/dates";

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
