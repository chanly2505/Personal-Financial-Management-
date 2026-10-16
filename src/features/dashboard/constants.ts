/** Dashboard periods (docs/PRD.md §6.12). Every widget uses the same resolved range. */

export const PERIOD_PRESETS = [
  "this_month",
  "last_month",
  "last_30_days",
  "last_90_days",
  "this_year",
  "custom",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  this_month: "This month",
  last_month: "Last month",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  this_year: "This year",
  custom: "Custom range",
};

export const DEFAULT_PERIOD: PeriodPreset = "this_month";

/** Longest custom range (about five years); longer requests are shortened from the start. */
export const MAX_RANGE_DAYS = 1830;

/** Chart granularity: daily up to a month, weekly up to ~6 months, monthly beyond. */
export type Bucket = "day" | "week" | "month";
export const DAY_BUCKET_MAX_DAYS = 31;
export const WEEK_BUCKET_MAX_DAYS = 183;

/** Months shown in the spending-trend chart, ending with the period's last month. */
export const TREND_MONTHS = 6;

/** Recent transactions listed on the dashboard. */
export const RECENT_LIMIT = 8;

/** Categories shown individually in "Spending by category"; the rest are grouped as "Other". */
export const TOP_CATEGORIES = 7;
