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

/**
 * Never touches `currency`. Returns the number of rows changed (0 = not this
 * user's). Locks the row (FOR UPDATE, like archiving) and refuses archived
 * accounts, so an edit can never put money on an account that is archived —
 * even when an archive commits at the same moment (QA-02).
 */
export async function updateAccount(
  userId: string,
  id: string,
  data: { name: string; type: AccountType; openingBalanceMinor: bigint },
  verify: (account: { name: string; isArchived: boolean }) => void,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ name: string; is_archived: boolean }[]>`
      SELECT name, is_archived FROM accounts
      WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
      FOR UPDATE`;
    const row = rows[0];
    if (!row) return 0;
    verify({ name: row.name, isArchived: row.is_archived });
    const { count } = await tx.financialAccount.updateMany({
      where: { id, userId },
      data: { name: data.name, type: data.type, openingBalanceMinor: data.openingBalanceMinor },
    });
    return count;
  });
}

export async function setArchived(userId: string, id: string, archived: boolean): Promise<number> {
  const { count } = await prisma.financialAccount.updateMany({
    where: { id, userId },
    data: { isArchived: archived, archivedAt: archived ? new Date() : null },
  });
  return count;
}

export type ArchiveOutcome =
  | { status: "not_found" | "already_archived" | "archived" }
  | { status: "has_balance"; balanceMinor: bigint; projectedBalanceMinor: bigint };

/**
 * Archive only if the balance is zero, decided under a row lock. Ledger writes
 * hold FOR SHARE on the accounts they touch, so FOR UPDATE here waits for them
 * to commit, and any write that starts later sees the account as archived.
 */
export function archiveIfSettled(
  userId: string,
  id: string,
  asOf: IsoDate,
): Promise<ArchiveOutcome> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ is_archived: boolean }[]>`
        SELECT is_archived FROM accounts
        WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
        FOR UPDATE`;
      const row = rows[0];
      if (!row) return { status: "not_found" } as const;
      if (row.is_archived) return { status: "already_archived" } as const;
      const [current, projected] = await Promise.all([
        computeBalances(userId, asOf, id, tx),
        computeBalances(userId, null, id, tx),
      ]);
      const balanceMinor = current.get(id) ?? 0n;
      const projectedBalanceMinor = projected.get(id) ?? 0n;
      if (balanceMinor !== 0n || projectedBalanceMinor !== 0n) {
        return { status: "has_balance", balanceMinor, projectedBalanceMinor } as const;
      }
      await tx.financialAccount.update({
        where: { id, userId },
        data: { isArchived: true, archivedAt: new Date() },
      });
      return { status: "archived" } as const;
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

/**
 * Delete only while nothing references the account, decided under a row lock
 * (so a record cannot be added between the check and the delete).
 * Returns null when the account does not exist, otherwise the reference count.
 */
export function deleteIfUnused(userId: string, id: string): Promise<number | null> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM accounts WHERE id = ${id}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
      if (rows.length === 0) return null;
      const refs = await countAccountReferences(userId, id, tx);
      if (refs.total > 0) return refs.total;
      await tx.financialAccount.delete({ where: { id, userId } });
      return 0;
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

/** Records that reference the account. Any of them means the account has history. */
export async function countAccountReferences(
  userId: string,
  id: string,
  db: Prisma.TransactionClient = prisma,
) {
  const [transactions, transfersOut, transfersIn, recurringRules, savingsGoals] = await Promise.all(
    [
      db.transaction.count({ where: { userId, accountId: id } }),
      db.transfer.count({ where: { userId, fromAccountId: id } }),
      db.transfer.count({ where: { userId, toAccountId: id } }),
      db.recurringRule.count({ where: { userId, accountId: id } }),
      db.savingsGoal.count({ where: { userId, accountId: id } }),
    ],
  );
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
  db: Prisma.TransactionClient = prisma,
): Promise<Map<string, bigint>> {
  const dateFilterTx = asOf ? Prisma.sql`AND t.occurred_on <= ${isoDateToDb(asOf)}` : Prisma.empty;
  const dateFilterOut = asOf ? Prisma.sql`AND o.occurred_on <= ${isoDateToDb(asOf)}` : Prisma.empty;
  const dateFilterIn = asOf ? Prisma.sql`AND i.occurred_on <= ${isoDateToDb(asOf)}` : Prisma.empty;
  const accountFilter = accountId ? Prisma.sql`AND a.id = ${accountId}::uuid` : Prisma.empty;

  const rows = await db.$queryRaw<{ id: string; balance: bigint }[]>`
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
