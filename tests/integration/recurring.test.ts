import { beforeEach, describe, expect, it } from "vitest";

import {
  archiveAccount,
  createAccount,
  getAccount,
  restoreAccount,
} from "@/features/accounts/server/service";
import { getAlertsSummary, createBudget } from "@/features/budgets/server/service";
import {
  createRecurring,
  deleteRecurring,
  getRecurring,
  listRecurring,
  pauseRecurring,
  resumeRecurring,
  runDueRules,
  updateRecurring,
} from "@/features/recurring/server/service";
import { type IsoDate, addDays, todayInTimeZone } from "@/lib/dates";
import { NotFoundError, ValidationError } from "@/server/errors";

import { registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

/** Recurring rules and the execution engine against a real database. */

const TZ = "Asia/Phnom_Penh"; // UTC+7
type U = { id: string; timezone: string };
const today = () => todayInTimeZone(TZ);
/** Midday in Phnom Penh on a calendar date, as a UTC instant. */
const at = (date: string) => new Date(`${date}T05:00:00Z`);

async function newUser(): Promise<U> {
  const user = await registerTestUser();
  return { id: user.id, timezone: TZ };
}

interface Fixture {
  user: U;
  bank: string;
  rent: string;
  salary: string;
}

async function setup(): Promise<Fixture> {
  const user = await newUser();
  const bank = (
    await createAccount(user, {
      name: "ABA",
      type: "BANK",
      currency: "USD",
      openingBalance: "1000",
    })
  ).id;
  const cat = async (name: string) =>
    (await prisma.category.findFirstOrThrow({ where: { userId: user.id, name } })).id;
  return { user, bank, rent: await cat("Housing and rent"), salary: await cat("Salary") };
}

function rule(f: Fixture, extra: Record<string, unknown> = {}) {
  return createRecurring(f.user, {
    name: "Rent",
    type: "EXPENSE",
    accountId: f.bank,
    categoryId: f.rent,
    amount: "300",
    frequency: "MONTHLY",
    interval: 1,
    startOn: "2026-01-31",
    catchUp: true,
    ...extra,
  } as Parameters<typeof createRecurring>[1]);
}

async function postedDates(ruleId: string): Promise<string[]> {
  const rows = await prisma.transaction.findMany({
    where: { recurringRuleId: ruleId },
    orderBy: { occurredOn: "asc" },
    select: { occurredOn: true },
  });
  return rows.map((r) => r.occurredOn.toISOString().slice(0, 10));
}

const nextOf = async (id: string) =>
  (await prisma.recurringRule.findUniqueOrThrow({ where: { id } })).nextOccurrenceOn
    ?.toISOString()
    .slice(0, 10) ?? null;

beforeEach(async () => {
  await resetDatabase();
});

describe("creating rules", () => {
  it("starts at the first date on or after today unless past dates are requested", async () => {
    const f = await setup();
    const { id } = await rule(f, { catchUp: false, startOn: "2026-01-15" });
    const next = (await nextOf(id))!;
    expect(next >= today()).toBe(true);
    expect(next.slice(8)).toBe("15");
    const { id: withPast } = await rule(f, { name: "Rent 2" });
    expect(await nextOf(withPast)).toBe("2026-01-31");
  });

  it("validates amounts, dates, accounts and categories", async () => {
    const f = await setup();
    await expect(rule(f, { amount: "0" })).rejects.toThrow(/greater than zero/);
    await expect(rule(f, { endOn: "2026-01-01" })).rejects.toThrow(/on or after the start/);
    await expect(rule(f, { startOn: "2024-01-31" })).rejects.toThrow(/one year back/);
    await expect(
      rule(f, { catchUp: false, startOn: "2026-01-01", endOn: "2026-02-01" }),
    ).rejects.toThrow(/no dates left/);
    await expect(rule(f, { categoryId: f.salary })).rejects.toThrow(/expense category/);
    const old = (
      await createAccount(f.user, {
        name: "Old",
        type: "CASH",
        currency: "USD",
        openingBalance: "0",
      })
    ).id;
    await archiveAccount(f.user, old);
    await expect(rule(f, { accountId: old })).rejects.toThrow(/archived/);
    expect(await prisma.recurringRule.count()).toBe(0);
  });
});

describe("execution engine", () => {
  it("posts nothing when nothing is due and never runs because a page is read", async () => {
    const f = await setup();
    await rule(f);
    await listRecurring(f.user); // reading the list does not post
    expect(await prisma.transaction.count()).toBe(0);
    expect(await runDueRules({ now: at("2026-01-30") })).toMatchObject({ rules: 0, posted: 0 });
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("posts due occurrences with the month-end policy and advances the next date atomically", async () => {
    const f = await setup();
    const { id } = await rule(f);
    const summary = await runDueRules({ now: at("2026-05-01") });
    expect(summary).toMatchObject({ rules: 1, posted: 4, failed: 0 });
    expect(await postedDates(id)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(await nextOf(id)).toBe("2026-05-31");
    const tx = await prisma.transaction.findFirstOrThrow({ where: { recurringRuleId: id } });
    expect(tx).toMatchObject({
      type: "EXPENSE",
      amountMinor: 30000n,
      accountId: f.bank,
      categoryId: f.rent,
    });
    // Opening 1,000 − 4 × 300 = −200 (as of the posting dates, all in the past).
    expect((await getAccount(f.user, f.bank)).balanceMinor).toBe(-20000n);
  });

  it("handles leap years for yearly rules", async () => {
    const f = await setup();
    const { id } = await createRecurring(f.user, {
      name: "Insurance",
      type: "EXPENSE",
      accountId: f.bank,
      categoryId: f.rent,
      amount: "10",
      frequency: "YEARLY",
      interval: 1,
      startOn: "2026-02-28",
      catchUp: true,
    });
    await runDueRules({ now: at("2029-03-01") });
    expect(await postedDates(id)).toEqual(["2026-02-28", "2027-02-28", "2028-02-28", "2029-02-28"]);
  });

  it("judges 'due' in the user's timezone (UTC internally)", async () => {
    const f = await setup();
    const { id } = await rule(f, { startOn: "2026-03-31" });
    // 30 Mar 23:00 in Phnom Penh: not due yet.
    await runDueRules({ now: new Date("2026-03-30T16:00:00Z") });
    expect(await postedDates(id)).toEqual([]);
    // 31 Mar 01:00 in Phnom Penh (still 30 Mar in UTC): due.
    await runDueRules({ now: new Date("2026-03-30T18:00:00Z") });
    expect(await postedDates(id)).toEqual(["2026-03-31"]);
  });

  it("is idempotent: retried runs never post twice", async () => {
    const f = await setup();
    const { id } = await rule(f);
    for (let i = 0; i < 4; i += 1) await runDueRules({ now: at("2026-03-15") });
    expect(await postedDates(id)).toEqual(["2026-01-31", "2026-02-28"]);
    const runs = await prisma.recurringRun.findMany({ where: { ruleId: id } });
    expect(runs.map((r) => [r.status, r.attempts])).toEqual([
      ["POSTED", 1],
      ["POSTED", 1],
    ]);
  });

  it("is safe when several workers run at the same time", async () => {
    const f = await setup();
    const ids = await Promise.all(
      Array.from({ length: 4 }, (_, i) => rule(f, { name: `Rule ${i}` }).then((r) => r.id)),
    );
    const results = await Promise.all(
      Array.from({ length: 6 }, () => runDueRules({ now: at("2026-04-15") })),
    );
    for (const id of ids)
      expect(await postedDates(id)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(results.reduce((s, r) => s + r.posted, 0)).toBe(12);
    expect(results.reduce((s, r) => s + r.failed, 0)).toBe(0);
    expect(await prisma.transaction.count()).toBe(12);
  });

  it("completes at the end date (inclusive)", async () => {
    const f = await setup();
    const { id } = await rule(f, { endOn: "2026-03-31" });
    await runDueRules({ now: at("2026-12-01") });
    expect(await postedDates(id)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    const row = await prisma.recurringRule.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "COMPLETED", nextOccurrenceOn: null });
    expect(await runDueRules({ now: at("2027-12-01") })).toMatchObject({ rules: 0 });
  });

  it("posts nothing for paused rules and skips paused dates on resume", async () => {
    const f = await setup();
    const { id } = await rule(f, { frequency: "WEEKLY", startOn: addDays(today(), -21) });
    await pauseRecurring(f.user, id);
    await runDueRules({ now: new Date() });
    expect(await postedDates(id)).toEqual([]);
    await resumeRecurring(f.user, id);
    // The three weeks before today are skipped; the next date is today.
    expect(await nextOf(id)).toBe(today());
    await runDueRules({ now: new Date() });
    expect(await postedDates(id)).toEqual([today()]);
  });

  it("catches up after downtime in bounded batches", async () => {
    const f = await setup();
    const { id } = await rule(f, { frequency: "WEEKLY", startOn: addDays(today(), -364) });
    const first = await runDueRules({ now: new Date() });
    expect(first.posted).toBe(50); // at most 50 per rule per run
    await runDueRules({ now: new Date() });
    expect((await postedDates(id)).length).toBe(53); // 52 weeks back + today
    expect(new Set(await postedDates(id)).size).toBe(53);
  });

  it("pauses predictably when the account is archived, and resumes after restoring", async () => {
    const f = await setup();
    const wallet = (
      await createAccount(f.user, {
        name: "Wallet",
        type: "CASH",
        currency: "USD",
        openingBalance: "0",
      })
    ).id;
    const { id } = await rule(f, {
      accountId: wallet,
      startOn: addDays(today(), 1),
      catchUp: false,
      frequency: "WEEKLY",
    });
    await archiveAccount(f.user, wallet);
    const summary = await runDueRules({ now: at(addDays(today(), 2)) });
    expect(summary).toMatchObject({ posted: 0, paused: 1 });
    expect(await prisma.recurringRule.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "PAUSED",
      pauseReason: "ACCOUNT_ARCHIVED",
    });
    expect(await prisma.recurringRun.findFirstOrThrow({ where: { ruleId: id } })).toMatchObject({
      status: "SKIPPED",
      reason: "account_archived",
    });
    await expect(resumeRecurring(f.user, id)).rejects.toThrow(/archived/);
    await restoreAccount(f.user, wallet);
    await resumeRecurring(f.user, id);
    expect((await getRecurring(f.user, id)).rule.status).toBe("ACTIVE");
  });

  it("updates budget warnings for posted expenses", async () => {
    const f = await setup();
    await createBudget(f.user, {
      categoryId: f.rent,
      currency: "USD",
      month: "2026-02",
      amount: "300",
      alertThresholdPercent: 80,
    });
    await rule(f);
    await runDueRules({ now: at("2026-03-01") });
    expect(
      (await getAlertsSummary(f.user, 10)).alerts.map((a) => a.thresholdPercent).sort(),
    ).toEqual([100, 80]);
  });
});

describe("editing and deleting", () => {
  it("changes only future occurrences and never re-posts a date", async () => {
    const f = await setup();
    const { id } = await rule(f);
    await runDueRules({ now: at("2026-03-15") });
    const { rule: view } = await getRecurring(f.user, id);
    // Same schedule, new amount, start moved back onto posted dates.
    await updateRecurring(f.user, {
      id,
      expectedUpdatedAt: view.updatedAt.toISOString(),
      name: "Rent (new)",
      type: "EXPENSE",
      accountId: f.bank,
      categoryId: f.rent,
      amount: "350",
      frequency: "MONTHLY",
      interval: 1,
      startOn: "2026-01-31",
    });
    // Posted: 31 Jan and 28 Feb. Dates that were due but not yet posted (the
    // engine last ran "on" 15 Mar) are kept, with the new amount, not skipped
    // (QA-07, PRD §6.6 catch-up policy); posted dates are never redone.
    expect(await nextOf(id)).toBe("2026-03-31");
    const amounts = await prisma.transaction.findMany({
      where: { recurringRuleId: id },
      select: { amountMinor: true },
    });
    expect(amounts.map((a) => a.amountMinor)).toEqual([30000n, 30000n]);
  });

  it("deleting a rule keeps its posted transactions as ordinary records", async () => {
    const f = await setup();
    const { id } = await rule(f);
    await runDueRules({ now: at("2026-03-15") });
    await deleteRecurring(f.user, id);
    const txs = await prisma.transaction.findMany({ where: { userId: f.user.id } });
    expect(txs).toHaveLength(2);
    expect(txs.every((t) => t.recurringRuleId === null && t.recurrenceDate === null)).toBe(true);
    expect(await prisma.recurringRun.count()).toBe(0);
  });

  it("never exposes or changes another user's rules", async () => {
    const f = await setup();
    const other = await setup();
    const { id } = await rule(f);
    await expect(getRecurring(other.user, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(pauseRecurring(other.user, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteRecurring(other.user, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(rule(other, { accountId: f.bank })).rejects.toBeInstanceOf(ValidationError);
    expect((await listRecurring(other.user)).rules).toEqual([]);
  });
});

describe("upcoming", () => {
  it("lists scheduled dates that are not posted, marking due ones", async () => {
    const f = await setup();
    await rule(f, { frequency: "WEEKLY", startOn: addDays(today(), -1) });
    const { upcoming } = await listRecurring(f.user);
    expect(upcoming[0]).toMatchObject({ date: addDays(today(), -1) as IsoDate, due: true });
    expect(upcoming.slice(1).every((u) => !u.due)).toBe(true);
    expect(await prisma.transaction.count()).toBe(0);
  });
});

describe("duplicate submissions (FIN-1)", () => {
  it("creates one rule when the same request arrives twice at once", async () => {
    const f = await setup();
    const clientRequestId = crypto.randomUUID();
    const [a, b] = await Promise.all([rule(f, { clientRequestId }), rule(f, { clientRequestId })]);
    expect(a.id).toBe(b.id);
    expect(await prisma.recurringRule.count({ where: { userId: f.user.id } })).toBe(1);

    // A later retry also returns the first rule, and the engine posts each date once.
    const again = await rule(f, { clientRequestId });
    expect(again.id).toBe(a.id);
    await runDueRules({ now: at(today()) });
    const dates = await postedDates(a.id);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates.length).toBeGreaterThan(0);
  });

  it("keeps different requests separate and leaves rules without an id untouched", async () => {
    const f = await setup();
    await rule(f, { clientRequestId: crypto.randomUUID() });
    await rule(f, { clientRequestId: crypto.randomUUID() });
    await rule(f);
    await rule(f);
    expect(await prisma.recurringRule.count({ where: { userId: f.user.id } })).toBe(4);
  });

  it("does not let another user's request id collide", async () => {
    const f = await setup();
    const g = await setup();
    const clientRequestId = crypto.randomUUID();
    const mine = await rule(f, { clientRequestId });
    const theirs = await rule(g, { clientRequestId });
    expect(theirs.id).not.toBe(mine.id);
  });
});
