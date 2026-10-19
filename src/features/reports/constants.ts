/** Reports (docs/REPORTS.md). One filter set drives every report. */

export const REPORT_TABS = [
  "income",
  "expenses",
  "categories",
  "cash-flow",
  "account",
  "budgets",
  "compare",
] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

export const REPORT_LABELS: Record<ReportTab, string> = {
  income: "Income",
  expenses: "Expenses",
  categories: "By category",
  "cash-flow": "Money in and out",
  account: "Account history",
  budgets: "Budgets",
  compare: "Compare periods",
};

export const DEFAULT_REPORT: ReportTab = "cash-flow";

export const REPORT_PRESETS = [
  "today",
  "this_week",
  "this_month",
  "last_month",
  "last_30_days",
  "last_90_days",
  "this_year",
  "last_year",
  "custom",
] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

export const REPORT_PRESET_LABELS: Record<ReportPreset, string> = {
  today: "Today",
  this_week: "This week",
  this_month: "This month",
  last_month: "Last month",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  this_year: "This year",
  last_year: "Last year",
  custom: "Custom range",
};

export const DEFAULT_REPORT_PRESET: ReportPreset = "this_month";

/** Longest range (about five years, same as the dashboard); longer ones are shortened from the start. */
export const REPORT_MAX_RANGE_DAYS = 1830;

export const GRANULARITY_OPTIONS = ["auto", "day", "week", "month", "year"] as const;
export type GranularityOption = (typeof GRANULARITY_OPTIONS)[number];
export type Granularity = Exclude<GranularityOption, "auto">;

export const GRANULARITY_LABELS: Record<GranularityOption, string> = {
  auto: "Automatic",
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
  year: "Yearly",
};

/** A series never has more rows than this; a finer choice is coarsened (and the page says so). */
export const MAX_BUCKETS = 370;

/** Rows listed in the account history report (the CSV export has the full list). */
export const ACCOUNT_HISTORY_LIMIT = 500;

/** Budget months shown at most (the latest months of the range). */
export const BUDGET_MONTHS_MAX = 12;
