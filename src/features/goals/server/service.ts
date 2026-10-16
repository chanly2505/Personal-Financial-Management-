import "server-only";

import { findOwnAccount, getAccountsOverview } from "@/features/accounts/server/service";
import { type IsoDate, addDays, dbDateToIso, todayInTimeZone } from "@/lib/dates";
import { normalizeName } from "@/lib/utils";
import { type CurrencyCode, formatMoney, parseMoney } from "@/lib/money";
import type { CurrentUser } from "@/server/auth/session";
import { NotFoundError, ValidationError } from "@/server/errors";

import { CONTRIBUTIONS_LIMIT } from "../constants";
import { goalProgress } from "../progress";
import type { ContributionView, GoalView } from "../types";
import * as repo from "./repository";

/**
 * Savings goals (docs/PRD.md §6.8), earmark model (Q-7 A):
 * - a contribution records money set aside (+) or taken back (−) for a goal;
 *   it never changes an account balance, the ledger or any report;
 * - saved = Σ contributions and can never go below zero: a withdrawal larger
 *   than saved, or deleting a contribution that later withdrawals rely on, is
 *   rejected (checked under the goal's row lock);
 * - achieved when saved ≥ target (derived); saving beyond the target is allowed;
 * - the optional linked account must use the goal's currency; if active goals
 *   earmark more than that account's current balance, a warning is shown;
 * - the currency is fixed once the goal has contributions;
 * - contribution dates run from 2000-01-01 to today (no future earmarks);
 * - archived goals keep their history but accept no contributions.
 */

type User = Pick<CurrentUser, "id" | "timezone">;
const NOT_FOUND = "We couldn't find that goal.";
const MIN_DATE = "2000-01-01" as IsoDate;

function toView(
  row: repo.GoalRow,
  today: IsoDate,
  shortfall: Map<string, { earmarkedMinor: bigint; balanceMinor: bigint }>,
): GoalView {
  const progress = goalProgress(row, today);
  const short = row.account && !row.isArchived ? shortfall.get(row.account.id) : undefined;
  return {
    ...row,
    ...progress,
    accountWarning: short
      ? `Goals linked to ${row.account!.name} earmark ${formatMoney(short.earmarkedMinor, row.currency)}, but it holds ${formatMoney(short.balanceMinor, row.currency)}.`
      : null,
  };
}

/** Accounts whose active goals earmark more than the account's current balance. */
async function shortfalls(user: User) {
  const [earmarked, overview] = await Promise.all([
    repo.earmarkedByAccount(user.id),
    getAccountsOverview(user),
  ]);
  const balances = new Map(
    [...overview.active, ...overview.archived].map((a) => [a.id, a.balanceMinor]),
  );
  const result = new Map<string, { earmarkedMinor: bigint; balanceMinor: bigint }>();
  for (const [accountId, earmarkedMinor] of earmarked) {
    const balanceMinor = balances.get(accountId) ?? 0n;
    if (earmarkedMinor > balanceMinor) result.set(accountId, { earmarkedMinor, balanceMinor });
  }
  return result;
}

export async function listGoals(
  user: User,
): Promise<{ active: GoalView[]; archived: GoalView[]; today: IsoDate }> {
  const today = todayInTimeZone(user.timezone);
  const [rows, short] = await Promise.all([repo.listGoals(user.id), shortfalls(user)]);
  const views = rows.map((r) => toView(r, today, short));
  return {
    active: views.filter((g) => !g.isArchived),
    archived: views.filter((g) => g.isArchived),
    today,
  };
}

export async function getGoal(
  user: User,
  id: string,
): Promise<{ goal: GoalView; contributions: ContributionView[]; today: IsoDate }> {
  const today = todayInTimeZone(user.timezone);
  const [row, short, contributions] = await Promise.all([
    repo.findGoal(user.id, id),
    shortfalls(user),
    repo.listContributions(user.id, id, CONTRIBUTIONS_LIMIT),
  ]);
  if (!row) throw new NotFoundError(NOT_FOUND);
  return {
    goal: toView(row, today, short),
    contributions: contributions.map((c) => ({
      id: c.id,
      amountMinor: c.amountMinor,
      occurredOn: dbDateToIso(c.occurredOn),
      note: c.note,
    })),
    today,
  };
}

/** Active goals for the dashboard: soonest target date first, then by name. */
export async function getGoalsSummary(user: User) {
  const { active, today } = await listGoals(user);
  return { goals: active.slice(0, 4), total: active.length, today };
}

/* ------------------------------------------------------------------------- */
/* Writes                                                                     */
/* ------------------------------------------------------------------------- */

interface GoalInput {
  name: string;
  currency: CurrencyCode;
  target: string;
  targetDate?: string | undefined;
  accountId?: string | undefined;
  note?: string | undefined;
}

async function prepare(user: User, input: GoalInput, excludeId?: string): Promise<repo.GoalWrite> {
  const name = normalizeName(input.name);
  const clash = await repo.findGoalByName(user.id, name, excludeId);
  if (clash) {
    const message = clash.isArchived
      ? "An archived goal already has this name. Restore it, or choose another name."
      : "You already have a goal with this name.";
    throw new ValidationError(message, { name: message });
  }
  const target = parseMoney(input.target, input.currency);
  if (!target.ok) throw new ValidationError(target.error, { target: target.error });
  const targetDate = (input.targetDate || null) as IsoDate | null;
  if (
    targetDate &&
    (targetDate < MIN_DATE || targetDate > addDays(todayInTimeZone(user.timezone), 365 * 50))
  ) {
    const message = "Choose a realistic target date.";
    throw new ValidationError(message, { targetDate: message });
  }
  let accountId: string | null = null;
  if (input.accountId) {
    const account = await findOwnAccount(user, input.accountId);
    if (!account) {
      const message = "We couldn't find that account.";
      throw new ValidationError(message, { accountId: message });
    }
    if (account.currency !== input.currency) {
      const message = `${account.name} uses ${account.currency}. Choose a ${input.currency} account, or no account.`;
      throw new ValidationError(message, { accountId: message });
    }
    accountId = account.id;
  }
  return {
    name,
    currency: input.currency,
    targetMinor: target.minor,
    targetDate,
    accountId,
    note: input.note?.trim() || null,
  };
}

export async function createGoal(user: User, input: GoalInput): Promise<{ id: string }> {
  const data = await prepare(user, input);
  if (data.accountId) {
    const account = await findOwnAccount(user, data.accountId);
    if (account?.isArchived) {
      const message = `${account.name} is archived. Choose another account, or no account.`;
      throw new ValidationError(message, { accountId: message });
    }
  }
  return repo.createGoal(user.id, data);
}

export async function updateGoal(
  user: User,
  input: GoalInput & { id: string; expectedUpdatedAt: string },
) {
  const existing = await repo.findGoal(user.id, input.id);
  if (!existing) throw new NotFoundError(NOT_FOUND);
  if (input.currency !== existing.currency && existing.contributionCount > 0) {
    const message =
      "The currency can't change after money has been set aside. Create a new goal instead.";
    throw new ValidationError(message, { currency: message });
  }
  const data = await prepare(user, input, input.id);
  if (data.accountId && data.accountId !== existing.account?.id) {
    const account = await findOwnAccount(user, data.accountId);
    if (account?.isArchived) {
      const message = `${account.name} is archived. Choose another account, or no account.`;
      throw new ValidationError(message, { accountId: message });
    }
  }
  await repo.updateGoal(user.id, input.id, input.expectedUpdatedAt, data);
}

export async function archiveGoal(user: Pick<CurrentUser, "id">, id: string) {
  if ((await repo.setArchived(user.id, id, true)) === 0) throw new NotFoundError(NOT_FOUND);
}

export async function restoreGoal(user: Pick<CurrentUser, "id">, id: string) {
  const goal = await repo.findGoal(user.id, id);
  if (!goal) throw new NotFoundError(NOT_FOUND);
  if (await repo.findGoalByName(user.id, goal.name, id)) {
    throw new ValidationError("Another goal already uses this name. Rename one of them first.");
  }
  await repo.setArchived(user.id, id, false);
}

/** Deletes the goal and its contributions. No account balance changes (they were earmarks). */
export async function deleteGoal(user: Pick<CurrentUser, "id">, id: string) {
  if ((await repo.deleteGoal(user.id, id)) === 0) throw new NotFoundError(NOT_FOUND);
}

export async function addContribution(
  user: User,
  input: {
    goalId: string;
    kind: "DEPOSIT" | "WITHDRAWAL";
    amount: string;
    occurredOn: string;
    note?: string | undefined;
    clientRequestId: string;
  },
): Promise<{ id: string; created: boolean }> {
  const goal = await repo.findGoal(user.id, input.goalId);
  if (!goal) throw new NotFoundError(NOT_FOUND);
  const parsed = parseMoney(input.amount, goal.currency);
  if (!parsed.ok) throw new ValidationError(parsed.error, { amount: parsed.error });
  const occurredOn = input.occurredOn as IsoDate;
  const today = todayInTimeZone(user.timezone);
  if (occurredOn < MIN_DATE || occurredOn > today) {
    const message = "Choose a date from 2000 up to today.";
    throw new ValidationError(message, { occurredOn: message });
  }
  const amountMinor = input.kind === "WITHDRAWAL" ? -parsed.minor : parsed.minor;
  return repo.addContribution(
    user.id,
    input.goalId,
    {
      amountMinor,
      occurredOn,
      note: input.note?.trim() || null,
      clientRequestId: input.clientRequestId,
    },
    (state) => {
      if (state.isArchived) {
        throw new ValidationError("This goal is archived. Restore it to set money aside.");
      }
      if (state.savedMinor + amountMinor < 0n) {
        const message = `You can take back at most ${formatMoney(state.savedMinor, goal.currency)}.`;
        throw new ValidationError(message, { amount: message });
      }
    },
  );
}

export async function deleteContribution(
  user: Pick<CurrentUser, "id">,
  input: { goalId: string; contributionId: string },
) {
  await repo.deleteContribution(user.id, input.goalId, input.contributionId, (state) => {
    if (state.isArchived) {
      throw new ValidationError("This goal is archived. Restore it to change its history.");
    }
    if (state.savedMinor - state.amountMinor < 0n) {
      throw new ValidationError(
        "Removing this would make the saved amount negative. Remove the later withdrawal first.",
      );
    }
  });
}
