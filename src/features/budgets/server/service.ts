import "server-only";

import { assertCategoryUsable } from "@/features/categories/server/service";
import { dbDateToIso, todayInTimeZone } from "@/lib/dates";
import { type CurrencyCode, parseMoney } from "@/lib/money";
import type { CurrentUser } from "@/server/auth/session";
import { NotFoundError, ValidationError } from "@/server/errors";
import { describeError, logger } from "@/server/logger";

import { MIN_MONTH } from "../constants";
import { type MonthKey, monthEnd, monthKeyOf, monthStart, shiftMonth } from "../month";
import type {
  BudgetAlertView,
  BudgetMonth,
  BudgetView,
  CategorySpendLine,
  CurrencyBudgetTotals,
} from "../types";
import { alertThresholds, budgetUsage, hasReached } from "../usage";
import * as repo from "./repository";

/**
 * Budget rules (docs/PRD.md §6.7):
 * - a budget is (expense category, month, currency, limit > 0) — one per
 *   category, month and currency; monthly only (no custom periods, §6.7);
 * - spent = expenses in the category, on accounts in the budget's currency,
 *   dated in the month; income and transfers never count; refunds are not a
 *   separate concept yet (Q-3): a refund recorded as income does not reduce spent;
 * - remaining = limit − spent; usage = ⌊spent × 100 ÷ limit⌋, may exceed 100 %;
 * - warnings at the budget's threshold and at 100 %, at most once per budget;
 * - archived budgets are kept for history but hidden from the month and never warn;
 * - new budgets need an active expense category; months from 2000-01 up to a
 *   year ahead.
 */

type User = Pick<CurrentUser, "id" | "timezone">;

const CURRENCY_ORDER: CurrencyCode[] = ["USD", "KHR"];
const NOT_FOUND = "We couldn't find that budget.";

export function currentMonth(user: Pick<CurrentUser, "timezone">): MonthKey {
  return monthKeyOf(todayInTimeZone(user.timezone));
}

function assertMonthAllowed(user: User, month: MonthKey) {
  const latest = shiftMonth(currentMonth(user), 12);
  if (month < MIN_MONTH || month > latest) {
    const message = "Choose a month from January 2000 up to a year ahead.";
    throw new ValidationError(message, { month: message });
  }
}

function parseLimit(input: string, currency: CurrencyCode): bigint {
  const result = parseMoney(input, currency);
  if (!result.ok) throw new ValidationError(result.error, { amount: result.error });
  return result.minor;
}

function toView(row: repo.BudgetRow): BudgetView {
  const usage = budgetUsage(row.limitMinor, row.spentMinor, row.alertThresholdPercent);
  return {
    id: row.id,
    month: monthKeyOf(row.month),
    currency: row.currency,
    category: {
      id: row.categoryId,
      name: row.categoryName,
      color: row.categoryColor,
      isArchived: row.categoryArchived,
    },
    limitMinor: row.limitMinor,
    spentMinor: row.spentMinor,
    remainingMinor: usage.remainingMinor,
    usagePercent: usage.usagePercent,
    status: usage.status,
    alertThresholdPercent: row.alertThresholdPercent,
    isArchived: row.archivedAt !== null,
    updatedAt: row.updatedAt,
  };
}

/** Thresholds a budget has currently reached (empty for archived budgets). */
function reachedThresholds(row: repo.BudgetRow): number[] {
  if (row.archivedAt) return [];
  return alertThresholds(row.alertThresholdPercent).filter((t) =>
    hasReached(row.spentMinor, row.limitMinor, t),
  );
}

/* ------------------------------------------------------------------------- */
/* Alerts                                                                     */
/* ------------------------------------------------------------------------- */

async function syncBudgets(userId: string, budgetIds: string[]) {
  for (const id of new Set(budgetIds)) await repo.syncAlerts(userId, id, reachedThresholds);
}

/**
 * Called after an expense is created, edited or deleted (old and new values),
 * so the affected budgets' warnings reflect the new totals immediately.
 * Best effort: a failure is logged and the budgets page reconciles on view, so
 * it never fails the user's transaction.
 */
export async function syncAlertsForExpenses(userId: string, keys: repo.BudgetKey[]): Promise<void> {
  try {
    const unique = [
      ...new Map(keys.map((k) => [`${k.categoryId}|${k.currency}|${k.month}`, k])).values(),
    ];
    await syncBudgets(userId, await repo.budgetIdsForKeys(userId, unique));
  } catch (error) {
    logger.error("budgets.alert_sync_failed", describeError(error));
  }
}

/** Safety net on view: re-sync only budgets whose stored alerts differ from their spending. */
async function reconcile(userId: string, rows: repo.BudgetRow[]) {
  if (rows.length === 0) return;
  const stored = await repo.alertsForBudgets(
    userId,
    rows.map((r) => r.id),
  );
  const byBudget = new Map<string, number[]>();
  for (const a of stored)
    byBudget.set(a.budgetId, [...(byBudget.get(a.budgetId) ?? []), a.thresholdPercent]);
  const stale = rows.filter((row) => {
    const expected = reachedThresholds(row).join(",");
    const actual = (byBudget.get(row.id) ?? []).sort((a, b) => a - b).join(",");
    return expected !== actual;
  });
  await syncBudgets(
    userId,
    stale.map((r) => r.id),
  );
}

function toAlertView(
  row: Awaited<ReturnType<typeof repo.listActiveAlerts>>[number],
): BudgetAlertView {
  return {
    id: row.id,
    budgetId: row.budgetId,
    month: monthKeyOf(dbDateToIso(row.budget.month)),
    categoryName: row.budget.category.name,
    currency: row.budget.currency,
    thresholdPercent: row.thresholdPercent,
    limitMinor: row.budget.amountMinor,
    spentAtAlertMinor: row.spentMinor,
    createdAt: row.createdAt,
    isRead: row.readAt !== null,
  };
}

export async function getAlertsSummary(
  user: Pick<CurrentUser, "id">,
  take: number,
): Promise<{ unread: number; alerts: BudgetAlertView[] }> {
  const [unread, rows] = await Promise.all([
    repo.countUnreadAlerts(user.id),
    repo.listActiveAlerts(user.id, take),
  ]);
  return { unread, alerts: rows.map(toAlertView) };
}

/**
 * For the header bell on every page: never let warnings take the app down.
 * On failure (e.g. a database without the latest migrations) the bell is
 * hidden and the cause is logged, so signing in and every other page still work.
 */
export async function getAlertsSummaryOrNull(user: Pick<CurrentUser, "id">, take: number) {
  try {
    return await getAlertsSummary(user, take);
  } catch (error) {
    // P2021: "table does not exist" (also surfaced as TableDoesNotExist by the driver adapter).
    const details = error as { code?: unknown; message?: unknown };
    const missingTable =
      details?.code === "P2021" || String(details?.message ?? "").includes("TableDoesNotExist");
    logger.error("budgets.alerts_unavailable", {
      ...describeError(error),
      ...(missingTable && { hint: "Database is missing tables. Run: npm run db:deploy" }),
    });
    return null;
  }
}

export function markAlertsRead(user: Pick<CurrentUser, "id">, ids?: string[]) {
  return repo.markAlertsRead(user.id, ids);
}

/* ------------------------------------------------------------------------- */
/* Reading                                                                    */
/* ------------------------------------------------------------------------- */

export async function getBudgetMonth(user: User, requested?: string): Promise<BudgetMonth> {
  const current = currentMonth(user);
  const month = (requested && requested >= MIN_MONTH ? requested : current) as MonthKey;
  const previous = shiftMonth(month, -1);

  const [rows, spending, copyableCount] = await Promise.all([
    repo.listMonth(user.id, monthStart(month)),
    repo.spendingInMonth(user.id, monthStart(month), monthEnd(month)),
    repo.countCopyable(user.id, monthStart(previous), monthStart(month)),
  ]);
  await reconcile(user.id, rows);

  const views = rows.map(toView);
  const active = views.filter((b) => !b.isArchived);
  const archived = views.filter((b) => b.isArchived);
  const budgetFor = new Map(active.map((b) => [`${b.category.id}|${b.currency}`, b.id]));

  const currencies = [
    ...new Set<CurrencyCode>([
      ...active.map((b) => b.currency),
      ...spending.map((s) => s.currency),
    ]),
  ].sort((a, b) => CURRENCY_ORDER.indexOf(a) - CURRENCY_ORDER.indexOf(b));

  const totals: CurrencyBudgetTotals[] = currencies.map((currency) => {
    const own = active.filter((b) => b.currency === currency);
    const limitMinor = own.reduce((s, b) => s + b.limitMinor, 0n);
    const spentMinor = own.reduce((s, b) => s + b.spentMinor, 0n);
    const unbudgetedMinor = spending
      .filter((s) => s.currency === currency && !budgetFor.has(`${s.categoryId}|${currency}`))
      .reduce((s, r) => s + r.spentMinor, 0n);
    const usage = budgetUsage(limitMinor, spentMinor, 100);
    return {
      currency,
      limitMinor,
      spentMinor,
      remainingMinor: limitMinor - spentMinor,
      usagePercent: usage.usagePercent,
      unbudgetedMinor,
      overCount: own.filter((b) => b.status === "over").length,
      warningCount: own.filter((b) => b.status === "warning" || b.status === "reached").length,
    };
  });

  return {
    month,
    currentMonth: current,
    active,
    archived,
    totals,
    spending: currencies.map((currency) => ({
      currency,
      lines: spending
        .filter((s) => s.currency === currency)
        .map((s): CategorySpendLine => ({
          categoryId: s.categoryId,
          name: s.name,
          color: s.color,
          isArchived: s.isArchived,
          spentMinor: s.spentMinor,
          budgetId: budgetFor.get(`${s.categoryId}|${currency}`) ?? null,
        })),
    })),
    copyableCount,
  };
}

export async function getBudget(user: Pick<CurrentUser, "id">, id: string): Promise<BudgetView> {
  const row = await repo.findBudget(user.id, id);
  if (!row) throw new NotFoundError(NOT_FOUND);
  return toView(row);
}

/* ------------------------------------------------------------------------- */
/* Writes                                                                     */
/* ------------------------------------------------------------------------- */

export async function createBudget(
  user: User,
  input: {
    categoryId: string;
    currency: CurrencyCode;
    month: string;
    amount: string;
    alertThresholdPercent: number;
  },
): Promise<{ id: string }> {
  const month = input.month as MonthKey;
  assertMonthAllowed(user, month);
  const limitMinor = parseLimit(input.amount, input.currency);
  await assertCategoryUsable(user, input.categoryId, "EXPENSE");
  const { id } = await repo.createBudget(user.id, {
    categoryId: input.categoryId,
    currency: input.currency,
    month: monthStart(month),
    limitMinor,
    alertThresholdPercent: input.alertThresholdPercent,
  });
  await syncBudgets(user.id, [id]);
  return { id };
}

export async function updateBudget(
  user: Pick<CurrentUser, "id">,
  input: { id: string; amount: string; alertThresholdPercent: number; expectedUpdatedAt: string },
): Promise<void> {
  const existing = await repo.findBudget(user.id, input.id);
  if (!existing) throw new NotFoundError(NOT_FOUND);
  const limitMinor = parseLimit(input.amount, existing.currency);
  await repo.updateBudget(user.id, input.id, input.expectedUpdatedAt, {
    limitMinor,
    alertThresholdPercent: input.alertThresholdPercent,
  });
  await syncBudgets(user.id, [input.id]);
}

export async function archiveBudget(user: Pick<CurrentUser, "id">, id: string): Promise<void> {
  if ((await repo.setArchived(user.id, id, true)) === 0) throw new NotFoundError(NOT_FOUND);
  await syncBudgets(user.id, [id]);
}

export async function restoreBudget(user: Pick<CurrentUser, "id">, id: string): Promise<void> {
  if ((await repo.setArchived(user.id, id, false)) === 0) throw new NotFoundError(NOT_FOUND);
  await syncBudgets(user.id, [id]);
}

/** Permanently removes the budget and its alerts. Expense records are untouched. */
export async function deleteBudget(user: Pick<CurrentUser, "id">, id: string): Promise<void> {
  if ((await repo.deleteBudget(user.id, id)) === 0) throw new NotFoundError(NOT_FOUND);
}

/** Copy last month's active budgets into `month` (existing ones are kept). */
export async function copyPreviousMonth(
  user: User,
  monthInput: string,
): Promise<{ created: number }> {
  const month = monthInput as MonthKey;
  assertMonthAllowed(user, month);
  const ids = await repo.copyMonth(user.id, monthStart(shiftMonth(month, -1)), monthStart(month));
  await syncBudgets(user.id, ids);
  return { created: ids.length };
}

/**
 * This month's active budgets in brief, for the dashboard: per currency, the
 * total limit and spent, and how many budgets are near or over their limit.
 */
export async function getCurrentMonthSummary(user: User) {
  const month = currentMonth(user);
  const views = (await repo.listMonth(user.id, monthStart(month)))
    .map(toView)
    .filter((b) => !b.isArchived);
  const currencies = [...new Set(views.map((b) => b.currency))].sort(
    (a, b) => CURRENCY_ORDER.indexOf(a) - CURRENCY_ORDER.indexOf(b),
  );
  return {
    month,
    budgetCount: views.length,
    currencies: currencies.map((currency) => {
      const own = views.filter((b) => b.currency === currency);
      const limitMinor = own.reduce((s, b) => s + b.limitMinor, 0n);
      const spentMinor = own.reduce((s, b) => s + b.spentMinor, 0n);
      return {
        currency,
        limitMinor,
        spentMinor,
        usagePercent: budgetUsage(limitMinor, spentMinor, 100).usagePercent,
        overCount: own.filter((b) => b.status === "over").length,
        nearCount: own.filter((b) => b.status === "warning" || b.status === "reached").length,
      };
    }),
    /** The budgets that need attention first. */
    attention: views
      .filter((b) => b.status !== "on_track")
      .sort((a, b) => (b.usagePercent ?? 0) - (a.usagePercent ?? 0))
      .slice(0, 3),
  };
}
