import { type IsoDate, isoDateToDb } from "@/lib/dates";

import type { Granularity } from "./constants";

const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const monthOnly = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const full = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Short axis label for a bucket start. */
export function bucketLabel(start: IsoDate, granularity: Granularity, spansYears: boolean): string {
  const date = isoDateToDb(start);
  if (granularity === "year") return start.slice(0, 4);
  if (granularity === "month") return (spansYears ? monthYear : monthOnly).format(date);
  return dayMonth.format(date);
}

/** Long label for tables and tooltips. */
export function bucketTitle(start: IsoDate, granularity: Granularity): string {
  const date = isoDateToDb(start);
  switch (granularity) {
    case "day":
      return full.format(date);
    case "week":
      return `Week of ${full.format(date)}`;
    case "month":
      return monthYear.format(date);
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
