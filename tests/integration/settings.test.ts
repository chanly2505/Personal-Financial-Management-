import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "@/server/auth/session";

import { TEST_PASSWORD, registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

/**
 * Settings against a real database: persistence, notification preferences,
 * "preferences never change financial data", the full data export and account
 * deletion. Only the session lookup is a test double.
 */
const session = vi.hoisted(() => ({ current: null as CurrentUser | null }));
vi.mock("@/server/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/auth/session")>();
  return { ...original, getCurrentUser: async () => session.current };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const settings = await import("@/features/settings/server/service");
const { GET: exportAll } = await import("@/app/api/me/export/route");
const { createAccount, getAccountsOverview } = await import("@/features/accounts/server/service");
const { createEntry, createTransfer } = await import("@/features/transactions/server/service");
const { createBudget, getAlertsSummary } = await import("@/features/budgets/server/service");
const { getBudgetFormData } = await import("@/features/budgets/server/form-data");
const { createRecurring } = await import("@/features/recurring/server/service");
const { addContribution, createGoal } = await import("@/features/goals/server/service");
const { deleteAccount } = await import("@/features/auth/server/service");
const { addDays, todayInTimeZone } = await import("@/lib/dates");

const TZ = "Asia/Phnom_Penh";

async function newUser() {
  const registered = await registerTestUser();
  const user: CurrentUser = {
    id: registered.id,
    email: registered.email,
    name: registered.name ?? null,
    timezone: TZ,
    baseCurrency: "USD",
  };
  const food = (
    await prisma.category.findFirstOrThrow({ where: { userId: user.id, name: "Food and drinks" } })
  ).id;
  return { user, food };
}

/** A user with one of everything (accounts, records, transfer, budget, rule, goal). */
async function populated() {
  const { user, food } = await newUser();
  const bank = (
    await createAccount(user, { name: "ABA", type: "BANK", currency: "USD", openingBalance: "100" })
  ).id;
  const wallet = (
    await createAccount(user, {
      name: "Wing",
      type: "DIGITAL_WALLET",
      currency: "USD",
      openingBalance: "0",
    })
  ).id;
  const today = todayInTimeZone(TZ);
  await createEntry(user, {
    type: "EXPENSE",
    accountId: bank,
    categoryId: food,
    amount: "9",
    occurredOn: today,
    payee: "Lucky",
    clientRequestId: randomUUID(),
  });
  await createTransfer(user, {
    fromAccountId: bank,
    toAccountId: wallet,
    amount: "5",
    occurredOn: today,
    clientRequestId: randomUUID(),
  });
  const budget = await createBudget(user, {
    categoryId: food,
    currency: "USD",
    month: today.slice(0, 7),
    amount: "10",
    alertThresholdPercent: 80,
  });
  await createRecurring(user, {
    name: "Phone bill",
    type: "EXPENSE",
    accountId: bank,
    categoryId: food,
    amount: "5",
    frequency: "MONTHLY",
    interval: 1,
    startOn: addDays(today, 10),
  });
  const goal = await createGoal(user, { name: "Trip", currency: "USD", target: "500" });
  await addContribution(user, {
    goalId: goal.id,
    kind: "DEPOSIT",
    amount: "20",
    occurredOn: today,
    clientRequestId: randomUUID(),
  });
  return { user, food, bank, wallet, budgetId: budget.id };
}

beforeEach(async () => {
  await resetDatabase();
  session.current = null;
});

describe("persistence", () => {
  it("saves each settings card independently and reads it back", async () => {
    const { user } = await newUser();
    expect(await settings.getSettings(user.id)).toMatchObject({
      dateFormat: "D_MMM_Y",
      numberFormat: "COMMA_DOT",
      currencyDisplay: "SYMBOL",
      budgetAlertMode: "ALL",
      defaultAlertThreshold: 80,
    });
    await settings.updateProfile(user.id, { name: "  " });
    await settings.updatePreferences(user.id, {
      baseCurrency: "KHR",
      timezone: "Asia/Bangkok",
      dateFormat: "ISO",
      numberFormat: "SPACE_COMMA",
      currencyDisplay: "CODE",
    });
    await settings.updateNotifications(user.id, {
      budgetAlertMode: "LIMIT_ONLY",
      defaultAlertThreshold: 90,
    });
    expect(await settings.getSettings(user.id)).toMatchObject({
      name: null,
      baseCurrency: "KHR",
      timezone: "Asia/Bangkok",
      dateFormat: "ISO",
      numberFormat: "SPACE_COMMA",
      currencyDisplay: "CODE",
      budgetAlertMode: "LIMIT_ONLY",
      defaultAlertThreshold: 90,
    });
    await settings.updateProfile(user.id, { name: "Dara" });
    expect((await settings.getSettings(user.id)).name).toBe("Dara");
  });

  it("is loaded with the session, so every page formats with it", async () => {
    const { user } = await newUser();
    await settings.updatePreferences(user.id, {
      baseCurrency: "USD",
      timezone: TZ,
      dateFormat: "MMM_D_Y",
      numberFormat: "DOT_COMMA",
      currencyDisplay: "CODE",
    });
    const { createAuthSession } = await import("@/features/auth/server/repository");
    const { resolveSessionUser } = await import("@/server/auth/session");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const { id: sessionId } = await createAuthSession(user.id, new Date(Date.now() + 60_000));
    const resolved = await resolveSessionUser({
      user: { id: user.id, sessionVersion: row.sessionVersion, sessionId },
    });
    expect(resolved?.formatPrefs).toEqual({
      dateFormat: "MMM_D_Y",
      numberFormat: "DOT_COMMA",
      currencyDisplay: "CODE",
    });
  });

  it("the database refuses an out-of-range default warning level", async () => {
    const { user } = await newUser();
    await expect(
      prisma.user.update({ where: { id: user.id }, data: { defaultAlertThreshold: 0 } }),
    ).rejects.toThrow(/default_alert_threshold_range_chk/);
  });

  it("never changes another user's settings", async () => {
    const a = await newUser();
    const b = await newUser();
    await settings.updatePreferences(a.user.id, {
      baseCurrency: "KHR",
      timezone: TZ,
      dateFormat: "ISO",
      numberFormat: "DOT_COMMA",
      currencyDisplay: "CODE",
    });
    expect(await settings.getSettings(b.user.id)).toMatchObject({
      baseCurrency: "USD",
      dateFormat: "D_MMM_Y",
    });
  });
});

describe("preferences never alter financial data", () => {
  it("leaves every stored amount, date and balance exactly as it was", async () => {
    const { user } = await populated();
    const snapshot = async () => ({
      transactions: await prisma.transaction.findMany({
        where: { userId: user.id },
        select: { id: true, amountMinor: true, occurredOn: true, updatedAt: true },
        orderBy: { id: "asc" },
      }),
      transfers: await prisma.transfer.findMany({
        where: { userId: user.id },
        select: { id: true, fromAmountMinor: true, toAmountMinor: true, updatedAt: true },
      }),
      budgets: await prisma.budget.findMany({
        where: { userId: user.id },
        select: { amountMinor: true, currency: true },
      }),
      accounts: await prisma.financialAccount.findMany({
        where: { userId: user.id },
        select: { currency: true, openingBalanceMinor: true, updatedAt: true },
        orderBy: { name: "asc" },
      }),
      balances: (await getAccountsOverview(user)).totals,
    });
    const before = await snapshot();
    await settings.updatePreferences(user.id, {
      baseCurrency: "KHR",
      timezone: "Asia/Bangkok",
      dateFormat: "ISO",
      numberFormat: "DOT_COMMA",
      currencyDisplay: "CODE",
    });
    expect(await snapshot()).toEqual(before);
    // The USD account is still USD; nothing was converted to the new default currency.
    expect(before.balances).toEqual([{ currency: "USD", balanceMinor: 9100n, accountCount: 2 }]);
  });
});

describe("budget notifications", () => {
  it("applies the chosen warnings at once: all, only at the limit, off", async () => {
    const { user, bank, food } = await populated(); // food budget 10.00, spent 9.00 → 90 %
    const thresholds = async () =>
      (await getAlertsSummary(user, 10)).alerts.map((a) => a.thresholdPercent).sort();
    expect(await thresholds()).toEqual([80]);

    await settings.updateNotifications(user.id, {
      budgetAlertMode: "LIMIT_ONLY",
      defaultAlertThreshold: 80,
    });
    expect(await thresholds()).toEqual([]);
    await createEntry(user, {
      type: "EXPENSE",
      accountId: bank,
      categoryId: food,
      amount: "1",
      occurredOn: todayInTimeZone(TZ),
      clientRequestId: randomUUID(),
    }); // 10.00 of 10.00 → limit reached
    expect(await thresholds()).toEqual([100]);

    await settings.updateNotifications(user.id, {
      budgetAlertMode: "OFF",
      defaultAlertThreshold: 80,
    });
    expect(await thresholds()).toEqual([]);

    await settings.updateNotifications(user.id, {
      budgetAlertMode: "ALL",
      defaultAlertThreshold: 80,
    });
    expect(await thresholds()).toEqual([100, 80].sort());
  });

  it("suggests the default warning level for new budgets", async () => {
    const { user } = await newUser();
    await settings.updateNotifications(user.id, {
      budgetAlertMode: "ALL",
      defaultAlertThreshold: 65,
    });
    expect((await getBudgetFormData(user)).defaultThreshold).toBe(65);
  });
});

describe("data export", () => {
  it("requires a session", async () => {
    expect((await exportAll(new Request("http://localhost/api/me/export"), {})).status).toBe(401);
  });

  it("contains every record of the user, exact amounts, and no secrets", async () => {
    const { user } = await populated();
    const other = await populated();
    session.current = user;
    const response = await exportAll(new Request("http://localhost/api/me/export"), {});
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    const data = JSON.parse(text);
    expect(data).toMatchObject({ format: "personal-finance-export", version: 1 });
    expect(data.profile.email).toBe(user.email);
    expect(data.accounts.map((a: { name: string }) => a.name).sort()).toEqual(["ABA", "Wing"]);
    expect(data.accounts.find((a: { name: string }) => a.name === "ABA").openingBalance).toBe(
      "100.00",
    );
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0]).toMatchObject({
      type: "EXPENSE",
      amount: "9.00",
      currency: "USD",
    });
    expect(data.transfers[0]).toMatchObject({ amount: "5.00", currency: "USD" });
    expect(data.budgets[0]).toMatchObject({ limit: "10.00", alertThresholdPercent: 80 });
    expect(data.recurringRules[0]).toMatchObject({ name: "Phone bill", amount: "5.00" });
    expect(data.savingsGoals[0]).toMatchObject({ name: "Trip", target: "500.00" });
    expect(data.savingsGoals[0].contributions[0].amount).toBe("20.00");
    expect(data.categories.length).toBeGreaterThan(5);
    for (const secret of ["passwordHash", "password_hash", "sessionVersion", "clientRequestId"]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain(other.user.email);
    expect(text).not.toContain(other.bank);
  });

  it("streams large ledgers completely", async () => {
    const { user, bank, food } = await populated();
    await prisma.transaction.createMany({
      data: Array.from({ length: 2_500 }, (_, i) => ({
        userId: user.id,
        accountId: bank,
        categoryId: food,
        type: "EXPENSE" as const,
        amountMinor: BigInt(i + 1),
        occurredOn: new Date("2026-01-15T00:00:00Z"),
      })),
    });
    session.current = user;
    const data = JSON.parse(
      await (await exportAll(new Request("http://localhost/api/me/export"), {})).text(),
    );
    expect(data.transactions).toHaveLength(2_501);
    expect(new Set(data.transactions.map((t: { id: string }) => t.id)).size).toBe(2_501);
  });
});

describe("account deletion", () => {
  it("removes every kind of record the user had — and nothing of anyone else's", async () => {
    const { user } = await populated();
    const other = await populated();
    await prisma.budgetAlert.count({ where: { userId: user.id } }); // alerts exist (90 % of budget)
    expect(await settings.getRecordCounts(user.id)).toMatchObject({
      accounts: 2,
      transactions: 1,
      transfers: 1,
      budgets: 1,
      recurringRules: 1,
      savingsGoals: 1,
    });

    await expect(deleteAccount(user.id, "wrong password")).rejects.toThrow();
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);

    await deleteAccount(user.id, TEST_PASSWORD);
    const where = { userId: user.id };
    const remaining = await Promise.all([
      prisma.user.count({ where: { id: user.id } }),
      prisma.financialAccount.count({ where }),
      prisma.category.count({ where }),
      prisma.transaction.count({ where }),
      prisma.transfer.count({ where }),
      prisma.budget.count({ where }),
      prisma.budgetAlert.count({ where }),
      prisma.recurringRule.count({ where }),
      prisma.recurringRun.count({ where }),
      prisma.savingsGoal.count({ where }),
      prisma.savingsContribution.count({ where }),
      prisma.passwordResetToken.count({ where }),
    ]);
    expect(remaining.every((n) => n === 0)).toBe(true);
    expect(await settings.getRecordCounts(other.user.id)).toMatchObject({
      accounts: 2,
      transactions: 1,
      budgets: 1,
    });
  });
});
