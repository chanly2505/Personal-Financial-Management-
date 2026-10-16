import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
  type LedgerQuery,
  ledgerCte,
  ledgerWhere,
} from "@/features/transactions/server/repository";
import { type IsoDate, dbDateToIso } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";
import { prisma } from "@/server/db";

import type { Granularity } from "../constants";

/**
 * Report aggregations, computed in PostgreSQL over the same ledger relation and
 * WHERE clause as the /transactions list and the CSV export — so a report and
 * its source rows can never use different filter rules. Read-only; every query
 * is scoped by the session user's id. Amounts are grouped by currency and never
 * added across currencies.
 */

type Query = Omit<LedgerQuery, "sort">;

const TRUNC: Record<Granularity, Prisma.Sql> = {
  day: Prisma.sql`occurred_on`,
  week: Prisma.sql`date_trunc('week', occurred_on)::date`,
  month: Prisma.sql`date_trunc('month', occurred_on)::date`,
  year: Prisma.sql`date_trunc('year', occurred_on)::date`,
};

export interface SeriesRow {
  currency: CurrencyCode;
  bucket: IsoDate;
  incomeMinor: bigint;
  expenseMinor: bigint;
  transferCount: number;
}

/** Income, expenses and the number of transfers per currency and bucket. Empty buckets are absent. */
export async function series(
  userId: string,
  query: Query,
  granularity: Granularity,
): Promise<SeriesRow[]> {
  const rows = await prisma.$queryRaw<
    { currency: CurrencyCode; bucket: Date; income: bigint; expense: bigint; transfers: number }[]
  >`
    ${ledgerCte(userId)}
    SELECT currency, ${TRUNC[granularity]} AS bucket,
           COALESCE(SUM(amount_minor) FILTER (WHERE kind = 'INCOME'), 0)::bigint AS income,
           COALESCE(SUM(amount_minor) FILTER (WHERE kind = 'EXPENSE'), 0)::bigint AS expense,
           COUNT(*) FILTER (WHERE kind = 'TRANSFER')::int AS transfers
    FROM ledger
    ${ledgerWhere(query)}
    GROUP BY 1, 2
    ORDER BY 2`;
  return rows.map((r) => ({
    currency: r.currency,
    bucket: dbDateToIso(r.bucket),
    incomeMinor: r.income,
    expenseMinor: r.expense,
    transferCount: r.transfers,
  }));
}

export interface BreakdownRow {
  currency: CurrencyCode;
  kind: "INCOME" | "EXPENSE";
  id: string;
  name: string;
  color: string | null;
  isArchived: boolean;
  amountMinor: bigint;
  count: number;
}

const BREAKDOWN_COLUMNS: Record<"category" | "account", Prisma.Sql> = {
  category: Prisma.sql`category_id, category_name, category_color, category_archived`,
  account: Prisma.sql`account_id, account_name, NULL::text, FALSE`,
};

/** Income and expense totals per category (or account) and currency. Transfers are excluded. */
export async function breakdown(
  userId: string,
  query: Query,
  by: "category" | "account",
): Promise<BreakdownRow[]> {
  const rows = await prisma.$queryRaw<
    {
      currency: CurrencyCode;
      kind: "INCOME" | "EXPENSE";
      id: string;
      name: string;
      color: string | null;
      is_archived: boolean;
      amount: bigint;
      count: number;
    }[]
  >`
    ${ledgerCte(userId)}
    SELECT currency, kind, id, name, color, is_archived,
           SUM(amount_minor)::bigint AS amount, COUNT(*)::int AS count
    FROM (
      SELECT currency, kind, amount_minor, ${BREAKDOWN_COLUMNS[by]}
      FROM ledger
      ${ledgerWhere(query, [Prisma.sql`kind <> 'TRANSFER'`])}
    ) AS l(currency, kind, amount_minor, id, name, color, is_archived)
    GROUP BY currency, kind, id, name, color, is_archived
    ORDER BY amount DESC, name ASC`;
  return rows.map((r) => ({
    currency: r.currency,
    kind: r.kind,
    id: r.id,
    name: r.name,
    color: r.color,
    isArchived: r.is_archived,
    amountMinor: r.amount,
    count: r.count,
  }));
}

/** Money into and out of one account over the matching records (transfers count by direction). */
export async function accountFlows(
  userId: string,
  query: Query & { accountId: string },
): Promise<{ count: number; inMinor: bigint; outMinor: bigint }> {
  const rows = await prisma.$queryRaw<{ count: number; inflow: bigint; outflow: bigint }[]>`
    ${ledgerCte(userId)}
    SELECT COUNT(*)::int AS count,
           COALESCE(SUM(amount_minor) FILTER (
             WHERE kind = 'INCOME'
                OR (kind = 'TRANSFER' AND to_account_id = ${query.accountId}::uuid)), 0)::bigint AS inflow,
           COALESCE(SUM(amount_minor) FILTER (
             WHERE kind = 'EXPENSE'
                OR (kind = 'TRANSFER' AND account_id = ${query.accountId}::uuid)), 0)::bigint AS outflow
    FROM ledger
    ${ledgerWhere(query)}`;
  const row = rows[0];
  return {
    count: row?.count ?? 0,
    inMinor: row?.inflow ?? 0n,
    outMinor: row?.outflow ?? 0n,
  };
}
