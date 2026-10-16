import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { type IsoDate, dbDateToIso, isoDateToDb } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";
import { prisma } from "@/server/db";
import { ConflictError, NotFoundError } from "@/server/errors";

/**
 * Savings goals, scoped by user id. Saved amounts are computed in SQL from
 * contributions. Contributions are earmarks (Q-7 A): this module never writes
 * to accounts, transactions or transfers, so balances are unaffected.
 */

type Tx = Prisma.TransactionClient;

export interface GoalRow {
  id: string;
  name: string;
  currency: CurrencyCode;
  targetMinor: bigint;
  targetDate: IsoDate | null;
  note: string | null;
  isArchived: boolean;
  updatedAt: Date;
  account: { id: string; name: string; isArchived: boolean } | null;
  savedMinor: bigint;
  contributionCount: number;
}

async function goalsWhere(userId: string, where: Prisma.Sql): Promise<GoalRow[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      name: string;
      currency: CurrencyCode;
      target_amount_minor: bigint;
      target_date: Date | null;
      note: string | null;
      is_archived: boolean;
      updated_at: Date;
      account_id: string | null;
      account_name: string | null;
      account_archived: boolean | null;
      saved: bigint;
      contributions: number;
    }[]
  >`
    SELECT g.id, g.name, g.currency::text AS currency, g.target_amount_minor, g.target_date, g.note,
           g.is_archived, g.updated_at, a.id AS account_id, a.name AS account_name,
           a.is_archived AS account_archived,
           COALESCE(SUM(c.amount_minor), 0)::bigint AS saved,
           COUNT(c.id)::int AS contributions
    FROM savings_goals g
    LEFT JOIN accounts a ON a.id = g.account_id AND a.user_id = g.user_id
    LEFT JOIN savings_contributions c ON c.goal_id = g.id AND c.user_id = g.user_id
    WHERE g.user_id = ${userId}::uuid AND ${where}
    GROUP BY g.id, a.id
    ORDER BY g.is_archived ASC, g.target_date ASC NULLS LAST, g.name ASC`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    currency: r.currency,
    targetMinor: r.target_amount_minor,
    targetDate: r.target_date ? dbDateToIso(r.target_date) : null,
    note: r.note,
    isArchived: r.is_archived,
    updatedAt: r.updated_at,
    account:
      r.account_id && r.account_name
        ? { id: r.account_id, name: r.account_name, isArchived: r.account_archived ?? false }
        : null,
    savedMinor: r.saved,
    contributionCount: r.contributions,
  }));
}

export function listGoals(userId: string): Promise<GoalRow[]> {
  return goalsWhere(userId, Prisma.sql`TRUE`);
}

export async function findGoal(userId: string, id: string): Promise<GoalRow | null> {
  return (await goalsWhere(userId, Prisma.sql`g.id = ${id}::uuid`))[0] ?? null;
}

export function findGoalByName(userId: string, name: string, excludeId?: string) {
  return prisma.savingsGoal.findFirst({
    where: {
      userId,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, isArchived: true },
  });
}

export interface GoalWrite {
  name: string;
  currency: CurrencyCode;
  targetMinor: bigint;
  targetDate: IsoDate | null;
  accountId: string | null;
  note: string | null;
}

function goalData(d: GoalWrite) {
  return {
    name: d.name,
    currency: d.currency,
    targetAmountMinor: d.targetMinor,
    targetDate: d.targetDate ? isoDateToDb(d.targetDate) : null,
    accountId: d.accountId,
    note: d.note,
  };
}

export function createGoal(userId: string, data: GoalWrite) {
  return prisma.savingsGoal.create({ data: { userId, ...goalData(data) }, select: { id: true } });
}

/** The currency of a goal with contributions is fixed (the service passes the existing one). */
export async function updateGoal(
  userId: string,
  id: string,
  expectedUpdatedAt: string,
  data: GoalWrite,
) {
  const { count } = await prisma.savingsGoal.updateMany({
    where: { id, userId, updatedAt: new Date(expectedUpdatedAt) },
    data: goalData(data),
  });
  if (count === 1) return;
  if ((await prisma.savingsGoal.count({ where: { id, userId } })) === 0) {
    throw new NotFoundError("We couldn't find that goal.");
  }
  throw new ConflictError(
    "This goal was changed somewhere else after you opened it. Reload to see the latest version.",
  );
}

export async function setArchived(userId: string, id: string, archived: boolean): Promise<number> {
  const { count } = await prisma.savingsGoal.updateMany({
    where: { id, userId },
    data: { isArchived: archived, archivedAt: archived ? new Date() : null },
  });
  return count;
}

/** Deletes the goal and its contributions (earmarks only — no money moves). */
export async function deleteGoal(userId: string, id: string): Promise<number> {
  const { count } = await prisma.savingsGoal.deleteMany({ where: { id, userId } });
  return count;
}

/* ------------------------------------------------------------------------- */
/* Contributions                                                              */
/* ------------------------------------------------------------------------- */

export function listContributions(userId: string, goalId: string, take: number) {
  return prisma.savingsContribution.findMany({
    where: { userId, goalId },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
    take,
    select: { id: true, amountMinor: true, occurredOn: true, note: true, createdAt: true },
  });
}

/** Lock the goal row and return its archived flag and current saved total. */
async function lockGoal(tx: Tx, userId: string, goalId: string) {
  const rows = await tx.$queryRaw<{ is_archived: boolean }[]>`
    SELECT is_archived FROM savings_goals
    WHERE id = ${goalId}::uuid AND user_id = ${userId}::uuid
    FOR UPDATE`;
  const goal = rows[0];
  if (!goal) throw new NotFoundError("We couldn't find that goal.");
  const [{ saved }] = (await tx.$queryRaw<{ saved: bigint }[]>`
    SELECT COALESCE(SUM(amount_minor), 0)::bigint AS saved
    FROM savings_contributions WHERE goal_id = ${goalId}::uuid AND user_id = ${userId}::uuid`) as [
    { saved: bigint },
  ];
  return { isArchived: goal.is_archived, savedMinor: saved };
}

export type VerifyChange = (state: { isArchived: boolean; savedMinor: bigint }) => void;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Add a contribution (+) or withdrawal (−) under the goal's row lock, so two
 * concurrent withdrawals cannot both pass the "never below zero" check.
 * Idempotent on `clientRequestId`.
 */
export async function addContribution(
  userId: string,
  goalId: string,
  data: { amountMinor: bigint; occurredOn: IsoDate; note: string | null; clientRequestId: string },
  verify: VerifyChange,
): Promise<{ id: string; created: boolean }> {
  const find = () =>
    prisma.savingsContribution.findUnique({
      where: { userId_clientRequestId: { userId, clientRequestId: data.clientRequestId } },
      select: { id: true },
    });
  const existing = await find();
  if (existing) return { id: existing.id, created: false };
  try {
    return await prisma.$transaction(
      async (tx) => {
        verify(await lockGoal(tx, userId, goalId));
        const row = await tx.savingsContribution.create({
          data: {
            userId,
            goalId,
            amountMinor: data.amountMinor,
            occurredOn: isoDateToDb(data.occurredOn),
            note: data.note,
            clientRequestId: data.clientRequestId,
          },
          select: { id: true },
        });
        return { id: row.id, created: true };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await find();
      if (winner) return { id: winner.id, created: false };
    }
    throw error;
  }
}

/** Remove a contribution under the goal's row lock (the total must stay ≥ 0). */
export async function deleteContribution(
  userId: string,
  goalId: string,
  contributionId: string,
  verify: (state: { isArchived: boolean; savedMinor: bigint; amountMinor: bigint }) => void,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const state = await lockGoal(tx, userId, goalId);
    const row = await tx.savingsContribution.findFirst({
      where: { id: contributionId, goalId, userId },
      select: { amountMinor: true },
    });
    if (!row) throw new NotFoundError("We couldn't find that contribution.");
    verify({ ...state, amountMinor: row.amountMinor });
    await tx.savingsContribution.delete({ where: { id: contributionId } });
  });
}

/** Total currently earmarked by active goals, per linked account. */
export async function earmarkedByAccount(userId: string): Promise<Map<string, bigint>> {
  const rows = await prisma.$queryRaw<{ account_id: string; saved: bigint }[]>`
    SELECT g.account_id, COALESCE(SUM(c.amount_minor), 0)::bigint AS saved
    FROM savings_goals g
    JOIN savings_contributions c ON c.goal_id = g.id AND c.user_id = g.user_id
    WHERE g.user_id = ${userId}::uuid AND g.account_id IS NOT NULL AND NOT g.is_archived
    GROUP BY g.account_id`;
  return new Map(rows.map((r) => [r.account_id, r.saved]));
}
