import "server-only";

import { syncAlertsForExpenses } from "@/features/budgets/server/service";
import { assertCategoryUsable } from "@/features/categories/server/service";
import { type IsoDate, addDays, startOfMonth, todayInTimeZone } from "@/lib/dates";
import { CURRENCIES, type CurrencyCode, MAX_AMOUNT_MINOR, parseMoney } from "@/lib/money";
import type { CurrentUser } from "@/server/auth/session";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

import { type EntryType, MAX_DAYS_AHEAD, MIN_OCCURRED_ON, PAGE_SIZE } from "../constants";
import type { LedgerFilters } from "../schemas";
import type { CurrencySummary, LedgerPage, RecordDetail } from "../types";
import * as repo from "./repository";

/**
 * Ledger rules (docs/PRD.md §6):
 * - amounts are positive and parsed with the account's currency (never floats);
 *   direction comes from the type, so zero and negative amounts are rejected;
 * - an entry's category must be active and of the same type (the database also
 *   enforces the type match through a composite foreign key);
 * - dates run from MIN_OCCURRED_ON to one year after "today" in the user's timezone;
 * - archived accounts are frozen: no new, edited or deleted records touch them,
 *   so their zero balance stays zero;
 * - transfers move money between two different active accounts of the same
 *   currency (v1, no FX) and never count as income or expense;
 * - transfers are undone with "Reverse" (an opposite, linked transfer) or deleted;
 *   a transfer that has been reversed, or that reverses another, cannot be edited.
 */

type User = Pick<CurrentUser, "id" | "timezone">;

const ACCOUNT_NOT_FOUND = "We couldn't find that account.";

function today(user: User): IsoDate {
  return todayInTimeZone(user.timezone);
}

function assertDateAllowed(user: User, date: string): IsoDate {
  const iso = date as IsoDate;
  if (iso < MIN_OCCURRED_ON) {
    const message = "Choose a date in the year 2000 or later.";
    throw new ValidationError(message, { occurredOn: message });
  }
  if (iso > addDays(today(user), MAX_DAYS_AHEAD)) {
    const message = "Choose a date no more than one year ahead.";
    throw new ValidationError(message, { occurredOn: message });
  }
  return iso;
}

function parseAmount(input: string, currency: CurrencyCode): bigint {
  const result = parseMoney(input, currency);
  if (!result.ok) throw new ValidationError(result.error, { amount: result.error });
  return result.minor;
}

function requireAccount(
  accounts: Map<string, repo.LockedAccount>,
  id: string,
  field: string,
): repo.LockedAccount {
  const account = accounts.get(id);
  if (!account) throw new ValidationError(ACCOUNT_NOT_FOUND, { [field]: ACCOUNT_NOT_FOUND });
  return account;
}

function assertActive(account: repo.LockedAccount, field?: string) {
  if (!account.isArchived) return;
  const message = `${account.name} is archived. Restore it to change its records.`;
  throw new ValidationError(message, field ? { [field]: message } : {});
}

function assertAllActive(accounts: Map<string, repo.LockedAccount>) {
  for (const account of accounts.values()) assertActive(account);
}

function verifyTransferAccounts(fromId: string, toId: string): repo.VerifyAccounts {
  return (accounts) => {
    const from = requireAccount(accounts, fromId, "fromAccountId");
    const to = requireAccount(accounts, toId, "toAccountId");
    assertActive(from, "fromAccountId");
    assertActive(to, "toAccountId");
    if (from.currency !== to.currency) {
      const message = `Both accounts must use the same currency. ${from.name} is ${from.currency} and ${to.name} is ${to.currency}.`;
      throw new ValidationError(message, { toAccountId: message });
    }
  };
}

/* ------------------------------------------------------------------------- */
/* Income and expenses                                                        */
/* ------------------------------------------------------------------------- */

interface EntryInput {
  type: EntryType;
  accountId: string;
  categoryId: string;
  amount: string;
  occurredOn: string;
  payee?: string | undefined;
  note?: string | undefined;
}

async function prepareEntry(
  user: User,
  input: EntryInput,
  keepCategoryId?: string,
): Promise<repo.EntryWrite & { currency: CurrencyCode }> {
  const occurredOn = assertDateAllowed(user, input.occurredOn);
  // An account's currency never changes, so reading it before the lock is safe.
  const accounts = await repo.findAccounts(user.id, [input.accountId]);
  const account = requireAccount(accounts, input.accountId, "accountId");
  assertActive(account, "accountId");
  const amountMinor = parseAmount(input.amount, account.currency);
  if (input.categoryId !== keepCategoryId) {
    await assertCategoryUsable(user, input.categoryId, input.type);
  }
  return {
    type: input.type,
    accountId: input.accountId,
    categoryId: input.categoryId,
    amountMinor,
    occurredOn,
    payee: input.payee ?? null,
    note: input.note ?? null,
    currency: account.currency,
  };
}

/** The budget an expense counts toward (its category, currency and month), or none for income. */
function budgetKey(entry: {
  type: EntryType;
  categoryId: string;
  currency: CurrencyCode;
  occurredOn: IsoDate;
}) {
  return entry.type === "EXPENSE"
    ? [
        {
          categoryId: entry.categoryId,
          currency: entry.currency,
          month: startOfMonth(entry.occurredOn),
        },
      ]
    : [];
}

export async function createEntry(
  user: User,
  input: EntryInput & { clientRequestId: string },
): Promise<{ id: string; created: boolean }> {
  const { currency, ...data } = await prepareEntry(user, input);
  const result = await repo.createEntry(user.id, input.clientRequestId, data, (accounts) => {
    assertActive(requireAccount(accounts, data.accountId, "accountId"), "accountId");
  });
  if (result.created) await syncAlertsForExpenses(user.id, budgetKey({ ...data, currency }));
  return result;
}

export async function updateEntry(
  user: User,
  input: EntryInput & { id: string; expectedUpdatedAt: string },
): Promise<void> {
  const existing = await repo.findEntry(user.id, input.id);
  if (!existing) throw new NotFoundError("We couldn't find that transaction.");
  // Keeping an archived category on an existing record is fine; switching to one is not.
  const keepCategoryId = input.type === existing.type ? existing.category.id : undefined;
  const { currency, ...data } = await prepareEntry(user, input, keepCategoryId);
  await repo.updateEntry(user.id, input.id, input.expectedUpdatedAt, data, (accounts) => {
    // Covers the old account too: moving a record off an archived account would change its balance.
    assertAllActive(accounts);
    requireAccount(accounts, data.accountId, "accountId");
  });
  // Both the budget it left and the budget it joined change.
  await syncAlertsForExpenses(user.id, [
    ...budgetKey({ ...existing, categoryId: existing.category.id }),
    ...budgetKey({ ...data, currency }),
  ]);
}

export async function deleteEntry(user: Pick<CurrentUser, "id">, id: string): Promise<void> {
  const existing = await repo.findEntry(user.id, id);
  if (!existing) throw new NotFoundError("We couldn't find that transaction.");
  await repo.deleteEntry(user.id, id, assertAllActive);
  await syncAlertsForExpenses(
    user.id,
    budgetKey({ ...existing, categoryId: existing.category.id }),
  );
}

/* ------------------------------------------------------------------------- */
/* Transfers                                                                  */
/* ------------------------------------------------------------------------- */

interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  occurredOn: string;
  note?: string | undefined;
}

async function prepareTransfer(user: User, input: TransferInput): Promise<repo.TransferWrite> {
  if (input.fromAccountId === input.toAccountId) {
    const message = "Choose two different accounts.";
    throw new ValidationError(message, { toAccountId: message });
  }
  const occurredOn = assertDateAllowed(user, input.occurredOn);
  const accounts = await repo.findAccounts(user.id, [input.fromAccountId, input.toAccountId]);
  // Checked again under the lock; checking now gives precise messages before parsing.
  verifyTransferAccounts(input.fromAccountId, input.toAccountId)(accounts);
  const from = requireAccount(accounts, input.fromAccountId, "fromAccountId");
  return {
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amountMinor: parseAmount(input.amount, from.currency),
    occurredOn,
    note: input.note ?? null,
  };
}

export async function createTransfer(
  user: User,
  input: TransferInput & { clientRequestId: string },
): Promise<{ id: string; created: boolean }> {
  const data = await prepareTransfer(user, input);
  return repo.createTransfer(
    user.id,
    input.clientRequestId,
    data,
    verifyTransferAccounts(data.fromAccountId, data.toAccountId),
  );
}

function assertEditable(transfer: repo.LockedTransfer) {
  if (transfer.reversedByTransferId) {
    throw new ValidationError(
      "This transfer has been reversed, so it can't be edited. Delete the reversal first if you need to change it.",
    );
  }
  if (transfer.reversesTransferId) {
    throw new ValidationError(
      "This transfer reverses another one, so it can't be edited. Delete it instead if it was a mistake.",
    );
  }
}

export async function updateTransfer(
  user: User,
  input: TransferInput & { id: string; expectedUpdatedAt: string },
): Promise<void> {
  const data = await prepareTransfer(user, input);
  await repo.updateTransfer(
    user.id,
    input.id,
    input.expectedUpdatedAt,
    data,
    assertEditable,
    (accounts) => {
      assertAllActive(accounts);
      verifyTransferAccounts(data.fromAccountId, data.toAccountId)(accounts);
    },
  );
}

export async function deleteTransfer(user: Pick<CurrentUser, "id">, id: string): Promise<void> {
  await repo.deleteTransfer(
    user.id,
    id,
    (transfer) => {
      if (transfer.reversedByTransferId) {
        throw new ValidationError(
          "This transfer has been reversed. Delete the reversal first, then this transfer.",
        );
      }
    },
    assertAllActive,
  );
}

/**
 * Undo a transfer with an opposite one dated today — or on the original's date
 * if that is later. Each transfer can be reversed once.
 */
export async function reverseTransfer(
  user: User,
  input: { id: string; clientRequestId: string },
): Promise<{ id: string; created: boolean }> {
  return repo.reverseTransfer(
    user.id,
    input.id,
    input.clientRequestId,
    { occurredOn: today(user), note: "Reversal" },
    (transfer) => {
      if (transfer.reversedByTransferId) {
        throw new ConflictError("This transfer has already been reversed.");
      }
      if (transfer.reversesTransferId) {
        throw new ValidationError(
          "This transfer already reverses another one. Delete it instead to undo it.",
        );
      }
    },
    assertAllActive,
  );
}

/* ------------------------------------------------------------------------- */
/* Reading                                                                    */
/* ------------------------------------------------------------------------- */

/** An income, expense or transfer by id, or NotFound (also for other users' records). */
export async function getRecord(user: Pick<CurrentUser, "id">, id: string): Promise<RecordDetail> {
  const record = (await repo.findEntry(user.id, id)) ?? (await repo.findTransfer(user.id, id));
  if (!record) throw new NotFoundError("We couldn't find that record.");
  return record;
}

/**
 * Convert a typed amount filter ("12.5") into minor units for each currency.
 * KHR has no decimals, so a lower bound rounds up and an upper bound rounds down.
 */
export function amountBounds(value: string, rounding: "up" | "down"): Record<CurrencyCode, bigint> {
  const [whole = "0", fraction = ""] = value.split(".");
  const bound = (currency: CurrencyCode) => {
    const exponent = CURRENCIES[currency].exponent;
    const kept = fraction.slice(0, exponent).padEnd(exponent, "0");
    const dropped = fraction.slice(exponent);
    let minor = BigInt(whole + kept);
    if (rounding === "up" && /[1-9]/.test(dropped)) minor += 1n;
    // A minimum above the largest storable amount matches nothing (QA-09).
    if (minor > MAX_AMOUNT_MINOR)
      return rounding === "up" ? MAX_AMOUNT_MINOR + 1n : MAX_AMOUNT_MINOR;
    return minor;
  };
  return { USD: bound("USD"), KHR: bound("KHR") };
}

export function toLedgerQuery(filters: LedgerFilters): repo.LedgerQuery {
  let from = filters.from as IsoDate | undefined;
  let to = filters.to as IsoDate | undefined;
  if (from && to && from > to) [from, to] = [to, from];
  let minText = filters.min;
  let maxText = filters.max;
  if (minText && maxText && Number(minText) > Number(maxText))
    [minText, maxText] = [maxText, minText];
  return {
    q: filters.q || undefined,
    kind: filters.kind,
    accountId: filters.accountId,
    categoryId: filters.categoryId,
    from,
    to,
    min: minText ? amountBounds(minText, "up") : undefined,
    max: maxText ? amountBounds(maxText, "down") : undefined,
    currency: filters.currency,
    sort: filters.sort,
  };
}

const CURRENCY_ORDER: CurrencyCode[] = ["USD", "KHR"];

/**
 * One page of the ledger plus totals over every matching record. A page past
 * the end shows the last page instead of an empty list.
 */
export async function getLedgerPage(
  user: Pick<CurrentUser, "id">,
  filters: LedgerFilters,
  pageSize = PAGE_SIZE,
): Promise<LedgerPage> {
  const query = toLedgerQuery(filters);
  const totals = await repo.summarizeLedger(user.id, query);
  const total = totals.reduce((sum, row) => sum + row.count, 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(filters.page, pageCount);
  const items = total === 0 ? [] : await repo.listLedger(user.id, query, page, pageSize);
  const summary: CurrencySummary[] = totals
    .map((row) => ({
      currency: row.currency,
      incomeMinor: row.incomeMinor,
      expenseMinor: row.expenseMinor,
      netMinor: row.incomeMinor - row.expenseMinor,
    }))
    .sort((a, b) => CURRENCY_ORDER.indexOf(a.currency) - CURRENCY_ORDER.indexOf(b.currency));
  return { items, total, page, pageCount, summary };
}

/**
 * The most recent records (income, expenses and transfers) within a date range,
 * newest first — one query, no totals. Used by the dashboard.
 */
export function listRecentRecords(
  user: Pick<CurrentUser, "id">,
  range: { from: IsoDate; to: IsoDate },
  limit: number,
) {
  return repo.listLedger(user.id, { from: range.from, to: range.to, sort: "date_desc" }, 1, limit);
}
