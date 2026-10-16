import type { AccountType } from "@/features/accounts/constants";
import type { LedgerItem } from "@/features/transactions/types";
import type { IsoDate } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";

import type { Bucket } from "./constants";
import type { Period } from "./period";

/** Dashboard DTOs. Amounts are minor units (bigint); every total is per currency. */

export interface PeriodTotals {
  currency: CurrencyCode;
  incomeMinor: bigint;
  expenseMinor: bigint;
  /** income − expense; transfers never count. */
  netMinor: bigint;
  /**
   * (income − expense) / income × 100, rounded to one decimal; null when there
   * is no income in the period (undefined, not 0 % or −∞).
   */
  savingsRatePercent: number | null;
}

export interface BalanceTotal {
  currency: CurrencyCode;
  balanceMinor: bigint;
  accountCount: number;
}

export interface AccountBalance {
  id: string;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  balanceMinor: bigint;
}

export interface CategorySpend {
  /** null for the grouped "Other" row. */
  categoryId: string | null;
  name: string;
  color: string | null;
  isArchived: boolean;
  amountMinor: bigint;
  /** Share of the currency's spending in the period, one decimal. */
  sharePercent: number;
}

export interface CashFlowPoint {
  /** First day of the bucket. */
  start: IsoDate;
  incomeMinor: bigint;
  expenseMinor: bigint;
}

export interface CurrencyCharts {
  currency: CurrencyCode;
  categories: CategorySpend[];
  cashFlow: CashFlowPoint[];
  /** Expenses per month for the trend window. */
  trend: CashFlowPoint[];
}

export interface Dashboard {
  period: Period;
  today: IsoDate;
  /** Current balances (as of today) of active accounts — not period figures. */
  balances: BalanceTotal[];
  accounts: AccountBalance[];
  hasAccounts: boolean;
  totals: PeriodTotals[];
  recent: LedgerItem[];
  /** Currencies that have accounts or activity, in display order. */
  currencies: CurrencyCode[];
  /** The currency the charts show. */
  chartCurrency: CurrencyCode;
  charts: CurrencyCharts;
  trendRange: { from: IsoDate; to: IsoDate; bucket: Extract<Bucket, "month"> };
}
