import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "@/features/accounts/server/service";
import {
  archiveBudget,
  copyPreviousMonth,
  createBudget,
  deleteBudget,
  getAlertsSummary,
  getBudget,
  getBudgetMonth,
  markAlertsRead,
  reconcileCurrentMonthAlerts,
  restoreBudget,
  updateBudget,
} from "@/features/budgets/server/service";
import { budgetUsage } from "@/features/budgets/usage";
import { archiveCategory } from "@/features/categories/server/service";
import {
  createEntry,
  createTransfer,
  deleteEntry,
  updateEntry,
} from "@/features/transactions/server/service";
import { todayInTimeZone } from "@/lib/dates";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

import { registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

/** Budgets against real expense records: calculations, boundaries, alerts, isolation. */

const TZ = "Asia/Phnom_Penh";
type U = { id: string; timezone: string };
const MONTH = "2026-03";

async function newUser(): Promise<U> {
  const user = await registerTestUser();
  return { id: user.id, timezone: TZ };
}
const category = async (userId: string, name: string) =>
  (await prisma.category.findFirstOrThrow({ where: { userId, name } })).id;

interface Fixture {
  user: U;
  usd: string;
  usd2: string;
  khr: string;
  food: string;
  rent: string;
  salary: string;
}

async function setup(): Promise<Fixture> {
  const user = await newUser();
  const acct = async (name: string, currency: "USD" | "KHR") =>
    (await createAccount(user, { name, type: "BANK", currency, openingBalance: "0" })).id;
  return {
    user,
    usd: await acct("ABA", "USD"),
    usd2: await acct("Wing", "USD"),
    khr: await acct("Cash", "KHR"),
    food: await category(user.id, "Food and drinks"),
    rent: await category(user.id, "Housing and rent"),
    salary: await category(user.id, "Salary"),
  };
}

function expense(
  f: Fixture,
  amount: string,
  occurredOn: string,
  extra: Record<string, string> = {},
) {
  return createEntry(f.user, {
    type: "EXPENSE",
    accountId: f.usd,
    categoryId: f.food,
    amount,
    occurredOn,
    clientRequestId: randomUUID(),
    ...extra,
  });
}

function foodBudget(f: Fixture, amount = "200", alertThresholdPercent = 80, month = MONTH) {
  return createBudget(f.user, {
    categoryId: f.food,
    currency: "USD",
    month,
    amount,
    alertThresholdPercent,
  });
}

async function version(id: string) {
  return (await prisma.transaction.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();
}

beforeEach(async () => {
  await resetDatabase();
});

describe("usage rules", () => {
  it("computes remaining and floored usage, allowing more than 100 %", () => {
    expect(budgetUsage(20000n, 0n, 80)).toEqual({
      remainingMinor: 20000n,
      usagePercent: 0,
      status: "on_track",
    });
    expect(budgetUsage(20000n, 15999n, 80)).toMatchObject({ usagePercent: 79, status: "on_track" });
    expect(budgetUsage(20000n, 16000n, 80)).toMatchObject({ usagePercent: 80, status: "warning" });
    expect(budgetUsage(20000n, 19999n, 80)).toMatchObject({ usagePercent: 99, status: "warning" });
    expect(budgetUsage(20000n, 20000n, 80)).toMatchObject({
      remainingMinor: 0n,
      usagePercent: 100,
      status: "reached",
    });
    expect(budgetUsage(20000n, 30050n, 80)).toMatchObject({
      remainingMinor: -10050n,
      usagePercent: 150,
      status: "over",
    });
  });

  it("handles a zero or negative limit without dividing by zero", () => {
    expect(budgetUsage(0n, 500n, 80)).toEqual({
      remainingMinor: -500n,
      usagePercent: null,
      status: "invalid",
    });
    expect(budgetUsage(-1n, 0n, 80)).toMatchObject({ usagePercent: null, status: "invalid" });
  });
});

describe("spent", () => {
  it("counts only this category's expenses, in the budget currency and month", async () => {
    const f = await setup();
    const { id } = await foodBudget(f);
    await expense(f, "10", "2026-03-01"); // first day: counts
    await expense(f, "20", "2026-03-31"); // last day: counts
    await expense(f, "5.50", "2026-03-15", { accountId: f.usd2 }); // another USD account: counts
    await expense(f, "99", "2026-02-28"); // previous month
    await expense(f, "99", "2026-04-01"); // next month
    await expense(f, "50", "2026-03-10", { categoryId: f.rent }); // another category
    await expense(f, "40,000", "2026-03-10", { accountId: f.khr }); // another currency
    await createEntry(f.user, {
      type: "INCOME",
      accountId: f.usd,
      categoryId: f.salary,
      amount: "1000",
      occurredOn: "2026-03-05",
      clientRequestId: randomUUID(),
    }); // income never counts
    await createTransfer(f.user, {
      fromAccountId: f.usd,
      toAccountId: f.usd2,
      amount: "300",
      occurredOn: "2026-03-05",
      clientRequestId: randomUUID(),
    }); // transfers never count
    // 10 + 20 + 5.50 = 35.50 of 200.00 → 17 %, remaining 164.50.
    expect(await getBudget(f.user, id)).toMatchObject({
      limitMinor: 20000n,
      spentMinor: 3550n,
      remainingMinor: 16450n,
      usagePercent: 17,
      status: "on_track",
    });
  });

  it("follows edits and deletions of expenses", async () => {
    const f = await setup();
    const { id } = await foodBudget(f);
    const { id: entry } = await expense(f, "50", "2026-03-10");
    expect((await getBudget(f.user, id)).spentMinor).toBe(5000n);

    const edit = async (changes: Record<string, string>) =>
      updateEntry(f.user, {
        id: entry,
        expectedUpdatedAt: await version(entry),
        type: "EXPENSE",
        accountId: f.usd,
        categoryId: f.food,
        amount: "50",
        occurredOn: "2026-03-10",
        ...changes,
      });
    await edit({ amount: "75.25" });
    expect((await getBudget(f.user, id)).spentMinor).toBe(7525n);
    await edit({ occurredOn: "2026-04-02" }); // moved out of the month
    expect((await getBudget(f.user, id)).spentMinor).toBe(0n);
    await edit({ occurredOn: "2026-03-02", categoryId: f.rent }); // other category
    expect((await getBudget(f.user, id)).spentMinor).toBe(0n);
    await edit({ categoryId: f.food, accountId: f.khr, amount: "1000" }); // other currency
    expect((await getBudget(f.user, id)).spentMinor).toBe(0n);
    await edit({ accountId: f.usd, amount: "12" });
    expect((await getBudget(f.user, id)).spentMinor).toBe(1200n);
    await deleteEntry(f.user, entry);
    expect((await getBudget(f.user, id)).spentMinor).toBe(0n);
  });

  it("shows overspending beyond 100 %", async () => {
    const f = await setup();
    const { id } = await foodBudget(f, "100");
    await expense(f, "150.75", "2026-03-10");
    expect(await getBudget(f.user, id)).toMatchObject({
      remainingMinor: -5075n,
      usagePercent: 150,
      status: "over",
    });
  });

  it("never counts another user's expenses", async () => {
    const f = await setup();
    const other = await setup();
    const { id } = await foodBudget(f);
    await expense(other, "500", "2026-03-10");
    expect((await getBudget(f.user, id)).spentMinor).toBe(0n);
    await expect(getBudget(other.user, id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("month overview", () => {
  it("totals per currency and separates unbudgeted spending", async () => {
    const f = await setup();
    await foodBudget(f, "200");
    await createBudget(f.user, {
      categoryId: f.food,
      currency: "KHR",
      month: MONTH,
      amount: "100,000",
      alertThresholdPercent: 80,
    });
    await expense(f, "250", "2026-03-10"); // food USD: over
    await expense(f, "30", "2026-03-11", { categoryId: f.rent }); // rent USD: unbudgeted
    await expense(f, "20,000", "2026-03-12", { accountId: f.khr }); // food KHR

    const month = await getBudgetMonth(f.user, MONTH);
    expect(month.month).toBe(MONTH);
    expect(month.totals).toEqual([
      {
        currency: "USD",
        limitMinor: 20000n,
        spentMinor: 25000n,
        remainingMinor: -5000n,
        usagePercent: 125,
        unbudgetedMinor: 3000n,
        overCount: 1,
        warningCount: 0,
      },
      {
        currency: "KHR",
        limitMinor: 100000n,
        spentMinor: 20000n,
        remainingMinor: 80000n,
        usagePercent: 20,
        unbudgetedMinor: 0n,
        overCount: 0,
        warningCount: 0,
      },
    ]);
    const usd = month.spending.find((s) => s.currency === "USD");
    expect(usd?.lines.map((l) => [l.name, l.spentMinor, l.budgetId !== null])).toEqual([
      ["Food and drinks", 25000n, true],
      ["Housing and rent", 3000n, false],
    ]);
  });

  it("navigates months, defaulting to the current one", async () => {
    const f = await setup();
    await foodBudget(f, "200", 80, "2026-02");
    expect((await getBudgetMonth(f.user, "2026-02")).active).toHaveLength(1);
    expect((await getBudgetMonth(f.user, MONTH)).active).toHaveLength(0);
    const current = await getBudgetMonth(f.user);
    expect(current.month).toBe(current.currentMonth);
  });

  it("copies last month's active budgets once, skipping archived ones and categories", async () => {
    const f = await setup();
    await foodBudget(f, "200", 75, "2026-02");
    const { id: rent } = await createBudget(f.user, {
      categoryId: f.rent,
      currency: "USD",
      month: "2026-02",
      amount: "500",
      alertThresholdPercent: 80,
    });
    await archiveBudget(f.user, rent);
    expect((await getBudgetMonth(f.user, MONTH)).copyableCount).toBe(1);
    expect(await copyPreviousMonth(f.user, MONTH)).toEqual({ created: 1 });
    expect(await copyPreviousMonth(f.user, MONTH)).toEqual({ created: 0 });
    const march = await getBudgetMonth(f.user, MONTH);
    expect(
      march.active.map((b) => [b.category.name, b.limitMinor, b.alertThresholdPercent]),
    ).toEqual([["Food and drinks", 20000n, 75]]);
    expect(march.copyableCount).toBe(0);
  });
});

describe("validation", () => {
  it.each([
    ["zero", "0", /greater than zero/],
    ["negative", "-10", /cannot be negative/],
    ["text", "lots", /valid number/],
    ["too many decimals", "1.005", /at most 2 decimal/],
  ] as const)("rejects a %s limit", async (_label, amount, message) => {
    const f = await setup();
    await expect(foodBudget(f, amount)).rejects.toThrow(message);
    expect(await prisma.budget.count()).toBe(0);
  });

  it("rejects KHR limits with decimals, income categories, archived categories and other users' categories", async () => {
    const f = await setup();
    const other = await setup();
    await expect(
      createBudget(f.user, {
        categoryId: f.food,
        currency: "KHR",
        month: MONTH,
        amount: "10.5",
        alertThresholdPercent: 80,
      }),
    ).rejects.toThrow(/whole numbers/);
    await expect(
      createBudget(f.user, {
        categoryId: f.salary,
        currency: "USD",
        month: MONTH,
        amount: "10",
        alertThresholdPercent: 80,
      }),
    ).rejects.toThrow(/expense category/);
    await archiveCategory(f.user, f.rent);
    await expect(
      createBudget(f.user, {
        categoryId: f.rent,
        currency: "USD",
        month: MONTH,
        amount: "10",
        alertThresholdPercent: 80,
      }),
    ).rejects.toThrow(/archived/);
    await expect(
      createBudget(f.user, {
        categoryId: other.food,
        currency: "USD",
        month: MONTH,
        amount: "10",
        alertThresholdPercent: 80,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await prisma.budget.count()).toBe(0);
  });

  it("rejects months out of range and duplicate budgets", async () => {
    const f = await setup();
    await expect(foodBudget(f, "10", 80, "1999-12")).rejects.toBeInstanceOf(ValidationError);
    await expect(foodBudget(f, "10", 80, "2099-01")).rejects.toThrow(/up to a year ahead/);
    await foodBudget(f);
    await expect(foodBudget(f)).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects a stale edit and edits the limit with the budget's own currency", async () => {
    const f = await setup();
    const { id } = await foodBudget(f);
    const opened = (await getBudget(f.user, id)).updatedAt.toISOString();
    await updateBudget(f.user, {
      id,
      amount: "350.50",
      alertThresholdPercent: 90,
      expectedUpdatedAt: opened,
    });
    expect(await getBudget(f.user, id)).toMatchObject({
      limitMinor: 35050n,
      alertThresholdPercent: 90,
    });
    await expect(
      updateBudget(f.user, {
        id,
        amount: "10",
        alertThresholdPercent: 90,
        expectedUpdatedAt: opened,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("never lets another user change, archive or delete a budget", async () => {
    const f = await setup();
    const other = await setup();
    const { id } = await foodBudget(f);
    const opened = (await getBudget(f.user, id)).updatedAt.toISOString();
    await expect(
      updateBudget(other.user, {
        id,
        amount: "1",
        alertThresholdPercent: 80,
        expectedUpdatedAt: opened,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(archiveBudget(other.user, id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteBudget(other.user, id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getBudget(f.user, id)).limitMinor).toBe(20000n);
  });
});

describe("archive and delete", () => {
  it("archives (hidden, kept, silent), restores and deletes", async () => {
    const f = await setup();
    const { id } = await foodBudget(f, "100");
    await expense(f, "90", "2026-03-10");
    expect((await getAlertsSummary(f.user, 10)).unread).toBe(1);

    await archiveBudget(f.user, id);
    let month = await getBudgetMonth(f.user, MONTH);
    expect(month.active).toHaveLength(0);
    expect(month.archived.map((b) => b.id)).toEqual([id]);
    expect((await getAlertsSummary(f.user, 10)).unread).toBe(0);
    // With no active budget covering it, the spending shows as unbudgeted.
    expect(month.totals[0]?.unbudgetedMinor).toBe(9000n);

    await restoreBudget(f.user, id);
    month = await getBudgetMonth(f.user, MONTH);
    expect(month.active.map((b) => b.id)).toEqual([id]);
    expect((await getAlertsSummary(f.user, 10)).unread).toBe(1);

    await deleteBudget(f.user, id);
    expect(await prisma.budgetAlert.count()).toBe(0);
    expect(await prisma.transaction.count()).toBe(1);
  });
});

describe("alerts", () => {
  it("warns once at the threshold and once at 100 %, never twice", async () => {
    const f = await setup();
    const { id } = await foodBudget(f, "100", 80);
    await expense(f, "79.99", "2026-03-01");
    expect(await prisma.budgetAlert.count()).toBe(0);
    await expense(f, "0.01", "2026-03-02"); // exactly 80 %
    let alerts = await prisma.budgetAlert.findMany({ orderBy: { thresholdPercent: "asc" } });
    expect(alerts.map((a) => [a.thresholdPercent, a.spentMinor])).toEqual([[80, 8000n]]);

    await expense(f, "5", "2026-03-03"); // still 85 %: no new alert
    await expense(f, "15", "2026-03-04"); // 100 %
    await expense(f, "50", "2026-03-05"); // 150 %: no new alert
    alerts = await prisma.budgetAlert.findMany({ orderBy: { thresholdPercent: "asc" } });
    expect(alerts.map((a) => [a.thresholdPercent, a.spentMinor])).toEqual([
      [80, 8000n],
      [100, 10000n],
    ]);
    const summary = await getAlertsSummary(f.user, 10);
    expect(summary.unread).toBe(2);
    expect(summary.alerts.map((a) => [a.categoryName, a.thresholdPercent, a.month])).toEqual([
      ["Food and drinks", 100, MONTH],
      ["Food and drinks", 80, MONTH],
    ]);
    expect((await getBudget(f.user, id)).status).toBe("over");
  });

  it("resolves when spending drops and re-activates the same alert without duplicating", async () => {
    const f = await setup();
    await foodBudget(f, "100", 80);
    const { id: big } = await expense(f, "90", "2026-03-01");
    expect((await getAlertsSummary(f.user, 10)).unread).toBe(1);
    await deleteEntry(f.user, big);
    expect((await getAlertsSummary(f.user, 10)).unread).toBe(0);
    expect((await prisma.budgetAlert.findFirstOrThrow()).resolvedAt).not.toBeNull();
    await expense(f, "85", "2026-03-02");
    expect(await prisma.budgetAlert.count()).toBe(1);
    expect((await prisma.budgetAlert.findFirstOrThrow()).resolvedAt).toBeNull();
    expect((await getAlertsSummary(f.user, 10)).unread).toBe(1);
  });

  it("re-evaluates when the limit or threshold changes", async () => {
    const f = await setup();
    const { id } = await foodBudget(f, "100", 80);
    await expense(f, "85", "2026-03-01");
    expect((await getAlertsSummary(f.user, 10)).alerts.map((a) => a.thresholdPercent)).toEqual([
      80,
    ]);
    const v1 = (await getBudget(f.user, id)).updatedAt.toISOString();
    await updateBudget(f.user, {
      id,
      amount: "100",
      alertThresholdPercent: 90,
      expectedUpdatedAt: v1,
    });
    expect((await getAlertsSummary(f.user, 10)).alerts).toEqual([]); // 85 % < 90 %
    const v2 = (await getBudget(f.user, id)).updatedAt.toISOString();
    await updateBudget(f.user, {
      id,
      amount: "80",
      alertThresholdPercent: 90,
      expectedUpdatedAt: v2,
    });
    // 85 of 80 = 106 % → 90 % and 100 % reached.
    expect(
      (await getAlertsSummary(f.user, 10)).alerts.map((a) => a.thresholdPercent).sort(),
    ).toEqual([100, 90]);
  });

  it("creates one alert per threshold when expenses arrive concurrently", async () => {
    const f = await setup();
    await foodBudget(f, "100", 80);
    await Promise.all(Array.from({ length: 8 }, (_, i) => expense(f, "20", `2026-03-0${i + 1}`)));
    const alerts = await prisma.budgetAlert.findMany();
    expect(alerts.map((a) => a.thresholdPercent).sort()).toEqual([100, 80]);
    expect(alerts.every((a) => a.resolvedAt === null)).toBe(true);
  });

  it("marks alerts read, only the user's own", async () => {
    const f = await setup();
    const other = await setup();
    await foodBudget(f, "100", 80);
    await expense(f, "100", "2026-03-01");
    const [first] = (await getAlertsSummary(f.user, 10)).alerts;
    expect(await markAlertsRead(other.user, [first!.id])).toBe(0);
    expect((await getAlertsSummary(f.user, 10)).unread).toBe(2);
    expect(await markAlertsRead(f.user, [first!.id])).toBe(1);
    expect((await getAlertsSummary(f.user, 10)).unread).toBe(1);
    await markAlertsRead(f.user);
    const summary = await getAlertsSummary(f.user, 10);
    expect(summary.unread).toBe(0);
    expect(summary.alerts.every((a) => a.isRead)).toBe(true);
    expect((await getAlertsSummary(other.user, 10)).alerts).toEqual([]);
  });

  it("reconciles stale alerts when the month is viewed", async () => {
    const f = await setup();
    const { id } = await foodBudget(f, "100", 80);
    // A record written without the service (e.g. a failed sync) is caught on view.
    await prisma.transaction.create({
      data: {
        userId: f.user.id,
        accountId: f.usd,
        categoryId: f.food,
        type: "EXPENSE",
        amountMinor: 9000n,
        occurredOn: new Date("2026-03-10T00:00:00Z"),
      },
    });
    expect(await prisma.budgetAlert.count()).toBe(0);
    await getBudgetMonth(f.user, MONTH);
    expect(
      (await prisma.budgetAlert.findMany()).map((a) => [a.budgetId, a.thresholdPercent]),
    ).toEqual([[id, 80]]);
  });
});

describe("scheduled alert check (FIN-6)", () => {
  it("restores a warning lost by a failed sync, without anyone opening Budgets", async () => {
    const f = await setup();
    const today = todayInTimeZone(TZ);
    await foodBudget(f, "200", 80, today.slice(0, 7));
    await expense(f, "170", today); // 85 %: one warning
    expect((await getAlertsSummary(f.user, 10)).alerts).toHaveLength(1);

    // Simulate a crash between saving and syncing: the stored warning is gone.
    await prisma.budgetAlert.deleteMany({ where: { userId: f.user.id } });
    expect((await getAlertsSummary(f.user, 10)).alerts).toHaveLength(0);

    expect(await reconcileCurrentMonthAlerts()).toBe(1);
    const { alerts } = await getAlertsSummary(f.user, 10);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.thresholdPercent).toBe(80);
  });
});
