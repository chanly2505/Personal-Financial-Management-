import { type IsoDate, isoDateToDb } from "@/lib/dates";
import { CURRENCIES, type CurrencyCode } from "@/lib/money";

import type { Bucket } from "./constants";

const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const monthYear = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const monthOnly = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const full = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Short axis label for a bucket start. */
export function bucketLabel(start: IsoDate, bucket: Bucket, spansYears = false): string {
  const date = isoDateToDb(start);
  if (bucket === "month") return (spansYears ? monthYear : monthOnly).format(date);
  return dayMonth.format(date);
}

/** Long label for tooltips and tables. */
export function bucketTitle(start: IsoDate, bucket: Bucket): string {
  const date = isoDateToDb(start);
  if (bucket === "day") return full.format(date);
  if (bucket === "week") return `Week of ${full.format(date)}`;
  return monthYear.format(date);
}

/** "1 Mar – 31 Mar 2026" */
export function rangeLabel(from: IsoDate, to: IsoDate): string {
  if (from === to) return full.format(isoDateToDb(from));
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const start = sameYear ? dayMonth.format(isoDateToDb(from)) : full.format(isoDateToDb(from));
  return `${start} – ${full.format(isoDateToDb(to))}`;
}

/** Minor units → a plain number of major units, for chart geometry only (never for totals). */
export function toChartNumber(minor: bigint, currency: CurrencyCode): number {
  return Number(minor) / 10 ** CURRENCIES[currency].exponent;
}
