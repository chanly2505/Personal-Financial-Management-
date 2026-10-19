import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { type IsoDate, dbDateToIso, isoDateToDb } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";
import { prisma } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

import { type EntryType, type LedgerKind, type LedgerSort, PAGE_SIZE } from "../constants";
import type { EntryDetail, LedgerItem, TransferDetail } from "../types";

/**
 * Ledger data access. Every query is scoped by the session user's id.
 *
 * Writes run in one database transaction that first locks the accounts they
 * touch (FOR SHARE, in id order so concurrent writers never deadlock). Archiving
 * an account takes FOR UPDATE on the same row, so a record can never be added to
 * an account while it is being archived, and the archive check always sees every
 * committed record. The service passes `verify` callbacks that re-check its rules
 * against the locked rows, so a rule checked before the lock cannot go stale.
 */

type Tx = Prisma.TransactionClient;

const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 } as const;

export interface LockedAccount {
  id: string;
  name: string;
  currency: CurrencyCode;
  isArchived: boolean;
}

export type VerifyAccounts = (accounts: Map<string, LockedAccount>) => void;

async function lockAccounts(tx: Tx, userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const rows = await tx.$queryRaw<
    { id: string; name: string; currency: CurrencyCode; is_archived: boolean }[]
  >`
    SELECT id, name, currency::text AS currency, is_archived
    FROM accounts
    WHERE user_id = ${userId}::uuid AND id = ANY(${unique}::uuid[])
    ORDER BY id
    FOR SHARE`;
  return new Map(
    rows.map((r) => [
      r.id,
      { id: r.id, name: r.name, currency: r.currency, isArchived: r.is_archived },
    ]),
  );
}

export const ARCHIVED_CATEGORY = "This category is archived. Choose another, or restore it first.";

/**
 * Re-check, under a row lock, that a newly chosen category is still active.
 * Archiving updates the row, so it waits for this write (or this write sees it
 * archived); a record can no longer slip into a just-archived category (FIN-3).
 */
async function lockActiveCategory(tx: Tx, userId: string, categoryId: string) {
  const rows = await tx.$queryRaw<{ is_archived: boolean }[]>`
    SELECT is_archived FROM categories
    WHERE user_id = ${userId}::uuid AND id = ${categoryId}::uuid
    FOR SHARE`;
  if (!rows[0] || rows[0].is_archived) {
    throw new ValidationError(ARCHIVED_CATEGORY, { categoryId: ARCHIVED_CATEGORY });
  }
}

/** Unlocked read of the user's accounts (for checks before a write starts). */
export async function findAccounts(userId: string, ids: string[]) {
  const rows = await prisma.financialAccount.findMany({
    where: { userId, id: { in: [...new Set(ids)] } },
    select: { id: true, name: true, currency: true, isArchived: true },
  });
  return new Map<string, LockedAccount>(rows.map((r) => [r.id, r]));
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function sameVersion(actual: Date, expected: string): boolean {
  return actual.getTime() === new Date(expected).getTime();
}

const STALE =
  "This record was changed somewhere else after you opened it. Reload to see the latest version.";

/* ------------------------------------------------------------------------- */
/* Income and expenses                                                        */
/* ------------------------------------------------------------------------- */

export interface EntryWrite {
  type: EntryType;
  accountId: string;
  categoryId: string;
  amountMinor: bigint;
  occurredOn: IsoDate;
  payee: string | null;
  note: string | null;
}

function entryData(data: EntryWrite) {
  return {
    type: data.type,
    accountId: data.accountId,
    categoryId: data.categoryId,
    amountMinor: data.amountMinor,
    occurredOn: isoDateToDb(data.occurredOn),
    payee: data.payee,
    note: data.note,
  };
}

function findEntryByRequest(userId: string, clientRequestId: string) {
  return prisma.transaction.findUnique({
    where: { userId_clientRequestId: { userId, clientRequestId } },
    select: { id: true },
  });
}

/**
 * Idempotent: a second submission with the same `clientRequestId` returns the
 * first record instead of creating another — also when both arrive at once
 * (the unique index decides; the loser re-reads the winner's row).
 */
export async function createEntry(
  userId: string,
  clientRequestId: string,
  data: EntryWrite,
  verify: VerifyAccounts,
): Promise<{ id: string; created: boolean }> {
  const existing = await findEntryByRequest(userId, clientRequestId);
  if (existing) return { id: existing.id, created: false };
  try {
    return await prisma.$transaction(async (tx) => {
      verify(await lockAccounts(tx, userId, [data.accountId]));
      await lockActiveCategory(tx, userId, data.categoryId);
      const row = await tx.transaction.create({
        data: { userId, clientRequestId, ...entryData(data) },
        select: { id: true },
      });
      return { id: row.id, created: true };
    }, TX_OPTIONS);
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await findEntryByRequest(userId, clientRequestId);
      if (winner) return { id: winner.id, created: false };
    }
    throw error;
  }
}

async function lockEntry(tx: Tx, userId: string, id: string) {
  const rows = await tx.$queryRaw<{ account_id: string; updated_at: Date }[]>`
    SELECT account_id, updated_at FROM transactions
    WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
    FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new NotFoundError("We couldn't find that transaction.");
  return row;
}

/**
 * Optimistic concurrency: fails with ConflictError when the record changed
 * after the user loaded it. `verify` sees both the old and the new account.
 */
export async function updateEntry(
  userId: string,
  id: string,
  expectedUpdatedAt: string,
  data: EntryWrite,
  verify: VerifyAccounts,
  /** True when the edit picks a different category (keeping an archived one is allowed). */
  categoryChanged = true,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await lockEntry(tx, userId, id);
    if (!sameVersion(current.updated_at, expectedUpdatedAt)) throw new ConflictError(STALE);
    verify(await lockAccounts(tx, userId, [current.account_id, data.accountId]));
    if (categoryChanged) await lockActiveCategory(tx, userId, data.categoryId);
    await tx.transaction.update({ where: { id, userId }, data: entryData(data) });
  }, TX_OPTIONS);
}

export async function deleteEntry(userId: string, id: string, verify: VerifyAccounts) {
  await prisma.$transaction(async (tx) => {
    const current = await lockEntry(tx, userId, id);
    verify(await lockAccounts(tx, userId, [current.account_id]));
    await tx.transaction.delete({ where: { id, userId } });
  }, TX_OPTIONS);
}

export async function findEntry(userId: string, id: string): Promise<EntryDetail | null> {
  const row = await prisma.transaction.findFirst({
    where: { id, userId },
    select: {
      id: true,
      type: true,
      amountMinor: true,
      occurredOn: true,
      payee: true,
      note: true,
      recurringRule: { select: { id: true, name: true } },
      createdAt: true,
      updatedAt: true,
      account: { select: { id: true, name: true, currency: true, isArchived: true } },
      category: { select: { id: true, name: true, color: true, isArchived: true } },
    },
  });
  if (!row) return null;
  return {
    kind: row.type,
    id: row.id,
    type: row.type,
    amountMinor: row.amountMinor,
    currency: row.account.currency,
    occurredOn: dbDateToIso(row.occurredOn),
    payee: row.payee,
    note: row.note,
    account: { id: row.account.id, name: row.account.name, isArchived: row.account.isArchived },
    category: row.category,
    recurringRule: row.recurringRule,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/* ------------------------------------------------------------------------- */
/* Transfers                                                                  */
/* ------------------------------------------------------------------------- */

export interface TransferWrite {
  fromAccountId: string;
  toAccountId: string;
  /** Same-currency only (v1): both legs carry this amount. */
  amountMinor: bigint;
  occurredOn: IsoDate;
  note: string | null;
}

function transferData(data: TransferWrite) {
  return {
    fromAccountId: data.fromAccountId,
    toAccountId: data.toAccountId,
    fromAmountMinor: data.amountMinor,
    toAmountMinor: data.amountMinor,
    occurredOn: isoDateToDb(data.occurredOn),
    note: data.note,
  };
}

function findTransferByRequest(userId: string, clientRequestId: string) {
  return prisma.transfer.findUnique({
    where: { userId_clientRequestId: { userId, clientRequestId } },
    select: { id: true },
  });
}

/** One row holds both legs, so a transfer is atomic by construction. Idempotent like createEntry. */
export async function createTransfer(
  userId: string,
  clientRequestId: string,
  data: TransferWrite,
  verify: VerifyAccounts,
): Promise<{ id: string; created: boolean }> {
  const existing = await findTransferByRequest(userId, clientRequestId);
  if (existing) return { id: existing.id, created: false };
  try {
    return await prisma.$transaction(async (tx) => {
      verify(await lockAccounts(tx, userId, [data.fromAccountId, data.toAccountId]));
      const row = await tx.transfer.create({
        data: { userId, clientRequestId, ...transferData(data) },
        select: { id: true },
      });
      return { id: row.id, created: true };
    }, TX_OPTIONS);
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await findTransferByRequest(userId, clientRequestId);
      if (winner) return { id: winner.id, created: false };
    }
    throw error;
  }
}

export interface LockedTransfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amountMinor: bigint;
  occurredOn: IsoDate;
  updatedAt: Date;
  reversesTransferId: string | null;
  reversedByTransferId: string | null;
}

async function lockTransfer(tx: Tx, userId: string, id: string): Promise<LockedTransfer> {
  const rows = await tx.$queryRaw<
    {
      id: string;
      from_account_id: string;
      to_account_id: string;
      from_amount_minor: bigint;
      occurred_on: Date;
      updated_at: Date;
      reverses_transfer_id: string | null;
    }[]
  >`
    SELECT id, from_account_id, to_account_id, from_amount_minor, occurred_on, updated_at,
           reverses_transfer_id
    FROM transfers
    WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
    FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new NotFoundError("We couldn't find that transfer.");
  // Read after the lock, so a reversal committed meanwhile is visible.
  const reversal = await tx.transfer.findFirst({
    where: { userId, reversesTransferId: id },
    select: { id: true },
  });
  return {
    id: row.id,
    fromAccountId: row.from_account_id,
    toAccountId: row.to_account_id,
    amountMinor: row.from_amount_minor,
    occurredOn: dbDateToIso(row.occurred_on),
    updatedAt: row.updated_at,
    reversesTransferId: row.reverses_transfer_id,
    reversedByTransferId: reversal?.id ?? null,
  };
}

export type VerifyTransfer = (transfer: LockedTransfer) => void;

export async function updateTransfer(
  userId: string,
  id: string,
  expectedUpdatedAt: string,
  data: TransferWrite,
  verifyTransfer: VerifyTransfer,
  verify: VerifyAccounts,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await lockTransfer(tx, userId, id);
    if (!sameVersion(current.updatedAt, expectedUpdatedAt)) throw new ConflictError(STALE);
    verifyTransfer(current);
    verify(
      await lockAccounts(tx, userId, [
        current.fromAccountId,
        current.toAccountId,
        data.fromAccountId,
        data.toAccountId,
      ]),
    );
    await tx.transfer.update({ where: { id, userId }, data: transferData(data) });
  }, TX_OPTIONS);
}

export async function deleteTransfer(
  userId: string,
  id: string,
  verifyTransfer: VerifyTransfer,
  verify: VerifyAccounts,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await lockTransfer(tx, userId, id);
    verifyTransfer(current);
    verify(await lockAccounts(tx, userId, [current.fromAccountId, current.toAccountId]));
    await tx.transfer.delete({ where: { id, userId } });
  }, TX_OPTIONS);
}

/**
 * Creates the opposite transfer (same amount, accounts swapped) linked to the
 * original. The original row is locked, so two reversals cannot both succeed;
 * the unique index on reverses_transfer_id backs this up.
 */
export async function reverseTransfer(
  userId: string,
  id: string,
  clientRequestId: string,
  data: { occurredOn: IsoDate; note: string | null },
  verifyTransfer: VerifyTransfer,
  verify: VerifyAccounts,
): Promise<{ id: string; created: boolean }> {
  const existing = await findTransferByRequest(userId, clientRequestId);
  if (existing) return { id: existing.id, created: false };
  try {
    return await prisma.$transaction(async (tx) => {
      const original = await lockTransfer(tx, userId, id);
      verifyTransfer(original);
      verify(await lockAccounts(tx, userId, [original.fromAccountId, original.toAccountId]));
      const row = await tx.transfer.create({
        data: {
          userId,
          clientRequestId,
          reversesTransferId: original.id,
          ...transferData({
            fromAccountId: original.toAccountId,
            toAccountId: original.fromAccountId,
            amountMinor: original.amountMinor,
            // Never before the original: reversing a future-dated transfer must
            // not move today's balances (QA-04).
            occurredOn:
              original.occurredOn > data.occurredOn ? original.occurredOn : data.occurredOn,
            note: data.note,
          }),
        },
        select: { id: true },
      });
      return { id: row.id, created: true };
    }, TX_OPTIONS);
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await findTransferByRequest(userId, clientRequestId);
      if (winner) return { id: winner.id, created: false };
      throw new ConflictError("This transfer has already been reversed.");
    }
    throw error;
  }
}

export async function findTransfer(userId: string, id: string): Promise<TransferDetail | null> {
  const row = await prisma.transfer.findFirst({
    where: { id, userId },
    select: {
      id: true,
      fromAmountMinor: true,
      occurredOn: true,
      note: true,
      reversesTransferId: true,
      createdAt: true,
      updatedAt: true,
      fromAccount: { select: { id: true, name: true, currency: true, isArchived: true } },
      toAccount: { select: { id: true, name: true, isArchived: true } },
      reversedBy: { select: { id: true } },
    },
  });
  if (!row) return null;
  return {
    kind: "TRANSFER",
    id: row.id,
    amountMinor: row.fromAmountMinor,
    currency: row.fromAccount.currency,
    occurredOn: dbDateToIso(row.occurredOn),
    note: row.note,
    fromAccount: {
      id: row.fromAccount.id,
      name: row.fromAccount.name,
      isArchived: row.fromAccount.isArchived,
    },
    toAccount: row.toAccount,
    reversesTransferId: row.reversesTransferId,
    reversedByTransferId: row.reversedBy?.id ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/* ------------------------------------------------------------------------- */
/* Ledger listing                                                             */
/* ------------------------------------------------------------------------- */

export interface LedgerQuery {
  q?: string;
  kind?: LedgerKind;
  accountId?: string;
  categoryId?: string;
  from?: IsoDate;
  to?: IsoDate;
  /** Inclusive bounds in minor units, per currency (the same typed amount differs by currency). */
  min?: Record<CurrencyCode, bigint>;
  max?: Record<CurrencyCode, bigint>;
  /** Only records whose account uses this currency. */
  currency?: CurrencyCode;
  sort: LedgerSort;
}

/** Escape LIKE wildcards so user input is matched literally. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** The ledger as one relation (income, expenses and transfers), scoped to `userId`. */
export function ledgerCte(userId: string) {
  return Prisma.sql`
    WITH ledger AS (
      SELECT t.id, t.type::text AS kind, t.amount_minor, a.currency::text AS currency,
             t.occurred_on, t.created_at, t.payee, t.note,
             t.account_id, a.name AS account_name,
             t.category_id, c.name AS category_name, c.color AS category_color,
             c.is_archived AS category_archived,
             NULL::uuid AS to_account_id, NULL::text AS to_account_name,
             NULL::uuid AS reverses_id, NULL::uuid AS reversed_by_id
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id AND a.user_id = t.user_id
      JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id
      WHERE t.user_id = ${userId}::uuid
      UNION ALL
      SELECT r.id, 'TRANSFER', r.from_amount_minor, fa.currency::text,
             r.occurred_on, r.created_at, NULL, r.note,
             r.from_account_id, fa.name,
             NULL, NULL, NULL, NULL,
             r.to_account_id, ta.name,
             r.reverses_transfer_id,
             (SELECT x.id FROM transfers x
              WHERE x.reverses_transfer_id = r.id AND x.user_id = r.user_id)
      FROM transfers r
      JOIN accounts fa ON fa.id = r.from_account_id AND fa.user_id = r.user_id
      JOIN accounts ta ON ta.id = r.to_account_id AND ta.user_id = r.user_id
      WHERE r.user_id = ${userId}::uuid
    )`;
}

function amountBound(op: ">=" | "<=", bounds: Record<CurrencyCode, bigint>) {
  const cmp = Prisma.raw(op);
  return Prisma.sql`((currency = 'USD' AND amount_minor ${cmp} ${bounds.USD})
    OR (currency = 'KHR' AND amount_minor ${cmp} ${bounds.KHR}))`;
}

/** WHERE clause for the ledger CTE (shared by the list, totals, reports and CSV export). */
export function ledgerWhere(query: Omit<LedgerQuery, "sort">, extra: Prisma.Sql[] = []) {
  const conditions: Prisma.Sql[] = [...extra];
  if (query.currency) conditions.push(Prisma.sql`currency = ${query.currency}`);
  if (query.kind) conditions.push(Prisma.sql`kind = ${query.kind}`);
  if (query.accountId) {
    conditions.push(
      Prisma.sql`(account_id = ${query.accountId}::uuid OR to_account_id = ${query.accountId}::uuid)`,
    );
  }
  if (query.categoryId) conditions.push(Prisma.sql`category_id = ${query.categoryId}::uuid`);
  if (query.from) conditions.push(Prisma.sql`occurred_on >= ${isoDateToDb(query.from)}`);
  if (query.to) conditions.push(Prisma.sql`occurred_on <= ${isoDateToDb(query.to)}`);
  if (query.min) conditions.push(amountBound(">=", query.min));
  if (query.max) conditions.push(amountBound("<=", query.max));
  if (query.q) {
    const pattern = likePattern(query.q);
    conditions.push(Prisma.sql`(payee ILIKE ${pattern} ESCAPE '\\'
      OR note ILIKE ${pattern} ESCAPE '\\'
      OR category_name ILIKE ${pattern} ESCAPE '\\'
      OR account_name ILIKE ${pattern} ESCAPE '\\'
      OR to_account_name ILIKE ${pattern} ESCAPE '\\')`);
  }
  return conditions.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
    : Prisma.empty;
}

const ORDER_BY: Record<LedgerSort, Prisma.Sql> = {
  date_desc: Prisma.sql`ORDER BY occurred_on DESC, created_at DESC, id DESC`,
  date_asc: Prisma.sql`ORDER BY occurred_on ASC, created_at ASC, id ASC`,
  // Amounts in different currencies are not comparable, so group by currency first.
  amount_desc: Prisma.sql`ORDER BY currency DESC, amount_minor DESC, occurred_on DESC, id DESC`,
  amount_asc: Prisma.sql`ORDER BY currency DESC, amount_minor ASC, occurred_on DESC, id DESC`,
};

export interface LedgerTotalsRow {
  currency: CurrencyCode;
  count: number;
  incomeMinor: bigint;
  expenseMinor: bigint;
}

/** Count and income/expense totals per currency over every matching record. */
export async function summarizeLedger(
  userId: string,
  query: Omit<LedgerQuery, "sort">,
): Promise<LedgerTotalsRow[]> {
  const rows = await prisma.$queryRaw<
    { currency: CurrencyCode; count: number; income: bigint; expense: bigint }[]
  >`
    ${ledgerCte(userId)}
    SELECT currency,
           COUNT(*)::int AS count,
           COALESCE(SUM(amount_minor) FILTER (WHERE kind = 'INCOME'), 0)::bigint AS income,
           COALESCE(SUM(amount_minor) FILTER (WHERE kind = 'EXPENSE'), 0)::bigint AS expense
    FROM ledger
    ${ledgerWhere(query)}
    GROUP BY currency`;
  return rows.map((r) => ({
    currency: r.currency,
    count: r.count,
    incomeMinor: r.income,
    expenseMinor: r.expense,
  }));
}

export async function listLedger(
  userId: string,
  query: LedgerQuery,
  page: number,
  pageSize = PAGE_SIZE,
): Promise<LedgerItem[]> {
  const offset = (page - 1) * pageSize;
  const rows = await prisma.$queryRaw<
    {
      id: string;
      kind: LedgerKind;
      amount_minor: bigint;
      currency: CurrencyCode;
      occurred_on: Date;
      payee: string | null;
      note: string | null;
      account_id: string;
      account_name: string;
      category_id: string | null;
      category_name: string | null;
      category_color: string | null;
      category_archived: boolean | null;
      to_account_id: string | null;
      to_account_name: string | null;
    }[]
  >`
    ${ledgerCte(userId)}
    SELECT id, kind, amount_minor, currency, occurred_on, payee, note,
           account_id, account_name, category_id, category_name, category_color,
           category_archived, to_account_id, to_account_name
    FROM ledger
    ${ledgerWhere(query)}
    ${ORDER_BY[query.sort]}
    LIMIT ${pageSize} OFFSET ${offset}`;

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    amountMinor: r.amount_minor,
    currency: r.currency,
    occurredOn: dbDateToIso(r.occurred_on),
    payee: r.payee,
    note: r.note,
    account: { id: r.account_id, name: r.account_name },
    category:
      r.category_id && r.category_name
        ? {
            id: r.category_id,
            name: r.category_name,
            color: r.category_color,
            isArchived: r.category_archived ?? false,
          }
        : null,
    toAccount:
      r.to_account_id && r.to_account_name
        ? { id: r.to_account_id, name: r.to_account_name }
        : null,
  }));
}

/* ------------------------------------------------------------------------- */
/* CSV export                                                                 */
/* ------------------------------------------------------------------------- */

export interface ExportRow {
  id: string;
  kind: LedgerKind;
  amountMinor: bigint;
  currency: CurrencyCode;
  occurredOn: IsoDate;
  payee: string | null;
  note: string | null;
  accountName: string;
  categoryName: string | null;
  toAccountName: string | null;
  reversesId: string | null;
  reversedById: string | null;
  createdAt: Date;
}

/** Position after the last exported row: the sort key (date, created_at, id). */
export interface ExportCursor {
  occurredOn: IsoDate;
  createdAt: Date;
  id: string;
}

/**
 * One batch of matching records in date order, for streaming exports. Keyset
 * pagination on (occurred_on, created_at, id) — unique and stable, so records
 * added or deleted while an export runs never shift a batch boundary (no row
 * is written twice).
 */
export async function exportLedgerBatch(
  userId: string,
  query: Omit<LedgerQuery, "sort">,
  direction: "asc" | "desc",
  after: ExportCursor | null,
  limit: number,
): Promise<ExportRow[]> {
  const extra: Prisma.Sql[] = [];
  if (after) {
    const cmp = Prisma.raw(direction === "asc" ? ">" : "<");
    extra.push(
      Prisma.sql`(occurred_on, created_at, id) ${cmp} (${isoDateToDb(after.occurredOn)}::date, ${after.createdAt}::timestamptz, ${after.id}::uuid)`,
    );
  }
  const order =
    direction === "asc"
      ? Prisma.sql`ORDER BY occurred_on ASC, created_at ASC, id ASC`
      : Prisma.sql`ORDER BY occurred_on DESC, created_at DESC, id DESC`;
  const rows = await prisma.$queryRaw<
    {
      id: string;
      kind: LedgerKind;
      amount_minor: bigint;
      currency: CurrencyCode;
      occurred_on: Date;
      created_at: Date;
      payee: string | null;
      note: string | null;
      account_name: string;
      category_name: string | null;
      to_account_name: string | null;
      reverses_id: string | null;
      reversed_by_id: string | null;
    }[]
  >`
    ${ledgerCte(userId)}
    SELECT id, kind, amount_minor, currency, occurred_on, created_at, payee, note,
           account_name, category_name, to_account_name, reverses_id, reversed_by_id
    FROM ledger
    ${ledgerWhere(query, extra)}
    ${order}
    LIMIT ${limit}`;
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    amountMinor: r.amount_minor,
    currency: r.currency,
    occurredOn: dbDateToIso(r.occurred_on),
    payee: r.payee,
    note: r.note,
    accountName: r.account_name,
    categoryName: r.category_name,
    toAccountName: r.to_account_name,
    reversesId: r.reverses_id,
    reversedById: r.reversed_by_id,
    createdAt: r.created_at,
  }));
}
