import type { CurrencyCode } from "@/lib/money";

import type { MonthKey } from "./month";
import type { BudgetStatus } from "./usage";

/** Budget DTOs. Amounts are minor units in the budget's currency. */

export interface BudgetView {
  id: string;
  month: MonthKey;
  currency: CurrencyCode;
  category: { id: string; name: string; color: string | null; isArchived: boolean };
  limitMinor: bigint;
  spentMinor: bigint;
  remainingMinor: bigint;
  usagePercent: number | null;
  status: BudgetStatus;
  alertThresholdPercent: number;
  isArchived: boolean;
  updatedAt: Date;
}

export interface CurrencyBudgetTotals {
  currency: CurrencyCode;
  limitMinor: bigint;
  /** Spending in budgeted categories. */
  spentMinor: bigint;
  remainingMinor: bigint;
  usagePercent: number | null;
  /** Expenses in categories without an active budget this month. */
  unbudgetedMinor: bigint;
  overCount: number;
  warningCount: number;
}

export interface CategorySpendLine {
  categoryId: string;
  name: string;
  color: string | null;
  isArchived: boolean;
  spentMinor: bigint;
  /** The active budget covering this category and currency, if any. */
  budgetId: string | null;
}

export interface BudgetMonth {
  month: MonthKey;
  currentMonth: MonthKey;
  active: BudgetView[];
  archived: BudgetView[];
  totals: CurrencyBudgetTotals[];
  /** Every category with spending this month, per currency (budgeted or not). */
  spending: { currency: CurrencyCode; lines: CategorySpendLine[] }[];
  /** Active budgets last month that are missing this month (can be copied). */
  copyableCount: number;
}

export interface BudgetAlertView {
  id: string;
  budgetId: string;
  month: MonthKey;
  categoryName: string;
  currency: CurrencyCode;
  thresholdPercent: number;
  limitMinor: bigint;
  spentAtAlertMinor: bigint;
  createdAt: Date;
  isRead: boolean;
}
