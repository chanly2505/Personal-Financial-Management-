/** Recurring rules (docs/PRD.md §6.6). */

export const FREQUENCIES = ["WEEKLY", "MONTHLY", "YEARLY"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, { one: string; many: string }> = {
  WEEKLY: { one: "week", many: "weeks" },
  MONTHLY: { one: "month", many: "months" },
  YEARLY: { one: "year", many: "years" },
};

export const MIN_INTERVAL = 1;
export const MAX_INTERVAL = 365;
export const NAME_MAX = 60;

/** Most occurrences the engine posts for one rule in one run; the next run continues. */
export const MAX_OCCURRENCES_PER_RUN = 50;
/** Rules processed per engine run (the next run picks up the rest). */
export const MAX_RULES_PER_RUN = 500;
/** After this many failed attempts at the same occurrence the rule is paused for the user. */
export const MAX_ATTEMPTS = 5;

/** How far ahead "Upcoming" looks. */
export const UPCOMING_DAYS = 31;

export const STATUS_LABELS = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  COMPLETED: "Completed",
} as const;

export const PAUSE_REASON_LABELS = {
  USER: "Paused by you",
  ACCOUNT_ARCHIVED: "Paused: its account is archived",
  CATEGORY_ARCHIVED: "Paused: its category is archived",
  REPEATED_FAILURES: "Paused after repeated failures",
} as const;
export type PauseReason = keyof typeof PAUSE_REASON_LABELS;

/** Safe failure/skip reason codes stored in recurring_runs.reason (never raw errors). */
export const RUN_REASON_LABELS: Record<string, string> = {
  account_archived: "The account is archived",
  category_archived: "The category is archived",
  amount_invalid: "The amount is not valid",
  database_error: "A temporary problem saving the transaction",
  unexpected_error: "An unexpected problem",
};
