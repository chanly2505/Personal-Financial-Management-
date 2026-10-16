import type { BudgetView } from "@/features/budgets/types";
import type { MonthKey } from "@/features/budgets/month";
import type { EntryType } from "@/features/transactions/constants";
import type { LedgerItem } from "@/features/transactions/types";
import type { IsoDate } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";

import type { Granularity, ReportTab } from "./constants";
import type { ReportPeriod } from "./period";

/** Report DTOs (docs/REPORTS.md). Amounts are minor units; every figure is per currency. */

export interface ReportTotals {
  currency: CurrencyCode;
  /** Matching records, transfers included. */
  count: number;
  incomeMinor: bigint;
  expenseMinor: bigint;
  /** income − expense. Transfers never count. */
  netMinor: bigint;
}

export interface SeriesPoint {
  /** First day of the bucket. */
  start: IsoDate;
  incomeMinor: bigint;
  expenseMinor: bigint;
  netMinor: bigint;
  transferCount: number;
}

export interface BreakdownLine {
  id: string;
  name: string;
  color: string | null;
  isArchived: boolean;
  amountMinor: bigint;
  count: number;
  /** Share of this currency's income (or expenses) in the period, one decimal. */
  sharePercent: number;
}

export interface CurrencyReport {
  currency: CurrencyCode;
  totals: ReportTotals;
  series: SeriesPoint[];
  byCategory: Record<EntryType, BreakdownLine[]>;
  byAccount: Record<EntryType, BreakdownLine[]>;
}

export interface AccountHistoryRow extends LedgerItem {
  /** + money into the account, − money out of it. */
  signedMinor: bigint;
  /** Balance after this record; null when type/category filters make a running balance meaningless. */
  balanceMinor: bigint | null;
}

export interface AccountHistory {
  account: { id: string; name: string; currency: CurrencyCode; isArchived: boolean };
  /** Balance at the end of the day before the period. */
  openingMinor: bigint;
  /** Balance at the end of the period's last day. */
  closingMinor: bigint;
  /** Totals over every matching record (not only the listed ones). */
  count: number;
  inMinor: bigint;
  outMinor: bigint;
  rows: AccountHistoryRow[];
  /** More records match than are listed (see ACCOUNT_HISTORY_LIMIT). */
  truncated: boolean;
  /** False when type/category filters hide some records (balances would not add up). */
  showsRunningBalance: boolean;
}

export interface BudgetPerformanceTotals {
  currency: CurrencyCode;
  limitMinor: bigint;
  spentMinor: bigint;
  remainingMinor: bigint;
  usagePercent: number | null;
  overCount: number;
}

export interface BudgetPerformanceMonth {
  month: MonthKey;
  budgets: BudgetView[];
  totals: BudgetPerformanceTotals[];
}

export interface BudgetPerformance {
  months: BudgetPerformanceMonth[];
  /** The range covered more months than are shown (the latest BUDGET_MONTHS_MAX are). */
  truncated: boolean;
}

export interface ComparisonLine {
  id: string;
  name: string;
  isArchived: boolean;
  currentMinor: bigint;
  previousMinor: bigint;
}

export interface CurrencyComparison {
  currency: CurrencyCode;
  current: ReportTotals;
  previous: ReportTotals;
  /** Expense categories in either period, largest current first. */
  expenseCategories: ComparisonLine[];
  incomeCategories: ComparisonLine[];
}

export interface Comparison {
  previous: { from: IsoDate; to: IsoDate };
  currencies: CurrencyComparison[];
}

export interface Report {
  tab: ReportTab;
  period: ReportPeriod;
  today: IsoDate;
  granularity: Granularity;
  /** The chosen granularity was coarsened to keep the series readable. */
  granularityAdjusted: boolean;
  /** Totals over every matching record, per currency (the same figures as /transactions). */
  totals: ReportTotals[];
  /** Per-currency series and breakdowns (income, expenses, by category, cash flow). */
  currencies: CurrencyReport[];
  accountHistory: AccountHistory | null;
  budgets: BudgetPerformance | null;
  comparison: Comparison | null;
}
