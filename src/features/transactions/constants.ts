/** Ledger rules and options shared by forms, filters and the server. */

export const ENTRY_TYPES = ["INCOME", "EXPENSE"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const LEDGER_KINDS = ["INCOME", "EXPENSE", "TRANSFER"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const KIND_LABELS: Record<LedgerKind, string> = {
  INCOME: "Income",
  EXPENSE: "Expense",
  TRANSFER: "Transfer",
};

/** Earliest accepted date (docs/PRD.md §6.5, D-3). The latest is one year after today. */
export const MIN_OCCURRED_ON = "2000-01-01";
export const MAX_DAYS_AHEAD = 366;

export const PAYEE_MAX = 80;
export const NOTE_MAX = 500;

export const PAGE_SIZE = 25;

export const SORT_OPTIONS = ["date_desc", "date_asc", "amount_desc", "amount_asc"] as const;
export type LedgerSort = (typeof SORT_OPTIONS)[number];

export const SORT_LABELS: Record<LedgerSort, string> = {
  date_desc: "Newest first",
  date_asc: "Oldest first",
  amount_desc: "Largest amount",
  amount_asc: "Smallest amount",
};

/**
 * CSV export limits (docs/REPORTS.md §Export). Exports are streamed in batches,
 * so memory use stays flat; requests matching more rows than the limit are
 * refused with a message to narrow the filters (never silently truncated).
 */
export const EXPORT_MAX_ROWS = 50_000;
export const EXPORT_BATCH_SIZE = 1_000;
