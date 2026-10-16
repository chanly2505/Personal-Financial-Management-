import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "@/features/accounts/server/service";
import { createBudget } from "@/features/budgets/server/service";
import { ACCOUNT_HISTORY_LIMIT } from "@/features/reports/constants";
import { reportFiltersSchema } from "@/features/reports/schemas";
import { getReport } from "@/features/reports/server/service";
import { ledgerFiltersSchema } from "@/features/transactions/schemas";
import {
  createEntry,
  createTransfer,
  getLedgerPage,
  reverseTransfer,
} from "@/features/transactions/server/service";
import { isoDateToDb, type IsoDate } from "@/lib/dates";

import { registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

/**
 * Reports against a fixed, hand-calculated ledger. Every expected number is
 * worked out in the comments, independently of the code under test.
 *
 * USD  ABA (opening 100.00), Wing (opening 0)      KHR  Cash (opening 50,000)
 *
 * 02-28  +1,000.00 Salary   ABA        (before March)
 * 03-01  +2,000.00 Salary   ABA        (first day, a Sunday → week of 23 Feb)
 * 03-02    −500.00 Rent     ABA        (Monday)
 * 03-15     −12.50 Food     ABA        (Sunday → week of 9 Mar)
 * 03-20    transfer ABA → Wing 100.00  (not income/expense)
 * 03-25      −7.50 Food     Wing
 * 03-31    −20,000 KHR Transport Cash  (last day)
 * 03-31     +40.00 Other income Wing   (last day)
 * 04-01     −10.00 Food     ABA        (after March)
 *
 * March, USD: income 2,040.00, expenses 520.00, net 1,520.00, 6 records
 * March, KHR: income 0, expenses 20,000, 1 record
 */

const TZ = "Asia/Phnom_Penh";
type U = { id: string; timezone: string };

const march = (extra: Record<string, string> = {}) =>
  reportFiltersSchema.parse({ period: "custom", from: "2026-03-01", to: "2026-03-31", ...extra });

async function categoryId(userId: string, name: string) {
  return (await prisma.category.findFirstOrThrow({ where: { userId, name } })).id;
}

async function seed() {
  const registered = await registerTestUser();
  const user: U = { id: registered.id, timezone: TZ };
  const account = async (name: string, currency: "USD" | "KHR", openingBalance: string) =>
    (await createAccount(user, { name, type: "BANK", currency, openingBalance })).id;
  const aba = await account("ABA", "USD", "100");
  const wing = await account("Wing", "USD", "0");
  const cash = await account("Cash", "KHR", "50,000");
  const c = {
    salary: await categoryId(user.id, "Salary"),
    other: await categoryId(user.id, "Other income"),
    food: await categoryId(user.id, "Food and drinks"),
    rent: await categoryId(user.id, "Housing and rent"),
    transport: await categoryId(user.id, "Transportation"),
  };
  const entry = (
    type: "INCOME" | "EXPENSE",
    accountId: string,
    category: string,
    amount: string,
    occurredOn: string,
  ) =>
    createEntry(user, {
      type,
      accountId,
      categoryId: category,
      amount,
      occurredOn,
      clientRequestId: randomUUID(),
    });
  await entry("INCOME", aba, c.salary, "1000", "2026-02-28");
  await entry("INCOME", aba, c.salary, "2000", "2026-03-01");
  await entry("EXPENSE", aba, c.rent, "500", "2026-03-02");
  await entry("EXPENSE", aba, c.food, "12.50", "2026-03-15");
  const { id: transferId } = await createTransfer(user, {
    fromAccountId: aba,
    toAccountId: wing,
    amount: "100",
    occurredOn: "2026-03-20",
    clientRequestId: randomUUID(),
  });
  await entry("EXPENSE", wing, c.food, "7.50", "2026-03-25");
  await entry("EXPENSE", cash, c.transport, "20000", "2026-03-31");
  await entry("INCOME", wing, c.other, "40", "2026-03-31");
  await entry("EXPENSE", aba, c.food, "10", "2026-04-01");
  return { user, aba, wing, cash, c, transferId };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("totals", () => {
  it("are per currency, exclude transfers and include both boundary days only", async () => {
    const { user } = await seed();
    const report = await getReport(user, march());
    expect(report.totals).toEqual([
      { currency: "USD", count: 6, incomeMinor: 204000n, expenseMinor: 52000n, netMinor: 152000n },
      { currency: "KHR", count: 1, incomeMinor: 0n, expenseMinor: 20000n, netMinor: -20000n },
    ]);
  });

  it("reconcile with the /transactions totals for the same filters", async () => {
    const { user, wing, c } = await seed();
    const cases: Record<string, string>[] = [
      {},
      { accountId: wing },
      { kind: "EXPENSE" },
      { categoryId: c.food },
    ];
    for (const extra of cases) {
      const report = await getReport(user, march(extra));
      const ledger = await getLedgerPage(
        user,
        ledgerFiltersSchema.parse({ from: "2026-03-01", to: "2026-03-31", ...extra }),
      );
      expect(report.totals.map((t) => [t.currency, t.incomeMinor, t.expenseMinor])).toEqual(
        ledger.summary.map((s) => [s.currency, s.incomeMinor, s.expenseMinor]),
      );
      expect(report.totals.reduce((n, t) => n + t.count, 0)).toBe(ledger.total);
    }
  });
});

describe("series and breakdowns", () => {
  it("bucket by Monday-start weeks, keep empty buckets and add up to the totals", async () => {
    const { user } = await seed();
    const report = await getReport(user, march({ report: "cash-flow", granularity: "week" }));
    expect(report.granularity).toBe("week");
    const usd = report.currencies.find((c) => c.currency === "USD")!;
    expect(
      usd.series.map((p) => [p.start, p.incomeMinor, p.expenseMinor, p.transferCount]),
    ).toEqual([
      ["2026-02-23", 200000n, 0n, 0],
      ["2026-03-02", 0n, 50000n, 0],
      ["2026-03-09", 0n, 1250n, 0],
      ["2026-03-16", 0n, 0n, 1],
      ["2026-03-23", 0n, 750n, 0],
      ["2026-03-30", 4000n, 0n, 0],
    ]);
    for (const currency of report.currencies) {
      const income = currency.series.reduce((s, p) => s + p.incomeMinor, 0n);
      const expense = currency.series.reduce((s, p) => s + p.expenseMinor, 0n);
      expect([income, expense]).toEqual([
        currency.totals.incomeMinor,
        currency.totals.expenseMinor,
      ]);
    }
  });

  it("supports daily, monthly and yearly buckets", async () => {
    const { user } = await seed();
    const daily = await getReport(user, march({ report: "income", granularity: "day" }));
    expect(daily.currencies[0]!.series).toHaveLength(31);
    const yearly = await getReport(
      user,
      reportFiltersSchema.parse({
        report: "cash-flow",
        period: "custom",
        from: "2025-12-01",
        to: "2026-04-30",
        granularity: "year",
      }),
    );
    const usd = yearly.currencies.find((c) => c.currency === "USD")!;
    // 2026: income 1,000 + 2,000 + 40; expenses 500 + 12.50 + 7.50 + 10.
    expect(usd.series.map((p) => [p.start, p.incomeMinor, p.expenseMinor])).toEqual([
      ["2025-01-01", 0n, 0n],
      ["2026-01-01", 304000n, 53000n],
    ]);
  });

  it("break income and expenses down by category and account with shares", async () => {
    const { user } = await seed();
    const usd = (await getReport(user, march({ report: "categories" }))).currencies.find(
      (c) => c.currency === "USD",
    )!;
    // Rent 500 of 520 → 96.2 %; food 12.50 + 7.50 = 20 → 3.8 %.
    expect(
      usd.byCategory.EXPENSE.map((l) => [l.name, l.amountMinor, l.count, l.sharePercent]),
    ).toEqual([
      ["Housing and rent", 50000n, 1, 96.2],
      ["Food and drinks", 2000n, 2, 3.8],
    ]);
    expect(usd.byAccount.EXPENSE.map((l) => [l.name, l.amountMinor])).toEqual([
      ["ABA", 51250n],
      ["Wing", 750n],
    ]);
    expect(usd.byAccount.INCOME.map((l) => [l.name, l.amountMinor])).toEqual([
      ["ABA", 200000n],
      ["Wing", 4000n],
    ]);
  });
});

describe("filters", () => {
  it("apply the same way to every report: account, type, category, currency", async () => {
    const { user, wing, c } = await seed();
    const totals = async (extra: Record<string, string>) =>
      (await getReport(user, march(extra))).totals.map((t) => [
        t.currency,
        t.count,
        t.incomeMinor,
        t.expenseMinor,
      ]);
    // Wing: the incoming transfer, food 7.50, other income 40.
    expect(await totals({ accountId: wing })).toEqual([["USD", 3, 4000n, 750n]]);
    expect(await totals({ kind: "EXPENSE" })).toEqual([
      ["USD", 3, 0n, 52000n],
      ["KHR", 1, 0n, 20000n],
    ]);
    expect(await totals({ kind: "TRANSFER" })).toEqual([["USD", 1, 0n, 0n]]);
    expect(await totals({ categoryId: c.food })).toEqual([["USD", 2, 0n, 2000n]]);
    expect(await totals({ currency: "KHR" })).toEqual([["KHR", 1, 0n, 20000n]]);
  });

  it("drops invalid filter values instead of failing", () => {
    expect(
      reportFiltersSchema.parse({
        report: "nope",
        period: "x",
        granularity: "hourly",
        accountId: "not-a-uuid",
        currency: "EUR",
      }),
    ).toMatchObject({
      report: "cash-flow",
      period: "this_month",
      granularity: "auto",
      accountId: undefined,
      currency: undefined,
    });
  });
});

describe("account history", () => {
  it("runs the balance from the opening to the closing balance", async () => {
    const { user, aba } = await seed();
    const { accountHistory: h } = await getReport(
      user,
      march({ report: "account", accountId: aba }),
    );
    // Opening: 100.00 + 1,000.00 (28 Feb). In: 2,000. Out: 500 + 12.50 + 100 (transfer).
    expect(h).toMatchObject({
      openingMinor: 110000n,
      inMinor: 200000n,
      outMinor: 61250n,
      closingMinor: 248750n,
      count: 4,
      truncated: false,
      showsRunningBalance: true,
    });
    expect(h!.rows.map((r) => [r.signedMinor, r.balanceMinor])).toEqual([
      [200000n, 310000n],
      [-50000n, 260000n],
      [-1250n, 258750n],
      [-10000n, 248750n],
    ]);
  });

  it("counts an incoming transfer as money in and a reversal as an ordinary transfer", async () => {
    const { user, wing, transferId } = await seed();
    await reverseTransfer(user, { id: transferId, clientRequestId: randomUUID() });
    const { accountHistory: h } = await getReport(
      user,
      reportFiltersSchema.parse({
        report: "account",
        accountId: wing,
        period: "custom",
        from: "2026-03-01",
        to: "2027-12-31", // the reversal is dated today
      }),
    );
    // In: transfer 100 + income 40. Out: food 7.50 + the reversal back to ABA 100.
    expect(h).toMatchObject({ openingMinor: 0n, inMinor: 14000n, outMinor: 10750n });
    expect(h!.closingMinor).toBe(h!.openingMinor + h!.inMinor - h!.outMinor);
    // The reversal is not income or expense anywhere.
    const totals = (await getReport(user, march())).totals.find((t) => t.currency === "USD");
    expect(totals).toMatchObject({ incomeMinor: 204000n, expenseMinor: 52000n });
  });

  it("hides the running balance when type or category filters hide records", async () => {
    const { user, aba } = await seed();
    const { accountHistory: h } = await getReport(
      user,
      march({ report: "account", accountId: aba, kind: "EXPENSE" }),
    );
    expect(h).toMatchObject({ showsRunningBalance: false, count: 2, outMinor: 51250n });
    expect(h!.rows.every((r) => r.balanceMinor === null)).toBe(true);
  });

  it("lists at most the limit but totals every record", async () => {
    const { user, cash, c } = await seed();
    await prisma.transaction.createMany({
      data: Array.from({ length: ACCOUNT_HISTORY_LIMIT + 5 }, () => ({
        userId: user.id,
        accountId: cash,
        categoryId: c.transport,
        type: "EXPENSE" as const,
        amountMinor: 100n,
        occurredOn: isoDateToDb("2026-03-10" as IsoDate),
      })),
    });
    const { accountHistory: h } = await getReport(
      user,
      march({ report: "account", accountId: cash }),
    );
    expect(h!.rows).toHaveLength(ACCOUNT_HISTORY_LIMIT);
    expect(h).toMatchObject({ truncated: true, count: ACCOUNT_HISTORY_LIMIT + 6 });
    expect(h!.outMinor).toBe(20000n + BigInt(ACCOUNT_HISTORY_LIMIT + 5) * 100n);
    expect(h!.closingMinor).toBe(50000n - h!.outMinor);
  });
});

describe("budget performance", () => {
  it("shows each month's budgets with spent amounts, filtered by currency", async () => {
    const { user, c } = await seed();
    await createBudget(user, {
      categoryId: c.food,
      currency: "USD",
      month: "2026-03",
      amount: "10",
      alertThresholdPercent: 80,
    });
    await createBudget(user, {
      categoryId: c.transport,
      currency: "KHR",
      month: "2026-03",
      amount: "10,000",
      alertThresholdPercent: 80,
    });
    const { budgets } = await getReport(user, march({ report: "budgets" }));
    const month = budgets!.months[0]!;
    expect(month.month).toBe("2026-03");
    // Food: 12.50 + 7.50 = 20.00 of 10.00 → 200 %, over. Transport: 20,000 of 10,000.
    expect(
      month.budgets.map((b) => [b.category.name, b.spentMinor, b.usagePercent, b.status]),
    ).toEqual([
      ["Food and drinks", 2000n, 200, "over"],
      ["Transportation", 20000n, 200, "over"],
    ]);
    const usdOnly = await getReport(user, march({ report: "budgets", currency: "USD" }));
    expect(usdOnly.budgets!.months[0]!.budgets).toHaveLength(1);
  });
});

describe("period comparison", () => {
  it("compares March with February, per currency and category", async () => {
    const { user } = await seed();
    const { comparison } = await getReport(user, march({ report: "compare" }));
    expect(comparison!.previous).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    const usd = comparison!.currencies.find((c) => c.currency === "USD")!;
    expect(usd.previous).toMatchObject({ count: 1, incomeMinor: 100000n, expenseMinor: 0n });
    expect(usd.current).toMatchObject({ incomeMinor: 204000n, expenseMinor: 52000n });
    expect(usd.incomeCategories.map((l) => [l.name, l.currentMinor, l.previousMinor])).toEqual([
      ["Salary", 200000n, 100000n],
      ["Other income", 4000n, 0n],
    ]);
    const khr = comparison!.currencies.find((c) => c.currency === "KHR")!;
    expect(khr.previous).toMatchObject({ count: 0, expenseMinor: 0n });
  });
});

describe("isolation", () => {
  it("never includes another user's records, accounts or budgets", async () => {
    const alice = await seed();
    const bob = { id: (await registerTestUser()).id, timezone: TZ };
    for (const report of ["cash-flow", "account", "budgets", "compare"] as const) {
      const r = await getReport(bob, march({ report, accountId: alice.aba }));
      expect(r.totals).toEqual([]);
      expect(r.currencies).toEqual([]);
      expect(r.accountHistory).toBeNull();
      expect(r.budgets?.months.flatMap((m) => m.budgets) ?? []).toEqual([]);
      expect(r.comparison?.currencies ?? []).toEqual([]);
    }
    expect((await getReport(alice.user, march())).totals).toHaveLength(2);
  });
});
