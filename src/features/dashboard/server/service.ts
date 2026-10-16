import "server-only";

import { getAccountsOverview } from "@/features/accounts/server/service";
import { listRecentRecords } from "@/features/transactions/server/service";
import { todayInTimeZone } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";
import type { CurrentUser } from "@/server/auth/session";

import { RECENT_LIMIT, TOP_CATEGORIES, TREND_MONTHS } from "../constants";
import { type Period, bucketStarts, resolvePeriod, trendRange } from "../period";
import type { DashboardFilters } from "../schemas";
import type { CashFlowPoint, CategorySpend, Dashboard, PeriodTotals } from "../types";
import * as repo from "./repository";

/**
 * Dashboard metrics (docs/PRD.md §6.12). One definition per figure:
 * - Balance: current balance (as of today) per currency, from the accounts
 *   module — the same numbers as the Accounts page. Active accounts only;
 *   archived accounts hold zero by rule (Q-10), so nothing is hidden.
 * - Income / expenses / net / savings rate for the period: from the cash-flow
 *   aggregation, which also draws the income-vs-expenses chart, so the cards
 *   and the chart cannot disagree. Transfers are never included. Records on
 *   archived accounts are included.
 * - Spending by category, recent records and the monthly trend use the same
 *   period boundaries (the trend: the months up to the period's end).
 */

const CURRENCY_ORDER: CurrencyCode[] = ["USD", "KHR"];
const byCurrency = (a: CurrencyCode, b: CurrencyCode) =>
  CURRENCY_ORDER.indexOf(a) - CURRENCY_ORDER.indexOf(b);

/** Percentage with one decimal, rounded half away from zero, using exact integer maths. */
export function percent(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  const scaled = (part * 2000n) / whole; // tenths of a percent × 2
  const rounded = scaled >= 0n ? (scaled + 1n) / 2n : (scaled - 1n) / 2n;
  return Number(rounded) / 10;
}

export function savingsRate(incomeMinor: bigint, expenseMinor: bigint): number | null {
  if (incomeMinor <= 0n) return null;
  return percent(incomeMinor - expenseMinor, incomeMinor);
}

function totalsFrom(rows: repo.CashFlowRow[]): PeriodTotals[] {
  const map = new Map<CurrencyCode, { income: bigint; expense: bigint }>();
  for (const row of rows) {
    const t = map.get(row.currency) ?? { income: 0n, expense: 0n };
    t.income += row.incomeMinor;
    t.expense += row.expenseMinor;
    map.set(row.currency, t);
  }
  return [...map.entries()]
    .sort(([a], [b]) => byCurrency(a, b))
    .map(([currency, t]) => ({
      currency,
      incomeMinor: t.income,
      expenseMinor: t.expense,
      netMinor: t.income - t.expense,
      savingsRatePercent: savingsRate(t.income, t.expense),
    }));
}

function series(
  rows: repo.CashFlowRow[],
  currency: CurrencyCode,
  range: Pick<Period, "from" | "to" | "bucket">,
): CashFlowPoint[] {
  const byStart = new Map(rows.filter((r) => r.currency === currency).map((r) => [r.bucket, r]));
  return bucketStarts(range.from, range.to, range.bucket).map((start) => ({
    start,
    incomeMinor: byStart.get(start)?.incomeMinor ?? 0n,
    expenseMinor: byStart.get(start)?.expenseMinor ?? 0n,
  }));
}

function categoriesFor(rows: repo.CategorySpendRow[], currency: CurrencyCode): CategorySpend[] {
  const own = rows.filter((r) => r.currency === currency);
  const total = own.reduce((sum, r) => sum + r.amountMinor, 0n);
  const top = own.slice(0, TOP_CATEGORIES).map((r) => ({
    categoryId: r.categoryId,
    name: r.name,
    color: r.color,
    isArchived: r.isArchived,
    amountMinor: r.amountMinor,
    sharePercent: percent(r.amountMinor, total),
  }));
  const rest = own.slice(TOP_CATEGORIES);
  if (rest.length === 0) return top;
  const restTotal = rest.reduce((sum, r) => sum + r.amountMinor, 0n);
  return [
    ...top,
    {
      categoryId: null,
      name: `Other (${rest.length} categories)`,
      color: null,
      isArchived: false,
      amountMinor: restTotal,
      sharePercent: percent(restTotal, total),
    },
  ];
}

export async function getDashboard(
  user: Pick<CurrentUser, "id" | "timezone" | "baseCurrency">,
  filters: DashboardFilters,
): Promise<Dashboard> {
  const today = todayInTimeZone(user.timezone);
  const period = resolvePeriod(filters, today);
  const trend = trendRange(period.to, TREND_MONTHS);

  // Five independent queries, run in parallel.
  const [overview, flowRows, categoryRows, trendRows, recent] = await Promise.all([
    getAccountsOverview(user),
    repo.cashFlow(user.id, period.from, period.to, period.bucket),
    repo.spendingByCategory(user.id, period.from, period.to),
    repo.cashFlow(user.id, trend.from, trend.to, "month"),
    listRecentRecords(user, period, RECENT_LIMIT),
  ]);

  const totals = totalsFrom(flowRows);
  const currencies = [
    ...new Set<CurrencyCode>([
      ...overview.totals.map((t) => t.currency),
      ...totals.map((t) => t.currency),
      ...trendRows.map((r) => r.currency),
    ]),
  ].sort(byCurrency);
  const chartCurrency =
    filters.currency && currencies.includes(filters.currency)
      ? filters.currency
      : currencies.includes(user.baseCurrency)
        ? user.baseCurrency
        : (currencies[0] ?? user.baseCurrency);

  return {
    period,
    today,
    balances: overview.totals,
    accounts: overview.active.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      balanceMinor: a.balanceMinor,
    })),
    hasAccounts: overview.active.length + overview.archived.length > 0,
    totals,
    recent,
    currencies,
    chartCurrency,
    charts: {
      currency: chartCurrency,
      categories: categoriesFor(categoryRows, chartCurrency),
      cashFlow: series(flowRows, chartCurrency, period),
      trend: series(trendRows, chartCurrency, { ...trend, bucket: "month" }),
    },
    trendRange: { ...trend, bucket: "month" },
  };
}
