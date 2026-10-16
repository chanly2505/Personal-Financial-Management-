import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { IsoDate } from "@/lib/dates";
import { isoDateToDb } from "@/lib/dates";
import { prisma } from "@/server/db";

import type { AccountType } from "../constants";

/**
 * Account data access. Every query is scoped by the session user's id;
 * mutations use updateMany/deleteMany with { id, userId } so an id belonging
 * to someone else matches zero rows.
 */

const accountSelect = {
  id: true,
  name: true,
  type: true,
  currency: true,
  openingBalanceMinor: true,
  isArchived: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type AccountRow = Prisma.FinancialAccountGetPayload<{ select: typeof accountSelect }>;

export function listAccounts(userId: string): Promise<AccountRow[]> {
  return prisma.financialAccount.findMany({
    where: { userId },
    select: accountSelect,
    orderBy: [{ isArchived: "asc" }, { createdAt: "asc" }],
  });
}

export function findAccount(userId: string, id: string): Promise<AccountRow | null> {
  return prisma.financialAccount.findFirst({ where: { id, userId }, select: accountSelect });
}

/** Case-insensitive name lookup, optionally ignoring one account (when renaming it). */
export function findAccountByName(userId: string, name: string, excludeId?: string) {
  return prisma.financialAccount.findFirst({
    where: {
      userId,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, isArchived: true },
  });
}

export function createAccount(
  userId: string,
  data: { name: string; type: AccountType; currency: "USD" | "KHR"; openingBalanceMinor: bigint },
) {
  return prisma.financialAccount.create({
    data: {
      userId,
      name: data.name,
      type: data.type,
      currency: data.currency,
      openingBalanceMinor: data.openingBalanceMinor,
    },
    select: accountSelect,
  });
}

/** Never touches `currency`. Returns the number of rows changed (0 = not this user's). */
export async function updateAccount(
  userId: string,
  id: string,
  data: { name: string; type: AccountType; openingBalanceMinor: bigint },
): Promise<number> {
  const { count } = await prisma.financialAccount.updateMany({
    where: { id, userId },
    data: { name: data.name, type: data.type, openingBalanceMinor: data.openingBalanceMinor },
  });
  return count;
}

export async function setArchived(userId: string, id: string, archived: boolean): Promise<number> {
  const { count } = await prisma.financialAccount.updateMany({
    where: { id, userId },
    data: { isArchived: archived, archivedAt: archived ? new Date() : null },
  });
  return count;
}

export async function deleteAccount(userId: string, id: string): Promise<number> {
  const { count } = await prisma.financialAccount.deleteMany({ where: { id, userId } });
  return count;
}

/** Records that reference the account. Any of them means the account has history. */
export async function countAccountReferences(userId: string, id: string) {
  const [transactions, transfersOut, transfersIn, recurringRules, savingsGoals] =
    await prisma.$transaction([
      prisma.transaction.count({ where: { userId, accountId: id } }),
      prisma.transfer.count({ where: { userId, fromAccountId: id } }),
      prisma.transfer.count({ where: { userId, toAccountId: id } }),
      prisma.recurringRule.count({ where: { userId, accountId: id } }),
      prisma.savingsGoal.count({ where: { userId, accountId: id } }),
    ]);
  return {
    transactions: transactions + transfersOut + transfersIn,
    recurringRules,
    savingsGoals,
    total: transactions + transfersOut + transfersIn + recurringRules + savingsGoals,
  };
}

/**
 * Derived balances (docs/PRD.md §6.2), computed exactly in SQL:
 *   opening + income − expenses − transfers out (amount sent) + transfers in (amount received)
 * `asOf` limits records to that calendar date (inclusive); null = all records,
 * including future-dated ones (the "projected" balance).
 *
 * This is the one place the accounts module reads the transactions/transfers
 * tables — read-only, for aggregation (docs/ARCHITECTURE.md §4).
 */
export async function computeBalances(
  userId: string,
  asOf: IsoDate | null,
  accountId?: string,
): Promise<Map<string, bigint>> {
  const dateFilterTx = asOf ? Prisma.sql`AND t.occurred_on <= ${isoDateToDb(asOf)}` : Prisma.empty;
  const dateFilterOut = asOf ? Prisma.sql`AND o.occurred_on <= ${isoDateToDb(asOf)}` : Prisma.empty;
  const dateFilterIn = asOf ? Prisma.sql`AND i.occurred_on <= ${isoDateToDb(asOf)}` : Prisma.empty;
  const accountFilter = accountId ? Prisma.sql`AND a.id = ${accountId}::uuid` : Prisma.empty;

  const rows = await prisma.$queryRaw<{ id: string; balance: bigint }[]>`
    SELECT a.id,
      (a.opening_balance_minor
        + COALESCE((SELECT SUM(CASE WHEN t.type = 'INCOME' THEN t.amount_minor ELSE -t.amount_minor END)
                    FROM transactions t
                    WHERE t.account_id = a.id AND t.user_id = a.user_id ${dateFilterTx}), 0)
        - COALESCE((SELECT SUM(o.from_amount_minor) FROM transfers o
                    WHERE o.from_account_id = a.id AND o.user_id = a.user_id ${dateFilterOut}), 0)
        + COALESCE((SELECT SUM(i.to_amount_minor) FROM transfers i
                    WHERE i.to_account_id = a.id AND i.user_id = a.user_id ${dateFilterIn}), 0)
      )::bigint AS balance
    FROM accounts a
    WHERE a.user_id = ${userId}::uuid ${accountFilter}`;

  return new Map(rows.map((row) => [row.id, row.balance]));
}
