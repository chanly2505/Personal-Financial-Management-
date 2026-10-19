import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { dbDateToIso } from "@/lib/dates";
import { type CurrencyCode, minorToDecimalString } from "@/lib/money";
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { describeError, logger } from "@/server/logger";

/**
 * "Download all my data" (Settings → Your data): every record the user owns as
 * one JSON file, so they can keep a copy or move elsewhere — e.g. before
 * deleting the account.
 *
 * - Scope: only the session user's rows (every query filters by user id).
 * - Excluded: password hash, session version, reset tokens, rate-limit
 *   counters, idempotency keys, budget-warning and recurring-run bookkeeping.
 * - Amounts: exact decimal strings in each record's currency ("12.50",
 *   "41000") plus the currency code; dates "YYYY-MM-DD"; times ISO 8601 UTC.
 * - Consistency (FIN-7): everything is read in one read-only REPEATABLE READ
 *   transaction, so every part of the file shows the same moment even if the
 *   user edits something during the download. The file is assembled inside it
 *   (ledger rows in batches; a personal ledger is a few MB) and then sent.
 */

const BATCH = 1_000;
const amount = (minor: bigint, currency: CurrencyCode) => minorToDecimalString(minor, currency);
const day = (date: Date | null) => (date ? dbDateToIso(date) : null);

type Db = Prisma.TransactionClient;

async function snapshot(db: Db, userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      baseCurrency: true,
      timezone: true,
      dateFormat: true,
      numberFormat: true,
      currencyDisplay: true,
      budgetAlertMode: true,
      defaultAlertThreshold: true,
      createdAt: true,
    },
  });
  if (!user) throw new NotFoundError();
  const where = { userId };
  const [accounts, categories, budgets, rules, goals] = await Promise.all([
    db.financialAccount.findMany({ where, orderBy: { createdAt: "asc" } }),
    db.category.findMany({ where, orderBy: { createdAt: "asc" } }),
    db.budget.findMany({ where, orderBy: [{ month: "asc" }, { createdAt: "asc" }] }),
    db.recurringRule.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: { account: { select: { currency: true } } },
    }),
    db.savingsGoal.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: { contributions: { orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }] } },
    }),
  ]);
  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  return {
    currencyOf,
    head: {
      format: "personal-finance-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      notes:
        "Amounts are exact decimal strings in the currency given next to them; nothing is converted. Dates are YYYY-MM-DD calendar dates.",
      profile: user,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        openingBalance: amount(a.openingBalanceMinor, a.currency),
        isArchived: a.isArchived,
        createdAt: a.createdAt,
      })),
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        color: c.color,
        isArchived: c.isArchived,
      })),
      budgets: budgets.map((b) => ({
        id: b.id,
        categoryId: b.categoryId,
        month: day(b.month)!.slice(0, 7),
        currency: b.currency,
        limit: amount(b.amountMinor, b.currency),
        alertThresholdPercent: b.alertThresholdPercent,
        isArchived: b.archivedAt !== null,
      })),
      recurringRules: rules.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        accountId: r.accountId,
        categoryId: r.categoryId,
        amount: amount(r.amountMinor, r.account.currency),
        currency: r.account.currency,
        payee: r.payee,
        description: r.description,
        frequency: r.frequency,
        interval: r.interval,
        startOn: day(r.startOn),
        endOn: day(r.endOn),
        nextOccurrenceOn: day(r.nextOccurrenceOn),
        status: r.status,
      })),
      savingsGoals: goals.map((g) => ({
        id: g.id,
        name: g.name,
        currency: g.currency,
        target: amount(g.targetAmountMinor, g.currency),
        targetDate: day(g.targetDate),
        accountId: g.accountId,
        note: g.note,
        isArchived: g.isArchived,
        contributions: g.contributions.map((c) => ({
          id: c.id,
          amount: amount(c.amountMinor, g.currency),
          occurredOn: day(c.occurredOn),
          note: c.note,
        })),
      })),
    },
  };
}

/** Streams `"key":[…]` for one ledger table, in id order (keyset pagination). */
async function* ledgerSection(
  db: Db,
  key: "transactions" | "transfers",
  userId: string,
  currencyOf: Map<string, CurrencyCode>,
): AsyncGenerator<string> {
  yield `,"${key}":[`;
  let cursor: string | undefined;
  let first = true;
  for (;;) {
    const page =
      key === "transactions"
        ? (
            await db.transaction.findMany({
              where: { userId, ...(cursor ? { id: { gt: cursor } } : {}) },
              orderBy: { id: "asc" },
              take: BATCH,
            })
          ).map((t) => ({
            id: t.id,
            type: t.type,
            date: day(t.occurredOn),
            amount: amount(t.amountMinor, currencyOf.get(t.accountId)!),
            currency: currencyOf.get(t.accountId)!,
            accountId: t.accountId,
            categoryId: t.categoryId,
            payee: t.payee,
            note: t.note,
            recurringRuleId: t.recurringRuleId,
            createdAt: t.createdAt,
          }))
        : (
            await db.transfer.findMany({
              where: { userId, ...(cursor ? { id: { gt: cursor } } : {}) },
              orderBy: { id: "asc" },
              take: BATCH,
            })
          ).map((r) => ({
            id: r.id,
            date: day(r.occurredOn),
            amount: amount(r.fromAmountMinor, currencyOf.get(r.fromAccountId)!),
            currency: currencyOf.get(r.fromAccountId)!,
            // Both sides, so the file stays complete if cross-currency transfers arrive (FIN-7).
            toAmount: amount(r.toAmountMinor, currencyOf.get(r.toAccountId)!),
            toCurrency: currencyOf.get(r.toAccountId)!,
            fromAccountId: r.fromAccountId,
            toAccountId: r.toAccountId,
            note: r.note,
            reversesTransferId: r.reversesTransferId,
            createdAt: r.createdAt,
          }));
    if (page.length === 0) break;
    yield page.map((row) => (first ? ((first = false), "") : ",") + JSON.stringify(row)).join("");
    cursor = page[page.length - 1]!.id;
    if (page.length < BATCH) break;
  }
  yield "]";
}

export async function prepareDataExport(user: { id: string }) {
  let file: { parts: string[]; exportedAt: string };
  try {
    file = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const { head, currencyOf } = await snapshot(tx, user.id);
        // The object without its closing brace, then the ledger arrays.
        const parts = [JSON.stringify(head).slice(0, -1)];
        for await (const chunk of ledgerSection(tx, "transfers", user.id, currencyOf)) {
          parts.push(chunk);
        }
        for await (const chunk of ledgerSection(tx, "transactions", user.id, currencyOf)) {
          parts.push(chunk);
        }
        parts.push("}");
        return { parts, exportedAt: head.exportedAt };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 10_000,
        timeout: 60_000,
      },
    );
  } catch (error) {
    logger.error("data_export.failed", { userId: user.id, ...describeError(error) });
    throw error;
  }
  const encoder = new TextEncoder();
  let next = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const part = file.parts[next++];
      if (part === undefined) {
        logger.info("data_export.finished", { userId: user.id });
        controller.close();
      } else controller.enqueue(encoder.encode(part));
    },
  });
  return { stream, filename: `personal-finance-data-${file.exportedAt.slice(0, 10)}.json` };
}
