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
  type Granularity,
  type GranularityOption,
  MAX_BUCKETS,
  REPORT_MAX_RANGE_DAYS,
  type ReportPreset,
} from "./constants";

/**
 * Report periods: inclusive calendar dates in the user's timezone (`today`
 * comes from todayInTimeZone(user.timezone)). Records are dated with calendar
 * dates, so a record belongs to a day exactly as entered — there is no
 * time-of-day boundary to get wrong.
 *
 * "To date" presets (today, this week/month/year) stop at today, so upcoming
 * (future-dated) records are not counted as if they had happened. A custom
 * range may include future dates; upcoming records in it are counted.
 */
export interface ReportPeriod {
  preset: ReportPreset;
  from: IsoDate;
  to: IsoDate;
  /** Calendar days in the range, inclusive. */
  days: number;
}

function build(preset: ReportPreset, from: IsoDate, to: IsoDate): ReportPeriod {
  return { preset, from, to, days: daysBetween(from, to) + 1 };
}

function endOfYear(date: IsoDate): IsoDate {
  return `${date.slice(0, 4)}-12-31` as IsoDate;
}

/** An invalid or incomplete custom range falls back to this month. */
export function resolveReportPeriod(
  input: { period: ReportPreset; from?: string | undefined; to?: string | undefined },
  today: IsoDate,
): ReportPeriod {
  switch (input.period) {
    case "today":
      return build("today", today, today);
    case "this_week":
      return build("this_week", startOfWeek(today), today);
    case "last_month": {
      const start = addMonthsClamped(startOfMonth(today), -1);
      return build("last_month", start, endOfMonth(start));
    }
    case "last_30_days":
      return build("last_30_days", addDays(today, -29), today);
    case "last_90_days":
      return build("last_90_days", addDays(today, -89), today);
    case "this_year":
      return build("this_year", startOfYear(today), today);
    case "last_year": {
      const start = addMonthsClamped(startOfYear(today), -12);
      return build("last_year", start, endOfYear(start));
    }
    case "custom": {
      if (!input.from || !input.to) break;
      let from = input.from as IsoDate;
      let to = input.to as IsoDate;
      if (from > to) [from, to] = [to, from];
      if (daysBetween(from, to) + 1 > REPORT_MAX_RANGE_DAYS) {
        from = addDays(to, -(REPORT_MAX_RANGE_DAYS - 1));
      }
      return build("custom", from, to);
    }
    case "this_month":
      break;
  }
  return build("this_month", startOfMonth(today), today);
}

function monthsSpanned(from: IsoDate, to: IsoDate): number {
  const [fy, fm] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  const [ty, tm] = [Number(to.slice(0, 4)), Number(to.slice(5, 7))];
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/**
 * The period a report is compared with (docs/REPORTS.md §Compare periods):
 * - whole calendar months (last month, last year, a custom 1 Jan – 31 Mar…):
 *   the same number of whole months just before;
 * - this month / this year to date: the same days of the previous month / year
 *   (1–16 Oct → 1–16 Sep; days past a shorter month's end are clamped);
 * - anything else (today, this week, last 30/90 days, other custom ranges):
 *   the same number of days just before.
 */
export function previousPeriod(period: ReportPeriod): { from: IsoDate; to: IsoDate } {
  const { from, to } = period;
  if (period.preset === "this_month") {
    return { from: addMonthsClamped(from, -1), to: addMonthsClamped(to, -1) };
  }
  if (period.preset === "this_year") {
    return { from: addMonthsClamped(from, -12), to: addMonthsClamped(to, -12) };
  }
  if (from === startOfMonth(from) && to === endOfMonth(to)) {
    const months = monthsSpanned(from, to);
    const start = addMonthsClamped(from, -months);
    return { from: start, to: endOfMonth(addMonthsClamped(startOfMonth(to), -months)) };
  }
  return { from: addDays(from, -period.days), to: addDays(from, -1) };
}

/** The first day of the bucket containing `date` (same rule as SQL date_trunc; weeks start Monday). */
export function bucketStart(date: IsoDate, granularity: Granularity): IsoDate {
  switch (granularity) {
    case "day":
      return date;
    case "week":
      return startOfWeek(date);
    case "month":
      return startOfMonth(date);
    case "year":
      return startOfYear(date);
  }
}

function nextBucket(start: IsoDate, granularity: Granularity): IsoDate {
  switch (granularity) {
    case "day":
      return addDays(start, 1);
    case "week":
      return addDays(start, 7);
    case "month":
      return addMonthsClamped(start, 1);
    case "year":
      return addMonthsClamped(start, 12);
  }
}

/** Every bucket start from `from` to `to`, so empty days/weeks/months/years still appear. */
export function bucketStarts(from: IsoDate, to: IsoDate, granularity: Granularity): IsoDate[] {
  const keys: IsoDate[] = [];
  for (let c = bucketStart(from, granularity); c <= to; c = nextBucket(c, granularity)) {
    keys.push(c);
  }
  return keys;
}

function bucketCount(period: ReportPeriod, granularity: Granularity): number {
  switch (granularity) {
    case "day":
      return period.days;
    case "week":
      return Math.floor(period.days / 7) + 2;
    case "month":
      return monthsSpanned(period.from, period.to);
    case "year":
      return Number(period.to.slice(0, 4)) - Number(period.from.slice(0, 4)) + 1;
  }
}

const COARSER: Record<Granularity, Granularity> = {
  day: "week",
  week: "month",
  month: "year",
  year: "year",
};

/**
 * Automatic: daily up to a month, weekly up to ~6 months, monthly beyond. A
 * chosen granularity is kept unless it would produce more than MAX_BUCKETS
 * rows, in which case the next coarser one is used (`adjusted` is then true).
 */
export function resolveGranularity(
  requested: GranularityOption,
  period: ReportPeriod,
): { granularity: Granularity; adjusted: boolean } {
  if (requested === "auto") {
    const granularity = period.days <= 31 ? "day" : period.days <= 183 ? "week" : "month";
    return { granularity, adjusted: false };
  }
  let granularity: Granularity = requested;
  while (bucketCount(period, granularity) > MAX_BUCKETS) granularity = COARSER[granularity];
  return { granularity, adjusted: granularity !== requested };
}
