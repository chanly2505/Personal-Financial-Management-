import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  archiveAccount,
  createAccount,
  getAccount,
  getAccountsOverview,
  updateAccount,
} from "@/features/accounts/server/service";
import { createBudget, getAlertsSummary } from "@/features/budgets/server/service";
import { addContribution, createGoal, getGoal, updateGoal } from "@/features/goals/server/service";
import {
  createRecurring,
  getRecurring,
  runDueRules,
  updateRecurring,
} from "@/features/recurring/server/service";
import { preferencesSchema } from "@/features/settings/schemas";
import { ledgerFiltersSchema } from "@/features/transactions/schemas";
import {
  createEntry,
  createTransfer,
  getLedgerPage,
  getRecord,
  reverseTransfer,
  updateEntry,
} from "@/features/transactions/server/service";
import { addDays, timeZoneChoices, todayInTimeZone } from "@/lib/dates";
import { ValidationError } from "@/server/errors";

import { registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

/**
 * Regression tests for defects confirmed in the Phase 11 QA audit
 * (docs/QA_REPORT.md). Each test reproduces the original failure.
 */

const TZ = "Asia/Phnom_Penh";
type U = { id: string; timezone: string };
const today = () => todayInTimeZone(TZ);

async function newUser(): Promise<U> {
  return { id: (await registerTestUser()).id, timezone: TZ };
}
const category = async (userId: string, name: string) =>
  (await prisma.category.findFirstOrThrow({ where: { userId, name } })).id;
const account = async (user: U, name: string, currency: "USD" | "KHR" = "USD", opening = "0") =>
  (await createAccount(user, { name, type: "BANK", currency, openingBalance: opening })).id;

beforeEach(async () => {
  await resetDatabase();
});

describe("QA-01 timezones the database cannot read (P1)", () => {
  const prefs = {
    baseCurrency: "USD",
    dateFormat: "D_MMM_Y",
    numberFormat: "COMMA_DOT",
    currencyDisplay: "SYMBOL",
  } as const;

  it("rejects offsets and removed zones, and stores old aliases by their current name", () => {
    const tz = (timezone: string) => preferencesSchema.safeParse({ ...prefs, timezone });
    expect(tz("+01:00").success).toBe(false);
    expect(tz("SystemV/EST5").success).toBe(false);
    expect(tz("US/Pacific-New").success).toBe(false);
    expect(tz("Asia/Saigon").data?.timezone).toBe("Asia/Ho_Chi_Minh");
    expect(tz("Asia/Calcutta").data?.timezone).toBe("Asia/Kolkata");
    expect(tz("Asia/Phnom_Penh").data?.timezone).toBe("Asia/Phnom_Penh");
    expect(tz("UTC").data?.timezone).toBe("UTC");
  });

  it("every timezone offered in Settings is readable by PostgreSQL", async () => {
    const rows = await prisma.$queryRaw<{ name: string }[]>`SELECT name FROM pg_timezone_names`;
    const known = new Set(rows.map((r) => r.name));
    const unreadable = timeZoneChoices().filter((tz) => !known.has(tz));
    expect(unreadable).toEqual([]);
  });

  it("one user's unreadable timezone never stops other users' recurring postings", async () => {
    const good = await newUser();
    const bad = await newUser();
    for (const u of [good, bad]) {
      await createRecurring(u, {
        name: "Rent",
        type: "EXPENSE",
        accountId: await account(u, "ABA"),
        categoryId: await category(u.id, "Housing and rent"),
        amount: "10",
        frequency: "MONTHLY",
        interval: 1,
        startOn: today(),
      });
    }
    // A value saved before validation was tightened (PostgreSQL rejects it).
    await prisma.user.update({ where: { id: bad.id }, data: { timezone: "US/Pacific-New" } });
    const summary = await runDueRules();
    expect(summary.posted).toBe(1);
    expect(await prisma.transaction.count({ where: { userId: good.id } })).toBe(1);
  });
});

describe("QA-02 archived accounts are frozen (P1)", () => {
  it("refuses to change an archived account's opening balance, so totals cannot lose money", async () => {
    const user = await newUser();
    const keep = await account(user, "ABA", "USD", "100");
    const old = await account(user, "Old");
    await archiveAccount(user, old);
    const before = (await getAccountsOverview(user)).totals;
    await expect(
      updateAccount(user, { id: old, name: "Old", type: "BANK", openingBalance: "500" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await getAccount(user, old)).openingBalanceMinor).toBe(0n);
    expect((await getAccountsOverview(user)).totals).toEqual(before);
    // Active accounts can still be edited.
    await updateAccount(user, { id: keep, name: "ABA", type: "BANK", openingBalance: "150" });
    expect((await getAccount(user, keep)).openingBalanceMinor).toBe(15000n);
  });

  it("an edit racing an archive can never leave money on an archived account", async () => {
    for (let i = 0; i < 6; i++) {
      const user = await newUser();
      const id = await account(user, `A${i}`);
      await Promise.allSettled([
        archiveAccount(user, id),
        updateAccount(user, { id, name: `A${i}`, type: "BANK", openingBalance: "500" }),
      ]);
      const a = await getAccount(user, id);
      expect(a.isArchived && a.balanceMinor !== 0n, `round ${i}`).toBe(false);
    }
  });
});

describe("QA-03 a goal's currency cannot change under a contribution (P2)", () => {
  it("never stores an amount parsed in one currency on a goal in another", async () => {
    for (let i = 0; i < 8; i++) {
      const user = await newUser();
      const { id } = await createGoal(user, { name: `G${i}`, currency: "USD", target: "100" });
      const v = (await getGoal(user, id)).goal.updatedAt.toISOString();
      await Promise.allSettled([
        addContribution(user, {
          goalId: id,
          kind: "DEPOSIT",
          amount: "10.50",
          occurredOn: today(),
          clientRequestId: randomUUID(),
        }),
        updateGoal(user, {
          id,
          expectedUpdatedAt: v,
          name: `G${i}`,
          currency: "KHR",
          target: "400,000",
        }),
      ]);
      const { goal } = await getGoal(user, id);
      if (goal.currency === "KHR") expect(goal.savedMinor, `round ${i}`).toBe(0n);
      else expect([0n, 1050n]).toContain(goal.savedMinor);
    }
  });
});

describe("QA-04 reversing a future-dated transfer (P2)", () => {
  it("dates the reversal on the transfer's own date, so today's balances never move", async () => {
    const user = await newUser();
    const a = await account(user, "A", "USD", "100");
    const b = await account(user, "B");
    const balances = async () =>
      Object.fromEntries(
        (await getAccountsOverview(user)).active.map((x) => [x.name, x.balanceMinor]),
      );
    const before = await balances();
    const future = addDays(today(), 30);
    const { id } = await createTransfer(user, {
      fromAccountId: a,
      toAccountId: b,
      amount: "40",
      occurredOn: future,
      clientRequestId: randomUUID(),
    });
    const { id: rev } = await reverseTransfer(user, { id, clientRequestId: randomUUID() });
    expect((await getRecord(user, rev)).occurredOn).toBe(future);
    expect(await balances()).toEqual(before);
  });

  it("still dates the reversal of a past transfer today", async () => {
    const user = await newUser();
    const a = await account(user, "A", "USD", "100");
    const b = await account(user, "B");
    const { id } = await createTransfer(user, {
      fromAccountId: a,
      toAccountId: b,
      amount: "40",
      occurredOn: addDays(today(), -10),
      clientRequestId: randomUUID(),
    });
    const { id: rev } = await reverseTransfer(user, { id, clientRequestId: randomUUID() });
    expect((await getRecord(user, rev)).occurredOn).toBe(today());
  });
});

describe("QA-06 a budget warning that comes back shows the current spending (P3)", () => {
  it("refreshes the spent amount when a resolved warning is re-activated", async () => {
    const user = await newUser();
    const acc = await account(user, "ABA");
    const food = await category(user.id, "Food and drinks");
    await createBudget(user, {
      categoryId: food,
      currency: "USD",
      month: today().slice(0, 7),
      amount: "100",
      alertThresholdPercent: 80,
    });
    const { id } = await createEntry(user, {
      type: "EXPENSE",
      accountId: acc,
      categoryId: food,
      amount: "80",
      occurredOn: today(),
      clientRequestId: randomUUID(),
    });
    const edit = async (amount: string) =>
      updateEntry(user, {
        id,
        expectedUpdatedAt: (await getRecord(user, id)).updatedAt.toISOString(),
        type: "EXPENSE",
        accountId: acc,
        categoryId: food,
        amount,
        occurredOn: today(),
      });
    await edit("50"); // below 80 % → resolved
    expect((await getAlertsSummary(user, 10)).alerts).toHaveLength(0);
    await edit("95"); // 95 % → back
    const [alert] = (await getAlertsSummary(user, 10)).alerts;
    expect(alert).toMatchObject({ thresholdPercent: 80, spentAtAlertMinor: 9500n });
  });
});

describe("QA-07 editing a rule keeps its pending catch-up dates (P3)", () => {
  it("does not skip past occurrences the user asked to record", async () => {
    const user = await newUser();
    const start = addDays(today(), -100);
    const { id } = await createRecurring(user, {
      name: "Gym",
      type: "EXPENSE",
      accountId: await account(user, "ABA"),
      categoryId: await category(user.id, "Health"),
      amount: "5",
      frequency: "WEEKLY",
      interval: 1,
      startOn: start,
      catchUp: true,
    });
    const { rule } = await getRecurring(user, id);
    expect(rule.nextOccurrenceOn).toBe(start);
    await updateRecurring(user, {
      id,
      expectedUpdatedAt: rule.updatedAt.toISOString(),
      name: "Gym membership",
      type: "EXPENSE",
      accountId: rule.account.id,
      categoryId: rule.category.id,
      amount: "5",
      frequency: "WEEKLY",
      interval: 1,
      startOn: start,
    });
    expect((await getRecurring(user, id)).rule.nextOccurrenceOn).toBe(start);
    await runDueRules();
    // 100 days back, weekly, including the start date and today's week: 15 occurrences.
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(15);
  });
});

describe("QA-08 a goal's saved amount never goes below zero at any date (P3)", () => {
  it("rejects a withdrawal dated before the money it takes back", async () => {
    const user = await newUser();
    const { id } = await createGoal(user, { name: "Trip", currency: "USD", target: "500" });
    const put = (kind: "DEPOSIT" | "WITHDRAWAL", amount: string, occurredOn: string) =>
      addContribution(user, {
        goalId: id,
        kind,
        amount,
        occurredOn,
        clientRequestId: randomUUID(),
      });
    await put("DEPOSIT", "100", today());
    await expect(put("WITHDRAWAL", "100", "2020-01-01")).rejects.toBeInstanceOf(ValidationError);
    await put("WITHDRAWAL", "100", today());
    expect((await getGoal(user, id)).goal.savedMinor).toBe(0n);
  });

  it("refuses to delete a deposit that an earlier-dated withdrawal relies on", async () => {
    const user = await newUser();
    const { id } = await createGoal(user, { name: "Trip", currency: "USD", target: "500" });
    const put = (kind: "DEPOSIT" | "WITHDRAWAL", amount: string, occurredOn: string) =>
      addContribution(user, {
        goalId: id,
        kind,
        amount,
        occurredOn,
        clientRequestId: randomUUID(),
      });
    const first = await put("DEPOSIT", "100", addDays(today(), -10));
    await put("WITHDRAWAL", "100", addDays(today(), -5));
    await put("DEPOSIT", "150", today());
    const { deleteContribution } = await import("@/features/goals/server/service");
    // The total would be 50, but on day −5 the saved amount would be −100.
    await expect(
      deleteContribution(user, { goalId: id, contributionId: first.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("QA-09 an amount filter above the largest amount matches nothing (P3)", () => {
  it("does not clamp the minimum down to the largest storable amount", async () => {
    const user = await newUser();
    await createEntry(user, {
      type: "INCOME",
      accountId: await account(user, "ABA"),
      categoryId: await category(user.id, "Salary"),
      amount: "9,999,999,999,999.99",
      occurredOn: today(),
      clientRequestId: randomUUID(),
    });
    const page = await getLedgerPage(
      user,
      ledgerFiltersSchema.parse({ min: "999999999999999.99" }),
    );
    expect(page.total).toBe(0);
    const all = await getLedgerPage(user, ledgerFiltersSchema.parse({ min: "9999999999999.99" }));
    expect(all.total).toBe(1);
  });
});

describe("QA-12 registration is rate limited even when the client IP is unknown (P2)", () => {
  it("allows 30 sign-ups an hour without an IP, then refuses", async () => {
    const { registerUser } = await import("@/features/auth/server/service");
    const { RateLimitedError } = await import("@/server/errors");
    const stamp = Date.now();
    for (let i = 0; i < 30; i++) {
      await registerUser({
        email: `bulk${i}-${stamp}@example.test`,
        password: "a long password 1",
      });
    }
    await expect(
      registerUser({ email: `bulk-last-${stamp}@example.test`, password: "a long password 1" }),
    ).rejects.toBeInstanceOf(RateLimitedError);
    // With a trusted client IP the per-IP rule applies instead.
    await registerUser(
      { email: `with-ip-${stamp}@example.test`, password: "a long password 1" },
      "203.0.113.7",
    );
  });
});

describe("QA-13 expired rate-limit windows are cleaned up (P3)", () => {
  it("is part of every scheduled run", async () => {
    const { runScheduledJobs } = await import("@/server/scheduled-jobs");
    const day = 24 * 60 * 60 * 1000;
    await prisma.authRateLimit.createMany({
      data: [
        { key: "a".repeat(64), count: 3, resetAt: new Date(Date.now() - 2 * day) },
        { key: "b".repeat(64), count: 1, resetAt: new Date(Date.now() + 60_000) },
      ],
    });
    await runScheduledJobs();
    expect((await prisma.authRateLimit.findMany()).map((r) => r.key)).toEqual(["b".repeat(64)]);
  });
});

describe("QA-14 a password-reset link works only once, even when submitted twice at once (P3)", () => {
  it("lets exactly one of two simultaneous submissions change the password", async () => {
    const { createHash, randomBytes } = await import("node:crypto");
    const { resetPassword } = await import("@/features/auth/server/service");
    const { storeResetToken } = await import("@/features/auth/server/repository");
    const user = await newUser();
    const token = randomBytes(32).toString("base64url");
    await storeResetToken(
      user.id,
      createHash("sha256").update(token).digest("hex"),
      new Date(Date.now() + 10 * 60_000),
    );
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion;
    const results = await Promise.allSettled([
      resetPassword(token, "first new password!"),
      resetPassword(token, "second new password"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const after = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion;
    expect(after).toBe(before + 1);
  });
});

describe("Phase 13 security review", () => {
  it("F3: rate-limit keys are keyed hashes — a dump cannot be matched by hashing guesses", async () => {
    const { createHash } = await import("node:crypto");
    const { RATE_LIMITS, consumeRateLimit } = await import("@/server/auth/rate-limit");
    const ip = "203.0.113.7";
    await consumeRateLimit(RATE_LIMITS.signInPerIp, ip);
    const keys = (await prisma.authRateLimit.findMany()).map((r) => r.key);
    const plain = createHash("sha256")
      .update(`${RATE_LIMITS.signInPerIp.scope}:${ip}`)
      .digest("hex");
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(keys).not.toContain(plain);
    expect(keys[0]).not.toContain(ip);
  });
});
