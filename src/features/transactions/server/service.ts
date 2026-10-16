import "server-only";

import { type IsoDate, dbDateToIso } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";
import type { CurrentUser } from "@/server/auth/session";

import * as repo from "./repository";

/** One line of an account's history: an income, expense, or transfer in/out. */
export interface ActivityItem {
  id: string;
  kind: "INCOME" | "EXPENSE" | "TRANSFER_IN" | "TRANSFER_OUT";
  /** Always positive, in the account's currency; direction comes from `kind`. */
  amountMinor: bigint;
  occurredOn: IsoDate;
  description: string | null;
  /** Category name, or the other account for transfers. */
  label: string;
  labelArchived: boolean;
  counterpartCurrency?: CurrencyCode;
}

/**
 * Most recent activity for one of the user's accounts, newest first. The caller
 * must already have confirmed the account belongs to the user; queries are
 * scoped by user id regardless.
 */
export async function getAccountActivity(
  user: Pick<CurrentUser, "id">,
  accountId: string,
  limit = 50,
): Promise<{ items: ActivityItem[]; hasMore: boolean }> {
  const take = limit + 1;
  const [transactions, transfers] = await Promise.all([
    repo.listAccountTransactions(user.id, accountId, take),
    repo.listAccountTransfers(user.id, accountId, take),
  ]);

  const items: (ActivityItem & { createdAt: Date })[] = [
    ...transactions.map((t) => ({
      id: t.id,
      kind: t.type,
      amountMinor: t.amountMinor,
      occurredOn: dbDateToIso(t.occurredOn),
      description: t.description,
      label: t.category.name,
      labelArchived: t.category.isArchived,
      createdAt: t.createdAt,
    })),
    ...transfers.map((t) => {
      const outgoing = t.fromAccountId === accountId;
      const other = outgoing ? t.toAccount : t.fromAccount;
      return {
        id: t.id,
        kind: outgoing ? ("TRANSFER_OUT" as const) : ("TRANSFER_IN" as const),
        amountMinor: outgoing ? t.fromAmountMinor : t.toAmountMinor,
        occurredOn: dbDateToIso(t.occurredOn),
        description: t.description,
        label: other.name,
        labelArchived: false,
        counterpartCurrency: other.currency,
        createdAt: t.createdAt,
      };
    }),
  ];

  items.sort((a, b) =>
    a.occurredOn === b.occurredOn
      ? b.createdAt.getTime() - a.createdAt.getTime()
      : a.occurredOn < b.occurredOn
        ? 1
        : -1,
  );

  return {
    items: items.slice(0, limit).map((item) => {
      const { createdAt, ...rest } = item;
      void createdAt;
      return rest;
    }),
    hasMore: items.length > limit,
  };
}
