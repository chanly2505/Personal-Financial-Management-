import "server-only";

import { findOwnAccount } from "@/features/accounts/server/service";
import { syncAlertsForExpenses } from "@/features/budgets/server/service";
import { assertCategoryUsable } from "@/features/categories/server/service";
import type { EntryType } from "@/features/transactions/constants";
import { type IsoDate, addDays, dbDateToIso, startOfMonth, todayInTimeZone } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import { isUuid } from "@/lib/ids";
import type { CurrentUser } from "@/server/auth/session";
import { NotFoundError, ValidationError } from "@/server/errors";
import { describeError, logger } from "@/server/logger";

import {
  type Frequency,
  MAX_ATTEMPTS,
  MAX_OCCURRENCES_PER_RUN,
  MAX_RULES_PER_RUN,
  UPCOMING_DAYS,
} from "../constants";
import {
  type Schedule,
  describeSchedule,
  nextAfter,
  nextScheduled,
  occurrencesBetween,
} from "../schedule";
import type { RecurringRuleView, RunView, UpcomingItem } from "../types";
import * as repo from "./repository";

/**
 * Recurring rules (docs/PRD.md §6.6).
 *
 * - A rule is a schedule, never a transaction. Only the scheduled engine
 *   (runDueRules) posts transactions — opening a page never does.
 * - Catch-up policy: a new rule starts at its first occurrence on or after
 *   today, unless the user explicitly asks to record past occurrences (start
 *   date at most one year back). Occurrences missed because the scheduler was
 *   not running while the rule was ACTIVE are posted by the next run, oldest
 *   first, with their own dates (at most 50 per rule per run).
 * - Paused rules post nothing; on resume, dates that fell during the pause
 *   are skipped (Q-5).
 * - Editing affects only occurrences not yet posted; already posted
 *   transactions are ordinary records and are never re-created.
 * - Archived account or category: new or edited rules are refused; the engine
 *   pauses an existing rule with the reason, and resuming requires restoring it.
 */

type User = Pick<CurrentUser, "id" | "timezone">;
const NOT_FOUND = "We couldn't find that recurring rule.";
const MIN_DATE = "2000-01-01" as IsoDate;

function scheduleOf(r: {
  frequency: Frequency | string;
  interval: number;
  startOn: Date;
  endOn: Date | null;
}): Schedule {
  return {
    frequency: r.frequency as Frequency,
    interval: r.interval,
    startOn: dbDateToIso(r.startOn),
    endOn: r.endOn ? dbDateToIso(r.endOn) : null,
  };
}

function toView(row: repo.RuleRow): RecurringRuleView {
  const schedule = scheduleOf(row);
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    amountMinor: row.amountMinor,
    currency: row.account.currency,
    payee: row.payee,
    description: row.description,
    frequency: schedule.frequency,
    interval: row.interval,
    startOn: schedule.startOn,
    endOn: schedule.endOn,
    scheduleText: describeSchedule(schedule),
    nextOccurrenceOn: row.nextOccurrenceOn ? dbDateToIso(row.nextOccurrenceOn) : null,
    status: row.status,
    pauseReason: row.pauseReason,
    account: row.account,
    category: row.category,
    updatedAt: row.updatedAt,
  };
}

/* ------------------------------------------------------------------------- */
/* Reading                                                                    */
/* ------------------------------------------------------------------------- */

export async function listRecurring(user: User) {
  const [rules, failures] = await Promise.all([
    repo.listRules(user.id),
    repo.listFailures(user.id, 20),
  ]);
  const views = rules.map(toView);
  const today = todayInTimeZone(user.timezone);
  const until = addDays(today, UPCOMING_DAYS);
  const upcoming: UpcomingItem[] = views
    .filter((r) => r.status === "ACTIVE" && r.nextOccurrenceOn)
    .flatMap((r) =>
      occurrencesBetween(
        { frequency: r.frequency, interval: r.interval, startOn: r.startOn, endOn: r.endOn },
        r.nextOccurrenceOn!,
        until,
        10,
      ).map((date) => ({
        ruleId: r.id,
        name: r.name,
        type: r.type,
        amountMinor: r.amountMinor,
        currency: r.currency,
        date,
        due: date <= today,
      })),
    )
    .sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : a.date < b.date ? -1 : 1));
  return {
    today,
    rules: views,
    upcoming,
    failures: failures.map((f) => ({
      id: f.id,
      ruleId: f.rule.id,
      ruleName: f.rule.name,
      ruleStatus: f.rule.status,
      occurrenceOn: dbDateToIso(f.occurrenceOn),
      reason: f.reason,
      attempts: f.attempts,
      lastAttemptAt: f.lastAttemptAt,
    })),
  };
}

export async function getRecurring(user: Pick<CurrentUser, "id">, id: string) {
  if (!isUuid(id)) throw new NotFoundError(NOT_FOUND);
  const row = await repo.findRule(user.id, id);
  if (!row) throw new NotFoundError(NOT_FOUND);
  const runs = await repo.listRuns(user.id, id, 100);
  return {
    rule: toView(row),
    runs: runs.map((r): RunView => ({
      id: r.id,
      occurrenceOn: dbDateToIso(r.occurrenceOn),
      status: r.status,
      transactionId: r.transactionId,
      reason: r.reason,
      attempts: r.attempts,
      lastAttemptAt: r.lastAttemptAt,
    })),
  };
}

/* ------------------------------------------------------------------------- */
/* Writes                                                                     */
/* ------------------------------------------------------------------------- */

export interface RuleInput {
  name: string;
  type: EntryType;
  accountId: string;
  categoryId: string;
  amount: string;
  frequency: Frequency;
  interval: number;
  startOn: string;
  endOn?: string | undefined;
  payee?: string | undefined;
  description?: string | undefined;
}

async function prepare(
  user: User,
  input: RuleInput,
  keepCategoryId?: string,
): Promise<repo.RuleWrite> {
  const startOn = input.startOn as IsoDate;
  const endOn = (input.endOn || null) as IsoDate | null;
  const today = todayInTimeZone(user.timezone);
  if (startOn < MIN_DATE || startOn > addDays(today, 366)) {
    const message = "Choose a start date from 2000 up to a year ahead.";
    throw new ValidationError(message, { startOn: message });
  }
  if (endOn && endOn < startOn) {
    const message = "The end date must be on or after the start date.";
    throw new ValidationError(message, { endOn: message });
  }
  const account = await findOwnAccount(user, input.accountId);
  if (!account) {
    const message = "We couldn't find that account.";
    throw new ValidationError(message, { accountId: message });
  }
  if (account.isArchived) {
    const message = `${account.name} is archived. Choose another account or restore it.`;
    throw new ValidationError(message, { accountId: message });
  }
  const amount = parseMoney(input.amount, account.currency);
  if (!amount.ok) throw new ValidationError(amount.error, { amount: amount.error });
  if (input.categoryId !== keepCategoryId) {
    await assertCategoryUsable(user, input.categoryId, input.type);
  }
  return {
    name: input.name.trim(),
    type: input.type,
    accountId: input.accountId,
    categoryId: input.categoryId,
    amountMinor: amount.minor,
    payee: input.payee?.trim() || null,
    description: input.description?.trim() || null,
    frequency: input.frequency,
    interval: input.interval,
    startOn,
    endOn,
  };
}

/**
 * Create a rule. Without `catchUp`, the first posting is the first occurrence on
 * or after today; with it, occurrences since the start date (at most one year
 * back) are posted by the next engine run.
 */
export async function createRecurring(
  user: User,
  input: RuleInput & { catchUp?: boolean; clientRequestId?: string },
): Promise<{ id: string }> {
  const data = await prepare(user, input);
  const today = todayInTimeZone(user.timezone);
  const schedule: Schedule = {
    frequency: data.frequency,
    interval: data.interval,
    startOn: data.startOn,
    endOn: data.endOn,
  };
  if (input.catchUp && data.startOn < today && data.startOn < addDays(today, -366)) {
    const message =
      "Past dates can be recorded for up to one year back. Choose a later start date.";
    throw new ValidationError(message, { startOn: message });
  }
  const next = input.catchUp
    ? nextScheduled(schedule, data.startOn)
    : nextScheduled(schedule, today);
  if (!next) {
    const message = "This schedule has no dates left. Change the end date, or record past dates.";
    throw new ValidationError(message, { endOn: message });
  }
  return repo.createRule(user.id, data, next, input.clientRequestId);
}

/**
 * Next date after an edit or resume: never a date already posted, and never
 * before today — except that editing an active rule keeps the past dates it was
 * still due to catch up on (`pendingFrom`, QA-07). Resuming skips the pause (Q-5).
 */
async function nextFromNow(
  user: User,
  ruleId: string,
  schedule: Schedule,
  pendingFrom?: IsoDate | null,
): Promise<IsoDate | null> {
  const today = todayInTimeZone(user.timezone);
  const last = await repo.lastPostedOn(user.id, ruleId);
  let from = pendingFrom && pendingFrom < today ? pendingFrom : today;
  if (last && addDays(last, 1) > from) from = addDays(last, 1);
  return nextScheduled(schedule, from);
}

export async function updateRecurring(
  user: User,
  input: RuleInput & { id: string; expectedUpdatedAt: string },
): Promise<void> {
  const existing = await repo.findRule(user.id, input.id);
  if (!existing) throw new NotFoundError(NOT_FOUND);
  const keep = input.type === existing.type ? existing.category.id : undefined;
  const data = await prepare(user, input, keep);
  const schedule: Schedule = {
    frequency: data.frequency,
    interval: data.interval,
    startOn: data.startOn,
    endOn: data.endOn,
  };
  const next = await nextFromNow(
    user,
    input.id,
    schedule,
    existing.status === "ACTIVE" && existing.nextOccurrenceOn
      ? dbDateToIso(existing.nextOccurrenceOn)
      : null,
  );
  // No dates left → completed. Otherwise a paused rule stays paused (its next
  // date is recomputed on resume); an active or completed rule becomes active.
  await repo.updateRule(user.id, input.id, input.expectedUpdatedAt, data, {
    nextOccurrenceOn: next,
    status: !next ? "COMPLETED" : existing.status === "PAUSED" ? "PAUSED" : "ACTIVE",
  });
}

export async function pauseRecurring(user: Pick<CurrentUser, "id">, id: string): Promise<void> {
  const rule = await repo.findRule(user.id, id);
  if (!rule) throw new NotFoundError(NOT_FOUND);
  if (rule.status !== "ACTIVE") return;
  await repo.pauseRule(user.id, id, "USER");
}

/** Resume: dates that fell during the pause are skipped (Q-5). */
export async function resumeRecurring(user: User, id: string): Promise<void> {
  const rule = await repo.findRule(user.id, id);
  if (!rule) throw new NotFoundError(NOT_FOUND);
  if (rule.status !== "PAUSED") return;
  if (rule.account.isArchived) {
    throw new ValidationError(
      `${rule.account.name} is archived. Restore it, or edit the rule to use another account.`,
    );
  }
  if (rule.category.isArchived) {
    throw new ValidationError(
      `${rule.category.name} is archived. Restore it, or edit the rule to use another category.`,
    );
  }
  await repo.resumeRule(user.id, id, await nextFromNow(user, id, scheduleOf(rule)));
}

/** Delete the rule; transactions it already posted are kept as ordinary records. */
export async function deleteRecurring(user: Pick<CurrentUser, "id">, id: string): Promise<void> {
  if ((await repo.deleteRule(user.id, id)) === 0) throw new NotFoundError(NOT_FOUND);
}

/* ------------------------------------------------------------------------- */
/* Execution engine                                                           */
/* ------------------------------------------------------------------------- */

export interface RunSummary {
  rules: number;
  posted: number;
  failed: number;
  paused: number;
  busy: number;
}

function failureCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && code.startsWith("P") ? "database_error" : "unexpected_error";
}

/**
 * Post all due occurrences. Safe to run at any time, repeatedly and
 * concurrently: rules locked by another worker are skipped, and an occurrence
 * can be posted only once. Called by the scheduler (cron route, CLI or the
 * in-process timer) — never by page views. `now` is a UTC instant; "due" is
 * judged in each user's timezone.
 */
export async function runDueRules(
  options: { now?: Date; maxRules?: number } = {},
): Promise<RunSummary> {
  const now = options.now ?? new Date();
  const due = await repo.findDueRules(now, options.maxRules ?? MAX_RULES_PER_RUN);
  const summary: RunSummary = { rules: due.length, posted: 0, failed: 0, paused: 0, busy: 0 };

  for (const { id, userId } of due) {
    try {
      const outcome = await repo.processRule(id, now, MAX_OCCURRENCES_PER_RUN, nextAfter);
      if (outcome.kind === "busy") {
        summary.busy += 1;
        continue;
      }
      summary.posted += outcome.posted.length;
      if (outcome.status === "PAUSED") {
        summary.paused += 1;
        logger.warn("recurring.rule_paused", {
          ruleId: id,
          userId,
          reason: outcome.pausedFor ?? null,
        });
      }
      const expenses = outcome.posted.filter((p) => p.type === "EXPENSE");
      if (expenses.length > 0) {
        await syncAlertsForExpenses(
          userId,
          expenses.map((p) => ({
            categoryId: p.categoryId,
            currency: p.currency,
            month: startOfMonth(p.date),
          })),
        );
      }
    } catch (error) {
      summary.failed += 1;
      const reason = failureCode(error);
      let attempts = 0;
      try {
        attempts = await repo.recordFailure(id, reason, MAX_ATTEMPTS);
      } catch (recordError) {
        logger.error("recurring.failure_not_recorded", {
          ruleId: id,
          ...describeError(recordError),
        });
      }
      // Ids and error class only: no amounts, names or SQL in logs.
      logger.error("recurring.rule_failed", {
        ruleId: id,
        userId,
        attempts,
        reason,
        // Class only, in every environment: database messages can contain values.
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
  }
  logger.info("recurring.run_finished", { ...summary });
  return summary;
}
