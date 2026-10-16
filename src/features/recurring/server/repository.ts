import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { type IsoDate, dbDateToIso, isoDateToDb, todayInTimeZone } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";
import { prisma } from "@/server/db";
import { ConflictError, NotFoundError } from "@/server/errors";

import type { EntryType } from "@/features/transactions/constants";

import type { Frequency, PauseReason } from "../constants";
import type { Schedule } from "../schedule";

/**
 * Recurring rules and their execution, scoped by user id.
 *
 * Execution guarantees (docs/PRD.md §6.6, docs/DATABASE.md "Recurring execution"):
 * - a rule is processed inside one database transaction that holds its row
 *   lock (FOR UPDATE SKIP LOCKED: a concurrent worker skips it, never waits or
 *   double-posts);
 * - every posted transaction is unique on (recurring_rule_id, recurrence_date)
 *   and inserted with ON CONFLICT DO NOTHING, so a retry cannot post twice;
 * - the next occurrence is advanced in the same transaction as the posting;
 * - accounts and categories are read with FOR SHARE (the same lock ordering as
 *   manual entries), so an archive cannot slip in between check and insert.
 */

type Tx = Prisma.TransactionClient;

const ruleSelect = {
  id: true,
  name: true,
  type: true,
  amountMinor: true,
  payee: true,
  description: true,
  frequency: true,
  interval: true,
  startOn: true,
  endOn: true,
  nextOccurrenceOn: true,
  status: true,
  pauseReason: true,
  pausedAt: true,
  createdAt: true,
  updatedAt: true,
  account: { select: { id: true, name: true, currency: true, isArchived: true } },
  category: { select: { id: true, name: true, color: true, isArchived: true } },
} as const;

export type RuleRow = Prisma.RecurringRuleGetPayload<{ select: typeof ruleSelect }>;

export function listRules(userId: string): Promise<RuleRow[]> {
  return prisma.recurringRule.findMany({
    where: { userId },
    select: ruleSelect,
    orderBy: [{ status: "asc" }, { nextOccurrenceOn: "asc" }, { name: "asc" }],
  });
}

export function findRule(userId: string, id: string): Promise<RuleRow | null> {
  return prisma.recurringRule.findFirst({ where: { id, userId }, select: ruleSelect });
}

export interface RuleWrite {
  name: string;
  type: EntryType;
  accountId: string;
  categoryId: string;
  amountMinor: bigint;
  payee: string | null;
  description: string | null;
  frequency: Frequency;
  interval: number;
  startOn: IsoDate;
  endOn: IsoDate | null;
}

function ruleData(data: RuleWrite) {
  return {
    name: data.name,
    type: data.type,
    accountId: data.accountId,
    categoryId: data.categoryId,
    amountMinor: data.amountMinor,
    payee: data.payee,
    description: data.description,
    frequency: data.frequency,
    interval: data.interval,
    startOn: isoDateToDb(data.startOn),
    endOn: data.endOn ? isoDateToDb(data.endOn) : null,
  };
}

export async function createRule(
  userId: string,
  data: RuleWrite,
  nextOccurrenceOn: IsoDate | null,
): Promise<{ id: string }> {
  return prisma.recurringRule.create({
    data: {
      userId,
      ...ruleData(data),
      nextOccurrenceOn: nextOccurrenceOn ? isoDateToDb(nextOccurrenceOn) : null,
      status: nextOccurrenceOn ? "ACTIVE" : "COMPLETED",
    },
    select: { id: true },
  });
}

/** The latest occurrence date ever posted for a rule (from history), if any. */
export async function lastPostedOn(userId: string, ruleId: string): Promise<IsoDate | null> {
  const row = await prisma.recurringRun.findFirst({
    where: { userId, ruleId, status: "POSTED" },
    orderBy: { occurrenceOn: "desc" },
    select: { occurrenceOn: true },
  });
  return row ? dbDateToIso(row.occurrenceOn) : null;
}

const STALE =
  "This rule was changed somewhere else after you opened it. Reload to see the latest version.";

/**
 * Update a rule's definition and its next occurrence (computed by the service
 * from the new schedule). Optimistic concurrency on updated_at.
 */
export async function updateRule(
  userId: string,
  id: string,
  expectedUpdatedAt: string,
  data: RuleWrite,
  state: { nextOccurrenceOn: IsoDate | null; status: "ACTIVE" | "PAUSED" | "COMPLETED" },
): Promise<void> {
  const { count } = await prisma.recurringRule.updateMany({
    where: { id, userId, updatedAt: new Date(expectedUpdatedAt) },
    data: {
      ...ruleData(data),
      nextOccurrenceOn: state.nextOccurrenceOn ? isoDateToDb(state.nextOccurrenceOn) : null,
      status: state.status,
      ...(state.status !== "PAUSED" ? { pauseReason: null, pausedAt: null } : {}),
    },
  });
  if (count === 1) return;
  if ((await prisma.recurringRule.count({ where: { id, userId } })) === 0) {
    throw new NotFoundError("We couldn't find that recurring rule.");
  }
  throw new ConflictError(STALE);
}

export async function pauseRule(userId: string, id: string, reason: PauseReason): Promise<number> {
  const { count } = await prisma.recurringRule.updateMany({
    where: { id, userId, status: "ACTIVE" },
    data: { status: "PAUSED", pauseReason: reason, pausedAt: new Date() },
  });
  return count;
}

export async function resumeRule(
  userId: string,
  id: string,
  nextOccurrenceOn: IsoDate | null,
): Promise<number> {
  const { count } = await prisma.recurringRule.updateMany({
    where: { id, userId, status: "PAUSED" },
    data: {
      status: nextOccurrenceOn ? "ACTIVE" : "COMPLETED",
      nextOccurrenceOn: nextOccurrenceOn ? isoDateToDb(nextOccurrenceOn) : null,
      pauseReason: null,
      pausedAt: null,
    },
  });
  return count;
}

/**
 * Delete a rule. Its posted transactions stay as ordinary records (the link is
 * cleared); its history rows go with it.
 */
export async function deleteRule(userId: string, id: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.transaction.updateMany({
      where: { userId, recurringRuleId: id },
      data: { recurringRuleId: null, recurrenceDate: null },
    });
    const { count } = await tx.recurringRule.deleteMany({ where: { id, userId } });
    return count;
  });
}

export function listRuns(userId: string, ruleId: string, take: number) {
  return prisma.recurringRun.findMany({
    where: { userId, ruleId },
    orderBy: { occurrenceOn: "desc" },
    take,
    select: {
      id: true,
      occurrenceOn: true,
      status: true,
      transactionId: true,
      reason: true,
      attempts: true,
      lastAttemptAt: true,
    },
  });
}

/** Unresolved failures (latest attempt failed) across the user's rules. */
export function listFailures(userId: string, take: number) {
  return prisma.recurringRun.findMany({
    where: { userId, status: "FAILED" },
    orderBy: { lastAttemptAt: "desc" },
    take,
    select: {
      id: true,
      occurrenceOn: true,
      reason: true,
      attempts: true,
      lastAttemptAt: true,
      rule: { select: { id: true, name: true, status: true } },
    },
  });
}

/* ------------------------------------------------------------------------- */
/* Execution engine                                                           */
/* ------------------------------------------------------------------------- */

/**
 * Active rules whose next occurrence is due — on or before "today" in each
 * rule owner's timezone at instant `now` (UTC internally). Oldest first.
 */
export async function findDueRules(
  now: Date,
  limit: number,
): Promise<{ id: string; userId: string }[]> {
  const rows = await prisma.$queryRaw<{ id: string; user_id: string }[]>`
    SELECT r.id, r.user_id
    FROM recurring_rules r
    JOIN users u ON u.id = r.user_id
    WHERE r.status = 'ACTIVE'
      AND r.next_occurrence_on IS NOT NULL
      AND r.next_occurrence_on <= (${now}::timestamptz AT TIME ZONE u.timezone)::date
    ORDER BY r.next_occurrence_on ASC, r.id ASC
    LIMIT ${limit}`;
  return rows.map((r) => ({ id: r.id, userId: r.user_id }));
}

export interface PostedOccurrence {
  date: IsoDate;
  transactionId: string;
  type: EntryType;
  categoryId: string;
  currency: CurrencyCode;
}

export type ProcessOutcome =
  | { kind: "busy" } // locked by another worker, or no longer active
  | {
      kind: "done";
      posted: PostedOccurrence[];
      status: "ACTIVE" | "PAUSED" | "COMPLETED";
      pausedFor?: "account_archived" | "category_archived";
    };

async function upsertRun(
  tx: Tx,
  row: {
    userId: string;
    ruleId: string;
    occurrenceOn: IsoDate;
    status: "POSTED" | "FAILED" | "SKIPPED";
    transactionId: string | null;
    reason: string | null;
  },
) {
  await tx.$executeRaw`
    INSERT INTO recurring_runs (id, user_id, rule_id, occurrence_on, status, transaction_id, reason, attempts, last_attempt_at)
    VALUES (gen_random_uuid(), ${row.userId}::uuid, ${row.ruleId}::uuid, ${isoDateToDb(row.occurrenceOn)},
            ${row.status}::"RecurringRunStatus", ${row.transactionId}::uuid, ${row.reason}, 1, now())
    ON CONFLICT (rule_id, occurrence_on) DO UPDATE
      SET status = EXCLUDED.status,
          transaction_id = COALESCE(EXCLUDED.transaction_id, recurring_runs.transaction_id),
          reason = EXCLUDED.reason,
          attempts = recurring_runs.attempts + 1,
          last_attempt_at = now()`;
}

/**
 * Post every due occurrence of one rule (up to `maxOccurrences`), advancing
 * its next date, all in one transaction. `nextAfter` computes the following
 * occurrence from the rule's schedule (pure calendar logic from the service).
 */
export async function processRule(
  ruleId: string,
  now: Date,
  maxOccurrences: number,
  nextAfter: (schedule: Schedule, date: IsoDate) => IsoDate | null,
): Promise<ProcessOutcome> {
  return prisma.$transaction(
    async (tx) => {
      const rules = await tx.$queryRaw<
        {
          id: string;
          user_id: string;
          account_id: string;
          category_id: string;
          type: EntryType;
          amount_minor: bigint;
          payee: string | null;
          description: string | null;
          frequency: Frequency;
          interval: number;
          start_on: Date;
          end_on: Date | null;
          next_occurrence_on: Date | null;
        }[]
      >`
        SELECT id, user_id, account_id, category_id, type::text AS type, amount_minor, payee,
               description, frequency::text AS frequency, interval, start_on, end_on, next_occurrence_on
        FROM recurring_rules
        WHERE id = ${ruleId}::uuid AND status = 'ACTIVE'
        FOR UPDATE SKIP LOCKED`;
      const rule = rules[0];
      if (!rule || !rule.next_occurrence_on) return { kind: "busy" };

      const user = await tx.user.findUniqueOrThrow({
        where: { id: rule.user_id },
        select: { timezone: true },
      });
      const today = todayInTimeZone(user.timezone, now);
      const schedule: Schedule = {
        frequency: rule.frequency,
        interval: rule.interval,
        startOn: dbDateToIso(rule.start_on),
        endOn: rule.end_on ? dbDateToIso(rule.end_on) : null,
      };

      const [account] = await tx.$queryRaw<{ currency: CurrencyCode; is_archived: boolean }[]>`
        SELECT currency::text AS currency, is_archived FROM accounts
        WHERE id = ${rule.account_id}::uuid AND user_id = ${rule.user_id}::uuid FOR SHARE`;
      const [category] = await tx.$queryRaw<{ is_archived: boolean }[]>`
        SELECT is_archived FROM categories
        WHERE id = ${rule.category_id}::uuid AND user_id = ${rule.user_id}::uuid FOR SHARE`;

      let next: IsoDate | null = dbDateToIso(rule.next_occurrence_on);
      if (next > today) return { kind: "done", posted: [], status: "ACTIVE" };

      const blocked =
        !account || account.is_archived
          ? "account_archived"
          : category?.is_archived
            ? "category_archived"
            : null;
      if (blocked) {
        await upsertRun(tx, {
          userId: rule.user_id,
          ruleId,
          occurrenceOn: next,
          status: "SKIPPED",
          transactionId: null,
          reason: blocked,
        });
        await tx.recurringRule.update({
          where: { id: ruleId },
          data: {
            status: "PAUSED",
            pauseReason: blocked === "account_archived" ? "ACCOUNT_ARCHIVED" : "CATEGORY_ARCHIVED",
            pausedAt: new Date(),
          },
        });
        return { kind: "done", posted: [], status: "PAUSED", pausedFor: blocked };
      }

      const posted: PostedOccurrence[] = [];
      while (next && next <= today && posted.length < maxOccurrences) {
        const inserted = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO transactions (id, user_id, account_id, category_id, type, amount_minor, occurred_on,
                                    payee, note, recurring_rule_id, recurrence_date, updated_at)
          VALUES (gen_random_uuid(), ${rule.user_id}::uuid, ${rule.account_id}::uuid, ${rule.category_id}::uuid,
                  ${rule.type}::"TransactionType", ${rule.amount_minor}, ${isoDateToDb(next)},
                  ${rule.payee}, ${rule.description}, ${ruleId}::uuid, ${isoDateToDb(next)}, now())
          ON CONFLICT (recurring_rule_id, recurrence_date) DO NOTHING
          RETURNING id`;
        // Already posted earlier (e.g. the schedule was edited onto a posted date): reuse it.
        const transactionId =
          inserted[0]?.id ??
          (
            await tx.transaction.findFirst({
              where: { recurringRuleId: ruleId, recurrenceDate: isoDateToDb(next) },
              select: { id: true },
            })
          )?.id ??
          null;
        await upsertRun(tx, {
          userId: rule.user_id,
          ruleId,
          occurrenceOn: next,
          status: "POSTED",
          transactionId,
          reason: null,
        });
        if (inserted[0] && account) {
          posted.push({
            date: next,
            transactionId: inserted[0].id,
            type: rule.type,
            categoryId: rule.category_id,
            currency: account.currency,
          });
        }
        next = nextAfter(schedule, next);
      }

      await tx.recurringRule.update({
        where: { id: ruleId },
        data: next
          ? { nextOccurrenceOn: isoDateToDb(next) }
          : { nextOccurrenceOn: null, status: "COMPLETED" },
      });
      return { kind: "done", posted, status: next ? "ACTIVE" : "COMPLETED" };
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

/**
 * Record a failed attempt at the rule's current occurrence; after `maxAttempts`
 * failures the rule is paused so the user can see and fix it. Returns the
 * attempt count.
 */
export async function recordFailure(
  ruleId: string,
  reason: string,
  maxAttempts: number,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const rule = await tx.recurringRule.findUnique({
      where: { id: ruleId },
      select: { userId: true, nextOccurrenceOn: true, status: true },
    });
    if (!rule?.nextOccurrenceOn) return 0;
    const occurrenceOn = dbDateToIso(rule.nextOccurrenceOn);
    await upsertRun(tx, {
      userId: rule.userId,
      ruleId,
      occurrenceOn,
      status: "FAILED",
      transactionId: null,
      reason,
    });
    const run = await tx.recurringRun.findUniqueOrThrow({
      where: { ruleId_occurrenceOn: { ruleId, occurrenceOn: isoDateToDb(occurrenceOn) } },
      select: { attempts: true },
    });
    if (run.attempts >= maxAttempts && rule.status === "ACTIVE") {
      await tx.recurringRule.update({
        where: { id: ruleId },
        data: { status: "PAUSED", pauseReason: "REPEATED_FAILURES", pausedAt: new Date() },
      });
    }
    return run.attempts;
  });
}
