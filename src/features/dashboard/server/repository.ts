import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { type IsoDate, dbDateToIso, isoDateToDb } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";
import { prisma } from "@/server/db";

import type { Bucket } from "../constants";

/**
 * Dashboard aggregations, computed in PostgreSQL (never by loading records).
 * Read-only access to the transactions table, scoped by user id. Transfers live
 * in their own table and are therefore never part of these income/expense
 * figures. Records on archived accounts are included: history is never dropped.
 * The currency of a record is its account's currency.
 */

export interface CategorySpendRow {
  currency: CurrencyCode;
  categoryId: string;
  name: string;
  color: string | null;
  isArchived: boolean;
  amountMinor: bigint;
}

/** Expenses per category and currency within [from, to]. */
export async function spendingByCategory(
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
      amount: bigint;
    }[]
  >`
    SELECT a.currency::text AS currency, c.id AS category_id, c.name, c.color, c.is_archived,
           SUM(t.amount_minor)::bigint AS amount
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id AND a.user_id = t.user_id
    JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id
    WHERE t.user_id = ${userId}::uuid
      AND t.type = 'EXPENSE'
      AND t.occurred_on BETWEEN ${isoDateToDb(from)} AND ${isoDateToDb(to)}
    GROUP BY a.currency, c.id, c.name, c.color, c.is_archived
    ORDER BY amount DESC, c.name ASC`;
  return rows.map((r) => ({
    currency: r.currency,
    categoryId: r.category_id,
    name: r.name,
    color: r.color,
    isArchived: r.is_archived,
    amountMinor: r.amount,
  }));
}

export interface CashFlowRow {
  currency: CurrencyCode;
  bucket: IsoDate;
  incomeMinor: bigint;
  expenseMinor: bigint;
}

const TRUNC: Record<Bucket, Prisma.Sql> = {
  day: Prisma.sql`t.occurred_on`,
  week: Prisma.sql`date_trunc('week', t.occurred_on)::date`,
  month: Prisma.sql`date_trunc('month', t.occurred_on)::date`,
};

/** Income and expenses per currency and day/week/month within [from, to]. Empty buckets are absent. */
export async function cashFlow(
  userId: string,
  from: IsoDate,
  to: IsoDate,
  bucket: Bucket,
): Promise<CashFlowRow[]> {
  const rows = await prisma.$queryRaw<
    { currency: CurrencyCode; bucket: Date; income: bigint; expense: bigint }[]
  >`
    SELECT a.currency::text AS currency, ${TRUNC[bucket]} AS bucket,
           COALESCE(SUM(t.amount_minor) FILTER (WHERE t.type = 'INCOME'), 0)::bigint AS income,
           COALESCE(SUM(t.amount_minor) FILTER (WHERE t.type = 'EXPENSE'), 0)::bigint AS expense
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id AND a.user_id = t.user_id
    WHERE t.user_id = ${userId}::uuid
      AND t.occurred_on BETWEEN ${isoDateToDb(from)} AND ${isoDateToDb(to)}
    GROUP BY 1, 2
    ORDER BY 2`;
  return rows.map((r) => ({
    currency: r.currency,
    bucket: dbDateToIso(r.bucket),
    incomeMinor: r.income,
    expenseMinor: r.expense,
  }));
}
