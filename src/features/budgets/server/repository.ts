import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { type IsoDate, dbDateToIso, isoDateToDb } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";
import { prisma } from "@/server/db";
import { ConflictError, NotFoundError } from "@/server/errors";

/**
 * Budget data access, scoped by user id.
 *
 * Spent is always computed in SQL from the transactions table (read-only):
 * expenses in the budget's category, on accounts in the budget's currency,
 * dated within the budget's month (future-dated ones included, PRD §6.7).
 * Income and transfers are excluded by construction (transfers live in their
 * own table; only type = 'EXPENSE' is summed). Every join also matches user_id,
 * so another user's records can never count.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export interface BudgetRow {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  categoryArchived: boolean;
  month: IsoDate;
  currency: CurrencyCode;
  limitMinor: bigint;
  alertThresholdPercent: number;
  archivedAt: Date | null;
  updatedAt: Date;
  spentMinor: bigint;
}

const SPENT = Prisma.sql`
  COALESCE((
    SELECT SUM(t.amount_minor)
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id AND a.user_id = t.user_id
    WHERE t.user_id = b.user_id
      AND t.category_id = b.category_id
      AND t.type = 'EXPENSE'
      AND a.currency = b.currency
      AND t.occurred_on >= b.month
      AND t.occurred_on < (b.month + INTERVAL '1 month')::date
  ), 0)::bigint`;

async function budgetsWithSpent(db: Db, userId: string, where: Prisma.Sql): Promise<BudgetRow[]> {
  const rows = await db.$queryRaw<
    {
      id: string;
      category_id: string;
      category_name: string;
      category_color: string | null;
      category_archived: boolean;
      month: Date;
      currency: CurrencyCode;
      amount_minor: bigint;
      alert_threshold_percent: number;
      archived_at: Date | null;
      updated_at: Date;
      spent: bigint;
    }[]
  >`
    SELECT b.id, b.category_id, c.name AS category_name, c.color AS category_color,
           c.is_archived AS category_archived, b.month, b.currency::text AS currency,
           b.amount_minor, b.alert_threshold_percent, b.archived_at, b.updated_at,
           ${SPENT} AS spent
    FROM budgets b
    JOIN categories c ON c.id = b.category_id AND c.user_id = b.user_id
    WHERE b.user_id = ${userId}::uuid AND ${where}
    ORDER BY c.name ASC, b.currency ASC`;
  return rows.map((r) => ({
    id: r.id,
    categoryId: r.category_id,
    categoryName: r.category_name,
    categoryColor: r.category_color,
    categoryArchived: r.category_archived,
    month: dbDateToIso(r.month),
    currency: r.currency,
    limitMinor: r.amount_minor,
    alertThresholdPercent: r.alert_threshold_percent,
    archivedAt: r.archived_at,
    updatedAt: r.updated_at,
    spentMinor: r.spent,
  }));
}

export function listMonth(userId: string, month: IsoDate): Promise<BudgetRow[]> {
  return budgetsWithSpent(prisma, userId, Prisma.sql`b.month = ${isoDateToDb(month)}`);
}

export async function findBudget(userId: string, id: string): Promise<BudgetRow | null> {
  const rows = await budgetsWithSpent(prisma, userId, Prisma.sql`b.id = ${id}::uuid`);
  return rows[0] ?? null;
}

export interface CategorySpendRow {
  currency: CurrencyCode;
  categoryId: string;
  name: string;
  color: string | null;
  isArchived: boolean;
  spentMinor: bigint;
}

/** Expenses per category and currency in a month (budgeted or not). */
export async function spendingInMonth(
  userId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<CategorySpendRow[]> {
  const rows = await prisma.$queryRaw<
    {
      currency: CurrencyCode;
      category_id: string;
      name: string;
      color: string | null;
      is_archived: boolean;
      spent: bigint;
    }[]
  >`
    SELECT a.currency::text AS currency, c.id AS category_id, c.name, c.color, c.is_archived,
           SUM(t.amount_minor)::bigint AS spent
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id AND a.user_id = t.user_id
    JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id
    WHERE t.user_id = ${userId}::uuid
      AND t.type = 'EXPENSE'
      AND t.occurred_on BETWEEN ${isoDateToDb(from)} AND ${isoDateToDb(to)}
    GROUP BY a.currency, c.id, c.name, c.color, c.is_archived
    ORDER BY spent DESC, c.name ASC`;
  return rows.map((r) => ({
    currency: r.currency,
    categoryId: r.category_id,
    name: r.name,
    color: r.color,
    isArchived: r.is_archived,
    spentMinor: r.spent,
  }));
}

/* ------------------------------------------------------------------------- */
/* Writes                                                                     */
/* ------------------------------------------------------------------------- */

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createBudget(
  userId: string,
  data: {
    categoryId: string;
    currency: CurrencyCode;
    month: IsoDate;
    limitMinor: bigint;
    alertThresholdPercent: number;
  },
): Promise<{ id: string }> {
  try {
    return await prisma.budget.create({
      data: {
        userId,
        categoryId: data.categoryId,
        currency: data.currency,
        month: isoDateToDb(data.month),
        amountMinor: data.limitMinor,
        alertThresholdPercent: data.alertThresholdPercent,
      },
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        "This category already has a budget in this currency for this month. Edit that budget instead.",
      );
    }
    throw error;
  }
}

/** Optimistic concurrency: rejected when the budget changed after the user opened it. */
export async function updateBudget(
  userId: string,
  id: string,
  expectedUpdatedAt: string,
  data: { limitMinor: bigint; alertThresholdPercent: number },
): Promise<void> {
  const { count } = await prisma.budget.updateMany({
    where: { id, userId, updatedAt: new Date(expectedUpdatedAt) },
    data: { amountMinor: data.limitMinor, alertThresholdPercent: data.alertThresholdPercent },
  });
  if (count === 1) return;
  const exists = await prisma.budget.count({ where: { id, userId } });
  if (exists === 0) throw new NotFoundError("We couldn't find that budget.");
  throw new ConflictError(
    "This budget was changed somewhere else after you opened it. Reload to see the latest version.",
  );
}

export async function setArchived(userId: string, id: string, archived: boolean): Promise<number> {
  const { count } = await prisma.budget.updateMany({
    where: { id, userId },
    data: { archivedAt: archived ? new Date() : null },
  });
  return count;
}

export async function deleteBudget(userId: string, id: string): Promise<number> {
  const { count } = await prisma.budget.deleteMany({ where: { id, userId } });
  return count;
}

/**
 * Copy active budgets (limit and threshold) from one month to another, skipping
 * archived categories and budgets that already exist in the target month.
 * Returns the ids created.
 */
export async function copyMonth(userId: string, from: IsoDate, to: IsoDate): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO budgets (id, user_id, category_id, category_type, month, currency, amount_minor,
                         alert_threshold_percent, updated_at)
    SELECT gen_random_uuid(), b.user_id, b.category_id, b.category_type, ${isoDateToDb(to)},
           b.currency, b.amount_minor, b.alert_threshold_percent, now()
    FROM budgets b
    JOIN categories c ON c.id = b.category_id AND c.user_id = b.user_id
    WHERE b.user_id = ${userId}::uuid
      AND b.month = ${isoDateToDb(from)}
      AND b.archived_at IS NULL
      AND c.is_archived = false
    ON CONFLICT (user_id, category_id, month, currency) DO NOTHING
    RETURNING id`;
  return rows.map((r) => r.id);
}

/** How many budgets copyMonth would create. */
export async function countCopyable(userId: string, from: IsoDate, to: IsoDate): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM budgets b
    JOIN categories c ON c.id = b.category_id AND c.user_id = b.user_id
    WHERE b.user_id = ${userId}::uuid
      AND b.month = ${isoDateToDb(from)}
      AND b.archived_at IS NULL
      AND c.is_archived = false
      AND NOT EXISTS (
        SELECT 1 FROM budgets x
        WHERE x.user_id = b.user_id AND x.category_id = b.category_id
          AND x.currency = b.currency AND x.month = ${isoDateToDb(to)}
      )`;
  return rows[0]?.n ?? 0;
}

/* ------------------------------------------------------------------------- */
/* Alerts                                                                     */
/* ------------------------------------------------------------------------- */

export interface BudgetKey {
  categoryId: string;
  currency: CurrencyCode;
  /** First day of the month. */
  month: IsoDate;
}

/** Ids of the user's budgets matching any of the keys. */
export async function budgetIdsForKeys(userId: string, keys: BudgetKey[]): Promise<string[]> {
  if (keys.length === 0) return [];
  const rows = await prisma.budget.findMany({
    where: {
      userId,
      OR: keys.map((k) => ({
        categoryId: k.categoryId,
        currency: k.currency,
        month: isoDateToDb(k.month),
      })),
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Bring a budget's alerts in line with its current spending, under a per-budget
 * advisory lock (evaluations of the same budget run one at a time and each sees
 * every committed record):
 * - a threshold now reached gets an alert, created at most once — the unique
 *   (budget_id, threshold_percent) index makes duplicates impossible; an alert
 *   that had been resolved is re-activated silently (no new notification);
 * - an alert whose threshold is no longer reached, no longer configured, or
 *   whose budget is archived is marked resolved (kept, not deleted).
 * `decide` returns the thresholds currently reached for the budget.
 */
export async function syncAlerts(
  userId: string,
  budgetId: string,
  decide: (budget: BudgetRow) => number[],
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${budgetId}, 0))`;
      const budget = (await budgetsWithSpent(tx, userId, Prisma.sql`b.id = ${budgetId}::uuid`))[0];
      if (!budget) return;
      const reached = budget.archivedAt ? [] : decide(budget);
      for (const threshold of reached) {
        await tx.$executeRaw`
          INSERT INTO budget_alerts (id, user_id, budget_id, threshold_percent, spent_minor)
          VALUES (gen_random_uuid(), ${userId}::uuid, ${budgetId}::uuid, ${threshold}, ${budget.spentMinor})
          ON CONFLICT (budget_id, threshold_percent)
          DO UPDATE SET resolved_at = NULL WHERE budget_alerts.resolved_at IS NOT NULL`;
      }
      await tx.budgetAlert.updateMany({
        where: {
          userId,
          budgetId,
          resolvedAt: null,
          ...(reached.length > 0 ? { thresholdPercent: { notIn: reached } } : {}),
        },
        data: { resolvedAt: new Date() },
      });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

const alertSelect = {
  id: true,
  budgetId: true,
  thresholdPercent: true,
  spentMinor: true,
  createdAt: true,
  readAt: true,
  budget: {
    select: {
      month: true,
      currency: true,
      amountMinor: true,
      category: { select: { name: true } },
    },
  },
} as const;

/** Active (unresolved) alerts, newest first. */
export function listActiveAlerts(userId: string, take: number, unreadOnly = false) {
  return prisma.budgetAlert.findMany({
    where: { userId, resolvedAt: null, ...(unreadOnly ? { readAt: null } : {}) },
    orderBy: [{ createdAt: "desc" }, { thresholdPercent: "desc" }],
    take,
    select: alertSelect,
  });
}

export function countUnreadAlerts(userId: string): Promise<number> {
  return prisma.budgetAlert.count({ where: { userId, resolvedAt: null, readAt: null } });
}

export async function markAlertsRead(userId: string, ids?: string[]): Promise<number> {
  const { count } = await prisma.budgetAlert.updateMany({
    where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return count;
}

/** Active alerts for some budgets (to show next to them). */
export function alertsForBudgets(userId: string, budgetIds: string[]) {
  return prisma.budgetAlert.findMany({
    where: { userId, budgetId: { in: budgetIds }, resolvedAt: null },
    select: { budgetId: true, thresholdPercent: true },
  });
}
