import type { IsoDate } from "@/lib/dates";
import {
  formatDate,
  formatDateRange,
  formatDayMonth,
  formatMonthShort,
  formatMonthYear,
} from "@/lib/format/dates";
import { CURRENCIES, type CurrencyCode } from "@/lib/money";

import type { Bucket } from "./constants";

/**
 * Chart and range labels in the user's date format (src/lib/format/dates.ts).
 * Called from server components, so the current request's preferences apply.
 */

/** Short axis label for a bucket start. */
export function bucketLabel(start: IsoDate, bucket: Bucket, spansYears = false): string {
  if (bucket === "month")
    return spansYears ? formatMonthYear(start, "short") : formatMonthShort(start);
  return formatDayMonth(start);
}

/** Long label for tooltips and tables. */
export function bucketTitle(start: IsoDate, bucket: Bucket): string {
  if (bucket === "day") return formatDate(start);
  if (bucket === "week") return `Week of ${formatDate(start)}`;
  return formatMonthYear(start, "short");
}

/** "1 Mar – 31 Mar 2026" (or the user's format). */
export function rangeLabel(from: IsoDate, to: IsoDate): string {
  return formatDateRange(from, to);
}

/** Minor units → a plain number of major units, for chart geometry only (never for totals). */
export function toChartNumber(minor: bigint, currency: CurrencyCode): number {
  return Number(minor) / 10 ** CURRENCIES[currency].exponent;
}
