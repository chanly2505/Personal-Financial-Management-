import "server-only";

import { balanceAtEndOf, findOwnAccount } from "@/features/accounts/server/service";
import { type MonthKey, monthKeyOf, shiftMonth } from "@/features/budgets/month";
import { listBudgetsInMonths } from "@/features/budgets/server/service";
import { budgetUsage } from "@/features/budgets/usage";
import { percent } from "@/features/dashboard/server/service";
import type { EntryType } from "@/features/transactions/constants";
import {
  type LedgerQuery,
  listLedger,
  summarizeLedger,
} from "@/features/transactions/server/repository";
import { type IsoDate, addDays, todayInTimeZone } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";
import type { CurrentUser } from "@/server/auth/session";

import { ACCOUNT_HISTORY_LIMIT, BUDGET_MONTHS_MAX } from "../constants";
import {
  type ReportPeriod,
  bucketStarts,
  previousPeriod,
  resolveGranularity,
  resolveReportPeriod,
} from "../period";
import type { ReportFilters } from "../schemas";
import type {
  AccountHistory,
  BreakdownLine,
  BudgetPerformance,
  Comparison,
  ComparisonLine,
  CurrencyReport,
  Report,
  ReportTotals,
} from "../types";
import * as repo from "./repository";

/**
 * Reports (docs/REPORTS.md). Definitions shared by every report:
 * - Source: persisted income, expense and transfer records only. Deleted
 *   records are gone (hard delete) and never counted; records on archived
 *   accounts or in archived categories are included (history is never hidden).
 * - Filters: one set — period, account, type, category, currency — applied
 *   with the same SQL as /transactions and the CSV export.
 * - Income and expenses never include transfers; a reversed transfer and its
 *   reversal are both ordinary transfers (they cancel out in balances).
 * - Every amount is per currency; currencies are never added together (no FX).
 * - Dates are calendar dates; "today" is in the user's timezone.
 */

type User = Pick<CurrentUser, "id" | "timezone">;

const CURRENCY_ORDER: CurrencyCode[] = ["USD", "KHR"];
const byCurrency = (a: CurrencyCode, b: CurrencyCode) =>
  CURRENCY_ORDER.indexOf(a) - CURRENCY_ORDER.indexOf(b);

function toQuery(filters: ReportFilters, range: { from: IsoDate; to: IsoDate }) {
  return {
    kind: filters.kind,
    accountId: filters.accountId,
    categoryId: filters.categoryId,
    currency: filters.currency,
    from: range.from,
    to: range.to,
  } satisfies Omit<LedgerQuery, "sort">;
}

async function totalsFor(userId: string, query: Omit<LedgerQuery, "sort">) {
  const rows = await summarizeLedger(userId, query);
  return rows
    .map((r): ReportTotals => ({
      currency: r.currency,
      count: r.count,
      incomeMinor: r.incomeMinor,
      expenseMinor: r.expenseMinor,
      netMinor: r.incomeMinor - r.expenseMinor,
    }))
    .sort((a, b) => byCurrency(a.currency, b.currency));
}

const zeroTotals = (currency: CurrencyCode): ReportTotals => ({
  currency,
  count: 0,
  incomeMinor: 0n,
  expenseMinor: 0n,
  netMinor: 0n,
});

function lines(rows: repo.BreakdownRow[], currency: CurrencyCode, kind: EntryType) {
  const own = rows.filter((r) => r.currency === currency && r.kind === kind);
  const total = own.reduce((sum, r) => sum + r.amountMinor, 0n);
  return own.map((r): BreakdownLine => ({
    id: r.id,
    name: r.name,
    color: r.color,
    isArchived: r.isArchived,
    amountMinor: r.amountMinor,
    count: r.count,
    sharePercent: percent(r.amountMinor, total),
  }));
}

async function currencyReports(
  user: User,
  filters: ReportFilters,
  period: ReportPeriod,
  granularity: ReturnType<typeof resolveGranularity>["granularity"],
  totals: ReportTotals[],
): Promise<CurrencyReport[]> {
  const query = toQuery(filters, period);
  const [seriesRows, categoryRows, accountRows] = await Promise.all([
    repo.series(user.id, query, granularity),
    repo.breakdown(user.id, query, "category"),
    repo.breakdown(user.id, query, "account"),
  ]);
  const starts = bucketStarts(period.from, period.to, granularity);
  return totals.map((t) => {
    const own = new Map(
      seriesRows.filter((r) => r.currency === t.currency).map((r) => [r.bucket, r]),
    );
    return {
      currency: t.currency,
      totals: t,
      series: starts.map((start) => {
        const row = own.get(start);
        const incomeMinor = row?.incomeMinor ?? 0n;
        const expenseMinor = row?.expenseMinor ?? 0n;
        return {
          start,
          incomeMinor,
          expenseMinor,
          netMinor: incomeMinor - expenseMinor,
          transferCount: row?.transferCount ?? 0,
        };
      }),
      byCategory: {
        INCOME: lines(categoryRows, t.currency, "INCOME"),
        EXPENSE: lines(categoryRows, t.currency, "EXPENSE"),
      },
      byAccount: {
        INCOME: lines(accountRows, t.currency, "INCOME"),
        EXPENSE: lines(accountRows, t.currency, "EXPENSE"),
      },
    };
  });
}

/**
 * Account history: the account's records in date order with a running balance.
 * Opening = balance at the end of the day before the period; closing = balance
 * at the end of its last day (both include the account's opening balance and
 * every record, upcoming ones only when dated within the range). Without
 * type/category filters, opening + money in − money out = closing.
 */
async function accountHistory(
  user: User,
  filters: ReportFilters,
  period: ReportPeriod,
): Promise<AccountHistory | null> {
  if (!filters.accountId) return null;
  const account = await findOwnAccount(user, filters.accountId);
  if (!account) return null;
  const query = { ...toQuery(filters, period), accountId: account.id };
  const [opening, closing, flows, items] = await Promise.all([
    balanceAtEndOf(user, account.id, addDays(period.from, -1)),
    balanceAtEndOf(user, account.id, period.to),
    repo.accountFlows(user.id, query),
    listLedger(user.id, { ...query, sort: "date_asc" }, 1, ACCOUNT_HISTORY_LIMIT + 1),
  ]);
  const showsRunningBalance = !filters.kind && !filters.categoryId;
  let balance = opening;
  const rows = items.slice(0, ACCOUNT_HISTORY_LIMIT).map((item) => {
    const into =
      item.kind === "INCOME" || (item.kind === "TRANSFER" && item.toAccount?.id === account.id);
    const signedMinor = into ? item.amountMinor : -item.amountMinor;
    balance += signedMinor;
    return { ...item, signedMinor, balanceMinor: showsRunningBalance ? balance : null };
  });
  return {
    account,
    openingMinor: opening,
    closingMinor: closing,
    count: flows.count,
    inMinor: flows.inMinor,
    outMinor: flows.outMinor,
    rows,
    truncated: items.length > ACCOUNT_HISTORY_LIMIT,
    showsRunningBalance,
  };
}

/**
 * Budget performance per month of the range (latest BUDGET_MONTHS_MAX months).
 * Budgets are monthly and count expenses on every account in their currency
 * for the whole month (PRD §6.7), so only the currency and category filters
 * apply; archived budgets are included and labelled.
 */
async function budgetPerformance(
  user: User,
  filters: ReportFilters,
  period: ReportPeriod,
): Promise<BudgetPerformance> {
  const first = monthKeyOf(period.from);
  const last = monthKeyOf(period.to);
  const months: MonthKey[] = [];
  for (let m = last; m >= first && months.length < BUDGET_MONTHS_MAX; m = shiftMonth(m, -1)) {
    months.push(m);
  }
  const truncated = months.length === BUDGET_MONTHS_MAX && shiftMonth(months.at(-1)!, -1) >= first;
  const budgets = (await listBudgetsInMonths(user, months)).filter(
    (b) =>
      (!filters.currency || b.currency === filters.currency) &&
      (!filters.categoryId || b.category.id === filters.categoryId),
  );
  return {
    truncated,
    months: months.map((month) => {
      const own = budgets.filter((b) => b.month === month);
      const currencies = [...new Set(own.map((b) => b.currency))].sort(byCurrency);
      return {
        month,
        budgets: own,
        totals: currencies.map((currency) => {
          const active = own.filter((b) => b.currency === currency && !b.isArchived);
          const limitMinor = active.reduce((s, b) => s + b.limitMinor, 0n);
          const spentMinor = active.reduce((s, b) => s + b.spentMinor, 0n);
          return {
            currency,
            limitMinor,
            spentMinor,
            remainingMinor: limitMinor - spentMinor,
            usagePercent: budgetUsage(limitMinor, spentMinor, 100).usagePercent,
            overCount: active.filter((b) => b.status === "over").length,
          };
        }),
      };
    }),
  };
}

function compareLines(
  current: repo.BreakdownRow[],
  previous: repo.BreakdownRow[],
  currency: CurrencyCode,
  kind: EntryType,
): ComparisonLine[] {
  const map = new Map<string, ComparisonLine>();
  const add = (rows: repo.BreakdownRow[], key: "currentMinor" | "previousMinor") => {
    for (const r of rows) {
      if (r.currency !== currency || r.kind !== kind) continue;
      const line = map.get(r.id) ?? {
        id: r.id,
        name: r.name,
        isArchived: r.isArchived,
        currentMinor: 0n,
        previousMinor: 0n,
      };
      line[key] += r.amountMinor;
      map.set(r.id, line);
    }
  };
  add(current, "currentMinor");
  add(previous, "previousMinor");
  return [...map.values()].sort((a, b) =>
    a.currentMinor === b.currentMinor
      ? a.previousMinor === b.previousMinor
        ? a.name.localeCompare(b.name)
        : a.previousMinor > b.previousMinor
          ? -1
          : 1
      : a.currentMinor > b.currentMinor
        ? -1
        : 1,
  );
}

async function comparison(
  user: User,
  filters: ReportFilters,
  period: ReportPeriod,
  currentTotals: ReportTotals[],
): Promise<Comparison> {
  const prev = previousPeriod(period);
  const [previousTotals, currentRows, previousRows] = await Promise.all([
    totalsFor(user.id, toQuery(filters, prev)),
    repo.breakdown(user.id, toQuery(filters, period), "category"),
    repo.breakdown(user.id, toQuery(filters, prev), "category"),
  ]);
  const currencies = [
    ...new Set([...currentTotals, ...previousTotals].map((t) => t.currency)),
  ].sort(byCurrency);
  return {
    previous: prev,
    currencies: currencies.map((currency) => ({
      currency,
      current: currentTotals.find((t) => t.currency === currency) ?? zeroTotals(currency),
      previous: previousTotals.find((t) => t.currency === currency) ?? zeroTotals(currency),
      expenseCategories: compareLines(currentRows, previousRows, currency, "EXPENSE"),
      incomeCategories: compareLines(currentRows, previousRows, currency, "INCOME"),
    })),
  };
}

/** Builds the requested report. Only the selected tab's extra queries run. */
export async function getReport(user: User, filters: ReportFilters): Promise<Report> {
  const today = todayInTimeZone(user.timezone);
  const period = resolveReportPeriod(filters, today);
  const { granularity, adjusted } = resolveGranularity(filters.granularity, period);
  const totals = await totalsFor(user.id, toQuery(filters, period));
  const tab = filters.report;
  const usesSeries =
    tab === "income" || tab === "expenses" || tab === "categories" || tab === "cash-flow";

  const [currencies, history, budgets, compare] = await Promise.all([
    usesSeries ? currencyReports(user, filters, period, granularity, totals) : [],
    tab === "account" ? accountHistory(user, filters, period) : null,
    tab === "budgets" ? budgetPerformance(user, filters, period) : null,
    tab === "compare" ? comparison(user, filters, period, totals) : null,
  ]);

  return {
    tab,
    period,
    today,
    granularity,
    granularityAdjusted: adjusted,
    totals,
    currencies,
    accountHistory: history,
    budgets,
    comparison: compare,
  };
}
