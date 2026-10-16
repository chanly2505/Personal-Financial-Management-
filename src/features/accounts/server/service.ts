import "server-only";

import { type IsoDate, todayInTimeZone } from "@/lib/dates";
import { type CurrencyCode, formatMoney, parseMoney } from "@/lib/money";
import type { CurrentUser } from "@/server/auth/session";
import { normalizeName } from "@/lib/utils";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

import type { AccountType } from "../constants";
import type { AccountDetail, AccountSummary, AccountsOverview, CurrencyTotal } from "../types";
import * as repo from "./repository";

/**
 * Account rules (docs/PRD.md §5.2, §6.2, §6.10):
 * - one currency per account, fixed at creation;
 * - balances are derived, never stored; "current" = records dated up to today
 *   in the user's timezone, "projected" also includes future-dated records;
 * - names are unique per user, case-insensitively;
 * - archiving requires a zero current balance (PRD Q-10) so totals never hide money;
 * - deleting is only possible while nothing references the account; otherwise archive.
 */

function toSummary(
  row: repo.AccountRow,
  current: Map<string, bigint>,
  projected: Map<string, bigint>,
): AccountSummary {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    openingBalanceMinor: row.openingBalanceMinor,
    balanceMinor: current.get(row.id) ?? row.openingBalanceMinor,
    projectedBalanceMinor: projected.get(row.id) ?? row.openingBalanceMinor,
    isArchived: row.isArchived,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
  };
}

function today(user: Pick<CurrentUser, "timezone">): IsoDate {
  return todayInTimeZone(user.timezone);
}

export async function getAccountsOverview(
  user: Pick<CurrentUser, "id" | "timezone">,
): Promise<AccountsOverview> {
  const [rows, current, projected] = await Promise.all([
    repo.listAccounts(user.id),
    repo.computeBalances(user.id, today(user)),
    repo.computeBalances(user.id, null),
  ]);
  const summaries = rows.map((row) => toSummary(row, current, projected));
  const active = summaries.filter((a) => !a.isArchived);
  const archived = summaries.filter((a) => a.isArchived);

  const totals = new Map<CurrencyCode, CurrencyTotal>();
  for (const account of active) {
    const total = totals.get(account.currency) ?? {
      currency: account.currency,
      balanceMinor: 0n,
      accountCount: 0,
    };
    total.balanceMinor += account.balanceMinor;
    total.accountCount += 1;
    totals.set(account.currency, total);
  }
  const order: CurrencyCode[] = ["USD", "KHR"];
  return {
    active,
    archived,
    totals: [...totals.values()].sort(
      (a, b) => order.indexOf(a.currency) - order.indexOf(b.currency),
    ),
  };
}

export async function getAccount(
  user: Pick<CurrentUser, "id" | "timezone">,
  id: string,
): Promise<AccountDetail> {
  const row = await repo.findAccount(user.id, id);
  if (!row) throw new NotFoundError("We couldn't find that account.");
  const [current, projected, refs] = await Promise.all([
    repo.computeBalances(user.id, today(user), id),
    repo.computeBalances(user.id, null, id),
    repo.countAccountReferences(user.id, id),
  ]);
  return { ...toSummary(row, current, projected), referenceCount: refs.total };
}

function parseOpeningBalance(input: string, currency: CurrencyCode): bigint {
  const result = parseMoney(input, currency, { allowNegative: true, allowZero: true });
  if (!result.ok) {
    throw new ValidationError(result.error, { openingBalance: result.error });
  }
  return result.minor;
}

/** Names are unique per user, case-insensitively, across active and archived accounts. */
async function assertNameAvailable(userId: string, name: string, excludeId?: string) {
  const existing = await repo.findAccountByName(userId, name, excludeId);
  if (!existing) return;
  const message = existing.isArchived
    ? "An archived account already has this name. Restore it, or choose another name."
    : "You already have an account with this name.";
  throw new ValidationError(message, { name: message });
}

export async function createAccount(
  user: Pick<CurrentUser, "id">,
  input: { name: string; type: AccountType; currency: CurrencyCode; openingBalance: string },
): Promise<{ id: string }> {
  const openingBalanceMinor = parseOpeningBalance(input.openingBalance, input.currency);
  const name = normalizeName(input.name);
  await assertNameAvailable(user.id, name);
  const account = await repo.createAccount(user.id, {
    name,
    type: input.type,
    currency: input.currency,
    openingBalanceMinor,
  });
  return { id: account.id };
}

export async function updateAccount(
  user: Pick<CurrentUser, "id">,
  input: { id: string; name: string; type: AccountType; openingBalance: string },
): Promise<void> {
  const existing = await repo.findAccount(user.id, input.id);
  if (!existing) throw new NotFoundError("We couldn't find that account.");

  // The account's own currency decides how the amount is parsed.
  const openingBalanceMinor = parseOpeningBalance(input.openingBalance, existing.currency);
  const name = normalizeName(input.name);
  await assertNameAvailable(user.id, name, input.id);
  const changed = await repo.updateAccount(user.id, input.id, {
    name,
    type: input.type,
    openingBalanceMinor,
  });
  if (changed === 0) throw new NotFoundError("We couldn't find that account.");
}

export async function archiveAccount(
  user: Pick<CurrentUser, "id" | "timezone">,
  id: string,
): Promise<void> {
  const account = await repo.findAccount(user.id, id);
  if (!account) throw new NotFoundError("We couldn't find that account.");
  const outcome = await repo.archiveIfSettled(user.id, id, today(user));
  if (outcome.status === "not_found") throw new NotFoundError("We couldn't find that account.");
  if (outcome.status === "has_balance") {
    const amount = formatMoney(
      outcome.balanceMinor !== 0n ? outcome.balanceMinor : outcome.projectedBalanceMinor,
      account.currency,
    );
    const upcoming = outcome.balanceMinor === 0n ? " (including upcoming records)" : "";
    throw new ValidationError(
      `This account still holds ${amount}${upcoming}. Move the money to another account (or correct the opening balance) so the balance is zero, then archive it.`,
    );
  }
}

export async function restoreAccount(user: Pick<CurrentUser, "id">, id: string): Promise<void> {
  const account = await repo.findAccount(user.id, id);
  if (!account) throw new NotFoundError("We couldn't find that account.");
  if (!account.isArchived) return;
  if (await repo.findAccountByName(user.id, account.name, id)) {
    throw new ConflictError("Another account already uses this name. Rename one of them first.");
  }
  await repo.setArchived(user.id, id, false);
}

export async function deleteAccount(user: Pick<CurrentUser, "id">, id: string): Promise<void> {
  const references = await repo.deleteIfUnused(user.id, id);
  if (references === null) throw new NotFoundError("We couldn't find that account.");
  if (references > 0) {
    throw new ValidationError(
      "This account has history, so it can't be deleted. Archive it instead — its records are kept.",
    );
  }
}

/** For other modules (e.g. transactions): an active account owned by the user, or NotFound. */
export async function getUsableAccount(user: Pick<CurrentUser, "id">, id: string) {
  const account = await repo.findAccount(user.id, id);
  if (!account) throw new NotFoundError("We couldn't find that account.");
  if (account.isArchived) {
    throw new ValidationError("This account is archived. Restore it to add new records.");
  }
  return { id: account.id, name: account.name, currency: account.currency };
}

/** For other modules: the user's account (active or archived) in brief, or null. */
export async function findOwnAccount(user: Pick<CurrentUser, "id">, id: string) {
  const account = await repo.findAccount(user.id, id);
  return account
    ? {
        id: account.id,
        name: account.name,
        currency: account.currency,
        isArchived: account.isArchived,
      }
    : null;
}
