import {
  type IsoDate,
  addDays,
  addMonthsClamped,
  daysBetween,
  endOfMonth,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "@/lib/dates";

import {
  type Bucket,
  DAY_BUCKET_MAX_DAYS,
  MAX_RANGE_DAYS,
  type PeriodPreset,
  WEEK_BUCKET_MAX_DAYS,
} from "./constants";

/**
 * A resolved dashboard period: inclusive calendar dates in the user's timezone
 * (`today` must come from todayInTimeZone(user.timezone)). This is the single
 * definition of every preset; all widgets use its `from`/`to`.
 */
export interface Period {
  preset: PeriodPreset;
  from: IsoDate;
  to: IsoDate;
  /** Number of calendar days in the range (inclusive). */
  days: number;
  bucket: Bucket;
}

export function bucketFor(days: number): Bucket {
  if (days <= DAY_BUCKET_MAX_DAYS) return "day";
  if (days <= WEEK_BUCKET_MAX_DAYS) return "week";
  return "month";
}

function build(preset: PeriodPreset, from: IsoDate, to: IsoDate): Period {
  const days = daysBetween(from, to) + 1;
  return { preset, from, to, days, bucket: bucketFor(days) };
}

/**
 * Presets end today (or at the end of last month); "this month" and "this year"
 * stop at today, so future-dated (upcoming) records are not counted as income
 * or spending that already happened. A custom range may include future dates.
 * An invalid custom range falls back to this month.
 */
export function resolvePeriod(
  input: { period: PeriodPreset; from?: string | undefined; to?: string | undefined },
  today: IsoDate,
): Period {
  switch (input.period) {
    case "last_month": {
      const lastMonth = addMonthsClamped(startOfMonth(today), -1);
      return build("last_month", lastMonth, endOfMonth(lastMonth));
    }
    case "last_30_days":
      return build("last_30_days", addDays(today, -29), today);
    case "last_90_days":
      return build("last_90_days", addDays(today, -89), today);
    case "this_year":
      return build("this_year", startOfYear(today), today);
    case "custom": {
      if (!input.from || !input.to) break;
      let from = input.from as IsoDate;
      let to = input.to as IsoDate;
      if (from > to) [from, to] = [to, from];
      if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) from = addDays(to, -(MAX_RANGE_DAYS - 1));
      return build("custom", from, to);
    }
    case "this_month":
      break;
  }
  return build("this_month", startOfMonth(today), today);
}

/** The first day of the bucket containing `date` (same rule as the SQL date_trunc). */
export function bucketStart(date: IsoDate, bucket: Bucket): IsoDate {
  if (bucket === "day") return date;
  if (bucket === "week") return startOfWeek(date);
  return startOfMonth(date);
}

/** Every bucket start from `from` to `to`, so empty days/weeks/months still appear. */
export function bucketStarts(from: IsoDate, to: IsoDate, bucket: Bucket): IsoDate[] {
  const keys: IsoDate[] = [];
  let cursor = bucketStart(from, bucket);
  while (cursor <= to) {
    keys.push(cursor);
    cursor =
      bucket === "day"
        ? addDays(cursor, 1)
        : bucket === "week"
          ? addDays(cursor, 7)
          : addMonthsClamped(cursor, 1);
  }
  return keys;
}

/**
 * The trend window: `months` calendar months ending with the month of `to`,
 * cut off at `to` itself (so, like the period, it never counts days after it).
 */
export function trendRange(to: IsoDate, months: number): { from: IsoDate; to: IsoDate } {
  return { from: addMonthsClamped(startOfMonth(to), -(months - 1)), to };
}
